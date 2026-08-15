/** Mirror of frontend paymentMethods helpers for Express settings API. */

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

function normalizePaymentMethod(raw, index = 0) {
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

export function serializePaymentMethods(methods, paymentInstructions = '') {
  const list = (Array.isArray(methods) ? methods : [])
    .map((m, i) => normalizePaymentMethod(m, i))
    .filter(methodHasContent);
  const primary = list[0] || {
    label: 'Primary',
    bank_name: '',
    account_title: '',
    account_number: '',
    mobile_wallet: '',
    notes: '',
  };
  return {
    payment_methods: JSON.stringify(list),
    bank_name: primary.bank_name || '',
    account_title: primary.account_title || '',
    account_number: primary.account_number || '',
    mobile_wallet: primary.mobile_wallet || '',
    payment_instructions: String(paymentInstructions || '').trim(),
  };
}

export function withPaymentMethods(settings = {}) {
  if (!settings || typeof settings !== 'object') return settings || {};
  return { ...settings, payment_methods: getPaymentMethods(settings) };
}
