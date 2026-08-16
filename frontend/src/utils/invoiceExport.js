import { resolveBillExportOptions, DEFAULT_BILL_SEND_PREFS } from './billSendPrefs';

/**
 * Chrome/Edge often return getComputedStyle colors as color(srgb …),
 * which html2canvas 1.4.x cannot parse. Normalize to rgb/rgba/hex.
 */
function normalizeCssColor(value) {
  if (!value || typeof value !== 'string') return value;
  const v = value.trim();
  if (!v || v === 'transparent' || v === 'none' || v === 'currentcolor') return v;
  if (!/(?:color|oklch|oklab|lab|lch|color-mix)\(/i.test(v)) return v;

  const srgb = v.match(
    /color\(\s*srgb\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)(?:\s*\/\s*([0-9.eE+%]+))?\)/i
  );
  if (srgb) {
    const r = Math.round(clamp01(parseFloat(srgb[1])) * 255);
    const g = Math.round(clamp01(parseFloat(srgb[2])) * 255);
    const b = Math.round(clamp01(parseFloat(srgb[3])) * 255);
    const a = srgb[4] != null ? parseAlpha(srgb[4]) : 1;
    return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
  }

  try {
    const ctx =
      normalizeCssColor._ctx ||
      (normalizeCssColor._ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true }));
    ctx.fillStyle = '#000000';
    ctx.fillStyle = v;
    const out = ctx.fillStyle;
    if (out && out !== '#000000') return out;
    if (/^(?:#000|#000000|black|rgb\(\s*0\s*,\s*0\s*,\s*0\s*\)|rgba\(\s*0\s*,\s*0\s*,\s*0)/i.test(v)) {
      return out;
    }
  } catch {
    /* fall through */
  }

  return '#111111';
}

function clamp01(n) {
  if (Number.isNaN(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function parseAlpha(raw) {
  const s = String(raw).trim();
  if (s.endsWith('%')) return clamp01(parseFloat(s) / 100);
  return clamp01(parseFloat(s));
}

function toCamelCssName(name) {
  const camel = String(name).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  if (camel.startsWith('Webkit')) return ['webkit' + camel.slice(6), camel];
  if (camel.startsWith('Moz')) return ['moz' + camel.slice(3), camel];
  if (camel.startsWith('Ms')) return ['ms' + camel.slice(2), camel];
  return [camel];
}

function wrapComputedStyle(style) {
  if (!style || style.__html2canvasColorPatched) return style;

  const read = (key) => {
    try {
      if (key === 'cssText' || key === 'parentRule' || key === 'length') {
        return style[key];
      }
      if (typeof key === 'string' && key.includes('-')) {
        return normalizeCssColor(style.getPropertyValue(key));
      }
      const val = style[key];
      return typeof val === 'string' ? normalizeCssColor(val) : val;
    } catch {
      return '';
    }
  };

  const wrapped = {
    __html2canvasColorPatched: true,
    getPropertyValue(name) {
      try {
        return normalizeCssColor(style.getPropertyValue(name));
      } catch {
        return '';
      }
    },
    getPropertyPriority(name) {
      try {
        return style.getPropertyPriority(name);
      } catch {
        return '';
      }
    },
    item(index) {
      try {
        return style.item(index);
      } catch {
        return '';
      }
    },
  };

  Object.defineProperty(wrapped, 'length', {
    enumerable: true,
    get() {
      return style.length;
    },
  });

  const keys = new Set(['cssFloat', 'cssText', 'parentRule', 'float']);
  for (let i = 0; i < style.length; i += 1) {
    const kebab = style.item(i);
    wrapped[i] = kebab;
    if (!kebab) continue;
    keys.add(kebab);
    toCamelCssName(kebab).forEach((n) => keys.add(n));
  }

  let proto = style;
  const skip = new Set([
    'getPropertyValue',
    'getPropertyPriority',
    'item',
    'setProperty',
    'removeProperty',
    'constructor',
    'length',
    '__html2canvasColorPatched',
  ]);
  while (proto && proto !== Object.prototype) {
    Object.getOwnPropertyNames(proto).forEach((name) => {
      if (skip.has(name) || name.startsWith('__')) return;
      try {
        if (typeof style[name] === 'function') return;
      } catch {
        return;
      }
      keys.add(name);
    });
    proto = Object.getPrototypeOf(proto);
  }

  keys.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(wrapped, key)) return;
    Object.defineProperty(wrapped, key, {
      enumerable: true,
      configurable: true,
      get() {
        return read(key);
      },
    });
  });

  return wrapped;
}

