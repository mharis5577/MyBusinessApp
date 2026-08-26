import { resolveBillExportOptions, DEFAULT_BILL_SEND_PREFS } from './billSendPrefs';

const colorCache = new Map();

/**
 * Chrome/Edge often return getComputedStyle colors as color(srgb …),
 * which html2canvas 1.4.x cannot parse. Normalize to rgb/rgba/hex.
 */
function parseColorNum(raw) {
  const s = String(raw || '').trim();
  if (s.endsWith('%')) return clamp01(parseFloat(s) / 100);
  return clamp01(parseFloat(s));
}

function normalizeCssColor(value) {
  if (!value || typeof value !== 'string') return value;
  const v = value.trim();
  if (!v || v === 'transparent' || v === 'none' || v === 'currentcolor') return v;
  if (!/(?:color|oklch|oklab|lab|lch|color-mix|light-dark)\(/i.test(v)) return v;

  const cached = colorCache.get(v);
  if (cached !== undefined) return cached;

  let result = v
    .replace(/color\([^)]+\)/gi, (match) => {
      const m = match.match(
        /color\(\s*(?:srgb|display-p3|a98-rgb|prophoto-rgb|rec2020|srgb-linear)?\s+([-\+0-9.eE%]+)\s+([-\+0-9.eE%]+)\s+([-\+0-9.eE%]+)(?:\s*\/\s*([-\+0-9.eE%]+))?\)/i
      );
      if (m) {
        const r = Math.round(parseColorNum(m[1]) * 255);
        const g = Math.round(parseColorNum(m[2]) * 255);
        const b = Math.round(parseColorNum(m[3]) * 255);
        const a = m[4] != null ? parseAlpha(m[4]) : 1;
        return a < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
      }
      try {
        const ctx =
          normalizeCssColor._ctx ||
          (normalizeCssColor._ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true }));
        ctx.fillStyle = '#000000';
        ctx.fillStyle = match;
        if (ctx.fillStyle && !/color\(/i.test(ctx.fillStyle)) return ctx.fillStyle;
      } catch {}
      return 'rgba(0, 0, 0, 0.85)';
    })
    .replace(/(?:oklch|oklab|lab|lch|color-mix|light-dark)\([^)]+\)/gi, (match) => {
      try {
        const ctx =
          normalizeCssColor._ctx ||
          (normalizeCssColor._ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true }));
        ctx.fillStyle = '#000000';
        ctx.fillStyle = match;
        if (ctx.fillStyle && !/(?:oklch|oklab|lab|lch|color-mix)\(/i.test(ctx.fillStyle)) return ctx.fillStyle;
      } catch {}
      return 'rgba(0, 0, 0, 0.85)';
    });

  colorCache.set(v, result);
  return result;
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

function wrapComputedStyle(style) {
  if (!style || style.__html2canvasColorPatched) return style;

  return new Proxy(style, {
    get(target, prop) {
      if (prop === '__html2canvasColorPatched') return true;
      if (prop === 'getPropertyValue') {
        return (name) => {
          try {
            return normalizeCssColor(target.getPropertyValue(name));
          } catch {
            return '';
          }
        };
      }
      try {
        const val = target[prop];
        if (typeof val === 'function') {
          return val.bind(target);
        }
        if (typeof val === 'string') {
          return normalizeCssColor(val);
        }
        return val;
      } catch {
        return '';
      }
    },
  });
}

function patchComputedStyleColors(targetWindow) {
  const win = targetWindow || window;
  if (!win || win.__html2canvasColorPatched) return () => {};

  const originalGetComputed = win.getComputedStyle?.bind(win);
  const proto = win.CSSStyleDeclaration?.prototype;
  const originalGetPropVal = proto?.getPropertyValue;

  win.__html2canvasColorPatched = true;

  if (originalGetComputed) {
    win.getComputedStyle = (elt, pseudoElt) => wrapComputedStyle(originalGetComputed(elt, pseudoElt));
  }

  if (proto && originalGetPropVal) {
    proto.getPropertyValue = function (prop) {
      const v = originalGetPropVal.call(this, prop);
      return typeof v === 'string' ? normalizeCssColor(v) : v;
    };
  }

  return () => {
    if (originalGetComputed) win.getComputedStyle = originalGetComputed;
    if (proto && originalGetPropVal) proto.getPropertyValue = originalGetPropVal;
    delete win.__html2canvasColorPatched;
  };
}

