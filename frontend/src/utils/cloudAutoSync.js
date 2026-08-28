/**
 * Drives the cloud backup from app launch / resume instead of from the
 * Cloud Sync panel, which most users never open.
 */
import { apiFetch } from '../api/client';
import {
  normalizeVaultId,
  getStoredVaultPin,
  triggerAutoCloudSyncIfNeeded,
} from './firebaseSync';

let inFlight = false;

export async function runCloudAutoSync({ companyPhone = '', deviceName = 'POS Terminal' } = {}) {
  if (inFlight) return false;
  const pin = getStoredVaultPin();
  if (!pin || pin.length < 4) return false;

  const vaultId = companyPhone ? normalizeVaultId(companyPhone) : 'elite_chocolate_store';
  if (!vaultId) return false;

  inFlight = true;
  try {
    return await triggerAutoCloudSyncIfNeeded({
      vaultId,
      pin,
      deviceName,
      getPayloadFn: async () => {
        const res = await apiFetch('/api/backup');
        if (!res.ok) throw new Error(`Could not read shop data (${res.status})`);
        return res.json();
      },
    });
  } finally {
    inFlight = false;
  }
}