function patchComputedStyleColors(targetWindow) {
  const win = targetWindow || window;
  if (!win || win.__html2canvasColorPatched) return () => {};
  const original = win.getComputedStyle.bind(win);
  win.__html2canvasColorPatched = true;
  win.getComputedStyle = (elt, pseudoElt) => wrapComputedStyle(original(elt, pseudoElt));
  return () => {
    win.getComputedStyle = original;
    delete win.__html2canvasColorPatched;
  };
}

function prepareClone(cloned, element, { maxWidth, layoutWidth } = {}) {
  cloned.style.boxShadow = 'none';
  cloned.style.borderRadius = '0';
  cloned.style.maxWidth = 'none';
  const natural = Math.max(element?.scrollWidth || 800, 320);
  const width = layoutWidth ? Math.min(Math.max(layoutWidth, 320), natural || layoutWidth) : natural;
  // For phone layout, force the clone to the phone card width
  cloned.style.width = `${layoutWidth || width}px`;
  if (layoutWidth) {
    cloned.style.maxWidth = `${layoutWidth}px`;
    cloned.style.margin = '0 auto';
  }
  cloned.style.background = '#ffffff';
  cloned.style.color = '#111111';
  void maxWidth;
  cloned.querySelectorAll('img').forEach((img) => {
    if (!img.complete || img.naturalWidth === 0) {
      img.style.display = 'none';
    }
  });
}

function downscaleCanvas(canvas, maxWidth) {
  if (!canvas || !maxWidth || canvas.width <= maxWidth) return canvas;
  const ratio = maxWidth / canvas.width;
  const next = document.createElement('canvas');
  next.width = Math.max(1, Math.round(canvas.width * ratio));
  next.height = Math.max(1, Math.round(canvas.height * ratio));
  const ctx = next.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, next.width, next.height);
  ctx.drawImage(canvas, 0, 0, next.width, next.height);
  return next;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Decode a data URL to the same bytes as toDataURL produced (no re-encode, no fetch). */
function dataUrlToBlob(dataUrl) {
  const text = String(dataUrl || '');
  const comma = text.indexOf(',');
  const header = comma >= 0 ? text.slice(0, comma) : '';
  const payload = (comma >= 0 ? text.slice(comma + 1) : text).replace(/\s/g, '');
  const mime = (header.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4);
  const out = new Uint8Array((padded.length * 3) >> 2);
  let o = 0;
  for (let i = 0; i < padded.length; i += 4) {
    const n =
      (Math.max(0, B64.indexOf(padded[i])) << 18) |
      (Math.max(0, B64.indexOf(padded[i + 1])) << 12) |
      (Math.max(0, B64.indexOf(padded[i + 2])) << 6) |
      Math.max(0, B64.indexOf(padded[i + 3]));
    out[o++] = (n >> 16) & 255;
    if (padded[i + 2] !== '=') out[o++] = (n >> 8) & 255;
    if (padded[i + 3] !== '=') out[o++] = n & 255;
  }
  return new Blob([out.subarray(0, o)], { type: mime });
}

/** Copy onto a same-document canvas so toBlob never hits a cross-realm Illegal invocation. */
function materializeCanvas(source) {
  if (!source || !source.width) return source;
  const next = document.createElement('canvas');
  next.width = source.width;
  next.height = source.height;
  const ctx = next.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, next.width, next.height);
  ctx.drawImage(source, 0, 0);
  return next;
}

