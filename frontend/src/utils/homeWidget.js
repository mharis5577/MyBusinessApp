import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

const WIDGET_FILE = 'widget-stats.json';
const HomeWidget = registerPlugin('HomeWidget');

/** Push Home-screen widget figures (no-op in the browser). */
export async function publishHomeWidgetStats({
  profitToday = 0,
  overdue = 0,
  currency = 'Rs.',
} = {}) {
  try {
    if (!Capacitor.isNativePlatform?.()) return;
    await Filesystem.writeFile({
      path: WIDGET_FILE,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      data: JSON.stringify({
        profit_today: Math.round(Number(profitToday) || 0),
        overdue: Math.round(Number(overdue) || 0),
        currency: String(currency || 'Rs.').trim() || 'Rs.',
        updated: new Date().toISOString(),
      }),
    });
    await HomeWidget.refresh();
  } catch (err) {
    console.warn('Home widget update skipped', err);
  }
}
