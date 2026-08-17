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
  ChevronDown,
  HeartHandshake,
  Banknote,
  MessageCircle,
  Calculator,
  Download,
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

function StatCard({ label, value, hint, icon: Icon }) {
  return (
    <div className="stat-card">
      <div className="stat-card-head">
        <span className="stat-card-label">{label}</span>
        <Icon size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
      </div>
      <div className="stat-card-value" title={String(value)}>
        {value}
      </div>
      <div className="stat-card-hint">{hint}</div>
    </div>
  );
}

function DashDropdown({ id, openId, onOpenChange, title, hint, icon: Icon, accent = '', children }) {
  const open = openId === id;

  return (
    <details
      className={`dash-dropdown${accent ? ` is-${accent}` : ''}`}
      open={open}
      onToggle={(e) => {
        const nextOpen = e.currentTarget.open;
        if (nextOpen) onOpenChange(id);
        else if (openId === id) onOpenChange(null);
      }}
    >
      <summary className="dash-dropdown-summary">
        <span className="dash-dropdown-lead">
          {Icon ? (
            <span className="dash-dropdown-icon" aria-hidden>
              <Icon size={16} />
            </span>
          ) : null}
          <span className="dash-dropdown-copy">
            <strong>{title}</strong>
            {hint ? <span className="dash-dropdown-hint">{hint}</span> : null}
          </span>
        </span>
        <ChevronDown className="dash-dropdown-chevron" size={17} aria-hidden />
      </summary>
      {open ? <div className="dash-dropdown-body">{children}</div> : null}
    </details>
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
  const [openSection, setOpenSection] = useState('overview');
  const [payBill, setPayBill] = useState(null);
  const seededOpenRef = useRef(false);

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

  useEffect(() => {
    if (loading) return;
    if (seededOpenRef.current) return;
    seededOpenRef.current = true;
    const overdue = Number(stats?.total_overdue) || 0;
    if (overdue > 0) setOpenSection('overdue');
    else if (helpBills.length > 0) setOpenSection('help');
    else setOpenSection('overview');
  }, [loading, stats, helpBills.length]);

  const loadFullHelp = async (row) => {
    try {
      const res = await apiFetch(`/api/bills/${row.id}`);
      const bill = await res.json();
      if (res.ok && bill?.id) return bill;
    } catch {
      /* use row */
    }
    return row;
  };

  const openHelpBill = async (row) => {
    if (!onViewBill && onNavigate) {
      onNavigate('database');
      return;
    }
    const bill = await loadFullHelp(row);
    onViewBill(bill);
  };

  const remindHelp = async (row) => {
    const bill = await loadFullHelp(row);
    const due = billBalance(bill);
    if (due <= 0) {
      toast.info('Already returned.');
      return;
    }
    if (!normalizeWhatsAppPhone(bill.customer_phone)) {
      toast.error('No phone on this person — add it on the bill first.');
      return;
    }
    const text = buildPaymentReminderText({
      bill: { ...bill, balance_due: due },
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

  const [generatingReport, setGeneratingReport] = useState(false);

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
          sales_today: stats?.profit_today?.sales ?? stats?.sales_today ?? 0,
          cost_today: stats?.profit_today?.cost ?? stats?.cost_today ?? 0,
          profit_today: stats?.profit_today?.profit ?? stats?.profit_today ?? 0,
          margin_today: stats?.profit_today?.margin ?? stats?.margin_today ?? 0,
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

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
        <RefreshCw className="spin" size={28} style={{ marginBottom: '0.75rem' }} />
        <p>Loading…</p>
      </div>
    );
  }

  const {
    total_revenue = 0,
    total_pending = 0,
    total_overdue = 0,
    total_bills = 0,
    recent_bills = [],
    sales_today = 0,
    cost_today = 0,
    profit_today = 0,
    sales_month = 0,
    cost_month = 0,
    profit_month = 0,
    sales_total = 0,
    cost_total = 0,
    profit_total = 0,
  } = stats || {};

  const help_given = liveHelpGiven || Number(stats?.help_given) || 0;
  const help_repaid = liveHelpRepaid || Number(stats?.help_repaid) || 0;
  const help_outstanding = helpBills.length ? liveHelpOut : Number(stats?.help_outstanding) || 0;
  const help_count = helpBills.length || Number(stats?.help_count) || 0;
  const help_rows = helpBills;

  const lastBackup = getLastAutoBackupAt();
  const money = (n) => formatCurrency(currencySymbol, n, { maximumFractionDigits: 0 });
  const margin_today = sales_today > 0 ? ((profit_today / sales_today) * 100).toFixed(1) : '0.0';
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

  const toggleSection = (id) => {
    setOpenSection((cur) => (cur === id ? null : id));
  };

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
              <FileText size={16} /> Bills
            </button>
            <button type="button" className="btn-secondary" onClick={() => toggleSection('profit')}>
              <TrendingUp size={16} /> Profits
            </button>
            <button type="button" className="btn-secondary" onClick={() => toggleSection('help')}>
              <HeartHandshake size={16} /> Help
            </button>
            <button type="button" className="btn-secondary" onClick={() => onNavigate('aging')}>
              <CalendarDays size={16} /> Collections
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-peek" aria-label="Key figures">
        <button
          type="button"
          className={`dashboard-peek-item${openSection === 'profit' ? ' is-active' : ''}`}
          onClick={() => toggleSection('profit')}
        >
          <span className="dashboard-peek-label">Profit today</span>
          <span className="dashboard-peek-value">{money(profit_today)}</span>
        </button>
        <button
          type="button"
          className={`dashboard-peek-item${openSection === 'profit' ? ' is-active' : ''}`}
          onClick={() => toggleSection('profit')}
        >
          <span className="dashboard-peek-label">Total Profit</span>
          <span className="dashboard-peek-value">{money(profit_total)}</span>
        </button>
        <button
          type="button"
          className={`dashboard-peek-item${openSection === 'overview' ? ' is-active' : ''}`}
          onClick={() => toggleSection('overview')}
        >
          <span className="dashboard-peek-label">Due</span>
          <span className="dashboard-peek-value">{money(total_pending)}</span>
        </button>
        <button
          type="button"
          className={`dashboard-peek-item${openSection === 'overdue' ? ' is-active' : ''}`}
          onClick={() => toggleSection('overdue')}
        >
          <span className="dashboard-peek-label">Overdue</span>
          <span className="dashboard-peek-value">{money(total_overdue)}</span>
        </button>
        <button
          type="button"
          className={`dashboard-peek-item${openSection === 'help' ? ' is-active' : ''}`}
          onClick={() => toggleSection('help')}
        >
          <span className="dashboard-peek-label">{help_outstanding > 0 ? 'Help out' : 'Help given'}</span>
          <span className="dashboard-peek-value">{money(help_outstanding > 0 ? help_outstanding : help_given)}</span>
        </button>
      </div>

      <div className="dashboard-dropdowns">
        <DashDropdown
          id="overview"
          openId={openSection}
          onOpenChange={setOpenSection}
          title="Overview"
          hint={`${total_bills} bills · Total Profit: ${money(profit_total)}${help_outstanding > 0 ? ` · help out ${money(help_outstanding)}` : ''}`}
          icon={TrendingUp}
        >
          <div className="stats-grid stats-grid-quiet">
            <StatCard
              label="Profit today"
              value={money(profit_today)}
              hint={`Sales ${money(sales_today)} − cost ${money(cost_today)}`}
              icon={Wallet}
            />
            <StatCard
              label="Profit this month"
              value={money(profit_month)}
              hint={`Sales ${money(sales_month)} − cost ${money(cost_month)}`}
              icon={CalendarDays}
            />
            <StatCard
              label="Total profit"
              value={money(profit_total)}
              hint={`All-time margin: ${margin_total}% · Sales ${money(sales_total)}`}
              icon={TrendingUp}
            />
            <StatCard
              label="Collected"
              value={money(total_revenue)}
              hint={
                <>
                  <TrendingUp size={12} /> Customer sales paid
                </>
              }
              icon={DollarSign}
            />
            <StatCard label="Due" value={money(total_pending)} hint="Sales not yet late" icon={Clock} />
            <StatCard
              label="Overdue"
              value={money(total_overdue)}
              hint="Sales past due date"
              icon={AlertTriangle}
            />
            <StatCard label="Bills" value={String(total_bills)} hint="Active (not cancelled)" icon={FileText} />
            <StatCard
              label="Help given"
              value={money(help_given)}
              hint={`${help_count} ${help_count === 1 ? 'person' : 'people'} · still out ${money(help_outstanding)}`}
              icon={HeartHandshake}
            />
          </div>
        </DashDropdown>

        <DashDropdown
          id="overdue"
          openId={openSection}
          onOpenChange={setOpenSection}
          title="Overdue"
          hint={total_overdue > 0 ? money(total_overdue) : 'All clear'}
          icon={AlertTriangle}
          accent={total_overdue > 0 ? 'alert' : ''}
        >
          <div className="dash-dropdown-toolbar">
            <span>Sales overdue — help is below</span>
            <button type="button" className="dashboard-recent-all" onClick={() => onNavigate('aging')}>
              Full report
              <ChevronRight size={15} aria-hidden />
            </button>
          </div>
          <Suspense fallback={<p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</p>}>
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
        </DashDropdown>

        <DashDropdown
          id="help"
          openId={openSection}
          onOpenChange={setOpenSection}
          title="Help given"
          hint={
            help_count
              ? `${help_count} · out ${money(help_outstanding)}`
              : 'None yet'
          }
          icon={HeartHandshake}
          accent={help_outstanding > 0 ? 'help' : ''}
        >
          <div className="dashboard-help-toolbar">
            <p className="dashboard-help-summary">
              {help_count
                ? `Given ${money(help_given)} · returned ${money(help_repaid)}`
                : 'Money lent to people'}
            </p>
            <div className="dashboard-help-toolbar-actions">
              <button type="button" className="btn-secondary dashboard-help-link" onClick={goGiveHelp}>
                Give
              </button>
              <button type="button" className="btn-secondary dashboard-help-link" onClick={goHelpBills}>
                Bills
              </button>
            </div>
          </div>
          {help_rows.length === 0 ? (
            <EmptyState
              title="No help given yet"
              body="Record money you give someone for a period. It won’t count as a sale."
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
        </DashDropdown>

        <DashDropdown
          id="cashflow"
          openId={openSection}
          onOpenChange={setOpenSection}
          title="Cashflow"
          hint={
            help_outstanding > 0
              ? `Help out ${money(help_outstanding)}`
              : 'Sales in vs Saudia buying'
          }
          icon={ArrowDownUp}
        >
          <Suspense fallback={<p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</p>}>
          <CashflowPanel
            embedded
            currencySymbol={currencySymbol}
            compact
            onNavigate={onNavigate}
            onViewBill={onViewBill}
            helpGiven={help_given}
            helpOutstanding={help_outstanding}
          />
          </Suspense>
        </DashDropdown>

        <DashDropdown
          id="recent"
          openId={openSection}
          onOpenChange={setOpenSection}
          title="Recent bills"
          hint={recent_bills.length ? `${recent_bills.length} latest` : 'None yet'}
          icon={FileText}
        >
          <div className="dashboard-recent is-embedded">
            <div className="dash-dropdown-toolbar">
              <span>{recent_bills.length ? 'Latest invoices' : 'No bills yet'}</span>
              <button
                type="button"
                className="dashboard-recent-all"
                onClick={() => onNavigate('database')}
              >
                View all
                <ChevronRight size={15} aria-hidden />
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
        </DashDropdown>

        <DashDropdown
          id="profit"
          openId={openSection}
          onOpenChange={setOpenSection}
          title="Daily & total profit margins"
          hint={`Today: ${money(profit_today)} (${margin_today}%) · Total Profit: ${money(profit_total)} (${margin_total}%)`}
          icon={Wallet}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', padding: '0.25rem 0' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              {/* Today's Profit Box */}
              <div className="surface-block" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md, 8px)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Today's Profit
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: 999, background: profit_today >= 0 ? 'rgba(34, 197, 94, 0.14)' : 'rgba(239, 68, 68, 0.14)', color: profit_today >= 0 ? '#16a34a' : '#ef4444' }}>
                    {margin_today}% Margin
                  </span>
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 900, color: profit_today >= 0 ? 'var(--text-primary)' : '#ef4444', fontFamily: 'var(--font-mono)' }}>
                  {money(profit_today)}
                </div>
                <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.84rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Gross Sales:</span>
                    <strong className="mono" style={{ color: 'var(--text-primary)' }}>{money(sales_today)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Import Cost:</span>
                    <strong className="mono" style={{ color: 'var(--text-primary)' }}>−{money(cost_today)}</strong>
                  </div>
                </div>
              </div>

              {/* Month's Profit Box */}
              <div className="surface-block" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md, 8px)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    This Month ({new Date().toLocaleString('default', { month: 'short' })})
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: 999, background: profit_month >= 0 ? 'rgba(34, 197, 94, 0.14)' : 'rgba(239, 68, 68, 0.14)', color: profit_month >= 0 ? '#16a34a' : '#ef4444' }}>
                    {margin_month}% Margin
                  </span>
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 900, color: profit_month >= 0 ? 'var(--text-primary)' : '#ef4444', fontFamily: 'var(--font-mono)' }}>
                  {money(profit_month)}
                </div>
                <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.84rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Monthly Sales:</span>
                    <strong className="mono" style={{ color: 'var(--text-primary)' }}>{money(sales_month)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total Cost:</span>
                    <strong className="mono" style={{ color: 'var(--text-primary)' }}>−{money(cost_month)}</strong>
                  </div>
                </div>
              </div>

              {/* Total All-Time Profit Box */}
              <div className="surface-block" style={{ padding: '1.25rem', borderRadius: 'var(--radius-md, 8px)', border: '1px solid rgba(212, 175, 55, 0.35)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Total All-Time Profit
                  </span>
                  <span style={{ fontSize: '0.8rem', fontWeight: 800, padding: '0.2rem 0.55rem', borderRadius: 999, background: profit_total >= 0 ? 'rgba(34, 197, 94, 0.18)' : 'rgba(239, 68, 68, 0.18)', color: profit_total >= 0 ? '#16a34a' : '#ef4444' }}>
                    {margin_total}% Margin
                  </span>
                </div>
                <div style={{ fontSize: '1.65rem', fontWeight: 900, color: profit_total >= 0 ? '#d4af37' : '#ef4444', fontFamily: 'var(--font-mono)' }}>
                  {money(profit_total)}
                </div>
                <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', fontSize: '0.84rem', color: 'var(--text-secondary)', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total Sales:</span>
                    <strong className="mono" style={{ color: 'var(--text-primary)' }}>{money(sales_total)}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total Import Cost:</span>
                    <strong className="mono" style={{ color: 'var(--text-primary)' }}>−{money(cost_total)}</strong>
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginTop: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
              <button
                type="button"
                className="btn-primary"
                style={{ width: 'auto', fontSize: '0.82rem', padding: '0.45rem 1rem' }}
                disabled={generatingReport}
                onClick={handleDownloadDailyReport}
              >
                <Download size={15} /> {generatingReport ? 'Generating PDF…' : 'Download Daily Executive PDF'}
              </button>
              <button type="button" className="btn-secondary" style={{ width: 'auto', fontSize: '0.82rem', padding: '0.45rem 0.9rem' }} onClick={() => onNavigate('cashflow')}>
                View Full Cashflow <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </DashDropdown>

        <DashDropdown
          id="backup"
          openId={openSection}
          onOpenChange={setOpenSection}
          title="Data & backup"
          hint={
            lastBackup
              ? `Last auto-backup ${new Date(lastBackup).toLocaleDateString()}`
              : 'Back up regularly'
          }
          icon={Shield}
        >
          <div className="dashboard-backup-strip is-embedded">
            <div style={{ minWidth: 0 }}>
              <strong>Data on this phone</strong>
              <div style={{ marginTop: 2, fontSize: '0.75rem' }}>
                Export a copy so you never lose bills if the phone is reset.
              </div>
            </div>
            <button type="button" className="btn-secondary" onClick={() => onNavigate('backup')}>
              Backup
            </button>
          </div>
        </DashDropdown>
      </div>

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
