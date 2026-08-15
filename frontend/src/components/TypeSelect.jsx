import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import {
  billTypeBadgeClass,
  billTypeBadgeLabel,
  normalizeBillType,
} from '../utils/billTypes';

const TYPE_OPTIONS = [
  { value: 'customer', label: 'SALE' },
  { value: 'supplier', label: 'SAUDIA BUYING' },
  { value: 'help', label: 'HELP / LOAN' },
];

/**
 * Inline bill-type picker for the bills table (Sale / Saudia / Help).
 */
export default function TypeSelect({ value, onChange, block = false, disabled = false }) {
  const key = normalizeBillType(value);
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
    <div className={`status-dd type-dd${block ? ' is-block' : ''}`} ref={rootRef}>
      <button
        type="button"
        className={`type-badge ${billTypeBadgeClass(key)} status-dd-trigger`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Bill type"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{billTypeBadgeLabel(key)}</span>
        <ChevronDown size={13} className={`status-dd-chevron${open ? ' is-open' : ''}`} aria-hidden />
      </button>
      {open ? (
        <div className="status-dd-menu" role="listbox" aria-label="Set bill type">
          {TYPE_OPTIONS.map((opt) => {
            const active = opt.value === key;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={active}
                className={`status-dd-option type-badge ${billTypeBadgeClass(opt.value)}${active ? ' is-active' : ''}`}
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
