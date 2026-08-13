import React from 'react';

/**
 * CocoaDesk mark — cacao bean + leaf on ink tile.
 * size: number (px) or CSS length
 */
export default function BrandMark({ size = 36, className = '', style }) {
  const px = typeof size === 'number' ? size : undefined;
  return (
    <svg
      className={`brand-logo-svg ${className}`.trim()}
      width={px}
      height={px}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={style}
    >
      <defs>
        <linearGradient id="cd-tile" x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1a1a1a" />
          <stop offset="1" stopColor="#0d0d0d" />
        </linearGradient>
        <linearGradient id="cd-bean" x1="22" y1="14" x2="44" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f7f4ec" />
          <stop offset="1" stopColor="#e8e2d4" />
        </linearGradient>
        <linearGradient id="cd-teal" x1="20" y1="12" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2dd4c8" />
          <stop offset="1" stopColor="#00b3a6" />
        </linearGradient>
      </defs>

      <rect width="64" height="64" rx="18" fill="url(#cd-tile)" />
      <rect x="3" y="3" width="58" height="58" rx="15.5" stroke="rgba(244,242,235,0.12)" strokeWidth="1" />

      {/* cacao leaf */}
      <path
        d="M41.5 13.5c6.2 3.4 9.8 9.2 9.2 15.2-4.8-1.6-9.6-5.4-12.4-10.8 1.2-1.7 2.2-3.1 3.2-4.4Z"
        fill="url(#cd-teal)"
        opacity="0.95"
      />
      <path
        d="M40.8 15.2c3.8 2.8 6.4 6.6 7.2 10.2"
        stroke="#0d0d0d"
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.35"
      />

      {/* cacao bean */}
      <path
        d="M32 12.5c-8.2 5.2-13.5 13.4-13.5 22.2 0 10.2 7.1 18.6 13.5 24.1 6.4-5.5 13.5-13.9 13.5-24.1 0-8.8-5.3-17-13.5-22.2Z"
        fill="url(#cd-bean)"
      />
      <path
        d="M32 18c-1.35 4.4-2.05 8.8-2.05 13.2 0 5.9 1.2 11.4 2.05 16.1.85-4.7 2.05-10.2 2.05-16.1 0-4.4-.7-8.8-2.05-13.2Z"
        fill="url(#cd-teal)"
      />
      <circle cx="25.2" cy="29.5" r="2.15" fill="#00b3a6" opacity="0.85" />
      <circle cx="38.6" cy="33.2" r="1.9" fill="#00b3a6" opacity="0.75" />
      <circle cx="28.8" cy="41.8" r="1.55" fill="#00b3a6" opacity="0.7" />

      {/* desk baseline */}
      <path d="M18 54.5h28" stroke="#2dd4c8" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

export function BrandWordmark({ subtitle = 'POS & Bills', stacked = true, className = '' }) {
  return (
    <span className={`brand-wordmark ${stacked ? 'is-stacked' : ''} ${className}`.trim()}>
      <span className="brand-wordmark-elite">ELITE</span>
      <span className="brand-wordmark-chocolate">CHOCOLATE</span>
      {subtitle ? <small className="brand-wordmark-sub">{subtitle}</small> : null}
    </span>
  );
}

/** Stylish developer credit line */
export function DeveloperCredit({ className = '', compact = false }) {
  return (
    <p className={`developer-credit ${compact ? 'is-compact' : ''} ${className}`.trim()}>
      <span className="developer-credit-label">Developer by</span>
      <span className="developer-credit-name">Muhammad Haris</span>
    </p>
  );
}
