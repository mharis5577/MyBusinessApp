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
  getAutoSyncSettings,
  saveAutoSyncSettings,
  triggerAutoCloudSyncIfNeeded,
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

  // Auto-Cloud Sync state
  const [autoSync, setAutoSync] = useState(getAutoSyncSettings);

  // Firebase Config state
  const [fbConfig, setFbConfig] = useState(getStoredFirebaseConfig);
  const [isUsingCustomConfig, setIsUsingCustomConfig] = useState(false);

  useEffect(() => {
    const defaultVault = companyPhone
      ? normalizeVaultId(companyPhone)
      : 'elite_chocolate_store';
    const activeVault = vaultId || defaultVault;
    const activePin = pin || appPin || '';
    setVaultId(activeVault);
    setPin(activePin);
    setLastInfo(getLastCloudSyncInfo());
    const stored = getStoredFirebaseConfig();
    setFbConfig(stored);
    setIsUsingCustomConfig(Boolean(stored && stored.projectId !== DEFAULT_FIREBASE_CONFIG.projectId));

    // Background Auto-Sync Check
    if (activeVault && activePin && activePin.length >= 4) {
      triggerAutoCloudSyncIfNeeded({
        vaultId: activeVault,
        pin: activePin,
        deviceName,
        getPayloadFn: async () => {
          const res = await apiFetch('/api/backup');
          return await res.json();
        },
      }).then((info) => {
        if (info) {
          setLastInfo(info);
          setAutoSync(getAutoSyncSettings());
          toast.success('✨ Auto-Backup quietly synced to Cloud Vault!');
        }
      }).catch(() => {});
    }
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
        background: 'var(--bg-card, #1c1c1a)',
        border: '1px solid rgba(245, 158, 11, 0.4)',
        borderRadius: 14,
        marginBottom: '1rem',
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12)',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.65rem 0.9rem',
          background: 'rgba(245, 158, 11, 0.12)',
          borderBottom: isExpanded ? '1px solid rgba(245, 158, 11, 0.25)' : 'none',
          cursor: 'pointer',
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
          <div
            style={{
              padding: '0.4rem',
              background: 'rgba(245, 158, 11, 0.22)',
              border: '1px solid rgba(245, 158, 11, 0.5)',
              borderRadius: 10,
              color: '#d97706',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <Cloud size={18} />
          </div>
          <div>
            <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)', display: 'block', lineHeight: 1.25 }}>
              Firebase Cloud Sync Vault
            </strong>
            <span style={{ fontSize: '0.73rem', color: 'var(--text-secondary)' }}>
              PIN-protected cloud backup & restore across devices
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          {lastInfo && (
            <span style={{ fontSize: '0.68rem', background: 'rgba(52, 168, 83, 0.2)', color: 'var(--success, #16a34a)', padding: '0.15rem 0.45rem', borderRadius: 6, fontWeight: 700 }}>
              Synced {new Date(lastInfo.updatedAt).toLocaleDateString()}
            </span>
          )}
          <button
            type="button"
            style={{
              background: 'var(--surface-muted, rgba(0, 0, 0, 0.1))',
              border: 'none',
              color: 'var(--text-primary)',
              padding: '0.25rem',
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded Panel Body */}
      {isExpanded && (
        <div>
          {/* Responsive Mode Tabs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '0.3rem',
              padding: '0.35rem 0.65rem',
              background: 'var(--surface-muted, #1c1c1a)',
              borderBottom: '1px solid var(--border-color)',
            }}
          >
            <button
              type="button"
              onClick={() => { setTab('push'); setPinMismatchNotice(null); setPullConfirmNotice(null); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.3rem',
                padding: '0.4rem 0.25rem',
                borderRadius: '8px',
                fontWeight: 750,
                fontSize: '0.76rem',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                border: tab === 'push' ? '1px solid #d97706' : '1px solid transparent',
                background: tab === 'push' ? 'rgba(245, 158, 11, 0.22)' : 'transparent',
                color: tab === 'push' ? 'var(--text-primary)' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              <CloudUpload size={14} />
              <span>Push (Upload)</span>
            </button>
            <button
              type="button"
              onClick={() => { setTab('pull'); setPinMismatchNotice(null); setPullConfirmNotice(null); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.3rem',
                padding: '0.4rem 0.25rem',
                borderRadius: '8px',
                fontWeight: 750,
                fontSize: '0.76rem',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                border: tab === 'pull' ? '1px solid #0284c7' : '1px solid transparent',
                background: tab === 'pull' ? 'rgba(56, 189, 248, 0.22)' : 'transparent',
                color: tab === 'pull' ? 'var(--text-primary)' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              <CloudDownload size={14} />
              <span>Restore</span>
            </button>
            <button
              type="button"
              onClick={() => { setTab('config'); setPinMismatchNotice(null); setPullConfirmNotice(null); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.3rem',
                padding: '0.4rem 0.25rem',
                borderRadius: '8px',
                fontWeight: 750,
                fontSize: '0.76rem',
                whiteSpace: 'nowrap',
                cursor: 'pointer',
                border: tab === 'config' ? '1px solid var(--accent-teal)' : '1px solid transparent',
                background: tab === 'config' ? 'rgba(45, 212, 200, 0.18)' : 'transparent',
                color: tab === 'config' ? 'var(--text-primary)' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              <Settings size={14} />
              <span>Firebase Setup</span>
            </button>
          </div>

          {/* TAB 1 & 2: Push / Pull Forms */}
          {(tab === 'push' || tab === 'pull') && (
            <form onSubmit={tab === 'push' ? handlePush : handleStartPull} style={{ padding: '0.85rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.75rem' }}>
                {/* Vault Identifier Input */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)' }}>
                    Vault ID (Shop Phone / Code)
                  </label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                      <Smartphone size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                      <input
                        type="text"
                        className="form-input"
                        style={{ paddingLeft: '2.2rem', fontSize: '0.85rem' }}
                        value={vaultId}
                        onChange={(e) => setVaultId(e.target.value)}
                        placeholder="e.g. 03337669709"
                        required
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: 'auto', fontSize: '0.75rem', padding: '0 0.75rem', gap: '0.25rem' }}
                      onClick={handleInspect}
                      disabled={inspecting}
                    >
                      {inspecting ? <RefreshCw size={13} className="animate-spin" /> : <Database size={13} />}
                      <span>Inspect</span>
                    </button>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'block' }}>
                    Identifies your cloud backup space.
                  </span>
                </div>

                {/* PIN Input */}
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)' }}>
                    Security PIN Code
                  </label>
                  <div style={{ position: 'relative' }}>
                    <Lock size={15} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                    <input
                      type={showPin ? 'text' : 'password'}
                      className="form-input"
                      style={{ paddingLeft: '2.2rem', paddingRight: '2.3rem', fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', fontSize: '0.85rem' }}
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="Enter 4-6 digit PIN"
                      maxLength={12}
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin(!showPin)}
                      style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                    >
                      {showPin ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '0.2rem', display: 'block' }}>
                    Protects your vault data from unauthorized access.
                  </span>
                </div>
              </div>

              {/* Device Label (Push Mode) */}
              {tab === 'push' && (
                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-primary)' }}>
                    Device Name / Label
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontSize: '0.85rem' }}
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    placeholder="e.g. Main POS Terminal, Haris Phone"
                  />
                </div>
              )}

              {/* Hands-Free Auto-Cloud Sync Control */}
              {tab === 'push' && (
                <div
                  style={{
                    padding: '0.65rem 0.85rem',
                    borderRadius: 10,
                    background: 'var(--surface-muted, rgba(52, 168, 83, 0.08))',
                    border: '1px solid rgba(52, 168, 83, 0.35)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.55rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <ShieldCheck size={18} style={{ color: '#16a34a' }} />
                      <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                        Hands-Free Auto-Cloud Sync
                      </strong>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', gap: '0.4rem', fontSize: '0.78rem', fontWeight: 700, color: autoSync.enabled ? '#16a34a' : 'var(--text-secondary)' }}>
                      <input
                        type="checkbox"
                        checked={autoSync.enabled}
                        onChange={(e) => {
                          const next = { ...autoSync, enabled: e.target.checked };
                          setAutoSync(next);
                          saveAutoSyncSettings(next);
                          toast.info(e.target.checked ? 'Auto-Cloud Sync enabled!' : 'Auto-Cloud Sync paused.');
                        }}
                        style={{ width: '16px', height: '16px', accentColor: '#16a34a', cursor: 'pointer' }}
                      />
                      {autoSync.enabled ? 'Enabled' : 'Paused'}
                    </label>
                  </div>

                  <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', margin: 0 }}>
                    {autoSync.enabled
                      ? `Automatically backs up shop data to Firebase ${autoSync.intervalHours === 168 ? 'every 7 days' : `every ${autoSync.intervalHours} hours`}`
                      : 'Auto-Cloud Sync is currently paused'}
                  </span>

                  {/* High-Contrast Custom Pills */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.3rem', marginTop: '0.1rem' }}>
                    {[
                      { value: 12, label: '12 Hours' },
                      { value: 24, label: '24 Hours' },
                      { value: 48, label: '48 Hours' },
                      { value: 168, label: '7 Days' },
                    ].map((opt) => {
                      const isSelected = autoSync.intervalHours === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          style={{
                            padding: '0.35rem 0.2rem',
                            borderRadius: '7px',
                            fontSize: '0.72rem',
                            fontWeight: 750,
                            cursor: 'pointer',
                            textAlign: 'center',
                            border: isSelected ? '1px solid #16a34a' : '1px solid var(--border-color)',
                            background: isSelected ? '#16a34a' : 'var(--bg-card, #ffffff)',
                            color: isSelected ? '#ffffff' : 'var(--text-primary)',
                            boxShadow: isSelected ? '0 2px 6px rgba(22, 163, 74, 0.3)' : 'none',
                            transition: 'all 0.15s ease',
                          }}
                          onClick={() => {
                            const next = { ...autoSync, intervalHours: opt.value };
                            setAutoSync(next);
                            saveAutoSyncSettings(next);
                            toast.success(`Auto-sync frequency set to ${opt.label}`);
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Inspection Preview Block */}
              {cloudPreview && (
                <div
                  className="surface-block"
                  style={{
                    padding: '0.75rem',
                    border: cloudPreview.exists ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid var(--border-color)',
                    background: 'var(--surface-muted)',
                    borderRadius: 10,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.8rem', fontWeight: 750 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', color: 'var(--text-primary)' }}>
                      <CheckCircle2 size={15} style={{ color: cloudPreview.exists ? '#16a34a' : 'var(--text-muted)' }} />
                      Vault: {cloudPreview.vaultId}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                      {cloudPreview.exists ? `Updated: ${new Date(cloudPreview.updatedAt).toLocaleString()}` : 'Not Found'}
                    </span>
                  </div>
                  {cloudPreview.stats && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem', marginTop: '0.4rem', textAlign: 'center' }}>
                      <div style={{ background: 'var(--bg-card)', padding: '0.35rem', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                        <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{cloudPreview.stats.bills}</div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Bills</div>
                      </div>
                      <div style={{ background: 'var(--bg-card)', padding: '0.35rem', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                        <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{cloudPreview.stats.products}</div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Products</div>
                      </div>
                      <div style={{ background: 'var(--bg-card)', padding: '0.35rem', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                        <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{cloudPreview.stats.customers}</div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Clients</div>
                      </div>
                      <div style={{ background: 'var(--bg-card)', padding: '0.35rem', borderRadius: 6, border: '1px solid var(--border-color)' }}>
                        <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.9rem' }}>{cloudPreview.stats.payments}</div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Payments</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* In-App PIN Mismatch Confirmation Notice */}
              {pinMismatchNotice && (
                <div
                  style={{
                    padding: '0.85rem',
                    borderRadius: 10,
                    border: '1px solid rgba(245, 158, 11, 0.5)',
                    background: 'var(--surface-muted)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.55rem',
                  }}
                >
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <Key size={16} style={{ color: '#d97706' }} /> Cloud Vault PIN Update Needed
                  </div>
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                    This Cloud Vault (<strong>{pinMismatchNotice.vaultId}</strong>) was created with a different PIN.
                    Would you like to update the Vault PIN to <strong>"{pinMismatchNotice.pin}"</strong> and push this backup?
                  </p>
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{
                        flex: 1,
                        background: 'linear-gradient(135deg, #d97706, #b45309)',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '0.78rem',
                        padding: '0.45rem 0.75rem',
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
                      <Key size={13} /> Update Vault PIN to "{pinMismatchNotice.pin}" & Push
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: 'auto', fontSize: '0.78rem', padding: '0.45rem 0.75rem' }}
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
                    padding: '0.85rem',
                    borderRadius: 10,
                    border: '1px solid rgba(56, 189, 248, 0.5)',
                    background: 'var(--surface-muted)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.55rem',
                  }}
                >
                  <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                    <AlertTriangle size={16} style={{ color: '#0284c7' }} /> Confirm Cloud Restore
                  </div>
                  <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                    Restoring from Cloud Vault (<strong>{pullConfirmNotice.vaultId}</strong>) will replace your current local data. A safety copy of your local data will be saved automatically first.
                  </p>
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.2rem' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{
                        flex: 1,
                        background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                        color: '#ffffff',
                        fontWeight: 800,
                        fontSize: '0.78rem',
                        padding: '0.45rem 0.75rem',
                      }}
                      onClick={handleExecutePull}
                    >
                      <CloudDownload size={13} /> Yes, Restore Local Database from Cloud
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: 'auto', fontSize: '0.78rem', padding: '0.45rem 0.75rem' }}
                      onClick={() => setPullConfirmNotice(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Main Submit Action Row */}
              {!pinMismatchNotice && !pullConfirmNotice && (
                <div style={{ marginTop: '0.15rem' }}>
                  <button
                    type="submit"
                    className="btn-primary"
                    style={{
                      width: '100%',
                      background: tab === 'push' ? 'linear-gradient(135deg, #d97706, #b45309)' : 'linear-gradient(135deg, #0284c7, #0369a1)',
                      color: '#ffffff',
                      fontWeight: 800,
                      fontSize: '0.88rem',
                      padding: '0.65rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      borderRadius: 10,
                    }}
                    disabled={busy}
                  >
                    {busy ? (
                      <>
                        <RefreshCw size={16} className="animate-spin" />
                        <span>Processing Cloud Sync...</span>
                      </>
                    ) : tab === 'push' ? (
                      <>
                        <CloudUpload size={16} />
                        <span>Push Backup to Cloud Vault</span>
                      </>
                    ) : (
                      <>
                        <CloudDownload size={16} />
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
            <div style={{ padding: '0.85rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
              
              {/* Guide Card */}
              <div
                className="surface-block"
                style={{
                  padding: '0.75rem 0.85rem',
                  background: 'var(--surface-muted)',
                  border: '1px solid rgba(45, 212, 200, 0.3)',
                  borderRadius: 10,
                }}
              >
                <h4 style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 0.35rem 0', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <HelpCircle size={15} style={{ color: 'var(--accent-teal)' }} /> How to Set Up Your Free Firebase Project
                </h4>
                <ol style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', paddingLeft: '1.1rem', margin: 0, lineHeight: 1.55 }}>
                  <li>Go to <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-teal)', textDecoration: 'underline' }}>console.firebase.google.com <ExternalLink size={11} style={{ display: 'inline' }} /></a> and click <strong>Create a Project</strong>.</li>
                  <li>In left sidebar: <strong>Build → Firestore Database</strong> → Click <strong>Create database</strong> (choose <strong>Test mode</strong>).</li>
                  <li>In Project Settings (⚙️ icon) → Click <strong>Add app (`&lt;/&gt;`)</strong> → Copy your Web app config keys below.</li>
                </ol>
              </div>

              {/* Custom Config Form */}
              <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <strong style={{ fontSize: '0.82rem', color: 'var(--text-primary)' }}>Firebase Project Web Credentials</strong>
                  {isUsingCustomConfig ? (
                    <span style={{ fontSize: '0.68rem', background: 'rgba(52, 168, 83, 0.2)', color: '#16a34a', padding: '0.15rem 0.45rem', borderRadius: 6, fontWeight: 700 }}>
                      Custom Project Active
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.68rem', background: 'rgba(245, 158, 11, 0.2)', color: '#d97706', padding: '0.15rem 0.45rem', borderRadius: 6, fontWeight: 700 }}>
                      Default Preset Active
                    </span>
                  )}
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.74rem', color: 'var(--text-primary)' }}>API Key (apiKey)</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontSize: '0.85rem' }}
                    value={fbConfig.apiKey || ''}
                    onChange={(e) => setFbConfig({ ...fbConfig, apiKey: e.target.value })}
                    placeholder="AIzaSy..."
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.74rem', color: 'var(--text-primary)' }}>Project ID (projectId)</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontSize: '0.85rem' }}
                    value={fbConfig.projectId || ''}
                    onChange={(e) => setFbConfig({ ...fbConfig, projectId: e.target.value })}
                    placeholder="elite-chocolate-pos"
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0 }}>
                  <label className="form-label" style={{ fontSize: '0.74rem', color: 'var(--text-primary)' }}>Auth Domain (authDomain)</label>
                  <input
                    type="text"
                    className="form-input"
                    style={{ fontSize: '0.85rem' }}
                    value={fbConfig.authDomain || ''}
                    onChange={(e) => setFbConfig({ ...fbConfig, authDomain: e.target.value })}
                    placeholder="project-id.firebaseapp.com"
                  />
                </div>

                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                  {isUsingCustomConfig && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ flex: 1, fontSize: '0.78rem' }}
                      onClick={handleResetConfig}
                    >
                      Reset to Default
                    </button>
                  )}
                  <button
                    type="submit"
                    className="btn-primary"
                    style={{ flex: 2, fontSize: '0.78rem' }}
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
