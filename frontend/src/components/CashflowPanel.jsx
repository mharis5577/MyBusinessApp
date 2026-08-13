import React, { useEffect, useState } from 'react';
import { ArrowDownUp, RefreshCw, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import EmptyState from './EmptyState';

export default function CashflowPanel({ currencySymbol = 'Rs.', compact = false, onNavigate }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(compact ? '/api/cashflow?compact=1' : '/api/cashflow');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      toast.error(err.message || 'Cashflow load failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [compact]);

  if (loading && !data) {
    return (
      <div className="panel-flat" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem 0' }}>
        <RefreshCw className="spin" size={20} /> Loading cashflow…
      </div>
    );
  }

  const {
    total_sales = 0,
    buying_cost = 0,
    net_profit = 0,
    paid_sales = 0,
    pending_sales = 0,
    money_flow = [],
  } = data || {};

  return (
    <div className={`panel-flat cashflow-panel${compact ? ' is-compact' : ''}`}>
      <div className="panel-flat-head">
        <div>
          <h3 className="panel-flat-title">
            <ArrowDownUp size={17} /> Cashflow
          </h3>
          <p className="panel-flat-sub">Sales in vs Saudia buying out</p>
        </div>
        <button type="button" className="btn-secondary" style={{ width: 'auto', minHeight: 36, padding: '0.35rem 0.7rem', fontSize: '0.75rem' }} onClick={load}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="stats-grid stats-grid-quiet cashflow-stats">
        <div className="stat-card">
          <div className="stat-card-label">Sales (in)</div>
          <div className="stat-card-value" style={{ color: 'var(--status-paid)' }}>{formatCurrency(currencySymbol, total_sales)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Saudia buying</div>
          <div className="stat-card-value">{formatCurrency(currencySymbol, buying_cost)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Est. profit</div>
          <div className="stat-card-value">{formatCurrency(currencySymbol, net_profit)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Paid / due</div>
          <div className="stat-card-value" style={{ fontSize: '0.95rem' }}>
            {formatCurrency(currencySymbol, paid_sales)} / {formatCurrency(currencySymbol, pending_sales)}
          </div>
        </div>
      </div>

      {!compact && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.85rem 0' }}>
            {onNavigate && (
              <button type="button" className="btn-secondary" style={{ width: 'auto' }} onClick={() => onNavigate('create')}>
                <TrendingUp size={14} /> New sale / buy bill
              </button>
            )}
          </div>
          <h4 className="panel-flat-section">Recent money flow</h4>
          {money_flow.length === 0 ? (
            <EmptyState title="No bills yet" body="Cashflow appears after you save sales or Saudia buys." />
          ) : (
            <div className="mobile-card-list">
              {money_flow.slice(0, 40).map((row) => (
                <div key={`${row.id}-${row.date}`} className="mobile-card" style={{ padding: '0.7rem 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', fontSize: '0.8rem' }}>
                    <span>
                      <span className={`type-badge ${row.bill_type === 'supplier' ? 'saudia' : 'sale'}`}>
                        {row.bill_type === 'supplier' ? 'Saudia' : 'Sale'}
                      </span>{' '}
                      <span className="invoice-mono">{row.invoice_number}</span> · {row.date}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 750 }}>
                      {row.selling > 0 ? `+${formatCurrency(currencySymbol, row.selling)}` : `−${formatCurrency(currencySymbol, row.buying)}`}
                    </span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: 2, fontSize: '0.75rem' }}>{row.comment}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
