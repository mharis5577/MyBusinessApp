export const INVOICE_TEMPLATES = [
  {
    id: 'classic',
    name: 'Classic Teal',
    tagline: 'Signature clean styling with teal highlights',
    primaryColor: '#00b3a6',
    headerBg: '#faf9f5',
    accentColor: '#0d9488',
    previewBadge: 'Teal',
  },
  {
    id: 'executive',
    name: 'Executive Navy',
    tagline: 'Deep midnight navy header with sapphire accents',
    primaryColor: '#0f172a',
    headerBg: '#0f172a',
    accentColor: '#2563eb',
    previewBadge: 'Navy',
  },
  {
    id: 'emerald',
    name: 'Emerald Luxury',
    tagline: 'Rich forest green with champagne gold touches',
    primaryColor: '#064e3b',
    headerBg: '#064e3b',
    accentColor: '#d97706',
    previewBadge: 'Emerald',
  },
  {
    id: 'minimal',
    name: 'Minimal Monochrome',
    tagline: 'Stark black & white with sleek hairline accents',
    primaryColor: '#18181b',
    headerBg: '#ffffff',
    accentColor: '#27272a',
    previewBadge: 'Minimal',
  },
  {
    id: 'sunset',
    name: 'Sunset Amber',
    tagline: 'Warm amber & coral tones with soft highlights',
    primaryColor: '#c2410c',
    headerBg: '#fff7ed',
    accentColor: '#ea580c',
    previewBadge: 'Amber',
  },
  {
    id: 'crimson',
    name: 'Royal Crimson',
    tagline: 'Regal burgundy with crisp financial accents',
    primaryColor: '#881337',
    headerBg: '#881337',
    accentColor: '#be123c',
    previewBadge: 'Crimson',
  },
];

const TEMPLATE_STORAGE_KEY = 'cocoadesk-invoice-template';

export function loadInvoiceTemplate(fallback = 'classic') {
  try {
    const saved = localStorage.getItem(TEMPLATE_STORAGE_KEY);
    if (saved && INVOICE_TEMPLATES.some((t) => t.id === saved)) {
      return saved;
    }
  } catch {
    /* ignore */
  }
  return fallback || 'classic';
}

export function saveInvoiceTemplate(templateId) {
  try {
    if (INVOICE_TEMPLATES.some((t) => t.id === templateId)) {
      localStorage.setItem(TEMPLATE_STORAGE_KEY, templateId);
    }
  } catch {
    /* ignore */
  }
  return templateId;
}

export function getInvoiceTemplate(id) {
  return INVOICE_TEMPLATES.find((t) => t.id === id) || INVOICE_TEMPLATES[0];
}
