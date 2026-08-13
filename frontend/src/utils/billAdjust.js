/** Cancel / return helpers. Cancelled bills stay in history. */

export function isCancelled(bill) {
  return bill?.status === 'cancelled';
}

export function remainingQty(item) {
  return Math.max(0, (Number(item?.quantity) || 0) - (Number(item?.returned_qty) || 0));
}

export function lineEffectiveTotal(item) {
  return Math.round(remainingQty(item) * (Number(item?.unit_price) || 0) * 100) / 100;
}

export function recalcBillTotals(bill, items) {
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

export function allItemsReturned(items) {
  return (items || []).length > 0 && (items || []).every((it) => remainingQty(it) <= 0);
}
