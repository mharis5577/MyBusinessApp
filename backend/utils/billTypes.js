/** Bill categories: customer sale, Saudia purchase, or personal help / loan. */

export function normalizeBillType(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === 'supplier') return 'supplier';
  if (v === 'help' || v === 'loan') return 'help';
  return 'customer';
}

export function invoicePrefixForType(bType) {
  const t = normalizeBillType(bType);
  if (t === 'supplier') return 'SAU';
  if (t === 'help') return 'HLP';
  return 'INV';
}

export function partyTypeForBill(bType) {
  return normalizeBillType(bType) === 'supplier' ? 'supplier' : 'customer';
}

/** Open balances by party name (lowercase). Help stays separate from sales. */
export function outstandingByPartyName(bills) {
  const map = Object.create(null);
  for (const b of bills || []) {
    if (String(b.status || '').toLowerCase() === 'cancelled') continue;
    const name = String(b.customer_name || '').trim().toLowerCase();
    if (!name) continue;
    const due = Math.max(
      0,
      Number(b.balance_due ?? (Number(b.total_amount) || 0) - (Number(b.amount_paid) || 0))
    );
    if (due <= 0) continue;
    if (!map[name]) {
      map[name] = { sales_outstanding: 0, help_outstanding: 0, buying_outstanding: 0 };
    }
    const t = normalizeBillType(b.bill_type);
    if (t === 'help') map[name].help_outstanding += due;
    else if (t === 'supplier') map[name].buying_outstanding += due;
    else map[name].sales_outstanding += due;
  }
  for (const rec of Object.values(map)) {
    rec.sales_outstanding = Math.round(rec.sales_outstanding * 100) / 100;
    rec.help_outstanding = Math.round(rec.help_outstanding * 100) / 100;
    rec.buying_outstanding = Math.round(rec.buying_outstanding * 100) / 100;
  }
  return map;
}
