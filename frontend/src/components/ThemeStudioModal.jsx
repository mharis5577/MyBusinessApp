import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, Repeat, Check, X } from 'lucide-react';
import { APP_THEMES, getQuickThemes, saveQuickThemes } from '../utils/themeConfig';
import AppSelect from './AppSelect';
import { useToast } from '../toast/ToastContext';

export default function ThemeStudioModal({ open, onClose, currentTheme, onThemeChange }) {
  const toast = useToast();
  const [quickPair, setQuickPair] = useState(() => getQuickThemes());

  useEffect(() => {
    if (open) {
      setQuickPair(getQuickThemes());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const handleSetQuickSlot = (index, themeId) => {
    const next = [...quickPair];
    next[index] = themeId;
    setQuickPair(next);
    saveQuickThemes(next);
    toast.success(`Header quick-toggle slot ${index + 1} updated to "${APP_THEMES.find((t) => t.id === themeId)?.name}"`);
  };

  const activeThemeObj = APP_THEMES.find((t) => t.id === currentTheme) || APP_THEMES[0];

  return createPortal(
    <div
      className="more-menu-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(8px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      role="presentation"
    >
      <div
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          maxWidth: 540,
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '1.5rem',
          borderRadius: 20,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.45)',
          border: '1px solid var(--border-color)',
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <Sparkles size={20} style={{ color: 'var(--accent-teal)' }} />
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--accent-teal)', margin: 0 }}>
              App UI Theme Studio
            </h3>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            style={{ width: 32, height: 32, padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.65rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Active Theme: <strong style={{ color: 'var(--text-primary)', fontWeight: 800 }}>{activeThemeObj.name}</strong>
          </span>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
            Double-click the sun/moon button anytime to open
          </span>
        </div>

        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '1.1rem', lineHeight: 1.4 }}>
          Tap any theme below to activate it across the app. Choose which 2 themes the top header button switches between.
        </p>

        {/* Quick-Toggle 2-Slot Selector */}
        <div
          style={{
            background: 'var(--surface-muted)',
            border: '1px solid var(--border-color)',
            borderRadius: 14,
            padding: '0.85rem 1rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ fontSize: '0.82rem', fontWeight: 750, color: 'var(--text-primary)', marginBottom: '0.65rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Repeat size={14} style={{ color: 'var(--accent-teal)' }} />
            Header Button Quick-Toggle Pair (Swaps between Slot 1 & 2):
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '0.75rem' }}>
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>
                Slot 1 (Primary Theme)
              </label>
              <AppSelect
                value={quickPair[0]}
                onChange={(val) => handleSetQuickSlot(0, val)}
                options={APP_THEMES.map((t) => ({ value: t.id, label: t.name }))}
              />
            </div>
            <div>
              <label className="form-label" style={{ fontSize: '0.75rem', marginBottom: '0.3rem' }}>
                Slot 2 (Secondary Theme)
              </label>
              <AppSelect
                value={quickPair[1]}
                onChange={(val) => handleSetQuickSlot(1, val)}
                options={APP_THEMES.map((t) => ({ value: t.id, label: t.name }))}
              />
            </div>
          </div>
        </div>

        {/* Theme Gallery Cards */}
        <div className="template-picker-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem' }}>
          {APP_THEMES.map((th) => {
            const active = currentTheme === th.id;
            const isSlot1 = quickPair[0] === th.id;
            const isSlot2 = quickPair[1] === th.id;
            return (
              <button
                key={th.id}
                type="button"
                className={`template-card ${active ? 'is-active' : ''}`}
                onClick={() => {
                  onThemeChange?.(th.id);
                  toast.success(`Theme switched to "${th.name}"`);
                }}
                style={{
                  border: active ? '2px solid var(--accent-teal)' : undefined,
                  boxShadow: active ? '0 0 14px rgba(0, 179, 166, 0.25)' : undefined,
                  textAlign: 'left',
                  padding: '0.85rem',
                }}
              >
                <div className="template-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
                  <div className="template-swatch-badge" style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span
                      className="template-swatch-dot"
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        backgroundColor: th.accent,
                        boxShadow: `0 0 8px ${th.accent}`,
                        display: 'inline-block',
                      }}
                    />
                    <span style={{ fontWeight: active ? 800 : 600, fontSize: '0.88rem' }}>{th.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    {isSlot1 && (
                      <span style={{ fontSize: '0.66rem', background: 'rgba(255,255,255,0.12)', padding: '0.1rem 0.35rem', borderRadius: 4, fontWeight: 700 }}>
                        Slot 1
                      </span>
                    )}
                    {isSlot2 && (
                      <span style={{ fontSize: '0.66rem', background: 'rgba(255,255,255,0.12)', padding: '0.1rem 0.35rem', borderRadius: 4, fontWeight: 700 }}>
                        Slot 2
                      </span>
                    )}
                    {active ? <Check size={16} style={{ color: 'var(--accent-teal)' }} /> : null}
                  </div>
                </div>
                <div className="template-card-tagline" style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{th.tagline}</div>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  );
}
