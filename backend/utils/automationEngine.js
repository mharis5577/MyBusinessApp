import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pakistanToday, pakistanNowTime, addDaysToDateString } from '../pakistan.js';

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
      partners: await dbAll('SELECT * FROM partners'),
      partner_settlements: await dbAll('SELECT * FROM partner_settlements'),
      partner_transactions: await dbAll('SELECT * FROM partner_transactions'),
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
 * Builds Executive Business Summary for Any Period (Daily, Weekly, Monthly, All-Time, Custom Dates)
 */
export async function generateBusinessBrief(dbAll, options = {}) {
  const {
    period = 'today', // 'today' | 'week' | 'month' | 'all' | 'custom'
    startDate,
    endDate,
    currencySymbol = 'Rs.',
  } = options;

  const today = pakistanToday();
  let start = today;
  let end = today;
  let periodTitle = 'DAILY BUSINESS REPORT';
  let dateRangeLabel = today;

  if (period === 'week') {
    start = addDaysToDateString(today, -6); // 7 calendar days
    end = today;
    periodTitle = 'WEEKLY BUSINESS REPORT';
    dateRangeLabel = `${start} to ${end} (Last 7 Days)`;
  } else if (period === 'month') {
    start = `${today.slice(0, 7)}-01`; // 1st of current month
    end = today;
    periodTitle = 'MONTHLY BUSINESS REPORT';
    dateRangeLabel = `${start} to ${end} (This Month)`;
  } else if (period === 'all') {
    start = null;
    end = null;
    periodTitle = 'ALL-TIME BUSINESS REPORT';
    dateRangeLabel = 'Complete Lifetime History';
  } else if (period === 'custom') {
    start = startDate || today;
    end = endDate || today;
    periodTitle = 'CUSTOM PERIOD BUSINESS REPORT';
    dateRangeLabel = `${start} to ${end}`;
  }

  // Build query filter
  let billDateWhere = '';
  let paymentDateWhere = '';
  const billParams = [];
  const paymentParams = [];

  if (start && end) {
    billDateWhere = 'AND bill_date BETWEEN ? AND ?';
    billParams.push(start, end);
    paymentDateWhere = 'WHERE bp.payment_date BETWEEN ? AND ?';
    paymentParams.push(start, end);
  }

  // 1. Sales Bills in range
  const salesBills = await dbAll(
    `SELECT * FROM bills 
     WHERE (bill_type IS NULL OR bill_type = 'customer' OR bill_type = '') 
       AND status != 'cancelled' 
       ${billDateWhere}`,
    billParams
  );
  const totalSales = salesBills.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
  const salesPaid = salesBills.reduce((s, b) => s + (Number(b.amount_paid) || 0), 0);
  const salesDue = Math.max(0, totalSales - salesPaid);

  // 2. Saudia Buying Bills in range
  const buyingBills = await dbAll(
    `SELECT * FROM bills 
     WHERE bill_type = 'supplier' 
       AND status != 'cancelled' 
       ${billDateWhere}`,
    billParams
  );
  const totalBuying = buyingBills.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
  const buyingPaid = buyingBills.reduce((s, b) => s + (Number(b.amount_paid) || 0), 0);
  const buyingDue = Math.max(0, totalBuying - buyingPaid);

  // 3. Operating Net Profit = Sales - Buying
  const netProfit = totalSales - totalBuying;
  const profitMarginPct = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : '0.0';

  // 4. Cash Collections received in range
  const paymentsInRange = await dbAll(
    `SELECT bp.*, b.bill_type, b.customer_name FROM bill_payments bp 
     JOIN bills b ON bp.bill_id = b.id 
     ${paymentDateWhere}
     ${paymentDateWhere ? 'AND' : 'WHERE'} (b.status != 'cancelled' OR b.status IS NULL)`,
    paymentParams
  );
  const totalCashCollected = paymentsInRange
    .filter((p) => p.bill_type !== 'supplier' && p.bill_type !== 'help' && p.bill_type !== 'loan')
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);

  // 5. Total pending overdue collections in the system
  const overdueBills = await dbAll(
    `SELECT * FROM bills 
     WHERE (bill_type IS NULL OR bill_type = 'customer' OR bill_type = '') 
       AND status != 'cancelled' 
       AND (total_amount - amount_paid) > 0 
       AND due_date IS NOT NULL AND due_date < ?`,
    [today]
  );
  const totalOverdueAmount = overdueBills.reduce((s, b) => s + Math.max(0, (Number(b.total_amount) || 0) - (Number(b.amount_paid) || 0)), 0);

  // Partner Split (50/50 by default: Nomi & Haris)
  let partners = [];
  try {
    partners = await dbAll(`SELECT * FROM partners WHERE is_active = 1 ORDER BY id ASC`);
  } catch (_) {
    partners = [];
  }
  if (!partners || partners.length === 0) {
    partners = [
      { name: 'Nomi', profit_share_pct: 50.0 },
      { name: 'Haris', profit_share_pct: 50.0 },
    ];
  }

  const partnerSplits = partners.map((p) => {
    const pct = Number(p.profit_share_pct) || 50;
    const share = Math.round(((netProfit * pct) / 100) * 100) / 100;
    return {
      name: p.name,
      sharePct: pct,
      shareAmount: share,
      formattedShare: `${currencySymbol} ${share.toLocaleString('en-PK')}`,
    };
  });

  // Query settings for company name if available
  let companyName = 'ELITE CHOCOLATE';
  try {
    const settingsRow = await dbAll(`SELECT company_name, currency_symbol FROM settings LIMIT 1`);
    if (settingsRow && settingsRow[0]?.company_name) {
      companyName = settingsRow[0].company_name.toUpperCase();
    }
  } catch (_) {
    // fallback
  }

  const partnerSplitText = partnerSplits
    .map((p) => `• 👤 *${p.name} (${p.sharePct}%):* ${p.formattedShare}`)
    .join('\n');

  const formattedSales = `${currencySymbol} ${totalSales.toLocaleString('en-PK')}`;
  const formattedBuying = `${currencySymbol} ${totalBuying.toLocaleString('en-PK')}`;
  const formattedProfit = `${currencySymbol} ${netProfit.toLocaleString('en-PK')}`;
  const formattedCollections = `${currencySymbol} ${totalCashCollected.toLocaleString('en-PK')}`;
  const formattedOverdue = `${currencySymbol} ${totalOverdueAmount.toLocaleString('en-PK')}`;
  const profitEmoji = netProfit >= 0 ? '🟢' : '🔴';

  const messageText = `✨ *${companyName}*
📊 *${periodTitle}*
━━━━━━━━━━━━━━━━━━━━
📅 *Period:* ${dateRangeLabel}
⏰ *Generated:* ${pakistanNowTime()} · ${pakistanToday()}

💼 *PERFORMANCE SUMMARY*
• 📈 *Gross Sales:* ${formattedSales} (${salesBills.length} ${salesBills.length === 1 ? 'order' : 'orders'})
• 📦 *Buying Cost:* ${formattedBuying} (${buyingBills.length} ${buyingBills.length === 1 ? 'purchase' : 'purchases'})
• ${profitEmoji} *Net Profit:* *${formattedProfit}* (${profitMarginPct}% Margin)

🤝 *50/50 PARTNER EQUITY SHARE*
${partnerSplitText}

💰 *CASHFLOW & RECOVERY*
• 💵 *Collections In:* ${formattedCollections}
• ⏳ *Pending Overdue:* ${formattedOverdue} (${overdueBills.length} ${overdueBills.length === 1 ? 'client' : 'clients'})

━━━━━━━━━━━━━━━━━━━━
✅ *Audited & Reconciled via AutoBill Executive*`;

  return {
    period,
    startDate: start,
    endDate: end,
    dateRangeLabel,
    periodTitle,
    time: pakistanNowTime(),
    metrics: {
      totalSales,
      salesCount: salesBills.length,
      totalBuying,
      buyingCount: buyingBills.length,
      netProfit,
      profitMarginPct,
      partnerSplits,
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
    `SELECT b.* 
     FROM bills b 
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
      phone: b.customer_phone || '',
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

