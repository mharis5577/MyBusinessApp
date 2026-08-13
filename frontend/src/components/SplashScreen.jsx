import React, { useEffect, useState } from 'react';
import BrandMark, { BrandWordmark, DeveloperCredit } from './BrandMark';

const SPLASH_KEY = 'elite-splash-shown';

/**
 * Short branded splash on cold start (once per app session).
 */
export default function SplashScreen({ onDone, minMs = 1200 }) {
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let skip = false;
    try {
      if (sessionStorage.getItem(SPLASH_KEY) === '1') skip = true;
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) skip = true;
    } catch (_) {
      /* ignore */
    }

    if (skip) {
      onDone?.();
      return undefined;
    }

    const leaveAt = setTimeout(() => setLeaving(true), minMs);
    const doneAt = setTimeout(() => {
      try {
        sessionStorage.setItem(SPLASH_KEY, '1');
      } catch (_) {
        /* ignore */
      }
      onDone?.();
    }, minMs + 420);

    return () => {
      clearTimeout(leaveAt);
      clearTimeout(doneAt);
    };
  }, [minMs, onDone]);

  return (
    <div className={`splash-screen ${leaving ? 'is-leaving' : ''}`} role="status" aria-live="polite">
      <div className="splash-glow splash-glow-a" />
      <div className="splash-glow splash-glow-b" />
      <div className="splash-center">
        <div className="splash-logo-wrap">
          <BrandMark size={88} className="splash-logo" />
        </div>
        <BrandWordmark subtitle="POS & Bills" />
        <div className="splash-loader" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <p className="splash-tagline">Shop ready</p>
        <DeveloperCredit className="splash-developer" />
      </div>
    </div>
  );
}
