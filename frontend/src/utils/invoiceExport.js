import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
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

function wrapComputedStyle(style) {
  if (!style || style.__html2canvasColorPatched) return style;
  return new Proxy(style, {
    get(target, prop) {
      if (prop === '__html2canvasColorPatched') return true;

      if (prop === 'getPropertyValue') {
        return (name) => {
          try {
            return normalizeCssColor(CSSStyleDeclaration.prototype.getPropertyValue.call(target, name));
          } catch {
            return '';
          }
        };
      }

      if (prop === 'getPropertyPriority') {
        return (name) => {
          try {
            return CSSStyleDeclaration.prototype.getPropertyPriority.call(target, name);
          } catch {
            return '';
          }
        };
      }

      if (prop === 'item') {
        return (index) => {
          try {
            return CSSStyleDeclaration.prototype.item.call(target, index);
          } catch {
            return '';
          }
        };
      }

      // CRITICAL: use `target` as this — Proxy as receiver causes Illegal invocation
      // on native CSSStyleDeclaration getters in Chrome.
      let val;
      try {
        val = Reflect.get(target, prop, target);
      } catch {
        return prop === 'length' ? 0 : '';
      }

      if (typeof val === 'string') return normalizeCssColor(val);
      if (typeof val === 'function') {
        return (...args) => {
          try {
            return val.apply(target, args);
          } catch {
            return undefined;
          }
        };
      }
      return val;
    },
  });
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

function dataUrlToBlob(dataUrl) {
  const parts = String(dataUrl || '').split(',');
  const header = parts[0] || '';
  const data = parts[1] || '';
  const mime = (header.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
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
    try {
      if (typeof local.toBlob === 'function') {
        local.toBlob(
          (b) => {
            if (b) {
              resolve(b);
              return;
            }
            try {
              resolve(dataUrlToBlob(local.toDataURL('image/jpeg', q)));
            } catch (err) {
              reject(err);
            }
          },
          'image/jpeg',
          q
        );
        return;
      }
      resolve(dataUrlToBlob(local.toDataURL('image/jpeg', q)));
    } catch (err) {
      try {
        resolve(dataUrlToBlob(local.toDataURL('image/jpeg', q)));
      } catch (err2) {
        reject(err2 || err || new Error('Could not create image'));
      }
    }
  });
}

async function captureElement(element, options = {}) {
  const { onclone: userOnclone, scale, layoutWidth, maxWidth, ...rest } = options;
  const restoreWindow = patchComputedStyleColors(window);
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
