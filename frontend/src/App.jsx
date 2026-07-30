import React, { useState, useEffect } from 'react';
import { LayoutDashboard, PlusCircle, Database, Users, Package, Settings, Moon, Sun, Sparkles, Download, Lock, Wallet } from 'lucide-react';
import DashboardStats from './components/DashboardStats';
import SmartBillForm from './components/SmartBillForm';
import InvoicePreview from './components/InvoicePreview';
import BillsDatabase from './components/BillsDatabase';
import CustomerManager from './components/CustomerManager';
import ProductCatalog from './components/ProductCatalog';
import SettingsManager from './components/SettingsManager';
import AdvancesManager from './components/AdvancesManager';
import { apiFetch } from './api/client';

const THEME_KEY = 'elite-chocolate-theme';
const PIN_UNLOCK_KEY = 'elite-chocolate-pin-ok';

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
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [selectedBill, setSelectedBill] = useState(null);
  const [draftBill, setDraftBill] = useState(null);
  const [settings, setSettings] = useState({ currency_symbol: 'Rs.', default_tax_rate: 0, urdu_labels: 0, app_pin: '' });
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

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (_) {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    fetchSettings();
  }, []);

  useEffect(() => {
    const handler = (e) => {
      e.preventDefault();
      setDeferredInstall(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const fetchSettings = () => {
    apiFetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data) setSettings(data);
      })
      .catch((err) => console.error(err));
  };

  const pinRequired = Boolean(settings.app_pin && String(settings.app_pin).trim());
  const needsPin = pinRequired && !unlocked;

  const handlePinSubmit = (e) => {
    e.preventDefault();
    if (pinInput === String(settings.app_pin).trim()) {
      setUnlocked(true);
      setPinError('');
      setPinInput('');
      try {
        sessionStorage.setItem(PIN_UNLOCK_KEY, '1');
      } catch (_) {
        /* ignore */
      }
    } else {
      setPinError('Incorrect PIN');
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
      alert('Install is available from your browser menu (Add to Home Screen / Install app).');
      return;
    }
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    setDeferredInstall(null);
  };

  if (needsPin) {
    return (
      <div className="pin-lock-screen">
        <form className="glass-panel pin-lock-card" onSubmit={handlePinSubmit}>
          <div className="brand-mark" style={{ margin: '0 auto 1rem', width: 48, height: 48, borderRadius: 14, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--accent-teal)', color: 'var(--bg-main)' }}>
            <Lock size={22} />
          </div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '0.35rem' }}>ELITE CHOCOLATE</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>Enter staff PIN to unlock</p>
          <input
            className="form-input"
            type="password"
            inputMode="numeric"
            autoFocus
            placeholder="PIN"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            style={{ textAlign: 'center', letterSpacing: '0.35em', fontSize: '1.25rem', marginBottom: '0.75rem' }}
          />
          {pinError && <p style={{ color: 'var(--danger)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{pinError}</p>}
          <button type="submit" className="btn-primary" style={{ width: '100%' }}>Unlock</button>
        </form>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="navbar no-print">
        <a href="#" className="brand" onClick={(e) => { e.preventDefault(); setCurrentTab('dashboard'); }}>
          <span className="brand-mark">
            <Sparkles size={18} />
          </span>
          <span className="brand-text">
            ELITE CHOCOLATE
            <small>POS &amp; Bills</small>
          </span>
        </a>

        <nav className="desktop-nav">
          <button className={`nav-btn ${currentTab === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentTab('dashboard')}>
            <LayoutDashboard size={17} /> Dashboard
          </button>
          <button className={`nav-btn ${currentTab === 'create' ? 'active' : ''}`} onClick={() => setCurrentTab('create')}>
            <PlusCircle size={17} /> Create Bill
          </button>
          <button className={`nav-btn ${currentTab === 'database' ? 'active' : ''}`} onClick={() => setCurrentTab('database')}>
            <Database size={17} /> Bills
          </button>
          <button className={`nav-btn ${currentTab === 'catalog' ? 'active' : ''}`} onClick={() => setCurrentTab('catalog')}>
            <Package size={17} /> Items
          </button>
          <button className={`nav-btn ${currentTab === 'customers' ? 'active' : ''}`} onClick={() => setCurrentTab('customers')}>
            <Users size={17} /> Clients
          </button>
          <button className={`nav-btn ${currentTab === 'advances' ? 'active' : ''}`} onClick={() => setCurrentTab('advances')}>
            <Wallet size={17} /> Advances
          </button>
          <button className={`nav-btn ${currentTab === 'settings' ? 'active' : ''}`} onClick={() => setCurrentTab('settings')}>
            <Settings size={17} /> Settings
          </button>
        </nav>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          {deferredInstall && (
            <button className="nav-btn icon-only" onClick={handleInstallApp} title="Install app">
              <Download size={18} />
            </button>
          )}
          <button className="nav-btn icon-only mobile-only" onClick={() => setCurrentTab('settings')} title="Settings">
            <Settings size={18} />
          </button>
          <button className="nav-btn icon-only" onClick={toggleTheme} title="Toggle theme">
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <main className="app-container">
        {currentTab === 'dashboard' && (
          <DashboardStats
            onNavigate={(tab) => setCurrentTab(tab)}
            currencySymbol={settings.currency_symbol || 'Rs.'}
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

        {currentTab === 'catalog' && (
          <ProductCatalog currencySymbol={settings.currency_symbol || 'Rs.'} />
        )}

        {currentTab === 'customers' && (
          <CustomerManager currencySymbol={settings.currency_symbol || 'Rs.'} />
        )}

        {currentTab === 'advances' && (
          <AdvancesManager currencySymbol={settings.currency_symbol || 'Rs.'} />
        )}

        {currentTab === 'settings' && (
          <SettingsManager onSettingsUpdated={fetchSettings} />
        )}
      </main>

      <nav className="mobile-bottom-nav no-print">
        <button className={`mobile-nav-item ${currentTab === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentTab('dashboard')}>
          <LayoutDashboard size={22} strokeWidth={2.25} />
          <span>Home</span>
        </button>
        <button className={`mobile-nav-item ${currentTab === 'create' ? 'active' : ''}`} onClick={() => setCurrentTab('create')}>
          <PlusCircle size={22} strokeWidth={2.25} />
          <span>New</span>
        </button>
        <button className={`mobile-nav-item ${currentTab === 'database' ? 'active' : ''}`} onClick={() => setCurrentTab('database')}>
          <Database size={22} strokeWidth={2.25} />
          <span>Bills</span>
        </button>
        <button className={`mobile-nav-item ${currentTab === 'catalog' ? 'active' : ''}`} onClick={() => setCurrentTab('catalog')}>
          <Package size={22} strokeWidth={2.25} />
          <span>Items</span>
        </button>
        <button className={`mobile-nav-item ${currentTab === 'customers' ? 'active' : ''}`} onClick={() => setCurrentTab('customers')}>
          <Users size={22} strokeWidth={2.25} />
          <span>Clients</span>
        </button>
      </nav>
    </div>
  );
}
