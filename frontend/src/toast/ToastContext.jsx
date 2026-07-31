import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { subscribeToasts } from '../utils/toast';

const ToastContext = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setToasts((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message, type = 'info', duration = 3200) => {
      const text = String(message || '').trim();
      if (!text) return;
      const id = ++toastId;
      setToasts((prev) => {
        // Replace stack on mobile-ish: keep last 3
        const next = [...prev, { id, message: text, type }];
        return next.slice(-3);
      });
      const timer = setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
    },
    [dismiss]
  );

  const api = useMemo(
    () => ({
      toast: push,
      success: (m, d) => push(m, 'success', d),
      error: (m, d) => push(m, 'error', d ?? 4200),
      info: (m, d) => push(m, 'info', d),
      dismiss,
    }),
    [push, dismiss]
  );

  useEffect(() => {
    const onElite = (e) => {
      const d = e.detail || {};
      push(d.message || '', d.type || 'info', d.duration);
    };
    window.addEventListener('elite-toast', onElite);
    const unsub = subscribeToasts((t) => {
      push(t.message, t.type, t.duration);
    });
    return () => {
      window.removeEventListener('elite-toast', onElite);
      unsub();
    };
  }, [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-viewport" aria-live="polite" aria-relevant="additions">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} role="status" onClick={() => dismiss(t.id)}>
            <span className="toast-msg">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: (m) => console.log(m),
      success: (m) => console.log(m),
      error: (m) => console.error(m),
      info: (m) => console.log(m),
      dismiss: () => {},
    };
  }
  return ctx;
}
