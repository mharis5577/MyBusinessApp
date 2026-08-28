import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { openDB, deleteDB } from 'idb';
import { __testables } from './localStore';

const { withTx, withRestoredIds, settingsWithoutSecrets } = __testables;

let dbCount = 0;

describe('withRestoredIds', () => {
  it('keeps existing ids untouched', () => {
    expect(withRestoredIds([{ id: 5 }, { id: 9 }]).map((r) => r.id)).toEqual([5, 9]);
  });

  // An id-less row used to start counting at 1 and overwrite a real row with id 1.
  it('never assigns an id that another row already owns', () => {
    const out = withRestoredIds([{ name: 'no-id' }, { id: 1, name: 'real' }]);
    expect(out[0].id).toBe(2);
    expect(out[1].id).toBe(1);
    expect(new Set(out.map((r) => r.id)).size).toBe(2);
  });

  it('gives every id-less row a distinct id', () => {
    const out = withRestoredIds([{}, {}, { id: 3 }]);
    expect(new Set(out.map((r) => r.id)).size).toBe(3);
    expect(out.every((r) => r.id != null)).toBe(true);
  });

  it('drops non-object entries and applies the mapper', () => {
    const out = withRestoredIds([null, 'junk', { id: 1, party_type: 'x' }], (c) => ({
      ...c,
      party_type: 'customer',
    }));
    expect(out).toEqual([{ id: 1, party_type: 'customer' }]);
  });

  it('handles an empty or missing list', () => {
    expect(withRestoredIds([])).toEqual([]);
    expect(withRestoredIds(null)).toEqual([]);
  });
});

describe('settingsWithoutSecrets', () => {
  it('removes the app PIN so it never reaches a backup', () => {
    const [out] = settingsWithoutSecrets([{ id: 1, company_name: 'X', app_pin: 'pbkdf2$secret' }]);
    expect(out).not.toHaveProperty('app_pin');
    expect(out.company_name).toBe('X');
  });

  it('tolerates empty input', () => {
    expect(settingsWithoutSecrets([])).toEqual([]);
    expect(settingsWithoutSecrets(null)).toEqual([]);
  });
});

describe('withTx', () => {
  let db;
  let name;

  beforeEach(async () => {
    name = `withtx-spec-${dbCount++}`;
    db = await openDB(name, 1, {
      upgrade(instance) {
        instance.createObjectStore('bills', { keyPath: 'id' });
        instance.createObjectStore('bill_items', { keyPath: 'id' });
      },
    });
  });

  afterEach(async () => {
    db.close();
    await deleteDB(name);
  });

  it('commits every write when the callback resolves', async () => {
    await withTx(db, ['bills', 'bill_items'], async (tx) => {
      await tx.put('bills', { id: 1, total_amount: 100 });
      await tx.put('bill_items', { id: 1, bill_id: 1 });
      await tx.put('bill_items', { id: 2, bill_id: 1 });
    });

    expect(await db.get('bills', 1)).toMatchObject({ total_amount: 100 });
    expect(await db.getAll('bill_items')).toHaveLength(2);
  });

  it('rolls back earlier writes when the callback throws', async () => {
    await db.put('bills', { id: 1, total_amount: 100 });
    await db.put('bill_items', { id: 1, bill_id: 1 });

    // Mirrors the bill PUT path: delete every item, then fail partway through reinsert.
    const attempt = withTx(db, ['bills', 'bill_items'], async (tx) => {
      await tx.put('bills', { id: 1, total_amount: 250 });
      await tx.delete('bill_items', 1);
      await tx.put('bill_items', { id: 2, bill_id: 1 });
      throw new Error('interrupted mid-save');
    });

    await expect(attempt).rejects.toThrow('interrupted mid-save');

    expect(await db.get('bills', 1)).toMatchObject({ total_amount: 100 });
    expect(await db.getAll('bill_items')).toHaveLength(1);
    expect(await db.get('bill_items', 1)).toBeDefined();
  });

  it('reads back its own uncommitted writes', async () => {
    const seen = await withTx(db, ['bills'], async (tx) => {
      await tx.put('bills', { id: 7, total_amount: 42 });
      return tx.get('bills', 7);
    });
    expect(seen).toMatchObject({ total_amount: 42 });
  });

  it('returns the callback result', async () => {
    const out = await withTx(db, ['bills'], async () => 'done');
    expect(out).toBe('done');
  });
});
