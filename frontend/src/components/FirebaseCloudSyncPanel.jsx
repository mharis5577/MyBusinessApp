import React, { useState, useEffect } from 'react';
import {
  Cloud,
  CloudUpload,
  CloudDownload,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Smartphone,
  Database,
  Lock,
  Eye,
  EyeOff,
  Settings,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useToast } from '../toast/ToastContext';
import { apiFetch } from '../api/client';
import {
  pushToCloudVault,
  pullFromCloudVault,
  inspectCloudVault,
  getLastCloudSyncInfo,
  normalizeVaultId,
  getStoredFirebaseConfig,
  saveStoredFirebaseConfig,
  DEFAULT_FIREBASE_CONFIG,
} from '../utils/firebaseSync';
import {
  restoreFromPayload,
  runFullBackup,
} from '../utils/backupManager';

export default function FirebaseCloudSyncPanel({ companyPhone = '', appPin = '', onRestoreComplete }) {
  const toast = useToast();
  const [tab, setTab] = useState('push'); // 'push' | 'pull' | 'config'
  const [vaultId, setVaultId] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [deviceName, setDeviceName] = useState('POS Terminal');
  const [busy, setBusy] = useState(false);
  const [lastInfo, setLastInfo] = useState(null);
  const [cloudPreview, setCloudPreview] = useState(null);
  const [inspecting, setInspecting] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);

  // In-app notices (replaces browser window.confirm alerts)
  const [pinMismatchNotice, setPinMismatchNotice] = useState(null);
  const [pullConfirmNotice, setPullConfirmNotice] = useState(null);

  // Firebase Config state
  const [fbConfig, setFbConfig] = useState(getStoredFirebaseConfig);
  const [isUsingCustomConfig, setIsUsingCustomConfig] = useState(false);

  useEffect(() => {
    const defaultVault = companyPhone
      ? normalizeVaultId(companyPhone)
      : 'elite_chocolate_store';
    setVaultId((prev) => prev || defaultVault);
    setPin((prev) => prev || appPin || '');
    setLastInfo(getLastCloudSyncInfo());
    const stored = getStoredFirebaseConfig();
    setFbConfig(stored);
    setIsUsingCustomConfig(Boolean(stored && stored.projectId !== DEFAULT_FIREBASE_CONFIG.projectId));
  }, [companyPhone, appPin]);

  const handleInspect = async () => {
    if (!vaultId.trim()) {
      toast.error('Enter a Vault ID first');
      return;
    }
    setInspecting(true);
    setCloudPreview(null);
    try {
      const res = await inspectCloudVault({ vaultId });
      setCloudPreview(res);
      if (!res.exists) {
        toast.info(`No cloud vault found for "${vaultId}". Push a backup first.`);
      } else {
        toast.success(`Cloud vault found! Last updated: ${new Date(res.updatedAt).toLocaleString()}`);
      }
    } catch (err) {
      toast.error('Cloud check failed: ' + err.message);
    } finally {
      setInspecting(false);
    }
  };

  const handlePush = async (e) => {
    e.preventDefault();
    setPinMismatchNotice(null);
    if (!vaultId.trim()) {
      toast.error('Vault ID is required');
      return;
    }
    if (!pin.trim() || pin.trim().length < 4) {
      toast.error('PIN code must be at least 4 digits');
      return;
    }

    setBusy(true);
    try {
      toast.info('Preparing local shop backup data...');
      let payload;
      try {
        const res = await apiFetch('/api/backup');
        payload = await res.json();
      } catch (_) {
        throw new Error('Could not fetch local shop data');
      }

      toast.info('Uploading to Firebase Cloud Vault...');
      try {
        const syncInfo = await pushToCloudVault({
          vaultId,
          pin,
          payload,
          deviceName,
        });
        setLastInfo(syncInfo);
        toast.success('🎉 Backup successfully pushed to Cloud Vault!');
      } catch (err) {
        if (err?.code === 'PIN_MISMATCH' || err?.message?.includes('PIN_MISMATCH')) {
          setPinMismatchNotice({ vaultId, pin, payload, deviceName });
          toast.info('🔑 Cloud Vault PIN mismatch. Choose below to update Vault PIN.');
        } else {
          throw err;
        }
      }
    } catch (err) {
      toast.error('Cloud Push Failed: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleStartPull = (e) => {
    e.preventDefault();
    if (!vaultId.trim()) {
      toast.error('Vault ID is required');
      return;
    }
    if (!pin.trim()) {
      toast.error('PIN Code is required to restore cloud backup');
      return;
    }
    setPullConfirmNotice({ vaultId, pin });
  };

  const handleExecutePull = async () => {
    if (!pullConfirmNotice) return;
    const { vaultId: vId, pin: pCode } = pullConfirmNotice;
    setPullConfirmNotice(null);
    setBusy(true);

    try {
      toast.info('Saving safety pre-restore copy of local data...');
      await runFullBackup({ reason: 'pre-restore', offerDriveShare: false, pretty: false }).catch(() => {});

      toast.info('Downloading from Firebase Cloud Vault...');
      const { syncInfo, payload } = await pullFromCloudVault({
        vaultId: vId,
        pin: pCode,
      });

      toast.info('Restoring shop data into local database...');
      await restoreFromPayload(payload, { skipPreSnapshot: true });

      setLastInfo(syncInfo);
      toast.success('✅ Cloud restore complete! Local data updated.');
      if (onRestoreComplete) onRestoreComplete();
    } catch (err) {
      toast.error('Cloud Restore Failed: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveConfig = (e) => {
    e.preventDefault();
    try {
      if (!fbConfig.apiKey || !fbConfig.projectId) {
        toast.error('API Key and Project ID are required');
        return;
      }
      saveStoredFirebaseConfig(fbConfig);
      setIsUsingCustomConfig(fbConfig.projectId !== DEFAULT_FIREBASE_CONFIG.projectId);
      toast.success('Firebase Project Credentials saved!');
    } catch (err) {
      toast.error('Save failed: ' + err.message);
    }
  };

  const handleResetConfig = () => {
    saveStoredFirebaseConfig(null);
    setFbConfig(DEFAULT_FIREBASE_CONFIG);
    setIsUsingCustomConfig(false);
    toast.info('Reset to default Firebase configuration.');
  };

  return (
    <div
      style={{
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.14), rgba(28, 28, 26, 0.95))',
        border: '1px solid rgba(245, 158, 11, 0.4)',
        borderRadius: 16,
        marginBottom: '1.25rem',
        overflow: 'hidden',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '1.1rem 1.25rem',
          background: 'rgba(245, 158, 11, 0.1)',
          borderBottom: isExpanded ? '1px solid rgba(245, 158, 11, 0.25)' : 'none',
          cursor: 'pointer',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              padding: '0.55rem',
              background: 'rgba(245, 158, 11, 0.22)',
              border: '1px solid rgba(245, 158, 11, 0.45)',
              borderRadius: 12,
              color: '#f59e0b',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Cloud size={22} />
          </div>
          <div>
            <strong style={{ fontSize: '1rem', color: '#fde68a', display: 'block', marginBottom: '2px' }}>
              Firebase Cloud Sync & Backup Vault
            </strong>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #c4c2b8)' }}>
              PIN-protected cloud backup to sync or restore data across multiple devices
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {lastInfo && (
            <span style={{ fontSize: '0.72rem', background: 'rgba(52, 168, 83, 0.2)', color: 'var(--success)', padding: '0.2rem 0.55rem', borderRadius: 6, fontWeight: 700 }}>
              Synced {new Date(lastInfo.updatedAt).toLocaleDateString()}
            </span>
          )}
          <button
            type="button"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              color: 'var(--text-secondary)',
              padding: '0.35rem',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        </div>
      </div>

      {/* Expanded Panel Body */}
      {isExpanded && (
        <div>
          {/* Mode Tabs */}
          <div
            style={{
              display: 'flex',
              gap: '0.5rem',
              padding: '0.6rem 1.25rem',
              background: 'var(--surface-muted, #1c1c1a)',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            <button
              type="button"
              onClick={() => { setTab('push'); setPinMismatchNotice(null); setPullConfirmNotice(null); }}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                padding: '0.55rem 0.8rem',
                borderRadius: '10px',
                fontWeight: 750,
                fontSize: '0.82rem',
                cursor: 'pointer',
                border: tab === 'push' ? '1px solid #f59e0b' : '1px solid transparent',
                background: tab === 'push' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
                color: tab === 'push' ? '#fde68a' : 'var(--text-secondary)',
                transition: 'all 0.2s ease',
              }}
            >
              <CloudUpload size={16} />
              <span>Push Backup (Upload)</span>
            </button>
            <button
              type="button"
              onClick={() => { setTab('pull'); setPinMismatchNotice(null); setPullConfirmNotice(null); }}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                padding: '0.55rem 0.8rem',
                borderRadius: '10px',
                fontWeight: 750,
                fontSize: '0.82rem',
                cursor: 'pointer',
                border: tab === 'pull' ? '1px solid #38bdf8' : '1px solid transparent',
                background: tab === 'pull' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
                color: tab === 'pull' ? '#bae6fd' : 'var(--text-secondary)',
                transition: 'all 0.2s ease',
              }}
            >
              <CloudDownload size={16} />
              <span>Restore Vault (Download)</span>
            </button>
            <button
              type="button"
              onClick={() => { setTab('config'); setPinMismatchNotice(null); setPullConfirmNotice(null); }}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                padding: '0.55rem 0.8rem',
                borderRadius: '10px',
                fontWeight: 750,
                fontSize: '0.82rem',
                cursor: 'pointer',
                border: tab === 'config' ? '1px solid var(--accent-teal)' : '1px solid transparent',
                background: tab === 'config' ? 'rgba(45, 212, 200, 0.18)' : 'transparent',
                color: tab === 'config' ? 'var(--accent-teal)' : 'var(--text-secondary)',
                transition: 'all 0.2s ease',
              }}
            >
              <Settings size={16} />
              <span>Firebase Setup</span>
            </button>
          </div>

          {/* TAB 1 & 2: Push / Pull Forms */}
          {(tab === 'push' || tab === 'pull') && (
            <form onSubmit={tab === 'push' ? handlePush : handleStartPull} style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
                {/* Vault Identifier Input */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Vault ID (Shop Phone / Account Code)
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <Smartphone size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="text"
                        className="form-input"
                        style={{ paddingLeft: '2.4rem' }}
                        value={vaultId}
                        onChange={(e) => setVaultId(e.target.value)}
                        placeholder="e.g. 03337669709 or elite_attock"
                        required
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: 'auto', fontSize: '0.78rem', padding: '0 0.85rem', gap: '0.3rem' }}
                      onClick={handleInspect}
                      disabled={inspecting}
                    >
                      {inspecting ? <RefreshCw size={14} className="animate-spin" /> : <Database size={14} />}
                      <span>Inspect</span>
                    </button>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                    Identifies your cloud backup space across devices.
                  </span>
                </div>

                {/* PIN Input */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Security PIN Code
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type={showPin ? 'text' : 'password'}
                      className="form-input"
                      style={{ paddingLeft: '2.4rem', paddingRight: '2.5rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em' }}
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="Enter 4-6 digit PIN"
                      maxLength={12}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                    Protects your vault data from unauthorized downloads.
                  </span>
                </div>
              </div>

              {/* Device Label (Push Mode) */}
              {tab === 'push' && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Device Name / Label
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    placeholder="e.g. Main POS Terminal, Haris Phone"
                  />
                </div>
              )}

              {/* Inspection Preview Block */}
              {cloudPreview && (
                <div
                  className="surface-block"
                  style={{
                    padding: '0.85rem',
                    border: cloudPreview.exists ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border-color)',
                    background: cloudPreview.exists ? 'rgba(245, 158, 11, 0.08)' : 'var(--surface-muted)',
                    borderRadius: 12,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.82rem', fontWeight: 750 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: cloudPreview.exists ? '#fde68a' : 'var(--text-muted)' }}>
                      <CheckCircle2 size={16} style={{ color: cloudPreview.exists ? '#34a853' : 'var(--text-muted)' }} />
                      Vault: {cloudPreview.vaultId}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      {cloudPreview.exists ? `Updated: ${new Date(cloudPreview.updatedAt).toLocaleString()}` : 'Not Found'}
                    </span>
                  </div>
                  {cloudPreview.stats && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem', marginTop: '0.5rem', textAlign: 'center' }}>
                      <div style={{ background: 'var(--bg-card)', padding: '0.4rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: '0.95rem' }}>{cloudPreview.stats.bills}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Bills</div>
                      </div>
                      <div style={{ background: 'var(--bg-card)', padding: '0.4rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: '0.95rem' }}>{cloudPreview.stats.products}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Products</div>
                      </div>
                      <div style={{ background: 'var(--bg-card)', padding: '0.4rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: '0.95rem' }}>{cloudPreview.stats.customers}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Clients</div>
                      </div>
                      <div style={{ background: 'var(--bg-card)', padding: '0.4rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                        <div style={{ fontWeight: 800, color: '#f59e0b', fontSize: '0.95rem' }}>{cloudPreview.stats.payments}</div>
                        <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Payments</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* In-App PIN Mismatch Confirmation Notice */}
              {pinMismatchNotice && (
                <div
                  style={{
                    padding: '1rem',
                    borderRadius: 12,
                    border: '1px solid rgba(245, 158, 11, 0.5)',
                    background: 'rgba(245, 158, 11, 0.12)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                  }}
                >
                  <div style={{ fontWeight: 800, color: '#fde68a', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <Key size={18} style={{ color: '#f59e0b' }} /> Cloud Vault PIN Update Needed
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    This Cloud Vault (<strong>{pinMismatchNotice.vaultId}</strong>) was created with a different PIN.
                    Would you like to update the Vault PIN to <strong>"{pinMismatchNotice.pin}"</strong> and push this backup?
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{
                        flex: 1,
                        background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                        color: '#0f172a',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        padding: '0.5rem 0.85rem',
                      }}
                      onClick={async () => {
                        try {
                          setBusy(true);
                          const syncInfo = await pushToCloudVault({
                            vaultId: pinMismatchNotice.vaultId,
                            pin: pinMismatchNotice.pin,
                            payload: pinMismatchNotice.payload,
                            deviceName: pinMismatchNotice.deviceName,
                            overwritePin: true,
                          });
                          setLastInfo(syncInfo);
                          setPinMismatchNotice(null);
                          toast.success(`🎉 Vault PIN updated to "${pinMismatchNotice.pin}" & backup pushed!`);
                        } catch (err) {
                          toast.error('Update failed: ' + err.message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <Key size={14} /> Update Vault PIN to "{pinMismatchNotice.pin}" & Push
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: 'auto', fontSize: '0.8rem' }}
                      onClick={() => setPinMismatchNotice(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* In-App Pull Restore Confirmation Notice */}
              {pullConfirmNotice && (
                <div
                  style={{
                    padding: '1rem',
                    borderRadius: 12,
                    border: '1px solid rgba(56, 189, 248, 0.5)',
                    background: 'rgba(56, 189, 248, 0.12)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                  }}
                >
                  <div style={{ fontWeight: 800, color: '#bae6fd', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <AlertTriangle size={18} style={{ color: '#38bdf8' }} /> Confirm Cloud Restore
                  </div>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    Restoring from Cloud Vault (<strong>{pullConfirmNotice.vaultId}</strong>) will replace your current local data. A safety copy of your local data will be saved automatically first.
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{
                        flex: 1,
                        background: 'linear-gradient(135deg, #38bdf8, #0284c7)',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '0.8rem',
                        padding: '0.5rem 0.85rem',
                      }}
                      onClick={handleExecutePull}
                    >
                      <CloudDownload size={14} /> Yes, Restore Local Database from Cloud
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: 'auto', fontSize: '0.8rem' }}
                      onClick={() => setPullConfirmNotice(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Main Submit Action Row */}
              {!pinMismatchNotice && !pullConfirmNotice && (
                <div style={{ marginTop: '0.25rem' }}>
                  <button
                    type="submit"
                    className="btn-primary"
                    style={{
                      width: '100%',
                      background: tab === 'push' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #38bdf8, #0284c7)',
                      color: tab === 'push' ? '#0f172a' : '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.9rem',
                      padding: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      borderRadius: 12,
                    }}
                    disabled={busy}
                  >
                    {busy ? (
                      <>
                        <RefreshCw size={18} className="animate-spin" />
                        <span>Processing Cloud Sync...</span>
                      </>
                    ) : tab === 'push' ? (
                      <>
                        <CloudUpload size={18} />
                        <span>Push Backup to Cloud Vault</span>
                      </>
                    ) : (
                      <>
                        <CloudDownload size={18} />
                        <span>Restore from Cloud Vault</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </form>
          )}

          {/* TAB 3: Firebase Configuration & Setup Guide */}
          {tab === 'config' && (
            <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
              
              {/* Guide Card */}
              <div
                className="surface-block"
                style={{
                  padding: '0.9rem 1rem',
                  background: 'rgba(45, 212, 200, 0.08)',
                  border: '1px solid rgba(45, 212, 200, 0.25)',
                  borderRadius: 12,
                }}
              >
                <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--accent-teal)', margin: '0 0 0.4rem 0', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <HelpCircle size={16} /> How to Set Up Your Free Firebase Project
                </h4>
                <ol style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', paddingLeft: '1.2rem', margin: 0, lineHeight: 1.6 }}>
                  <li>Go to <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-teal)', textDecoration: 'underline' }}>console.firebase.google.com <ExternalLink size={11} style={{ display: 'inline' }} /></a> and click <strong>Create a Project</strong>.</li>
                  <li>In left sidebar: <strong>Build → Firestore Database</strong> → Click <strong>Create database</strong> (choose <strong>Test mode</strong>).</li>
                  <li>In Project Settings (⚙️ icon) → Click <strong>Add app (`&lt;/&gt;`)</strong> → Copy your Web app config keys below.</li>
                </ol>
              </div>

              {/* Custom Config Form */}
              <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: '0.85rem' }}>Firebase Project Web Credentials</strong>
                  {isUsingCustomConfig ? (
                    <span style={{ fontSize: '0.7rem', background: 'rgba(52, 168, 83, 0.2)', color: 'var(--success)', padding: '0.2rem 0.5rem', borderRadius: 6, fontWeight: 700 }}>
                      Custom Project Active
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.7rem', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b', padding: '0.2rem 0.5rem', borderRadius: 6, fontWeight: 700 }}>
                      Default Preset Active
                    </span>
                  )}
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>API Key (apiKey)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={fbConfig.apiKey || ''}
                    onChange={(e) => setFbConfig({ ...fbConfig, apiKey: e.target.value })}
                    placeholder="AIzaSy..."
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Project ID (projectId)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={fbConfig.projectId || ''}
                    onChange={(e) => setFbConfig({ ...fbConfig, projectId: e.target.value })}
                    placeholder="elite-chocolate-pos"
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Auth Domain (authDomain)</label>
                  <input
                    type="text"
                    className="form-input"
                    value={fbConfig.authDomain || ''}
                    onChange={(e) => setFbConfig({ ...fbConfig, authDomain: e.target.value })}
                    placeholder="project-id.firebaseapp.com"
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                  {isUsingCustomConfig && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ flex: 1 }}
                      onClick={handleResetConfig}
                    >
                      Reset to Default
                    </button>
                  )}
                  <button
                    type="submit"
                    className="btn-primary"
                    style={{ flex: 2 }}
                  >
                    Save Firebase Credentials
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
