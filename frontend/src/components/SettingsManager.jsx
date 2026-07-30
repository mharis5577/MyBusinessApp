import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Save,
  Trash2,
  Check,
  AlertTriangle,
  Download,
  Upload,
  FileBarChart2,
  History,
  Share2,
} from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import {
  exportBackupFile,
  restoreFromPayload,
  restoreFromLocalVersion,
  listLocalSnapshots,
  saveLocalSnapshot,
  getLastAutoBackupAt,
  MAX_VERSIONS,
} from '../utils/backupManager';

export default function SettingsManager({ onSettingsUpdated }) {
  const toast = useToast();
  const [settings, setSettings] = useState({
    company_name: 'ELITE CHOCOLATE',
    company_email: 'm.haris676@gmail.com',
    company_phone: '+923337669709',
    company_address: 'House No 107E, ST 13, Mehria Town, Attock',
    company_tax_id: '3110471785257',
    logo_url: '',
    currency_symbol: 'Rs.',
    default_tax_rate: 0,
    bank_name: '',
    account_title: '',
    account_number: '',
    mobile_wallet: '',
    payment_instructions: '',
    app_pin: '',
    urdu_labels: 0,
    low_stock_threshold: 5,
  });

  const [savedMsg, setSavedMsg] = useState(false);
  const [resetMsg, setResetMsg] = useState('');
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [pendingRestore, setPendingRestore] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const fileRef = useRef(null);

  const refreshSnapshots = async () => {
    try {
      setSnapshots(await listLocalSnapshots());
    } catch (err) {
      console.warn(err);
    }
  };

  useEffect(() => {
    apiFetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.company_name) setSettings((prev) => ({ ...prev, ...data }));
      })
      .catch((err) => console.error(err));
    refreshSnapshots();
  }, []);

  const handleChange = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          urdu_labels: settings.urdu_labels ? 1 : 0,
          low_stock_threshold: parseInt(settings.low_stock_threshold, 10) || 5,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setSettings((prev) => ({ ...prev, ...updated }));
        if (onSettingsUpdated) onSettingsUpdated(updated);
        setSavedMsg(true);
        toast.success('Settings saved');
        setTimeout(() => setSavedMsg(false), 3000);
      }
    } catch (err) {
      toast.error('Error updating settings: ' + err.message);
    }
  };

  const handleResetDb = async () => {
    if (wipeConfirm.trim() !== 'DELETE') {
      toast.error('Type DELETE exactly to confirm wipe');
      return;
    }
    setBusy(true);
    try {
      const snap = await saveLocalSnapshot('pre-wipe');
      try {
        await exportBackupFile({ offerShare: true });
      } catch (err) {
        if (err?.name !== 'AbortError') console.warn('Pre-wipe download/share skipped', err);
      }
      const res = await apiFetch('/api/reset-db', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setResetMsg(`Database wiped. Recover via backup version ${snap.filename} (or Downloads / share sheet).`);
      setWipeConfirm('');
      toast.success('Shop data wiped — restore from pre-wipe backup if needed');
      await refreshSnapshots();
      if (onSettingsUpdated) onSettingsUpdated();
    } catch (err) {
      toast.error('Error resetting database: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleBackup = async () => {
    setBusy(true);
    try {
      const result = await exportBackupFile({ offerShare: true });
      toast.success(`Backup saved: ${result.filename}. On phone, use share sheet to save to Drive/Files.`);
      await refreshSnapshots();
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Backup failed: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const startFileRestore = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      setPendingRestore({ kind: 'file', payload, label: file.name });
      setRestoreConfirm('');
    } catch (err) {
      toast.error('Invalid backup file: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  const startVersionRestore = async (id) => {
    const snap = snapshots.find((s) => s.id === id);
    setPendingRestore({ kind: 'version', id, label: snap?.filename || `version #${id}` });
    setRestoreConfirm('');
  };

  const executeRestore = async () => {
    if (restoreConfirm.trim() !== 'CONFIRM') {
      toast.error('Type CONFIRM to restore');
      return;
    }
    if (!pendingRestore) return;
    setBusy(true);
    try {
      if (pendingRestore.kind === 'version') {
        await restoreFromLocalVersion(pendingRestore.id);
      } else {
        await restoreFromPayload(pendingRestore.payload);
      }
      toast.success('Backup restored. A pre-restore snapshot was kept.');
      setPendingRestore(null);
      setRestoreConfirm('');
      await refreshSnapshots();
      if (onSettingsUpdated) onSettingsUpdated();
    } catch (err) {
      toast.error('Restore failed: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const loadMonthlyReport = async () => {
    const [y, m] = reportMonth.split('-').map(Number);
    try {
      const res = await apiFetch(`/api/reports/monthly?year=${y}&month=${m}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setReport(data);
    } catch (err) {
      toast.error(err.message);
    }
  };

  const exportReportCsv = async () => {
    if (!report?.bills?.length) return;
    const headers = ['Type', 'Invoice', 'Party', 'Date', 'Total', 'Paid', 'Status'];
    const rows = report.bills.map((b) => [
      b.bill_type,
      b.invoice_number,
      `"${b.customer_name}"`,
      b.bill_date,
      b.total_amount,
      b.amount_paid || 0,
      b.status,
    ]);
    const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    try {
      const { downloadBlob } = await import('../utils/downloadFile');
      await downloadBlob(blob, `monthly-report-${report.period}.csv`, 'text/csv');
      toast.success('Report exported');
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('Export failed: ' + err.message);
    }
  };

  const lastAuto = getLastAutoBackupAt();

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <form onSubmit={handleSubmit} className="glass-panel" style={{ padding: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem' }}>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Settings size={20} style={{ color: 'var(--accent-teal)' }} /> Store Profile & Currency Settings
            </h2>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Configure business details, PIN lock, and invoice language</p>
          </div>
          {savedMsg && (
            <div style={{ background: 'rgba(16,185,129,0.2)', color: 'var(--success)', padding: '0.4rem 0.8rem', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Check size={14} /> Saved!
            </div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Store / Company Name</label>
            <input className="form-input" type="text" value={settings.company_name || ''} onChange={(e) => handleChange('company_name', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Currency Symbol</label>
            <select className="form-select" value={settings.currency_symbol || 'Rs.'} onChange={(e) => handleChange('currency_symbol', e.target.value)}>
              <option value="Rs.">Rs. (PKR)</option>
              <option value="PKR">PKR</option>
              <option value="$">$</option>
              <option value="AED">AED</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Contact Phone</label>
            <input className="form-input" type="text" value={settings.company_phone || ''} onChange={(e) => handleChange('company_phone', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Contact Email</label>
            <input className="form-input" type="email" value={settings.company_email || ''} onChange={(e) => handleChange('company_email', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">NTN / Tax Registration #</label>
            <input className="form-input" type="text" value={settings.company_tax_id || ''} onChange={(e) => handleChange('company_tax_id', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Default Tax Rate (%)</label>
            <input className="form-input" type="number" step="0.1" value={settings.default_tax_rate ?? 0} onChange={(e) => handleChange('default_tax_rate', parseFloat(e.target.value) || 0)} />
          </div>
          <div className="form-group">
            <label className="form-label">Staff PIN (blank = unlocked)</label>
            <input className="form-input" type="password" inputMode="numeric" placeholder="e.g. 1234" value={settings.app_pin || ''} onChange={(e) => handleChange('app_pin', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Low stock threshold</label>
            <input className="form-input" type="number" min="0" value={settings.low_stock_threshold ?? 5} onChange={(e) => handleChange('low_stock_threshold', e.target.value)} />
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginTop: '0.75rem', fontSize: '0.9rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={Boolean(Number(settings.urdu_labels))}
            onChange={(e) => handleChange('urdu_labels', e.target.checked ? 1 : 0)}
          />
          Show bilingual English + Urdu labels on invoices / receipts (Noto Nastaliq)
        </label>

        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent-teal)', marginBottom: '0.75rem' }}>Bank & Payment Options</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem' }}>
            <div className="form-group">
              <label className="form-label">Bank Name</label>
              <input className="form-input" type="text" value={settings.bank_name || ''} onChange={(e) => handleChange('bank_name', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Account Title</label>
              <input className="form-input" type="text" value={settings.account_title || ''} onChange={(e) => handleChange('account_title', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Account Number / IBAN</label>
              <input className="form-input" type="text" value={settings.account_number || ''} onChange={(e) => handleChange('account_number', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Raast / JazzCash / EasyPaisa</label>
              <input className="form-input" type="text" value={settings.mobile_wallet || ''} onChange={(e) => handleChange('mobile_wallet', e.target.value)} />
            </div>
          </div>
          <div className="form-group" style={{ marginTop: '0.5rem' }}>
            <label className="form-label">Payment Instructions</label>
            <input className="form-input" type="text" value={settings.payment_instructions || ''} onChange={(e) => handleChange('payment_instructions', e.target.value)} />
          </div>
        </div>

        <div className="form-group" style={{ marginTop: '0.75rem' }}>
          <label className="form-label">Store Address</label>
          <textarea className="form-textarea" rows={2} value={settings.company_address || ''} onChange={(e) => handleChange('company_address', e.target.value)} />
        </div>

        <div style={{ marginTop: '1.25rem', display: 'flex', justifyContent: 'flex-end' }}>
          <button type="submit" className="btn-primary" style={{ padding: '0.75rem 1.75rem' }}>
            <Save size={18} /> Save Settings
          </button>
        </div>
      </form>

      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Download size={18} /> Backup & Restore
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.65rem' }}>
          Downloads keep a versioned local snapshot (last {MAX_VERSIONS}). On Android, the share sheet can save to Google Drive or Files — no API keys needed.
        </p>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
          Last weekly auto-backup: {lastAuto ? new Date(lastAuto).toLocaleString() : 'never'} (runs on app open if older than 7 days).
        </p>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <button type="button" className="btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={handleBackup}>
            <Share2 size={16} /> Backup / Share
          </button>
          <button type="button" className="btn-secondary" style={{ width: 'auto' }} disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Restore from file
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={startFileRestore} />
        </div>

        <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.55rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <History size={16} /> Saved versions
        </h4>
        {snapshots.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No local versions yet — run a backup first.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: 220, overflowY: 'auto' }}>
            {snapshots.map((s) => (
              <div key={s.id} className="surface-block" style={{ padding: '0.55rem 0.7rem', display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '0.78rem' }}>
                  <div style={{ fontWeight: 700 }}>{s.filename}</div>
                  <div style={{ color: 'var(--text-muted)' }}>{s.reason} · {new Date(s.created_at).toLocaleString()}</div>
                </div>
                <button type="button" className="btn-secondary" style={{ width: 'auto', fontSize: '0.75rem' }} onClick={() => startVersionRestore(s.id)}>
                  Restore
                </button>
              </div>
            ))}
          </div>
        )}

        {pendingRestore && (
          <div style={{ marginTop: '1rem', padding: '0.9rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(180,83,9,0.35)', background: 'rgba(180,83,9,0.08)' }}>
            <p style={{ fontSize: '0.85rem', marginBottom: '0.55rem' }}>
              Restore <strong>{pendingRestore.label}</strong> will replace current shop data. A pre-restore snapshot is saved first. Type <strong>CONFIRM</strong>:
            </p>
            <input
              className="form-input"
              value={restoreConfirm}
              onChange={(e) => setRestoreConfirm(e.target.value)}
              placeholder="CONFIRM"
              autoComplete="off"
            />
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.65rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={executeRestore}>
                Restore now
              </button>
              <button type="button" className="btn-secondary" style={{ width: 'auto' }} onClick={() => { setPendingRestore(null); setRestoreConfirm(''); }}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem' }}>
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <FileBarChart2 size={18} /> Monthly sales report
        </h3>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '1rem' }}>
          <input className="form-input" type="month" style={{ width: 'auto' }} value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
          <button type="button" className="btn-secondary" style={{ width: 'auto' }} onClick={loadMonthlyReport}>Load</button>
          {report && (
            <button type="button" className="btn-secondary" style={{ width: 'auto' }} onClick={exportReportCsv}>Export CSV</button>
          )}
        </div>
        {report && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
            <div className="surface-block" style={{ padding: '0.75rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Sales total</div>
              <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{formatCurrency(settings.currency_symbol || 'Rs.', report.sales_total)}</div>
            </div>
            <div className="surface-block" style={{ padding: '0.75rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Collected</div>
              <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{formatCurrency(settings.currency_symbol || 'Rs.', report.sales_paid)}</div>
            </div>
            <div className="surface-block" style={{ padding: '0.75rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Buying cost</div>
              <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{formatCurrency(settings.currency_symbol || 'Rs.', report.buying_total)}</div>
            </div>
            <div className="surface-block" style={{ padding: '0.75rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Est. profit</div>
              <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>{formatCurrency(settings.currency_symbol || 'Rs.', report.estimated_profit)}</div>
            </div>
          </div>
        )}
      </div>

      <div className="glass-panel" style={{ padding: '1.5rem', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertTriangle size={18} /> Clean / Reset Database
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
              Nuclear wipe of bills, catalog, and clients. This cannot be undone except by restoring the automatic pre-wipe backup (saved below and offered via share/download).
            </p>
            {resetMsg && <p style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.85rem', marginTop: '0.5rem' }}>{resetMsg}</p>}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Type DELETE to enable wipe</label>
            <input
              className="form-input"
              value={wipeConfirm}
              onChange={(e) => setWipeConfirm(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            className="btn-danger"
            onClick={handleResetDb}
            disabled={busy || wipeConfirm.trim() !== 'DELETE'}
            style={{ padding: '0.65rem 1.2rem', width: 'auto', alignSelf: 'flex-start' }}
          >
            <Trash2 size={16} /> Wipe All Data
          </button>
        </div>
      </div>
    </div>
  );
}
