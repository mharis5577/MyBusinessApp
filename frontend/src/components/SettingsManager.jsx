import React, { useState, useEffect, useRef } from 'react';
import { Settings, Save, Trash2, Check, AlertTriangle, Download, Upload, FileBarChart2 } from 'lucide-react';
import { formatCurrency, pakistanToday } from '../utils/pakistan';
import { apiFetch } from '../api/client';

export default function SettingsManager({ onSettingsUpdated }) {
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
  const [report, setReport] = useState(null);
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const fileRef = useRef(null);

  useEffect(() => {
    apiFetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.company_name) setSettings((prev) => ({ ...prev, ...data }));
      })
      .catch((err) => console.error(err));
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
        setTimeout(() => setSavedMsg(false), 3000);
      }
    } catch (err) {
      alert('Error updating settings: ' + err.message);
    }
  };

  const handleResetDb = async () => {
    if (!window.confirm('Are you sure you want to WIPE ALL database records? This cannot be undone.')) {
      return;
    }
    try {
      const res = await apiFetch('/api/reset-db', { method: 'POST' });
      if (res.ok) {
        setResetMsg('Database wiped successfully.');
        setTimeout(() => setResetMsg(''), 4000);
        if (onSettingsUpdated) onSettingsUpdated();
      }
    } catch (err) {
      alert('Error resetting database: ' + err.message);
    }
  };

  const handleBackup = async () => {
    try {
      const res = await apiFetch('/api/backup');
      const text = await res.text();
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `elite-chocolate-backup-${pakistanToday()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Backup failed: ' + err.message);
    }
  };

  const handleRestore = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!window.confirm('Restore will REPLACE all current data with this backup. Continue?')) {
      e.target.value = '';
      return;
    }
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const res = await apiFetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      alert('Backup restored. Refresh recommended.');
      if (onSettingsUpdated) onSettingsUpdated();
    } catch (err) {
      alert('Restore failed: ' + err.message);
    } finally {
      e.target.value = '';
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
      alert(err.message);
    }
  };

  const exportReportCsv = () => {
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
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `monthly-report-${report.period}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
          Show Urdu labels on invoices / receipts
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
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
          Download a full JSON backup, or restore from a previous file.
        </p>
        <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn-primary" style={{ width: 'auto' }} onClick={handleBackup}>
            <Download size={16} /> Download Backup
          </button>
          <button type="button" className="btn-secondary" style={{ width: 'auto' }} onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Restore Backup
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={handleRestore} />
        </div>
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <AlertTriangle size={18} /> Clean / Reset Database
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Wipe all bills, catalog items, and customer records.</p>
            {resetMsg && <p style={{ color: 'var(--success)', fontWeight: 700, fontSize: '0.85rem', marginTop: '0.5rem' }}>{resetMsg}</p>}
          </div>
          <button type="button" className="btn-danger" onClick={handleResetDb} style={{ padding: '0.65rem 1.2rem' }}>
            <Trash2 size={16} /> Wipe All Data
          </button>
        </div>
      </div>
    </div>
  );
}
