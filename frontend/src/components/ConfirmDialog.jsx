import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2 } from 'lucide-react';

/**
 * App-styled confirm modal (replaces window.confirm).
 * Portaled to document.body so it sits above bottom nav / tab transforms.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  busy = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return createPortal(
    <div
      className="confirm-dialog-overlay"
      role="presentation"
      onClick={() => {
        if (!busy) onCancel?.();
      }}
    >
      <div
        className="glass-panel confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="confirm-dialog-icon" aria-hidden>
          <AlertTriangle size={22} />
        </div>
        <h3 id="confirm-dialog-title">{title}</h3>
        <p id="confirm-dialog-desc">{message}</p>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn-secondary" disabled={busy} onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={danger ? 'btn-danger confirm-dialog-delete' : 'btn-primary'}
            disabled={busy}
            onClick={onConfirm}
            autoFocus
          >
            {danger ? <Trash2 size={15} /> : null}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
