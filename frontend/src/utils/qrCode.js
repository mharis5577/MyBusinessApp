import QRCode from 'qrcode';

/**
 * Generate a local QR code data URL offline without network requests.
 * @param {string} text - The text/payload to encode into the QR code
 * @param {object} options - Optional QRCode options (width, margin, errorCorrectionLevel)
 * @returns {Promise<string>} Data URL string (image/png)
 */
export async function generateQrDataUrl(text, options = {}) {
  if (!text) return '';
  try {
    return await QRCode.toDataURL(text, {
      width: options.width || 160,
      margin: options.margin ?? 1,
      errorCorrectionLevel: options.errorCorrectionLevel || 'M',
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      ...options,
    });
  } catch (err) {
    console.warn('QR code generation failed:', err);
    return '';
  }
}
