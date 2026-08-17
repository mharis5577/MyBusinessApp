import express from 'express';
import cors from 'cors';
import db, { dbAll, dbGet, dbRun } from './db.js';
import { pakistanToday, pakistanYearMonth, pakistanNowTime } from './pakistan.js';
import { serializePaymentMethods, withPaymentMethods, getPaymentMethods } from './utils/paymentMethods.js';
import { normalizeBillType, invoicePrefixForType, partyTypeForBill, outstandingByPartyName } from './utils/billTypes.js';
import { saleOverviewTotals } from './utils/dashboardStats.js';
import { isDemoBill, isDemoCustomer } from './utils/demoData.js';

const app = express();
const PORT = process.env.PORT || 11000;

app.use(cors());
app.use(express.json({ limit: '25mb' }));

function isCancelled(bill) {
  return bill?.status === 'cancelled';
}

function remainingQty(item) {
  return Math.max(0, (Number(item?.quantity) || 0) - (Number(item?.returned_qty) || 0));
}

function recalcBillTotals(bill, items) {
  const subtotal = Math.round(
    (items || []).reduce((s, it) => s + remainingQty(it) * (Number(it.unit_price) || 0), 0) * 100
  ) / 100;
  const discountRate = Number(bill?.discount_rate) || 0;
  const discount_amount = Math.round(((subtotal * discountRate) / 100) * 100) / 100;
  const after = Math.max(0, subtotal - discount_amount);
  const taxRate = Number(bill?.tax_rate) || 0;
  const tax_amount = Math.round(((after * taxRate) / 100) * 100) / 100;
  const total_amount = Math.round((after + tax_amount) * 100) / 100;
  return { subtotal, discount_amount, tax_amount, total_amount };
}

function enrichBill(bill) {
  if (!bill) return bill;
  const paid = Number(bill.amount_paid) || 0;
  let total = Number(bill.total_amount) || 0;
  let subtotal = Number(bill.subtotal) || 0;
  const cancelled = isCancelled(bill);

  // Prefer line-item math when items are present (fixes corrupt stored totals)
  if (Array.isArray(bill.items) && bill.items.length) {
    const recomputed = recalcBillTotals(bill, bill.items);
    if (
      recomputed.total_amount > 0 &&
      (total <= 0 || Math.abs(total - recomputed.total_amount) > 0.02)
    ) {
      subtotal = recomputed.subtotal;
      total = recomputed.total_amount;
      bill.discount_amount = recomputed.discount_amount;
      bill.tax_amount = recomputed.tax_amount;
    }
  }

  const balance_due = cancelled ? 0 : Math.max(0, Math.round((total - paid) * 100) / 100);
  let status = bill.status;
  if (!cancelled && total > 0) {
    if (balance_due <= 0) status = 'paid';
    else if (status === 'paid') status = 'pending';
  }

  bill.amount_paid = paid;
  bill.total_amount = total;
  bill.subtotal = subtotal;
  bill.balance_due = balance_due;
  bill.status = status;
  return bill;
}

async function restoreStockForQtys(bill, items, qtyByItemId, reason) {
  const bType = normalizeBillType(bill.bill_type);
  if (bType === 'help') return;
  for (const it of items) {
    const qty = Number(qtyByItemId.get(Number(it.id)) || 0);
    if (!qty || !it.product_id) continue;
    const delta = bType === 'supplier' ? -qty : qty;
    await dbRun('UPDATE products SET stock = MAX(0, stock + ?) WHERE id = ?', [delta, it.product_id]);
    await dbRun(
      'INSERT INTO stock_adjustments (product_id, delta, reason, notes) VALUES (?, ?, ?, ?)',
      [it.product_id, delta, reason, `${bill.invoice_number} · ${it.description}`]
    );
  }
}

async function loadFullBill(billId) {
  const bill = enrichBill(await dbGet('SELECT * FROM bills WHERE id = ?', [billId]));
  if (!bill) return null;
  bill.items = await dbAll('SELECT * FROM bill_items WHERE bill_id = ?', [billId]);
  bill.payments = await dbAll('SELECT * FROM bill_payments WHERE bill_id = ? ORDER BY id DESC', [billId]);
  return bill;
}

async function refreshBillPaidStatus(billId) {
  const bill = await dbGet('SELECT * FROM bills WHERE id = ?', [billId]);
  if (!bill) return null;
  if (isCancelled(bill)) return loadFullBill(billId);
  const sumRow = await dbGet(
    'SELECT COALESCE(SUM(amount), 0) as paid FROM bill_payments WHERE bill_id = ?',
    [billId]
  );
  const paid = Number(sumRow?.paid) || 0;
  const total = Number(bill.total_amount) || 0;
  let status = bill.status;
  if (paid >= total && total > 0) status = 'paid';
  else if (paid > 0 && status === 'paid') status = 'pending';
  await dbRun('UPDATE bills SET amount_paid = ?, status = ? WHERE id = ?', [paid, status, billId]);
  return loadFullBill(billId);
}

