import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Download,
  Upload,
  Share2,
  History,
  Trash2,
  AlertTriangle,
  X,
  Cloud,
  Check,
  ShieldCheck,
} from 'lucide-react';
import FirebaseCloudSyncPanel from './FirebaseCloudSyncPanel';
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
  PHONE_FOLDER,
} from '../utils/backupManager';
import { readPickedFileText } from '../utils/downloadFile';
import useDialog from '../utils/useDialog';
import { useToast } from '../toast/ToastContext';

export default function BackupRestoreModal({ open, onClose, settings = {}, onSettingsUpdated }) {
  const toast = useToast();
  const [snapshots, setSnapshots] = useState([]);
  const [selectedVersions, setSelectedVersions] = useState([]);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [pendingRestore, setPendingRestore] = useState(null);
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const deleteConfirmRef = useRef(null);
  const dialogRef = useDialog(open, onClose, { closeOnEscape: !busy });

  const lastAuto = getLastAutoBackupAt();
  const lastPhonePath = getLastPhoneBackupPath();

  const refreshSnapshots = async () => {
    try {
      const list = await listLocalSnapshots();
      setSnapshots(list);
      setSelectedVersions((prev) => prev.filter((id) => list.some((s) => s.id === id)));
    } catch (err) {
      console.warn(err);
    }
  };

  useEffect(() => {
    if (open) {
      refreshSnapshots();
    }
  }, [open]);

  useEffect(() => {
    if (!pendingDelete) return undefined;
    const t = setTimeout(() => {
      deleteConfirmRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 40);
    return () => clearTimeout(t);
  }, [pendingDelete]);

  if (!open || typeof document === 'undefined') return null;

  const handleBackup = async () => {
    setBusy(true);
    try {
      const res = await saveLocalSnapshot('manual', 'Manual app backup');
      if (res.skipped) {
        toast.info('No changes since last backup');
      } else {
        toast.success(
          `Backup saved in App versions${res.phonePath ? ` and Phone folder (${PHONE_FOLDER})` : ''}`
        );
      }
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
      const result = await exportBackupFile({ share: true, saveToPhone: true });
      const base = [];
      if (result.inApp) base.push('App');
      if (result.phoneSaved) base.push('Phone');
      if (!result.inApp && !result.phoneSaved && result.driveResult !== 'shared' && result.driveResult !== 'downloaded') {
        toast.error('Backup did not save. Free storage, then try Backup to Drive again.');
        return;
      }
      if (result.driveResult === 'shared') {
        toast.success(`${base.join(' + ') || 'Backup'} saved. Pick Google Drive in the share sheet.`);
      } else if (result.driveResult === 'cancelled') {
        toast.info(`${base.join(' + ') || 'Backup'} still saved in App${result.phoneSaved ? ' and Phone storage' : ''}. Drive share was cancelled.`);
      } else if (result.driveResult === 'downloaded') {
        toast.success(`Backup file ready: ${result.filename}`);
      } else {
        toast.success(`${base.join(' + ') || 'Backup'} saved${result.phonePath ? ` → ${result.phonePath}` : ''}.`);
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

  return createPortal(
    <div
      className="more-menu-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(10px)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        className="glass-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="backup-vault-title"
        tabIndex={-1}
        style={{
          maxWidth: 580,
          width: '100%',
          maxHeight: '92vh',
          overflowY: 'auto',
          padding: '1.5rem',
          borderRadius: 22,
          boxShadow: '0 25px 70px rgba(0, 0, 0, 0.55)',
          border: '1px solid var(--border-color)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <Download size={22} style={{ color: 'var(--accent-teal)' }} />
            <div>
              <h3 id="backup-vault-title" style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0 }}>
                Backup & Restore Vault
              </h3>
              <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', margin: 0 }}>
                Cloud sync, phone storage, and Google Drive vault
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            style={{ width: 34, height: 34, padding: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>

        {/* Embedded Firebase Cloud Sync Vault */}
        <div style={{ marginBottom: '1.25rem' }}>
          <FirebaseCloudSyncPanel
            companyPhone={settings.company_phone}
            onRestoreComplete={refreshSnapshots}
          />
        </div>

        {/* Local Storage & Drive Backups */}
        <div
          style={{
            background: 'var(--surface-muted)',
            border: '1px solid var(--border-color)',
            borderRadius: 14,
            padding: '1rem',
            marginBottom: '1.25rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.45rem' }}>
            <ShieldCheck size={16} style={{ color: 'var(--accent-teal)' }} />
            <strong style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>Multi-Destination Safe Storage</strong>
          </div>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.45rem', lineHeight: 1.4 }}>
            Your shop data lives securely on this device. Backups go to <b>3 places</b>: app internal cache, phone folder <b>{PHONE_FOLDER}</b>, and <b>Google Drive</b>.
          </p>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.85rem' }}>
            Last weekly auto-backup: {lastAuto ? new Date(lastAuto).toLocaleString() : 'never'} · {lastPhonePath ? `Last file: ${lastPhonePath}` : 'Auto-saved every 7 days'}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.5rem' }}>
            <button type="button" className="btn-primary" disabled={busy} onClick={handleShareBackup} style={{ fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}>
              <Share2 size={15} /> Backup to Drive
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={handleBackup} style={{ fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}>
              <Download size={15} /> App + Phone
            </button>
            <button type="button" className="btn-secondary" disabled={busy} onClick={() => fileRef.current?.click()} style={{ fontSize: '0.8rem', padding: '0.5rem 0.75rem' }}>
              <Upload size={15} /> Restore file
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json,text/plain,*/*"
              style={{ display: 'none' }}
              onChange={startFileRestore}
            />
          </div>
        </div>

        {/* Restore Confirmation Dialog */}
        {pendingRestore && (
          <div
            className="surface-block"
            style={{
              padding: '1rem',
              borderRadius: 14,
              border: '1px solid var(--border-focus)',
              background: 'color-mix(in srgb, var(--accent-primary, #00b3a6) 8%, var(--bg-card))',
              marginBottom: '1.25rem',
            }}
          >
            <h4 style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.35rem' }}>
              Confirm Data Restore
            </h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '0.65rem' }}>
              Restoring <b>{pendingRestore.label}</b> will replace all current local data with the contents of this snapshot.
            </p>
            {pendingRestore.summary && (
              <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginBottom: '0.65rem' }}>
                Contains: {pendingRestore.summary.bills || 0} bills · {pendingRestore.summary.customers || 0} clients · {pendingRestore.summary.products || 0} products
              </p>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                type="text"
                className="form-input"
                placeholder="Type CONFIRM to restore"
                value={restoreConfirm}
                onChange={(e) => setRestoreConfirm(e.target.value)}
                style={{ flex: 1, minWidth: 160, fontSize: '0.82rem', textTransform: 'uppercase' }}
              />
              <button
                type="button"
                className="btn-primary"
                disabled={busy || restoreConfirm.trim() !== 'CONFIRM'}
                onClick={executeRestore}
                style={{ fontSize: '0.8rem', padding: '0.5rem 1rem' }}
              >
                Proceed Restore
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => {
                  setPendingRestore(null);
                  setRestoreConfirm('');
                }}
                style={{ fontSize: '0.8rem' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Saved Snapshots History */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.65rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h4 style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <History size={16} style={{ color: 'var(--accent-teal)' }} />
              Saved Version History ({snapshots.length})
            </h4>
            {snapshots.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: 'var(--text-secondary)', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={selectedVersions.length === snapshots.length && snapshots.length > 0}
                    onChange={toggleSelectAllVersions}
                  />
                  Select all
                </label>
                {selectedVersions.length > 0 && (
                  <button
                    type="button"
                    className="btn-danger"
                    style={{ padding: '0.2rem 0.55rem', fontSize: '0.72rem', borderRadius: 8 }}
                    disabled={busy}
                    onClick={askDeleteSelectedVersions}
                  >
                    <Trash2 size={12} /> Delete ({selectedVersions.length})
                  </button>
                )}
              </div>
            )}
          </div>

          {snapshots.length === 0 ? (
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              No local snapshots yet. Tap "App + Phone" or "Backup to Drive" above to create one.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: 240, overflowY: 'auto' }}>
              {snapshots.map((s) => (
                <div
                  key={s.id}
                  className="surface-block"
                  style={{
                    padding: '0.55rem 0.75rem',
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: '0.5rem',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    borderRadius: 10,
                  }}
                >
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', minWidth: 0, flex: 1, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedVersions.includes(s.id)}
                      onChange={() => toggleVersionSelect(s.id)}
                      style={{ marginTop: 3 }}
                    />
                    <span style={{ fontSize: '0.78rem', minWidth: 0 }}>
                      <span style={{ fontWeight: 750, display: 'block', color: 'var(--text-primary)', overflowWrap: 'anywhere' }}>{s.filename}</span>
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                        {s.reason} · {new Date(s.created_at).toLocaleString()}
                      </span>
                    </span>
                  </label>
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', borderRadius: 6 }}
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
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ padding: '0.25rem 0.55rem', fontSize: '0.72rem', borderRadius: 6 }}
                      onClick={() => startVersionRestore(s.id)}
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      className="btn-danger"
                      style={{ padding: '0.25rem 0.45rem', fontSize: '0.72rem', borderRadius: 6 }}
                      disabled={busy}
                      title="Delete version"
                      onClick={() => askDeleteVersion(s.id, s.filename)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delete Confirmation Sub-Dialog */}
        {pendingDelete && (
          <div
            ref={deleteConfirmRef}
            className="backup-delete-confirm"
            role="dialog"
            aria-labelledby="backup-delete-title"
            style={{ marginTop: '1rem' }}
          >
            <div className="backup-delete-confirm-icon" aria-hidden>
              <AlertTriangle size={18} />
            </div>
            <div className="backup-delete-confirm-copy">
              <h4 id="backup-delete-title">{pendingDelete.title}</h4>
              <p>{pendingDelete.message}</p>
              <div className="backup-delete-confirm-actions">
                <button type="button" className="btn-danger" disabled={busy} onClick={confirmPendingDelete}>
                  Yes, delete
                </button>
                <button type="button" className="btn-secondary" disabled={busy} onClick={() => setPendingDelete(null)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
