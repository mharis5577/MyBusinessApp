import React, { useEffect, useState } from 'react';
import { ArrowDownUp, RefreshCw, TrendingUp } from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';

export default function CashflowPanel({ currencySymbol = 'Rs.', compact = false, onNavigate }) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/cashflow');
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
  }, []);

  if (loading && !data) {
    return (
      <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)' }}>
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
    <div className="glass-panel" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <ArrowDownUp size={18} style={{ color: 'var(--accent-teal)' }} /> Cashflow
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Sales in vs Saudia buying out (from bills)
          </p>
        </div>
        <button type="button" className="btn-secondary" style={{ width: 'auto' }} onClick={load}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.65rem', marginBottom: compact ? 0 : '1rem' }}>
        <div className="surface-block" style={{ padding: '0.75rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Sales (in)</div>
          <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--success)' }}>{formatCurrency(currencySymbol, total_sales)}</div>
        </div>
        <div className="surface-block" style={{ padding: '0.75rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Saudia buying</div>
          <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--accent-purple)' }}>{formatCurrency(currencySymbol, buying_cost)}</div>
        </div>
        <div className="surface-block" style={{ padding: '0.75rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Est. profit</div>
          <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)' }}>{formatCurrency(currencySymbol, net_profit)}</div>
        </div>
        <div className="surface-block" style={{ padding: '0.75rem' }}>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Paid / pending sales</div>
          <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>
            {formatCurrency(currencySymbol, paid_sales)} / {formatCurrency(currencySymbol, pending_sales)}
          </div>
        </div>
      </div>

      {!compact && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
            {onNavigate && (
              <>
                <button type="button" className="btn-secondary" style={{ width: 'auto' }} onClick={() => onNavigate('create')}>
                  <TrendingUp size={14} /> New sale / buy bill
                </button>
              </>
            )}
          </div>
          <h4 style={{ fontSize: '0.9rem', fontWeight: 750, marginBottom: '0.55rem' }}>Recent money flow</h4>
          {money_flow.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No bills yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', maxHeight: 320, overflowY: 'auto' }}>
              {money_flow.slice(0, 40).map((row) => (
                <div key={`${row.id}-${row.date}`} className="surface-block" style={{ padding: '0.55rem 0.7rem', fontSize: '0.78rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
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
                  <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{row.comment}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
