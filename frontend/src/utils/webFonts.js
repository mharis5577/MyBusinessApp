const UI_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Roboto:wght@400;500;700&family=Roboto+Mono:wght@500;700&display=swap';
const URDU_FONTS_HREF =
  'https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;600;700&display=swap';

const LOAD_MS = 4500;

export function looksOnline() {
  try {
    if (navigator.onLine === false) return false;
  } catch {
    /* ignore */
  }
  return true;
}

function injectStylesheet(id, href) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(false);
      return;
    }
    const existing = document.getElementById(id);
    if (existing) {
      resolve(true);
      return;
    }
    const link = document.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = href;
    link.crossOrigin = 'anonymous';
    const timer = setTimeout(() => {
      if (!link.sheet) {
        try {
          link.remove();
        } catch {
          /* ignore */
        }
        resolve(false);
      }
    }, LOAD_MS);
    link.onload = () => {
      clearTimeout(timer);
      resolve(true);
    };
    link.onerror = () => {
      clearTimeout(timer);
      try {
        link.remove();
      } catch {
        /* ignore */
      }
      resolve(false);
    };
    document.head.appendChild(link);
  });
}

function markOnlineUiFonts() {
  try {
    document.documentElement.classList.add('fonts-online');
  } catch {
    /* ignore */
  }
}

/** Outfit is always bundled. Google fonts only after first paint, if the network answers. */
export function loadOnlineUiFonts() {
  if (typeof window === 'undefined') return;
  const tryLoad = () => {
    if (!looksOnline()) return;
    injectStylesheet('font-gads', UI_FONTS_HREF).then((ok) => {
      if (ok) markOnlineUiFonts();
    });
  };
  const start = () => setTimeout(tryLoad, 700);
  if (document.readyState === 'complete') start();
  else window.addEventListener('load', start, { once: true });
  window.addEventListener('online', tryLoad);
}

export function ensureUrduFont() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('font-urdu')) return;
  if (!looksOnline()) return;
  injectStylesheet('font-urdu', URDU_FONTS_HREF);
}
