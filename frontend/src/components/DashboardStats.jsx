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
} from 'lucide-react';
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

function formatHelpReturn(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return '—';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d} ${months[m - 1]}`;
}

export default function DashboardStats({ onNavigate, onViewBill, currencySymbol = 'Rs.', settings = {}, active = true }) {
  const toast = useToast();
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
  } = stats || {};

  const help_given = liveHelpGiven || Number(stats?.help_given) || 0;
  const help_repaid = liveHelpRepaid || Number(stats?.help_repaid) || 0;
  const help_outstanding = helpBills.length ? liveHelpOut : Number(stats?.help_outstanding) || 0;
  const help_count = helpBills.length || Number(stats?.help_count) || 0;
  const help_rows = helpBills;

  const lastBackup = getLastAutoBackupAt();
  const money = (n) => formatCurrency(currencySymbol, n, { maximumFractionDigits: 0 });
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

  return (
    <div className="dashboard-page">
      <div className="glass-panel panel-hero dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="dashboard-hero-eyebrow">Shop floor</p>
          <h2 className="dashboard-hero-title">Today at the counter</h2>
          <p className="dashboard-hero-sub">Create a bill, chase dues, or check help money given.</p>
        </div>
        <div className="hero-actions">
          <button type="button" className="btn-primary btn-hero" onClick={() => onNavigate('create')}>
            <PlusCircle size={18} /> Create bill
          </button>
          <div className="hero-actions-secondary">
            <button type="button" className="btn-secondary" onClick={() => onNavigate('database')}>
              <FileText size={16} /> Bills
            </button>
            <button type="button" className="btn-secondary" onClick={() => setOpenSection('help')}>
              <HeartHandshake size={16} /> Help
            </button>
            <button type="button" className="btn-secondary" onClick={() => onNavigate('aging')}>
              <CalendarDays size={16} /> Collections
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-peek" aria-label="Key figures">
        <button type="button" className="dashboard-peek-item" onClick={() => setOpenSection('overview')}>
          <span className="dashboard-peek-label">Profit today</span>
          <span className="dashboard-peek-value">{money(profit_today)}</span>
        </button>
        <button type="button" className="dashboard-peek-item" onClick={() => setOpenSection('overview')}>
          <span className="dashboard-peek-label">Due</span>
          <span className="dashboard-peek-value">{money(total_pending)}</span>
        </button>
        <button
          type="button"
          className={`dashboard-peek-item${total_overdue > 0 ? ' is-alert' : ''}`}
          onClick={() => setOpenSection('overdue')}
        >
          <span className="dashboard-peek-label">Overdue</span>
          <span className="dashboard-peek-value">{money(total_overdue)}</span>
        </button>
        <button
          type="button"
          className={`dashboard-peek-item${help_outstanding > 0 ? ' is-help' : ''}`}
          onClick={() => setOpenSection('help')}
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
          hint={`${total_bills} bills · help ${money(help_given)}${help_outstanding > 0 ? ` · out ${money(help_outstanding)}` : ''}`}
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
              label="Collected"
              value={money(total_revenue)}
              hint={
                <>
                  <TrendingUp size={12} /> Paid revenue
                </>
              }
              icon={DollarSign}
            />
            <StatCard label="Due" value={money(total_pending)} hint="Awaiting payment" icon={Clock} />
            <StatCard
              label="Overdue"
              value={money(total_overdue)}
              hint="Needs follow-up"
              icon={AlertTriangle}
            />
            <StatCard label="Bills" value={String(total_bills)} hint="In database" icon={FileText} />
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
