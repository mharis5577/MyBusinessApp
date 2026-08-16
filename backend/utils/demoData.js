/** Demo/test records created by the old Fill test data helper. */

export function isDemoCustomer(c) {
  const name = String(c?.name || '');
  const email = String(c?.email || '').toLowerCase();
  if (/\(\s*test\s*\)/i.test(name) || /(?:^|\s)test(?:\s|$)/i.test(name)) return true;
  if (/dummy/i.test(name)) return true;
  if (/@example\.com$/.test(email) || email.includes('dummy')) return true;
  if (/al-madina trading/i.test(name)) return true;
  return false;
}

export function isDemoBill(b) {
  const notes = String(b?.notes || '');
  if (/dummy\s+(data|test)/i.test(notes)) return true;
  if (/^TEST\s+[—-]/i.test(notes.trim())) return true;
  return false;
}
