import { describe, it, expect } from 'vitest';
import { recalcBillTotals, remainingQty, lineEffectiveTotal, allItemsReturned, isCancelled } from './billAdjust';

const items = (...lines) => lines.map(([quantity, unit_price, returned_qty = 0]) => ({ quantity, unit_price, returned_qty }));

describe('recalcBillTotals', () => {
  it('sums line items into the subtotal', () => {
    const t = recalcBillTotals({}, items([2, 250], [1, 500]));
    expect(t.subtotal).toBe(1000);
    expect(t.total_amount).toBe(1000);
  });

  it('applies discount before tax', () => {
    const t = recalcBillTotals({ tax_rate: 5, discount_rate: 10 }, items([1, 1000]));
    expect(t.subtotal).toBe(1000);
    expect(t.discount_amount).toBe(100);
    expect(t.tax_amount).toBe(45);
    expect(t.total_amount).toBe(945);
  });

  it('excludes returned quantities', () => {
    const t = recalcBillTotals({}, items([5, 100, 2]));
    expect(t.subtotal).toBe(300);
  });

  it('never returns a negative total when discount exceeds 100%', () => {
    const t = recalcBillTotals({ discount_rate: 150 }, items([1, 1000]));
    expect(t.total_amount).toBe(0);
  });

  it('rounds to 2 decimal places', () => {
    const t = recalcBillTotals({ tax_rate: 17, discount_rate: 3 }, items([3, 33.33]));
    expect(t.total_amount).toBe(Math.round(t.total_amount * 100) / 100);
  });

  it('treats missing rates and items as zero', () => {
    expect(recalcBillTotals({}, []).total_amount).toBe(0);
    expect(recalcBillTotals(null, null).total_amount).toBe(0);
  });

  // Guards the bug where bills saved at one total were re-displayed at another.
  it('is stable when a saved bill is recomputed on read', () => {
    const lines = items([3, 333.33], [1, 1200], [2, 49.99]);
    for (const [tax_rate, discount_rate] of [[0, 0], [5, 10], [17, 3], [17, 0], [0, 25]]) {
      const saved = recalcBillTotals({ tax_rate, discount_rate }, lines);
      const reread = recalcBillTotals({ tax_rate, discount_rate, ...saved }, lines);
      expect(reread).toEqual(saved);
      expect(Math.abs(reread.total_amount - saved.total_amount)).toBeLessThanOrEqual(0.02);
    }
  });
});

describe('remainingQty', () => {
  it('subtracts returned from ordered', () => {
    expect(remainingQty({ quantity: 5, returned_qty: 2 })).toBe(3);
  });

  it('clamps to zero when over-returned', () => {
    expect(remainingQty({ quantity: 2, returned_qty: 5 })).toBe(0);
  });
});

describe('lineEffectiveTotal', () => {
  it('prices only the remaining quantity', () => {
    expect(lineEffectiveTotal({ quantity: 4, returned_qty: 1, unit_price: 250 })).toBe(750);
  });
});

describe('allItemsReturned', () => {
  it('is false for an empty bill', () => {
    expect(allItemsReturned([])).toBe(false);
  });

  it('is true only when every line is fully returned', () => {
    expect(allItemsReturned(items([2, 100, 2], [1, 50, 1]))).toBe(true);
    expect(allItemsReturned(items([2, 100, 2], [1, 50, 0]))).toBe(false);
  });
});

describe('isCancelled', () => {
  it('detects cancelled bills', () => {
    expect(isCancelled({ status: 'cancelled' })).toBe(true);
    expect(isCancelled({ status: 'pending' })).toBe(false);
    expect(isCancelled(null)).toBe(false);
  });
});
