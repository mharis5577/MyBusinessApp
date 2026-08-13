/**
 * On-device IndexedDB store for Capacitor / VITE_DATA_MODE=local builds.
 * Mirrors the Express /api shapes used by the UI.
 */
import { openDB } from 'idb';
import { pakistanToday } from '../utils/pakistan';

const DB_NAME = 'elite-chocolate-pos';
const DB_VERSION = 2;

function normalizePartyType(value) {
  return value === 'supplier' ? 'supplier' : 'customer';
}

const DEFAULT_SETTINGS = {
  id: 1,
  company_name: 'ELITE CHOCOLATE',
  company_email: 'm.haris676@gmail.com',
  company_phone: '+923337669709',
  company_address: 'House No 107E, ST 13, Mehria Town, Attock',
  company_tax_id: '3110471785257',
  logo_url: '',
  currency_symbol: 'Rs.',
  default_tax_rate: 0,
  bank_name: 'Meezan Bank / HBL',
  account_title: 'ELITE CHOCOLATE',
  account_number: '03337669709',
  mobile_wallet: '03337669709 (Raast / JazzCash / EasyPaisa)',
  payment_instructions: 'Please share payment screenshot on WhatsApp +923337669709',
  app_pin: '',
  biometric_lock: 0,
  urdu_labels: 0,
  low_stock_threshold: 5,
};

function enrichBill(bill) {
  if (!bill) return bill;
  const paid = Number(bill.amount_paid) || 0;
  const total = Number(bill.total_amount) || 0;
  return {
    ...bill,
    amount_paid: paid,
    balance_due: Math.max(0, Math.round((total - paid) * 100) / 100),
  };
}

async function getDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const stores = [
        'settings',
        'customers',
        'products',
        'bills',
        'bill_items',
        'bill_payments',
        'advances',
        'rates',
        'stock_adjustments',
      ];
      for (const name of stores) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
        }
      }
    },
  });
}

async function ensurePartyTypes(db) {
  const customers = await db.getAll('customers');
  for (const c of customers) {
    if (c.party_type !== 'customer' && c.party_type !== 'supplier') {
      await db.put('customers', { ...c, party_type: 'customer' });
    }
  }
}

async function ensureSeeded() {
  const db = await getDb();
  const existing = await db.get('settings', 1);
  if (!existing) {
    await db.put('settings', { ...DEFAULT_SETTINGS });
  }
  await ensurePartyTypes(db);
  return db;
}

async function nextId(db, store) {
  const all = await db.getAll(store);
  if (!all.length) return 1;
  return Math.max(...all.map((r) => Number(r.id) || 0)) + 1;
}

async function generateNextInvoiceNumber(bType = 'customer') {
  const db = await ensureSeeded();
  const year = new Date().getFullYear();
  const prefix = bType === 'supplier' ? 'SAU' : 'INV';
  const bills = await db.getAll('bills');
  const matching = bills
    .filter((b) => String(b.invoice_number || '').startsWith(`${prefix}-${year}-`))
    .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
  let nextNum = 1;
  if (matching[0]?.invoice_number) {
    const m = matching[0].invoice_number.match(new RegExp(`${prefix}-\\d+-(\\d+)`));
    if (m?.[1]) nextNum = parseInt(m[1], 10) + 1;
  }
  return `${prefix}-${year}-${String(nextNum).padStart(4, '0')}`;
}

async function attachBillRelations(db, bill) {
  const items = (await db.getAll('bill_items')).filter((i) => i.bill_id === bill.id);
  const payments = (await db.getAll('bill_payments'))
    .filter((p) => p.bill_id === bill.id)
    .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
  return enrichBill({ ...bill, items, payments });
}

async function refreshBillPaidStatus(db, billId) {
  const bill = await db.get('bills', billId);
  if (!bill) return null;
  const payments = (await db.getAll('bill_payments')).filter((p) => p.bill_id === billId);
  const paid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const total = Number(bill.total_amount) || 0;
  let status = bill.status;
  if (paid >= total && total > 0) status = 'paid';
  else if (paid > 0 && status === 'paid') status = 'pending';
  const updated = { ...bill, amount_paid: paid, status };
  await db.put('bills', updated);
  return attachBillRelations(db, updated);
}

function jsonOk(data, status = 200) {
  return { status, data };
}

function jsonErr(message, status = 400) {
  return { status, data: { error: message } };
}

function parsePath(url) {
  const u = new URL(url, 'http://local.api');
  const path = u.pathname.replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean); // ['api', ...]
  return { path, parts, search: u.searchParams };
}

/**
 * Handle a local API request. Returns { status, data }.
 */
export async function handleLocalRequest(url, options = {}) {
  try {
    return await handleLocalRequestInner(url, options);
  } catch (err) {
    console.error('Local store error:', err);
    return jsonErr(err?.message || 'Local storage error', 500);
  }
}

