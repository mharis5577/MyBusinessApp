/**
 * Shop payment methods (multiple banks / wallets) on settings.
 * Legacy single bank_* fields are migrated into the array when missing.
 */

export function emptyPaymentMethod(overrides = {}) {
  return {
    id: `pm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label: '',
    bank_name: '',
    account_title: '',
    account_number: '',
    mobile_wallet: '',
    notes: '',
    ...overrides,
  };
}

function parseMethodsJson(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function methodHasContent(m) {
  if (!m || typeof m !== 'object') return false;
  return Boolean(
    String(m.label || '').trim() ||
      String(m.bank_name || '').trim() ||
      String(m.account_title || '').trim() ||
      String(m.account_number || '').trim() ||
      String(m.mobile_wallet || '').trim() ||
      String(m.notes || '').trim()
  );
}

export function normalizePaymentMethod(raw, index = 0) {
  const m = raw && typeof raw === 'object' ? raw : {};
  const label =
    String(m.label || '').trim() ||
    String(m.bank_name || '').trim() ||
    (index === 0 ? 'Primary' : `Option ${index + 1}`);
  return {
    id: String(m.id || `pm_${index + 1}`),
    label,
    bank_name: String(m.bank_name || '').trim(),
    account_title: String(m.account_title || '').trim(),
    account_number: String(m.account_number || '').trim(),
    mobile_wallet: String(m.mobile_wallet || '').trim(),
    notes: String(m.notes || '').trim(),
  };
}

/** Build methods list from settings (JSON column or legacy fields). */
export function getPaymentMethods(settings = {}) {
  const fromJson = parseMethodsJson(settings.payment_methods);
  if (fromJson && fromJson.length) {
    const normalized = fromJson.map((m, i) => normalizePaymentMethod(m, i)).filter(methodHasContent);
    if (normalized.length) return normalized;
  }

  const legacy = normalizePaymentMethod(
    {
      id: 'pm_legacy',
      label: 'Primary',
      bank_name: settings.bank_name,
      account_title: settings.account_title,
      account_number: settings.account_number,
      mobile_wallet: settings.mobile_wallet,
      notes: '',
    },
    0
  );
  return methodHasContent(legacy) ? [legacy] : [];
}

/** Serialize for DB + keep first method mirrored on legacy columns. */
export function serializePaymentMethods(methods, paymentInstructions = '') {
  const list = (Array.isArray(methods) ? methods : [])
    .map((m, i) => normalizePaymentMethod(m, i))
    .filter(methodHasContent);
  const primary = list[0] || emptyPaymentMethod({ label: 'Primary' });
  return {
    payment_methods: JSON.stringify(list),
    bank_name: primary.bank_name || '',
    account_title: primary.account_title || '',
    account_number: primary.account_number || '',
    mobile_wallet: primary.mobile_wallet || '',
    payment_instructions: String(paymentInstructions || '').trim(),
    payment_methods_list: list,
  };
}

/** Enrich settings object for API/UI responses. */
export function withPaymentMethods(settings = {}) {
  const list = getPaymentMethods(settings);
  return {
    ...settings,
    payment_methods: list,
  };
}

function normalizePayId(value) {
  const raw = String(value || '').trim();
  if (!raw) return { display: '', digits: '' };
  // Drop trailing "(Raast / JazzCash…)" noise often typed into the field
  const display = raw.replace(/\s*\([^)]*\)\s*$/, '').trim() || raw;
  const digits = display.replace(/\D/g, '');
  return { display, digits };
}

function samePayDigits(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  return long.endsWith(short) && short.length >= 10;
}

/** Compact printable lines for one payment method (dedupes shared A/C + wallet). */
export function paymentMethodLines(method) {
  if (!method) return [];
  const lines = [];
  const label = String(method.label || '').trim();
  if (label && !/^primary$/i.test(label) && !/^option\s+\d+$/i.test(label)) {
    lines.push(label);
  }

  const bank = String(method.bank_name || '').trim();
  const title = String(method.account_title || '').trim();
  if (bank) lines.push(bank);
  if (title) lines.push(title);

  const ac = normalizePayId(method.account_number);
  const wallet = normalizePayId(method.mobile_wallet);

  if (ac.digits && wallet.digits && samePayDigits(ac.digits, wallet.digits)) {
    lines.push(`${ac.display} · Raast / JazzCash / EasyPaisa`);
  } else {
    if (ac.display) lines.push(`A/C: ${ac.display}`);
    if (wallet.display) lines.push(`Wallet: ${wallet.display}`);
  }

  const notes = String(method.notes || '').trim();
  if (notes) lines.push(notes);
  return lines;
}

/** Drop instruction lines that only repeat a number already listed in methods. */
export function compactPaymentInstructions(instructions, methods = []) {
  const text = String(instructions || '').trim();
  if (!text) return '';

  const known = new Set();
  for (const m of methods) {
    for (const field of [m.account_number, m.mobile_wallet]) {
      const { digits } = normalizePayId(field);
      if (!digits) continue;
      known.add(digits);
      if (digits.length > 10) known.add(digits.slice(-10));
    }
  }

  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => {
      const digits = line.replace(/\D/g, '');
      if (digits.length < 10) return true;
      for (const id of known) {
        if (samePayDigits(id, digits)) return false;
      }
      return true;
    })
    .join('\n');
}
