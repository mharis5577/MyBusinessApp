import { Download, Share2, Upload, Shield } from 'lucide-react';
import BrandMark from './BrandMark';

export const DATA_SAFETY_SEEN_KEY = 'cocoadesk-data-safety-seen';

export function hasSeenDataSafety() {
  try {
    return localStorage.getItem(DATA_SAFETY_SEEN_KEY) === '1';
  } catch (_) {
    return false;
  }
}

export function markDataSafetySeen() {
  try {
    localStorage.setItem(DATA_SAFETY_SEEN_KEY, '1');
  } catch (_) {
    /* ignore */
  }
}

/**
 * First-run / data-safety prompt for shopkeepers.
 * Explains phone-local storage and routes to Backup & Restore.
 */
export default function DataSafetySheet({ open, onDismiss, onBackup, onRestore }) {
  if (!open) return null;

  const finish = (next) => {
    markDataSafetySeen();
    onDismiss?.();
    next?.();
  };

  return (
    <div className="more-menu-overlay data-safety-overlay" onClick={() => finish()} role="presentation">
      <div
        className="more-menu-sheet glass-panel data-safety-sheet"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="data-safety-title"
      >
        <div className="data-safety-brand">
          <BrandMark size={48} />
        </div>
        <div className="data-safety-icon" aria-hidden>
          <Shield size={22} />
        </div>
        <h3 id="data-safety-title">Keep your shop data safe</h3>
        <p className="data-safety-lead">
          Your data is stored on this phone. Back up regularly to keep your bills and customers safe.
        </p>
        <ul className="data-safety-list">
          <li>
            <Download size={16} /> App + phone folder
          </li>
          <li>
            <Share2 size={16} /> Google Drive (share sheet)
          </li>
          <li>
            <Upload size={16} /> Restore anytime from Settings
          </li>
        </ul>
        <div className="data-safety-actions">
          <button type="button" className="btn-primary" onClick={() => finish(onBackup)}>
            <Share2 size={16} /> Backup now
          </button>
          <button type="button" className="btn-secondary" onClick={() => finish(onRestore)}>
            <Upload size={16} /> Restore
          </button>
          <button type="button" className="btn-secondary data-safety-later" onClick={() => finish()}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
