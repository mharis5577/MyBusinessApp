/** Pakistan (Asia/Karachi) date helper for the API */

export function pakistanToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function pakistanYearMonth(dateStr = pakistanToday()) {
  return String(dateStr || '').slice(0, 7);
}
