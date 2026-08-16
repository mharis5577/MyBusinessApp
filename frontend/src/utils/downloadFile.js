import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

function isNative() {
  try {
    return Boolean(Capacitor.isNativePlatform?.());
  } catch {
    return false;
  }
}

function isMobileBrowser() {
  try {
    if (navigator.userAgentData?.mobile) return true;
  } catch {
    /* ignore */
  }
  if (/Android|iPhone|iPad|iPod|Mobile|webOS|BlackBerry/i.test(navigator.userAgent || '')) {
    return true;
  }
  // Phone layout / DevTools device mode (narrow + coarse pointer)
  try {
    if (window.matchMedia('(max-width: 900px) and (pointer: coarse)').matches) return true;
    if (window.matchMedia('(max-width: 700px)').matches && (navigator.maxTouchPoints || 0) > 0) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error('Could not read file data'));
    reader.readAsDataURL(blob);
  });
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

function canShareSafely(data) {
  try {
    if (typeof navigator?.canShare !== 'function') return false;
    return Boolean(navigator.canShare(data));
  } catch {
    return false;
  }
}

async function webShareSafely(data) {
  try {
    if (typeof navigator?.share !== 'function') return false;
    await navigator.share(data);
    return true;
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    return false;
  }
}

function makeShareFile(blob, safeName, type) {
  try {
    if (blob instanceof File) return blob;
    return new File([blob], safeName, { type });
  } catch {
    return null;
  }
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

async function shareViaCapacitor(blob, safeName, type, { title, dialogTitle, text } = {}) {
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
      text: text || undefined,
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
        text: text || undefined,
        url: uri,
        dialogTitle: dialogTitle || title || 'Save or share',
      });
      return 'shared';
    } catch (err2) {
      const msg2 = String(err2?.message || err2 || '');
      if (/cancel|abort|dismiss/i.test(msg2)) {
        throw Object.assign(new Error('Share cancelled'), { name: 'AbortError' });
      }
      return null;
    }
  }
}

/**
 * Save or share a Blob on web + Capacitor Android.
 * Returns: 'shared' | 'downloaded'
 *
 * Desktop browsers: always download (Web Share + files is unreliable / throws).
 * Phone browser: try Web Share, else download.
 * Native APK: Capacitor Share sheet.
 */
export async function saveOrShareBlob(blob, filename, mimeType, { title, dialogTitle, text, preferDownload = false } = {}) {
  try {
    if (!blob) throw new Error('Nothing to share');
    const type = mimeType || blob.type || 'application/octet-stream';
    const safeName = String(filename || 'file').replace(/[^\w.\-]+/g, '_');

    if (isNative()) {
      try {
        const result = await shareViaCapacitor(blob, safeName, type, { title, dialogTitle, text });
        if (result) return result;
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
        console.warn('Capacitor Share failed, downloading instead', err);
      }
      // Last resort on native: still try download via anchor (may no-op in WebView)
      try {
        anchorDownload(blob, safeName);
      } catch {
        /* ignore */
      }
      return 'downloaded';
    }

    // Desktop / preferDownload: skip flaky navigator.share entirely
    const allowWebShare = !preferDownload && isMobileBrowser();

    if (allowWebShare) {
      try {
        const file = makeShareFile(blob, safeName, type);
        if (file) {
          const withFiles = { files: [file], title: title || safeName };
          if (text) withFiles.text = text;
          if (canShareSafely(withFiles) && (await webShareSafely(withFiles))) {
            return 'shared';
          }
          if (canShareSafely({ files: [file] }) && (await webShareSafely({ files: [file], title: title || safeName }))) {
            return 'shared';
          }
        }
      } catch (err) {
        if (err?.name === 'AbortError') throw err;
      }
    }

    anchorDownload(blob, safeName);
    return 'downloaded';
  } catch (err) {
    if (err?.name === 'AbortError') throw err;
    // Absolute fallback — never surface Illegal invocation to the UI
    try {
      const safeName = String(filename || 'file').replace(/[^\w.\-]+/g, '_');
      if (blob) anchorDownload(blob, safeName);
      return 'downloaded';
    } catch {
      throw new Error(err?.message || 'Could not save file');
    }
  }
}

/** Force a file download (desktop). On native APK still opens the share sheet. */
export async function downloadBlob(blob, filename, mimeType) {
  return saveOrShareBlob(blob, filename, mimeType || blob.type, {
    title: filename,
    preferDownload: true,
  });
}
