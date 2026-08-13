import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, MessageCircle, RefreshCw } from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import {
  buildPaymentReminderText,
  openWhatsAppReminder,
  normalizeWhatsAppPhone,
} from '../utils/paymentReminder';

export default function OverduePanel({
  currencySymbol = 'Rs.',
  settings = {},
  onViewBill,
}) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/reports/aging');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const overdue = (data.rows || [])
        .filter((r) => (Number(r.days_overdue) || 0) >= 1)
        .sort((a, b) => (Number(b.days_overdue) || 0) - (Number(a.days_overdue) || 0));
      setRows(overdue);
    } catch (err) {
      console.warn(err);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const totalDue = useMemo(
    () => rows.reduce((s, r) => s + (Number(r.balance_due) || 0), 0),
    [rows]
  );

  const remindOne = (bill) => {
    if (!normalizeWhatsAppPhone(bill.customer_phone)) {
      toast.error('No phone number on this bill');
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

  if (loading) {
    return (
      <div className="glass-panel" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw className="spin" size={18} /> Checking overdue…
      </div>
    );
  }

  if (rows.length === 0) return null;

  return (
    <div className="glass-panel overdue-panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.65rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <AlertTriangle size={18} style={{ color: 'var(--danger)' }} /> Due / overdue
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            {rows.length} bill{rows.length === 1 ? '' : 's'} · {formatCurrency(currencySymbol, totalDue)}
          </p>
        </div>
        <button type="button" className="btn-secondary" style={{ width: 'auto' }} onClick={load}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: 280, overflowY: 'auto' }}>
        {rows.slice(0, 12).map((r) => (
          <div key={r.id} className="overdue-row surface-block">
            <button
              type="button"
              className="overdue-row-main"
              onClick={() => onViewBill && onViewBill(r)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <strong style={{ fontSize: '0.9rem' }}>{r.customer_name}</strong>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                  {formatCurrency(currencySymbol, r.balance_due)}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                <span className="invoice-mono">{r.invoice_number}</span>
                {' · '}
                <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{r.days_overdue}d overdue</span>
              </div>
            </button>
            <button
              type="button"
              className="btn-secondary overdue-wa-btn"
              style={{ color: '#25D366' }}
              onClick={() => remindOne(r)}
              disabled={!normalizeWhatsAppPhone(r.customer_phone)}
              title={r.customer_phone ? 'WhatsApp reminder' : 'No phone'}
            >
              <MessageCircle size={16} /> WA
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
