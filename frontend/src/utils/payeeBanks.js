/** Common Pay To banks for Saudia buying / supplier profiles. */
export const PAYEE_BANK_NAMES = [
  'Al Rajhi Bank',
  'Alinma Bank',
  'SNB (Saudi National Bank)',
  'Riyad Bank',
  'Banque Saudi Fransi',
  'SAB (Saudi Awwal Bank)',
  'Meezan Bank',
  'HBL',
  'MCB',
  'UBL',
  'Bank Alfalah',
  'Allied Bank',
];

export const PAYEE_BANK_OTHER = '__other__';

export function payeeBankOptions(extraNames = []) {
  const names = [...PAYEE_BANK_NAMES];
  const seen = new Set(names.map((n) => n.toLowerCase()));
  for (const raw of extraNames) {
    const n = String(raw || '').trim();
    if (!n) continue;
    const key = n.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(n);
  }
  return [
    { value: '', label: 'Select bank…' },
    ...names.map((n) => ({ value: n, label: n })),
    { value: PAYEE_BANK_OTHER, label: 'Other…' },
  ];
}
