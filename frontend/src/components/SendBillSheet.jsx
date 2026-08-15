import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Share2, Download, MessageSquare, Mail, X, Loader2, Monitor, Smartphone } from 'lucide-react';
import {
  BILL_TARGET_OPTIONS,
  BILL_FORMAT_OPTIONS,
  BILL_SIZE_OPTIONS,
  BILL_QUALITY_OPTIONS,
  loadBillSendPrefs,
  saveBillSendPrefs,
  prefsForTarget,
  resolveBillExportOptions,
} from '../utils/billSendPrefs';

/**
 * Desktop + mobile send sheet: target layout, format, size, quality.
 * Portaled to document.body so it sits above the app shell / bottom nav
 * (not trapped by tab-page transforms).
 */
export default function SendBillSheet({
  open,
  onClose,
  busy = null,
  invoiceLabel = 'Invoice',
  preferredTarget = null,
  onSend,
  onSave,
  onWhatsApp,
  onEmail,
  onTargetPreview,
}) {
  const [prefs, setPrefs] = useState(() => loadBillSendPrefs());

  useEffect(() => {
    if (!open) return undefined;
    let loaded = loadBillSendPrefs();
    if (preferredTarget === 'mobile' || preferredTarget === 'desktop') {
      loaded = prefsForTarget(preferredTarget, loaded);
    }
    setPrefs(loaded);
    onTargetPreview?.(loaded.target || 'mobile');
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, preferredTarget, onTargetPreview]);

  if (!open || typeof document === 'undefined') return null;

  const resolved = resolveBillExportOptions(prefs);
  const working = Boolean(busy);
  const formatLabel = prefs.format === 'pdf' ? 'PDF' : 'JPG';

  const update = (patch) => {
    setPrefs((prev) => saveBillSendPrefs({ ...prev, ...patch }));
  };

  const setTarget = (targetId) => {
    setPrefs((prev) => {
      const next = prefsForTarget(targetId, prev);
      onTargetPreview?.(next.target);
      return next;
    });
  };

  return createPortal(
    <div className="more-menu-overlay send-bill-overlay" onClick={() => !working && onClose?.()} role="presentation">
      <div
        className="more-menu-sheet glass-panel send-bill-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="send-bill-title"
      >
        <div className="send-bill-grab" aria-hidden />
        <div className="send-bill-head">
          <div>
            <h3 id="send-bill-title">Send bill</h3>
            <p className="send-bill-sub">{invoiceLabel}</p>
          </div>
          <button type="button" className="btn-secondary send-bill-close" onClick={onClose} disabled={working} aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <div className="send-bill-body">
          <fieldset className="send-bill-fieldset" disabled={working}>
            <legend>Send for</legend>
            <div className="send-bill-seg" role="radiogroup" aria-label="Send for">
              {BILL_TARGET_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={prefs.target === opt.id}
                  className={`send-bill-seg-btn send-bill-target-btn ${prefs.target === opt.id ? 'is-active' : ''}`}
                  onClick={() => setTarget(opt.id)}
                >
                  {opt.id === 'desktop' ? <Monitor size={16} /> : <Smartphone size={16} />}
                  <span>{opt.label}</span>
                  <small>{opt.hint}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="send-bill-fieldset" disabled={working}>
            <legend>Format</legend>
            <div className="send-bill-seg" role="radiogroup" aria-label="Format">
              {BILL_FORMAT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={prefs.format === opt.id}
                  className={`send-bill-seg-btn ${prefs.format === opt.id ? 'is-active' : ''}`}
                  onClick={() => update({ format: opt.id })}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="send-bill-fieldset" disabled={working}>
            <legend>Size</legend>
            <div className="send-bill-seg send-bill-seg-3" role="radiogroup" aria-label="Size">
              {BILL_SIZE_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={prefs.size === opt.id}
                  className={`send-bill-seg-btn ${prefs.size === opt.id ? 'is-active' : ''}`}
                  onClick={() => update({ size: opt.id })}
                >
                  {opt.label}
                  <small>{opt.hint}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="send-bill-fieldset" disabled={working}>
            <legend>Quality</legend>
            <div className="send-bill-seg send-bill-seg-3" role="radiogroup" aria-label="Quality">
              {BILL_QUALITY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={prefs.quality === opt.id}
                  className={`send-bill-seg-btn ${prefs.quality === opt.id ? 'is-active' : ''}`}
                  onClick={() => update({ quality: opt.id })}
                >
                  {opt.label}
                  <small>{opt.hint}</small>
                </button>
              ))}
            </div>
          </fieldset>

          <p className="send-bill-hint">
            {prefs.target === 'desktop' ? 'Desktop' : 'Mobile'} · {formatLabel} ·{' '}
            {prefs.size === 'compact' ? 'Compact' : prefs.size === 'large' ? 'Large' : 'Standard'} ·{' '}
            {prefs.quality === 'economy' ? 'Economy' : prefs.quality === 'best' ? 'Best' : 'Balanced'}
            {' · '}
            {resolved.maxWidth}px
            {prefs.format === 'image' ? ` · ~${Math.round(resolved.quality * 100)}%` : ''}
            {prefs.target === 'desktop' ? ' · A4 page' : ' · phone card'}
          </p>
        </div>

        <div className="send-bill-actions">
          <button type="button" className="btn-primary" disabled={working} onClick={() => onSend?.(prefs)}>
            {busy === 'send' ? <Loader2 size={16} className="spin" /> : <Share2 size={16} />}
            Send
          </button>
          <button type="button" className="btn-secondary" disabled={working} onClick={() => onSave?.(prefs)}>
            {busy === 'save' ? <Loader2 size={16} className="spin" /> : <Download size={16} />}
            Save
          </button>
          <button type="button" className="btn-secondary send-bill-wa" disabled={working} onClick={() => onWhatsApp?.(prefs)}>
            {busy === 'whatsapp' ? <Loader2 size={16} className="spin" /> : <MessageSquare size={16} />}
            WhatsApp
          </button>
          <button type="button" className="btn-secondary" disabled={working} onClick={() => onEmail?.(prefs)}>
            {busy === 'email' ? <Loader2 size={16} className="spin" /> : <Mail size={16} />}
            Email
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
