import React, { useState, useEffect } from 'react';
import {
  Cloud,
  CloudUpload,
  CloudDownload,
  Key,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  Smartphone,
  Database,
  Lock,
  Eye,
  EyeOff,
  Settings,
  HelpCircle,
  ExternalLink,
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

export default function CloudSyncModal({ isOpen, onClose, companyPhone = '', onRestoreComplete }) {
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

  // Firebase Config state
  const [fbConfig, setFbConfig] = useState(getStoredFirebaseConfig);
  const [isUsingCustomConfig, setIsUsingCustomConfig] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const defaultVault = companyPhone
      ? normalizeVaultId(companyPhone)
      : 'elite_chocolate_store';
    setVaultId((prev) => prev || defaultVault);
    setLastInfo(getLastCloudSyncInfo());
    const stored = getStoredFirebaseConfig();
    setFbConfig(stored);
    setIsUsingCustomConfig(Boolean(stored && stored.projectId !== DEFAULT_FIREBASE_CONFIG.projectId));
  }, [isOpen, companyPhone]);

  if (!isOpen) return null;

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
      const syncInfo = await pushToCloudVault({
        vaultId,
        pin,
        payload,
        deviceName,
      });

      setLastInfo(syncInfo);
      toast.success('🎉 Backup successfully pushed to Cloud Vault!');
    } catch (err) {
      toast.error('Cloud Push Failed: ' + err.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePull = async (e) => {
    e.preventDefault();
    if (!vaultId.trim()) {
      toast.error('Vault ID is required');
      return;
    }
    if (!pin.trim()) {
      toast.error('PIN Code is required to restore cloud backup');
      return;
    }

    if (!window.confirm('⚠️ Restoring from cloud will replace your current local data. A safety copy of your local data will be saved automatically. Proceed?')) {
      return;
    }

    setBusy(true);
    try {
      toast.info('Saving safety pre-restore copy of local data...');
      await runFullBackup({ reason: 'pre-restore', offerDriveShare: false, pretty: false }).catch(() => {});

      toast.info('Downloading from Firebase Cloud Vault...');
      const { syncInfo, payload } = await pullFromCloudVault({
        vaultId,
        pin,
      });

      toast.info('Restoring shop data into local database...');
      await restoreFromPayload(payload, { skipPreSnapshot: true });

      setLastInfo(syncInfo);
      toast.success('✅ Cloud restore complete! Local data updated.');
      if (onRestoreComplete) onRestoreComplete();
      onClose();
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
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(8px)',
        padding: '1rem',
        overflowY: 'auto',
      }}
    >
      <div
        className="glass-panel"
        style={{
          width: '100%',
          maxWidth: '620px',
          background: 'var(--bg-card, #171716)',
          border: '1px solid var(--border-color, rgba(232, 234, 237, 0.15))',
          borderRadius: 'var(--radius-lg, 24px)',
          boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
          overflow: 'hidden',
          color: 'var(--text-primary, #f4f2eb)',
          margin: 'auto',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '1.2rem 1.5rem',
            background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(0, 0, 0, 0.4))',
            borderBottom: '1px solid var(--border-color, rgba(232, 234, 237, 0.12))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                padding: '0.6rem',
                borderRadius: '12px',
                background: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#f59e0b',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Cloud size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, color: '#fde68a' }}>
                Firebase Cloud Backup Vault
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary, #c4c2b8)', margin: 0 }}>
                PIN-protected cloud backup & restore across all devices
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted, #9aa0a6)',
              cursor: 'pointer',
              padding: '0.4rem',
              borderRadius: '8px',
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Mode Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            background: 'var(--surface-muted, #1c1c1a)',
            borderBottom: '1px solid var(--border-color)',
          }}
        >
          <button
            type="button"
            onClick={() => setTab('push')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              padding: '0.6rem 0.8rem',
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              border: tab === 'push' ? '1px solid #f59e0b' : '1px solid transparent',
              background: tab === 'push' ? 'rgba(245, 158, 11, 0.2)' : 'transparent',
              color: tab === 'push' ? '#fde68a' : 'var(--text-secondary)',
              transition: 'all 0.2s ease',
            }}
          >
            <CloudUpload size={16} />
            <span>Push Backup</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('pull')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              padding: '0.6rem 0.8rem',
              borderRadius: '10px',
              fontWeight: 700,
              fontSize: '0.82rem',
              cursor: 'pointer',
              border: tab === 'pull' ? '1px solid #38bdf8' : '1px solid transparent',
              background: tab === 'pull' ? 'rgba(56, 189, 248, 0.2)' : 'transparent',
              color: tab === 'pull' ? '#bae6fd' : 'var(--text-secondary)',
              transition: 'all 0.2s ease',
            }}
          >
            <CloudDownload size={16} />
            <span>Restore Vault</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('config')}
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.4rem',
              padding: '0.6rem 0.8rem',
              borderRadius: '10px',
              fontWeight: 700,
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
          <form onSubmit={tab === 'push' ? handlePush : handlePull} style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
            
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
                This ID uniquely identifies your cloud backup vault space.
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
                Required to protect your cloud vault data from unauthorized downloads.
              </span>
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

            {/* Last Sync Badge */}
            {lastInfo && (
              <div style={{ padding: '0.6rem 0.85rem', background: 'var(--surface-muted)', borderRadius: 10, border: '1px solid var(--border-color)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <ShieldCheck size={16} style={{ color: 'var(--success)' }} />
                  Last Cloud Sync ({lastInfo.action}): <strong>{lastInfo.vaultId}</strong>
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {new Date(lastInfo.updatedAt).toLocaleDateString()}
                </span>
              </div>
            )}

            {/* Action Row */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ flex: 1 }}
                disabled={busy}
                onClick={onClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn-primary"
                style={{
                  flex: 2,
                  background: tab === 'push' ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'linear-gradient(135deg, #38bdf8, #0284c7)',
                  color: tab === 'push' ? '#0f172a' : '#ffffff',
                  fontWeight: 800,
                  fontSize: '0.88rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.4rem',
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
                    <CloudUpload size={18} />
                    <span>Push Backup to Cloud</span>
                  </>
                ) : (
                  <>
                    <CloudDownload size={18} />
                    <span>Restore from Cloud</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* TAB 3: Firebase Configuration & Setup Guide */}
        {tab === 'config' && (
          <div style={{ padding: '1.25rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1.2rem', maxHeight: '520px', overflowY: 'auto' }}>
            
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
              <ol style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', paddingLeft: '1.2rem', margin: 0, lineHeight: 1.5 }}>
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
    </div>
  );
}