// Logger middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// -------------------------------------------------------------
// RESET DATABASE ENDPOINT (Wipe all data for clean testing)
// -------------------------------------------------------------
app.post('/api/reset-db', async (req, res) => {
  try {
    await dbRun('DELETE FROM bill_payments');
    await dbRun('DELETE FROM bill_items');
    await dbRun('DELETE FROM bills');
    await dbRun('DELETE FROM stock_adjustments');
    await dbRun('DELETE FROM customer_product_rates');
    await dbRun('DELETE FROM advance_payments');
    await dbRun('DELETE FROM customers');
    await dbRun('DELETE FROM products');
    res.json({ success: true, message: 'All database tables wiped successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// SETTINGS ENDPOINTS
// -------------------------------------------------------------
app.get('/api/settings', async (req, res) => {
  try {
    const settings = await dbGet('SELECT * FROM settings LIMIT 1');
    res.json(withPaymentMethods(settings || {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/settings', async (req, res) => {
  try {
    const {
      company_name,
      company_email,
      company_phone,
      company_address,
      company_tax_id,
      logo_url,
      currency_symbol,
      default_tax_rate,
      payment_methods,
      bank_name,
      account_title,
      account_number,
      mobile_wallet,
      payment_instructions,
      app_pin,
      urdu_labels,
      low_stock_threshold,
      biometric_lock,
      due_reminders,
      show_developer_credit,
      default_invoice_template,
      custom_brand_color,
      header_layout,
      signature_url,
      show_paid_stamp,
    } = req.body;

    const pay = serializePaymentMethods(
      Array.isArray(payment_methods)
        ? payment_methods
        : [
            {
              label: 'Primary',
              bank_name,
              account_title,
              account_number,
              mobile_wallet,
            },
          ],
      payment_instructions
    );

    await dbRun(
      `UPDATE settings SET 
        company_name = ?, 
        company_email = ?, 
        company_phone = ?, 
        company_address = ?, 
        company_tax_id = ?, 
        logo_url = ?, 
        currency_symbol = ?, 
        default_tax_rate = ?, 
        bank_name = ?,
        account_title = ?,
        account_number = ?,
        mobile_wallet = ?,
        payment_instructions = ?,
        payment_methods = ?,
        app_pin = ?,
        urdu_labels = ?,
        low_stock_threshold = ?,
        biometric_lock = ?,
        due_reminders = ?,
        show_developer_credit = ?,
        default_invoice_template = ?,
        custom_brand_color = ?,
        header_layout = ?,
        signature_url = ?,
        show_paid_stamp = ?,
        sound_effects = ?,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = (SELECT id FROM settings LIMIT 1)`,
      [
        company_name,
        company_email,
        company_phone,
        company_address,
        company_tax_id,
        logo_url,
        currency_symbol,
        default_tax_rate,
        pay.bank_name,
        pay.account_title,
        pay.account_number,
        pay.mobile_wallet,
        pay.payment_instructions,
        pay.payment_methods,
        app_pin ?? '',
        urdu_labels ? 1 : 0,
        Number.isFinite(Number(low_stock_threshold)) ? Number(low_stock_threshold) : 5,
        biometric_lock ? 1 : 0,
        due_reminders ? 1 : 0,
        show_developer_credit === 0 || show_developer_credit === false ? 0 : 1,
        default_invoice_template || 'classic',
        custom_brand_color || '',
        header_layout || 'split',
        signature_url || '',
        show_paid_stamp === 0 || show_paid_stamp === false ? 0 : 1,
        req.body.sound_effects === 0 || req.body.sound_effects === false ? 0 : 1,
      ]
    );

    const updated = await dbGet('SELECT * FROM settings LIMIT 1');
    res.json(withPaymentMethods(updated || {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// CUSTOMERS ENDPOINTS
// -------------------------------------------------------------
function normalizePartyType(value) {
  return value === 'supplier' ? 'supplier' : 'customer';
}

app.get('/api/customers', async (req, res) => {
  try {
    const type = String(req.query.type || '').trim();
    let customers;
    if (type === 'customer' || type === 'supplier') {
      customers = await dbAll(
        `SELECT * FROM customers
         WHERE COALESCE(NULLIF(TRIM(party_type), ''), 'customer') = ?
         ORDER BY name ASC`,
        [type]
      );
    } else {
      customers = await dbAll('SELECT * FROM customers ORDER BY name ASC');
    }
    const bills = await dbAll(
      `SELECT customer_name, bill_type, status, total_amount, amount_paid FROM bills`
    );
    const byName = outstandingByPartyName(bills);
    customers = customers.map((c) => {
      const rec = byName[String(c.name || '').trim().toLowerCase()] || {};
      return {
        ...c,
        sales_outstanding: rec.sales_outstanding || 0,
        help_outstanding: rec.help_outstanding || 0,
        buying_outstanding: rec.buying_outstanding || 0,
      };
    });
    res.json(customers);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers', async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      tax_id,
      party_type,
      payee_bank_name,
      payee_account_title,
      payee_account_number,
      payee_payment_notes,
    } = req.body;
    if (!name) return res.status(400).json({ error: 'Customer name is required' });

    const partyType = normalizePartyType(party_type);
    const result = await dbRun(
      `INSERT INTO customers (
        name, email, phone, address, tax_id, party_type,
        payee_bank_name, payee_account_title, payee_account_number, payee_payment_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        name,
        email || '',
        phone || '',
        address || '',
        tax_id || '',
        partyType,
        payee_bank_name || '',
        payee_account_title || '',
        payee_account_number || '',
        payee_payment_notes || '',
      ]
    );

    const customer = await dbGet('SELECT * FROM customers WHERE id = ?', [result.lastID]);
    res.status(201).json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const existing = await dbGet('SELECT * FROM customers WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Customer not found' });

    const {
      name,
      email,
      phone,
      address,
      tax_id,
      party_type,
      payee_bank_name,
      payee_account_title,
      payee_account_number,
      payee_payment_notes,
    } = req.body;

    const partyType =
      party_type !== undefined
        ? normalizePartyType(party_type)
        : normalizePartyType(existing.party_type);

    await dbRun(
      `UPDATE customers SET
        name = ?, email = ?, phone = ?, address = ?, tax_id = ?, party_type = ?,
        payee_bank_name = ?, payee_account_title = ?, payee_account_number = ?, payee_payment_notes = ?
       WHERE id = ?`,
      [
        name ?? existing.name,
        email ?? existing.email ?? '',
        phone ?? existing.phone ?? '',
        address ?? existing.address ?? '',
        tax_id ?? existing.tax_id ?? '',
        partyType,
        payee_bank_name ?? existing.payee_bank_name ?? '',
        payee_account_title ?? existing.payee_account_title ?? '',
        payee_account_number ?? existing.payee_account_number ?? '',
        payee_payment_notes ?? existing.payee_payment_notes ?? '',
        id,
      ]
    );

    const customer = await dbGet('SELECT * FROM customers WHERE id = ?', [id]);
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await dbRun('DELETE FROM customer_product_rates WHERE customer_id = ?', [id]);
    await dbRun('DELETE FROM customers WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// CUSTOMER PRODUCT RATES ENDPOINTS (Custom Prices per Client)
// -------------------------------------------------------------
app.get('/api/customers/:id/rates', async (req, res) => {
  try {
    const rates = await dbAll(
      `SELECT r.*, p.name as product_name, p.price as standard_price 
       FROM customer_product_rates r 
       JOIN products p ON r.product_id = p.id 
       WHERE r.customer_id = ?`,
      [req.params.id]
    );
    res.json(rates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/customers/:id/rates', async (req, res) => {
  try {
    const customerId = req.params.id;
    const { product_id, custom_price } = req.body;
    if (!product_id || custom_price === undefined) {
      return res.status(400).json({ error: 'product_id and custom_price are required' });
    }

    await dbRun(
      `INSERT INTO customer_product_rates (customer_id, product_id, custom_price)
       VALUES (?, ?, ?)
       ON CONFLICT(customer_id, product_id) DO UPDATE SET custom_price = excluded.custom_price`,
      [customerId, product_id, parseFloat(custom_price) || 0]
    );

    const rates = await dbAll(
      `SELECT r.*, p.name as product_name, p.price as standard_price 
       FROM customer_product_rates r 
       JOIN products p ON r.product_id = p.id 
       WHERE r.customer_id = ?`,
      [customerId]
    );
    res.json(rates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/customers/:id/rates/:productId', async (req, res) => {
  try {
    await dbRun(
      'DELETE FROM customer_product_rates WHERE customer_id = ? AND product_id = ?',
      [req.params.id, req.params.productId]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// ADVANCE PAYMENTS ENDPOINTS (Dynamic Advance Payments Tracking)
// -------------------------------------------------------------
app.get('/api/advances', async (req, res) => {
  try {
    const client = String(req.query.client || '').trim();
    let advances;
    if (client) {
      advances = await dbAll(
        'SELECT * FROM advance_payments WHERE LOWER(TRIM(client_name)) = LOWER(?) ORDER BY id DESC',
        [client]
      );
    } else {
      advances = await dbAll('SELECT * FROM advance_payments ORDER BY id DESC');
    }
    advances = advances.map((a) => ({
      ...a,
      remaining: a.remaining == null ? Number(a.amount) || 0 : Number(a.remaining) || 0,
    }));
    const totalSumRow = await dbGet('SELECT SUM(amount) as total FROM advance_payments');
    const remainingRow = await dbGet(
      'SELECT SUM(COALESCE(remaining, amount)) as total FROM advance_payments'
    );
    res.json({
      advances,
      total_advance: totalSumRow.total || 0,
      available_advance: remainingRow.total || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/advances', async (req, res) => {
  try {
    const { amount, payment_date, client_name, notes } = req.body;
    if (!amount || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Valid advance amount is required' });
    }
    if (!client_name || !String(client_name).trim()) {
      return res.status(400).json({ error: 'Client name is required' });
    }

    const amt = parseFloat(amount);
    const dateStr = payment_date || pakistanToday();
    const result = await dbRun(
      'INSERT INTO advance_payments (amount, remaining, payment_date, client_name, notes) VALUES (?, ?, ?, ?, ?)',
      [amt, amt, dateStr, String(client_name).trim(), notes || '']
    );

    const created = await dbGet('SELECT * FROM advance_payments WHERE id = ?', [result.lastID]);
    const totalSumRow = await dbGet('SELECT SUM(amount) as total FROM advance_payments');
    const remainingRow = await dbGet(
      'SELECT SUM(COALESCE(remaining, amount)) as total FROM advance_payments'
    );

    res.status(201).json({
      created: { ...created, remaining: created.remaining ?? created.amount },
      total_advance: totalSumRow.total || 0,
      available_advance: remainingRow.total || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** Apply client advance wallet to a bill (FIFO). */
app.post('/api/advances/apply', async (req, res) => {
  try {
    const billId = Number(req.body.bill_id);
    const clientName = String(req.body.client_name || '').trim();
    let amount = Number(req.body.amount);
    if (!billId) return res.status(400).json({ error: 'bill_id is required' });
    if (!clientName) return res.status(400).json({ error: 'client_name is required' });

    const bill = await dbGet('SELECT * FROM bills WHERE id = ?', [billId]);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    enrichBill(bill);
    const due = Number(bill.balance_due) || 0;
    if (due <= 0) return res.status(400).json({ error: 'Bill has no balance due' });

    const pool = await dbAll(
      `SELECT * FROM advance_payments
       WHERE LOWER(TRIM(client_name)) = LOWER(?) AND COALESCE(remaining, amount) > 0
       ORDER BY id ASC`,
      [clientName]
    );
    const available = pool.reduce(
      (s, a) => s + (a.remaining == null ? Number(a.amount) || 0 : Number(a.remaining) || 0),
      0
    );
    if (available <= 0) {
      return res.status(400).json({ error: 'No available advance for this client' });
    }

    if (!amount || amount <= 0) amount = Math.min(due, available);
    amount = Math.min(amount, due, available);
    amount = Math.round(amount * 100) / 100;

    let left = amount;
    for (const adv of pool) {
      if (left <= 0) break;
      const rem = adv.remaining == null ? Number(adv.amount) || 0 : Number(adv.remaining) || 0;
      const take = Math.min(rem, left);
      if (take <= 0) continue;
      await dbRun('UPDATE advance_payments SET remaining = ? WHERE id = ?', [
        Math.round((rem - take) * 100) / 100,
        adv.id,
      ]);
      left = Math.round((left - take) * 100) / 100;
    }

    await dbRun(
      'INSERT INTO bill_payments (bill_id, amount, method, payment_date, notes) VALUES (?, ?, ?, ?, ?)',
      [billId, amount, 'Advance', pakistanToday(), `Applied from advance (${clientName})`]
    );

    const updated = await refreshBillPaidStatus(billId);
    updated.items = await dbAll('SELECT * FROM bill_items WHERE bill_id = ?', [billId]);
    updated.payments = await dbAll(
      'SELECT * FROM bill_payments WHERE bill_id = ? ORDER BY id DESC',
      [billId]
    );

    const remainingRow = await dbGet(
      `SELECT SUM(COALESCE(remaining, amount)) as total FROM advance_payments WHERE LOWER(TRIM(client_name)) = LOWER(?)`,
      [clientName]
    );

    res.status(201).json({
      bill: updated,
      applied: amount,
      available_advance: remainingRow.total || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/advances/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM advance_payments WHERE id = ?', [req.params.id]);
    const totalSumRow = await dbGet('SELECT SUM(amount) as total FROM advance_payments');
    const remainingRow = await dbGet(
      'SELECT SUM(COALESCE(remaining, amount)) as total FROM advance_payments'
    );
    res.json({
      success: true,
      total_advance: totalSumRow.total || 0,
      available_advance: remainingRow.total || 0,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// PRODUCTS ENDPOINTS
// -------------------------------------------------------------
app.get('/api/products', async (req, res) => {
  try {
    const { q } = req.query;
    let products;
    if (q && String(q).trim()) {
      const term = `%${String(q).trim()}%`;
      products = await dbAll(
        `SELECT * FROM products
         WHERE name LIKE ? OR description LIKE ? OR IFNULL(sku,'') LIKE ?
         ORDER BY name ASC`,
        [term, term, term]
      );
    } else {
      products = await dbAll('SELECT * FROM products ORDER BY name ASC');
    }
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { name, description, price, cost_price, unit, stock, sku } = req.body;
    if (!name) return res.status(400).json({ error: 'Product name is required' });

    const result = await dbRun(
      'INSERT INTO products (name, description, price, cost_price, unit, stock, sku) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, description || '', price || 0, cost_price || 0, unit || 'item', stock ?? 100, sku || '']
    );

    const product = await dbGet('SELECT * FROM products WHERE id = ?', [result.lastID]);
    res.status(201).json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { name, description, price, cost_price, unit, stock, sku } = req.body;
    const existing = await dbGet('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    await dbRun(
      `UPDATE products SET name = ?, description = ?, price = ?, cost_price = ?, unit = ?, stock = ?, sku = ? WHERE id = ?`,
      [
        name ?? existing.name,
        description ?? existing.description,
        price ?? existing.price,
        cost_price ?? existing.cost_price ?? 0,
        unit ?? existing.unit,
        stock ?? existing.stock,
        sku ?? existing.sku,
        req.params.id,
      ]
    );
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [req.params.id]);
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/products/:id/adjust-stock', async (req, res) => {
  try {
    const delta = parseInt(req.body.delta, 10);
    const reason = req.body.reason || 'adjustment';
    const notes = req.body.notes || '';
    if (Number.isNaN(delta) || delta === 0) {
      return res.status(400).json({ error: 'delta must be a non-zero integer' });
    }
    const product = await dbGet('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const nextStock = Math.max(0, (Number(product.stock) || 0) + delta);
    await dbRun('BEGIN IMMEDIATE');
    try {
      await dbRun('UPDATE products SET stock = ? WHERE id = ?', [nextStock, req.params.id]);
      await dbRun(
        'INSERT INTO stock_adjustments (product_id, delta, reason, notes) VALUES (?, ?, ?, ?)',
        [req.params.id, delta, reason, notes]
      );
      await dbRun('COMMIT');
    } catch (e) {
      await dbRun('ROLLBACK');
      throw e;
    }

    const updated = await dbGet('SELECT * FROM products WHERE id = ?', [req.params.id]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/stock-adjustments', async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT a.*, p.name as product_name, p.sku
       FROM stock_adjustments a
       LEFT JOIN products p ON p.id = a.product_id
       ORDER BY a.id DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  try {
    await dbRun('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// BILLS ENDPOINTS
// -------------------------------------------------------------

// Helper: next invoice number for a bill type
async function generateNextInvoiceNumber(bType = 'customer') {
  const year = new Date().getFullYear();
  const prefix = invoicePrefixForType(bType);
  const lastBill = await dbGet(
    'SELECT invoice_number FROM bills WHERE invoice_number LIKE ? ORDER BY id DESC LIMIT 1',
    [`${prefix}-${year}-%`]
  );

  let nextNum = 1;
  if (lastBill && lastBill.invoice_number) {
    const match = lastBill.invoice_number.match(new RegExp(`${prefix}-\\d+-(\\d+)`));
    if (match && match[1]) {
      nextNum = parseInt(match[1], 10) + 1;
    }
  }

  return `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;
}

// Helper to generate next invoice number
app.get('/api/bills/next-number', async (req, res) => {
  try {
    const { type } = req.query;
    const formattedNum = await generateNextInvoiceNumber(normalizeBillType(type));
    res.json({ invoice_number: formattedNum });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all bills with search, type filter, and items
app.get('/api/bills', async (req, res) => {
  try {
    const { status, search, type } = req.query;
    let query = 'SELECT * FROM bills WHERE 1=1';
    const params = [];

    if (type && type !== 'all') {
      const t = normalizeBillType(type);
      if (t === 'help') {
        query += " AND (bill_type = 'help' OR bill_type = 'loan')";
      } else {
        query += ' AND bill_type = ?';
        params.push(t);
      }
    }

    if (status && status !== 'all') {
      query += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (invoice_number LIKE ? OR customer_name LIKE ? OR customer_email LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term);
    }

    query += ' ORDER BY id DESC';

    const bills = await dbAll(query, params);

    // Attach payment balance only — line items load on Edit / View / Duplicate
    for (const bill of bills) enrichBill(bill);

    res.json(bills);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single bill by ID
app.get('/api/bills/:id', async (req, res) => {
  try {
    const bill = await dbGet('SELECT * FROM bills WHERE id = ?', [req.params.id]);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });

    bill.items = await dbAll('SELECT * FROM bill_items WHERE bill_id = ?', [bill.id]);
    bill.payments = await dbAll(
      'SELECT * FROM bill_payments WHERE bill_id = ? ORDER BY id DESC',
      [bill.id]
    );
    res.json(enrichBill(bill));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle bill bookmark
app.post('/api/bills/:id/bookmark', async (req, res) => {
  try {
    const bill = await dbGet('SELECT is_bookmarked FROM bills WHERE id = ?', [req.params.id]);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    const next = bill.is_bookmarked ? 0 : 1;
    await dbRun('UPDATE bills SET is_bookmarked = ? WHERE id = ?', [next, req.params.id]);
    res.json({ id: Number(req.params.id), is_bookmarked: next });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create & Auto Save Bill with Items (transactional)
app.post('/api/bills', async (req, res) => {
  try {
    const {
      bill_type,
      invoice_number,
      customer_name,
      customer_email,
      customer_phone,
      customer_address,
      bill_date,
      bill_time,
      due_date,
      subtotal,
      tax_rate,
      tax_amount,
      discount_rate,
      discount_amount,
      total_amount,
      status,
      notes,
      payment_method,
      payee_bank_name,
      payee_account_title,
      payee_account_number,
      payee_payment_notes,
      items,
    } = req.body;

    if (!customer_name || !String(customer_name).trim()) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one line item is required' });
    }
    if (items.some((i) => !i || !String(i.description || '').trim())) {
      return res.status(400).json({ error: 'Every line item needs a description' });
    }

    const bType = normalizeBillType(bill_type);
    let invNum = invoice_number && String(invoice_number).trim()
      ? String(invoice_number).trim()
      : await generateNextInvoiceNumber(bType);

    const todayStr = pakistanToday();
    const dueStr = due_date || todayStr;

    await dbRun('BEGIN IMMEDIATE');

    let result;
    let billId;

    try {
      const insertBill = async (number) =>
        dbRun(
          `INSERT INTO bills (
            bill_type, invoice_number, customer_name, customer_email, customer_phone, customer_address,
            bill_date, bill_time, due_date, subtotal, tax_rate, tax_amount, discount_rate, discount_amount,
            total_amount, status, notes, payment_method,
            payee_bank_name, payee_account_title, payee_account_number, payee_payment_notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            bType,
            number,
            customer_name.trim(),
            customer_email || '',
            customer_phone || '',
            customer_address || '',
            bill_date || todayStr,
            bill_time || pakistanNowTime(),
            dueStr,
            subtotal || 0,
            tax_rate || 0,
            tax_amount || 0,
            discount_rate || 0,
            discount_amount || 0,
            total_amount || 0,
            status || 'pending',
            notes || '',
            payment_method || 'Bank Transfer / Raast / Cash',
            payee_bank_name || '',
            payee_account_title || '',
            payee_account_number || '',
            payee_payment_notes || '',
          ]
        );

      try {
        result = await insertBill(invNum);
      } catch (err) {
        if (err.message && err.message.includes('UNIQUE constraint failed')) {
          invNum = await generateNextInvoiceNumber(bType);
          result = await insertBill(invNum);
        } else {
          throw err;
        }
      }

      billId = result.lastID;

      for (const item of items) {
        const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
        const price = Number(item.unit_price) || 0;
        const itemTotal = qty * price;

        await dbRun(
          'INSERT INTO bill_items (bill_id, product_id, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?)',
          [billId, item.product_id || null, String(item.description).trim(), qty, price, itemTotal]
        );

        if (item.product_id && bType !== 'help') {
          if (bType === 'supplier') {
            await dbRun('UPDATE products SET stock = stock + ? WHERE id = ?', [qty, item.product_id]);
          } else {
            await dbRun('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?', [qty, item.product_id]);
          }
        }
      }

      const existing = await dbGet('SELECT * FROM customers WHERE LOWER(name) = LOWER(?)', [
        customer_name.trim(),
      ]);
      const partyType = bType === 'help'
        ? normalizePartyType(existing?.party_type)
        : partyTypeForBill(bType);
      if (!existing) {
        await dbRun(
          `INSERT INTO customers (
            name, email, phone, address, party_type,
            payee_bank_name, payee_account_title, payee_account_number, payee_payment_notes
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            customer_name.trim(),
            customer_email || '',
            customer_phone || '',
            customer_address || '',
            partyType,
            payee_bank_name || '',
            payee_account_title || '',
            payee_account_number || '',
            payee_payment_notes || '',
          ]
        );
      } else {
        await dbRun(
          `UPDATE customers SET
            party_type = ?,
            payee_bank_name = COALESCE(NULLIF(?, ''), payee_bank_name),
            payee_account_title = COALESCE(NULLIF(?, ''), payee_account_title),
            payee_account_number = COALESCE(NULLIF(?, ''), payee_account_number),
            payee_payment_notes = COALESCE(NULLIF(?, ''), payee_payment_notes)
           WHERE id = ?`,
          [
            partyType,
            payee_bank_name || '',
            payee_account_title || '',
            payee_account_number || '',
            payee_payment_notes || '',
            existing.id,
          ]
        );
      }

      await dbRun('COMMIT');
    } catch (innerErr) {
      try {
        await dbRun('ROLLBACK');
      } catch (_) {
        /* ignore rollback errors */
      }
      throw innerErr;
    }

    const createdBill = await dbGet('SELECT * FROM bills WHERE id = ?', [billId]);
    if (!createdBill) {
      return res.status(500).json({ error: 'Bill was saved but could not be reloaded' });
    }
    createdBill.items = await dbAll('SELECT * FROM bill_items WHERE bill_id = ?', [billId]);

    console.log(`[Success] Saved ${bType} Bill #${invNum} (ID: ${billId}) - Total: ${total_amount}`);
    res.status(201).json(createdBill);
  } catch (err) {
    console.error('Error saving bill:', err);
    const msg = err.message || 'Failed to save bill';
    const status = msg.includes('UNIQUE constraint failed') ? 409 : 500;
    res.status(status).json({
      error: status === 409 ? 'Invoice number already exists. Refresh the invoice number and try again.' : msg,
    });
  }
});

// Update Entire Bill (Edit Bill & Items)
app.put('/api/bills/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      bill_type,
      invoice_number,
      customer_name,
      customer_email,
      customer_phone,
      customer_address,
      bill_date,
      bill_time,
      due_date,
      subtotal,
      tax_rate,
      tax_amount,
      discount_rate,
      discount_amount,
      total_amount,
      status,
      notes,
      payment_method,
      payee_bank_name,
      payee_account_title,
      payee_account_number,
      payee_payment_notes,
      items,
    } = req.body;

    const existingBill = await dbGet('SELECT * FROM bills WHERE id = ?', [id]);
    if (!existingBill) return res.status(404).json({ error: 'Bill not found' });
    if (isCancelled(existingBill)) return res.status(400).json({ error: 'Cancelled bills cannot be edited' });

    await dbRun(
      `UPDATE bills SET
        bill_type = ?, invoice_number = ?, customer_name = ?, customer_email = ?,
        customer_phone = ?, customer_address = ?, bill_date = ?, bill_time = ?, due_date = ?,
        subtotal = ?, tax_rate = ?, tax_amount = ?, discount_rate = ?, discount_amount = ?,
        total_amount = ?, status = ?, notes = ?, payment_method = ?,
        payee_bank_name = ?, payee_account_title = ?, payee_account_number = ?, payee_payment_notes = ?
       WHERE id = ?`,
      [
        bill_type ? normalizeBillType(bill_type) : existingBill.bill_type || 'customer',
        invoice_number || existingBill.invoice_number,
        customer_name || existingBill.customer_name,
        customer_email ?? existingBill.customer_email ?? '',
        customer_phone ?? existingBill.customer_phone ?? '',
        customer_address ?? existingBill.customer_address ?? '',
        bill_date || existingBill.bill_date,
        bill_time ?? existingBill.bill_time ?? '',
        due_date || existingBill.due_date,
        subtotal ?? existingBill.subtotal,
        tax_rate ?? existingBill.tax_rate,
        tax_amount ?? existingBill.tax_amount,
        discount_rate ?? existingBill.discount_rate,
        discount_amount ?? existingBill.discount_amount,
        total_amount ?? existingBill.total_amount,
        status || existingBill.status,
        notes ?? existingBill.notes ?? '',
        payment_method || existingBill.payment_method || 'Bank Transfer / Raast / Cash',
        payee_bank_name ?? existingBill.payee_bank_name ?? '',
        payee_account_title ?? existingBill.payee_account_title ?? '',
        payee_account_number ?? existingBill.payee_account_number ?? '',
        payee_payment_notes ?? existingBill.payee_payment_notes ?? '',
        id,
      ]
    );

    // Re-insert line items if provided
    if (items && Array.isArray(items)) {
      await dbRun('DELETE FROM bill_items WHERE bill_id = ?', [id]);
      for (let item of items) {
        const itemTotal = (item.quantity || 1) * (item.unit_price || 0);
        await dbRun(
          'INSERT INTO bill_items (bill_id, product_id, description, quantity, unit_price, total) VALUES (?, ?, ?, ?, ?, ?)',
          [id, item.product_id || null, item.description || 'Item', item.quantity || 1, item.unit_price || 0, itemTotal]
        );
      }
    }

    const updatedBill = await dbGet('SELECT * FROM bills WHERE id = ?', [id]);
    const paidAmt = Number(updatedBill.amount_paid) || 0;
    const totalAmt = Number(updatedBill.total_amount) || 0;
    if (
      updatedBill.status !== 'cancelled' &&
      totalAmt > 0 &&
      paidAmt >= totalAmt &&
      updatedBill.status !== 'paid'
    ) {
      await dbRun("UPDATE bills SET status = 'paid' WHERE id = ?", [id]);
      updatedBill.status = 'paid';
    }
    updatedBill.items = await dbAll('SELECT * FROM bill_items WHERE bill_id = ?', [id]);

    res.json(enrichBill(updatedBill));
  } catch (err) {
    console.error('Error updating bill:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update Status (paid, pending, overdue)
app.put('/api/bills/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    if (!['paid', 'pending', 'overdue'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const bill = await dbGet('SELECT * FROM bills WHERE id = ?', [req.params.id]);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    if (isCancelled(bill)) return res.status(400).json({ error: 'Cancelled bills cannot change status' });

    const total = Number(bill.total_amount) || 0;
    const sumRow = await dbGet(
      'SELECT COALESCE(SUM(amount), 0) as paid FROM bill_payments WHERE bill_id = ?',
      [req.params.id]
    );
    let paidFromPayments = Number(sumRow?.paid) || 0;

    if (status === 'paid') {
      const already = Math.max(Number(bill.amount_paid) || 0, paidFromPayments);
      const gap = Math.max(0, Math.round((total - already) * 100) / 100);
      if (gap > 0) {
        await dbRun(
          'INSERT INTO bill_payments (bill_id, amount, method, payment_date, notes) VALUES (?, ?, ?, ?, ?)',
          [bill.id, gap, bill.payment_method || 'Cash', pakistanToday(), 'Marked paid (full balance)']
        );
        paidFromPayments += gap;
      }
      await dbRun('UPDATE bills SET status = ?, amount_paid = ? WHERE id = ?', [
        'paid',
        Math.max(total, paidFromPayments),
        req.params.id,
      ]);
    } else {
      // Keep money received — never wipe amount_paid just because label changed
      const paid = Math.max(Number(bill.amount_paid) || 0, paidFromPayments);
      const due = Math.max(0, Math.round((total - paid) * 100) / 100);
      if (due <= 0 && total > 0) {
        return res.status(400).json({
          error: 'This bill is fully paid. Clear or reduce payments before marking it Due / Overdue.',
        });
      }
      await dbRun('UPDATE bills SET status = ?, amount_paid = ? WHERE id = ?', [
        status,
        paid,
        req.params.id,
      ]);
    }

    const updated = enrichBill(await dbGet('SELECT * FROM bills WHERE id = ?', [req.params.id]));
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Record partial / full payment against a bill
app.post('/api/bills/:id/payments', async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    const method = req.body.method || 'Cash';
    const payment_date = req.body.payment_date || pakistanToday();
    const notes = req.body.notes || '';
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than 0' });
    }
    const bill = await dbGet('SELECT * FROM bills WHERE id = ?', [req.params.id]);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    if (isCancelled(bill)) return res.status(400).json({ error: 'Cannot take payment on a cancelled bill' });
    const due = Math.max(0, Math.round(((Number(bill.total_amount) || 0) - (Number(bill.amount_paid) || 0)) * 100) / 100);
    if (due <= 0) {
      return res.status(400).json({ error: 'Bill is fully paid — nothing left to collect' });
    }
    if (amount > due + 0.001) {
      return res.status(400).json({ error: `Amount exceeds balance due (${due})` });
    }

    await dbRun(
      'INSERT INTO bill_payments (bill_id, amount, method, payment_date, notes, screenshot_data, screenshot_path, screenshot_thumb) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        bill.id,
        amount,
        method,
        payment_date,
        notes,
        req.body.screenshot_data || '',
        req.body.screenshot_path || '',
        req.body.screenshot_thumb || '',
      ]
    );
    const updated = await refreshBillPaidStatus(bill.id);
    res.status(201).json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bills/:id/cancel', async (req, res) => {
  try {
    const bill = await dbGet('SELECT * FROM bills WHERE id = ?', [req.params.id]);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    if (isCancelled(bill)) return res.status(400).json({ error: 'Bill is already cancelled' });
    const items = await dbAll('SELECT * FROM bill_items WHERE bill_id = ?', [bill.id]);
    const qtyByItemId = new Map(items.map((it) => [Number(it.id), remainingQty(it)]));
    await restoreStockForQtys(bill, items, qtyByItemId, 'bill cancel');
    const reason = String(req.body.reason || '').trim();
    const noteLine = `Cancelled ${pakistanToday()}${reason ? `: ${reason}` : ''}`;
    const notes = [bill.notes, noteLine].filter(Boolean).join('\n');
    await dbRun(
      `UPDATE bills SET status = 'cancelled', cancelled_at = ?, cancel_reason = ?, notes = ? WHERE id = ?`,
      [new Date().toISOString(), reason, notes, bill.id]
    );
    res.json(await loadFullBill(bill.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bills/:id/return', async (req, res) => {
  try {
    const bill = await dbGet('SELECT * FROM bills WHERE id = ?', [req.params.id]);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    if (isCancelled(bill)) return res.status(400).json({ error: 'Cancelled bills cannot be returned' });
    const items = await dbAll('SELECT * FROM bill_items WHERE bill_id = ?', [bill.id]);
    const requested = Array.isArray(req.body.items) ? req.body.items : [];
    const qtyByItemId = new Map();
    for (const row of requested) {
      const item = items.find((it) => Number(it.id) === Number(row.id));
      if (!item) return res.status(400).json({ error: 'Return line does not belong to this bill' });
      const qty = Math.floor(Number(row.quantity) || 0);
      if (qty <= 0) continue;
      const left = remainingQty(item);
      if (qty > left) {
        return res.status(400).json({ error: `Cannot return ${qty} of ${item.description} (${left} left)` });
      }
      qtyByItemId.set(Number(item.id), qty);
    }
    if (!qtyByItemId.size) return res.status(400).json({ error: 'Enter at least one quantity to return' });

    await restoreStockForQtys(bill, items, qtyByItemId, 'bill return');
    for (const it of items) {
      const extra = qtyByItemId.get(Number(it.id)) || 0;
      if (!extra) continue;
      const returned_qty = (Number(it.returned_qty) || 0) + extra;
      const lineTotal = Math.round((Number(it.quantity) - returned_qty) * (Number(it.unit_price) || 0) * 100) / 100;
      await dbRun('UPDATE bill_items SET returned_qty = ?, total = ? WHERE id = ?', [returned_qty, lineTotal, it.id]);
    }

    const freshItems = await dbAll('SELECT * FROM bill_items WHERE bill_id = ?', [bill.id]);
    const totals = recalcBillTotals(bill, freshItems);
    const reason = String(req.body.reason || '').trim();
    const summary = [...qtyByItemId.entries()]
      .map(([itemId, qty]) => {
        const it = items.find((row) => Number(row.id) === Number(itemId));
        return `${qty}× ${it?.description || itemId}`;
      })
      .join(', ');
    const noteLine = `Return ${pakistanToday()}: ${summary}${reason ? ` (${reason})` : ''}`;
    const notes = [bill.notes, noteLine].filter(Boolean).join('\n');
    const fullyReturned = freshItems.length > 0 && freshItems.every((it) => remainingQty(it) <= 0);

    if (fullyReturned) {
      await dbRun(
        `UPDATE bills SET subtotal = ?, discount_amount = ?, tax_amount = ?, total_amount = ?,
          status = 'cancelled', cancelled_at = ?, cancel_reason = ?, notes = ? WHERE id = ?`,
        [
          totals.subtotal,
          totals.discount_amount,
          totals.tax_amount,
          totals.total_amount,
          new Date().toISOString(),
          reason || 'All items returned',
          notes,
          bill.id,
        ]
      );
      return res.json(await loadFullBill(bill.id));
    }

    await dbRun(
      `UPDATE bills SET subtotal = ?, discount_amount = ?, tax_amount = ?, total_amount = ?, notes = ? WHERE id = ?`,
      [totals.subtotal, totals.discount_amount, totals.tax_amount, totals.total_amount, notes, bill.id]
    );
    res.json(await refreshBillPaidStatus(bill.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/bills/:id/payments', async (req, res) => {
  try {
    const payments = await dbAll(
      'SELECT * FROM bill_payments WHERE bill_id = ? ORDER BY id DESC',
      [req.params.id]
    );
    res.json(payments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete Bill (restores remaining stock if not already cancelled)
app.delete('/api/bills/:id', async (req, res) => {
  try {
    const bill = await dbGet('SELECT * FROM bills WHERE id = ?', [req.params.id]);
    if (!bill) return res.status(404).json({ error: 'Bill not found' });
    const items = await dbAll('SELECT * FROM bill_items WHERE bill_id = ?', [bill.id]);
    if (!isCancelled(bill)) {
      const qtyByItemId = new Map(items.map((it) => [Number(it.id), remainingQty(it)]));
      await restoreStockForQtys(bill, items, qtyByItemId, 'bill delete');
    }
    await dbRun('DELETE FROM bill_payments WHERE bill_id = ?', [req.params.id]);
    await dbRun('DELETE FROM bill_items WHERE bill_id = ?', [req.params.id]);
    await dbRun('DELETE FROM bills WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Bill deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// DASHBOARD & ANALYTICS STATS ENDPOINT
// -------------------------------------------------------------
app.get('/api/stats', async (req, res) => {
  try {
    const allBills = await dbAll('SELECT * FROM bills');
    const today = pakistanToday();
    const overview = saleOverviewTotals(allBills, today);
    const activeCount = allBills.filter((b) => !isCancelled(b)).length;

    const recentBills = await dbAll('SELECT * FROM bills ORDER BY id DESC LIMIT 5');
    recentBills.forEach(enrichBill);

    const settings = await dbGet('SELECT low_stock_threshold FROM settings LIMIT 1');
    const threshold = Number(settings?.low_stock_threshold) || 5;
    const lowStock = await dbAll(
      'SELECT id, name, sku, stock, price, cost_price, unit FROM products WHERE stock <= ? ORDER BY stock ASC, name ASC LIMIT 20',
      [threshold]
    );

    const monthPrefix = pakistanYearMonth(today);
    const sumSaleCost = async (list) => {
      let sales = 0;
      let cost = 0;
      for (const b of list) {
        sales += Number(b.total_amount) || 0;
        const items = await dbAll('SELECT * FROM bill_items WHERE bill_id = ?', [b.id]);
        for (const it of items) {
          if (!it.product_id) continue;
          const prod = await dbGet('SELECT cost_price FROM products WHERE id = ?', [it.product_id]);
          cost += (Number(prod?.cost_price) || 0) * remainingQty(it);
        }
      }
      return {
        sales: Math.round(sales * 100) / 100,
        cost: Math.round(cost * 100) / 100,
        profit: Math.round((sales - cost) * 100) / 100,
      };
    };
    const todaySales = await dbAll(
      "SELECT * FROM bills WHERE COALESCE(bill_type, 'customer') = 'customer' AND status != 'cancelled' AND bill_date = ?",
      [today]
    );
    const monthSales = await dbAll(
      "SELECT * FROM bills WHERE COALESCE(bill_type, 'customer') = 'customer' AND status != 'cancelled' AND bill_date LIKE ?",
      [`${monthPrefix}%`]
    );
    const todayTotals = await sumSaleCost(todaySales);
    const monthTotals = await sumSaleCost(monthSales);
    const allSales = await dbAll(
      "SELECT * FROM bills WHERE COALESCE(bill_type, 'customer') = 'customer' AND status != 'cancelled'"
    );
    const allTotals = await sumSaleCost(allSales);

    const helpBills = await dbAll(
      `SELECT * FROM bills
       WHERE (bill_type = 'help' OR bill_type = 'loan') AND status != 'cancelled'
       ORDER BY due_date ASC, id DESC`
    );
    helpBills.forEach(enrichBill);
    const help_given = helpBills.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
    const help_repaid = helpBills.reduce((s, b) => s + (Number(b.amount_paid) || 0), 0);
    const help_outstanding = Math.round(Math.max(0, help_given - help_repaid) * 100) / 100;

    res.json({
      total_revenue: overview.total_revenue,
      total_pending: overview.total_pending,
      total_overdue: overview.total_overdue,
      total_bills: activeCount,
      paid_bills_count: overview.paid_bills_count,
      pending_bills_count: overview.pending_bills_count,
      overdue_bills_count: overview.overdue_bills_count,
      recent_bills: recentBills,
      low_stock: lowStock,
      low_stock_threshold: threshold,
      sales_today: todayTotals.sales,
      cost_today: todayTotals.cost,
      profit_today: todayTotals.profit,
      sales_month: monthTotals.sales,
      cost_month: monthTotals.cost,
      profit_month: monthTotals.profit,
      sales_total: allTotals.sales,
      cost_total: allTotals.cost,
      profit_total: allTotals.profit,
      help_given: Math.round(help_given * 100) / 100,
      help_repaid: Math.round(help_repaid * 100) / 100,
      help_outstanding,
      help_count: helpBills.length,
      help_bills: helpBills.map((b) => ({
        id: b.id,
        invoice_number: b.invoice_number,
        customer_name: b.customer_name,
        customer_phone: b.customer_phone,
        bill_date: b.bill_date,
        due_date: b.due_date,
        bill_time: b.bill_time,
        total_amount: b.total_amount,
        amount_paid: b.amount_paid,
        balance_due: b.balance_due,
        status: b.status,
        bill_type: b.bill_type,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// CUSTOMER LEDGER
// -------------------------------------------------------------
app.get('/api/ledger', async (req, res) => {
  try {
    const name = String(req.query.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name query is required' });

    const bills = await dbAll(
      `SELECT * FROM bills WHERE customer_name = ? ORDER BY bill_date DESC, id DESC`,
      [name]
    );
    bills.forEach(enrichBill);
    const active = bills.filter((b) => !isCancelled(b));

    const advances = await dbAll(
      `SELECT * FROM advance_payments WHERE LOWER(TRIM(client_name)) = LOWER(?) ORDER BY payment_date DESC, id DESC`,
      [name]
    );

    const totalBilled = active.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
    const totalPaid = active.reduce((s, b) => s + (Number(b.amount_paid) || 0), 0);
    const totalAdvance = advances.reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const availableAdvance = advances.reduce((s, b) => {
      const rem = b.remaining == null ? Number(b.amount) || 0 : Number(b.remaining) || 0;
      return s + rem;
    }, 0);
    const sales = active.filter((b) => normalizeBillType(b.bill_type) === 'customer');
    const helpBills = active.filter((b) => normalizeBillType(b.bill_type) === 'help');
    const buying = active.filter((b) => normalizeBillType(b.bill_type) === 'supplier');
    const sumDue = (list) =>
      Math.round(
        list.reduce((s, b) => s + Math.max(0, Number(b.balance_due) || 0), 0) * 100
      ) / 100;
    const salesOutstanding = sumDue(sales);
    const helpGiven = helpBills.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
    const helpRepaid = helpBills.reduce((s, b) => s + (Number(b.amount_paid) || 0), 0);
    const helpOutstanding = sumDue(helpBills);
    const buyingOutstanding = sumDue(buying);

    res.json({
      customer_name: name,
      bills,
      advances: advances.map((a) => ({
        ...a,
        remaining: a.remaining == null ? Number(a.amount) || 0 : Number(a.remaining) || 0,
      })),
      totals: {
        billed: totalBilled,
        paid: totalPaid,
        advances: totalAdvance,
        available_advance: availableAdvance,
        outstanding: salesOutstanding,
        sales_outstanding: salesOutstanding,
        help_given: Math.round(helpGiven * 100) / 100,
        help_repaid: Math.round(helpRepaid * 100) / 100,
        help_outstanding: helpOutstanding,
        buying_outstanding: buyingOutstanding,
        bill_count: bills.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// MONTHLY SALES REPORT
// -------------------------------------------------------------
app.get('/api/reports/monthly', async (req, res) => {
  try {
    const now = new Date();
    const year = parseInt(req.query.year, 10) || now.getFullYear();
    const month = parseInt(req.query.month, 10) || now.getMonth() + 1;
    const mm = String(month).padStart(2, '0');
    const prefix = `${year}-${mm}`;

    const bills = await dbAll(
      `SELECT * FROM bills WHERE bill_date LIKE ? AND status != 'cancelled' ORDER BY bill_date ASC, id ASC`,
      [`${prefix}%`]
    );
    bills.forEach(enrichBill);

    const sales = bills.filter((b) => normalizeBillType(b.bill_type) === 'customer');
    const buying = bills.filter((b) => normalizeBillType(b.bill_type) === 'supplier');
    const helpBills = bills.filter((b) => normalizeBillType(b.bill_type) === 'help');
    const helpGiven = helpBills.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
    const helpRepaid = helpBills.reduce((s, b) => s + (Number(b.amount_paid) || 0), 0);
    const salesTotal = sales.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
    const salesPaid = sales.reduce((s, b) => s + (Number(b.amount_paid) || 0), 0);
    const buyingTotal = buying.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);

    res.json({
      year,
      month,
      period: prefix,
      sales_count: sales.length,
      buying_count: buying.length,
      sales_total: salesTotal,
      sales_paid: salesPaid,
      sales_outstanding: Math.max(0, salesTotal - salesPaid),
      buying_total: buyingTotal,
      estimated_profit: salesTotal - buyingTotal,
      help_count: helpBills.length,
      help_given: Math.round(helpGiven * 100) / 100,
      help_repaid: Math.round(helpRepaid * 100) / 100,
      help_outstanding: Math.round(Math.max(0, helpGiven - helpRepaid) * 100) / 100,
      bills,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// BACKUP / RESTORE (JSON)
// -------------------------------------------------------------
app.get('/api/backup', async (req, res) => {
  try {
    const payload = {
      exported_at: new Date().toISOString(),
      settings: await dbAll('SELECT * FROM settings'),
      customers: await dbAll('SELECT * FROM customers'),
      products: await dbAll('SELECT * FROM products'),
      bills: await dbAll('SELECT * FROM bills'),
      bill_items: await dbAll('SELECT * FROM bill_items'),
      bill_payments: (await dbAll('SELECT * FROM bill_payments')).map((p) => {
        if (!p?.screenshot_data) return p;
        const { screenshot_data, ...rest } = p;
        return { ...rest, has_screenshot: true };
      }),
      advances: await dbAll('SELECT * FROM advance_payments'),
      customer_product_rates: await dbAll('SELECT * FROM customer_product_rates'),
      stock_adjustments: await dbAll('SELECT * FROM stock_adjustments'),
      day_closings: await dbAll('SELECT * FROM day_closings'),
      memos: await dbAll('SELECT * FROM memos'),
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="elite-chocolate-backup-${pakistanToday()}.json"`
    );
    res.send(JSON.stringify(payload, null, 2));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/restore', async (req, res) => {
  try {
    const data = req.body;
    if (!data || typeof data !== 'object') {
      return res.status(400).json({ error: 'Invalid backup payload' });
    }

    await dbRun('BEGIN IMMEDIATE');
    try {
      await dbRun('DELETE FROM bill_payments');
      await dbRun('DELETE FROM bill_items');
      await dbRun('DELETE FROM bills');
      await dbRun('DELETE FROM stock_adjustments');
      await dbRun('DELETE FROM customer_product_rates');
      await dbRun('DELETE FROM advance_payments');
      await dbRun('DELETE FROM customers');
      await dbRun('DELETE FROM products');

      for (const c of data.customers || []) {
        await dbRun(
          `INSERT INTO customers (
            id, name, email, phone, address, tax_id, party_type,
            payee_bank_name, payee_account_title, payee_account_number, payee_payment_notes, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            c.id,
            c.name,
            c.email || '',
            c.phone || '',
            c.address || '',
            c.tax_id || '',
            c.party_type === 'supplier' ? 'supplier' : 'customer',
            c.payee_bank_name || '',
            c.payee_account_title || '',
            c.payee_account_number || '',
            c.payee_payment_notes || '',
            c.created_at || null,
          ]
        );
      }
      for (const p of data.products || []) {
        await dbRun(
          'INSERT INTO products (id, name, description, price, cost_price, unit, stock, sku, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [p.id, p.name, p.description || '', p.price || 0, p.cost_price || 0, p.unit || 'item', p.stock ?? 0, p.sku || '', p.created_at || null]
        );
      }
      for (const b of data.bills || []) {
        await dbRun(
          `INSERT INTO bills (
            id, bill_type, invoice_number, customer_name, customer_email, customer_phone, customer_address,
            bill_date, bill_time, due_date, subtotal, tax_rate, tax_amount, discount_rate, discount_amount,
            total_amount, amount_paid, status, notes, payment_method, bank_details,
            payee_bank_name, payee_account_title, payee_account_number, payee_payment_notes,
            cancel_reason, cancelled_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            b.id, b.bill_type || 'customer', b.invoice_number, b.customer_name, b.customer_email || '',
            b.customer_phone || '', b.customer_address || '', b.bill_date, b.bill_time || '', b.due_date,
            b.subtotal || 0, b.tax_rate || 0, b.tax_amount || 0, b.discount_rate || 0, b.discount_amount || 0,
            b.total_amount || 0, b.amount_paid || 0, b.status || 'pending', b.notes || '',
            b.payment_method || '', b.bank_details || '',
            b.payee_bank_name || '', b.payee_account_title || '', b.payee_account_number || '',
            b.payee_payment_notes || '', b.cancel_reason || '', b.cancelled_at || '', b.created_at || null,
          ]
        );
      }
      for (const i of data.bill_items || []) {
        await dbRun(
          'INSERT INTO bill_items (id, bill_id, product_id, description, quantity, unit_price, total, returned_qty) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [i.id, i.bill_id, i.product_id || null, i.description, i.quantity || 1, i.unit_price || 0, i.total || 0, i.returned_qty || 0]
        );
      }
      for (const p of data.bill_payments || []) {
        await dbRun(
          'INSERT INTO bill_payments (id, bill_id, amount, method, payment_date, notes, screenshot_data, screenshot_path, screenshot_thumb, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [
            p.id,
            p.bill_id,
            p.amount || 0,
            p.method || 'Cash',
            p.payment_date,
            p.notes || '',
            p.screenshot_data || '',
            p.screenshot_path || '',
            p.screenshot_thumb || '',
            p.created_at || null,
          ]
        );
      }
      for (const a of data.advances || []) {
        const amt = Number(a.amount) || 0;
        const rem = a.remaining == null ? amt : Number(a.remaining) || 0;
        await dbRun(
          'INSERT INTO advance_payments (id, amount, remaining, payment_date, client_name, notes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [a.id, amt, rem, a.payment_date, a.client_name || '', a.notes || '', a.created_at || null]
        );
      }
      for (const r of data.customer_product_rates || []) {
        await dbRun(
          'INSERT INTO customer_product_rates (id, customer_id, product_id, custom_price, created_at) VALUES (?, ?, ?, ?, ?)',
          [r.id, r.customer_id, r.product_id, r.custom_price || 0, r.created_at || null]
        );
      }
      for (const s of data.stock_adjustments || []) {
        await dbRun(
          'INSERT INTO stock_adjustments (id, product_id, delta, reason, notes, created_at) VALUES (?, ?, ?, ?, ?, ?)',
          [s.id, s.product_id, s.delta || 0, s.reason || 'adjustment', s.notes || '', s.created_at || null]
        );
      }

      if (Array.isArray(data.memos)) {
        await dbRun('DELETE FROM memos');
        for (const m of data.memos) {
          await dbRun(
            'INSERT INTO memos (id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
            [m.id, m.title || 'Untitled', m.body || '', m.created_at || null, m.updated_at || m.created_at || null]
          );
        }
      }

      if (data.settings && data.settings[0]) {
        const s = data.settings[0];
        const pay = serializePaymentMethods(getPaymentMethods(s), s.payment_instructions);
        await dbRun(
          `UPDATE settings SET
            company_name=?, company_email=?, company_phone=?, company_address=?, company_tax_id=?,
            logo_url=?, currency_symbol=?, default_tax_rate=?, bank_name=?, account_title=?,
            account_number=?, mobile_wallet=?, payment_instructions=?, payment_methods=?,
            app_pin=?, urdu_labels=?, low_stock_threshold=?, biometric_lock=?, due_reminders=?, show_developer_credit=?
           WHERE id = (SELECT id FROM settings LIMIT 1)`,
          [
            s.company_name, s.company_email, s.company_phone, s.company_address, s.company_tax_id,
            s.logo_url || '', s.currency_symbol || 'Rs.', s.default_tax_rate || 0, pay.bank_name,
            pay.account_title, pay.account_number, pay.mobile_wallet, pay.payment_instructions,
            pay.payment_methods, s.app_pin || '', s.urdu_labels ? 1 : 0, s.low_stock_threshold ?? 5,
            s.biometric_lock ? 1 : 0, s.due_reminders ? 1 : 0,
            s.show_developer_credit === 0 || s.show_developer_credit === false ? 0 : 1,
          ]
        );
      }

      await dbRun('COMMIT');
    } catch (e) {
      await dbRun('ROLLBACK');
      throw e;
    }

    res.json({ success: true, message: 'Backup restored successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// AGING REPORT (collections)
// -------------------------------------------------------------
app.get('/api/reports/aging', async (req, res) => {
  try {
    const today = pakistanToday();
    const bills = await dbAll(
      `SELECT * FROM bills
       WHERE COALESCE(bill_type, 'customer') != 'supplier'
         AND status != 'paid'
         AND status != 'cancelled'
       ORDER BY due_date ASC, id ASC`
    );

    const buckets = { current: [], d30: [], d60: [], d90: [] };
    const totals = { current: 0, d30: 0, d60: 0, d90: 0, all: 0 };
    const rows = [];

    const dayDiff = (from, to) => {
      const [y1, m1, d1] = String(from).split('-').map(Number);
      const [y2, m2, d2] = String(to).split('-').map(Number);
      if (!y1 || !y2) return 0;
      return Math.floor((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
    };

    for (const bill of bills) {
      enrichBill(bill);
      const balance = Number(bill.balance_due) || 0;
      if (balance <= 0) continue;
      const anchor = bill.due_date || bill.bill_date || today;
      const days_overdue = Math.max(0, dayDiff(anchor, today));
      let aging_bucket = 'current';
      if (days_overdue >= 90) aging_bucket = 'd90';
      else if (days_overdue >= 60) aging_bucket = 'd60';
      else if (days_overdue >= 30) aging_bucket = 'd30';

      const row = {
        id: bill.id,
        invoice_number: bill.invoice_number,
        customer_name: bill.customer_name,
        customer_phone: bill.customer_phone || '',
        bill_date: bill.bill_date,
        due_date: bill.due_date,
        total_amount: bill.total_amount,
        amount_paid: bill.amount_paid,
        balance_due: balance,
        status: bill.status,
        days_overdue,
        aging_bucket,
        bill_type: bill.bill_type || 'customer',
      };
      rows.push(row);
      buckets[aging_bucket].push(row);
      totals[aging_bucket] += balance;
      totals.all += balance;
    }

    rows.sort((a, b) => b.days_overdue - a.days_overdue);
    for (const k of Object.keys(totals)) {
      totals[k] = Math.round(totals[k] * 100) / 100;
    }

    res.json({ today, rows, buckets, totals, count: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// CUSTOMER MERGE
// -------------------------------------------------------------
app.post('/api/customers/merge', async (req, res) => {
  try {
    const primaryId = Number(req.body.primaryId);
    const duplicateIds = Array.isArray(req.body.duplicateIds)
      ? req.body.duplicateIds.map(Number).filter((id) => id && id !== primaryId)
      : [];
    if (!primaryId) return res.status(400).json({ error: 'primaryId is required' });
    if (!duplicateIds.length) return res.status(400).json({ error: 'duplicateIds required' });

    const primary = await dbGet('SELECT * FROM customers WHERE id = ?', [primaryId]);
    if (!primary) return res.status(404).json({ error: 'Primary customer not found' });

    await dbRun('BEGIN IMMEDIATE');
    try {
      for (const dupId of duplicateIds) {
        const dup = await dbGet('SELECT * FROM customers WHERE id = ?', [dupId]);
        if (!dup) continue;

        // Fill blank primary fields from duplicate
        await dbRun(
          `UPDATE customers SET
            email = COALESCE(NULLIF(TRIM(email), ''), ?),
            phone = COALESCE(NULLIF(TRIM(phone), ''), ?),
            address = COALESCE(NULLIF(TRIM(address), ''), ?),
            tax_id = COALESCE(NULLIF(TRIM(tax_id), ''), ?),
            payee_bank_name = COALESCE(NULLIF(TRIM(payee_bank_name), ''), ?),
            payee_account_title = COALESCE(NULLIF(TRIM(payee_account_title), ''), ?),
            payee_account_number = COALESCE(NULLIF(TRIM(payee_account_number), ''), ?),
            payee_payment_notes = COALESCE(NULLIF(TRIM(payee_payment_notes), ''), ?),
            party_type = CASE
              WHEN COALESCE(NULLIF(TRIM(party_type), ''), 'customer') = 'supplier'
                OR ? = 'supplier' THEN 'supplier'
              ELSE COALESCE(NULLIF(TRIM(party_type), ''), 'customer')
            END
           WHERE id = ?`,
          [
            dup.email || '',
            dup.phone || '',
            dup.address || '',
            dup.tax_id || '',
            dup.payee_bank_name || '',
            dup.payee_account_title || '',
            dup.payee_account_number || '',
            dup.payee_payment_notes || '',
            dup.party_type || 'customer',
            primaryId,
          ]
        );

        // Reassign bills by customer name match
        await dbRun(
          `UPDATE bills SET customer_name = ?
           WHERE LOWER(TRIM(customer_name)) = LOWER(TRIM(?))`,
          [primary.name, dup.name]
        );

        // Reassign advances
        await dbRun(
          `UPDATE advance_payments SET client_name = ?
           WHERE LOWER(TRIM(client_name)) = LOWER(TRIM(?))`,
          [primary.name, dup.name]
        );

        // Merge rates: keep primary rate if conflict
        const dupRates = await dbAll(
          'SELECT * FROM customer_product_rates WHERE customer_id = ?',
          [dupId]
        );
        for (const r of dupRates) {
          const existing = await dbGet(
            'SELECT * FROM customer_product_rates WHERE customer_id = ? AND product_id = ?',
            [primaryId, r.product_id]
          );
          if (!existing) {
            await dbRun(
              `INSERT INTO customer_product_rates (customer_id, product_id, custom_price)
               VALUES (?, ?, ?)`,
              [primaryId, r.product_id, r.custom_price || 0]
            );
          }
          await dbRun('DELETE FROM customer_product_rates WHERE id = ?', [r.id]);
        }

        await dbRun('DELETE FROM customers WHERE id = ?', [dupId]);
      }
      await dbRun('COMMIT');
    } catch (e) {
      await dbRun('ROLLBACK');
      throw e;
    }

    const updated = await dbGet('SELECT * FROM customers WHERE id = ?', [primaryId]);
    res.json({ success: true, customer: updated, merged: duplicateIds.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// DAY CLOSE + DEMO PURGE
// -------------------------------------------------------------
app.get('/api/closings/today', async (req, res) => {
  try {
    const today = pakistanToday();
    const row = await dbGet(
      `SELECT COALESCE(SUM(p.amount), 0) as total
       FROM bill_payments p
       INNER JOIN bills b ON b.id = p.bill_id
       WHERE p.payment_date = ?
         AND COALESCE(b.bill_type, 'customer') = 'customer'
         AND b.status != 'cancelled'`,
      [today]
    );
    const last = await dbGet(
      'SELECT * FROM day_closings WHERE close_date = ? ORDER BY id DESC LIMIT 1',
      [today]
    );
    res.json({ date: today, collected: Number(row?.total) || 0, last_close: last || null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/closings', async (req, res) => {
  try {
    const limit = Math.min(60, Math.max(1, Number(req.query.limit) || 14));
    const rows = await dbAll('SELECT * FROM day_closings ORDER BY close_date DESC, id DESC LIMIT ?', [limit]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/closings', async (req, res) => {
  try {
    const today = pakistanToday();
    const cash_counted = Number(req.body.cash_counted);
    if (!Number.isFinite(cash_counted) || cash_counted < 0) {
      return res.status(400).json({ error: 'cash_counted is required' });
    }
    const payRow = await dbGet(
      `SELECT COALESCE(SUM(p.amount), 0) as total
       FROM bill_payments p
       INNER JOIN bills b ON b.id = p.bill_id
       WHERE p.payment_date = ?
         AND COALESCE(b.bill_type, 'customer') = 'customer'
         AND b.status != 'cancelled'`,
      [today]
    );
    const collected_sales = Number(payRow?.total) || 0;
    const gap = Math.round((cash_counted - collected_sales) * 100) / 100;
    const result = await dbRun(
      `INSERT INTO day_closings (close_date, cash_counted, collected_sales, gap, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [today, cash_counted, collected_sales, gap, req.body.notes || '']
    );
    const row = await dbGet('SELECT * FROM day_closings WHERE id = ?', [result.lastID]);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/maintenance/purge-demo', async (req, res) => {
  try {
    const customers = await dbAll('SELECT * FROM customers');
    const bills = await dbAll('SELECT * FROM bills');
    const demoCustomers = customers.filter(isDemoCustomer);
    const demoNames = new Set(demoCustomers.map((c) => String(c.name || '').trim().toLowerCase()));
    const demoBills = bills.filter(
      (b) => isDemoBill(b) || demoNames.has(String(b.customer_name || '').trim().toLowerCase())
    );
    for (const b of demoBills) {
      await dbRun('DELETE FROM bill_items WHERE bill_id = ?', [b.id]);
      await dbRun('DELETE FROM bill_payments WHERE bill_id = ?', [b.id]);
      await dbRun('DELETE FROM bills WHERE id = ?', [b.id]);
    }
    for (const c of demoCustomers) {
      await dbRun('DELETE FROM customer_product_rates WHERE customer_id = ?', [c.id]);
      await dbRun('DELETE FROM customers WHERE id = ?', [c.id]);
    }
    res.json({
      success: true,
      removed_bills: demoBills.length,
      removed_customers: demoCustomers.length,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// NOTEPAD
// -------------------------------------------------------------
app.get('/api/memos', async (req, res) => {
  try {
    const rows = await dbAll('SELECT * FROM memos ORDER BY updated_at DESC, id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/memos', async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const body = String(req.body.body || '');
    if (!title && !body.trim()) return res.status(400).json({ error: 'Write a title or note' });
    const result = await dbRun(
      'INSERT INTO memos (title, body) VALUES (?, ?)',
      [title || 'Untitled', body]
    );
    const row = await dbGet('SELECT * FROM memos WHERE id = ?', [result.lastID]);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/memos/:id', async (req, res) => {
  try {
    const existing = await dbGet('SELECT * FROM memos WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Note not found' });
    const title = String(req.body.title ?? existing.title ?? '').trim() || 'Untitled';
    const body = req.body.body != null ? String(req.body.body) : String(existing.body || '');
    await dbRun(
      `UPDATE memos SET title = ?, body = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [title, body, req.params.id]
    );
    const row = await dbGet('SELECT * FROM memos WHERE id = ?', [req.params.id]);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/memos/:id', async (req, res) => {
  try {
    const existing = await dbGet('SELECT * FROM memos WHERE id = ?', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Note not found' });
    await dbRun('DELETE FROM memos WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// CASH FLOW (live from bills + advances)
// -------------------------------------------------------------
app.get('/api/cashflow', async (req, res) => {
  try {
    const compact = String(req.query.compact || '') === '1';
    const salesRow = await dbGet(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM bills
       WHERE COALESCE(bill_type, 'customer') = 'customer' AND status != 'cancelled'`
    );
    const buyingRow = await dbGet(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM bills
       WHERE bill_type = 'supplier' AND status != 'cancelled'`
    );
    const paidSalesRow = await dbGet(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM bills
       WHERE COALESCE(bill_type, 'customer') = 'customer' AND status = 'paid'`
    );
    const pendingSalesRow = await dbGet(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM bills
       WHERE COALESCE(bill_type, 'customer') = 'customer' AND status = 'pending'`
    );
    const helpGivenRow = await dbGet(
      `SELECT COALESCE(SUM(total_amount), 0) as total FROM bills
       WHERE (bill_type = 'help' OR bill_type = 'loan') AND status != 'cancelled'`
    );
    const helpRepaidRow = await dbGet(
      `SELECT COALESCE(SUM(COALESCE(amount_paid, 0)), 0) as total FROM bills
       WHERE (bill_type = 'help' OR bill_type = 'loan') AND status != 'cancelled'`
    );
    const advanceRow = await dbGet('SELECT COALESCE(SUM(amount), 0) as total FROM advance_payments');
    const advances = compact
      ? []
      : await dbAll('SELECT * FROM advance_payments ORDER BY id DESC');

    let money_flow = [];
    if (!compact) {
      const recentBills = await dbAll(
        `SELECT id, bill_type, invoice_number, customer_name, bill_date, total_amount, status, notes
         FROM bills ORDER BY bill_date DESC, id DESC LIMIT 40`
      );

      money_flow = recentBills.map((b) => {
        const t = normalizeBillType(b.bill_type);
        const amount = isCancelled(b) ? 0 : Number(b.total_amount) || 0;
        const isSupplier = t === 'supplier';
        const isHelp = t === 'help';
        const kind = isHelp ? 'Help' : isSupplier ? 'Buying' : 'Sale';
        return {
          id: b.id,
          date: b.bill_date,
          invoice_number: b.invoice_number,
          selling: isSupplier || isHelp ? 0 : amount,
          buying: isSupplier ? amount : 0,
          expenditure: isHelp ? amount : 0,
          profit: isHelp ? 0 : isSupplier ? -amount : amount,
          comment: `${kind} · ${b.customer_name}${b.notes ? ` · ${b.notes}` : ''} (${b.status})`,
          bill_type: t,
          status: b.status,
        };
      });
    }

    const total_sales = Number(salesRow.total) || 0;
    const buying_cost = Number(buyingRow.total) || 0;
    const help_given = Number(helpGivenRow.total) || 0;
    const help_repaid = Number(helpRepaidRow.total) || 0;
    const help_outstanding = Math.round(Math.max(0, help_given - help_repaid) * 100) / 100;
    const total_advance = Number(advanceRow.total) || 0;
    const net_profit = total_sales - buying_cost;
    const net_balance = net_profit - total_advance;

    res.json({
      total_sales,
      buying_cost,
      expenditure: help_outstanding,
      help_given,
      help_repaid,
      help_outstanding,
      net_profit,
      total_advance,
      net_balance,
      paid_sales: Number(paidSalesRow.total) || 0,
      pending_sales: Number(pendingSalesRow.total) || 0,
      advances,
      money_flow,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`Auto Bill REST API Server running on port ${PORT}`);
  console.log(`API URL: http://localhost:${PORT}/api/bills`);
  console.log(`====================================================`);
});
