import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import {
  DollarSign,
  Clock,
  AlertTriangle,
  FileText,
  PlusCircle,
  TrendingUp,
  RefreshCw,
  ArrowDownUp,
  Wallet,
  CalendarDays,
  Shield,
  ChevronRight,
  HeartHandshake,
  Banknote,
  MessageCircle,
  Download,
  SlidersHorizontal,
  CheckCircle2,
  Zap,
  Bell,
  Users2,
  Receipt,
} from 'lucide-react';
import { downloadDailyProfitSummaryPdf } from '../utils/tableExport';
import { playSuccessChime, playTapSound } from '../utils/audioEffects';
import { formatCurrency, formatBillDateTime } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { isCancelled } from '../utils/billAdjust';
import {
  billTypeShortLabel,
  BILLS_TYPE_FILTER_KEY,
  CREATE_BILL_TYPE_KEY,
  normalizeBillType,
} from '../utils/billTypes';
import EmptyState from './EmptyState';
import StatusBadge from './StatusBadge';
import QuickPaySheet from './QuickPaySheet';
import AutomationHub from './AutomationHub';
import { getLastAutoBackupAt } from '../utils/backupManager';
import { publishHomeWidgetStats } from '../utils/homeWidget';
import { useToast } from '../toast/ToastContext';
import { billBalance } from '../utils/billPayments';
import {
  buildPaymentReminderText,
  normalizeWhatsAppPhone,
  openWhatsAppReminder,
} from '../utils/paymentReminder';