function canvasToJpegBlob(canvas, quality = 0.88) {
  const local = materializeCanvas(canvas);
  return new Promise((resolve, reject) => {
    const q = Math.min(1, Math.max(0.4, Number(quality) || 0.88));
    const fromDataUrl = () => {
      try {
        resolve(dataUrlToBlob(local.toDataURL('image/jpeg', q)));
      } catch (err) {
        reject(err);
      }
    };
    try {
      if (typeof local.toBlob === 'function') {
        local.toBlob(
          (b) => {
            if (b) resolve(b);
            else fromDataUrl();
          },
          'image/jpeg',
          q
        );
        return;
      }
      fromDataUrl();
    } catch (err) {
      try {
        fromDataUrl();
      } catch (err2) {
        reject(err2 || err || new Error('Could not create image'));
      }
    }
  });
}

async function captureElement(element, options = {}) {
  const { onclone: userOnclone, scale, layoutWidth, maxWidth, ...rest } = options;
  const restoreWindow = patchComputedStyleColors(window);
  const { default: html2canvas } = await import('html2canvas');
  try {
    return await html2canvas(element, {
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 8000,
      scale: scale ?? Math.min(2, window.devicePixelRatio || 2),
      ...rest,
      onclone: (clonedDoc, cloned) => {
        patchComputedStyleColors(clonedDoc.defaultView || window);
        prepareClone(cloned, element, { maxWidth, layoutWidth });
        userOnclone?.(clonedDoc, cloned);
      },
    });
  } finally {
    restoreWindow();
  }
}

function normalizeExportOpts(opts = {}) {
  if (opts.scale != null || opts.jpegQuality != null || opts.maxWidth != null || opts.layoutWidth != null) {
    return {
      scale: opts.scale ?? 1.85,
      maxWidth: opts.maxWidth ?? 1080,
      layoutWidth: opts.layoutWidth ?? null,
      layout: opts.layout || 'a4',
      jpegQuality: opts.jpegQuality ?? 0.88,
      pdfJpegQuality: opts.pdfJpegQuality ?? opts.jpegQuality ?? 0.9,
    };
  }
  return resolveBillExportOptions(opts.prefs || DEFAULT_BILL_SEND_PREFS);
}

/**
 * Capture invoice DOM → single A4 PDF blob (scaled to fit width AND height).
 */
export async function elementToPdfBlob(element, { filename = 'Invoice.pdf', ...exportOpts } = {}) {
  if (!element) throw new Error('Invoice preview not ready');
  const opts = normalizeExportOpts(exportOpts);

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  let canvas = await captureElement(element, {
    scale: Math.min(opts.scale, 3),
    maxWidth: opts.maxWidth,
    layoutWidth: opts.layoutWidth,
  });
  canvas = materializeCanvas(downscaleCanvas(canvas, opts.maxWidth));

  if (!canvas.width || !canvas.height) {
    throw new Error('Could not render invoice (empty canvas)');
  }

  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    unit: 'pt',
    format: 'a4',
    orientation: 'portrait',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 28;
  const usableWidth = pageWidth - margin * 2;
  const usableHeight = pageHeight - margin * 2;

  const widthScale = usableWidth / canvas.width;
  const heightScale = usableHeight / canvas.height;
  const scale = Math.min(widthScale, heightScale);
  const imgWidth = canvas.width * scale;
  const imgHeight = canvas.height * scale;
  const x = margin + (usableWidth - imgWidth) / 2;
  const y = margin + (usableHeight - imgHeight) / 2;

  const imgData = canvas.toDataURL('image/jpeg', opts.pdfJpegQuality ?? 0.9);
  pdf.addImage(imgData, 'JPEG', x, y, imgWidth, imgHeight, undefined, 'FAST');

  void filename;
  return pdf.output('blob');
}

export async function elementToJpegBlob(element, exportOpts = {}) {
  if (!element) throw new Error('Invoice preview not ready');
  const opts = normalizeExportOpts(exportOpts);

  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  let canvas = await captureElement(element, {
    scale: Math.min(opts.scale, 3),
    maxWidth: opts.maxWidth,
    layoutWidth: opts.layoutWidth,
    onclone: (_doc, cloned) => {
      cloned.style.color = '#0f172a';
    },
  });
  canvas = materializeCanvas(downscaleCanvas(canvas, opts.maxWidth));

  return canvasToJpegBlob(canvas, opts.jpegQuality ?? 0.88);
}
