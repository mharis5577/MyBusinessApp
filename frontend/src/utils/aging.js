import { pakistanToday } from './pakistan';

/** Calendar days from dateA to dateB (YYYY-MM-DD). Positive if B is after A. */
export function daysBetween(dateA, dateB) {
  const parse = (s) => {
    const [y, m, d] = String(s || '').split('-').map(Number);
    if (!y || !m || !d) return null;
    return Date.UTC(y, m - 1, d);
  };
  const a = parse(dateA);
  const b = parse(dateB);
  if (a == null || b == null) return 0;
  return Math.floor((b - a) / 86400000);
}

export function bucketForDaysOverdue(days) {
  const d = Math.max(0, Number(days) || 0);
  if (d < 30) return 'current';
  if (d < 60) return 'd30';
  if (d < 90) return 'd60';
  return 'd90';
}

export function enrichAgingBill(bill, today = pakistanToday()) {
  const paid = Number(bill.amount_paid) || 0;
  const total = Number(bill.total_amount) || 0;
  const balance = Number(bill.balance_due ?? Math.max(0, total - paid));
  const anchor = bill.due_date || bill.bill_date || today;
  const days_overdue = Math.max(0, daysBetween(anchor, today));
  return {
    ...bill,
    amount_paid: paid,
    balance_due: Math.round(balance * 100) / 100,
    days_overdue,
    aging_bucket: bucketForDaysOverdue(days_overdue),
  };
}

/** Customer sale bills only with balance due. */
export function buildAgingReport(bills, today = pakistanToday()) {
  const rows = (bills || [])
    .filter((b) => (b.bill_type || 'customer') !== 'supplier')
    .map((b) => enrichAgingBill(b, today))
    .filter((b) => (Number(b.balance_due) || 0) > 0 && b.status !== 'paid')
    .sort((a, b) => b.days_overdue - a.days_overdue || String(a.due_date).localeCompare(String(b.due_date)));

  const buckets = { current: [], d30: [], d60: [], d90: [] };
  const totals = { current: 0, d30: 0, d60: 0, d90: 0, all: 0 };
  for (const r of rows) {
    buckets[r.aging_bucket].push(r);
    totals[r.aging_bucket] += r.balance_due;
    totals.all += r.balance_due;
  }
  for (const k of Object.keys(totals)) {
    totals[k] = Math.round(totals[k] * 100) / 100;
  }
  return { today, rows, buckets, totals, count: rows.length };
}

export function normalizePartyName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}
