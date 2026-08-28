import { describe, it, expect, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false } }));
vi.mock('@capacitor/filesystem', () => ({ Filesystem: {}, Directory: {}, Encoding: {} }));
vi.mock('../api/client', () => ({ apiFetch: vi.fn() }));
vi.mock('./downloadFile', () => ({ downloadBlob: vi.fn(), saveOrShareBlob: vi.fn() }));

const { parseBackupPayload, summarizeBackupPayload } = await import('./backupManager');

const valid = {
  schema_version: 2,
  exported_at: '2026-08-28T00:00:00.000Z',
  bills: [{ id: 1, total_amount: 945 }],
  customers: [{ id: 1, name: 'Ali' }],
  products: [],
  bill_payments: [{ id: 1, bill_id: 1, amount: 945 }],
  partner_settlements: [{ id: 1, bill_id: 1 }],
};

describe('parseBackupPayload', () => {
  it('accepts a well-formed payload', () => {
    expect(parseBackupPayload(valid).bills).toHaveLength(1);
  });

  it('accepts a JSON string and unwraps a payload envelope', () => {
    expect(parseBackupPayload(JSON.stringify({ payload: valid })).bills).toHaveLength(1);
  });

  it('strips a BOM', () => {
    expect(parseBackupPayload(`\uFEFF${JSON.stringify(valid)}`).bills).toHaveLength(1);
  });

  // A payload with only empty arrays previously passed and wiped every store on restore.
  it('rejects an all-empty payload even when exported_at is present', () => {
    expect(() =>
      parseBackupPayload({ bills: [], customers: [], products: [], exported_at: 'x' })
    ).toThrow(/no bills, customers or products/i);
  });

  it('rejects a payload with no shop tables', () => {
    expect(() => parseBackupPayload({ settings: [{ company_name: 'X' }] })).toThrow(/not a CocoaDesk shop backup/i);
  });

  it('rejects non-object records', () => {
    expect(() => parseBackupPayload({ bills: ['nope'] })).toThrow(/damaged/i);
  });

  it('rejects malformed JSON and non-objects', () => {
    expect(() => parseBackupPayload('{ not json')).toThrow(/not valid JSON/i);
    expect(() => parseBackupPayload(42)).toThrow(/Invalid backup file/i);
    expect(() => parseBackupPayload([1, 2])).toThrow();
  });
});

describe('summarizeBackupPayload', () => {
  it('counts each section and reports the schema version', () => {
    expect(summarizeBackupPayload(valid)).toEqual({
      bills: 1,
      customers: 1,
      products: 0,
      payments: 1,
      partners: 1,
      exported_at: '2026-08-28T00:00:00.000Z',
      schema_version: 2,
    });
  });

  it('defaults older payloads to schema 1', () => {
    expect(summarizeBackupPayload({ ...valid, schema_version: undefined }).schema_version).toBe(1);
  });
});