async function handleLocalRequestInner(url, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  let body = options.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  } else if (!body) {
    body = {};
  }

  const { parts, search } = parsePath(url);
  // Expect /api/...
  if (parts[0] !== 'api') return jsonErr('Not found', 404);
  const db = await ensureSeeded();
  if (!db) return jsonErr('Could not open on-device database', 500);

  // SETTINGS
  if (parts[1] === 'settings' && parts.length === 2) {
    if (method === 'GET') {
      const s = (await db.get('settings', 1)) || DEFAULT_SETTINGS;
      return jsonOk(s);
    }
    if (method === 'PUT') {
      const prev = (await db.get('settings', 1)) || DEFAULT_SETTINGS;
      const next = {
        ...prev,
        ...body,
        id: 1,
        urdu_labels: body.urdu_labels ? 1 : 0,
        biometric_lock: body.biometric_lock ? 1 : 0,
        low_stock_threshold: body.low_stock_threshold ?? prev.low_stock_threshold ?? 5,
        updated_at: new Date().toISOString(),
      };
      await db.put('settings', next);
      return jsonOk(next);
    }
  }

  // RESET
  if (parts[1] === 'reset-db' && method === 'POST') {
    for (const store of [
      'bill_payments',
      'bill_items',
      'bills',
      'stock_adjustments',
      'rates',
      'advances',
      'customers',
      'products',
    ]) {
      await db.clear(store);
    }
    return jsonOk({ success: true, message: 'All database tables wiped successfully.' });
  }

  // ADVANCES
  if (parts[1] === 'advances') {
    const normalizeAdv = (a) => ({
      ...a,
      remaining: a.remaining == null ? Number(a.amount) || 0 : Number(a.remaining) || 0,
    });
    const nameMatch = (a, name) =>
      String(a.client_name || '').trim().toLowerCase() === String(name || '').trim().toLowerCase();

    if (parts.length === 2 && method === 'GET') {
      const client = (search.get('client') || '').trim();
      let advances = await db.getAll('advances');
      if (client) advances = advances.filter((a) => nameMatch(a, client));
      advances = advances.map(normalizeAdv).sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
      const total_advance = advances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
      const available_advance = advances.reduce((s, a) => s + (Number(a.remaining) || 0), 0);
      return jsonOk({ advances, total_advance, available_advance });
    }

    if (parts.length === 2 && method === 'POST') {
      const amount = Number(body.amount);
      if (!amount || amount <= 0) return jsonErr('Valid advance amount is required');
      const client_name = String(body.client_name || '').trim();
      if (!client_name) return jsonErr('Client name is required');
      const id = await nextId(db, 'advances');
      const created = {
        id,
        amount,
        remaining: amount,
        payment_date: body.payment_date || pakistanToday(),
        client_name,
        notes: body.notes || '',
        created_at: new Date().toISOString(),
      };
      await db.put('advances', created);
      const all = (await db.getAll('advances')).map(normalizeAdv);
      return jsonOk(
        {
          created,
          total_advance: all.reduce((s, a) => s + (Number(a.amount) || 0), 0),
          available_advance: all.reduce((s, a) => s + (Number(a.remaining) || 0), 0),
        },
        201
      );
    }

    if (parts[2] === 'apply' && method === 'POST') {
      const billId = Number(body.bill_id);
      const clientName = String(body.client_name || '').trim();
      let amount = Number(body.amount);
      if (!billId) return jsonErr('bill_id is required');
      if (!clientName) return jsonErr('client_name is required');
      const bill = await db.get('bills', billId);
      if (!bill) return jsonErr('Bill not found', 404);
      const enriched = enrichBill(bill);
      const due = Number(enriched.balance_due) || 0;
      if (due <= 0) return jsonErr('Bill has no balance due');

      const pool = (await db.getAll('advances'))
        .filter((a) => nameMatch(a, clientName))
        .map(normalizeAdv)
        .filter((a) => (Number(a.remaining) || 0) > 0)
        .sort((a, b) => (Number(a.id) || 0) - (Number(b.id) || 0));

      const available = pool.reduce((s, a) => s + (Number(a.remaining) || 0), 0);
      if (available <= 0) return jsonErr('No available advance for this client');
      if (!amount || amount <= 0) amount = Math.min(due, available);
      amount = Math.round(Math.min(amount, due, available) * 100) / 100;

      let left = amount;
      for (const adv of pool) {
        if (left <= 0) break;
        const rem = Number(adv.remaining) || 0;
        const take = Math.min(rem, left);
        if (take <= 0) continue;
        await db.put('advances', {
          ...adv,
          remaining: Math.round((rem - take) * 100) / 100,
        });
        left = Math.round((left - take) * 100) / 100;
      }

      const payId = await nextId(db, 'bill_payments');
      await db.put('bill_payments', {
        id: payId,
        bill_id: billId,
        amount,
        method: 'Advance',
        payment_date: pakistanToday(),
        notes: `Applied from advance (${clientName})`,
        screenshot_data: '',
        created_at: new Date().toISOString(),
      });

      const updated = await refreshBillPaidStatus(db, billId);
      const avail = (await db.getAll('advances'))
        .filter((a) => nameMatch(a, clientName))
        .map(normalizeAdv)
        .reduce((s, a) => s + (Number(a.remaining) || 0), 0);
      return jsonOk({ bill: updated, applied: amount, available_advance: avail }, 201);
    }

    if (parts.length === 3 && method === 'DELETE') {
      await db.delete('advances', Number(parts[2]));
      const all = (await db.getAll('advances')).map(normalizeAdv);
      return jsonOk({
        success: true,
        total_advance: all.reduce((s, a) => s + (Number(a.amount) || 0), 0),
        available_advance: all.reduce((s, a) => s + (Number(a.remaining) || 0), 0),
      });
    }
  }

  // CUSTOMERS
  if (parts[1] === 'customers') {
    // Merge duplicates: POST /api/customers/merge
    if (parts.length === 3 && parts[2] === 'merge' && method === 'POST') {
      const primaryId = Number(body.primaryId);
      const duplicateIds = Array.isArray(body.duplicateIds)
        ? body.duplicateIds.map(Number).filter((id) => id && id !== primaryId)
        : [];
      if (!primaryId) return jsonErr('primaryId is required');
      if (!duplicateIds.length) return jsonErr('duplicateIds required');
      const primary = await db.get('customers', primaryId);
      if (!primary) return jsonErr('Primary customer not found', 404);

      let merged = { ...primary };
      for (const dupId of duplicateIds) {
        const dup = await db.get('customers', dupId);
        if (!dup) continue;
        merged = {
          ...merged,
          email: (merged.email || '').trim() || dup.email || '',
          phone: (merged.phone || '').trim() || dup.phone || '',
          address: (merged.address || '').trim() || dup.address || '',
          tax_id: (merged.tax_id || '').trim() || dup.tax_id || '',
          payee_bank_name: (merged.payee_bank_name || '').trim() || dup.payee_bank_name || '',
          payee_account_title: (merged.payee_account_title || '').trim() || dup.payee_account_title || '',
          payee_account_number: (merged.payee_account_number || '').trim() || dup.payee_account_number || '',
          payee_payment_notes: (merged.payee_payment_notes || '').trim() || dup.payee_payment_notes || '',
          party_type:
            normalizePartyType(merged.party_type) === 'supplier' ||
            normalizePartyType(dup.party_type) === 'supplier'
              ? 'supplier'
              : 'customer',
        };
        await db.put('customers', merged);

        const bills = await db.getAll('bills');
        for (const b of bills) {
          if (String(b.customer_name || '').trim().toLowerCase() === String(dup.name || '').trim().toLowerCase()) {
            await db.put('bills', { ...b, customer_name: merged.name });
          }
        }
        const advances = await db.getAll('advances');
        for (const a of advances) {
          if (String(a.client_name || '').trim().toLowerCase() === String(dup.name || '').trim().toLowerCase()) {
            await db.put('advances', { ...a, client_name: merged.name });
          }
        }
        const rates = await db.getAll('rates');
        for (const r of rates) {
          if (r.customer_id !== dupId) continue;
          const existing = rates.find(
            (x) => x.customer_id === primaryId && x.product_id === r.product_id
          );
          if (!existing) {
            const id = await nextId(db, 'rates');
            await db.put('rates', {
              id,
              customer_id: primaryId,
              product_id: r.product_id,
              custom_price: r.custom_price || 0,
            });
          }
          await db.delete('rates', r.id);
        }
        await db.delete('customers', dupId);
      }
      const customer = await db.get('customers', primaryId);
      return jsonOk({ success: true, customer, merged: duplicateIds.length });
    }

    if (parts.length === 2 && method === 'GET') {
      const type = String(search.get('type') || '').trim();
      let customers = await db.getAll('customers');
      if (type === 'customer' || type === 'supplier') {
        customers = customers.filter((c) => normalizePartyType(c.party_type) === type);
      }
      customers.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return jsonOk(customers);
    }
    if (parts.length === 2 && method === 'POST') {
      if (!body.name) return jsonErr('Customer name is required');
      const id = await nextId(db, 'customers');
      const customer = {
        id,
        name: body.name,
        email: body.email || '',
        phone: body.phone || '',
        address: body.address || '',
        tax_id: body.tax_id || '',
        party_type: normalizePartyType(body.party_type),
        payee_bank_name: body.payee_bank_name || '',
        payee_account_title: body.payee_account_title || '',
        payee_account_number: body.payee_account_number || '',
        payee_payment_notes: body.payee_payment_notes || '',
        created_at: new Date().toISOString(),
      };
      await db.put('customers', customer);
      return jsonOk(customer, 201);
    }
    if (parts.length === 3 && method === 'PUT') {
      const id = Number(parts[2]);
      const existing = await db.get('customers', id);
      if (!existing) return jsonErr('Customer not found', 404);
      const customer = {
        ...existing,
        name: body.name ?? existing.name,
        email: body.email ?? existing.email ?? '',
        phone: body.phone ?? existing.phone ?? '',
        address: body.address ?? existing.address ?? '',
        tax_id: body.tax_id ?? existing.tax_id ?? '',
        party_type:
          body.party_type !== undefined
            ? normalizePartyType(body.party_type)
            : normalizePartyType(existing.party_type),
        payee_bank_name: body.payee_bank_name ?? existing.payee_bank_name ?? '',
        payee_account_title: body.payee_account_title ?? existing.payee_account_title ?? '',
        payee_account_number: body.payee_account_number ?? existing.payee_account_number ?? '',
        payee_payment_notes: body.payee_payment_notes ?? existing.payee_payment_notes ?? '',
      };
      await db.put('customers', customer);
      return jsonOk(customer);
    }
    if (parts.length === 3 && method === 'DELETE') {
      const id = Number(parts[2]);
      await db.delete('customers', id);
      const rates = await db.getAll('rates');
      for (const r of rates) {
        if (r.customer_id === id) await db.delete('rates', r.id);
      }
      return jsonOk({ success: true });
    }
    // rates
    if (parts[3] === 'rates') {
      const customerId = Number(parts[2]);
      if (parts.length === 4 && method === 'GET') {
        const products = await db.getAll('products');
        const rates = (await db.getAll('rates'))
          .filter((r) => r.customer_id === customerId)
          .map((r) => {
            const p = products.find((x) => x.id === r.product_id);
            return {
              ...r,
              product_name: p?.name || 'Item',
              standard_price: p?.price || 0,
            };
          });
        return jsonOk(rates);
      }
      if (parts.length === 4 && method === 'POST') {
        const product_id = Number(body.product_id);
        const custom_price = Number(body.custom_price) || 0;
        const existing = (await db.getAll('rates')).find(
          (r) => r.customer_id === customerId && r.product_id === product_id
        );
        if (existing) {
          const updated = { ...existing, custom_price };
          await db.put('rates', updated);
        } else {
          const id = await nextId(db, 'rates');
          const row = {
            id,
            customer_id: customerId,
            product_id,
            custom_price,
            created_at: new Date().toISOString(),
          };
          await db.put('rates', row);
        }
        const products = await db.getAll('products');
        const rates = (await db.getAll('rates'))
          .filter((r) => r.customer_id === customerId)
          .map((r) => {
            const p = products.find((x) => x.id === r.product_id);
            return {
              ...r,
              product_name: p?.name || 'Item',
              standard_price: p?.price || 0,
            };
          });
        return jsonOk(rates, existing ? 200 : 201);
      }
      if (parts.length === 5 && method === 'DELETE') {
        const productId = Number(parts[4]);
        const rates = await db.getAll('rates');
        for (const r of rates) {
          if (r.customer_id === customerId && r.product_id === productId) {
            await db.delete('rates', r.id);
          }
        }
        return jsonOk({ success: true });
      }
    }
  }

  // PRODUCTS
  if (parts[1] === 'products') {
    if (parts.length === 2 && method === 'GET') {
      let products = await db.getAll('products');
      const q = (search.get('q') || '').trim().toLowerCase();
      if (q) {
        products = products.filter(
          (p) =>
            String(p.name || '').toLowerCase().includes(q) ||
            String(p.description || '').toLowerCase().includes(q) ||
            String(p.sku || '').toLowerCase().includes(q)
        );
      }
      products.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      return jsonOk(products);
    }
    if (parts.length === 2 && method === 'POST') {
      if (!body.name) return jsonErr('Product name is required');
      const id = await nextId(db, 'products');
      const product = {
        id,
        name: body.name,
        description: body.description || '',
        price: Number(body.price) || 0,
        unit: body.unit || 'item',
        stock: body.stock ?? 100,
        sku: body.sku || '',
        created_at: new Date().toISOString(),
      };
      await db.put('products', product);
      return jsonOk(product, 201);
    }
    if (parts.length === 3 && method === 'PUT') {
      const id = Number(parts[2]);
      const existing = await db.get('products', id);
      if (!existing) return jsonErr('Product not found', 404);
      const product = {
        ...existing,
        name: body.name ?? existing.name,
        description: body.description ?? existing.description,
        price: body.price ?? existing.price,
        unit: body.unit ?? existing.unit,
        stock: body.stock ?? existing.stock,
        sku: body.sku ?? existing.sku,
      };
      await db.put('products', product);
      return jsonOk(product);
    }
    if (parts.length === 3 && method === 'DELETE') {
      await db.delete('products', Number(parts[2]));
      return jsonOk({ success: true, message: 'Product deleted successfully' });
    }
    if (parts[3] === 'adjust-stock' && method === 'POST') {
      const id = Number(parts[2]);
      const delta = parseInt(body.delta, 10);
      if (Number.isNaN(delta) || delta === 0) return jsonErr('delta must be a non-zero integer');
      const product = await db.get('products', id);
      if (!product) return jsonErr('Product not found', 404);
      const nextStock = Math.max(0, (Number(product.stock) || 0) + delta);
      const updated = { ...product, stock: nextStock };
      await db.put('products', updated);
      const adjId = await nextId(db, 'stock_adjustments');
      await db.put('stock_adjustments', {
        id: adjId,
        product_id: id,
        delta,
        reason: body.reason || 'adjustment',
        notes: body.notes || '',
        created_at: new Date().toISOString(),
      });
      return jsonOk(updated);
    }
  }

  // STOCK ADJUSTMENTS
  if (parts[1] === 'stock-adjustments' && method === 'GET') {
    const products = await db.getAll('products');
    const rows = (await db.getAll('stock_adjustments'))
      .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0))
      .slice(0, 200)
      .map((a) => {
        const p = products.find((x) => x.id === a.product_id);
        return { ...a, product_name: p?.name, sku: p?.sku };
      });
    return jsonOk(rows);
  }

  // BILLS
  if (parts[1] === 'bills') {
    if (parts[2] === 'next-number' && method === 'GET') {
      const type = search.get('type') === 'supplier' ? 'supplier' : 'customer';
      const invoice_number = await generateNextInvoiceNumber(type);
      return jsonOk({ invoice_number });
    }

    if (parts.length === 2 && method === 'GET') {
      let bills = await db.getAll('bills');
      const type = search.get('type');
      const status = search.get('status');
      const q = (search.get('search') || '').trim().toLowerCase();
      if (type && type !== 'all') bills = bills.filter((b) => b.bill_type === type);
      if (status && status !== 'all') bills = bills.filter((b) => b.status === status);
      if (q) {
        bills = bills.filter(
          (b) =>
            String(b.invoice_number || '').toLowerCase().includes(q) ||
            String(b.customer_name || '').toLowerCase().includes(q) ||
            String(b.customer_email || '').toLowerCase().includes(q)
        );
      }
      bills.sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
      const out = [];
      for (const bill of bills) out.push(await attachBillRelations(db, bill));
      return jsonOk(out);
    }

    if (parts.length === 2 && method === 'POST') {
      if (!body.customer_name || !String(body.customer_name).trim()) {
        return jsonErr('Customer or Supplier name is required');
      }
      if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
        return jsonErr('At least one line item is required');
      }
      if (body.items.some((i) => !i || !String(i.description || '').trim())) {
        return jsonErr('Every line item needs a description');
      }

      const bType = body.bill_type === 'supplier' ? 'supplier' : 'customer';
      let invNum =
        body.invoice_number && String(body.invoice_number).trim()
          ? String(body.invoice_number).trim()
          : await generateNextInvoiceNumber(bType);

      const allBills = await db.getAll('bills');
      if (allBills.some((b) => b.invoice_number === invNum)) {
        invNum = await generateNextInvoiceNumber(bType);
      }

      const billId = await nextId(db, 'bills');
      const todayStr = pakistanToday();
      const bill = {
        id: billId,
        bill_type: bType,
        invoice_number: invNum,
        customer_name: String(body.customer_name).trim(),
        customer_email: body.customer_email || '',
        customer_phone: body.customer_phone || '',
        customer_address: body.customer_address || '',
        bill_date: body.bill_date || todayStr,
        due_date: body.due_date || todayStr,
        subtotal: Number(body.subtotal) || 0,
        tax_rate: Number(body.tax_rate) || 0,
        tax_amount: Number(body.tax_amount) || 0,
        discount_rate: Number(body.discount_rate) || 0,
        discount_amount: Number(body.discount_amount) || 0,
        total_amount: Number(body.total_amount) || 0,
        amount_paid: 0,
        status: body.status || 'pending',
        notes: body.notes || '',
        payment_method: body.payment_method || 'Bank Transfer / Raast / Cash',
        payee_bank_name: body.payee_bank_name || '',
        payee_account_title: body.payee_account_title || '',
        payee_account_number: body.payee_account_number || '',
        payee_payment_notes: body.payee_payment_notes || '',
        created_at: new Date().toISOString(),
      };
      await db.put('bills', bill);

      const custName = String(body.customer_name).trim().toLowerCase();
      const allCustomers = await db.getAll('customers');
      const existingCust = allCustomers.find((c) => String(c.name || '').toLowerCase() === custName);
      if (!existingCust) {
        const cid = await nextId(db, 'customers');
        await db.put('customers', {
          id: cid,
          name: String(body.customer_name).trim(),
          email: body.customer_email || '',
          phone: body.customer_phone || '',
          address: body.customer_address || '',
          tax_id: '',
          party_type: bType,
          payee_bank_name: body.payee_bank_name || '',
          payee_account_title: body.payee_account_title || '',
          payee_account_number: body.payee_account_number || '',
          payee_payment_notes: body.payee_payment_notes || '',
          created_at: new Date().toISOString(),
        });
      } else {
        await db.put('customers', {
          ...existingCust,
          party_type: bType,
          payee_bank_name: body.payee_bank_name || existingCust.payee_bank_name || '',
          payee_account_title: body.payee_account_title || existingCust.payee_account_title || '',
          payee_account_number: body.payee_account_number || existingCust.payee_account_number || '',
          payee_payment_notes: body.payee_payment_notes || existingCust.payee_payment_notes || '',
        });
      }

      for (const item of body.items) {
        const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
        const price = Number(item.unit_price) || 0;
        const itemId = await nextId(db, 'bill_items');
        await db.put('bill_items', {
          id: itemId,
          bill_id: billId,
          product_id: item.product_id || null,
          description: String(item.description).trim(),
          quantity: qty,
          unit_price: price,
          total: qty * price,
        });

        if (item.product_id && bType === 'customer') {
          const product = await db.get('products', Number(item.product_id));
          if (product) {
            const nextStock = Math.max(0, (Number(product.stock) || 0) - qty);
            await db.put('products', { ...product, stock: nextStock });
          }
        } else if (item.product_id && bType === 'supplier') {
          const product = await db.get('products', Number(item.product_id));
          if (product) {
            const nextStock = (Number(product.stock) || 0) + qty;
            await db.put('products', { ...product, stock: nextStock });
          }
        }
      }

      return jsonOk(await attachBillRelations(db, bill), 201);
    }

    if (parts.length === 3 && method === 'GET') {
      const bill = await db.get('bills', Number(parts[2]));
      if (!bill) return jsonErr('Bill not found', 404);
      return jsonOk(await attachBillRelations(db, bill));
    }

    if (parts.length === 3 && method === 'PUT') {
      const id = Number(parts[2]);
      const existing = await db.get('bills', id);
      if (!existing) return jsonErr('Bill not found', 404);
      const updated = {
        ...existing,
        bill_type: body.bill_type === 'supplier' ? 'supplier' : body.bill_type || existing.bill_type,
        invoice_number: body.invoice_number ?? existing.invoice_number,
        customer_name: body.customer_name ?? existing.customer_name,
        customer_email: body.customer_email ?? existing.customer_email ?? '',
        customer_phone: body.customer_phone ?? existing.customer_phone ?? '',
        customer_address: body.customer_address ?? existing.customer_address ?? '',
        bill_date: body.bill_date ?? existing.bill_date,
        due_date: body.due_date ?? existing.due_date,
        status: body.status ?? existing.status,
        notes: body.notes ?? existing.notes,
        payment_method: body.payment_method ?? existing.payment_method,
        subtotal: body.subtotal ?? existing.subtotal,
        tax_rate: body.tax_rate ?? existing.tax_rate,
        tax_amount: body.tax_amount ?? existing.tax_amount,
        discount_rate: body.discount_rate ?? existing.discount_rate,
        discount_amount: body.discount_amount ?? existing.discount_amount,
        total_amount: body.total_amount ?? existing.total_amount,
        payee_bank_name: body.payee_bank_name ?? existing.payee_bank_name ?? '',
        payee_account_title: body.payee_account_title ?? existing.payee_account_title ?? '',
        payee_account_number: body.payee_account_number ?? existing.payee_account_number ?? '',
        payee_payment_notes: body.payee_payment_notes ?? existing.payee_payment_notes ?? '',
      };
      await db.put('bills', updated);

      if (Array.isArray(body.items)) {
        const items = await db.getAll('bill_items');
        for (const it of items) {
          if (it.bill_id === id) await db.delete('bill_items', it.id);
        }
        for (const item of body.items) {
          const qty = Number(item.quantity) > 0 ? Number(item.quantity) : 1;
          const price = Number(item.unit_price) || 0;
          const itemId = await nextId(db, 'bill_items');
          await db.put('bill_items', {
            id: itemId,
            bill_id: id,
            product_id: item.product_id || null,
            description: String(item.description || '').trim(),
            quantity: qty,
            unit_price: price,
            total: qty * price,
          });
        }
      }
      return jsonOk(await attachBillRelations(db, updated));
    }

    if (parts.length === 3 && method === 'DELETE') {
      const id = Number(parts[2]);
      for (const store of ['bill_payments', 'bill_items']) {
        const rows = await db.getAll(store);
        for (const r of rows) {
          if (r.bill_id === id) await db.delete(store, r.id);
        }
      }
      await db.delete('bills', id);
      return jsonOk({ success: true, message: 'Bill deleted successfully' });
    }

    if (parts[3] === 'status' && method === 'PUT') {
      const id = Number(parts[2]);
      const status = body.status;
      if (!['paid', 'pending', 'overdue'].includes(status)) return jsonErr('Invalid status');
      const bill = await db.get('bills', id);
      if (!bill) return jsonErr('Bill not found', 404);
      if (status === 'paid') {
        const total = Number(bill.total_amount) || 0;
        const already = Number(bill.amount_paid) || 0;
        const gap = Math.max(0, Math.round((total - already) * 100) / 100);
        if (gap > 0) {
          const payId = await nextId(db, 'bill_payments');
          await db.put('bill_payments', {
            id: payId,
            bill_id: id,
            amount: gap,
            method: bill.payment_method || 'Cash',
            payment_date: pakistanToday(),
            notes: 'Marked paid (full balance)',
            screenshot_data: '',
            created_at: new Date().toISOString(),
          });
        }
        await db.put('bills', { ...bill, status: 'paid', amount_paid: total });
      } else {
        await db.put('bills', { ...bill, status });
      }
      return jsonOk(enrichBill(await db.get('bills', id)));
    }

    if (parts[3] === 'payments' && method === 'POST') {
      const id = Number(parts[2]);
      const amount = Number(body.amount);
      if (!amount || amount <= 0) return jsonErr('Payment amount must be greater than 0');
      const bill = await db.get('bills', id);
      if (!bill) return jsonErr('Bill not found', 404);
      const payId = await nextId(db, 'bill_payments');
      await db.put('bill_payments', {
        id: payId,
        bill_id: id,
        amount,
        method: body.method || 'Cash',
        payment_date: body.payment_date || pakistanToday(),
        notes: body.notes || '',
        screenshot_data: body.screenshot_data || '',
        created_at: new Date().toISOString(),
      });
      return jsonOk(await refreshBillPaidStatus(db, id), 201);
    }

    if (parts[3] === 'payments' && method === 'GET') {
      const id = Number(parts[2]);
      const payments = (await db.getAll('bill_payments'))
        .filter((p) => p.bill_id === id)
        .sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0));
      return jsonOk(payments);
    }
  }

  // STATS
  if (parts[1] === 'stats' && method === 'GET') {
    const bills = await db.getAll('bills');
    const settings = (await db.get('settings', 1)) || DEFAULT_SETTINGS;
    const threshold = Number(settings.low_stock_threshold) || 5;
    const products = await db.getAll('products');
    const paid = bills.filter((b) => b.status === 'paid');
    const pending = bills.filter((b) => b.status === 'pending');
    const overdue = bills.filter((b) => b.status === 'overdue');
    const recent = [...bills].sort((a, b) => (Number(b.id) || 0) - (Number(a.id) || 0)).slice(0, 5);
    return jsonOk({
      total_revenue: paid.reduce((s, b) => s + (Number(b.total_amount) || 0), 0),
      total_pending: pending.reduce((s, b) => s + (Number(b.total_amount) || 0), 0),
      total_overdue: overdue.reduce((s, b) => s + (Number(b.total_amount) || 0), 0),
      total_bills: bills.length,
      paid_bills_count: paid.length,
      pending_bills_count: pending.length,
      overdue_bills_count: overdue.length,
      recent_bills: recent.map(enrichBill),
      low_stock: products
        .filter((p) => Number(p.stock) <= threshold)
        .sort((a, b) => Number(a.stock) - Number(b.stock))
        .slice(0, 20),
      low_stock_threshold: threshold,
    });
  }

  // LEDGER
  if (parts[1] === 'ledger' && method === 'GET') {
    const name = (search.get('name') || '').trim();
    if (!name) return jsonErr('name query is required');
    const bills = (await db.getAll('bills'))
      .filter((b) => b.customer_name === name)
      .sort((a, b) => String(b.bill_date).localeCompare(String(a.bill_date)));
    const advances = (await db.getAll('advances'))
      .filter(
        (a) =>
          String(a.client_name || '').trim().toLowerCase() === name.toLowerCase()
      )
      .map((a) => ({
        ...a,
        remaining: a.remaining == null ? Number(a.amount) || 0 : Number(a.remaining) || 0,
      }));
    const enriched = bills.map(enrichBill);
    const totalBilled = enriched.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
    const totalPaid = enriched.reduce((s, b) => s + (Number(b.amount_paid) || 0), 0);
    const totalAdvance = advances.reduce((s, b) => s + (Number(b.amount) || 0), 0);
    const availableAdvance = advances.reduce((s, b) => s + (Number(b.remaining) || 0), 0);
    return jsonOk({
      customer_name: name,
      bills: enriched,
      advances,
      totals: {
        billed: totalBilled,
        paid: totalPaid,
        advances: totalAdvance,
        available_advance: availableAdvance,
        outstanding: Math.max(0, totalBilled - totalPaid),
        bill_count: bills.length,
      },
    });
  }

  // MONTHLY REPORT
  if (parts[1] === 'reports' && parts[2] === 'monthly' && method === 'GET') {
    const now = new Date();
    const year = parseInt(search.get('year'), 10) || now.getFullYear();
    const month = parseInt(search.get('month'), 10) || now.getMonth() + 1;
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const bills = (await db.getAll('bills'))
      .filter((b) => String(b.bill_date || '').startsWith(prefix))
      .map(enrichBill);
    const sales = bills.filter((b) => b.bill_type !== 'supplier');
    const buying = bills.filter((b) => b.bill_type === 'supplier');
    const salesTotal = sales.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
    const salesPaid = sales.reduce((s, b) => s + (Number(b.amount_paid) || 0), 0);
    const buyingTotal = buying.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
    return jsonOk({
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
      bills,
    });
  }

  // AGING REPORT
  if (parts[1] === 'reports' && parts[2] === 'aging' && method === 'GET') {
    const today = pakistanToday();
    const bills = await db.getAll('bills');
    const buckets = { current: [], d30: [], d60: [], d90: [] };
    const totals = { current: 0, d30: 0, d60: 0, d90: 0, all: 0 };
    const rows = [];
    const dayDiff = (from, to) => {
      const [y1, m1, d1] = String(from).split('-').map(Number);
      const [y2, m2, d2] = String(to).split('-').map(Number);
      if (!y1 || !y2) return 0;
      return Math.floor((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
    };
    for (const raw of bills) {
      if ((raw.bill_type || 'customer') === 'supplier') continue;
      if (raw.status === 'paid') continue;
      const bill = enrichBill({ ...raw });
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
    for (const k of Object.keys(totals)) totals[k] = Math.round(totals[k] * 100) / 100;
    return jsonOk({ today, rows, buckets, totals, count: rows.length });
  }

  // BACKUP
  if (parts[1] === 'backup' && method === 'GET') {
    const payload = {
      exported_at: new Date().toISOString(),
      settings: await db.getAll('settings'),
      customers: await db.getAll('customers'),
      products: await db.getAll('products'),
      bills: await db.getAll('bills'),
      bill_items: await db.getAll('bill_items'),
      bill_payments: await db.getAll('bill_payments'),
      advances: await db.getAll('advances'),
      customer_product_rates: await db.getAll('rates'),
      stock_adjustments: await db.getAll('stock_adjustments'),
    };
    return jsonOk(payload);
  }

  // RESTORE
  if (parts[1] === 'restore' && method === 'POST') {
    const data = body;
    if (!data || typeof data !== 'object') return jsonErr('Invalid backup payload');
    for (const store of [
      'bill_payments',
      'bill_items',
      'bills',
      'stock_adjustments',
      'rates',
      'advances',
      'customers',
      'products',
    ]) {
      await db.clear(store);
    }
    for (const c of data.customers || []) {
      await db.put('customers', {
        ...c,
        party_type: c.party_type === 'supplier' ? 'supplier' : 'customer',
      });
    }
    for (const p of data.products || []) await db.put('products', p);
    for (const b of data.bills || []) await db.put('bills', b);
    for (const i of data.bill_items || []) await db.put('bill_items', i);
    for (const p of data.bill_payments || []) await db.put('bill_payments', p);
    for (const a of data.advances || []) await db.put('advances', a);
    for (const r of data.customer_product_rates || []) await db.put('rates', r);
    for (const s of data.stock_adjustments || []) await db.put('stock_adjustments', s);
    if (data.settings?.[0]) {
      await db.put('settings', { ...DEFAULT_SETTINGS, ...data.settings[0], id: 1 });
    }
    return jsonOk({ success: true, message: 'Backup restored successfully' });
  }

  // CASHFLOW (live from bills + advances — mirrors Express)
  if (parts[1] === 'cashflow' && method === 'GET') {
    const bills = await db.getAll('bills');
    const advances = (await db.getAll('advances')).sort(
      (a, b) => (Number(b.id) || 0) - (Number(a.id) || 0)
    );
    const sales = bills.filter((b) => b.bill_type !== 'supplier');
    const buying = bills.filter((b) => b.bill_type === 'supplier');
    const total_sales = sales.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
    const buying_cost = buying.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
    const paid_sales = sales
      .filter((b) => b.status === 'paid')
      .reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
    const pending_sales = sales
      .filter((b) => b.status === 'pending')
      .reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
    const total_advance = advances.reduce((s, a) => s + (Number(a.amount) || 0), 0);
    const net_profit = total_sales - buying_cost;
    const net_balance = net_profit - total_advance;

    const recent = [...bills].sort((a, b) => {
      const d = String(b.bill_date || '').localeCompare(String(a.bill_date || ''));
      if (d !== 0) return d;
      return (Number(b.id) || 0) - (Number(a.id) || 0);
    }).slice(0, 80);

    const money_flow = recent.map((b) => {
      const isSupplier = b.bill_type === 'supplier';
      const amount = Number(b.total_amount) || 0;
      return {
        id: b.id,
        date: b.bill_date,
        invoice_number: b.invoice_number,
        selling: isSupplier ? 0 : amount,
        buying: isSupplier ? amount : 0,
        expenditure: 0,
        profit: isSupplier ? -amount : amount,
        comment: `${isSupplier ? 'Buying' : 'Sale'} · ${b.customer_name}${b.notes ? ` · ${b.notes}` : ''} (${b.status})`,
        bill_type: b.bill_type || 'customer',
        status: b.status,
      };
    });

    return jsonOk({
      total_sales,
      buying_cost,
      expenditure: 0,
      net_profit,
      total_advance,
      net_balance,
      paid_sales,
      pending_sales,
      advances,
      money_flow,
    });
  }

  return jsonErr(`Local API route not found: ${method} ${url}`, 404);
}
