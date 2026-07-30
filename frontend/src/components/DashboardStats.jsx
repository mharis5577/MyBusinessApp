import React, { useEffect, useState } from 'react';
import { DollarSign, Clock, AlertTriangle, FileText, PlusCircle, TrendingUp, RefreshCw, Package, Wallet } from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';

function StatCard({ label, value, hint, icon: Icon, accent }) {
  return (
    <div className="stat-card" style={{ borderLeftColor: accent }}>
      <div className="stat-card-head">
        <span className="stat-card-label">{label}</span>
        <Icon size={16} style={{ color: accent, flexShrink: 0 }} />
      </div>
      <div className="stat-card-value" title={String(value)}>
        {value}
      </div>
      <div className="stat-card-hint" style={{ color: accent }}>
        {hint}
      </div>
    </div>
  );
}

export default function DashboardStats({ onNavigate, currencySymbol = 'Rs.' }) {
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
        <p>Loading dashboard...</p>
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
  } = stats || {};

  return (
    <div className="dashboard-page">
      <div className="glass-panel panel-hero dashboard-hero">
        <div>
          <h2 className="dashboard-hero-title">Dashboard</h2>
          <p className="dashboard-hero-sub">Create bills, track payments, and manage stock.</p>
        </div>
        <div className="hero-actions">
          <button className="btn-primary" onClick={() => onNavigate('create')}>
            <PlusCircle size={18} /> Create Bill
          </button>
          <button className="btn-secondary" onClick={() => onNavigate('database')}>
            <FileText size={18} /> View Bills
          </button>
          <button className="btn-secondary" onClick={() => onNavigate('advances')}>
            <Wallet size={18} /> Advances
          </button>
        </div>
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

      <div className="stats-grid">
        <StatCard
          label="Revenue paid"
          value={formatCurrency(currencySymbol, total_revenue, { maximumFractionDigits: 0 })}
          hint={<><TrendingUp size={12} /> Collected</>}
          icon={DollarSign}
          accent="var(--success)"
        />
        <StatCard
          label="Pending"
          value={formatCurrency(currencySymbol, total_pending, { maximumFractionDigits: 0 })}
          hint="Awaiting payment"
          icon={Clock}
          accent="var(--warning)"
        />
        <StatCard
          label="Overdue"
          value={formatCurrency(currencySymbol, total_overdue, { maximumFractionDigits: 0 })}
          hint="Action needed"
          icon={AlertTriangle}
          accent="var(--danger)"
        />
        <StatCard
          label="Total bills"
          value={String(total_bills)}
          hint="In database"
          icon={FileText}
          accent="var(--accent-primary)"
        />
      </div>

      <div className="glass-panel dashboard-recent">
        <div className="dashboard-recent-head">
          <h3>Recent Bills</h3>
          <button
            className="btn-secondary"
            onClick={() => onNavigate('database')}
            style={{ width: 'auto', minHeight: 36, padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
          >
            View All
          </button>
        </div>

        {recent_bills.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No bills yet. Tap Create Bill to start.
          </div>
        ) : (
          <div className="mobile-card-list dashboard-recent-list">
            {recent_bills.map((bill) => (
              <button
                type="button"
                className="mobile-card dashboard-recent-item"
                key={bill.id}
                onClick={() => onNavigate('database')}
              >
                <div className="mobile-card-top">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="mobile-card-title">{bill.customer_name}</div>
                    <div className="mobile-card-meta">
                      <span className="invoice-mono">{bill.invoice_number}</span>
                      {' · '}
                      {bill.bill_date}
                    </div>
                  </div>
                  <div className="mobile-card-amount">
                    {formatCurrency(currencySymbol, bill.total_amount, { maximumFractionDigits: 0 })}
                  </div>
                </div>
                <span className={`badge badge-${bill.status}`}>{bill.status}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
