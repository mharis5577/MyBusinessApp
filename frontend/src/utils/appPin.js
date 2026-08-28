/**
 * App PIN storage. The PIN is kept only as a salted PBKDF2 hash so it never
 * sits in plain text in IndexedDB, backups, or the cloud vault.
 */

const PBKDF2_ITERATIONS = 150000;
const HASH_PREFIX = 'pbkdf2$';
const ATTEMPTS_KEY = 'elite-pin-attempts';

const enc = new TextEncoder();

function toHex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function subtle() {
  const c = globalThis.crypto?.subtle;
  if (!c) throw new Error('Secure storage is unavailable on this device.');
  return c;
}

export function isHashedPin(value) {
  return typeof value === 'string' && value.startsWith(HASH_PREFIX);
}

export function pinIsSet(settings = {}) {
  return Boolean(settings.app_pin && String(settings.app_pin).trim());
}

async function derive(pin, salt) {
  const key = await subtle().importKey('raw', enc.encode(String(pin)), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
    key,
    256
  );
  return toHex(bits);
}

/** Returns a `pbkdf2$<iterations>$<salt>$<hash>` string safe to persist. */
export async function hashPin(pin) {
  const clean = String(pin ?? '').trim();
  if (!clean) return '';
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(clean, salt);
  return `${HASH_PREFIX}${PBKDF2_ITERATIONS}$${toHex(salt)}$${hash}`;
}

/** Constant-time-ish compare of two equal-length hex strings. */
function hexEquals(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function verifyPin(pin, stored) {
  const clean = String(pin ?? '').trim();
  const target = String(stored ?? '').trim();
  if (!clean || !target) return false;

  // Pre-hash PINs from older installs are compared directly, then upgraded on next save.
  if (!isHashedPin(target)) return clean === target;

  const [, iterations, saltHex, expected] = target.split('$');
  const rounds = Number(iterations);
  if (!rounds || !saltHex || !expected) return false;

  const key = await subtle().importKey('raw', enc.encode(clean), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits(
    { name: 'PBKDF2', salt: fromHex(saltHex), iterations: rounds, hash: 'SHA-256' },
    key,
    256
  );
  return hexEquals(toHex(bits), expected);
}

// --- Attempt throttling -----------------------------------------------------

const LOCKOUT_STEPS = [0, 0, 0, 5, 15, 30, 60, 300];

function readAttempts() {
  try {
    const raw = localStorage.getItem(ATTEMPTS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return { count: Number(parsed?.count) || 0, until: Number(parsed?.until) || 0 };
  } catch {
    return { count: 0, until: 0 };
  }
}

function writeAttempts(state) {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked — throttling degrades, unlock still works */
  }
}

/** Seconds the user must wait, or 0 when an attempt is allowed now. */
export function lockoutSecondsRemaining() {
  const { until } = readAttempts();
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}

export function registerFailedPin() {
  const { count } = readAttempts();
  const next = count + 1;
  const wait = LOCKOUT_STEPS[Math.min(next, LOCKOUT_STEPS.length - 1)];
  writeAttempts({ count: next, until: wait ? Date.now() + wait * 1000 : 0 });
  return { attempts: next, lockedForSeconds: wait };
}

export function clearFailedPins() {
  writeAttempts({ count: 0, until: 0 });
}
