import React, { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';

/**
 * Camera barcode / QR scanner using BarcodeDetector when available.
 * Falls back to a tip to type the SKU if unsupported.
 */
export default function BarcodeScanner({ open, onClose, onDetected }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!open) return undefined;

    let cancelled = false;
    setError('');

    const stop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };

    const start = async () => {
      if (typeof window.BarcodeDetector !== 'function') {
        setSupported(false);
        setError('Barcode camera not supported on this device. Type the SKU instead.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }

        const detector = new window.BarcodeDetector({
          formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e'],
        });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes?.length) {
              const raw = String(codes[0].rawValue || '').trim();
              if (raw) {
                onDetected?.(raw);
                onClose?.();
                return;
              }
            }
          } catch (_) {
            /* keep scanning */
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (err) {
        setError(err?.message || 'Camera permission denied');
        setSupported(false);
      }
    };

    start();
    return () => {
      cancelled = true;
      stop();
    };
  }, [open, onClose, onDetected]);

  if (!open) return null;

  return (
    <div className="barcode-scanner-overlay" role="dialog" aria-modal="true">
      <div className="barcode-scanner-sheet glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Camera size={18} /> Scan barcode
          </h3>
          <button type="button" className="btn-secondary" style={{ width: 'auto', padding: '0.35rem 0.55rem' }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        {supported ? (
          <video ref={videoRef} playsInline muted className="barcode-scanner-video" />
        ) : (
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{error || 'Scanner unavailable'}</p>
        )}
        {error && supported ? (
          <p style={{ fontSize: '0.8rem', color: 'var(--danger)', marginTop: '0.5rem' }}>{error}</p>
        ) : (
          <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.55rem' }}>
            Point the camera at the product barcode. Or close and type the SKU.
          </p>
        )}
      </div>
    </div>
  );
}
