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
      <div className="glass-panel panel-hero dashboard-hero">
        <div className="dashboard-hero-header">
          <div className="dashboard-hero-copy">
            <div className="dashboard-hero-eyebrow-row">
              <span className="dashboard-hero-eyebrow">{greeting}, Chocolatier</span>
              <span className="live-status-pill">
                <span className="live-dot" /> Live
              </span>
            </div>
            <h2 className="dashboard-hero-title">Shop Overview & POS</h2>
            <p className="dashboard-hero-sub">Create bills, track dues, and monitor live profits.</p>
          </div>

          <div className="dashboard-clock-card">
            <div className="dashboard-clock-time">
              <Clock size={16} className="clock-icon" />
              <span>{timeStr}</span>
            </div>
            <div className="dashboard-clock-date">
              <CalendarDays size={13} />
              <span>{dateStr}</span>
            </div>
          </div>
        </div>

        <div className="hero-actions">
          <button type="button" className="btn-primary btn-hero" onClick={() => onNavigate('create')}>
            <PlusCircle size={18} /> Create bill
          </button>
          <div className="hero-actions-secondary">
            <button type="button" className="btn-secondary" onClick={() => onNavigate('database')}>
              <FileText size={15} /> All Bills
            </button>
            <button type="button" className="btn-secondary" onClick={() => onNavigate('aging')}>
              <CalendarDays size={15} /> Aging Report
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-nav-pills" role="tablist" aria-label="Dashboard views">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'overview'}
          className={`dash-pill-btn${activeTab === 'overview' ? ' is-active' : ''}`}
          onClick={() => {
            playTapSound();
            setActiveTab('overview');
          }}
        >
          <TrendingUp size={15} /> Overview & Profit
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'cashflow'}
          className={`dash-pill-btn${activeTab === 'cashflow' ? ' is-active' : ''}`}
          onClick={() => {
            playTapSound();
            setActiveTab('cashflow');
          }}
        >
          <ArrowDownUp size={15} /> Cashflow
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'dues'}
          className={`dash-pill-btn${activeTab === 'dues' ? ' is-active' : ''}`}
          onClick={() => {
            playTapSound();
            setActiveTab('dues');
          }}
        >
          <HeartHandshake size={15} /> Dues & Help
          {(total_overdue > 0 || help_outstanding > 0) && (
            <span className={`dash-pill-badge${total_overdue > 0 ? ' is-alert' : ''}`}>
              {total_overdue > 0 ? money(total_overdue) : help_count}
            </span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'recent'}
          className={`dash-pill-btn${activeTab === 'recent' ? ' is-active' : ''}`}
          onClick={() => {
            playTapSound();
            setActiveTab('recent');
          }}
        >
          <FileText size={15} /> Recent Bills
          {recent_bills.length > 0 && (
            <span className="dash-pill-badge">{recent_bills.length}</span>
          )}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'tools'}
          className={`dash-pill-btn${activeTab === 'tools' ? ' is-active' : ''}`}
          onClick={() => {
            playTapSound();
            setActiveTab('tools');
          }}
        >
          <SlidersHorizontal size={15} /> Tools & Backup
        </button>
      </div>

      {activeTab === 'overview' && (
        <div className="dashboard-tab-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
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
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 800,
                      padding: '0.2rem 0.6rem',
                      borderRadius: 999,
                      background: Number(profit_mom_pct || sales_mom_pct) >= 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: Number(profit_mom_pct || sales_mom_pct) >= 0 ? '#16a34a' : '#ef4444',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.25rem',
                    }}
                  >
                    {Number(profit_mom_pct ?? sales_mom_pct) >= 0 ? '▲ +' : '▼ '}
                    {profit_mom_pct ?? sales_mom_pct}% vs Last Month
                  </span>
                )}
              </div>

              <div className="profit-hero-breakdown">
                <div className="profit-breakdown-item">
                  <span className="profit-breakdown-label">Gross Selling (Sales)</span>
                  <span className="profit-breakdown-val" style={{ color: 'var(--text-primary)' }}>
                    {money(currentSales)}
                  </span>
                </div>
                <div className="profit-breakdown-item">
                  <span className="profit-breakdown-label">Buying Cost (Saudia)</span>
                  <span className="profit-breakdown-val" style={{ color: 'var(--text-secondary)' }}>
                    −{money(currentCost)}
                  </span>
                </div>
              </div>
            </div>

            <div className="profit-hero-footer">
              <button
                type="button"
                className="btn-primary"
                style={{ width: 'auto', fontSize: '0.82rem', padding: '0.45rem 1rem' }}
                disabled={generatingReport}
                onClick={handleDownloadDailyReport}
              >
                <Download size={15} /> {generatingReport ? 'Generating PDF…' : 'Download Daily Executive PDF'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ width: 'auto', fontSize: '0.82rem', padding: '0.45rem 0.9rem' }}
                onClick={() => setActiveTab('cashflow')}
              >
                View Full Cashflow <ChevronRight size={14} />
              </button>
            </div>
          </div>

          <div className="stats-grid stats-grid-quiet">
            <StatCard
              label="Sales Collected"
              value={money(total_revenue)}
              hint="Customer payments in"
              icon={DollarSign}
            />
            <StatCard
              label="Sales Due"
              value={money(total_pending)}
              hint="Pending payment"
              icon={Clock}
              onClick={() => setActiveTab('dues')}
              actionLabel="View Dues"
              onAction={() => setActiveTab('dues')}
            />
            <StatCard
              label="Overdue Sales"
              value={money(total_overdue)}
              hint={overdue_bills_count > 0 ? `${overdue_bills_count} bill(s) overdue` : 'All clear'}
              highlight={total_overdue > 0}
              icon={AlertTriangle}
              onClick={() => setActiveTab('dues')}
              actionLabel={total_overdue > 0 ? '⚡ 1-Tap WA' : undefined}
              actionType="danger"
              onAction={() => onNavigate('aging')}
            />
            <StatCard
              label="Help Outstanding"
              value={money(help_outstanding)}
              hint={`${help_count} person(s) lent`}
              icon={HeartHandshake}
              onClick={() => setActiveTab('dues')}
              actionLabel={help_outstanding > 0 ? '🤝 Remind' : undefined}
              onAction={() => setActiveTab('dues')}
            />
            <StatCard
              label="Active Customer Bills"
              value={String(total_bills)}
              hint="Excl. cancelled"
              icon={FileText}
              onClick={() => onNavigate('database')}
              actionLabel="🔍 Database"
              onAction={() => onNavigate('database')}
            />
          </div>

          <div className="surface-block" style={{ padding: '1rem', borderRadius: 'var(--radius-md, 12px)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>Latest Bills</strong>
              <button
                type="button"
                className="dashboard-recent-all"
                onClick={() => setActiveTab('recent')}
              >
                View all ({recent_bills.length})
                <ChevronRight size={14} />
              </button>
            </div>
            {recent_bills.slice(0, 3).map((bill) => (
              <button
                key={bill.id}
                             className={`dashboard-recent-item is-${String(bill.status || '').toLowerCase()}`}
                style={{ width: '100%', textAlign: 'left', marginBottom: '0.4rem' }}
                onClick={() => (onViewBill ? onViewBill(bill) : onNavigate('database'))}
              >
                <span className="dashboard-recent-body">
                  <span className="dashboard-recent-row">
                    <span className="dashboard-recent-name">{bill.customer_name}</span>
                    <span className="dashboard-recent-amount">{money(bill.total_amount)}</span>
                  </span>
                  <span className="dashboard-recent-row is-meta">
                    <span className="dashboard-recent-meta">
                      <span>{bill.invoice_number}</span>
                      <span className="dashboard-recent-dot" />
                      <span>{billTypeShortLabel(bill)}</span>
                    </span>
                    <StatusBadge status={bill.status} />
                  </span>
                </span>
                <ChevronRight size={15} style={{ color: 'var(--text-muted)' }} />
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'cashflow' && (
        <div className="dashboard-tab-panel">
          <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading Cashflow…</div>}>
            <CashflowPanel
              currencySymbol={currencySymbol}
              compact={false}
              onNavigate={onNavigate}
              onViewBill={onViewBill}
              helpGiven={help_given}
              helpOutstanding={help_outstanding}
            />
          </Suspense>
        </div>
      )}

      {activeTab === 'dues' && (
        <div className="dashboard-tab-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="surface-block" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md, 14px)' }}>
            <div className="dash-dropdown-toolbar" style={{ marginBottom: '0.85rem' }}>
              <div>
                <strong style={{ fontSize: '0.95rem', color: total_overdue > 0 ? 'var(--status-overdue)' : 'var(--text-primary)' }}>
                  Customer Overdue Invoices
                </strong>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Total Overdue: {money(total_overdue)}
                </p>
              </div>
              <button type="button" className="btn-secondary" style={{ fontSize: '0.76rem', padding: '0.35rem 0.75rem' }} onClick={() => onNavigate('aging')}>
                Full Aging Report <ChevronRight size={14} />
              </button>
            </div>
            <Suspense fallback={<p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading Overdue Bills…</p>}>
              <OverduePanel
                embedded
                excludeHelp
                currencySymbol={currencySymbol}
                settings={settings}
                onPaid={() => fetchStats(true)}
                onViewBill={async (row) => {
                  try {
                    const res = await apiFetch(`/api/bills/${row.id}`);
                    const bill = await res.json();
                    if (res.ok && onViewBill) onViewBill(bill);
                    else if (onNavigate) onNavigate('database');
                  } catch {
                    if (onNavigate) onNavigate('database');
                  }
                }}
              />
            </Suspense>
          </div>

          <div className="surface-block" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md, 14px)' }}>
            <div className="dash-dropdown-toolbar" style={{ marginBottom: '0.85rem' }}>
              <div>
                <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  Help / Personal Money Lent
                </strong>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Given {money(help_given)} · Returned {money(help_repaid)} · Still Out: <strong>{money(help_outstanding)}</strong>
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem' }}>
                <button type="button" className="btn-primary" style={{ fontSize: '0.76rem', padding: '0.35rem 0.75rem' }} onClick={goGiveHelp}>
                  + Give Help
                </button>
                <button type="button" className="btn-secondary" style={{ fontSize: '0.76rem', padding: '0.35rem 0.75rem' }} onClick={goHelpBills}>
                  Help Bills
                </button>
              </div>
            </div>

            {help_rows.length === 0 ? (
              <EmptyState
                title="No help given yet"
                body="Record money you give someone for a period. It won’t affect sales or profits."
                actionLabel="Give help"
                onAction={goGiveHelp}
                icon={HeartHandshake}
              />
            ) : (
              <div className="dashboard-help-list">
                {help_rows.map((bill) => {
                  const statusKey = String(bill.status || 'pending').toLowerCase();
                  const stillOut = Math.max(0, Number(bill.balance_due ?? (Number(bill.total_amount) || 0) - (Number(bill.amount_paid) || 0)));
                  const dueLabel = formatHelpReturn(bill.due_date);
                  return (
                    <div className={`dashboard-help-card is-${statusKey}${stillOut <= 0 ? ' is-clear' : ''}`} key={bill.id}>
                      <button
                        type="button"
                        className="dashboard-help-main"
                        onClick={() => openHelpBill(bill)}
                      >
                        <span className="dashboard-help-top">
                          <span className="dashboard-help-name">{bill.customer_name}</span>
                          <StatusBadge status={bill.status} />
                        </span>
                        <span className="dashboard-help-out">
                          <small>{stillOut > 0 ? 'Still out' : 'Returned'}</small>
                          <strong>
                            {formatCurrency(currencySymbol, stillOut > 0 ? stillOut : bill.total_amount, { maximumFractionDigits: 0 })}
                          </strong>
                        </span>
                        <span className="dashboard-help-foot">
                          <span className="dashboard-help-inv">{bill.invoice_number}</span>
                          <span>Return {dueLabel}</span>
                          {stillOut > 0 ? <span>Given {money(bill.total_amount)}</span> : null}
                        </span>
                      </button>
                      {stillOut > 0 ? (
                        <div className="dashboard-help-actions">
                          <button
                            type="button"
                            className="dashboard-help-pay"
                            onClick={() => payHelp(bill)}
                          >
                            <Banknote size={16} />
                            Pay
                          </button>
                          <button
                            type="button"
                            className="dashboard-help-wa"
                            onClick={() => remindHelp(bill)}
                            title={bill.customer_phone ? 'WhatsApp return reminder' : 'No phone'}
                          >
                            <MessageCircle size={16} />
                            WA
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'recent' && (
        <div className="dashboard-tab-panel">
          <div className="surface-block" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md, 14px)' }}>
            <div className="dash-dropdown-toolbar" style={{ marginBottom: '0.85rem' }}>
              <div>
                <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  Recent Invoices
                </strong>
                <p style={{ margin: '0.15rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Showing latest transactions
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: '0.76rem', padding: '0.35rem 0.75rem' }}
                onClick={() => onNavigate('database')}
              >
                Open Full Bills Database <ChevronRight size={14} />
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
              <div className="dashboard-recent-list">
                {recent_bills.map((bill) => {
                  const statusKey = String(bill.status || 'pending').toLowerCase();
                  return (
                    <button
                      type="button"
                      className={`dashboard-recent-item is-${statusKey}`}
                      key={bill.id}
                      onClick={() => (onViewBill ? onViewBill(bill) : onNavigate('database'))}
                    >
                      <span className="dashboard-recent-accent" aria-hidden />
                      <span className="dashboard-recent-body">
                        <span className="dashboard-recent-row">
                          <span className="dashboard-recent-name">{bill.customer_name}</span>
                          <span className="dashboard-recent-amount">
                            {formatCurrency(currencySymbol, bill.total_amount, { maximumFractionDigits: 0 })}
                          </span>
                        </span>
                        <span className="dashboard-recent-row is-meta">
                          <span className="dashboard-recent-meta">
                            <span className="dashboard-recent-inv">{bill.invoice_number}</span>
                            <span className="dashboard-recent-dot" aria-hidden />
                            <span>{formatBillDateTime(bill)}</span>
                            <span className="dashboard-recent-dot" aria-hidden />
                            <span>{billTypeShortLabel(bill)}</span>
                          </span>
                          <StatusBadge status={bill.status} />
                        </span>
                      </span>
                      <ChevronRight className="dashboard-recent-chevron" size={16} aria-hidden />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'tools' && (
        <div className="dashboard-tab-panel" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="surface-block" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md, 14px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.5rem' }}>
              <Shield size={18} style={{ color: 'var(--accent-teal)' }} />
              <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>Data Protection & Backup</strong>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0 0 0.85rem' }}>
              {lastBackup
                ? `Last automatic backup: ${new Date(lastBackup).toLocaleString()}`
                : 'Back up your bills regularly to prevent data loss.'}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button type="button" className="btn-primary" style={{ fontSize: '0.8rem', padding: '0.45rem 1rem' }} onClick={() => onNavigate('backup')}>
                Manage Backups & Cloud Sync
              </button>
              <button type="button" className="btn-secondary" style={{ fontSize: '0.8rem', padding: '0.45rem 1rem' }} onClick={() => onNavigate('settings')}>
                App Settings
              </button>
            </div>
          </div>
        </div>
      )}


      <QuickPaySheet
        open={Boolean(payBill)}
        bill={payBill}
        onClose={() => setPayBill(null)}
        onSaved={() => fetchStats(true)}
        currencySymbol={currencySymbol}
      />
    </div>
  );
}
