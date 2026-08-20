import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pakistanToday, pakistanNowTime } from '../pakistan.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BACKUPS_DIR = path.resolve(__dirname, '../../backups');

// Ensure backups folder exists
if (!fs.existsSync(BACKUPS_DIR)) {
  try {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  } catch (e) {
    console.error('Failed to create backups directory:', e);
  }
}

/**
 * Generates full JSON backup data and saves timestamped file to disk
 */
export async function performAutoBackup(dbAll) {
  try {
    const today = pakistanToday();
    const time = pakistanNowTime().replace(/:/g, '-');
    const filename = `autobackup_${today}_${time}.json`;
    const filePath = path.join(BACKUPS_DIR, filename);

    const payload = {
      exported_at: new Date().toISOString(),
      backup_type: 'automated_nightly',
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

    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');

    // Clean up older backups (keep last 30 files)
    const files = fs.readdirSync(BACKUPS_DIR)
      .filter((f) => f.startsWith('autobackup_') && f.endsWith('.json'))
      .map((f) => ({ name: f, time: fs.statSync(path.join(BACKUPS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.time - a.time);

    if (files.length > 30) {
      files.slice(30).forEach((file) => {
        try {
          fs.unlinkSync(path.join(BACKUPS_DIR, file.name));
        } catch (_) {}
      });
    }

    return { success: true, filename, filePath, count: files.length };
  } catch (err) {
    console.error('Auto-backup error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Builds the Executive WhatsApp / Telegram Daily Business Summary
 */
export async function generateDailyBrief(dbAll, targetDate = pakistanToday(), currencySymbol = 'Rs.') {
  // 1. Sales Bills today
  const salesBills = await dbAll(
    `SELECT * FROM bills WHERE bill_date = ? AND (bill_type IS NULL OR bill_type = 'customer' OR bill_type = '') AND status != 'cancelled'`,
    [targetDate]
  );
  const totalSales = salesBills.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
  const salesPaid = salesBills.reduce((s, b) => s + (Number(b.amount_paid) || 0), 0);
  const salesDue = Math.max(0, totalSales - salesPaid);

  // 2. Saudia Buying Bills today
  const buyingBills = await dbAll(
    `SELECT * FROM bills WHERE bill_date = ? AND bill_type = 'supplier' AND status != 'cancelled'`,
    [targetDate]
  );
  const totalBuying = buyingBills.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
  const buyingPaid = buyingBills.reduce((s, b) => s + (Number(b.amount_paid) || 0), 0);
  const buyingDue = Math.max(0, totalBuying - buyingPaid);

  // 3. Daily Net Operating Profit = Sales - Buying
  const netDailyProfit = totalSales - totalBuying;
  const profitMarginPct = totalSales > 0 ? ((netDailyProfit / totalSales) * 100).toFixed(1) : '0.0';

  // 4. Payments received today (across all bills)
  const paymentsToday = await dbAll(
    `SELECT bp.*, b.bill_type, b.customer_name FROM bill_payments bp 
     JOIN bills b ON bp.bill_id = b.id 
     WHERE bp.payment_date = ? AND (b.status != 'cancelled' OR b.status IS NULL)`,
    [targetDate]
  );
  const totalCashCollected = paymentsToday
    .filter((p) => p.bill_type !== 'supplier' && p.bill_type !== 'help' && p.bill_type !== 'loan')
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  // 5. Total pending overdue collections in the system
  const overdueBills = await dbAll(
    `SELECT * FROM bills 
     WHERE (bill_type IS NULL OR bill_type = 'customer' OR bill_type = '') 
       AND status != 'cancelled' 
       AND (total_amount - amount_paid) > 0 
       AND due_date IS NOT NULL AND due_date < ?`,
    [targetDate]
  );
  const totalOverdueAmount = overdueBills.reduce((s, b) => s + Math.max(0, (Number(b.total_amount) || 0) - (Number(b.amount_paid) || 0)), 0);

  const formattedSales = `${currencySymbol} ${totalSales.toLocaleString('en-PK')}`;
  const formattedBuying = `${currencySymbol} ${totalBuying.toLocaleString('en-PK')}`;
  const formattedProfit = `${currencySymbol} ${netDailyProfit.toLocaleString('en-PK')}`;
  const formattedCollections = `${currencySymbol} ${totalCashCollected.toLocaleString('en-PK')}`;
  const formattedOverdue = `${currencySymbol} ${totalOverdueAmount.toLocaleString('en-PK')}`;

  // Formatted WhatsApp Text
  const messageText = `📊 *DAILY ONLINE BUSINESS REPORT*
📅 *Date:* ${targetDate}
⏰ *Generated:* ${pakistanNowTime()}

━━━━━━━━━━━━━━━━━━━━
📈 *Online Sales:* ${formattedSales} (${salesBills.length} orders)
📦 *Saudia Purchases:* ${formattedBuying} (${buyingBills.length} bills)
💰 *Net Daily Profit:* ${formattedProfit} (${profitMarginPct}% margin)
━━━━━━━━━━━━━━━━━━━━
💵 *Collections Received:* ${formattedCollections}
⏳ *Overdue Dues Pending:* ${formattedOverdue} (${overdueBills.length} client bills)

✅ *Accounting Status:* Accrual & Online-first reconciled.`;

  return {
    date: targetDate,
    time: pakistanNowTime(),
    metrics: {
      totalSales,
      salesCount: salesBills.length,
      totalBuying,
      buyingCount: buyingBills.length,
      netDailyProfit,
      profitMarginPct,
      totalCashCollected,
      totalOverdueAmount,
      overdueCount: overdueBills.length,
    },
    messageText,
  };
}

/**
 * Scans all unpaid bills and builds an actionable reminder queue
 */
export async function getOverdueQueue(dbAll, currencySymbol = 'Rs.') {
  const today = pakistanToday();
  const rows = await dbAll(
    `SELECT b.*, c.phone as client_phone, c.email as client_email 
     FROM bills b 
     LEFT JOIN customers c ON b.customer_id = c.id 
     WHERE (b.bill_type IS NULL OR b.bill_type = 'customer' OR b.bill_type = '') 
       AND b.status != 'cancelled' 
       AND (b.total_amount - b.amount_paid) > 0 
     ORDER BY b.bill_date ASC`
  );

  return rows.map((b) => {
    const balance = Math.max(0, (Number(b.total_amount) || 0) - (Number(b.amount_paid) || 0));
    const isPastDue = b.due_date && b.due_date < today;
    const daysOverdue = b.due_date
      ? Math.max(0, Math.floor((new Date(today) - new Date(b.due_date)) / (1000 * 60 * 60 * 24)))
      : 0;

    const reminderText = `Assalam o Alaikum ${b.customer_name},

Gentle payment reminder regarding invoice *${b.invoice_number}* dated ${b.bill_date}.
• Outstanding Balance: *${currencySymbol} ${balance.toLocaleString('en-PK')}*
${b.due_date ? `• Due Date: ${b.due_date} (${daysOverdue} days past due)\n` : ''}
Please kindly share the payment transfer screenshot once processed. Thank you!`;

    return {
      bill_id: b.id,
      invoice_number: b.invoice_number,
      customer_name: b.customer_name,
      phone: b.client_phone || b.customer_phone,
      total_amount: Number(b.total_amount),
      amount_paid: Number(b.amount_paid),
      balance_due: balance,
      bill_date: b.bill_date,
      due_date: b.due_date,
      days_overdue: daysOverdue,
      is_past_due: isPastDue,
      reminder_text: reminderText,
    };
  });
}
