/**
 * Firebase Cloud Sync Module for ELITE CHOCOLATE POS
 * Provides PIN-protected Cloud Backup Vault (Push & Pull)
 */
import { initializeApp, getApps } from 'firebase/app';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  collection,
  getDocs,
  deleteDoc,
} from 'firebase/firestore';
import { summarizeBackupPayload } from './backupManager';

// Default Firebase project configuration (can be overridden by user in settings)
export const DEFAULT_FIREBASE_CONFIG = {
  apiKey: "AIzaSyB1jcDCpb0FLy4mHePNLutnlGDBFyAUfIA",
  authDomain: "my-business-8aadb.firebaseapp.com",
  databaseURL: "https://my-business-8aadb-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "my-business-8aadb",
  storageBucket: "my-business-8aadb.firebasestorage.app",
  messagingSenderId: "1035521814001",
  appId: "1:1035521814001:web:a13c2e6888bbe97c88a850",
  measurementId: "G-XLK87ECCMC"
};

const CONFIG_STORAGE_KEY = 'elite_firebase_config_custom';
const LAST_SYNC_INFO_KEY = 'elite_last_cloud_sync_info';

export function getStoredFirebaseConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.projectId && parsed?.apiKey) return parsed;
    }
  } catch (_) {}
  return DEFAULT_FIREBASE_CONFIG;
}

export function saveStoredFirebaseConfig(config) {
  try {
    if (!config || typeof config !== 'object') {
      localStorage.removeItem(CONFIG_STORAGE_KEY);
    } else {
      localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
    }
  } catch (_) {}
}

