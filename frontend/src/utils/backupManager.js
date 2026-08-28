/**
 * Triple backup: in-app versions + phone storage folder + Google Drive (via share).
 */
import { openDB } from 'idb';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { apiFetch } from '../api/client';
import { downloadBlob, saveOrShareBlob } from './downloadFile';

export function parseBackupPayload(raw) {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return assertShopBackup(raw.payload && typeof raw.payload === 'object' ? raw.payload : raw);
  }
  if (typeof raw !== 'string') throw new Error('Invalid backup file');
  const cleaned = raw.replace(/^\uFEFF/, '').trim();
  let data;
  try {
    data = JSON.parse(cleaned);
  } catch {
    throw new Error('This file is not valid JSON. Pick the .json backup file.');
  }
  const payload = data?.payload && typeof data.payload === 'object' ? data.payload : data;
  return assertShopBackup(payload);
}

function assertShopBackup(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('This file is not an Elite Chocolate backup');
  }
  const hasCore =
    Array.isArray(payload.bills) ||
    Array.isArray(payload.customers) ||
    Array.isArray(payload.products);
  if (!hasCore) {
    throw new Error('This file is not a CocoaDesk shop backup (missing bills/customers/products).');
  }
  // Reject empty payloads outright — restoring one clears every store.
  const billCount = Array.isArray(payload.bills) ? payload.bills.length : 0;
  const customerCount = Array.isArray(payload.customers) ? payload.customers.length : 0;
  const productCount = Array.isArray(payload.products) ? payload.products.length : 0;
  if (billCount + customerCount + productCount === 0) {
    throw new Error('This backup has no bills, customers or products. Pick a real CocoaDesk backup file.');
  }
  const sample = (payload.bills || payload.customers || payload.products)[0];
  if (!sample || typeof sample !== 'object' || Array.isArray(sample)) {
    throw new Error('This backup file is damaged — its records are not readable.');
  }
  return payload;
}

export function summarizeBackupPayload(payload) {
  const data = parseBackupPayload(payload);
  return {
    bills: Array.isArray(data.bills) ? data.bills.length : 0,
    customers: Array.isArray(data.customers) ? data.customers.length : 0,
    products: Array.isArray(data.products) ? data.products.length : 0,
    payments: Array.isArray(data.bill_payments) ? data.bill_payments.length : 0,
    partners: Array.isArray(data.partner_settlements) ? data.partner_settlements.length : 0,
    exported_at: data.exported_at || '',
    schema_version: Number(data.schema_version) || 1,
  };
}

const BACKUP_DB = 'elite-chocolate-backup-versions';
const BACKUP_DB_VERSION = 1;
const MAX_VERSIONS = 8;
const LAST_AUTO_KEY = 'last_auto_backup_at';
const LAST_PHONE_PATH_KEY = 'elite_last_phone_backup_path';
const AUTO_BACKUP_MS = 7 * 24 * 60 * 60 * 1000;
const PHONE_FOLDER = 'CocoaDesk/Backups';

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

function slimPayloadForAuto(payload) {
  if (!payload || typeof payload !== 'object') return payload;
  return {
    ...payload,
    bill_payments: (payload.bill_payments || []).map((p) => {
      if (!p?.screenshot_data) return p;
      const { screenshot_data, ...rest } = p;
      return { ...rest, has_screenshot: true };
    }),
  };
}

async function ensureFsPermission() {
  if (!isNative()) return;
  try {
    if (typeof Filesystem.requestPermissions === 'function') {
      await Filesystem.requestPermissions();
    }
  } catch (err) {
    console.warn('Filesystem permission request skipped', err);
  }
}

/**
 * Write backup into phone storage users can find in Files.
 * Tries External → Documents → Data.
 */
async function writePhoneStorageFile(filename, jsonText) {
  if (!isNative()) return { path: null, directory: null, uri: null, label: null };

  await ensureFsPermission();
  const relative = `${PHONE_FOLDER}/${filename}`;
  const targets = [
    { directory: Directory.Documents, label: `Documents → ${PHONE_FOLDER}` },
    { directory: Directory.ExternalStorage, label: `Phone storage → ${PHONE_FOLDER}` },
    { directory: Directory.External, label: `App external → ${PHONE_FOLDER}` },
    { directory: Directory.Data, label: `App files → ${PHONE_FOLDER}` },
  ];

  for (const target of targets) {
    try {
      await Filesystem.mkdir({
        path: PHONE_FOLDER,
        directory: target.directory,
        recursive: true,
      }).catch(() => {});

      await Filesystem.writeFile({
        path: relative,
        data: jsonText,
        directory: target.directory,
        encoding: Encoding.UTF8,
        recursive: true,
      });

      let uri = null;
      try {
        const got = await Filesystem.getUri({ path: relative, directory: target.directory });
        uri = got?.uri || null;
      } catch {
        /* ignore */
      }

      const label = `${target.label}/${filename}`;
      try {
        localStorage.setItem(LAST_PHONE_PATH_KEY, label);
      } catch {
        /* ignore */
      }

      return { path: relative, directory: target.directory, uri, label };
    } catch (err) {
      console.warn(`Phone backup write failed (${target.label})`, err);
    }
  }

  return { path: null, directory: null, uri: null, label: null };
}

async function saveInAppSnapshot({ filename, reason, payload, phonePath = '' }) {
  const db = await getBackupDb();
  let id = null;
  try {
    id = await db.add('snapshots', {
      filename,
      reason,
      created_at: new Date().toISOString(),
      native_path: phonePath || '',
      payload,
    });
    await pruneOld(db);
  } catch (err) {
    console.warn('Could not keep in-app snapshot (storage full?)', err);
  }
  return id;
}

