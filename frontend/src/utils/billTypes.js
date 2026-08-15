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

export function isSupplierBill(typeOrBill) {
  const type = typeOrBill && typeof typeOrBill === 'object' ? typeOrBill.bill_type : typeOrBill;
  return normalizeBillType(type) === 'supplier';
}

export function isHelpBill(typeOrBill) {
  const type = typeOrBill && typeof typeOrBill === 'object' ? typeOrBill.bill_type : typeOrBill;
  return normalizeBillType(type) === 'help';
}

export function isSaleBill(typeOrBill) {
  const type = typeOrBill && typeof typeOrBill === 'object' ? typeOrBill.bill_type : typeOrBill;
  return normalizeBillType(type) === 'customer';
}

export function billTypeBadgeClass(typeOrBill) {
  if (isSupplierBill(typeOrBill)) return 'saudia';
  if (isHelpBill(typeOrBill)) return 'help';
  return 'sale';
}

export function billTypeShortLabel(typeOrBill) {
  if (isSupplierBill(typeOrBill)) return 'Saudia';
  if (isHelpBill(typeOrBill)) return 'Help';
  return 'Sale';
}

export function billTypeBadgeLabel(typeOrBill) {
  if (isSupplierBill(typeOrBill)) return 'SAUDIA BUYING';
  if (isHelpBill(typeOrBill)) return 'HELP / LOAN';
  return 'SALE';
}

export function billTypeFullLabel(typeOrBill) {
  if (isSupplierBill(typeOrBill)) return 'Saudia Purchase / Payment Advice';
  if (isHelpBill(typeOrBill)) return 'Help / loan (give money for a period)';
  return 'Customer Sale Invoice';
}

export function billTypeExportLabel(typeOrBill) {
  if (isSupplierBill(typeOrBill)) return 'Saudia Buying';
  if (isHelpBill(typeOrBill)) return 'Help / Loan';
  return 'Customer Sale';
}

/** Directory party type never uses "help" — people live as customers. */
export function partyTypeForBill(bType) {
  return normalizeBillType(bType) === 'supplier' ? 'supplier' : 'customer';
}

/** Set before navigating to Create so the Help / loan card is selected. */
export const CREATE_BILL_TYPE_KEY = 'cd.createBillType';
/** Set before opening Bills to land on the Help filter. */
export const BILLS_TYPE_FILTER_KEY = 'cd.billTypeFilter';

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

export const HELP_PERIODS = [
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 30, label: '1 month' },
  { days: 60, label: '2 months' },
  { days: 90, label: '3 months' },
];
