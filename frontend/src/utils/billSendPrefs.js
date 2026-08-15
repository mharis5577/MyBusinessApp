const STORAGE_KEY = 'cocoadesk-bill-send-prefs';

/** Who the bill is being prepared for — changes layout + default size. */
export const BILL_TARGET_OPTIONS = [
  {
    id: 'desktop',
    label: 'Desktop',
    hint: 'Full A4 page',
    layout: 'a4',
    defaultSize: 'large',
    layoutWidth: 820,
  },
  {
    id: 'mobile',
    label: 'Mobile',
    hint: 'Phone-size card',
    layout: 'phone',
    defaultSize: 'compact',
    layoutWidth: 390,
  },
];

/** Capture width / sharpness for sharing bills. */
export const BILL_SIZE_OPTIONS = [
  {
    id: 'compact',
    label: 'Compact',
    hint: 'Fast WhatsApp',
    maxWidth: 720,
    scale: 1.45,
  },
  {
    id: 'standard',
    label: 'Standard',
    hint: 'Most chats',
    maxWidth: 1080,
    scale: 1.85,
  },
  {
    id: 'large',
    label: 'Large',
    hint: 'Print / email',
    maxWidth: 1600,
    scale: 2.5,
  },
];

/** JPEG / PDF embed quality. */
export const BILL_QUALITY_OPTIONS = [
  { id: 'economy', label: 'Economy', hint: 'Smaller file', jpegQuality: 0.72, pdfJpegQuality: 0.78 },
  { id: 'balanced', label: 'Balanced', hint: 'Recommended', jpegQuality: 0.88, pdfJpegQuality: 0.9 },
  { id: 'best', label: 'Best', hint: 'Sharper, larger', jpegQuality: 0.95, pdfJpegQuality: 0.95 },
];

export const BILL_FORMAT_OPTIONS = [
  { id: 'image', label: 'Photo (JPG)', ext: 'jpg', mime: 'image/jpeg' },
  { id: 'pdf', label: 'PDF', ext: 'pdf', mime: 'application/pdf' },
];

export const DEFAULT_BILL_SEND_PREFS = {
  target: 'mobile',
  format: 'image',
  size: 'compact',
  quality: 'balanced',
};

export function loadBillSendPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BILL_SEND_PREFS };
    const parsed = JSON.parse(raw);
    const target = BILL_TARGET_OPTIONS.some((o) => o.id === parsed.target)
      ? parsed.target
      : DEFAULT_BILL_SEND_PREFS.target;
    return {
      target,
      format: BILL_FORMAT_OPTIONS.some((o) => o.id === parsed.format) ? parsed.format : DEFAULT_BILL_SEND_PREFS.format,
      size: BILL_SIZE_OPTIONS.some((o) => o.id === parsed.size) ? parsed.size : DEFAULT_BILL_SEND_PREFS.size,
      quality: BILL_QUALITY_OPTIONS.some((o) => o.id === parsed.quality)
        ? parsed.quality
        : DEFAULT_BILL_SEND_PREFS.quality,
    };
  } catch {
    return { ...DEFAULT_BILL_SEND_PREFS };
  }
}

export function saveBillSendPrefs(prefs) {
  const next = {
    target: prefs.target || DEFAULT_BILL_SEND_PREFS.target,
    format: prefs.format || DEFAULT_BILL_SEND_PREFS.format,
    size: prefs.size || DEFAULT_BILL_SEND_PREFS.size,
    quality: prefs.quality || DEFAULT_BILL_SEND_PREFS.quality,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

/** When switching Desktop/Mobile, apply the matching default size. */
export function prefsForTarget(targetId, prev = {}) {
  const target = BILL_TARGET_OPTIONS.find((o) => o.id === targetId) || BILL_TARGET_OPTIONS[1];
  return saveBillSendPrefs({
    ...prev,
    target: target.id,
    size: target.defaultSize,
    // Mobile shares work best as JPG; desktop often wants PDF
    format: target.id === 'desktop' ? prev.format || 'pdf' : 'image',
  });
}

export function resolveBillExportOptions(prefs = DEFAULT_BILL_SEND_PREFS) {
  const target = BILL_TARGET_OPTIONS.find((o) => o.id === prefs.target) || BILL_TARGET_OPTIONS[1];
  const size = BILL_SIZE_OPTIONS.find((o) => o.id === prefs.size) || BILL_SIZE_OPTIONS[0];
  const quality = BILL_QUALITY_OPTIONS.find((o) => o.id === prefs.quality) || BILL_QUALITY_OPTIONS[1];
  const format = BILL_FORMAT_OPTIONS.find((o) => o.id === prefs.format) || BILL_FORMAT_OPTIONS[0];

  // Mobile: keep export narrow so it reads as a phone card, not A4
  const maxWidth =
    target.layout === 'phone' ? Math.min(size.maxWidth, 900) : size.maxWidth;

  return {
    target: target.id,
    targetLabel: target.label,
    layout: target.layout,
    layoutWidth: target.layoutWidth,
    format: format.id,
    ext: format.ext,
    mime: format.mime,
    scale: size.scale,
    maxWidth,
    jpegQuality: quality.jpegQuality,
    pdfJpegQuality: quality.pdfJpegQuality,
    sizeLabel: size.label,
    qualityLabel: quality.label,
  };
}
