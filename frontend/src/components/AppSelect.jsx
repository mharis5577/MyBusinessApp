import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';

/**
 * App-styled select — replaces native &lt;select&gt; (no OS blue menu / overflow).
 * options: [{ value, label }] or string[]
 * Menu is portaled so it isn’t clipped by modal overflow.
 */
export default function AppSelect({
  value = '',
  onChange,
  options = [],
  placeholder = 'Select…',
  disabled = false,
  required = false,
  className = '',
  style,
  id,
  'aria-label': ariaLabel,
}) {
  const autoId = useId();
  const selectId = id || autoId;
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [menuBox, setMenuBox] = useState(null);

  const normalized = useMemo(
    () =>
      (options || []).map((opt) =>
        typeof opt === 'string' || typeof opt === 'number'
          ? { value: String(opt), label: String(opt) }
          : { value: String(opt.value), label: String(opt.label ?? opt.value) }
      ),
    [options]
  );

  const selected = normalized.find((o) => o.value === String(value));
  const display = selected?.label || placeholder;
  const isPlaceholder = !selected;

  const placeMenu = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxH = Math.min(256, window.innerHeight * 0.45);
    const spaceBelow = window.innerHeight - rect.bottom - 10;
    const spaceAbove = rect.top - 10;
    const openUp = spaceBelow < Math.min(160, maxH) && spaceAbove > spaceBelow;
    const height = Math.min(maxH, openUp ? spaceAbove : spaceBelow);
    setMenuBox({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - rect.width - 8)),
      width: rect.width,
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      maxHeight: Math.max(120, height),
    });
  };

  useLayoutEffect(() => {
    if (!open) {
      setMenuBox(null);
      return undefined;
    }
    placeMenu();
    const onResize = () => setOpen(false);
    // Close on page/container scroll so the portaled menu doesn’t float over the header.
    // Ignore scrolls inside the menu itself (long option lists).
    const onScroll = (e) => {
      if (menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (rootRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (next) => {
    setOpen(false);
    onChange?.(next);
  };

  return (
    <div
      className={`app-select${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''} ${className}`.trim()}
      ref={rootRef}
      style={style}
    >
      <button
        type="button"
        id={selectId}
        ref={triggerRef}
        className={`app-select-trigger${isPlaceholder ? ' is-placeholder' : ''}`}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-required={required || undefined}
        onClick={() => !disabled && setOpen((v) => !v)}
      >
        <span className="app-select-value">{display}</span>
        <ChevronDown size={16} className={`app-select-chevron${open ? ' is-open' : ''}`} aria-hidden />
      </button>
      {open && menuBox
        ? createPortal(
            <div
              ref={menuRef}
              className="app-select-menu app-select-menu--portal"
              role="listbox"
              aria-labelledby={selectId}
              style={{
                position: 'fixed',
                left: menuBox.left,
                width: menuBox.width,
                top: menuBox.top,
                bottom: menuBox.bottom,
                maxHeight: menuBox.maxHeight,
                zIndex: 10000000,
              }}
            >
              {normalized.map((opt) => {
                const active = opt.value === String(value);
                return (
                  <button
                    key={`${opt.value}::${opt.label}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={`app-select-option${active ? ' is-active' : ''}`}
                    onClick={() => pick(opt.value)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
