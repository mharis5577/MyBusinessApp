import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard,
  PlusCircle,
  Database,
  Users,
  Package,
  Settings,
  Moon,
  Sun,
  Sparkles,
  Download,
  Lock,
  ArrowDownUp,
  MoreHorizontal,
  Fingerprint,
} from 'lucide-react';
import DashboardStats from './components/DashboardStats';
import SmartBillForm from './components/SmartBillForm';
import InvoicePreview from './components/InvoicePreview';
import BillsDatabase from './components/BillsDatabase';
import CustomerManager from './components/CustomerManager';
import ProductCatalog from './components/ProductCatalog';
import SettingsManager from './components/SettingsManager';
import CashflowPanel from './components/CashflowPanel';
import MoreMenu from './components/MoreMenu';
import { apiFetch } from './api/client';
import { useToast } from './toast/ToastContext';
import { maybeAutoBackup } from './utils/backupManager';
import { dueRemindersEnabled, syncDueReminders } from './utils/dueReminders';
import {
  authenticateBiometric,
  biometricEnabled,
  checkBiometricAvailable,
  lockRequired,
  pinEnabled,
} from './utils/appSecurity';

const THEME_KEY = 'elite-chocolate-theme';
const PIN_UNLOCK_KEY = 'elite-chocolate-pin-ok';
const AUTO_LOCK_MS = 2 * 60 * 1000; // re-lock after 2 min in background (only if lock is enabled)

function getInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch (_) {
    /* ignore */
  }
  return 'light';
}

