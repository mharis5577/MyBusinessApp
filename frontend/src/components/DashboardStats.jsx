import React, { useEffect, useState } from 'react';
import {
  DollarSign,
  Clock,
  AlertTriangle,
  FileText,
  PlusCircle,
  TrendingUp,
  RefreshCw,
  Package,
  ArrowDownUp,
  Wallet,
  CalendarDays,
  Shield,
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

export default function DashboardStats({ onNavigate, onViewBill, currencySymbol = 'Rs.', settings = {} }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

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
    low_stock = [],
    low_stock_threshold = 5,
    sales_today = 0,
    cost_today = 0,
    profit_today = 0,
    sales_month = 0,
    cost_month = 0,
    profit_month = 0,
  } = stats || {};

  const lastBackup = getLastAutoBackupAt();

  return (
    <div className="dashboard-page">
      <div className="glass-panel panel-hero dashboard-hero">
        <h2 className="dashboard-hero-title">Today at the counter</h2>
        <p className="dashboard-hero-sub">Create a bill, collect payment, keep the shop moving.</p>
        <div className="hero-actions">
          <button type="button" className="btn-primary btn-hero" onClick={() => onNavigate('create')}>
            <PlusCircle size={20} /> Create Bill
          </button>
          <button type="button" className="btn-secondary" onClick={() => onNavigate('database')}>
            <FileText size={17} /> Bills
          </button>
          <button type="button" className="btn-secondary" onClick={() => onNavigate('cashflow')}>
            <ArrowDownUp size={17} /> Cashflow
          </button>
        </div>
      </div>

      <div className="dashboard-backup-strip">
        <div style={{ minWidth: 0 }}>
          <strong>
            <Shield size={13} style={{ verticalAlign: -2, marginRight: 4 }} />
            Data on this phone
          </strong>
          <div style={{ marginTop: 2, fontSize: '0.75rem' }}>
            {lastBackup
              ? `Last auto-backup ${new Date(lastBackup).toLocaleDateString()}`
              : 'Back up regularly'}
          </div>
        </div>
        <button type="button" className="btn-secondary" onClick={() => onNavigate('backup')}>
          Backup
        </button>
      </div>

      {low_stock.length > 0 && (
        <div className="low-stock-banner">
          <Package size={18} style={{ color: 'var(--warning)', flexShrink: 0, marginTop: 2 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <strong>Low stock</strong>
            <span style={{ color: 'var(--text-secondary)' }}> (≤ {low_stock_threshold}): </span>
            {low_stock.slice(0, 6).map((p, i) => (
              <span key={p.id}>
                {i > 0 ? ' · ' : ''}
                {p.name} ({p.stock})
              </span>
            ))}
            {low_stock.length > 6 ? ` +${low_stock.length - 6} more` : ''}
          </div>
          <button
            type="button"
            className="btn-secondary"
            style={{ width: 'auto', minHeight: 34, padding: '0.3rem 0.7rem', fontSize: '0.75rem', flexShrink: 0 }}
            onClick={() => onNavigate('catalog')}
          >
            Items
          </button>
        </div>
      )}

      <OverduePanel
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

      <div className="stats-grid stats-grid-quiet">
        <StatCard
          label="Profit today"
          value={formatCurrency(currencySymbol, profit_today, { maximumFractionDigits: 0 })}
          hint={`Sales ${formatCurrency(currencySymbol, sales_today, { maximumFractionDigits: 0 })} − cost`}
          icon={Wallet}
        />
        <StatCard
          label="Profit this month"
          value={formatCurrency(currencySymbol, profit_month, { maximumFractionDigits: 0 })}
          hint={`Sales ${formatCurrency(currencySymbol, sales_month, { maximumFractionDigits: 0 })} − cost`}
          icon={CalendarDays}
        />
        <StatCard
          label="Collected"
          value={formatCurrency(currencySymbol, total_revenue, { maximumFractionDigits: 0 })}
          hint={
            <>
              <TrendingUp size={12} /> Paid revenue
            </>
          }
          icon={DollarSign}
        />
        <StatCard
          label="Due"
          value={formatCurrency(currencySymbol, total_pending, { maximumFractionDigits: 0 })}
          hint="Awaiting payment"
          icon={Clock}
        />
        <StatCard
          label="Overdue"
          value={formatCurrency(currencySymbol, total_overdue, { maximumFractionDigits: 0 })}
          hint="Needs follow-up"
          icon={AlertTriangle}
        />
        <StatCard label="Bills" value={String(total_bills)} hint="In database" icon={FileText} />
      </div>

      <CashflowPanel currencySymbol={currencySymbol} compact onNavigate={onNavigate} />

      <div className="dashboard-recent">
        <div className="dashboard-recent-head">
          <h3>Recent bills</h3>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigate('database')}
            style={{ width: 'auto', minHeight: 36, padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
          >
            View all
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
          <div className="mobile-card-list dashboard-recent-list">
            {recent_bills.map((bill) => (
              <button
                type="button"
                className="mobile-card dashboard-recent-item"
                key={bill.id}
                onClick={() => (onViewBill ? onViewBill(bill) : onNavigate('database'))}
              >
                <div className="mobile-card-top">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="mobile-card-title">{bill.customer_name}</div>
                    <div className="mobile-card-meta">
                      <span className="invoice-mono">{bill.invoice_number}</span>
                      {' · '}
                      {formatBillDateTime(bill)}
                    </div>
                  </div>
                  <div className="mobile-card-amount">
                    {formatCurrency(currencySymbol, bill.total_amount, { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <StatusBadge status={bill.status} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
