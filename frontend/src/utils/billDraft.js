/** Persist in-progress bill so force-close / tab switch does not lose work. */

const DRAFT_KEY = 'cocoadesk-bill-draft-v1';

export function loadBillDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch {
    return null;
  }
}

export function saveBillDraft(draft) {
  try {
    if (!draft || typeof draft !== 'object') return;
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        ...draft,
        saved_at: new Date().toISOString(),
      })
    );
  } catch (err) {
    console.warn('Could not save bill draft', err);
  }
}

export function clearBillDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/** True when the draft has meaningful shopkeeper input worth restoring. */
export function draftHasContent(draft) {
  if (!draft) return false;
  if (String(draft.customerName || '').trim()) return true;
  if (String(draft.naturalText || '').trim()) return true;
  if (String(draft.notes || '').trim() && draft.notes !== 'Thank you for your order!') return true;
  const items = Array.isArray(draft.items) ? draft.items : [];
  return items.some(
    (it) =>
      String(it?.description || '').trim() ||
      (Number(it?.quantity) || 0) !== 1 ||
      (Number(it?.unit_price) || 0) !== 0 ||
      it?.product_id
  );
}
