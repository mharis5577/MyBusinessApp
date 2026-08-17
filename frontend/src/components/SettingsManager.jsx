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
  Fingerprint,
  Bell,
  Plus,
  Palette,
  ImagePlus,
  Layout,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { playSuccessChime, setSoundEnabled } from '../utils/audioEffects';
import { compressImageToDataUrl } from '../utils/imageCompress';
import { checkBiometricAvailable } from '../utils/appSecurity';
import { cancelDueReminders, requestDueReminderPermission, syncDueReminders, sendTestDueNotification } from '../utils/dueReminders';
import { formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import {
  exportBackupFile,
  restoreFromPayload,
  restoreFromLocalVersion,
  shareLocalSnapshot,
  listLocalSnapshots,
  saveLocalSnapshot,
  deleteLocalSnapshot,
  deleteLocalSnapshots,
  getLastAutoBackupAt,
  getLastPhoneBackupPath,
  parseBackupPayload,
  summarizeBackupPayload,
  getLocalSnapshot,
  MAX_VERSIONS,
  PHONE_FOLDER,
} from '../utils/backupManager';
import { readPickedFileText } from '../utils/downloadFile';
import { DeveloperCredit } from './BrandMark';
import AppSelect from './AppSelect';
import { emptyPaymentMethod, getPaymentMethods, withPaymentMethods } from '../utils/paymentMethods';
import { INVOICE_TEMPLATES } from '../utils/invoiceTemplates';
import { getDefaultLogoDataUrl, getDefaultStampDataUrl } from '../utils/defaultBranding';

export default function SettingsManager({ onSettingsUpdated, focusBackup = false, onFocusHandled, appSettings = null }) {
  const toast = useToast();
  const backupPanelRef = useRef(null);
  const deleteConfirmRef = useRef(null);
  const [backupHighlight, setBackupHighlight] = useState(false);
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
    payment_methods: [emptyPaymentMethod({ label: 'Primary' })],
    app_pin: '',
    biometric_lock: 0,
    due_reminders: 0,
    urdu_labels: 0,
    show_developer_credit: 1,
    default_invoice_template: 'classic',
    custom_brand_color: '',
    header_layout: 'split',
    signature_url: '',
    show_paid_stamp: 1,
    low_stock_threshold: 5,
  });

  const [bioAvailable, setBioAvailable] = useState(false);
  const [savedMsg, setSavedMsg] = useState(false);
  const [resetMsg, setResetMsg] = useState('');
  const [wipeConfirm, setWipeConfirm] = useState('');
  const [purgeConfirm, setPurgeConfirm] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [pendingRestore, setPendingRestore] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [selectedVersions, setSelectedVersions] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const fileRef = useRef(null);

  const refreshSnapshots = async () => {
    try {
      const list = await listLocalSnapshots();
      setSnapshots(list);
      setSelectedVersions((prev) => prev.filter((id) => list.some((s) => s.id === id)));
    } catch (err) {
      console.warn(err);
    }
  };

  const toggleVersionSelect = (id) => {
    setSelectedVersions((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAllVersions = () => {
    if (selectedVersions.length === snapshots.length) setSelectedVersions([]);
    else setSelectedVersions(snapshots.map((s) => s.id));
  };

  const askDeleteVersion = (id, label) => {
    setPendingDelete({
      mode: 'one',
      ids: [id],
      title: 'Delete saved version?',
      message: `Remove "${label || `version #${id}`}" from App versions. Phone/Drive copies are not deleted.`,
    });
  };

  const askDeleteSelectedVersions = () => {
    if (!selectedVersions.length) {
      toast.info('Select one or more versions first');
      return;
    }
    const n = selectedVersions.length;
    setPendingDelete({
      mode: 'many',
      ids: [...selectedVersions],
      title: `Delete ${n} selected version${n === 1 ? '' : 's'}?`,
      message: 'Remove them from App versions. Phone/Drive copies are not deleted.',
    });
  };

  useEffect(() => {
    if (!pendingDelete) return undefined;
    const t = setTimeout(() => {
      deleteConfirmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 40);
    return () => clearTimeout(t);
  }, [pendingDelete]);

  const cancelPendingDelete = () => setPendingDelete(null);

  const confirmPendingDelete = async () => {
    if (!pendingDelete?.ids?.length) return;
    const ids = pendingDelete.ids;
    setBusy(true);
    try {
      if (ids.length === 1) {
        await deleteLocalSnapshot(ids[0]);
        if (pendingRestore?.kind === 'version' && pendingRestore.id === ids[0]) {
          setPendingRestore(null);
          setRestoreConfirm('');
        }
        toast.success('Saved version deleted');
      } else {
        const n = await deleteLocalSnapshots(ids);
        if (pendingRestore?.kind === 'version' && ids.includes(pendingRestore.id)) {
          setPendingRestore(null);
          setRestoreConfirm('');
        }
        setSelectedVersions([]);
        toast.success(`Deleted ${n} saved version${n === 1 ? '' : 's'}`);
      }
      setPendingDelete(null);
      await refreshSnapshots();
    } catch (err) {
      toast.error('Delete failed: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refreshSnapshots();
    checkBiometricAvailable().then((r) => setBioAvailable(Boolean(r.available)));
  }, []);

  useEffect(() => {
    if (appSettings?.company_name) {
      const enriched = withPaymentMethods(appSettings);
      const methods = getPaymentMethods(enriched);
      setSettings((prev) => ({
        ...prev,
        ...enriched,
        payment_methods: methods.length ? methods : [emptyPaymentMethod({ label: 'Primary' })],
      }));
      return;
    }
    apiFetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data && data.company_name) {
          const enriched = withPaymentMethods(data);
          const methods = getPaymentMethods(enriched);
          setSettings((prev) => ({
            ...prev,
            ...enriched,
            payment_methods: methods.length ? methods : [emptyPaymentMethod({ label: 'Primary' })],
          }));
        }
      })
      .catch((err) => console.error(err));
  }, [appSettings]);

  useEffect(() => {
    if (!focusBackup) return undefined;
    const t = setTimeout(() => {
      backupPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setBackupHighlight(true);
      onFocusHandled?.();
    }, 80);
    const clear = setTimeout(() => setBackupHighlight(false), 2800);
    return () => {
      clearTimeout(t);
      clearTimeout(clear);
    };
  }, [focusBackup, onFocusHandled]);

  const handleChange = (field, value) => {
    setSettings((prev) => ({ ...prev, [field]: value }));
  };

  const handleMethodChange = (id, field, value) => {
    setSettings((prev) => ({
      ...prev,
      payment_methods: (prev.payment_methods || []).map((m) =>
        m.id === id ? { ...m, [field]: value } : m
      ),
    }));
  };

  const handleAddPaymentMethod = () => {
    setSettings((prev) => ({
      ...prev,
      payment_methods: [
        ...(prev.payment_methods || []),
        emptyPaymentMethod({ label: `Option ${(prev.payment_methods || []).length + 1}` }),
      ],
    }));
  };

  const handleRemovePaymentMethod = (id) => {
    setSettings((prev) => {
      const list = prev.payment_methods || [];
      if (list.length <= 1) {
        return { ...prev, payment_methods: [emptyPaymentMethod({ label: 'Primary' })] };
      }
      return { ...prev, payment_methods: list.filter((m) => m.id !== id) };
    });
  };

  const handleLogoPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file, { maxWidth: 400, quality: 0.85 });
      handleChange('logo_url', dataUrl);
      toast.success('Logo uploaded');
    } catch (err) {
      toast.error('Could not load logo: ' + (err.message || err));
    }
  };

  const handleSignaturePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await compressImageToDataUrl(file, { maxWidth: 400, quality: 0.85 });
      handleChange('signature_url', dataUrl);
      toast.success('Signature / Stamp uploaded');
    } catch (err) {
      toast.error('Could not load signature: ' + (err.message || err));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...settings,
          payment_methods: settings.payment_methods || [],
          urdu_labels: settings.urdu_labels ? 1 : 0,
          show_developer_credit: settings.show_developer_credit === 0 || settings.show_developer_credit === false ? 0 : 1,
          biometric_lock: settings.biometric_lock ? 1 : 0,
          due_reminders: settings.due_reminders ? 1 : 0,
          low_stock_threshold: parseInt(settings.low_stock_threshold, 10) || 5,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        const enriched = withPaymentMethods(updated);
        const methods = getPaymentMethods(enriched);
        setSettings((prev) => ({
          ...prev,
          ...enriched,
          payment_methods: methods.length ? methods : [emptyPaymentMethod({ label: 'Primary' })],
        }));
        if (onSettingsUpdated) onSettingsUpdated(enriched);
        setSavedMsg(true);
        toast.success('Settings saved');
        setTimeout(() => setSavedMsg(false), 3000);
        if (Number(enriched.due_reminders)) {
          syncDueReminders(enriched).catch(() => {});
        } else {
          cancelDueReminders().catch(() => {});
        }
      }
    } catch (err) {
      toast.error('Error updating settings: ' + err.message);
    }
  };

  const handlePurgeDemo = async () => {
    if (purgeConfirm.trim() !== 'PURGE') {
      toast.error('Type PURGE exactly to remove test records');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch('/api/maintenance/purge-demo', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const bills = Number(data.removed_bills) || 0;
      const customers = Number(data.removed_customers) || 0;
      setPurgeConfirm('');
      toast.success(`Removed ${customers} test client${customers === 1 ? '' : 's'} and ${bills} bill${bills === 1 ? '' : 's'}`);
      if (onSettingsUpdated) onSettingsUpdated();
    } catch (err) {
      toast.error(err.message || 'Could not remove test records');
    } finally {
      setBusy(false);
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
      const result = await exportBackupFile({ offerShare: false });
      const parts = [];
      if (result.inApp) parts.push('App');
      if (result.phoneSaved) parts.push('Phone storage');
      if (!parts.length) {
        toast.error('Backup did not save anywhere. Free storage and try again.');
        return;
      }
      toast.success(`Backup saved (${parts.join(' + ')}): ${result.filename}`);
      await refreshSnapshots();
    } catch (err) {
      toast.error('Backup failed: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleShareBackup = async () => {
    setBusy(true);
    try {
      const result = await exportBackupFile({ offerShare: true });
      const base = [];
      if (result.inApp) base.push('App');
      if (result.phoneSaved) base.push('Phone');
      if (!result.inApp && !result.phoneSaved && result.driveResult !== 'shared' && result.driveResult !== 'downloaded') {
        toast.error('Backup did not save. Free storage, then try Backup to Drive again.');
        return;
      }
      if (result.driveResult === 'shared') {
        toast.success(
          `${base.join(' + ') || 'Backup'} saved. Pick Google Drive in the share sheet.`
        );
      } else if (result.driveResult === 'cancelled') {
        toast.info(
          `${base.join(' + ') || 'Backup'} still saved in App${result.phoneSaved ? ' and Phone storage' : ''}. Drive share was cancelled.`
        );
      } else if (result.driveResult === 'downloaded') {
        toast.success(`Backup file ready: ${result.filename}`);
      } else {
        toast.success(
          `${base.join(' + ') || 'Backup'} saved${result.phonePath ? ` → ${result.phonePath}` : ''}.`
        );
      }
      await refreshSnapshots();
    } catch (err) {
      if (err?.name === 'AbortError') {
        toast.info('Share cancelled. Backup is still in App + Phone storage.');
        await refreshSnapshots();
      } else {
        toast.error('Share failed: ' + err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const startFileRestore = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await readPickedFileText(file);
      const payload = parseBackupPayload(text);
      const summary = summarizeBackupPayload(payload);
      setPendingRestore({
        kind: 'file',
        payload,
        label: file.name || 'backup.json',
        summary,
      });
      setRestoreConfirm('');
      toast.success('Backup file loaded. Type CONFIRM below to restore.');
    } catch (err) {
      toast.error('Invalid backup file: ' + err.message);
    } finally {
      e.target.value = '';
    }
  };

  const startVersionRestore = async (id) => {
    const snap = snapshots.find((s) => s.id === id);
    let summary = null;
    try {
      const full = await getLocalSnapshot(id);
      if (full?.payload) summary = summarizeBackupPayload(full.payload);
    } catch {
      /* ignore */
    }
    setPendingRestore({ kind: 'version', id, label: snap?.filename || `version #${id}`, summary });
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
      toast.success('Backup restored. Reloading…');
      setPendingRestore(null);
      setRestoreConfirm('');
      await refreshSnapshots();
      if (onSettingsUpdated) onSettingsUpdated();
      setTimeout(() => window.location.reload(), 400);
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
    if (!report?.bills?.length) {
      toast.info('Load a month with bills first');
      return;
    }
    try {
      const { downloadCsv, exportMoney } = await import('../utils/tableExport');
      const headers = ['Type', 'Invoice', 'Party', 'Date', 'Total', 'Paid', 'Balance', 'Status'];
      const rows = report.bills.map((b) => {
        const total = Number(b.total_amount) || 0;
        const paid = Number(b.amount_paid) || 0;
        const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
        let status = b.status || 'pending';
        if (total > 0) {
          if (balance <= 0) status = 'paid';
          else if (status === 'paid') status = 'due';
        }
        return [
          b.bill_type || '',
          b.invoice_number || '',
          b.customer_name || '',
          b.bill_date || '',
          exportMoney(total),
          exportMoney(paid),
          exportMoney(balance),
          status,
        ];
      });
      await downloadCsv(headers, rows, `monthly-report-${report.period}.csv`);
      toast.success('Report exported (CSV)');
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('CSV export failed: ' + err.message);
    }
  };

  const exportReportPdf = async () => {
    if (!report?.bills?.length) {
      toast.info('Load a month with bills first');
      return;
    }
    try {
      const { downloadTablePdf, exportMoney } = await import('../utils/tableExport');
      const headers = ['Type', 'Invoice', 'Party', 'Date', 'Total', 'Paid', 'Balance', 'Status'];
      const rows = report.bills.map((b) => {
        const total = Number(b.total_amount) || 0;
        const paid = Number(b.amount_paid) || 0;
        const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
        let status = b.status || 'pending';
        if (total > 0) {
          if (balance <= 0) status = 'paid';
          else if (status === 'paid') status = 'due';
        }
        return [
          b.bill_type || '',
          b.invoice_number || '',
          b.customer_name || '',
          b.bill_date || '',
          exportMoney(total),
          exportMoney(paid),
          exportMoney(balance),
          status,
        ];
      });
      const sym = settings.currency_symbol || 'Rs.';
      await downloadTablePdf({
        title: 'Elite Chocolate — Monthly Report',
        subtitle: `${report.period} · Sales ${sym} ${exportMoney(report.sales_total)} · Collected ${sym} ${exportMoney(report.sales_paid)} · Buying ${sym} ${exportMoney(report.buying_total)}${report.help_outstanding ? ` · Help out ${sym} ${exportMoney(report.help_outstanding)}` : ''}`,
        headers,
        rows,
        filename: `monthly-report-${report.period}.pdf`,
        landscape: true,
        colWeights: [1.1, 1.3, 1.5, 1.1, 1.2, 1.2, 1.2, 0.9],
      });
      toast.success('Report exported (PDF)');
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('PDF export failed: ' + err.message);
    }
  };

  const lastAuto = getLastAutoBackupAt();
  const lastPhonePath = getLastPhoneBackupPath();

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div
        id="settings-backup"
        ref={backupPanelRef}
        className={`glass-panel settings-backup-panel${backupHighlight ? ' is-focused' : ''}`}
        style={{ padding: '1.5rem' }}
      >
        <h3 style={{ fontSize: '1.1rem', fontWeight: 800, marginBottom: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <Download size={18} /> Backup & Restore
        </h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.65rem' }}>
          Your shop data lives on this phone. Backups go to <b>3 places</b>: inside the app, phone folder <b>{PHONE_FOLDER}</b>, and (with Share) <b>Google Drive</b>.
        </p>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
          Last weekly auto-backup: {lastAuto ? new Date(lastAuto).toLocaleString() : 'never'} (App + phone folder every 7 days).
        </p>
        {lastPhonePath ? (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Last phone file: {lastPhonePath}
          </p>
        ) : (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Tip: tap <b>Backup to Drive</b>, then choose Google Drive → your folder.
          </p>
        )}
        <div className="action-row" style={{ marginBottom: '1rem' }}>
          <button type="button" className="btn-primary" disabled={busy} onClick={handleShareBackup}>
            <Share2 size={16} /> Backup to Drive
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={handleBackup}>
            <Download size={16} /> App + Phone only
          </button>
          <button type="button" className="btn-secondary" disabled={busy} onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> Restore from file
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json,text/plain,*/*"
            style={{ display: 'none' }}
            onChange={startFileRestore}
          />
        </div>

        <h4 style={{ fontSize: '0.9rem', fontWeight: 800, marginBottom: '0.55rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <History size={16} /> Saved versions
        </h4>
        {snapshots.length === 0 ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>No local versions yet — run a backup first.</p>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.78rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={selectedVersions.length === snapshots.length && snapshots.length > 0}
                  onChange={toggleSelectAllVersions}
                />
                Select all ({snapshots.length})
              </label>
              <button
                type="button"
                className="btn-danger"
                style={{ width: 'auto', fontSize: '0.75rem', minHeight: 34 }}
                disabled={busy || selectedVersions.length === 0}
                onClick={askDeleteSelectedVersions}
              >
                <Trash2 size={14} /> Delete selected{selectedVersions.length ? ` (${selectedVersions.length})` : ''}
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: 260, overflowY: 'auto' }}>
              {snapshots.map((s) => (
                <div key={s.id} className="surface-block" style={{ padding: '0.55rem 0.7rem', display: 'flex', justifyContent: 'space-between', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', minWidth: 0, flex: 1, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedVersions.includes(s.id)}
                      onChange={() => toggleVersionSelect(s.id)}
                      style={{ marginTop: 3 }}
                    />
                    <span style={{ fontSize: '0.78rem', minWidth: 0 }}>
                      <span style={{ fontWeight: 700, display: 'block', overflowWrap: 'anywhere' }}>{s.filename}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{s.reason} · {new Date(s.created_at).toLocaleString()}</span>
                    </span>
                  </label>
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: 'auto', fontSize: '0.75rem' }}
                      disabled={busy}
                      onClick={async () => {
                        try {
                          await shareLocalSnapshot(s.id);
                        } catch (err) {
                          if (err?.name !== 'AbortError') toast.error(err.message);
                        }
                      }}
                    >
                      Share
                    </button>
                    <button type="button" className="btn-secondary" style={{ width: 'auto', fontSize: '0.75rem' }} onClick={() => startVersionRestore(s.id)}>
                      Restore
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      style={{ width: 'auto', fontSize: '0.75rem', padding: '0.35rem 0.55rem' }}
                      disabled={busy}
                      title="Delete this saved version"
                      onClick={() => askDeleteVersion(s.id, s.filename)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {pendingDelete && (
          <div
            ref={deleteConfirmRef}
            className="backup-delete-confirm"
            role="dialog"
            aria-labelledby="backup-delete-title"
          >
            <div className="backup-delete-confirm-icon" aria-hidden>
              <AlertTriangle size={18} />
            </div>
            <div className="backup-delete-confirm-copy">
              <h4 id="backup-delete-title">{pendingDelete.title}</h4>
              <p>{pendingDelete.message}</p>
            </div>
            <div className="backup-delete-confirm-actions">
              <button type="button" className="btn-secondary" disabled={busy} onClick={cancelPendingDelete}>
                Cancel
              </button>
              <button type="button" className="btn-danger confirm-dialog-delete" disabled={busy} onClick={confirmPendingDelete}>
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </div>
        )}

        {pendingRestore && (
          <div style={{ marginTop: '1rem', padding: '0.9rem', borderRadius: 'var(--radius-md)', border: '1px solid rgba(180,83,9,0.35)', background: 'rgba(180,83,9,0.08)' }}>
            <p style={{ fontSize: '0.85rem', marginBottom: '0.55rem' }}>
              Restore <strong>{pendingRestore.label}</strong> will replace current shop data. A pre-restore safety copy is required first.
              {pendingRestore.summary ? (
                <>
                  {' '}
                  This file has {pendingRestore.summary.bills} bills, {pendingRestore.summary.customers} customers,{' '}
                  {pendingRestore.summary.products} products.
                </>
              ) : null}{' '}
              Type <strong>CONFIRM</strong>:
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

        <div className="settings-form-grid responsive-grid" style={{ display: 'grid', gap: '1rem' }}>
          <div className="form-group">
            <label className="form-label">Store / Company Name</label>
            <input className="form-input" type="text" value={settings.company_name || ''} onChange={(e) => handleChange('company_name', e.target.value)} required />
          </div>
          <div className="form-group">
            <label className="form-label">Currency Symbol</label>
            <AppSelect
              value={settings.currency_symbol || 'Rs.'}
              onChange={(next) => handleChange('currency_symbol', next)}
              aria-label="Currency"
              options={[
                { value: 'Rs.', label: 'Rs. (PKR)' },
                { value: 'PKR', label: 'PKR' },
                { value: '$', label: '$' },
                { value: 'AED', label: 'AED' },
              ]}
            />
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
            <label className="form-label">Staff PIN (blank = no PIN lock)</label>
            <input className="form-input" type="password" inputMode="numeric" placeholder="e.g. 1234" value={settings.app_pin || ''} onChange={(e) => handleChange('app_pin', e.target.value)} />
          </div>
          <div className="form-group">
            <label className="form-label">Low stock threshold</label>
            <input className="form-input" type="number" min="0" value={settings.low_stock_threshold ?? 5} onChange={(e) => handleChange('low_stock_threshold', e.target.value)} />
          </div>
        </div>

        <div className="surface-block" style={{ marginTop: '1rem', padding: '0.9rem 1rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', fontSize: '0.9rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ marginTop: 3 }}
              checked={Boolean(Number(settings.biometric_lock))}
              onChange={(e) => {
                if (e.target.checked && !bioAvailable) {
                  toast.info('Fingerprint is not available on this device yet. Rebuild the APK after installing the biometric plugin.');
                }
                if (e.target.checked && !(settings.app_pin && String(settings.app_pin).trim())) {
                  toast.info('Tip: also set a Staff PIN as a backup unlock method.');
                }
                handleChange('biometric_lock', e.target.checked ? 1 : 0);
              }}
            />
            <span>
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Fingerprint size={16} /> Unlock with fingerprint
              </strong>
              <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                Off by default — the app will never ask for fingerprint until you turn this on yourself.
                {bioAvailable ? ' Device fingerprint is ready.' : ' (Sensor not detected on this device.)'}
              </span>
            </span>
          </label>
        </div>

        <div className="surface-block" style={{ marginTop: '0.75rem', padding: '0.9rem 1rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', fontSize: '0.9rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ marginTop: 3 }}
              checked={Boolean(Number(settings.due_reminders))}
              onChange={async (e) => {
                const on = e.target.checked;
                handleChange('due_reminders', on ? 1 : 0);
                if (on) {
                  const perm = await requestDueReminderPermission();
                  if (!perm.granted && perm.reason !== 'web') {
                    toast.info('Allow notifications when Android asks, then save settings.');
                  } else if (perm.reason === 'web') {
                    toast.info('Due reminders work on the phone APK (Android notifications).');
                  } else {
                    toast.success('Due reminders will alert you about overdue bills.');
                  }
                } else {
                  cancelDueReminders().catch(() => {});
                }
              }}
            />
            <span>
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Bell size={16} /> Due-date notifications
              </strong>
              <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                Off by default. When on, the phone reminds you of overdue / due-today bills (daily at 10:00). Save settings after turning on.
              </span>
            </span>
          </label>
          {Boolean(Number(settings.due_reminders)) && (
            <button
              type="button"
              className="btn-secondary"
              style={{ width: 'auto', marginTop: '0.75rem', fontSize: '0.78rem' }}
              disabled={busy}
              onClick={async () => {
                try {
                  const result = await sendTestDueNotification(settings);
                  if (!result.ok && result.reason === 'web') {
                    toast.info('Test notification only works on the Android APK.');
                  } else if (!result.ok) {
                    toast.error('Allow notifications in Android settings, then try again.');
                  } else {
                    toast.success('Test notification sent — check the shade in ~1s.');
                  }
                } catch (err) {
                  toast.error('Notification test failed: ' + (err.message || err));
                }
              }}
            >
              <Bell size={14} /> Send test notification
            </button>
          )}
        </div>

        <div className="surface-block" style={{ marginTop: '0.75rem', padding: '0.9rem 1rem' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.65rem', fontSize: '0.9rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              style={{ marginTop: 3 }}
              checked={settings.sound_effects !== 0 && settings.sound_effects !== false}
              onChange={(e) => {
                const on = e.target.checked;
                handleChange('sound_effects', on ? 1 : 0);
                setSoundEnabled(on);
                if (on) {
                  playSuccessChime();
                  toast.success('Audio sound effects enabled');
                } else {
                  toast.info('Audio sound effects disabled');
                }
              }}
            />
            <span>
              <strong style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Volume2 size={16} /> Luxury Audio & Sound Effects
              </strong>
              <span style={{ display: 'block', fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: 4 }}>
                Subtle luxury clicks on button taps and melodic chimes on payment, saving bills, and starring. Can be turned off anytime.
              </span>
            </span>
          </label>
          {(settings.sound_effects !== 0 && settings.sound_effects !== false) && (
            <button
              type="button"
              className="btn-secondary"
              style={{ width: 'auto', marginTop: '0.75rem', fontSize: '0.78rem' }}
              onClick={() => {
                playSuccessChime();
                toast.success('Playing audio chime preview 🔔');
              }}
            >
              <Volume2 size={14} /> Test sound effect
            </button>
          )}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginTop: '0.75rem', fontSize: '0.9rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={Boolean(Number(settings.urdu_labels))}
            onChange={(e) => handleChange('urdu_labels', e.target.checked ? 1 : 0)}
          />
          Show bilingual English + Urdu labels on invoices / receipts (Noto Nastaliq)
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginTop: '0.75rem', fontSize: '0.9rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.show_developer_credit !== 0 && settings.show_developer_credit !== false}
            onChange={(e) => handleChange('show_developer_credit', e.target.checked ? 1 : 0)}
          />
          Show developer name on invoices / bills
        </label>

        <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', marginTop: '0.75rem', fontSize: '0.9rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={settings.show_paid_stamp !== 0 && settings.show_paid_stamp !== false}
            onChange={(e) => handleChange('show_paid_stamp', e.target.checked ? 1 : 0)}
          />
          Show digital "PAID / وصول شدہ" stamp watermark on fully paid bills
        </label>

        {/* Business Logo & Signature / Stamp Upload */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <ImagePlus size={16} style={{ color: 'var(--primary, #00b3a6)' }} />
            <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent-teal)', margin: 0 }}>Company Logo & Signature / Stamp</h4>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
            Upload your shop or company logo to replace the default icon, and an optional digital signature or official stamp.
          </p>
          <div className="responsive-grid" style={{ display: 'grid', gap: '1rem' }}>
            {/* Logo Upload Card */}
            <div className="surface-block" style={{ padding: '0.85rem 1rem', border: '1px solid var(--border-color)', borderRadius: 10 }}>
              <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.45rem' }}>Company Logo</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                {settings.logo_url ? (
                  <img
                    src={settings.logo_url}
                    alt="Logo preview"
                    style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 8, background: '#ffffff', border: '1px solid var(--border-color)' }}
                  />
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: 8, background: 'var(--surface-secondary)', display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                    Default logo
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}>
                    <ImagePlus size={14} />
                    {settings.logo_url ? 'Upload Custom' : 'Upload Logo'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoPick} />
                  </label>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
                    onClick={() => {
                      handleChange('logo_url', getDefaultLogoDataUrl(settings.company_name));
                      toast.success('Default brand logo applied');
                    }}
                  >
                    Use Default Logo
                  </button>
                  {settings.logo_url && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem', color: 'var(--danger)' }}
                      onClick={() => handleChange('logo_url', '')}
                    >
                      <Trash2 size={13} /> Clear
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Signature / Stamp Upload Card */}
            <div className="surface-block" style={{ padding: '0.85rem 1rem', border: '1px solid var(--border-color)', borderRadius: 10 }}>
              <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.45rem' }}>Digital Signature / Official Stamp</strong>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                {settings.signature_url ? (
                  <img
                    src={settings.signature_url}
                    alt="Signature preview"
                    style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 8, background: '#ffffff', border: '1px solid var(--border-color)' }}
                  />
                ) : (
                  <div style={{ width: 52, height: 52, borderRadius: 8, background: 'var(--surface-secondary)', display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', textAlign: 'center' }}>
                    No stamp
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}>
                    <ImagePlus size={14} />
                    {settings.signature_url ? 'Upload Custom' : 'Upload Image'}
                    <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleSignaturePick} />
                  </label>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem' }}
                    onClick={() => {
                      handleChange('signature_url', getDefaultStampDataUrl(settings.company_name));
                      toast.success('Default official seal stamp applied');
                    }}
                  >
                    Use Default Stamp
                  </button>
                  {settings.signature_url && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: '0.78rem', padding: '0.35rem 0.65rem', color: 'var(--danger)' }}
                      onClick={() => handleChange('signature_url', '')}
                    >
                      <Trash2 size={13} /> Clear
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Custom Brand Accent Color Picker */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <Palette size={16} style={{ color: 'var(--primary, #00b3a6)' }} />
            <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent-teal)', margin: 0 }}>Custom Brand Color</h4>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
            Override the bill accent color with your business's exact color palette.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            {[
              { label: 'Default', hex: '' },
              { label: 'Teal', hex: '#00b3a6' },
              { label: 'Sapphire', hex: '#2563eb' },
              { label: 'Emerald', hex: '#059669' },
              { label: 'Ruby', hex: '#dc2626' },
              { label: 'Amber', hex: '#ea580c' },
              { label: 'Purple', hex: '#7c3aed' },
              { label: 'Slate', hex: '#0f172a' },
            ].map((swatch) => {
              const active = (settings.custom_brand_color || '') === swatch.hex;
              return (
                <button
                  key={swatch.label}
                  type="button"
                  onClick={() => handleChange('custom_brand_color', swatch.hex)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '0.35rem 0.7rem',
                    borderRadius: 20,
                    border: active ? '2px solid var(--primary, #00b3a6)' : '1px solid var(--border-color)',
                    background: active ? 'var(--surface-active, rgba(0, 179, 166, 0.12))' : 'var(--surface-secondary)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: active ? 700 : 500,
                  }}
                >
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      backgroundColor: swatch.hex || '#00b3a6',
                      border: swatch.hex ? 'none' : '1px dashed #888',
                      display: 'inline-block',
                    }}
                  />
                  <span>{swatch.label}</span>
                </button>
              );
            })}
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 6 }}>
              <input
                type="color"
                value={settings.custom_brand_color || '#00b3a6'}
                onChange={(e) => handleChange('custom_brand_color', e.target.value)}
                style={{ width: 32, height: 32, padding: 0, border: 'none', borderRadius: 6, cursor: 'pointer', background: 'transparent' }}
                title="Pick exact hex color"
              />
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                {settings.custom_brand_color || 'Template Default'}
              </span>
            </div>
          </div>
        </div>

        {/* Header Layout Selector */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <Layout size={16} style={{ color: 'var(--primary, #00b3a6)' }} />
            <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent-teal)', margin: 0 }}>Header Layout Style</h4>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
            Choose how your logo, business details, and invoice meta are organized at the top of the bill.
          </p>
          <div className="template-picker-grid">
            {[
              { id: 'split', name: 'Modern Split (Default)', desc: 'Logo and company details on the left, invoice summary on the right.' },
              { id: 'banner', name: 'Full Banner', desc: 'Prominent header banner with glassmorphism invoice card.' },
              { id: 'centered', name: 'Centered Letterhead', desc: 'Elegant boutique style with centered logo and business title.' },
            ].map((layout) => {
              const active = (settings.header_layout || 'split') === layout.id;
              return (
                <button
                  key={layout.id}
                  type="button"
                  className={`template-card ${active ? 'is-active' : ''}`}
                  onClick={() => handleChange('header_layout', layout.id)}
                >
                  <div className="template-card-header">
                    <strong style={{ fontSize: '0.86rem' }}>{layout.name}</strong>
                    {active ? <Check size={16} style={{ color: 'var(--primary, #00b3a6)' }} /> : null}
                  </div>
                  <div className="template-card-tagline">{layout.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Default Bill Template Picker */}
        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
            <Palette size={16} style={{ color: 'var(--primary, #00b3a6)' }} />
            <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent-teal)', margin: 0 }}>Default Bill Style & Template</h4>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
            Choose the company-wide default look for invoices, bills, and payment advices. You can also switch styles on any bill anytime.
          </p>
          <div className="template-picker-grid">
            {INVOICE_TEMPLATES.map((tmpl) => {
              const active = (settings.default_invoice_template || 'classic') === tmpl.id;
              return (
                <button
                  key={tmpl.id}
                  type="button"
                  className={`template-card ${active ? 'is-active' : ''}`}
                  onClick={() => handleChange('default_invoice_template', tmpl.id)}
                >
                  <div className="template-card-header">
                    <div className="template-swatch-badge">
                      <span
                        className="template-swatch-dot"
                        style={{
                          backgroundColor: tmpl.primaryColor,
                          border: tmpl.id === 'minimal' ? '1px solid #71717a' : 'none',
                        }}
                      />
                      <span>{tmpl.name}</span>
                    </div>
                    {active ? <Check size={16} style={{ color: 'var(--primary, #00b3a6)' }} /> : null}
                  </div>
                  <div className="template-card-tagline">{tmpl.tagline}</div>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
            <h4 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--accent-teal)', margin: 0 }}>Bank & Payment Options</h4>
            <button type="button" className="btn-secondary" style={{ width: 'auto', fontSize: '0.78rem' }} onClick={handleAddPaymentMethod}>
              <Plus size={14} /> Add option
            </button>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
            Add every bank / wallet customers can pay into. All options appear on invoices and payment reminders.
          </p>
          {(settings.payment_methods || []).map((method, index) => (
            <div
              key={method.id}
              className="surface-block"
              style={{ padding: '0.85rem', marginBottom: '0.75rem', border: '1px solid var(--border-color)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.65rem' }}>
                <strong style={{ fontSize: '0.85rem' }}>Option {index + 1}</strong>
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ width: 'auto', padding: '0.35rem 0.55rem', fontSize: '0.72rem' }}
                  onClick={() => handleRemovePaymentMethod(method.id)}
                  title="Remove this option"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="settings-form-grid responsive-grid" style={{ display: 'grid', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Label</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="e.g. Meezan, HBL, JazzCash"
                    value={method.label || ''}
                    onChange={(e) => handleMethodChange(method.id, 'label', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Bank Name</label>
                  <input
                    className="form-input"
                    type="text"
                    value={method.bank_name || ''}
                    onChange={(e) => handleMethodChange(method.id, 'bank_name', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Account Title</label>
                  <input
                    className="form-input"
                    type="text"
                    value={method.account_title || ''}
                    onChange={(e) => handleMethodChange(method.id, 'account_title', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Account Number / IBAN</label>
                  <input
                    className="form-input"
                    type="text"
                    value={method.account_number || ''}
                    onChange={(e) => handleMethodChange(method.id, 'account_number', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Raast / JazzCash / EasyPaisa</label>
                  <input
                    className="form-input"
                    type="text"
                    value={method.mobile_wallet || ''}
                    onChange={(e) => handleMethodChange(method.id, 'mobile_wallet', e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes (optional)</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="Branch, preferred method, etc."
                    value={method.notes || ''}
                    onChange={(e) => handleMethodChange(method.id, 'notes', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
          <div className="form-group" style={{ marginTop: '0.5rem' }}>
            <label className="form-label">Payment Instructions (shared)</label>
            <input
              className="form-input"
              type="text"
              value={settings.payment_instructions || ''}
              onChange={(e) => handleChange('payment_instructions', e.target.value)}
            />
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
          <FileBarChart2 size={18} /> Monthly sales report
        </h3>
        <div className="action-row" style={{ marginBottom: '1rem' }}>
          <input className="form-input" type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} />
          <button type="button" className="btn-secondary" onClick={loadMonthlyReport}>Load</button>
          {report && (
            <>
              <button type="button" className="btn-secondary" onClick={exportReportCsv}>Export CSV</button>
              <button type="button" className="btn-secondary" onClick={exportReportPdf}>Export PDF</button>
            </>
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
              <AlertTriangle size={18} /> Remove test records
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '0.35rem' }}>
              Deletes dummy clients and bills from the old Fill test data helper (names with Test, dummy, @example.com). Real clients like Imran Ali are left alone.
            </p>
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label">Type PURGE to enable</label>
            <input
              className="form-input"
              value={purgeConfirm}
              onChange={(e) => setPurgeConfirm(e.target.value)}
              placeholder="PURGE"
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            className="btn-danger"
            onClick={handlePurgeDemo}
            disabled={busy || purgeConfirm.trim() !== 'PURGE'}
            style={{ padding: '0.65rem 1.2rem', width: 'auto', alignSelf: 'flex-start' }}
          >
            <Trash2 size={16} /> Remove test records
          </button>
        </div>
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

      <div className="settings-developer-credit">
        <DeveloperCredit compact />
      </div>
    </div>
  );
}
