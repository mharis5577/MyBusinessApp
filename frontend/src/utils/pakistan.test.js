import { describe, it, expect } from 'vitest';
import {
  pakistanToday,
  pakistanNowTime,
  pakistanYearMonth,
  addDaysToDateString,
  getPreviousYearMonth,
  formatBillDateTime,
} from './pakistan';

describe('pakistanToday / pakistanNowTime', () => {
  it('returns an ISO calendar date', () => {
    expect(pakistanToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('returns a 24-hour clock time', () => {
    expect(pakistanNowTime()).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
  });
});

describe('addDaysToDateString', () => {
  it('adds and subtracts days', () => {
    expect(addDaysToDateString('2026-08-28', 14)).toBe('2026-09-11');
    expect(addDaysToDateString('2026-08-28', -28)).toBe('2026-07-31');
    expect(addDaysToDateString('2026-08-28', 0)).toBe('2026-08-28');
  });

  it('rolls over month and year boundaries', () => {
    expect(addDaysToDateString('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysToDateString('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles leap years', () => {
    expect(addDaysToDateString('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDaysToDateString('2026-02-28', 1)).toBe('2026-03-01');
  });
});

describe('pakistanYearMonth', () => {
  it('takes the YYYY-MM prefix', () => {
    expect(pakistanYearMonth('2026-08-28')).toBe('2026-08');
    expect(pakistanYearMonth('')).toBe('');
  });
});

describe('getPreviousYearMonth', () => {
  it('steps back one month across a year boundary', () => {
    expect(getPreviousYearMonth('2026-08')).toBe('2026-07');
    expect(getPreviousYearMonth('2026-01')).toBe('2025-12');
  });

  it('returns empty for junk input', () => {
    expect(getPreviousYearMonth('nope')).toBe('');
  });
});

describe('formatBillDateTime', () => {
  it('joins date and time', () => {
    expect(formatBillDateTime({ bill_date: '2026-08-28', bill_time: '14:35' })).toBe('2026-08-28 · 14:35');
  });

  it('falls back to whichever part exists', () => {
    expect(formatBillDateTime({ bill_date: '2026-08-28' })).toBe('2026-08-28');
    expect(formatBillDateTime({})).toBe('—');
  });
});
