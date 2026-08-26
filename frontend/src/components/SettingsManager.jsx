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
  Sparkles,
  Repeat,
  Cloud,
  Database,
  ChevronDown,
  Building2,
  CreditCard,
  ShieldCheck,
  Wrench,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { populateMockDatabase } from '../utils/mockDataGenerator';
import { playSuccessChime, setSoundEnabled } from '../utils/audioEffects';
import { compressImageToDataUrl } from '../utils/imageCompress';
import { checkBiometricAvailable } from '../utils/appSecurity';
import { cancelDueReminders, requestDueReminderPermission, syncDueReminders, sendTestDueNotification } from '../utils/dueReminders';
import { formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import BackupRestoreModal from './BackupRestoreModal';
import { DeveloperCredit } from './BrandMark';
import AppSelect from './AppSelect';
import { emptyPaymentMethod, getPaymentMethods, withPaymentMethods } from '../utils/paymentMethods';
import { INVOICE_TEMPLATES } from '../utils/invoiceTemplates';
import { getDefaultLogoDataUrl, getDefaultStampDataUrl } from '../utils/defaultBranding';

export default function SettingsManager({
  onSettingsUpdated,
  focusBackup = false,
  onFocusHandled,
  appSettings = null,
  currentTheme = 'dark',
  onThemeChange = null,
}) {
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
    custom_text_color: '',
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
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(null);
  const [reportMonth, setReportMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  useEffect(() => {
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
    setBackupModalOpen(true);
    onFocusHandled?.();
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

  const exportReportPdf = async () => {
    if (!report?.bills?.length) {
      toast.info('Load a month with bills first');
      return;
    }
    try {
      const { downloadTablePdf, exportMoney } = await import('../utils/tableExport');
      const headers = ['Category', 'Invoice #', 'Party / Customer', 'Date', 'Total (Rs.)', 'Paid (Rs.)', 'Balance (Rs.)', 'Status'];
      const rows = report.bills.map((b) => {
        const total = Number(b.total_amount) || 0;
        const paid = Number(b.amount_paid) || 0;
        const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
        let status = b.status || 'pending';
        if (total > 0) {
          if (balance <= 0) status = 'paid';
          else if (status === 'paid') status = 'due';
        }
        const typeLabel =
          b.bill_type === 'supplier'
            ? 'Saudia Buying'
            : b.bill_type === 'help'
            ? 'Help'
            : b.bill_type === 'khata'
            ? 'Credit Khata'
            : 'Sale';

        return [
          typeLabel,
          b.invoice_number || '',
          b.customer_name || '',
          b.bill_date || '',
          exportMoney(total),
          exportMoney(paid),
          exportMoney(balance),
          status.toUpperCase(),
        ];
      });
      const sym = settings.currency_symbol || 'Rs.';

      const summaryCards = [
        { label: 'MONTHLY SALES', value: `${sym} ${exportMoney(report.sales_total)}`, color: [16, 185, 129] },
        { label: 'COLLECTED AMOUNT', value: `${sym} ${exportMoney(report.sales_paid)}`, color: [14, 165, 233] },
        { label: 'BUYING COST', value: `${sym} ${exportMoney(report.buying_total)}`, color: [239, 68, 68] },
        { label: 'ESTIMATED PROFIT', value: `${sym} ${exportMoney(report.estimated_profit)}`, color: [212, 175, 55] },
      ];

      await downloadTablePdf({
        title: `Elite Chocolate — Monthly Report (${report.period})`,
        subtitle: `Period: ${report.period} · ${rows.length} Total Bills Included · Generated on ${new Date().toLocaleDateString('en-PK')}`,
        headers,
        rows,
        summaryCards,
        filename: `Monthly_Report_${report.period}.pdf`,
        landscape: true,
        colWeights: [1.1, 1.2, 1.6, 1.0, 1.1, 1.1, 1.1, 0.8],
      });
      toast.success('Report exported (PDF)');
    } catch (err) {
      if (err?.name !== 'AbortError') toast.error('PDF export failed: ' + err.message);
    }
  };

  const [activeCategory, setActiveCategory] = useState('all');
  const [openSections, setOpenSections] = useState({
    profile: true,
    payments: false,
    branding: false,
    security: false,
    reports: false,
    devtools: false,
  });

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSelectCategory = (cat) => {
    setActiveCategory(cat);
    if (cat !== 'all') {
      setOpenSections((prev) => ({ ...prev, [cat]: true }));
    }
  };

  const expandAllSections = () => {
    setOpenSections({
      profile: true,
      payments: true,
      branding: true,
      security: true,
      reports: true,
      devtools: true,
    });
  };

  const collapseAllSections = () => {
    setOpenSections({
      profile: false,
      payments: false,
      branding: false,
      security: false,
      reports: false,
      devtools: false,
    });
  };

  const shouldShow = (key) => activeCategory === 'all' || activeCategory === key;

  return (
    <div className="settings-page-container">
      {/* Hero Header Card */}
      <div className="settings-hero-header">
        <div className="settings-hero-main">
          <div className="settings-brand-identity">
            <div className="settings-brand-icon-halo">
              <Sliders size={22} />
            </div>
            <div>
              <h2 className="settings-hero-title">
                Settings & Preferences
              </h2>
              <p className="settings-hero-subtitle">
                Store identity, multi-bank accounts, billing templates, audio & security
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexWrap: 'wrap' }}>
            <div className="settings-pills-bar">
              <button
                type="button"
                className="settings-pill-btn"
                onClick={expandAllSections}
              >
                Expand All
              </button>
              <span style={{ width: 1, height: 12, background: 'var(--border-color)', display: 'inline-block' }} />
              <button
                type="button"
                className="settings-pill-btn"
                onClick={collapseAllSections}
              >
                Collapse All
              </button>
            </div>

            <button
              type="button"
              className="btn-primary"
              onClick={handleSubmit}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 1.15rem',
                fontSize: '0.82rem',
                borderRadius: 999,
                width: 'auto',
              }}
            >
              <Save size={15} /> Save All
            </button>
          </div>
        </div>

        {/* Quick Category Filter Pills */}
        <div className="settings-category-bar">
          {[
            { id: 'all', label: 'All Settings', icon: Sliders },
            { id: 'profile', label: 'Store Profile', icon: Building2 },
            { id: 'payments', label: 'Banks & Accounts', icon: CreditCard, count: (settings.payment_methods || []).length },
            { id: 'branding', label: 'Logo & Bill Design', icon: ImagePlus },
            { id: 'security', label: 'Security & Audio', icon: ShieldCheck },
            { id: 'reports', label: 'Sales Reports', icon: FileBarChart2 },
            { id: 'devtools', label: 'System Tools', icon: Wrench },
          ].map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                className={`settings-cat-chip ${isActive ? 'is-active' : ''}`}
                onClick={() => handleSelectCategory(cat.id)}
              >
                <Icon size={14} />
                <span>{cat.label}</span>
                {cat.count !== undefined && (
                  <span style={{ fontSize: '0.68rem', padding: '0.05rem 0.35rem', borderRadius: 999, background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--surface-muted)' }}>
                    {cat.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {/* SECTION 1: Store Profile & Details */}
        {shouldShow('profile') && (
          <div className={`settings-card ${openSections.profile ? 'is-open' : ''}`}>
            <button
              type="button"
              className="settings-card-header"
              onClick={() => toggleSection('profile')}
            >
              <div className="settings-icon-avatar avatar-emerald">
                <Building2 size={22} />
              </div>
              <div className="settings-header-meta">
                <div className="settings-header-line">
                  <h3 className="settings-header-name">Store Profile & Business Details</h3>
                </div>
                <p className="settings-header-desc">
                  Company name, phone, email, currency, NTN tax ID, and address
                </p>
              </div>
              <div className="settings-card-chevron">
                <ChevronDown size={16} />
              </div>
            </button>

            {openSections.profile && (
              <div className="settings-card-body">
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
                    <label className="form-label">Low stock threshold</label>
                    <input className="form-input" type="number" min="0" value={settings.low_stock_threshold ?? 5} onChange={(e) => handleChange('low_stock_threshold', e.target.value)} />
                  </div>
                </div>
                <div className="form-group" style={{ marginTop: '0.85rem' }}>
                  <label className="form-label">Store Address</label>
                  <textarea className="form-textarea" rows={2} value={settings.company_address || ''} onChange={(e) => handleChange('company_address', e.target.value)} />
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION 2: Bank & Payment Options */}
        {shouldShow('payments') && (
          <div className={`settings-card ${openSections.payments ? 'is-open' : ''}`}>
            <button
              type="button"
              className="settings-card-header"
              onClick={() => toggleSection('payments')}
            >
              <div className="settings-icon-avatar avatar-cyan">
                <CreditCard size={22} />
              </div>
              <div className="settings-header-meta">
                <div className="settings-header-line">
                  <h3 className="settings-header-name">Bank & Payment Accounts</h3>
                  <span className="settings-badge-pill">
                    {(settings.payment_methods || []).length} Accounts
                  </span>
                </div>
                <p className="settings-header-desc">
                  Meezan, HBL, EasyPaisa, JazzCash, Raast, and payment instructions
                </p>
              </div>
              <div className="settings-card-chevron">
                <ChevronDown size={16} />
              </div>
            </button>

            {openSections.payments && (
              <div className="settings-card-body">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>
                    Add every bank / wallet customers can pay into. Selectable per bill in the preview toolbar.
                  </p>
                  <button type="button" className="btn-secondary" style={{ width: 'auto', fontSize: '0.75rem', padding: '0.35rem 0.65rem' }} onClick={handleAddPaymentMethod}>
                    <Plus size={13} /> Add Bank Option
                  </button>
                </div>

                {(settings.payment_methods || []).map((method, index) => (
                  <div
                    key={method.id}
                    className="surface-block"
                    style={{ padding: '0.85rem', marginBottom: '0.75rem', border: '1px solid var(--border-color)', borderRadius: 14 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.65rem' }}>
                      <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>Account #{index + 1}</strong>
                      <button
                        type="button"
                        className="btn-secondary"
                        style={{ width: 'auto', padding: '0.3rem 0.5rem', fontSize: '0.72rem', color: 'var(--danger)' }}
                        onClick={() => handleRemovePaymentMethod(method.id)}
                        title="Remove this option"
                      >
                        <Trash2 size={13} /> Remove
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
                        <label className="form-label">Raast / Mobile Wallet #</label>
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
                          placeholder="Branch, special remarks, etc."
                          value={method.notes || ''}
                          onChange={(e) => handleMethodChange(method.id, 'notes', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}

                <div className="form-group" style={{ marginTop: '0.75rem' }}>
                  <label className="form-label">Payment Instructions (shared note on bills)</label>
                  <input
                    className="form-input"
                    type="text"
                    placeholder="e.g. Please share payment receipt on WhatsApp"
                    value={settings.payment_instructions || ''}
                    onChange={(e) => handleChange('payment_instructions', e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION 3: Branding, Logo & Stamp */}
        {shouldShow('branding') && (
          <div className={`settings-card ${openSections.branding ? 'is-open' : ''}`}>
            <button
              type="button"
              className="settings-card-header"
              onClick={() => toggleSection('branding')}
            >
              <div className="settings-icon-avatar avatar-purple">
                <ImagePlus size={22} />
              </div>
              <div className="settings-header-meta">
                <div className="settings-header-line">
                  <h3 className="settings-header-name">Logo, Stamp & Bill Styling</h3>
                </div>
                <p className="settings-header-desc">
                  Official brand logo, seal stamp, Urdu Nastaliq typography, and PAID watermark
                </p>
              </div>
              <div className="settings-card-chevron">
                <ChevronDown size={16} />
              </div>
            </button>

            {openSections.branding && (
              <div className="settings-card-body">
                <div className="responsive-grid" style={{ display: 'grid', gap: '1rem', marginBottom: '1rem' }}>
                  {/* Logo Card */}
                  <div className="surface-block" style={{ padding: '0.85rem 1rem', border: '1px solid var(--border-color)', borderRadius: 14 }}>
                    <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.45rem' }}>Company Logo</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                      {settings.logo_url ? (
                        <img
                          src={settings.logo_url}
                          alt="Logo preview"
                          style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 10, background: '#ffffff', border: '1px solid var(--border-color)' }}
                        />
                      ) : (
                        <div style={{ width: 52, height: 52, borderRadius: 10, background: 'var(--surface-secondary)', display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                          Default logo
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}>
                          <ImagePlus size={13} />
                          {settings.logo_url ? 'Upload Custom' : 'Upload Logo'}
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoPick} />
                        </label>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                          onClick={() => {
                            handleChange('logo_url', getDefaultLogoDataUrl(settings.company_name));
                            toast.success('Default brand logo applied');
                          }}
                        >
                          Default Logo
                        </button>
                        {settings.logo_url && (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', color: 'var(--danger)' }}
                            onClick={() => handleChange('logo_url', '')}
                          >
                            <Trash2 size={12} /> Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stamp Card */}
                  <div className="surface-block" style={{ padding: '0.85rem 1rem', border: '1px solid var(--border-color)', borderRadius: 14 }}>
                    <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.45rem' }}>Digital Signature / Seal Stamp</strong>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem', flexWrap: 'wrap' }}>
                      {settings.signature_url ? (
                        <img
                          src={settings.signature_url}
                          alt="Signature preview"
                          style={{ width: 52, height: 52, objectFit: 'contain', borderRadius: 10, background: '#ffffff', border: '1px solid var(--border-color)' }}
                        />
                      ) : (
                        <div style={{ width: 52, height: 52, borderRadius: 10, background: 'var(--surface-secondary)', display: 'grid', placeItems: 'center', color: 'var(--text-muted)', fontSize: '0.7rem', textAlign: 'center' }}>
                          No stamp
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
                        <label className="btn-secondary" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}>
                          <ImagePlus size={13} />
                          {settings.signature_url ? 'Upload Custom' : 'Upload Stamp'}
                          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={handleSignaturePick} />
                        </label>
                        <button
                          type="button"
                          className="btn-secondary"
                          style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem' }}
                          onClick={() => {
                            handleChange('signature_url', getDefaultStampDataUrl(settings.company_name));
                            toast.success('Default official seal applied');
                          }}
                        >
                          Default Seal
                        </button>
                        {settings.signature_url && (
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ fontSize: '0.75rem', padding: '0.35rem 0.65rem', color: 'var(--danger)' }}
                            onClick={() => handleChange('signature_url', '')}
                          >
                            <Trash2 size={12} /> Clear
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Toggles */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  <label className="settings-toggle-row">
                    <div className="settings-toggle-info">
                      <span className="settings-toggle-label">
                        Bilingual English + Urdu labels (Nastaliq)
                      </span>
                      <span className="settings-toggle-hint">
                        Render Nastaliq font labels on PDF invoices, thermal slips and receipts
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      style={{ width: 18, height: 18 }}
                      checked={Boolean(Number(settings.urdu_labels))}
                      onChange={(e) => handleChange('urdu_labels', e.target.checked ? 1 : 0)}
                    />
                  </label>

                  <label className="settings-toggle-row">
                    <div className="settings-toggle-info">
                      <span className="settings-toggle-label">
                        Digital "PAID / وصول شدہ" stamp watermark
                      </span>
                      <span className="settings-toggle-hint">
                        Display official luxury watermark when total balance is fully paid
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      style={{ width: 18, height: 18 }}
                      checked={settings.show_paid_stamp !== 0 && settings.show_paid_stamp !== false}
                      onChange={(e) => handleChange('show_paid_stamp', e.target.checked ? 1 : 0)}
                    />
                  </label>

                  <label className="settings-toggle-row">
                    <div className="settings-toggle-info">
                      <span className="settings-toggle-label">
                        Show developer credit badge on bills
                      </span>
                      <span className="settings-toggle-hint">
                        Display discreet footer badge acknowledging app author
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      style={{ width: 18, height: 18 }}
                      checked={settings.show_developer_credit !== 0 && settings.show_developer_credit !== false}
                      onChange={(e) => handleChange('show_developer_credit', e.target.checked ? 1 : 0)}
                    />
                  </label>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION 4: Security, Notifications & Audio */}
        {shouldShow('security') && (
          <div className={`settings-card ${openSections.security ? 'is-open' : ''}`}>
            <button
              type="button"
              className="settings-card-header"
              onClick={() => toggleSection('security')}
            >
              <div className="settings-icon-avatar avatar-amber">
                <ShieldCheck size={22} />
              </div>
              <div className="settings-header-meta">
                <div className="settings-header-line">
                  <h3 className="settings-header-name">Security, Alerts & Sound</h3>
                </div>
                <p className="settings-header-desc">
                  Staff PIN lock, biometric fingerprint, due reminders, and luxury audio chimes
                </p>
              </div>
              <div className="settings-card-chevron">
                <ChevronDown size={16} />
              </div>
            </button>

            {openSections.security && (
              <div className="settings-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label className="form-label">Staff PIN Lock (leave blank for no lock)</label>
                  <input className="form-input" type="password" inputMode="numeric" placeholder="e.g. 1234" value={settings.app_pin || ''} onChange={(e) => handleChange('app_pin', e.target.value)} />
                </div>

                {/* Fingerprint Toggle */}
                <div className="settings-toggle-row">
                  <div className="settings-toggle-info">
                    <span className="settings-toggle-label">
                      <Fingerprint size={16} /> Unlock with fingerprint
                    </span>
                    <span className="settings-toggle-hint">
                      Off by default. {bioAvailable ? 'Device biometric sensor is ready.' : '(Sensor not detected on this browser/device.)'}
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    style={{ width: 18, height: 18 }}
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
                </div>

                {/* Due Date Notifications Toggle */}
                <div className="settings-toggle-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="settings-toggle-info">
                      <span className="settings-toggle-label">
                        <Bell size={16} /> Due-date notifications
                      </span>
                      <span className="settings-toggle-hint">
                        Daily at 10:00 AM on Android APK to notify you about overdue client bills.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      style={{ width: 18, height: 18 }}
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
                  </div>
                  {Boolean(Number(settings.due_reminders)) && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: 'auto', marginTop: '0.65rem', fontSize: '0.75rem', padding: '0.3rem 0.65rem', alignSelf: 'flex-start' }}
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
                      <Bell size={13} /> Send test notification
                    </button>
                  )}
                </div>

                {/* Sound Effects Toggle */}
                <div className="settings-toggle-row" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div className="settings-toggle-info">
                      <span className="settings-toggle-label">
                        <Volume2 size={16} /> Luxury Audio & Sound Effects
                      </span>
                      <span className="settings-toggle-hint">
                        Subtle luxury clicks on button taps and melodic chimes on payment & bill saving.
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      style={{ width: 18, height: 18 }}
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
                  </div>
                  {(settings.sound_effects !== 0 && settings.sound_effects !== false) && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: 'auto', marginTop: '0.65rem', fontSize: '0.75rem', padding: '0.3rem 0.65rem', alignSelf: 'flex-start' }}
                      onClick={() => {
                        playSuccessChime();
                        toast.success('Playing audio chime preview 🔔');
                      }}
                    >
                      <Volume2 size={13} /> Test sound effect
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* SECTION 5: Monthly Sales Report */}
        {shouldShow('reports') && (
          <div className={`settings-card ${openSections.reports ? 'is-open' : ''}`}>
            <button
              type="button"
              className="settings-card-header"
              onClick={() => toggleSection('reports')}
            >
              <div className="settings-icon-avatar avatar-indigo">
                <FileBarChart2 size={22} />
              </div>
              <div className="settings-header-meta">
                <div className="settings-header-line">
                  <h3 className="settings-header-name">Monthly Financial Reports</h3>
                </div>
                <p className="settings-header-desc">
                  View period totals, buying costs, estimated profit, and export PDF statement
                </p>
              </div>
              <div className="settings-card-chevron">
                <ChevronDown size={16} />
              </div>
            </button>

            {openSections.reports && (
              <div className="settings-card-body">
                <div className="action-row" style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <input className="form-input" type="month" value={reportMonth} onChange={(e) => setReportMonth(e.target.value)} style={{ width: 'auto', minWidth: 160 }} />
                  <button type="button" className="btn-secondary" onClick={loadMonthlyReport} style={{ width: 'auto' }}>Load Report</button>
                  {report && (
                    <button type="button" className="btn-secondary" onClick={exportReportPdf} style={{ width: 'auto' }}>Export PDF</button>
                  )}
                </div>
                {report && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.75rem' }}>
                    <div className="surface-block" style={{ padding: '0.75rem', borderRadius: 12 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Sales total</div>
                      <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}>{formatCurrency(settings.currency_symbol || 'Rs.', report.sales_total)}</div>
                    </div>
                    <div className="surface-block" style={{ padding: '0.75rem', borderRadius: 12 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Collected</div>
                      <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}>{formatCurrency(settings.currency_symbol || 'Rs.', report.sales_paid)}</div>
                    </div>
                    <div className="surface-block" style={{ padding: '0.75rem', borderRadius: 12 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Buying cost</div>
                      <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '0.95rem' }}>{formatCurrency(settings.currency_symbol || 'Rs.', report.buying_total)}</div>
                    </div>
                    <div className="surface-block" style={{ padding: '0.75rem', borderRadius: 12 }}>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Est. profit</div>
                      <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '0.95rem', color: 'var(--success)' }}>{formatCurrency(settings.currency_symbol || 'Rs.', report.estimated_profit)}</div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* SECTION 6: Developer Tools & Database Maintenance */}
        {shouldShow('devtools') && (
          <div className={`settings-card ${openSections.devtools ? 'is-open' : ''}`}>
            <button
              type="button"
              className="settings-card-header"
              onClick={() => toggleSection('devtools')}
            >
              <div className="settings-icon-avatar avatar-rose">
                <Wrench size={22} />
              </div>
              <div className="settings-header-meta">
                <div className="settings-header-line">
                  <h3 className="settings-header-name">System Maintenance & Database</h3>
                </div>
                <p className="settings-header-desc">
                  Generate mock products & sample bills, remove test records, and nuclear database wipe
                </p>
              </div>
              <div className="settings-card-chevron">
                <ChevronDown size={16} />
              </div>
            </button>

            {openSections.devtools && (
              <div className="settings-card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Seed Realistic Mock Data */}
                <div className="surface-block" style={{ padding: '1rem', border: '1px solid rgba(56, 189, 248, 0.3)', background: 'rgba(56, 189, 248, 0.05)', borderRadius: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <div>
                      <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--info, #38bdf8)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Database size={15} /> Populate Mock Data for Testing
                      </h4>
                      <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Instantly generates realistic chocolate products (truffles, pralines, bars), customer accounts, and sample sales invoices with receipts.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-primary"
                      disabled={busy}
                      style={{
                        background: 'linear-gradient(135deg, #38bdf8, #0284c7)',
                        color: '#ffffff',
                        fontWeight: 800,
                        padding: '0.45rem 1rem',
                        fontSize: '0.78rem',
                        width: 'auto',
                        alignSelf: 'flex-start',
                      }}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          toast.info('Generating mock products, customers, and bills...');
                          const res = await populateMockDatabase();
                          toast.success(`🎉 Mock Data Created! Generated ${res.products} products, ${res.customers} clients, and ${res.bills} sample bills.`);
                          if (onSettingsUpdated) onSettingsUpdated();
                        } catch (err) {
                          toast.error('Mock data generation failed: ' + err.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Database size={14} /> Generate Mock Test Data
                    </button>
                  </div>
                </div>

                {/* Remove test records */}
                <div className="surface-block" style={{ padding: '1rem', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)', borderRadius: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <div>
                      <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--danger)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <AlertTriangle size={15} /> Remove test records
                      </h4>
                      <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Deletes dummy clients and bills (names with Test, dummy, @example.com). Real clients are left alone.
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
                      style={{ padding: '0.45rem 1rem', fontSize: '0.78rem', width: 'auto', alignSelf: 'flex-start' }}
                    >
                      <Trash2 size={14} /> Remove test records
                    </button>
                  </div>
                </div>

                {/* Nuclear wipe */}
                <div className="surface-block" style={{ padding: '1rem', border: '1px solid rgba(239, 68, 68, 0.3)', background: 'rgba(239, 68, 68, 0.05)', borderRadius: 14 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <div>
                      <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--danger)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <AlertTriangle size={15} /> Clean / Reset Database
                      </h4>
                      <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
                        Nuclear wipe of bills, catalog, and clients. An automatic pre-wipe backup snapshot is created first.
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
                      style={{ padding: '0.45rem 1rem', fontSize: '0.78rem', width: 'auto', alignSelf: 'flex-start' }}
                    >
                      <Trash2 size={14} /> Wipe All Data
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Floating / Sticky Save Action Bar */}
        <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
          {savedMsg ? (
            <div style={{ background: 'rgba(16,185,129,0.2)', color: 'var(--success)', padding: '0.45rem 0.9rem', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Check size={15} /> Settings Saved Successfully!
            </div>
          ) : <div />}
          <button type="submit" className="btn-primary" style={{ padding: '0.75rem 2rem', fontSize: '0.92rem', borderRadius: 12, width: 'auto' }}>
            <Save size={18} /> Save Settings
          </button>
        </div>
      </form>

      <div className="settings-developer-credit">
        <DeveloperCredit compact />
      </div>
    </div>
  );
}
