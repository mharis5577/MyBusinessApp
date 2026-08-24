import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import {
  LayoutDashboard,
  PlusCircle,
  Plus,
  Database,
  Users,
  Settings,
  Moon,
  Sun,
  Download,
  Lock,
  ArrowDownUp,
  MoreHorizontal,
  Fingerprint,
  Clock,
  Sparkles,
  Users2,
  Crown,
  Compass,
  Heart,
  Package,
} from 'lucide-react';
import DashboardStats from './components/DashboardStats';
import MoreMenu from './components/MoreMenu';
import SplashScreen from './components/SplashScreen';
import BrandMark, { BrandWordmark } from './components/BrandMark';
import DataSafetySheet, { hasSeenDataSafety } from './components/DataSafetySheet';
import ErrorBoundary from './components/ErrorBoundary';
import { apiFetch } from './api/client';
import { playTapSound, playSuccessChime } from './utils/audioEffects';
import { useToast } from './toast/ToastContext';
import { maybeAutoBackup } from './utils/backupManager';
import { dueRemindersEnabled, syncDueReminders } from './utils/dueReminders';
import { loadFullBill } from './utils/loadBill';
import { ensureUrduFont } from './utils/webFonts';
import {
  authenticateBiometric,
  biometricEnabled,
  checkBiometricAvailable,
  lockRequired,
  pinEnabled,
} from './utils/appSecurity';
import { APP_THEMES, getNextQuickTheme, getQuickThemes } from './utils/themeConfig';

const SmartBillForm = lazy(() => import('./components/SmartBillForm'));
const InvoicePreview = lazy(() => import('./components/InvoicePreview'));
const BillsDatabase = lazy(() => import('./components/BillsDatabase'));
const CustomerManager = lazy(() => import('./components/CustomerManager'));
const ProductCatalog = lazy(() => import('./components/ProductCatalog'));
const SettingsManager = lazy(() => import('./components/SettingsManager'));
const CashflowPanel = lazy(() => import('./components/CashflowPanel'));
const AgingReport = lazy(() => import('./components/AgingReport'));
const NotepadPanel = lazy(() => import('./components/NotepadPanel'));
const PartnerEquityPanel = lazy(() => import('./components/PartnerEquityPanel'));

const THEME_KEY = 'elite-chocolate-theme';
const PIN_UNLOCK_KEY = 'elite-chocolate-pin-ok';
const AUTO_LOCK_MS = 2 * 60 * 1000; // re-lock after 2 min in background (only if lock is enabled)

const TAB_ORDER = [
  'dashboard',
  'create',
  'database',
  'customers',
  'catalog',
  'partners',
  'cashflow',
  'aging',
  'notepad',
  'settings',
  'preview',
];

const KEEP_ALIVE_TABS = ['dashboard', 'create', 'database'];

function getInitialTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'chocolatier') return saved;
  } catch (_) {
    /* ignore */
  }
  return 'light';
}

function TabFallback() {
  return (
    <div className="tab-fallback" aria-busy="true">
      Loading…
    </div>
  );
}