function prepareClone(cloned, element, { maxWidth, layoutWidth, clonedDoc } = {}) {
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

  const isStory = cloned.classList.contains('story-card-sheet');
  const isMobilePass = cloned.classList.contains('mc-pass');
  const isThermal = cloned.classList.contains('thermal-sheet');
  const isMbBill = cloned.classList.contains('mb-bill');

  if (isThermal) {
    cloned.style.background = '#ffffff';
    cloned.style.color = '#000000';
    cloned.style.width = '340px';
    cloned.style.maxWidth = '340px';
    cloned.style.margin = '0 auto';
    cloned.style.padding = '14px 16px';
  } else if (isStory) {
    cloned.style.width = '440px';
    cloned.style.maxWidth = '440px';
    cloned.style.margin = '0 auto';
  } else if (isMbBill) {
    cloned.style.background = '#ffffff';
    cloned.style.width = '420px';
    cloned.style.maxWidth = '420px';
    cloned.style.margin = '0 auto';
  } else if (isMobilePass) {
    cloned.style.background = '#ffffff';
    cloned.style.color = '#111111';
    cloned.style.width = '390px';
    cloned.style.maxWidth = '390px';
    cloned.style.margin = '0 auto';
    // Ensure all mobile pass texts are crisp and high contrast
    cloned.querySelectorAll('.mc-meta-txt, .mc-client-name, .mc-item-name, .mc-item-sum, .mc-pay-line').forEach((el) => {
      el.style.color = '#111111';
      el.style.fontWeight = '750';
    });
    cloned.querySelectorAll('.mc-meta-lbl, .mc-client-phone, .mc-item-rate, .mc-ledger-row, .mc-ledger-total-lbl, .mc-footer-note, .mc-footer-contact, .mc-items-heading, .mc-pay-title').forEach((el) => {
      el.style.color = '#374151';
      el.style.fontWeight = '600';
    });
    cloned.querySelectorAll('.mc-meta-item, .mc-item-row, .mc-ledger, .mc-pay-strip').forEach((el) => {
      el.style.background = '#f7f6f2';
      el.style.borderColor = '#dcd8cf';
    });
  } else {
    cloned.style.background = '#ffffff';
    cloned.style.color = '#111111';
    // Ensure all standard invoice text is crisp, deep black & dark slate
    cloned.querySelectorAll('.inv-company-name, .inv-num, .inv-client-name, .inv-table th, .inv-table td, .inv-total-row, .inv-bank-box').forEach((el) => {
      el.style.color = '#111111';
    });
    cloned.querySelectorAll('.inv-meta-label, .inv-client-sub, .inv-notes-text, .inv-footer-center, .inv-item-note').forEach((el) => {
      el.style.color = '#4b5563';
    });
  }

  // Sanitize all inline styles in cloned subtree to prevent html2canvas color() parse failures
  try {
    const all = [cloned, ...cloned.querySelectorAll('*')];
    for (const node of all) {
      if (node.style) {
        const bg = node.style.backgroundImage || node.style.background;
        if (bg && /color\(/i.test(bg)) {
          node.style.backgroundImage = normalizeCssColor(bg);
        }
        const col = node.style.color;
        if (col && /color\(/i.test(col)) {
          node.style.color = normalizeCssColor(col);
        }
        const bcol = node.style.borderColor;
        if (bcol && /color\(/i.test(bcol)) {
          node.style.borderColor = normalizeCssColor(bcol);
        }
      }
    }
  } catch {}

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
      allowTaint: false,
      backgroundColor: '#ffffff',
      logging: false,
      imageTimeout: 3000,
      scale: scale ?? Math.min(2, window.devicePixelRatio || 2),
      ...rest,
      onclone: (clonedDoc, cloned) => {
        if (clonedDoc?.documentElement) {
          clonedDoc.documentElement.setAttribute('data-theme', 'light');
        }
        if (clonedDoc?.body) {
          clonedDoc.body.setAttribute('data-theme', 'light');
        }
        patchComputedStyleColors(clonedDoc.defaultView || window);
        prepareClone(cloned, element, { maxWidth, layoutWidth, clonedDoc });
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
