import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
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

function isTextMime(mimeType) {
  const type = String(mimeType || '').toLowerCase();
  return type.includes('json') || type.startsWith('text/') || type.includes('csv');
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

export async function readPickedFileText(file) {
  if (!file) throw new Error('No file selected');
  if (typeof file.text === 'function') {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that file'));
    reader.readAsText(file);
  });
}

/**
 * Save or share a Blob on web + Capacitor Android.
 * Returns: 'shared' | 'downloaded'
 */
export async function saveOrShareBlob(blob, filename, mimeType, { title, dialogTitle } = {}) {
  const type = mimeType || blob.type || 'application/octet-stream';
  const safeName = String(filename || 'file').replace(/[^\w.\-]+/g, '_');

  if (isNative()) {
    const path = `share/${Date.now()}_${safeName}`;
    const writeOpts = {
      path,
      directory: Directory.Cache,
      recursive: true,
    };
    if (isTextMime(type)) {
      writeOpts.data = await blob.text();
      writeOpts.encoding = Encoding.UTF8;
    } else {
      writeOpts.data = await blobToBase64(blob);
    }
    await Filesystem.writeFile(writeOpts);
    const { uri } = await Filesystem.getUri({
      path,
      directory: Directory.Cache,
    });

    try {
      await Share.share({
        title: title || safeName,
        files: [uri],
        dialogTitle: dialogTitle || title || 'Save or share',
      });
      return 'shared';
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (/cancel|abort|dismiss/i.test(msg)) {
        throw Object.assign(new Error('Share cancelled'), { name: 'AbortError' });
      }
      try {
        await Share.share({
          title: title || safeName,
          url: uri,
          dialogTitle: dialogTitle || title || 'Save or share',
        });
        return 'shared';
      } catch (err2) {
        const msg2 = String(err2?.message || err2 || '');
        if (/cancel|abort|dismiss/i.test(msg2)) {
          throw Object.assign(new Error('Share cancelled'), { name: 'AbortError' });
        }
        console.warn('Capacitor Share failed, downloading instead', err2);
      }
    }
  }

  const file = blob instanceof File ? blob : new File([blob], safeName, { type });
  const sharePayload = { files: [file], title: title || safeName };
  if (navigator.canShare && navigator.canShare(sharePayload)) {
    try {
      await navigator.share(sharePayload);
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
    }
  }

  anchorDownload(blob, safeName);
  return 'downloaded';
}

/** Force a download (or native share sheet) without requiring share UI text. */
export async function downloadBlob(blob, filename, mimeType) {
  return saveOrShareBlob(blob, filename, mimeType || blob.type, { title: filename });
}