export function getLastCloudSyncInfo() {
  try {
    const raw = localStorage.getItem(LAST_SYNC_INFO_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveLastCloudSyncInfo(info) {
  try {
    localStorage.setItem(LAST_SYNC_INFO_KEY, JSON.stringify(info));
  } catch (_) {}
}

let firestoreInstance = null;

export function getFirestoreDb(customConfig = null) {
  const config = customConfig || getStoredFirebaseConfig();
  const appName = 'EliteChocolatePOSSync';
  
  let app;
  const existingApps = getApps();
  const found = existingApps.find((a) => a.name === appName);

  if (found) {
    app = found;
  } else {
    app = initializeApp(config, appName);
  }

  firestoreInstance = getFirestore(app);
  return firestoreInstance;
}

/**
 * SHA-256 hash helper for PIN verification
 */
export async function hashPin(pin) {
  const str = String(pin || '').trim();
  if (!str) return '';
  try {
    if (typeof crypto !== 'undefined' && crypto?.subtle && typeof crypto.subtle.digest === 'function') {
      const msgBuffer = new TextEncoder().encode(str);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
  } catch (_) {}
  
  // Safe JS Fallback for legacy WebViews / HTTP contexts
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return 'legacy_hash_' + Math.abs(hash).toString(16);
}

/**
 * Clean & normalize Vault ID (slugify phone/shop code)
 */
export function normalizeVaultId(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Split large JSON string into 450KB chunks to avoid Firestore 1MB doc limits
 */
function chunkString(str, size = 450000) {
  const numChunks = Math.ceil(str.length / size);
  const chunks = new Array(numChunks);
  for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
    chunks[i] = str.substr(o, size);
  }
  return chunks;
}

/**
 * PUSH backup snapshot to Cloud Vault
 */
export async function pushToCloudVault({
  vaultId,
  pin,
  payload,
  deviceName = 'POS Terminal',
  customConfig = null,
  overwritePin = false,
}) {
  const cleanVaultId = normalizeVaultId(vaultId);
  if (!cleanVaultId) throw new Error('Vault ID is required (e.g. your phone number or shop code)');
  if (!pin || String(pin).trim().length < 4) throw new Error('PIN Code must be at least 4 digits/characters');
  if (!payload || typeof payload !== 'object') throw new Error('Invalid shop data payload');

  const db = getFirestoreDb(customConfig);
  const pinHash = await hashPin(pin);
  const vaultDocRef = doc(db, 'sync_vaults', cleanVaultId);
  
  // Check existing vault PIN if vault exists
  const existingSnap = await getDoc(vaultDocRef);
  if (existingSnap.exists()) {
    const data = existingSnap.data();
    if (data?.pin_hash && data.pin_hash !== pinHash && !overwritePin) {
      const err = new Error('PIN_MISMATCH: This Cloud Vault was previously created with a different PIN.');
      err.code = 'PIN_MISMATCH';
      throw err;
    }
  }

  const jsonText = JSON.stringify(payload);
  const chunks = chunkString(jsonText);
  const stats = summarizeBackupPayload(payload);
  const updatedAt = new Date().toISOString();

  // 1. Write Vault metadata
  await setDoc(vaultDocRef, {
    vault_id: cleanVaultId,
    pin_hash: pinHash,
    updated_at: updatedAt,
    device_name: deviceName,
    chunk_count: chunks.length,
    total_size_bytes: jsonText.length,
    stats,
  });

  // 2. Delete old chunk subcollection docs if any, then write new chunks
  const chunksCollRef = collection(db, 'sync_vaults', cleanVaultId, 'chunks');
  const oldChunksSnap = await getDocs(chunksCollRef);
  for (const cDoc of oldChunksSnap.docs) {
    await deleteDoc(cDoc.ref);
  }

  for (let i = 0; i < chunks.length; i++) {
    const chunkDocRef = doc(db, 'sync_vaults', cleanVaultId, 'chunks', `chunk_${i}`);
    await setDoc(chunkDocRef, {
      index: i,
      data: chunks[i],
    });
  }

  const syncInfo = {
    vaultId: cleanVaultId,
    updatedAt,
    deviceName,
    stats,
    action: 'push',
  };
  saveLastCloudSyncInfo(syncInfo);

  return syncInfo;
}

/**
 * Inspect Cloud Vault metadata (without downloading full data)
 */
export async function inspectCloudVault({ vaultId, customConfig = null }) {
  const cleanVaultId = normalizeVaultId(vaultId);
  if (!cleanVaultId) throw new Error('Vault ID is required');

  const db = getFirestoreDb(customConfig);
  const vaultDocRef = doc(db, 'sync_vaults', cleanVaultId);
  const snap = await getDoc(vaultDocRef);

  if (!snap.exists()) {
    return { exists: false, vaultId: cleanVaultId };
  }

  const data = snap.data();
  return {
    exists: true,
    vaultId: cleanVaultId,
    updatedAt: data.updated_at || '',
    deviceName: data.device_name || 'Remote Device',
    stats: data.stats || null,
    chunkCount: data.chunk_count || 1,
  };
}

/**
 * PULL backup snapshot from Cloud Vault
 */
export async function pullFromCloudVault({
  vaultId,
  pin,
  customConfig = null,
}) {
  const cleanVaultId = normalizeVaultId(vaultId);
  if (!cleanVaultId) throw new Error('Vault ID is required');
  if (!pin) throw new Error('PIN Code is required');

  const db = getFirestoreDb(customConfig);
  const vaultDocRef = doc(db, 'sync_vaults', cleanVaultId);
  const snap = await getDoc(vaultDocRef);

  if (!snap.exists()) {
    throw new Error(`Vault "${cleanVaultId}" not found in Cloud. Push a cloud backup first.`);
  }

  const data = snap.data();
  const pinHash = await hashPin(pin);
  if (data?.pin_hash && data.pin_hash !== pinHash) {
    throw new Error('Incorrect PIN Code. Access denied to this Cloud Vault.');
  }

  const chunkCount = data.chunk_count || 1;
  const chunkDocs = [];
  const chunksCollRef = collection(db, 'sync_vaults', cleanVaultId, 'chunks');
  const chunksSnap = await getDocs(chunksCollRef);

  chunksSnap.forEach((cDoc) => {
    chunkDocs.push(cDoc.data());
  });

  if (chunkDocs.length < chunkCount) {
    throw new Error('Cloud backup data appears incomplete or corrupted. Please try pushing again from source device.');
  }

  chunkDocs.sort((a, b) => Number(a.index) - Number(b.index));
  const fullJsonText = chunkDocs.map((c) => c.data).join('');
  let payload;
  try {
    payload = JSON.parse(fullJsonText);
  } catch (err) {
    throw new Error('Failed to parse downloaded cloud backup JSON');
  }

  const stats = summarizeBackupPayload(payload);
  const syncInfo = {
    vaultId: cleanVaultId,
    updatedAt: data.updated_at || new Date().toISOString(),
    deviceName: data.device_name || 'Remote Device',
    stats,
    action: 'pull',
  };
  saveLastCloudSyncInfo(syncInfo);

  return {
    syncInfo,
    payload,
  };
}

// -------------------------------------------------------------
// HANDS-FREE AUTO-CLOUD SYNC SCHEDULER
// -------------------------------------------------------------
const AUTO_SYNC_SETTINGS_KEY = 'elite_auto_cloud_sync_settings';

export function getAutoSyncSettings() {
  try {
    const raw = localStorage.getItem(AUTO_SYNC_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: Boolean(parsed?.enabled ?? true),
        intervalHours: Number(parsed?.intervalHours) || 24,
        lastSyncTime: parsed?.lastSyncTime || null,
      };
    }
  } catch (_) {}
  return { enabled: true, intervalHours: 24, lastSyncTime: null };
}

export function saveAutoSyncSettings(settings) {
  try {
    localStorage.setItem(AUTO_SYNC_SETTINGS_KEY, JSON.stringify(settings));
  } catch (_) {}
}

export async function triggerAutoCloudSyncIfNeeded({ vaultId, pin, deviceName = 'Auto-Sync POS', getPayloadFn }) {
  const autoSettings = getAutoSyncSettings();
  if (!autoSettings.enabled) return false;

  const now = Date.now();
  const lastSyncMs = autoSettings.lastSyncTime ? new Date(autoSettings.lastSyncTime).getTime() : 0;
  const intervalMs = autoSettings.intervalHours * 60 * 60 * 1000;

  if (now - lastSyncMs < intervalMs) {
    return false; // Not due yet
  }

  if (!vaultId || !pin || pin.length < 4) return false;

  try {
    const payload = await getPayloadFn();
    if (!payload) return false;

    const syncInfo = await pushToCloudVault({
      vaultId,
      pin,
      payload,
      deviceName: `${deviceName} (Auto)`,
      overwritePin: false,
    });

    const nextSettings = {
      ...autoSettings,
      lastSyncTime: new Date().toISOString(),
    };
    saveAutoSyncSettings(nextSettings);
    return syncInfo;
  } catch (err) {
    console.warn('[Auto-Cloud Sync Background] Failed:', err.message);
    return false;
  }
}
