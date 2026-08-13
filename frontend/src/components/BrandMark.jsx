import React from 'react';

/**
 * Elite Chocolate mark — heritage circular seal (burgundy + gold).
 * Stacked wordmark with gold rule so "CHOCOLATE" never clips the rings.
 */
export default function BrandMark({ size = 36, className = '', style }) {
  const px = typeof size === 'number' ? size : 36;
  return (
    <svg
      className={`brand-logo-svg ${className}`.trim()}
      width={px}
      height={px}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ width: px, height: px, flexShrink: 0, ...style }}
    >
      <circle cx="32" cy="32" r="32" fill="#5C1A2E" />
      <circle cx="32" cy="32" r="29" fill="none" stroke="#C9A96E" strokeWidth="1.2" />
      <circle cx="32" cy="32" r="26.6" fill="none" stroke="#C9A96E" strokeWidth="0.5" />
      <text
        x="32"
        y="30.5"
        textAnchor="middle"
        fill="#FFFFFF"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontStyle="italic"
        fontSize="15.5"
        fontWeight="500"
      >
        elite
      </text>
      <line
        x1="22"
        y1="35"
        x2="42"
        y2="35"
        stroke="#C9A96E"
        strokeWidth="0.7"
        strokeLinecap="round"
        opacity="0.85"
      />
      <text
        x="32"
        y="43.5"
        textAnchor="middle"
        fill="#C9A96E"
        fontFamily="Georgia, 'Times New Roman', Times, serif"
        fontSize="5"
        fontWeight="600"
        letterSpacing="0.55"
      >
        CHOCOLATE
      </text>
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

export function DeveloperCredit({ className = '', compact = false }) {
  return (
    <p className={`developer-credit ${compact ? 'is-compact' : ''} ${className}`.trim()}>
      <span className="developer-credit-label">Developer by</span>
      <span className="developer-credit-name">Muhammad Haris</span>
    </p>
  );
}
