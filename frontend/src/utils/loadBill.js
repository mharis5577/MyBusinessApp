import { apiFetch } from '../api/client';

function asBill(bill) {
  if (!bill || typeof bill !== 'object') return bill;
  return {
    ...bill,
    items: Array.isArray(bill.items) ? bill.items : [],
    payments: Array.isArray(bill.payments) ? bill.payments : [],
  };
}

/** List rows may omit line items. Load the full bill before Edit / View / Duplicate. */
export async function loadFullBill(bill) {
  if (!bill?.id) return asBill(bill);
  if (Array.isArray(bill.items) && bill.items.length) return asBill(bill);
  try {
    const res = await apiFetch(`/api/bills/${bill.id}`);
    const data = await res.json();
    if (res.ok && data?.id) return asBill(data);
  } catch {
    /* keep the list row */
  }
  return asBill(bill);
}
