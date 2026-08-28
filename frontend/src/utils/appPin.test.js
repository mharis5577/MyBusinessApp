import { describe, it, expect, beforeEach } from 'vitest';
import {
  hashPin,
  verifyPin,
  isHashedPin,
  pinIsSet,
  registerFailedPin,
  clearFailedPins,
  lockoutSecondsRemaining,
} from './appPin';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

describe('hashPin / verifyPin', () => {
  it('never stores the PIN in plain text', async () => {
    const hash = await hashPin('1234');
    expect(hash).not.toContain('1234');
    expect(isHashedPin(hash)).toBe(true);
  });

  it('accepts the correct PIN and rejects wrong ones', async () => {
    const hash = await hashPin('1234');
    expect(await verifyPin('1234', hash)).toBe(true);
    expect(await verifyPin('1235', hash)).toBe(false);
    expect(await verifyPin('', hash)).toBe(false);
  });

  it('salts each hash so the same PIN differs every time', async () => {
    expect(await hashPin('1234')).not.toBe(await hashPin('1234'));
  });

  it('tolerates surrounding whitespace', async () => {
    expect(await verifyPin(' 1234 ', await hashPin('1234'))).toBe(true);
  });

  it('still accepts a legacy plaintext PIN from an older install', async () => {
    expect(await verifyPin('1234', '1234')).toBe(true);
    expect(await verifyPin('9999', '1234')).toBe(false);
  });

  it('treats an empty PIN as unset', async () => {
    expect(await hashPin('')).toBe('');
    expect(await verifyPin('1234', '')).toBe(false);
  });

  it('rejects a malformed hash instead of throwing', async () => {
    expect(await verifyPin('1234', 'pbkdf2$broken')).toBe(false);
  });
});

describe('pinIsSet', () => {
  it('detects whether a PIN is configured', () => {
    expect(pinIsSet({ app_pin: 'x' })).toBe(true);
    expect(pinIsSet({ app_pin: '  ' })).toBe(false);
    expect(pinIsSet({})).toBe(false);
  });
});

describe('attempt throttling', () => {
  beforeEach(() => clearFailedPins());

  it('allows the first few tries without delay', () => {
    expect(lockoutSecondsRemaining()).toBe(0);
    registerFailedPin();
    registerFailedPin();
    expect(lockoutSecondsRemaining()).toBe(0);
  });

  it('locks out after repeated failures and escalates', () => {
    registerFailedPin();
    registerFailedPin();
    const third = registerFailedPin();
    expect(third.lockedForSeconds).toBe(5);
    expect(lockoutSecondsRemaining()).toBeGreaterThan(0);

    const fourth = registerFailedPin();
    expect(fourth.lockedForSeconds).toBeGreaterThan(third.lockedForSeconds);
  });

  it('resets after a successful unlock', () => {
    registerFailedPin();
    registerFailedPin();
    registerFailedPin();
    clearFailedPins();
    expect(lockoutSecondsRemaining()).toBe(0);
  });
});