/**
 * Full backup: App + Phone storage + optional Google Drive share sheet.
 */
export async function runFullBackup({
  reason = 'manual',
  offerDriveShare = true,
  pretty = true,
} = {}) {
  const rawPayload = await fetchCurrentPayload();
  const payload = reason === 'auto' ? slimPayloadForAuto(rawPayload) : rawPayload;
  const filename = stampFilename(
    reason === 'pre-restore'
      ? 'pre-restore'
      : reason === 'pre-wipe'
        ? 'pre-wipe'
        : reason === 'auto'
          ? 'auto-backup'
          : 'cocoadesk-backup'
  );
  const jsonText = pretty ? JSON.stringify(payload, null, 2) : JSON.stringify(payload);

  const phone = await writePhoneStorageFile(filename, jsonText);
  const id = await saveInAppSnapshot({
    filename,
    reason,
    payload,
    phonePath: phone.label || phone.path || '',
  });

  let driveResult = 'skipped';
  if (offerDriveShare) {
    try {
      const blob = new Blob([jsonText], { type: 'application/json' });
      driveResult = await saveOrShareBlob(blob, filename, 'application/json', {
        title: 'Save backup to Google Drive',
        dialogTitle: 'Save to Google Drive (or Files / WhatsApp)',
      });
    } catch (err) {
      if (err?.name === 'AbortError') {
        driveResult = 'cancelled';
      } else {
        console.warn('Drive share failed', err);
        driveResult = 'failed';
      }
    }
  } else if (!isNative()) {
    // Browser: still download a file so PC users get a copy
    try {
      const blob = new Blob([jsonText], { type: 'application/json' });
      await downloadBlob(blob, filename, 'application/json');
      driveResult = 'downloaded';
    } catch (err) {
      if (err?.name !== 'AbortError') console.warn('Download backup failed', err);
    }
  }

  return {
    id,
    filename,
    reason,
    payload,
    phonePath: phone.label || phone.path || '',
    phoneUri: phone.uri,
    inApp: Boolean(id),
    phoneSaved: Boolean(phone.path),
    driveResult,
    durable: Boolean(id) || Boolean(phone.path) || driveResult === 'downloaded' || driveResult === 'shared',
  };
}

/** @deprecated alias — keep older call sites working */
export async function saveLocalSnapshot(reason = 'manual') {
  const result = await runFullBackup({
    reason,
    offerDriveShare: false,
    pretty: reason !== 'auto',
  });
  return {
    id: result.id,
    filename: result.filename,
    reason: result.reason,
    nativePath: result.phonePath,
    payload: result.payload,
  };
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

export async function deleteLocalSnapshots(ids) {
  const list = [...new Set((ids || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))];
  if (!list.length) return 0;
  const db = await getBackupDb();
  for (const id of list) {
    await db.delete('snapshots', id);
  }
  return list.length;
}

/** Manual export — full triple backup with Drive share. */
export async function exportBackupFile({ offerShare = true } = {}) {
  return runFullBackup({
    reason: 'manual',
    offerDriveShare: offerShare,
    pretty: true,
  });
}

export async function restoreFromPayload(payload, { skipPreSnapshot = false } = {}) {
  const data = parseBackupPayload(payload);
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid backup payload');
  }
  if (!skipPreSnapshot) {
    const pre = await runFullBackup({ reason: 'pre-restore', offerDriveShare: false, pretty: false });
    if (!pre.inApp && !pre.phoneSaved && pre.driveResult !== 'downloaded') {
      throw new Error(
        'Could not save a pre-restore safety copy. Free some phone storage, then try Restore again.'
      );
    }
  }
  const res = await apiFetch('/api/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(result.error || `HTTP ${res.status}`);
  return result;
}

export async function restoreFromLocalVersion(id) {
  const snap = await getLocalSnapshot(id);
  if (!snap?.payload) throw new Error('Saved version not found');
  return restoreFromPayload(snap.payload);
}

export async function shareLocalSnapshot(id) {
  const snap = await getLocalSnapshot(id);
  if (!snap?.payload) throw new Error('Saved version not found');
  const filename = snap.filename || stampFilename('cocoadesk-backup');
  const jsonText = JSON.stringify(snap.payload, null, 2);
  await writePhoneStorageFile(filename, jsonText);
  const blob = new Blob([jsonText], { type: 'application/json' });
  return saveOrShareBlob(blob, filename, 'application/json', {
    title: 'Save backup to Google Drive',
    dialogTitle: 'Save to Google Drive (or Files / WhatsApp)',
  });
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

export function getLastPhoneBackupPath() {
  try {
    return localStorage.getItem(LAST_PHONE_PATH_KEY) || '';
  } catch {
    return '';
  }
}

/** Weekly auto: App + phone storage. Drive share only if offerShare=true. */
export async function maybeAutoBackup({ offerShare = false } = {}) {
  const last = getLastAutoBackupAt();
  const lastMs = last ? new Date(last).getTime() : 0;
  if (lastMs && Date.now() - lastMs < AUTO_BACKUP_MS) {
    return { skipped: true, last };
  }

  const result = await runFullBackup({
    reason: 'auto',
    offerDriveShare: offerShare,
    pretty: false,
  });
  if (result.inApp || result.phoneSaved) {
    setLastAutoBackupAt(new Date().toISOString());
  } else {
    console.warn('Auto-backup produced no durable copy — will retry next launch');
  }
  return { skipped: false, ...result };
}

export { MAX_VERSIONS, LAST_AUTO_KEY, PHONE_FOLDER };
