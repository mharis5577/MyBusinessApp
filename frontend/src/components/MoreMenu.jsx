import { ArrowDownUp, Settings, X, Package, Download } from 'lucide-react';

export default function MoreMenu({ open, onClose, onNavigate, onOpenBackup, activeTab }) {
  if (!open) return null;

  const go = (tab) => {
    onNavigate(tab);
    onClose();
  };

  return (
    <div className="more-menu-overlay" onClick={onClose} role="presentation">
      <div className="more-menu-sheet glass-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>More</h3>
          <button type="button" className="btn-secondary" style={{ width: 'auto', padding: '0.35rem 0.55rem' }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <button
          type="button"
          className="more-menu-item"
          onClick={() => {
            onOpenBackup?.();
            onClose();
          }}
        >
          <Download size={20} />
          <span>
            <strong>Backup & Restore</strong>
            <small>App, phone storage, Google Drive</small>
          </span>
        </button>
        <button
          type="button"
          className={`more-menu-item ${activeTab === 'catalog' ? 'active' : ''}`}
          onClick={() => go('catalog')}
        >
          <Package size={20} />
          <span>
            <strong>Items</strong>
            <small>Products & stock</small>
          </span>
        </button>
        <button
          type="button"
          className={`more-menu-item ${activeTab === 'cashflow' ? 'active' : ''}`}
          onClick={() => go('cashflow')}
        >
          <ArrowDownUp size={20} />
          <span>
            <strong>Cashflow</strong>
            <small>Sales vs Saudia buying</small>
          </span>
        </button>
        <button
          type="button"
          className={`more-menu-item ${activeTab === 'settings' ? 'active' : ''}`}
          onClick={() => go('settings')}
        >
          <Settings size={20} />
          <span>
            <strong>Settings</strong>
            <small>Store profile, PIN, fingerprint</small>
          </span>
        </button>
      </div>
    </div>
  );
}