const CashflowPanel = lazy(() => import('./CashflowPanel'));
const OverduePanel = lazy(() => import('./OverduePanel'));

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  highlight = false,
  onClick,
  actionLabel,
  onAction,
  actionType = 'default',
}) {
  return (
    <div
      className={`stat-card${highlight ? ' stat-card-highlight' : ''}${onClick ? ' is-clickable' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={{
        cursor: onClick ? 'pointer' : 'default',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
      }}
    >
      <div>
        <div className="stat-card-head">
          <span className="stat-card-label">{label}</span>
          <Icon size={15} style={{ color: highlight ? 'var(--status-overdue)' : 'var(--text-muted)', flexShrink: 0 }} />
        </div>
        <div className="stat-card-value" title={String(value)}>
          {value}
        </div>
        <div className="stat-card-hint">{hint}</div>
      </div>
      {actionLabel && (
        <button
          type="button"
          className={`stat-card-action-badge${actionType === 'danger' ? ' is-danger' : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (onAction) onAction();
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="dashboard-page" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div className="skeleton-hero-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="skeleton-box" style={{ width: '180px', height: '24px' }} />
          <div className="skeleton-box" style={{ width: '140px', height: '32px' }} />
        </div>
        <div className="skeleton-box" style={{ width: '100%', height: '90px' }} />
      </div>
      <div className="stats-grid stats-grid-quiet">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="stat-card">
            <div className="skeleton-box" style={{ width: '60%', height: '14px', marginBottom: '8px' }} />
            <div className="skeleton-box" style={{ width: '80%', height: '28px', marginBottom: '6px' }} />
            <div className="skeleton-box" style={{ width: '40%', height: '12px' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function useLiveClock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const timeStr = now.toLocaleTimeString('en-US', {
    timeZone: 'Asia/Karachi',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  const dateStr = now.toLocaleDateString('en-US', {
    timeZone: 'Asia/Karachi',
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const hour = parseInt(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Karachi',
      hour: 'numeric',
      hour12: false,
    }).format(now),
    10
  );

  let greeting = 'Good evening';
  if (hour >= 5 && hour < 12) greeting = 'Good morning';
  else if (hour >= 12 && hour < 17) greeting = 'Good afternoon';

  return { timeStr, dateStr, greeting };
}

function formatHelpReturn(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]}`;
}

export default function DashboardStats({ onNavigate, onViewBill, currencySymbol = 'Rs.', settings = {}, active = true }) {
  const toast = useToast();
  const { timeStr, dateStr, greeting } = useLiveClock();
  const [stats, setStats] = useState(null);
  const [helpBills, setHelpBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [profitPeriod, setProfitPeriod] = useState('today');
  const [payBill, setPayBill] = useState(null);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [automationOpen, setAutomationOpen] = useState(false);
  const [automationTab, setAutomationTab] = useState('brief');
  const [heroPeriod, setHeroPeriod] = useState('today');

  const fetchStats = async (soft = false) => {
    if (!soft) setLoading(true);
    try {
      const statsRes = await apiFetch('/api/stats');
      const data = await statsRes.json();
      setStats(data && !data.error ? data : {});
      const fromStats = Array.isArray(data?.help_bills) ? data.help_bills : [];
      const rows = fromStats.filter((b) => !isCancelled(b) && normalizeBillType(b.bill_type) === 'help');
      rows.sort((a, b) => {
        const aDue = Math.max(0, (Number(a.total_amount) || 0) - (Number(a.amount_paid) || 0));
        const bDue = Math.max(0, (Number(b.total_amount) || 0) - (Number(b.amount_paid) || 0));
        if ((aDue > 0) !== (bDue > 0)) return aDue > 0 ? -1 : 1;
        return String(a.due_date || '').localeCompare(String(b.due_date || ''));
      });
      setHelpBills(rows);
      publishHomeWidgetStats({
        profitToday: Number(data?.profit_today) || 0,
        overdue: Number(data?.total_overdue) || 0,
        currency: currencySymbol,
      });
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    if (active) fetchStats(true);
  }, [active]);

  const liveHelpGiven = helpBills.reduce((s, b) => s + (Number(b.total_amount) || 0), 0);
  const liveHelpRepaid = helpBills.reduce((s, b) => s + (Number(b.amount_paid) || 0), 0);
  const liveHelpOut = Math.round(Math.max(0, liveHelpGiven - liveHelpRepaid) * 100) / 100;

  const loadFullHelp = async (row) => {
    try {
      const res = await apiFetch(`/api/bills/${row.id}`);
      const data = await res.json();
      if (res.ok && data?.id) return data;
    } catch {
      /* ignore */
    }
    return row;
  };

  const openHelpBill = async (row) => {
    const full = await loadFullHelp(row);
    if (onViewBill) onViewBill(full);
    else if (onNavigate) onNavigate('database');
  };

  const remindHelp = async (row) => {
    const bill = await loadFullHelp(row);
    const raw = bill.customer_phone;
    if (!raw || !normalizeWhatsAppPhone(raw)) {
      toast.info('Add a phone number on this bill to send WhatsApp.');
      return;
    }
    const text = buildPaymentReminderText({
      bill,
      settings,
      currencySymbol,
      urdu: Boolean(settings.urdu_labels),
    });
    openWhatsAppReminder(bill.customer_phone, text);
  };

  const payHelp = async (row) => {
    const bill = await loadFullHelp(row);
    if (billBalance(bill) <= 0) {
      toast.info('Already returned.');
      return;
    }
    setPayBill(bill);
  };

  const handleDownloadDailyReport = async () => {
    setGeneratingReport(true);
    playTapSound();
    try {
      const res = await apiFetch('/api/bills');
      const allBills = await res.json().catch(() => []);
      const todayIso = new Date().toISOString().slice(0, 10);
      const todayBills = (allBills || []).filter((b) =>
        String(b.bill_date || b.created_at || '').startsWith(todayIso)
      );

      await downloadDailyProfitSummaryPdf({
        companyName: settings?.company_name || 'ELITE CHOCOLATE',
        currencySymbol,
        stats: {
          sales_today: stats?.sales_today ?? 0,
          cost_today: stats?.cost_today ?? 0,
          profit_today: stats?.profit_today ?? 0,
          margin_today: stats?.margin_today ?? 0,
        },
        bills: todayBills.length ? todayBills : (stats?.recent_bills || []),
        filename: `Daily_Profit_Summary_${todayIso}.pdf`,
      });
      playSuccessChime();
      toast.success('Daily profit summary PDF downloaded!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate daily summary PDF');
    } finally {
      setGeneratingReport(false);
    }
  };

  if (loading && !stats) {
    return <DashboardSkeleton />;
  }

  const {
    total_revenue = 0,
    total_pending = 0,
    total_overdue = 0,
    total_bills = 0,
    overdue_bills_count = 0,
    recent_bills = [],
    sales_today = 0,
    cost_today = 0,
    profit_today = 0,
    sales_week = 0,
    cost_week = 0,
    profit_week = 0,
    sales_month = 0,
    cost_month = 0,
    profit_month = 0,
    sales_total = 0,
    cost_total = 0,
    profit_total = 0,
    sales_mom_pct = null,
    profit_mom_pct = null,
    sales_last_month = 0,
    profit_last_month = 0,
  } = stats || {};

  const help_given = liveHelpGiven || Number(stats?.help_given) || 0;
  const help_repaid = liveHelpRepaid || Number(stats?.help_repaid) || 0;
  const help_outstanding = helpBills.length ? liveHelpOut : Number(stats?.help_outstanding) || 0;
  const help_count = helpBills.length || Number(stats?.help_count) || 0;
  const help_rows = helpBills;

  const lastBackup = getLastAutoBackupAt();
  const money = (n) => formatCurrency(currencySymbol, n, { maximumFractionDigits: 0 });

  const margin_today = sales_today > 0 ? ((profit_today / sales_today) * 100).toFixed(1) : '0.0';
  const margin_week = sales_week > 0 ? ((profit_week / sales_week) * 100).toFixed(1) : '0.0';
  const margin_month = sales_month > 0 ? ((profit_month / sales_month) * 100).toFixed(1) : '0.0';
  const margin_total = sales_total > 0 ? ((profit_total / sales_total) * 100).toFixed(1) : '0.0';

  const goGiveHelp = () => {
    try {
      sessionStorage.setItem(CREATE_BILL_TYPE_KEY, 'help');
    } catch {
      /* ignore */
    }
    onNavigate('create');
  };

  const goHelpBills = () => {
    try {
      sessionStorage.setItem(BILLS_TYPE_FILTER_KEY, 'help');
    } catch {
      /* ignore */
    }
    onNavigate('database');
  };

  const isHeroMonth = heroPeriod === 'month';
  const isHeroWeek = heroPeriod === 'week';
  const heroProfit = isHeroMonth ? profit_month : isHeroWeek ? profit_week : profit_today;
  const heroMargin = isHeroMonth ? margin_month : isHeroWeek ? margin_week : margin_today;
  const heroSales = isHeroMonth ? sales_month : isHeroWeek ? sales_week : sales_today;
  const heroCost = isHeroMonth ? cost_month : isHeroWeek ? cost_week : cost_today;

  const currentSales =
    profitPeriod === 'today'
      ? sales_today
      : profitPeriod === 'week'
      ? sales_week
      : profitPeriod === 'month'
      ? sales_month
      : sales_total;

  const currentCost =
    profitPeriod === 'today'
      ? cost_today
      : profitPeriod === 'week'
      ? cost_week
      : profitPeriod === 'month'
      ? cost_month
      : cost_total;

  const currentProfit =
    profitPeriod === 'today'
      ? profit_today
      : profitPeriod === 'week'
      ? profit_week
      : profitPeriod === 'month'
      ? profit_month
      : profit_total;

  const currentMargin =
    profitPeriod === 'today'
      ? margin_today
      : profitPeriod === 'week'
      ? margin_week
      : profitPeriod === 'month'
      ? margin_month
      : margin_total;

  const periodTitle =
    profitPeriod === 'today'
      ? "Today's Profit"
      : profitPeriod === 'week'
      ? 'This Week (7 Days)'
      : profitPeriod === 'month'
      ? `This Month (${new Date().toLocaleString('default', { month: 'short' })})`
      : 'Total All-Time Profit';

  return (
    <div className="dashboard-page">
      {/* 1. EXECUTIVE COMMAND HERO */}
      <div className="exec-hero-card">
        {/* Top Meta Bar (Single Row) */}
        <div className="exec-hero-top-bar">
          <div className="exec-top-left">
            <span className="live-dot" />
            <span className="exec-shop-title">{settings?.company_name || 'ELITE CHOCOLATE'}</span>
          </div>

          <div className="exec-top-right">
            <Clock size={12} className="clock-icon" />
            <span className="exec-time">{timeStr}</span>
            <span className="exec-date-desktop">· {dateStr}</span>
          </div>
        </div>

        {/* Hero Spotlight: Profit & Primary POS Action */}
        <div className="exec-hero-spotlight">
          <div className="exec-profit-pulse">
            <div className="exec-pulse-label">
              <div className="exec-period-pill-toggle">
                <button
                  type="button"
                  className={`exec-period-tab ${heroPeriod === 'today' ? 'is-active' : ''}`}
                  onClick={() => { playTapSound(); setHeroPeriod('today'); }}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={`exec-period-tab ${heroPeriod === 'week' ? 'is-active' : ''}`}
                  onClick={() => { playTapSound(); setHeroPeriod('week'); }}
                >
                  Week
                </button>
                <button
                  type="button"
                  className={`exec-period-tab ${heroPeriod === 'month' ? 'is-active' : ''}`}
                  onClick={() => { playTapSound(); setHeroPeriod('month'); }}
                >
                  This Month
                </button>
              </div>

              <span className={`exec-margin-pill ${Number(heroProfit) >= 0 ? 'is-pos' : 'is-neg'}`}>
                {heroMargin}% Margin
              </span>
            </div>

            <div className="exec-pulse-amount" style={{ color: Number(heroProfit) >= 0 ? 'var(--text-primary)' : '#ef4444' }}>
              {money(heroProfit)}
            </div>
            <div className="exec-pulse-sub">
              <span>Sales: <strong>{money(heroSales)}</strong></span>
              <span className="exec-dot">·</span>
              <span>Cost: <strong>−{money(heroCost)}</strong></span>
            </div>
          </div>

          <div className="exec-hero-cta-group">
            <button type="button" className="btn-exec-pos" onClick={() => onNavigate('create')}>
              <PlusCircle size={19} />
              <span>+ Create Bill</span>
            </button>
          </div>
        </div>

        {/* Quick Action Dock */}
        <div className="exec-quick-dock">
          <button
            type="button"
            className="exec-dock-btn is-wa"
            onClick={() => {
              playTapSound();
              setAutomationTab('brief');
              setAutomationOpen(true);
            }}
          >
            <Zap size={14} />
            <span>Daily WA Brief</span>
          </button>

          <button
            type="button"
            className="exec-dock-btn is-alert"
            onClick={() => {
              playTapSound();
              setAutomationTab('reminders');
              setAutomationOpen(true);
            }}
          >
            <Bell size={14} />
            <span>Overdue Queue</span>
            {total_overdue > 0 ? (
              <span className="exec-badge-count is-alert">{overdue_bills_count || '!'} Due</span>
            ) : (
              <span className="exec-badge-count is-clear">✓ Clear</span>
            )}
          </button>

          <button
            type="button"
            className="exec-dock-btn"
            onClick={() => onNavigate('database')}
          >
            <FileText size={14} />
            <span>All Invoices</span>
          </button>

          <button
            type="button"
            className="exec-dock-btn"
            onClick={() => onNavigate('aging')}
          >
            <CalendarDays size={14} />
            <span>Aging Report</span>
          </button>
        </div>
      </div>
      {/* 2. CORE 4-KPI FINANCIAL PULSE */}
      <div className="exec-kpi-grid">
        <div className="exec-kpi-card is-kpi-green" onClick={() => { playTapSound(); onNavigate('cashflow'); }}>
          <div className="exec-kpi-header">
            <span className="exec-kpi-title">Sales Collected</span>
            <div className="exec-kpi-icon-wrap is-green">
              <Banknote size={15} strokeWidth={2.4} />
            </div>
          </div>
          <div className="exec-kpi-value">{money(total_revenue)}</div>
          <div className="exec-kpi-footer">
            <span className="exec-kpi-hint">Total cash/bank in</span>
            <ChevronRight size={13} className="exec-kpi-arrow" />
          </div>
        </div>

        <div className="exec-kpi-card is-kpi-amber" onClick={() => { playTapSound(); onNavigate('database'); }}>
          <div className="exec-kpi-header">
            <span className="exec-kpi-title">Customer Sales Due</span>
            <div className="exec-kpi-icon-wrap is-amber">
              <Clock size={15} strokeWidth={2.4} />
            </div>
          </div>
          <div className="exec-kpi-value">{money(total_pending)}</div>
          <div className="exec-kpi-footer">
            <span className="exec-kpi-hint">Pending customer khata</span>
            <ChevronRight size={13} className="exec-kpi-arrow" />
          </div>
        </div>

        <div className={`exec-kpi-card is-kpi-red ${total_overdue > 0 ? 'is-overdue-alert' : ''}`} onClick={() => { playTapSound(); onNavigate('aging'); }}>
          <div className="exec-kpi-header">
            <span className="exec-kpi-title">Overdue Receivables</span>
            <div className="exec-kpi-icon-wrap is-red">
              <AlertTriangle size={15} strokeWidth={2.4} />
            </div>
          </div>
          <div className="exec-kpi-value" style={{ color: total_overdue > 0 ? '#ef4444' : undefined }}>{money(total_overdue)}</div>
          <div className="exec-kpi-footer">
            <span className="exec-kpi-hint">{overdue_bills_count > 0 ? `${overdue_bills_count} bills past due` : 'All accounts clear'}</span>
            <ChevronRight size={13} className="exec-kpi-arrow" />
          </div>
        </div>

        <div className="exec-kpi-card is-kpi-purple" onClick={() => { playTapSound(); goHelpBills(); }}>
          <div className="exec-kpi-header">
            <span className="exec-kpi-title">Help Money Lent</span>
            <div className="exec-kpi-icon-wrap is-purple">
              <HeartHandshake size={15} strokeWidth={2.4} />
            </div>
          </div>
          <div className="exec-kpi-value">{money(help_outstanding)}</div>
          <div className="exec-kpi-footer">
            <span className="exec-kpi-hint">{help_count} active borrowers</span>
            <ChevronRight size={13} className="exec-kpi-arrow" />
          </div>
        </div>
      </div>

      {/* 3. NET PROFIT MARGINS & 50/50 PARTNER EQUITY MATRIX */}
      <div className={`profit-hero-card ${currentProfit >= 0 ? 'is-profitable' : 'is-loss'}`}>
        <div className="profit-hero-header">
          <div className="profit-hero-title-group">
            <Wallet size={18} style={{ color: 'var(--accent-teal)' }} />
            <span className="profit-hero-title">Net Profit Margins</span>
          </div>

          <div className="profit-period-segmented" role="group" aria-label="Profit Time Period">
            <button
              type="button"
              className={`profit-period-btn${profitPeriod === 'today' ? ' is-active' : ''}`}
              onClick={() => {
                playTapSound();
                setProfitPeriod('today');
              }}
            >
              Today
            </button>
            <button
              type="button"
              className={`profit-period-btn${profitPeriod === 'week' ? ' is-active' : ''}`}
              onClick={() => {
                playTapSound();
                setProfitPeriod('week');
              }}
            >
              7 Days
            </button>
            <button
              type="button"
              className={`profit-period-btn${profitPeriod === 'month' ? ' is-active' : ''}`}
              onClick={() => {
                playTapSound();
                setProfitPeriod('month');
              }}
            >
              This Month
            </button>
            <button
              type="button"
              className={`profit-period-btn${profitPeriod === 'total' ? ' is-active' : ''}`}
              onClick={() => {
                playTapSound();
                setProfitPeriod('total');
              }}
            >
              All-Time
            </button>
          </div>
        </div>

        <div className="profit-hero-main">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {periodTitle}
            </span>
            <span
              className="profit-hero-margin-badge"
              style={{
                background: currentProfit >= 0 ? 'rgba(34, 197, 94, 0.14)' : 'rgba(239, 68, 68, 0.14)',
                color: currentProfit >= 0 ? '#16a34a' : '#ef4444',
              }}
            >
              {currentMargin}% Margin
            </span>
          </div>

          <div className="profit-hero-value-row">
            <span
              className="profit-hero-amount"
              style={{ color: currentProfit >= 0 ? 'var(--text-primary)' : '#ef4444' }}
            >
              {money(currentProfit)}
            </span>
            {profitPeriod === 'month' && sales_mom_pct != null && (
              <span
                className={`profit-hero-mom ${sales_mom_pct >= 0 ? 'is-up' : 'is-down'}`}
                title={`Last month: ${money(sales_last_month)}`}
              >
                {sales_mom_pct >= 0 ? '+' : ''}{sales_mom_pct}% MoM
              </span>
            )}
          </div>
        </div>

        <div className="profit-hero-breakdown">
          <div className="profit-breakdown-item">
            <span className="profit-breakdown-label">Gross Sales</span>
            <span className="profit-breakdown-val profit-val-sales">{money(currentSales)}</span>
          </div>
          <div className="profit-breakdown-divider" />
          <div className="profit-breakdown-item">
            <span className="profit-breakdown-label">Buying Cost</span>
            <span className="profit-breakdown-val profit-val-cost">−{money(currentCost)}</span>
          </div>
          <div className="profit-breakdown-divider" />
          <div className="profit-breakdown-item">
            <span className="profit-breakdown-label">Net Profit</span>
            <span
              className="profit-breakdown-val"
              style={{ color: currentProfit >= 0 ? '#10b981' : '#ef4444' }}
            >
              {money(currentProfit)}
            </span>
          </div>
        </div>

        {/* 50/50 Partner Profit Division Matrix */}
        <div style={{ marginTop: '0.9rem', paddingTop: '0.85rem', borderTop: '1px dashed var(--border-color)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.55rem' }}>
            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              50/50 Partner Share
            </span>
            <button
              type="button"
              className="dashboard-recent-all"
              onClick={() => onNavigate('partners')}
              style={{ fontSize: '0.74rem' }}
            >
              Partner Equity <ChevronRight size={13} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.65rem' }}>
            <div
              style={{
                padding: '0.7rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(59, 130, 246, 0.05)',
                border: '1px solid rgba(59, 130, 246, 0.15)',
                cursor: 'pointer',
              }}
              onClick={() => onNavigate('partners')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3b82f6' }}>Nomi (50%)</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Share</span>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: currentProfit >= 0 ? '#3b82f6' : '#ef4444' }}>
                {money(Math.round((currentProfit / 2) * 100) / 100)}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                Dividend for {periodTitle}
              </div>
            </div>

            <div
              style={{
                padding: '0.7rem 0.85rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(20, 184, 166, 0.05)',
                border: '1px solid rgba(20, 184, 166, 0.15)',
                cursor: 'pointer',
              }}
              onClick={() => onNavigate('partners')}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-teal)' }}>Haris (50%)</span>
                <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Share</span>
              </div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: currentProfit >= 0 ? 'var(--accent-teal)' : '#ef4444' }}>
                {money(Math.round((currentProfit / 2) * 100) / 100)}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                Dividend for {periodTitle}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. LATEST BILLS STREAM */}
      <div className="surface-block" style={{ padding: '1.2rem', borderRadius: 'var(--radius-md, 14px)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Receipt size={18} style={{ color: 'var(--accent-teal, #14b8a6)' }} />
            <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 800 }}>Latest Bills</strong>
          </div>
          <button
            type="button"
            className="dashboard-recent-all"
            onClick={() => onNavigate('database')}
          >
            View all ({recent_bills.length})
            <ChevronRight size={14} />
          </button>
        </div>

        {recent_bills.length === 0 ? (
          <EmptyState
            title="No bills yet"
            body="Your first sale starts here."
            actionLabel="Create first bill"
            onAction={() => onNavigate('create')}
            icon={PlusCircle}
          />
        ) : (
          recent_bills.slice(0, 4).map((bill) => {
            const typeClass = bill.bill_type === 'supplier' ? 'type-supplier' : bill.bill_type === 'help' ? 'type-help' : 'type-customer';
            const typeColor = bill.bill_type === 'supplier' ? '#6366f1' : bill.bill_type === 'help' ? '#a855f7' : '#10b981';

            return (
              <button
                key={bill.id}
                className={`dashboard-recent-item ${typeClass}`}
                onClick={() => (onViewBill ? onViewBill(bill) : onNavigate('database'))}
                title="Click to view bill"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', width: '100%' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                    <span style={{ fontSize: '0.92rem', fontWeight: 750, color: 'var(--text-primary)' }}>
                      {bill.customer_name}
                    </span>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <span className="invoice-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{bill.invoice_number}</span>
                      <span>·</span>
                      <span style={{ color: typeColor, fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: typeColor, display: 'inline-block' }} />
                        {billTypeShortLabel(bill)}
                      </span>
                      {bill.bill_date && (
                        <>
                          <span>·</span>
                          <span>{bill.bill_date}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem', flexShrink: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        {money(bill.total_amount)}
                      </span>
                      <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />
                    </div>
                    <StatusBadge status={bill.status} />
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      <QuickPaySheet
        open={Boolean(payBill)}
        bill={payBill}
        onClose={() => setPayBill(null)}
        onSaved={() => fetchStats(true)}
        currencySymbol={currencySymbol}
      />

      <AutomationHub
        open={automationOpen}
        onClose={() => setAutomationOpen(false)}
        currencySymbol={currencySymbol}
        initialTab={automationTab}
      />
    </div>
  );
}
