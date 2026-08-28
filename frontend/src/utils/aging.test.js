import { describe, it, expect } from 'vitest';
import { daysBetween, bucketForDaysOverdue, enrichAgingBill, buildAgingReport } from './aging';

const TODAY = '2026-08-28';

describe('daysBetween', () => {
  it('counts calendar days forward and backward', () => {
    expect(daysBetween('2026-08-01', '2026-08-28')).toBe(27);
    expect(daysBetween('2026-08-28', '2026-08-01')).toBe(-27);
    expect(daysBetween('2026-08-28', '2026-08-28')).toBe(0);
  });

  it('spans year boundaries', () => {
    expect(daysBetween('2025-12-31', '2026-01-01')).toBe(1);
  });

  it('returns 0 for unparseable input', () => {
    expect(daysBetween('', '2026-08-28')).toBe(0);
    expect(daysBetween(null, undefined)).toBe(0);
  });
});

describe('bucketForDaysOverdue', () => {
  it('places days in the right bucket at each boundary', () => {
    expect(bucketForDaysOverdue(0)).toBe('current');
    expect(bucketForDaysOverdue(29)).toBe('current');
    expect(bucketForDaysOverdue(30)).toBe('d30');
    expect(bucketForDaysOverdue(59)).toBe('d30');
    expect(bucketForDaysOverdue(60)).toBe('d60');
    expect(bucketForDaysOverdue(89)).toBe('d60');
    expect(bucketForDaysOverdue(90)).toBe('d90');
  });

  it('treats negative and junk values as current', () => {
    expect(bucketForDaysOverdue(-5)).toBe('current');
    expect(bucketForDaysOverdue('x')).toBe('current');
  });
});

describe('enrichAgingBill', () => {
  it('derives balance and overdue days from the due date', () => {
    const r = enrichAgingBill(
      { total_amount: 1000, amount_paid: 250, due_date: '2026-07-28' },
      TODAY
    );
    expect(r.balance_due).toBe(750);
    expect(r.days_overdue).toBe(31);
    expect(r.aging_bucket).toBe('d30');
  });

  it('never reports negative overdue days for future dues', () => {
    const r = enrichAgingBill({ total_amount: 100, due_date: '2026-12-01' }, TODAY);
    expect(r.days_overdue).toBe(0);
    expect(r.aging_bucket).toBe('current');
  });
});

describe('buildAgingReport', () => {
  const bills = [
    { id: 1, total_amount: 1000, amount_paid: 0, due_date: '2026-08-20', status: 'pending' },
    { id: 2, total_amount: 500, amount_paid: 0, due_date: '2026-05-01', status: 'pending' },
    { id: 3, total_amount: 300, amount_paid: 300, due_date: '2026-06-01', status: 'paid' },
    { id: 4, total_amount: 700, amount_paid: 0, due_date: '2026-06-01', status: 'cancelled' },
    { id: 5, total_amount: 900, amount_paid: 0, due_date: '2026-06-01', status: 'pending', bill_type: 'supplier' },
  ];

  it('keeps only unpaid customer bills', () => {
    const rep = buildAgingReport(bills, TODAY);
    expect(rep.rows.map((r) => r.id)).toEqual([2, 1]);
    expect(rep.count).toBe(2);
  });

  it('totals each bucket and the overall balance', () => {
    const rep = buildAgingReport(bills, TODAY);
    expect(rep.totals.all).toBe(1500);
    expect(rep.totals.current).toBe(1000);
    expect(rep.totals.d90).toBe(500);
    expect(rep.buckets.d90.map((r) => r.id)).toEqual([2]);
  });

  it('sorts most overdue first', () => {
    const rep = buildAgingReport(bills, TODAY);
    expect(rep.rows[0].days_overdue).toBeGreaterThan(rep.rows[1].days_overdue);
  });

  it('handles an empty list', () => {
    const rep = buildAgingReport([], TODAY);
    expect(rep.count).toBe(0);
    expect(rep.totals.all).toBe(0);
  });
});
