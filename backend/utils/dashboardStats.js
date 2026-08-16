import { normalizeBillType } from './billTypes.js';

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function daysBetween(from, to) {
  const [y1, m1, d1] = String(from || '').split('-').map(Number);
  const [y2, m2, d2] = String(to || '').split('-').map(Number);
  if (!y1 || !y2) return 0;
  return Math.floor((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

function isPastDue(bill, today) {
  const anchor = bill.due_date || bill.bill_date || today;
  const days = Math.max(0, daysBetween(anchor, today));
  return days >= 1 || String(bill.status || '').toLowerCase() === 'overdue';
}

/** Customer-sale totals for Dashboard Overview (mirrors frontend/src/utils/dashboardStats.js). */
export function saleOverviewTotals(bills, today) {
  let collected = 0;
  let due = 0;
  let overdue = 0;
  let saleCount = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let overdueCount = 0;

  for (const bill of bills || []) {
    if (String(bill.status || '').toLowerCase() === 'cancelled') continue;
    if (normalizeBillType(bill.bill_type) !== 'customer') continue;
    saleCount += 1;
    const paid = Number(bill.amount_paid) || 0;
    const total = Number(bill.total_amount) || 0;
    collected += paid;
    const balance = Math.max(0, roundMoney(total - paid));
    if (balance <= 0) {
      paidCount += 1;
      continue;
    }
    if (isPastDue(bill, today)) {
      overdue += balance;
      overdueCount += 1;
    } else {
      due += balance;
      pendingCount += 1;
    }
  }

  return {
    total_revenue: roundMoney(collected),
    total_pending: roundMoney(due),
    total_overdue: roundMoney(overdue),
    sales_bills_count: saleCount,
    paid_bills_count: paidCount,
    pending_bills_count: pendingCount,
    overdue_bills_count: overdueCount,
  };
}
