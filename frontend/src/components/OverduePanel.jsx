import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Banknote, MessageCircle, RefreshCw } from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import {
  buildPaymentReminderText,
  openWhatsAppReminder,
  normalizeWhatsAppPhone,
} from '../utils/paymentReminder';
import StatusBadge from './StatusBadge';
import QuickPaySheet from './QuickPaySheet';
import { isHelpBill } from '../utils/billTypes';

export default function OverduePanel({
  currencySymbol = 'Rs.',
  settings = {},
  onViewBill,
  embedded = false,
  excludeHelp = false,
  onPaid,
}) {
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [payBill, setPayBill] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/reports/aging');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      const overdue = (data.rows || [])
        .filter((r) => (Number(r.days_overdue) || 0) >= 1)
        .filter((r) => !excludeHelp || !isHelpBill(r))
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
  }, [excludeHelp]);

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

  const payOne = async (row) => {
    try {
      const res = await apiFetch(`/api/bills/${row.id}`);
      const bill = await res.json();
      if (res.ok && bill?.id) setPayBill(bill);
      else setPayBill(row);
    } catch {
      setPayBill(row);
    }
  };

  if (loading) {
    return (
      <div className={`panel-flat${embedded ? ' is-embedded' : ''}`} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '0.75rem 0' }}>
        <RefreshCw className="spin" size={18} /> Checking overdue…
      </div>
    );
  }

  if (rows.length === 0) {
    if (embedded) {
      return (
        <p className="dash-dropdown-empty">
          {excludeHelp
            ? 'No overdue sales — help return dates stay in Help given.'
            : 'No overdue bills — follow-ups will show here.'}
        </p>
      );
    }
    return null;
  }

  return (
    <div className={`panel-flat overdue-panel${embedded ? ' is-embedded' : ''}`}>
      {!embedded && (
        <div className="panel-flat-head">
          <div>
            <h3 className="panel-flat-title" style={{ color: 'var(--status-overdue)' }}>
              <AlertTriangle size={17} /> Overdue
            </h3>
            <p className="panel-flat-sub">
              {rows.length} bill{rows.length === 1 ? '' : 's'} · {formatCurrency(currencySymbol, totalDue)}
            </p>
          </div>
          <button type="button" className="btn-secondary" style={{ width: 'auto', minHeight: 36, padding: '0.35rem 0.7rem', fontSize: '0.75rem' }} onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      )}

      {embedded && (
        <div className="dash-dropdown-toolbar">
          <span>
            {rows.length} bill{rows.length === 1 ? '' : 's'} · {formatCurrency(currencySymbol, totalDue)}
          </span>
          <button type="button" className="btn-secondary" style={{ width: 'auto', minHeight: 32, padding: '0.3rem 0.65rem', fontSize: '0.72rem' }} onClick={load}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      )}

      <div className="mobile-card-list" style={{ maxHeight: 280, overflowY: 'auto' }}>
        {rows.slice(0, 12).map((r) => (
          <div key={r.id} className="overdue-row mobile-card">
            <button
              type="button"
              className="overdue-row-main"
              onClick={() => onViewBill && onViewBill(r)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <strong style={{ fontSize: '0.9rem' }}>{r.customer_name}</strong>
                <span className="mobile-card-amount">
                  {formatCurrency(currencySymbol, r.balance_due)}
                </span>
              </div>
              <div className="mobile-card-meta">
                <span className="invoice-mono">{r.invoice_number}</span>
                {' · '}
                {r.days_overdue}d overdue
              </div>
              <div style={{ marginTop: '0.35rem' }}>
                <StatusBadge status="overdue" />
              </div>
            </button>
            <div className="overdue-row-actions">
              <button
                type="button"
                className="btn-secondary overdue-wa-btn"
                onClick={() => payOne(r)}
              >
                <Banknote size={16} /> Pay
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
          </div>
        ))}
      </div>
      <QuickPaySheet
        open={Boolean(payBill)}
        bill={payBill}
        onClose={() => setPayBill(null)}
        onSaved={() => {
          load();
          onPaid?.();
        }}
        currencySymbol={currencySymbol}
      />
    </div>
  );
}
