export const APP_THEMES = [
  {
    id: 'chocolatier',
    name: 'Chocolatier Velvet',
    tagline: 'Warm cocoa, roasted espresso & 24K gold accents',
    bg: '#140d09',
    cardBg: '#231710',
    accent: '#d4af37',
    textColor: '#fdfbf7',
    icon: 'Sparkles',
  },
  {
    id: 'dark',
    name: 'Midnight Obsidian',
    tagline: 'Stealth charcoal black with emerald & mint glow',
    bg: '#0c0c0b',
    cardBg: '#171716',
    accent: '#2dd4c8',
    textColor: '#f4f2eb',
    icon: 'Moon',
  },
  {
    id: 'light',
    name: 'Ivory Studio',
    tagline: 'Crisp paper ivory cream with high contrast ink',
    bg: '#f4f2eb',
    cardBg: '#ffffff',
    accent: '#00b3a6',
    textColor: '#111111',
    icon: 'Sun',
  },
  {
    id: 'emerald',
    name: 'Royal Emerald & Gold',
    tagline: 'Imperial deep forest green with champagne gold',
    bg: '#061510',
    cardBg: '#122a22',
    accent: '#e4c56b',
    textColor: '#f5fbf7',
    icon: 'Crown',
  },
  {
    id: 'sapphire',
    name: 'Midnight Sapphire',
    tagline: 'Oceanic royal navy with icy platinum & cyan',
    bg: '#070d1e',
    cardBg: '#132140',
    accent: '#38bdf8',
    textColor: '#f0f7ff',
    icon: 'Compass',
  },
  {
    id: 'rose',
    name: 'Velvet Rose & Wine',
    tagline: 'Deep luxury burgundy with champagne rose gold',
    bg: '#140a10',
    cardBg: '#271520',
    accent: '#f4a4b4',
    textColor: '#fff5f8',
    icon: 'Heart',
  },
];

export const QUICK_THEMES_KEY = 'elite_quick_theme_pair';

export function getQuickThemes() {
  try {
    const raw = localStorage.getItem(QUICK_THEMES_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length === 2) {
        return parsed;
      }
    }
  } catch (_) {}
  return ['chocolatier', 'dark'];
}

export function saveQuickThemes(pair) {
  try {
    if (Array.isArray(pair) && pair.length === 2) {
      localStorage.setItem(QUICK_THEMES_KEY, JSON.stringify(pair));
    }
  } catch (_) {}
}

export function getNextQuickTheme(currentTheme, pair = null) {
  const [t1, t2] = pair || getQuickThemes();
  if (currentTheme === t1) return t2;
  return t1;
}
