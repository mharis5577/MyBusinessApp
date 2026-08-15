import { Filesystem, Directory } from '@capacitor/filesystem';
import { shrinkDataUrl } from './imageCompress';

const PROOF_DIR = 'payment-proofs';

function dataUrlToBase64(dataUrl) {
  const raw = String(dataUrl || '');
  const comma = raw.indexOf(',');
  return comma >= 0 ? raw.slice(comma + 1) : raw;
}

/**
 * Full JPEG on disk; small thumb in the payment row.
 * Falls back to storing the compressed data URL if the filesystem write fails.
 */
export async function persistPaymentProof(dataUrl) {
  if (!dataUrl) {
    return { screenshot_data: '', screenshot_path: '', screenshot_thumb: '' };
  }
  const screenshot_thumb = await shrinkDataUrl(dataUrl, { maxWidth: 160, quality: 0.5 });
  const path = `${PROOF_DIR}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.jpg`;
  try {
    await Filesystem.mkdir({ path: PROOF_DIR, directory: Directory.Data, recursive: true }).catch(() => {});
    await Filesystem.writeFile({
      path,
      data: dataUrlToBase64(dataUrl),
      directory: Directory.Data,
    });
    return { screenshot_data: '', screenshot_path: path, screenshot_thumb };
  } catch {
    return { screenshot_data: dataUrl, screenshot_path: '', screenshot_thumb };
  }
}

export async function readPaymentProof(payment) {
  if (!payment) return '';
  if (payment.screenshot_data) return payment.screenshot_data;
  if (payment.screenshot_path) {
    try {
      const got = await Filesystem.readFile({
        path: payment.screenshot_path,
        directory: Directory.Data,
      });
      const data = typeof got?.data === 'string' ? got.data : '';
      if (data) return data.startsWith('data:') ? data : `data:image/jpeg;base64,${data}`;
    } catch {
      /* missing file */
    }
  }
  return payment.screenshot_thumb || '';
}

export function paymentProofPreview(payment) {
  return payment?.screenshot_thumb || payment?.screenshot_data || '';
}

export function paymentHasProof(payment) {
  return Boolean(
    paymentProofPreview(payment) || payment?.screenshot_path || payment?.has_screenshot
  );
}

export async function deletePaymentProofFile(payment) {
  const path = payment?.screenshot_path;
  if (!path) return;
  try {
    await Filesystem.deleteFile({ path, directory: Directory.Data });
  } catch {
    /* already gone */
  }
}
