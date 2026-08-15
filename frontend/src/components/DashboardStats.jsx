import React, { useEffect, useRef, useState } from 'react';
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
} from 'lucide-react';
import { formatCurrency, formatBillDateTime } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { getLastAutoBackupAt } from '../utils/backupManager';
import CashflowPanel from './CashflowPanel';
import OverduePanel from './OverduePanel';
import StatusBadge from './StatusBadge';
import EmptyState from './EmptyState';

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

export default function DashboardStats({ onNavigate, onViewBill, currencySymbol = 'Rs.', settings = {} }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openSection, setOpenSection] = useState('overview');
  const seededOpenRef = useRef(false);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/stats');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  useEffect(() => {
    if (!stats || seededOpenRef.current) return;
    seededOpenRef.current = true;
    const overdue = Number(stats.total_overdue) || 0;
    setOpenSection(overdue > 0 ? 'overdue' : 'overview');
  }, [stats]);

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

  const lastBackup = getLastAutoBackupAt();
  const money = (n) => formatCurrency(currencySymbol, n, { maximumFractionDigits: 0 });

  return (
    <div className="dashboard-page">
      <div className="glass-panel panel-hero dashboard-hero">
        <div className="dashboard-hero-copy">
          <p className="dashboard-hero-eyebrow">Shop floor</p>
          <h2 className="dashboard-hero-title">Today at the counter</h2>
          <p className="dashboard-hero-sub">Create a bill or open dues — extras stay in the lists below.</p>
        </div>
        <div className="hero-actions">
          <button type="button" className="btn-primary btn-hero" onClick={() => onNavigate('create')}>
            <PlusCircle size={18} /> Create bill
          </button>
          <div className="hero-actions-secondary">
            <button type="button" className="btn-secondary" onClick={() => onNavigate('database')}>
              <FileText size={16} /> Bills
            </button>
            <button type="button" className="btn-secondary" onClick={() => onNavigate('aging')}>
              <CalendarDays size={16} /> Collections
            </button>
          </div>
        </div>
      </div>

      <div className="dashboard-peek" aria-label="Key figures">
        <div className="dashboard-peek-item">
          <span className="dashboard-peek-label">Profit today</span>
          <span className="dashboard-peek-value">{money(profit_today)}</span>
        </div>
        <div className="dashboard-peek-item">
          <span className="dashboard-peek-label">Due</span>
          <span className="dashboard-peek-value">{money(total_pending)}</span>
        </div>
        <div className={`dashboard-peek-item${total_overdue > 0 ? ' is-alert' : ''}`}>
          <span className="dashboard-peek-label">Overdue</span>
          <span className="dashboard-peek-value">{money(total_overdue)}</span>
        </div>
      </div>

      <div className="dashboard-dropdowns">
        <DashDropdown
          id="overview"
          openId={openSection}
          onOpenChange={setOpenSection}
          title="Overview"
          hint={`${total_bills} bills · collected ${money(total_revenue)}`}
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
            <span>Quick follow-ups</span>
            <button type="button" className="dashboard-recent-all" onClick={() => onNavigate('aging')}>
              Full report
              <ChevronRight size={15} aria-hidden />
            </button>
          </div>
          <OverduePanel
            embedded
            currencySymbol={currencySymbol}
            settings={settings}
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
        </DashDropdown>

        <DashDropdown
          id="cashflow"
          openId={openSection}
          onOpenChange={setOpenSection}
          title="Cashflow"
          hint="Sales in vs Saudia buying"
          icon={ArrowDownUp}
        >
          <CashflowPanel embedded currencySymbol={currencySymbol} compact onNavigate={onNavigate} />
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
                            {bill.bill_type === 'supplier' ? (
                              <>
                                <span className="dashboard-recent-dot" aria-hidden />
                                <span>Purchase</span>
                              </>
                            ) : null}
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
    </div>
  );
}
