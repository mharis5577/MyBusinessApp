/**
 * Local versioned backups (IndexedDB + optional native Filesystem).
 * Protects against bad restores / wipes without requiring cloud API keys.
 */
import { openDB } from 'idb';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { apiFetch } from '../api/client';
import { downloadBlob, saveOrShareBlob } from './downloadFile';

const BACKUP_DB = 'elite-chocolate-backup-versions';
const BACKUP_DB_VERSION = 1;
const MAX_VERSIONS = 8;
const LAST_AUTO_KEY = 'last_auto_backup_at';
const AUTO_BACKUP_MS = 7 * 24 * 60 * 60 * 1000;

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function stampFilename(prefix = 'backup') {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
  return `${prefix}-${stamp}.json`;
}

async function getBackupDb() {
  return openDB(BACKUP_DB, BACKUP_DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('snapshots')) {
        db.createObjectStore('snapshots', { keyPath: 'id', autoIncrement: true });
      }
    },
  });
}

async function fetchCurrentPayload() {
  const res = await apiFetch('/api/backup');
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `Backup failed (${res.status})`);
  return data;
}

async function pruneOld(db) {
  const all = (await db.getAll('snapshots')).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  for (const old of all.slice(MAX_VERSIONS)) {
    await db.delete('snapshots', old.id);
  }
}

async function writeNativeFile(filename, jsonText) {
  if (!isNative()) return null;
  try {
    const path = `backups/${filename}`;
    await Filesystem.writeFile({
      path,
      data: btoa(unescape(encodeURIComponent(jsonText))),
      directory: Directory.Data,
      recursive: true,
    });
    return path;
  } catch (err) {
    console.warn('Native backup file write failed', err);
    return null;
  }
}

/**
 * Save a dated snapshot of the current shop data.
 * @param {string} reason e.g. 'manual' | 'pre-restore' | 'pre-wipe' | 'auto'
 */
export async function saveLocalSnapshot(reason = 'manual') {
  const payload = await fetchCurrentPayload();
  const filename = stampFilename(
    reason === 'pre-restore'
      ? 'pre-restore'
      : reason === 'pre-wipe'
        ? 'pre-wipe'
        : reason === 'auto'
          ? 'auto-backup'
          : 'backup'
  );
  const jsonText = JSON.stringify(payload, null, 2);
  const nativePath = await writeNativeFile(filename, jsonText);

  const db = await getBackupDb();
  const id = await db.add('snapshots', {
    filename,
    reason,
    created_at: new Date().toISOString(),
    native_path: nativePath || '',
    payload,
  });
  await pruneOld(db);

  return { id, filename, reason, nativePath, payload };
}

export async function listLocalSnapshots() {
  const db = await getBackupDb();
  const all = await db.getAll('snapshots');
  return all
    .map(({ id, filename, reason, created_at, native_path }) => ({
      id,
      filename,
      reason,
      created_at,
      native_path,
    }))
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

export async function getLocalSnapshot(id) {
  const db = await getBackupDb();
  return db.get('snapshots', Number(id));
}

export async function deleteLocalSnapshot(id) {
  const db = await getBackupDb();
  await db.delete('snapshots', Number(id));
}

/** Download / share a JSON backup file (manual export). */
export async function exportBackupFile({ offerShare = true } = {}) {
  const payload = await fetchCurrentPayload();
  const filename = stampFilename('elite-chocolate-backup');
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });

  // Always keep a local versioned copy
  const db = await getBackupDb();
  await db.add('snapshots', {
    filename,
    reason: 'manual',
    created_at: new Date().toISOString(),
    native_path: '',
    payload,
  });
  await pruneOld(db);
  await writeNativeFile(filename, JSON.stringify(payload, null, 2));

  if (offerShare) {
    const result = await saveOrShareBlob(blob, filename, 'application/json', {
      title: 'Shop backup',
      text: 'Save to Drive or Files via the share sheet.',
    });
    return { filename, result, payload };
  }

  await downloadBlob(blob, filename, 'application/json');
  return { filename, result: 'downloaded', payload };
}

/** Restore API payload after optional pre-restore snapshot. */
export async function restoreFromPayload(payload, { skipPreSnapshot = false } = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid backup payload');
  }
  if (!skipPreSnapshot) {
    try {
      await saveLocalSnapshot('pre-restore');
    } catch (err) {
      console.warn('Pre-restore snapshot failed', err);
    }
  }
  const res = await apiFetch('/api/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

export async function restoreFromLocalVersion(id) {
  const snap = await getLocalSnapshot(id);
  if (!snap?.payload) throw new Error('Saved version not found');
  return restoreFromPayload(snap.payload);
}

export function getLastAutoBackupAt() {
  try {
    return localStorage.getItem(LAST_AUTO_KEY) || '';
  } catch {
    return '';
  }
}

export function setLastAutoBackupAt(iso) {
  try {
    localStorage.setItem(LAST_AUTO_KEY, iso || new Date().toISOString());
  } catch {
    /* ignore */
  }
}

/** Weekly auto-export: run if last backup older than 7 days (or never). */
export async function maybeAutoBackup({ offerShare = false } = {}) {
  const last = getLastAutoBackupAt();
  const lastMs = last ? new Date(last).getTime() : 0;
  if (lastMs && Date.now() - lastMs < AUTO_BACKUP_MS) {
    return { skipped: true, last };
  }

  const snap = await saveLocalSnapshot('auto');
  const filename = snap.filename;

  if (offerShare) {
    try {
      const blob = new Blob([JSON.stringify(snap.payload, null, 2)], { type: 'application/json' });
      await saveOrShareBlob(blob, filename, 'application/json', {
        title: 'Weekly shop backup',
        text: 'Optional: save to Google Drive / Files via share sheet.',
      });
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn('Auto-backup share skipped', err);
    }
  }

  setLastAutoBackupAt(new Date().toISOString());
  return { skipped: false, filename, id: snap.id };
}

export { MAX_VERSIONS, LAST_AUTO_KEY };
