import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

const LABELS = {
  paid: 'Paid',
  pending: 'Due',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
  partial: 'Partial',
};

const STATUS_OPTIONS = [
  { value: 'paid', label: 'Paid' },
  { value: 'pending', label: 'Due' },
  { value: 'overdue', label: 'Overdue' },
];

/**
 * Unified bill status chip — Paid teal, Due amber, Overdue red, Cancelled muted.
 */
export default function StatusBadge({ status, className = '' }) {
  const key = String(status || 'pending').toLowerCase();
  const label = LABELS[key] || key;
  return (
    <span className={`badge badge-${key} ${className}`.trim()}>
      {label}
    </span>
  );
}

/**
 * App-styled status picker (replaces native &lt;select&gt;).
 */
export function StatusSelect({ value, onChange, block = false, disabled = false }) {
  const key = String(value || 'pending').toLowerCase();
  const label = LABELS[key] || key;
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScroll = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const pick = (next) => {
    setOpen(false);
    if (next !== key) onChange?.(next);
  };

  return (
    <div className={`status-dd${block ? ' is-block' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`badge badge-${key} status-dd-trigger`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Bill status"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{label}</span>
        <ChevronDown size={13} className={`status-dd-chevron${open ? ' is-open' : ''}`} aria-hidden />
      </button>
      {open ? (
        <div className="status-dd-menu" role="listbox" aria-label="Set bill status">
          {STATUS_OPTIONS.map((opt) => {
            const active = opt.value === key;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={active}
                className={`status-dd-option badge-${opt.value}${active ? ' is-active' : ''}`}
                onClick={() => pick(opt.value)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