export default function App() {
  const toast = useToast();
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [selectedBill, setSelectedBill] = useState(null);
  const [draftBill, setDraftBill] = useState(null);
  const [settings, setSettings] = useState({
    currency_symbol: 'Rs.',
    default_tax_rate: 0,
    urdu_labels: 0,
    app_pin: '',
    biometric_lock: 0,
    due_reminders: 0,
  });
  const [theme, setTheme] = useState(getInitialTheme);
  const [unlocked, setUnlocked] = useState(() => {
    try {
      return sessionStorage.getItem(PIN_UNLOCK_KEY) === '1';
    } catch (_) {
      return false;
    }
  });
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [deferredInstall, setDeferredInstall] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const hideAtRef = React.useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (_) {
      /* ignore */
    }
  }, [theme]);

  const fetchSettings = useCallback(() => {
    apiFetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data) setSettings(data);
      })
      .catch((err) => console.error(err));
  }, []);

  useEffect(() => {
    fetchSettings();
    maybeAutoBackup({ offerShare: false }).catch((err) => {
      console.warn('Auto-backup skipped', err);
    });
  }, [fetchSettings]);

  useEffect(() => {
    checkBiometricAvailable().then((r) => setBioAvailable(Boolean(r.available)));
  }, []);

  useEffect(() => {
    if (!dueRemindersEnabled(settings)) return undefined;
    if (lockRequired(settings) && !unlocked) return undefined;
    syncDueReminders(settings).catch((err) => console.warn('Due reminders skipped', err));
    return undefined;
  }, [settings, unlocked]);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredInstall(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const markUnlocked = useCallback(() => {
    setUnlocked(true);
    setPinError('');
    setPinInput('');
    try {
      sessionStorage.setItem(PIN_UNLOCK_KEY, '1');
    } catch (_) {
      /* ignore */
    }
  }, []);

  const lockApp = useCallback(() => {
    if (!lockRequired(settings)) return;
    setUnlocked(false);
    try {
      sessionStorage.removeItem(PIN_UNLOCK_KEY);
    } catch (_) {
      /* ignore */
    }
  }, [settings]);

  // Auto-lock when leaving the app — only if user enabled PIN or fingerprint
  useEffect(() => {
    if (!lockRequired(settings)) return undefined;

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hideAtRef.current = Date.now();
      } else if (document.visibilityState === 'visible' && hideAtRef.current) {
        const away = Date.now() - hideAtRef.current;
        hideAtRef.current = null;
        if (away >= AUTO_LOCK_MS) lockApp();
      }
    };

    let removeAppListener = null;
    (async () => {
      try {
        const { App } = await import('@capacitor/app');
        const handle = await App.addListener('appStateChange', ({ isActive }) => {
          if (!isActive) {
            hideAtRef.current = Date.now();
          } else if (hideAtRef.current) {
            const away = Date.now() - hideAtRef.current;
            hideAtRef.current = null;
            if (away >= AUTO_LOCK_MS) lockApp();
          }
        });
        removeAppListener = () => handle.remove();
      } catch (_) {
        /* web / plugin missing */
      }
    })();

    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      if (removeAppListener) removeAppListener();
    };
  }, [settings, lockApp]);

  // Fingerprint NEVER auto-prompts on first install — only when biometric_lock is ON
  const canUseFingerprint =
    biometricEnabled(settings) && bioAvailable && lockRequired(settings);

  const needsLock = lockRequired(settings) && !unlocked;

  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (!pinEnabled(settings)) {
      // Biometric-only mode: PIN not set — require fingerprint
      setPinError('Turn on fingerprint or set a PIN in Settings');
      return;
    }
    if (pinInput === String(settings.app_pin).trim()) {
      markUnlocked();
    } else {
      setPinError('Incorrect PIN');
    }
  };

  const handleFingerprint = async () => {
    if (!canUseFingerprint) return;
    setBioBusy(true);
    setPinError('');
    try {
      await authenticateBiometric();
      markUnlocked();
    } catch (err) {
      if (err?.message && !/cancel/i.test(err.message)) {
        setPinError('Fingerprint failed — use PIN');
      }
    } finally {
      setBioBusy(false);
    }
  };

  const handleBillGenerated = (newBill) => {
    setSelectedBill(newBill);
    setCurrentTab('preview');
  };

  const handleViewBill = (bill) => {
    setSelectedBill(bill);
    setCurrentTab('preview');
  };

  const handleDuplicateBill = (bill) => {
    setDraftBill(bill);
    setCurrentTab('create');
  };

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  const handleInstallApp = async () => {
    if (!deferredInstall) {
      toast.info('Install is available from your browser menu (Add to Home Screen / Install app).');
      return;
    }
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    setDeferredInstall(null);
  };

  const moreActive =
    currentTab === 'cashflow' || currentTab === 'settings' || currentTab === 'catalog';

  if (needsLock) {
    return (
      <div className="pin-lock-screen">
        <form className="glass-panel pin-lock-card" onSubmit={handlePinSubmit}>
          <div
            className="brand-mark"
            style={{
              margin: '0 auto 1rem',
              width: 48,
              height: 48,
              borderRadius: 14,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--accent-teal)',
              color: 'var(--bg-main)',
            }}
          >
            <Lock size={22} />
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.35rem' }}>ELITE CHOCOLATE</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            {pinEnabled(settings) ? 'Enter staff PIN to unlock' : 'Unlock with fingerprint'}
          </p>
          {pinEnabled(settings) && (
            <input
              className="form-input"
              type="password"
              inputMode="numeric"
              autoFocus
              placeholder="PIN"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              style={{
                textAlign: 'center',
                letterSpacing: '0.35em',
                fontSize: '1.25rem',
                marginBottom: '0.75rem',
              }}
            />
          )}
          {pinError && (
            <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{pinError}</p>
          )}
          {pinEnabled(settings) && (
            <button type="submit" className="btn-primary" style={{ width: '100%' }}>
              Unlock
            </button>
          )}
          {canUseFingerprint && (
            <button
              type="button"
              className="btn-secondary"
              style={{ width: '100%', marginTop: '0.65rem' }}
              disabled={bioBusy}
              onClick={handleFingerprint}
            >
              <Fingerprint size={18} /> {bioBusy ? 'Checking…' : 'Use fingerprint'}
            </button>
          )}
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="navbar no-print">
        <a
          href="#"
          className="brand"
          onClick={(e) => {
            e.preventDefault();
            setCurrentTab('dashboard');
          }}
        >
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          <span className="brand-text">
            ELITE CHOCOLATE
            <small>POS &amp; Bills</small>
          </span>
        </a>

        <nav className="desktop-nav">
          <button
            className={`nav-btn ${currentTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setCurrentTab('dashboard')}
          >
            <LayoutDashboard size={17} /> Dashboard
          </button>
          <button className={`nav-btn ${currentTab === 'create' ? 'active' : ''}`} onClick={() => setCurrentTab('create')}>
            <PlusCircle size={17} /> Create Bill
          </button>
          <button
            className={`nav-btn ${currentTab === 'database' ? 'active' : ''}`}
            onClick={() => setCurrentTab('database')}
          >
            <Database size={17} /> Bills
          </button>
          <button className={`nav-btn ${currentTab === 'catalog' ? 'active' : ''}`} onClick={() => setCurrentTab('catalog')}>
            <Package size={17} /> Items
          </button>
          <button
            className={`nav-btn ${currentTab === 'customers' ? 'active' : ''}`}
            onClick={() => setCurrentTab('customers')}
          >
            <Users size={17} /> Clients
          </button>
          <button
            className={`nav-btn ${currentTab === 'cashflow' ? 'active' : ''}`}
            onClick={() => setCurrentTab('cashflow')}
          >
            <ArrowDownUp size={17} /> Cashflow
          </button>
          <button
            className={`nav-btn ${currentTab === 'settings' ? 'active' : ''}`}
            onClick={() => setCurrentTab('settings')}
          >
            <Settings size={17} /> Settings
          </button>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {deferredInstall && (
            <button className="nav-btn icon-only" onClick={handleInstallApp} title="Install app">
              <Download size={18} />
            </button>
          )}
          {lockRequired(settings) && (
            <button className="nav-btn icon-only" onClick={lockApp} title="Lock app">
              <Lock size={18} />
            </button>
          )}
          <button className="nav-btn icon-only" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <main className="app-container">
        {currentTab === 'dashboard' && (
          <DashboardStats
            onNavigate={(tab) => setCurrentTab(tab)}
            onViewBill={(bill) => {
              setSelectedBill(bill);
              setCurrentTab('preview');
            }}
            currencySymbol={settings.currency_symbol || 'Rs.'}
            settings={settings}
          />
        )}

        {currentTab === 'create' && (
          <SmartBillForm
            onBillGenerated={handleBillGenerated}
            currencySymbol={settings.currency_symbol || 'Rs.'}
            defaultTaxRate={settings.default_tax_rate ?? 0}
            draftBill={draftBill}
            onDraftConsumed={() => setDraftBill(null)}
          />
        )}

        {currentTab === 'preview' && (
          <InvoicePreview
            bill={selectedBill}
            onBack={() => setCurrentTab('database')}
            onDuplicate={handleDuplicateBill}
            onBillUpdated={setSelectedBill}
            currencySymbol={settings.currency_symbol || 'Rs.'}
            urduLabels={Boolean(settings.urdu_labels)}
          />
        )}

        {currentTab === 'database' && (
          <BillsDatabase
            onViewBill={handleViewBill}
            onDuplicateBill={handleDuplicateBill}
            currencySymbol={settings.currency_symbol || 'Rs.'}
            urduLabels={Boolean(settings.urdu_labels)}
            settings={settings}
          />
        )}

        {currentTab === 'catalog' && <ProductCatalog currencySymbol={settings.currency_symbol || 'Rs.'} />}

        {currentTab === 'customers' && <CustomerManager currencySymbol={settings.currency_symbol || 'Rs.'} />}

        {currentTab === 'cashflow' && (
          <CashflowPanel currencySymbol={settings.currency_symbol || 'Rs.'} onNavigate={(tab) => setCurrentTab(tab)} />
        )}

        {currentTab === 'settings' && <SettingsManager onSettingsUpdated={fetchSettings} />}
      </main>

      <MoreMenu open={moreOpen} onClose={() => setMoreOpen(false)} onNavigate={setCurrentTab} activeTab={currentTab} />

      <nav className="mobile-bottom-nav no-print">
        <button
          className={`mobile-nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setCurrentTab('dashboard')}
        >
          <LayoutDashboard size={22} strokeWidth={2.25} />
          <span>Home</span>
        </button>
        <button
          className={`mobile-nav-item ${currentTab === 'create' ? 'active' : ''}`}
          onClick={() => setCurrentTab('create')}
        >
          <PlusCircle size={22} strokeWidth={2.25} />
          <span>New</span>
        </button>
        <button
          className={`mobile-nav-item ${currentTab === 'database' ? 'active' : ''}`}
          onClick={() => setCurrentTab('database')}
        >
          <Database size={22} strokeWidth={2.25} />
          <span>Bills</span>
        </button>
        <button
          className={`mobile-nav-item ${currentTab === 'customers' ? 'active' : ''}`}
          onClick={() => setCurrentTab('customers')}
        >
          <Users size={22} strokeWidth={2.25} />
          <span>Clients</span>
        </button>
        <button className={`mobile-nav-item ${moreActive ? 'active' : ''}`} onClick={() => setMoreOpen(true)}>
          <MoreHorizontal size={22} strokeWidth={2.25} />
          <span>More</span>
        </button>
      </nav>
    </div>
  );
}
