/** Pakistan (Asia/Karachi) date helper for the API */

export function pakistanToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function pakistanNowTime() {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Karachi',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

export function pakistanYearMonth(dateStr = pakistanToday()) {
  return String(dateStr || '').slice(0, 7);
}