export default function App() {
  const toast = useToast();
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [tabDir, setTabDir] = useState('forward');
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
  const [showSplash, setShowSplash] = useState(true);
  const [showDataSafety, setShowDataSafety] = useState(false);
  const [focusBackup, setFocusBackup] = useState(false);
  const [aliveTabs, setAliveTabs] = useState({ dashboard: true });
  const hideAtRef = React.useRef(null);

  const finishSplash = useCallback(() => setShowSplash(false), []);

  const goToTab = useCallback((tab) => {
    if (!tab || tab === currentTab) return;
    playTapSound();
    const from = TAB_ORDER.indexOf(currentTab);
    const to = TAB_ORDER.indexOf(tab);
    setTabDir(from >= 0 && to >= 0 && to < from ? 'back' : 'forward');
    if (KEEP_ALIVE_TABS.includes(tab)) {
      setAliveTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
    }
    setCurrentTab(tab);
    requestAnimationFrame(() => {
      try {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      } catch {
        /* ignore */
      }
    });
  }, [currentTab]);

  const openBackupSettings = useCallback(() => {
    goToTab('settings');
    setFocusBackup(true);
    setMoreOpen(false);
  }, [goToTab]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (_) {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    if (settings.urdu_labels) ensureUrduFont();
  }, [settings.urdu_labels]);

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
    // Defer auto-backup so first open stays responsive on phone
    const t = setTimeout(() => {
      maybeAutoBackup({ offerShare: false }).catch((err) => {
        console.warn('Auto-backup skipped', err);
      });
    }, 60000);
    return () => clearTimeout(t);
  }, [fetchSettings]);

  useEffect(() => {
    checkBiometricAvailable().then((r) => setBioAvailable(Boolean(r.available)));
  }, []);

  useEffect(() => {
    if (!dueRemindersEnabled(settings)) return undefined;
    if (lockRequired(settings) && !unlocked) return undefined;
    const t = setTimeout(() => {
      syncDueReminders(settings).catch((err) => console.warn('Due reminders skipped', err));
    }, 8000);
    return () => clearTimeout(t);
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

  useEffect(() => {
    if (showSplash || needsLock || hasSeenDataSafety()) return undefined;
    const t = setTimeout(() => setShowDataSafety(true), 450);
    return () => clearTimeout(t);
  }, [showSplash, needsLock]);

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
    playSuccessChime();
    goToTab('preview');
  };

  const handleViewBill = async (bill) => {
    try {
      const full = await loadFullBill(bill);
      if (!full?.id) {
        toast.error('Could not open this bill');
        return;
      }
      setSelectedBill(full);
      goToTab('preview');
    } catch (err) {
      toast.error(err?.message || 'Could not open this bill');
    }
  };

  const handleDuplicateBill = async (bill) => {
    try {
      const full = await loadFullBill(bill);
      if (!full?.id) {
        toast.error('Could not duplicate this bill');
        return;
      }
      setDraftBill(full);
      goToTab('create');
    } catch (err) {
      toast.error(err?.message || 'Could not duplicate this bill');
    }
  };

  const handleEditBill = async (bill) => {
    try {
      const full = await loadFullBill(bill);
      if (!full?.id) {
        toast.error('Could not open this bill for editing');
        return;
      }
      setDraftBill({ ...full, isEditing: true });
      goToTab('create');
    } catch (err) {
      toast.error(err?.message || 'Could not open this bill for editing');
    }
  };

  const toggleTheme = () => {
    playTapSound();
    setTheme((prev) => {
      const next = getNextQuickTheme(prev);
      return next;
    });
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
    currentTab === 'cashflow' ||
    currentTab === 'aging' ||
    currentTab === 'notepad' ||
    currentTab === 'settings';

  if (showSplash) {
    return <SplashScreen onDone={finishSplash} minMs={700} />;
  }

  if (needsLock) {
    return (
      <div className="pin-lock-screen">
        <form className="glass-panel pin-lock-card" onSubmit={handlePinSubmit} style={{ padding: '1.75rem 1.5rem', maxWidth: 360, width: '100%' }}>
          <div style={{ margin: '0 auto 1rem', width: 56, height: 56 }}>
            <BrandMark size={56} />
          </div>
          <div style={{ marginBottom: '1.1rem' }}>
            <BrandWordmark subtitle={pinEnabled(settings) ? 'Enter staff PIN' : 'Fingerprint unlock'} />
          </div>
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
            goToTab('dashboard');
          }}
        >
          <span className="brand-mark">
            <BrandMark size={40} />
          </span>
          <BrandWordmark />
        </a>

        <nav className="desktop-nav">
          <button
            className={`nav-btn ${currentTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => goToTab('dashboard')}
          >
            <LayoutDashboard size={17} /> Dashboard
          </button>
          <button className={`nav-btn ${currentTab === 'create' ? 'active' : ''}`} onClick={() => goToTab('create')}>
            <PlusCircle size={17} /> Create Bill
          </button>
          <button
            className={`nav-btn ${currentTab === 'database' ? 'active' : ''}`}
            onClick={() => goToTab('database')}
          >
            <Database size={17} /> Bills
          </button>
          <button
            className={`nav-btn ${currentTab === 'customers' ? 'active' : ''}`}
            onClick={() => goToTab('customers')}
          >
            <Users size={17} /> Clients
          </button>
          <button
            className={`nav-btn ${currentTab === 'catalog' ? 'active' : ''}`}
            onClick={() => goToTab('catalog')}
          >
            <Package size={17} /> Catalog
          </button>
          <button
            className={`nav-btn ${currentTab === 'partners' ? 'active' : ''}`}
            onClick={() => goToTab('partners')}
          >
            <Users2 size={17} /> Partners
          </button>
          <button
            className={`nav-btn ${currentTab === 'cashflow' ? 'active' : ''}`}
            onClick={() => goToTab('cashflow')}
          >
            <ArrowDownUp size={17} /> Cashflow
          </button>
          <button
            className={`nav-btn ${currentTab === 'aging' ? 'active' : ''}`}
            onClick={() => goToTab('aging')}
          >
            <Clock size={17} /> Collections
          </button>
          <button
            className={`nav-btn ${currentTab === 'settings' ? 'active' : ''}`}
            onClick={() => goToTab('settings')}
          >
            <Settings size={17} /> Settings
          </button>
        </nav>

        <div className="navbar-actions">
          {deferredInstall && (
            <button type="button" className="nav-btn icon-only" onClick={handleInstallApp} title="Install app">
              <Download size={18} />
            </button>
          )}
          {lockRequired(settings) && (
            <button type="button" className="nav-btn icon-only" onClick={lockApp} title="Lock app">
              <Lock size={18} />
            </button>
          )}
          <button
            type="button"
            className={`nav-btn icon-only${currentTab === 'settings' ? ' active' : ''}`}
            onClick={() => goToTab('settings')}
            title="Settings"
            aria-label="Settings"
          >
            <Settings size={18} />
          </button>
          <button
            type="button"
            className="nav-btn icon-only"
            onClick={toggleTheme}
            title={`Active: ${APP_THEMES.find((t) => t.id === theme)?.name || theme} (Tap to quick toggle)`}
            aria-label="Toggle App Theme"
          >
            {theme === 'dark' ? (
              <Sun size={18} />
            ) : theme === 'chocolatier' ? (
              <Sparkles size={18} style={{ color: '#d4af37' }} />
            ) : theme === 'emerald' ? (
              <Crown size={18} style={{ color: '#e4c56b' }} />
            ) : theme === 'sapphire' ? (
              <Compass size={18} style={{ color: '#38bdf8' }} />
            ) : theme === 'rose' ? (
              <Heart size={18} style={{ color: '#f4a4b4' }} />
            ) : (
              <Moon size={18} />
            )}
          </button>
        </div>
      </header>

      <main className="app-container">
        {aliveTabs.dashboard && (
          <div
            className={`tab-page${currentTab === 'dashboard' ? ` tab-page--${tabDir}` : ''}`}
            hidden={currentTab !== 'dashboard'}
          >
            <ErrorBoundary label="Home">
              <DashboardStats
                active={currentTab === 'dashboard'}
                onNavigate={(tab) => {
                  if (tab === 'backup') {
                    openBackupSettings();
                    return;
                  }
                  goToTab(tab);
                }}
                onViewBill={handleViewBill}
                currencySymbol={settings.currency_symbol || 'Rs.'}
                settings={settings}
              />
            </ErrorBoundary>
          </div>
        )}

        {aliveTabs.create && (
          <div
            className={`tab-page${currentTab === 'create' ? ` tab-page--${tabDir}` : ''}`}
            hidden={currentTab !== 'create'}
          >
            <ErrorBoundary label="New bill">
              <Suspense fallback={<TabFallback />}>
                <SmartBillForm
                  active={currentTab === 'create'}
                  onBillGenerated={handleBillGenerated}
                  currencySymbol={settings.currency_symbol || 'Rs.'}
                  defaultTaxRate={settings.default_tax_rate ?? 0}
                  draftBill={draftBill}
                  onDraftConsumed={() => setDraftBill(null)}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {aliveTabs.database && (
          <div
            className={`tab-page${currentTab === 'database' ? ` tab-page--${tabDir}` : ''}`}
            hidden={currentTab !== 'database'}
          >
            <ErrorBoundary label="Bills">
              <Suspense fallback={<TabFallback />}>
                <BillsDatabase
                  active={currentTab === 'database'}
                  onViewBill={handleViewBill}
                  onDuplicateBill={handleDuplicateBill}
                  onNavigate={(tab) => goToTab(tab)}
                  currencySymbol={settings.currency_symbol || 'Rs.'}
                  urduLabels={Boolean(settings.urdu_labels)}
                  settings={settings}
                />
              </Suspense>
            </ErrorBoundary>
          </div>
        )}

        {!KEEP_ALIVE_TABS.includes(currentTab) && (
          <div key={currentTab} className={`tab-page tab-page--${tabDir}`}>
            <ErrorBoundary label="Screen" onReset={() => goToTab('dashboard')}>
              <Suspense fallback={<TabFallback />}>
              {currentTab === 'preview' && (
                <InvoicePreview
                  bill={selectedBill}
                  onBack={() => goToTab('database')}
                  onDuplicate={handleDuplicateBill}
                  onEdit={handleEditBill}
                  onBillUpdated={setSelectedBill}
                  currencySymbol={settings.currency_symbol || 'Rs.'}
                  urduLabels={Boolean(settings.urdu_labels)}
                  settings={settings}
                />
              )}

              {currentTab === 'customers' && (
                <CustomerManager
                  currencySymbol={settings.currency_symbol || 'Rs.'}
                  settings={settings}
                  onViewBill={handleViewBill}
                  onDuplicateBill={handleDuplicateBill}
                  onNavigate={(tab) => goToTab(tab)}
                />
              )}

              {currentTab === 'catalog' && (
                <ProductCatalog
                  currencySymbol={settings.currency_symbol || 'Rs.'}
                />
              )}

              {currentTab === 'partners' && (
                <PartnerEquityPanel
                  currencySymbol={settings.currency_symbol || 'Rs.'}
                  settings={settings}
                />
              )}

              {currentTab === 'cashflow' && (
                <CashflowPanel
                  currencySymbol={settings.currency_symbol || 'Rs.'}
                  onNavigate={(tab) => goToTab(tab)}
                  onViewBill={handleViewBill}
                />
              )}

              {currentTab === 'notepad' && <NotepadPanel />}

              {currentTab === 'aging' && (
                <AgingReport
                  currencySymbol={settings.currency_symbol || 'Rs.'}
                  settings={settings}
                  onOpenBill={async (row) => {
                    try {
                      const res = await apiFetch(`/api/bills/${row.id}`);
                      const bill = await res.json();
                      if (res.ok && bill?.id) {
                        setSelectedBill(bill);
                        goToTab('preview');
                        return;
                      }
                    } catch (_) {
                      /* fall through */
                    }
                    goToTab('database');
                  }}
                />
              )}

              {currentTab === 'settings' && (
                <SettingsManager
                  appSettings={settings}
                  onSettingsUpdated={fetchSettings}
                  focusBackup={focusBackup}
                  onFocusHandled={() => setFocusBackup(false)}
                  currentTheme={theme}
                  onThemeChange={(nextTheme) => setTheme(nextTheme)}
                />
              )}
            </Suspense>
            </ErrorBoundary>
          </div>
        )}
      </main>

      <MoreMenu
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        onNavigate={goToTab}
        onOpenBackup={openBackupSettings}
        activeTab={currentTab}
      />

      <DataSafetySheet
        open={showDataSafety}
        onDismiss={() => setShowDataSafety(false)}
        onBackup={openBackupSettings}
        onRestore={openBackupSettings}
      />

      <nav className="mobile-bottom-nav no-print" aria-label="Main">
        <div className="mobile-nav-dock">
          <div className="mobile-nav-side">
            <button
              type="button"
              className={`mobile-nav-item ${currentTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => goToTab('dashboard')}
            >
              <LayoutDashboard size={22} strokeWidth={currentTab === 'dashboard' ? 2.5 : 2} />
              <span>Home</span>
            </button>
            <button
              type="button"
              className={`mobile-nav-item ${currentTab === 'database' ? 'active' : ''}`}
              onClick={() => goToTab('database')}
            >
              <Database size={22} strokeWidth={currentTab === 'database' ? 2.5 : 2} />
              <span>Bills</span>
            </button>
          </div>

          <button
            type="button"
            className={`mobile-nav-fab ${currentTab === 'create' ? 'active' : ''}`}
            onClick={() => goToTab('create')}
            aria-label="Create bill"
          >
            <span className="mobile-nav-fab-disc">
              <Plus size={26} strokeWidth={2.75} />
            </span>
            <span className="mobile-nav-fab-label">New</span>
          </button>

          <div className="mobile-nav-side mobile-nav-side--end">
            <button
              type="button"
              className={`mobile-nav-item ${currentTab === 'customers' ? 'active' : ''}`}
              onClick={() => goToTab('customers')}
            >
              <Users size={22} strokeWidth={currentTab === 'customers' ? 2.5 : 2} />
              <span>Clients</span>
            </button>
            <button
              type="button"
              className={`mobile-nav-item ${moreActive ? 'active' : ''}`}
              onClick={() => setMoreOpen(true)}
            >
              <MoreHorizontal size={22} strokeWidth={moreActive ? 2.5 : 2} />
              <span>More</span>
            </button>
          </div>
        </div>
      </nav>
    </div>
  );
}
