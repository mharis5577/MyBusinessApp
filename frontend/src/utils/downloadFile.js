import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

async function blobToBase64(blob) {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function anchorDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Save or share a Blob on web + Capacitor Android.
 * Returns: 'shared' | 'downloaded'
 */
export async function saveOrShareBlob(blob, filename, mimeType, { title, text } = {}) {
  const type = mimeType || blob.type || 'application/octet-stream';
  const file = blob instanceof File ? blob : new File([blob], filename, { type });

  if (isNative()) {
    const base64 = await blobToBase64(blob);
    const path = `exports/${Date.now()}_${filename}`;
    const written = await Filesystem.writeFile({
      path,
      data: base64,
      directory: Directory.Cache,
      recursive: true,
    });
    const uri = written.uri;
    try {
      await Share.share({
        title: title || filename,
        text: text || '',
        files: [uri],
        dialogTitle: title || 'Save or share',
      });
      return 'shared';
    } catch (err) {
      if (err?.message?.includes('cancel') || err?.message?.includes('abort')) {
        throw Object.assign(new Error('Share cancelled'), { name: 'AbortError' });
      }
      // Fall through to web share / download attempts
      console.warn('Capacitor Share failed, trying fallbacks', err);
    }
  }

  const sharePayload = { files: [file], title: title || filename, text: text || '' };
  if (navigator.canShare && navigator.canShare(sharePayload)) {
    try {
      await navigator.share(sharePayload);
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
    }
  }

  anchorDownload(blob, filename);
  return 'downloaded';
}

/** Force a download (or native share sheet) without requiring share UI text. */
export async function downloadBlob(blob, filename, mimeType) {
  return saveOrShareBlob(blob, filename, mimeType || blob.type, { title: filename });
}
