import React, { useEffect, useState } from 'react';
import { Calculator, RefreshCw } from 'lucide-react';
import { formatCurrency, pakistanToday } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';

export default function DailyClosePanel({
  currencySymbol = 'Rs.',
  embedded = false,
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [cash, setCash] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [todayRes, listRes] = await Promise.all([
        apiFetch('/api/closings/today'),
        apiFetch('/api/closings?limit=14'),
      ]);
      const todayJson = await todayRes.json();
      const listJson = await listRes.json();
      if (!todayRes.ok) throw new Error(todayJson.error || 'Could not load today');
      if (!listRes.ok) throw new Error(listJson.error || 'Could not load history');
      setPreview(todayJson);
      setHistory(Array.isArray(listJson) ? listJson : listJson.rows || []);
      if (todayJson.last_close?.cash_counted != null && cash === '') {
        setCash(String(todayJson.last_close.cash_counted));
      }
    } catch (err) {
      toast.error(err.message || 'Day close failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const collected = Number(preview?.collected) || 0;
  const counted = Number(cash);
  const gap = Number.isFinite(counted) ? Math.round((counted - collected) * 100) / 100 : 0;
  const today = preview?.date || pakistanToday();

  const save = async (e) => {
    e.preventDefault();
    if (!Number.isFinite(counted) || counted < 0) {
      toast.error('Enter cash in the drawer');
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch('/api/closings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cash_counted: counted, notes: '' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not save');
      toast.success('Day close saved');
      await load();
    } catch (err) {
      toast.error(err.message || 'Could not save day close');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !preview) {
    return (
      <div className={`panel-flat${embedded ? ' is-embedded' : ''}`} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem 0' }}>
        <RefreshCw className="spin" size={20} /> Loading day close…
      </div>
    );
  }

  return (
    <div className={`panel-flat daily-close-panel${embedded ? ' is-embedded' : ''}`}>
      {!embedded && (
        <div className="panel-flat-head">
          <div>
            <h3 className="panel-flat-title">
              <Calculator size={17} /> Day close
            </h3>
            <p className="panel-flat-sub">{today} · cash vs collected sales</p>
          </div>
          <button type="button" className="btn-secondary" style={{ width: 'auto', minHeight: 36, padding: '0.35rem 0.7rem', fontSize: '0.75rem' }} onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      )}

      {embedded && (
        <div className="dash-dropdown-toolbar">
          <span>{today} · collected {formatCurrency(currencySymbol, collected)}</span>
          <button type="button" className="btn-secondary" style={{ width: 'auto', minHeight: 32, padding: '0.3rem 0.65rem', fontSize: '0.72rem' }} onClick={load}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      )}

      <form onSubmit={save} className="daily-close-form">
        <div className="stats-grid stats-grid-quiet">
          <div className="stat-card">
            <div className="stat-card-label">Collected today</div>
            <div className="stat-card-value">{formatCurrency(currencySymbol, collected)}</div>
            <div className="stat-card-hint">Customer payments dated today</div>
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Cash counted</div>
            <input
              className="form-input"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              value={cash}
              onChange={(e) => setCash(e.target.value)}
              placeholder="0"
              aria-label="Cash counted"
            />
          </div>
          <div className="stat-card">
            <div className="stat-card-label">Gap</div>
            <div
              className="stat-card-value"
              style={{ color: gap < -0.5 ? 'var(--danger)' : gap > 0.5 ? 'var(--status-paid)' : undefined }}
            >
              {Number.isFinite(counted) ? formatCurrency(currencySymbol, gap) : '—'}
            </div>
            <div className="stat-card-hint">
              {gap < -0.5 ? 'Short vs collected' : gap > 0.5 ? 'Over collected' : 'Matches collected'}
            </div>
          </div>
        </div>
        <button type="submit" className="btn-primary" style={{ width: 'auto', marginTop: '0.75rem' }} disabled={saving}>
          {saving ? 'Saving…' : 'Save day close'}
        </button>
      </form>

      {history.length > 0 && (
        <div className="daily-close-history">
          <h4 className="panel-flat-section">Recent closes</h4>
          {history.map((row) => {
            const g = Number(row.gap) || 0;
            return (
              <div key={row.id || row.close_date} className="daily-close-history-row">
                <span>{row.close_date}</span>
                <span>Cash {formatCurrency(currencySymbol, row.cash_counted)}</span>
                <span>In {formatCurrency(currencySymbol, row.collected_sales)}</span>
                <span style={{ color: g < -0.5 ? 'var(--danger)' : undefined }}>
                  Gap {formatCurrency(currencySymbol, g)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
