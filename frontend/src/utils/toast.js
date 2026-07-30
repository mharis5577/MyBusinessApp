/**
 * Lightweight toast bus — works from React components and plain utils.
 * Usage: toast.success('Saved') / toast.error(msg) / toast.info(msg)
 */
const listeners = new Set();
let seq = 0;

export function subscribeToasts(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(toast) {
  listeners.forEach((fn) => {
    try {
      fn(toast);
    } catch (err) {
      console.warn('Toast listener error', err);
    }
  });
}

export function showToast(message, type = 'info', duration = 3000) {
  const text = String(message || '').trim();
  if (!text) return;
  emit({
    id: ++seq,
    message: text,
    type: type === 'success' || type === 'error' || type === 'info' ? type : 'info',
    duration: Number(duration) > 0 ? Number(duration) : 3000,
  });
}

export const toast = {
  success: (msg, duration) => showToast(msg, 'success', duration),
  error: (msg, duration) => showToast(msg, 'error', duration ?? 4000),
  info: (msg, duration) => showToast(msg, 'info', duration),
};

export default toast;
