import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, Trash2 } from 'lucide-react';
import useDialog from '../utils/useDialog';

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
  const dialogRef = useDialog(open, onCancel, { closeOnEscape: !busy });

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
        ref={dialogRef}
        className="glass-panel confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        tabIndex={-1}
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
