/**
 * Unified API fetch: desktop → Express /api ; APK/local → IndexedDB.
 */
import { handleLocalRequest } from './localStore';

function isNativeCapacitor() {
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function useLocalData() {
  if (import.meta.env.VITE_DATA_MODE === 'local') return true;
  return isNativeCapacitor();
}

function makeResponse(status, data) {
  const bodyText = typeof data === 'string' ? data : JSON.stringify(data);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name) {
        const key = String(name || '').toLowerCase();
        if (key === 'content-type') return 'application/json';
        return null;
      },
    },
    async json() {
      if (typeof data === 'string') {
        try {
          return JSON.parse(data);
        } catch {
          return {};
        }
      }
      return data;
    },
    async text() {
      return bodyText;
    },
  };
}

/**
 * Drop-in replacement for fetch() for /api calls.
 */
export async function apiFetch(url, options = {}) {
  const href = String(url);
  const isApi = href.startsWith('/api') || href.includes('/api/');

  if (isApi && useLocalData()) {
    const result = await handleLocalRequest(href, options);
    // backup endpoint returns JSON; SettingsManager uses res.text() then Blob
    return makeResponse(result.status, result.data);
  }

  return fetch(url, options);
}

export default apiFetch;
