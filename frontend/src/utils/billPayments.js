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

export function paymentSummaryText(currencySymbol, bill, paymentAmount = 0) {
  const total = Number(bill?.total_amount) || 0;
  const paid = Number(bill?.amount_paid) || 0;
  const balance = billBalance(bill);
  const remaining = remainingAfterPayment(bill, paymentAmount);
  return {
    total,
    paid,
    balance,
    remaining,
    lines: [
      { label: 'Bill total', value: formatCurrency(currencySymbol, total) },
      { label: 'Already paid', value: formatCurrency(currencySymbol, paid), hide: paid <= 0 },
      { label: 'Balance due', value: formatCurrency(currencySymbol, balance), accent: 'var(--warning)' },
      {
        label: paymentAmount > 0 ? 'Remaining after this payment' : null,
        value: formatCurrency(currencySymbol, remaining),
        accent: remaining <= 0 ? 'var(--success)' : 'var(--danger)',
        hide: !(paymentAmount > 0),
      },
    ].filter((l) => l.label && !l.hide),
  };
}
