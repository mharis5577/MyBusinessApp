/**
 * Due-date reminders. OPT-IN only — never prompts until Settings is turned on.
 */
import { Capacitor } from '@capacitor/core';
import { apiFetch } from '../api/client';
import { formatCurrency, pakistanToday } from './pakistan';

const LAST_DAY_KEY = 'elite-due-notify-day';
const SUMMARY_ID = 4101;
const DAILY_ID = 4102;

function isNative() {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export function dueRemindersEnabled(settings = {}) {
  return Boolean(Number(settings.due_reminders));
}

async function loadPlugin() {
  const { LocalNotifications } = await import('@capacitor/local-notifications');
  return LocalNotifications;
}

export async function requestDueReminderPermission() {
  if (!isNative()) return { granted: false, reason: 'web' };
  try {
    const LocalNotifications = await loadPlugin();
    let perm = await LocalNotifications.checkPermissions();
    if (perm.display !== 'granted') {
      perm = await LocalNotifications.requestPermissions();
    }
    return { granted: perm.display === 'granted', reason: perm.display };
  } catch (err) {
    return { granted: false, reason: err?.message || 'plugin' };
  }
}

function summarize(rows, currencySymbol) {
  const overdue = (rows || []).filter((r) => (Number(r.days_overdue) || 0) >= 1);
  const dueToday = (rows || []).filter((r) => (Number(r.days_overdue) || 0) === 0);
  const overdueAmt = overdue.reduce((s, r) => s + (Number(r.balance_due) || 0), 0);
  const dueAmt = dueToday.reduce((s, r) => s + (Number(r.balance_due) || 0), 0);
  return { overdue, dueToday, overdueAmt, dueAmt, currencySymbol };
}

function buildBody({ overdue, dueToday, overdueAmt, dueAmt, currencySymbol }) {
  const parts = [];
  if (overdue.length) {
    parts.push(`${overdue.length} overdue · ${formatCurrency(currencySymbol, overdueAmt)}`);
  }
  if (dueToday.length) {
    parts.push(`${dueToday.length} due today · ${formatCurrency(currencySymbol, dueAmt)}`);
  }
  return parts.join(' · ') || 'No open balances';
}

/**
 * If reminders are ON: request permission, notify once per Pakistan day, and set a 10:00 daily alert.
 */
export async function syncDueReminders(settings = {}) {
  if (!dueRemindersEnabled(settings)) return { skipped: true, reason: 'off' };
  if (!isNative()) return { skipped: true, reason: 'web' };

  const perm = await requestDueReminderPermission();
  if (!perm.granted) return { skipped: true, reason: 'denied' };

  const res = await apiFetch('/api/reports/aging');
  const report = await res.json();
  if (!res.ok) throw new Error(report?.error || 'Aging report failed');

  const summary = summarize(report.rows || [], settings.currency_symbol || 'Rs.');
  if (!summary.overdue.length && !summary.dueToday.length) {
    await cancelDueReminders();
    return { skipped: true, reason: 'none' };
  }

  const LocalNotifications = await loadPlugin();
  const body = buildBody(summary);

  try {
    await LocalNotifications.cancel({ notifications: [{ id: SUMMARY_ID }, { id: DAILY_ID }] });
  } catch (_) {
    /* ignore */
  }

  const today = pakistanToday();
  let last = '';
  try {
    last = localStorage.getItem(LAST_DAY_KEY) || '';
  } catch (_) {
    /* ignore */
  }

  const notifications = [
    {
      id: DAILY_ID,
      title: 'ELITE CHOCOLATE — collections',
      body,
      schedule: { on: { hour: 10, minute: 0 }, repeats: true, allowWhileIdle: true },
    },
  ];

  if (last !== today) {
    notifications.push({
      id: SUMMARY_ID,
      title: 'Bills need follow-up',
      body,
      schedule: { at: new Date(Date.now() + 2500), allowWhileIdle: true },
    });
    try {
      localStorage.setItem(LAST_DAY_KEY, today);
    } catch (_) {
      /* ignore */
    }
  }

  await LocalNotifications.schedule({ notifications });
  return { skipped: false, body };
}

export async function cancelDueReminders() {
  if (!isNative()) return;
  try {
    const LocalNotifications = await loadPlugin();
    await LocalNotifications.cancel({ notifications: [{ id: SUMMARY_ID }, { id: DAILY_ID }] });
  } catch (_) {
    /* ignore */
  }
}
