import { formatCurrency } from './pakistan';

export function billBalance(bill) {
  const total = Number(bill?.total_amount) || 0;
  const paid = Number(bill?.amount_paid) || 0;
  return Math.max(0, Math.round((total - paid) * 100) / 100);
}

export function remainingAfterPayment(bill, paymentAmount) {
  const balance = billBalance(bill);
  const pay = Number(paymentAmount) || 0;
  return Math.max(0, Math.round((balance - pay) * 100) / 100);
}

/** Simple figures for payment UI (shop-friendly). */
export function paymentSummaryText(currencySymbol, bill, paymentAmount = 0) {
  const total = Number(bill?.total_amount) || 0;
  const paid = Number(bill?.amount_paid) || 0;
  const balance = billBalance(bill);
  const remaining = remainingAfterPayment(bill, paymentAmount);
  const pay = Number(paymentAmount) || 0;
  return {
    total,
    paid,
    balance,
    remaining,
    pay,
    dueLabel: formatCurrency(currencySymbol, balance),
    paidLabel: formatCurrency(currencySymbol, paid),
    totalLabel: formatCurrency(currencySymbol, total),
    leftLabel: formatCurrency(currencySymbol, remaining),
    /** @deprecated prefer due/left fields — kept for any old callers */
    lines: [
      { label: 'Due now', value: formatCurrency(currencySymbol, balance), accent: 'var(--warning)' },
      {
        label: pay > 0 ? 'Left after save' : null,
        value: formatCurrency(currencySymbol, remaining),
        accent: remaining <= 0 ? 'var(--success)' : 'var(--text-primary)',
        hide: !(pay > 0),
      },
    ].filter((l) => l.label && !l.hide),
  };
}
