/** Pakistan (Asia/Karachi, UTC+5) date & money helpers */

export const PK_TIMEZONE = 'Asia/Karachi';
export const PK_LOCALE = 'en-PK';

/** Today's calendar date in Pakistan as YYYY-MM-DD */
export function pakistanToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: PK_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

/** Add days to a YYYY-MM-DD date string (calendar days, not UTC shift) */
export function addDaysToDateString(dateStr, days) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function formatPkMoney(amount, options = {}) {
  const { minimumFractionDigits = 0, maximumFractionDigits = 2 } = options;
  // en-US grouping avoids en-PK narrow-space artifacts (e.g. "234, 250")
  return Number(amount || 0)
    .toLocaleString('en-US', { minimumFractionDigits, maximumFractionDigits })
    .replace(/[\u00A0\u202F\s]/g, '');
}

/** Currency + amount with a normal space (no weird gaps) */
export function formatCurrency(symbol, amount, options = {}) {
  const sym = String(symbol || 'Rs.').trim();
  return `${sym} ${formatPkMoney(amount, options)}`;
}
