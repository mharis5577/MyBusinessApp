/**
 * Default Branding Assets (Logo & Official Stamp)
 * Generates standalone SVG Data URLs that render flawlessly in html2canvas, jspdf, and all browsers.
 */

export function getDefaultLogoDataUrl(companyName = 'ELITE CHOCOLATE') {
  const safeName = String(companyName || 'ELITE CHOCOLATE').toUpperCase();
  const isElite = /elite\s*chocolate/i.test(companyName);
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="120" height="120">
    <defs>
      <radialGradient id="bgGrad" cx="40%" cy="40%" r="60%">
        <stop offset="0%" stop-color="#7a223e"/>
        <stop offset="100%" stop-color="#40101f"/>
      </radialGradient>
      <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f6e05e"/>
        <stop offset="50%" stop-color="#d97706"/>
        <stop offset="100%" stop-color="#b45309"/>
      </linearGradient>
    </defs>
    <circle cx="60" cy="60" r="58" fill="url(#bgGrad)" stroke="url(#goldGrad)" stroke-width="2.5"/>
    <circle cx="60" cy="60" r="52" fill="none" stroke="url(#goldGrad)" stroke-width="0.8" stroke-dasharray="2,2"/>
    <circle cx="60" cy="60" r="48" fill="none" stroke="url(#goldGrad)" stroke-width="1.2"/>
    ${isElite ? `
      <text x="60" y="56" text-anchor="middle" fill="#ffffff" font-family="Georgia, serif" font-style="italic" font-size="28" font-weight="600">elite</text>
      <line x1="42" y1="64" x2="78" y2="64" stroke="url(#goldGrad)" stroke-width="1.2" stroke-linecap="round"/>
      <text x="60" y="77" text-anchor="middle" fill="url(#goldGrad)" font-family="Arial, sans-serif" font-size="9.5" font-weight="800" letter-spacing="2.5">CHOCOLATE</text>
    ` : `
      <text x="60" y="65" text-anchor="middle" fill="#ffffff" font-family="Arial, sans-serif" font-size="14" font-weight="800" letter-spacing="1.2">${safeName.substring(0, 16)}</text>
    `}
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function getDefaultStampDataUrl(companyName = 'ELITE CHOCOLATE', subtitle = 'OFFICIAL SEAL') {
  const safeName = String(companyName || 'ELITE CHOCOLATE').toUpperCase().substring(0, 24);
  const safeSub = String(subtitle || 'OFFICIAL SEAL').toUpperCase();

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
    <defs>
      <path id="circlePathTop" d="M 24,80 A 56,56 0 0,1 136,80" fill="none"/>
      <path id="circlePathBottom" d="M 136,80 A 56,56 0 0,1 24,80" fill="none"/>
    </defs>
    <!-- Outer stamp rings -->
    <circle cx="80" cy="80" r="76" fill="none" stroke="#1e3a8a" stroke-width="3.5" stroke-dasharray="1200" opacity="0.9"/>
    <circle cx="80" cy="80" r="71" fill="none" stroke="#1e3a8a" stroke-width="1" opacity="0.7"/>
    <circle cx="80" cy="80" r="46" fill="none" stroke="#1e3a8a" stroke-width="2" opacity="0.85"/>
    
    <!-- Curved company text -->
    <text font-family="'Outfit', Arial, sans-serif" font-size="10.5" font-weight="900" fill="#1e3a8a" letter-spacing="2">
      <textPath href="#circlePathTop" startOffset="50%" text-anchor="middle">
        ★ ${safeName} ★
      </textPath>
    </text>
    
    <text font-family="'Outfit', Arial, sans-serif" font-size="9" font-weight="800" fill="#1e3a8a" letter-spacing="2.5">
      <textPath href="#circlePathBottom" startOffset="50%" text-anchor="middle">
        ${safeSub}
      </textPath>
    </text>
    
    <!-- Center badge & sign lines -->
    <g transform="translate(80, 80) rotate(-6)">
      <rect x="-42" y="-12" width="84" height="24" rx="4" fill="#1e3a8a" fill-opacity="0.08" stroke="#1e3a8a" stroke-width="1.2"/>
      <text x="0" y="3" text-anchor="middle" font-family="'Outfit', Arial, sans-serif" font-size="9" font-weight="900" fill="#1e3a8a" letter-spacing="1">
        AUTHORIZED
      </text>
      <text x="0" y="16" text-anchor="middle" font-family="Arial, sans-serif" font-size="6.5" font-weight="700" fill="#1e3a8a" letter-spacing="0.5">
        SIGN &amp; STAMP
      </text>
    </g>
  </svg>`;

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
