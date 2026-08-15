import React, { useEffect, useMemo, useState } from 'react';
import { Clock, MessageCircle, RefreshCw } from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';
import { billTypeBadgeClass, billTypeShortLabel, isHelpBill } from '../utils/billTypes';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import { buildPaymentReminderText, openWhatsAppReminder, normalizeWhatsAppPhone } from '../utils/paymentReminder';
import ConfirmDialog from './ConfirmDialog';

const BUCKETS = [
  { key: 'all', label: 'All open' },
  { key: 'current', label: '< 30 days' },
  { key: 'd30', label: '30–60' },
  { key: 'd60', label: '60–90' },
  { key: 'd90', label: '90+ days' },
];

export default function AgingReport({
  currencySymbol = 'Rs.',
  settings = {},
  onOpenBill,
  compact = false,
}) {
  const toast = useToast();
  const [report, setReport] = useState(null);
  const [bucket, setBucket] = useState('d30');
  const [loading, setLoading] = useState(true);
  const [reminding, setReminding] = useState(false);
  const [remindFlow, setRemindFlow] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/reports/aging');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setReport(data);
    } catch (err) {
      toast.error(err.message || 'Aging report failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(() => {
    if (!report) return [];
    if (bucket === 'all') return report.rows || [];
    return report.buckets?.[bucket] || [];
  }, [report, bucket]);

  const overdueForRemind = useMemo(() => {
    if (!report) return [];
    return (report.rows || []).filter((r) => (Number(r.days_overdue) || 0) >= 1);
  }, [report]);

  const startRemindAll = () => {
    const list = overdueForRemind.filter((r) => normalizeWhatsAppPhone(r.customer_phone));
    const skippedNoPhone = overdueForRemind.length - list.length;
    if (!list.length) {
      toast.info(`No overdue bills with phone numbers (${skippedNoPhone} skipped).`);
      return;
    }
    setRemindFlow({
      phase: 'batch',
      list,
      skippedNoPhone,
      index: 0,
      sent: 0,
      cancelled: 0,
    });
  };

  const finishRemindFlow = (flow) => {
    setReminding(false);
    setRemindFlow(null);
    toast.success(
      `Reminders: ${flow.sent} opened, ${flow.skippedNoPhone} no phone, ${flow.cancelled} skipped.`
    );
  };

  const openCurrentReminder = async (flow) => {
    const bill = flow.list[flow.index];
    if (!bill) {
      finishRemindFlow(flow);
      return;
    }
    const text = buildPaymentReminderText({
      bill,
      settings,
      currencySymbol,
      urdu: Boolean(settings.urdu_labels),
    });
    openWhatsAppReminder(bill.customer_phone, text);
    const next = {
      ...flow,
      sent: flow.sent + 1,
      index: flow.index + 1,
    };
    await new Promise((r) => setTimeout(r, 600));
    if (next.index >= next.list.length) {
      finishRemindFlow(next);
      return;
    }
    setRemindFlow({ ...next, phase: 'one' });
  };

  const confirmRemindStep = async () => {
    if (!remindFlow) return;
    if (remindFlow.phase === 'batch') {
      setReminding(true);
      setRemindFlow({ ...remindFlow, phase: 'one' });
      return;
    }
    await openCurrentReminder(remindFlow);
  };

  const cancelRemindStep = async () => {
    if (!remindFlow) return;
    if (remindFlow.phase === 'batch') {
      setRemindFlow(null);
      return;
    }
    const next = {
      ...remindFlow,
      cancelled: remindFlow.cancelled + 1,
      index: remindFlow.index + 1,
    };
    if (next.index >= next.list.length) {
      finishRemindFlow(next);
      return;
    }
    setRemindFlow({ ...next, phase: 'one' });
  };

  const remindDialog =
    remindFlow == null
      ? null
      : remindFlow.phase === 'batch'
        ? {
            title: `Remind ${remindFlow.list.length} overdue?`,
            message: `WhatsApp will open one by one. You can skip any bill. ${remindFlow.skippedNoPhone} without phone are already skipped.`,
            confirmLabel: 'Start',
            cancelLabel: 'Cancel',
          }
        : (() => {
            const bill = remindFlow.list[remindFlow.index];
            return {
              title: `Remind ${remindFlow.index + 1}/${remindFlow.list.length}`,
              message: `${bill?.customer_name || 'Customer'} · ${bill?.invoice_number || ''} · balance ${formatCurrency(currencySymbol, bill?.balance_due)}. Open WhatsApp?`,
              confirmLabel: 'Open WhatsApp',
              cancelLabel: 'Skip',
            };
          })();

  if (loading && !report) {
    return (
      <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw className="spin" size={20} /> Loading aging…
      </div>
    );
  }

  const totals = report?.totals || {};

  return (
    <div className="glass-panel" style={{ padding: '1.25rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.85rem' }}>
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <Clock size={18} style={{ color: 'var(--warning)' }} /> Collections aging
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
            Open customer balances by days past due ({report?.today})
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" style={{ width: 'auto' }} onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            type="button"
            className="btn-primary"
            style={{ width: 'auto' }}
            disabled={reminding || overdueForRemind.length === 0}
            onClick={startRemindAll}
          >
            <MessageCircle size={14} /> Remind all overdue
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '0.5rem', marginBottom: '0.85rem' }}>
        {[
          ['<30', totals.current],
          ['30–60', totals.d30],
          ['60–90', totals.d60],
          ['90+', totals.d90],
        ].map(([label, amt]) => (
          <div key={label} className="surface-block" style={{ padding: '0.55rem 0.65rem' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{label}</div>
            <div style={{ fontWeight: 800, fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
              {formatCurrency(currencySymbol, amt || 0)}
            </div>
          </div>
        ))}
      </div>

      <div className="aging-bucket-tabs">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            type="button"
            className={`party-filter-chip ${bucket === b.key ? 'active' : ''}`}
            onClick={() => setBucket(b.key)}
          >
            {b.label}
            {b.key !== 'all' && report?.buckets?.[b.key]
              ? ` (${report.buckets[b.key].length})`
              : b.key === 'all'
                ? ` (${report?.count || 0})`
                : ''}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No open balances in this bucket.</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: compact ? 280 : 420, overflowY: 'auto' }}>
          {rows.map((r) => (
            <button
              key={r.id}
              type="button"
              className="aging-row"
              onClick={() => onOpenBill && onOpenBill(r)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                <strong style={{ fontSize: '0.9rem' }}>{r.customer_name}</strong>
                <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800 }}>
                  {formatCurrency(currencySymbol, r.balance_due)}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                <span className="invoice-mono">{r.invoice_number}</span>
                {isHelpBill(r) ? (
                  <>
                    {' · '}
                    <span className={`type-badge ${billTypeBadgeClass(r)}`}>{billTypeShortLabel(r)}</span>
                  </>
                ) : null}
                {' · '}Due {r.due_date || '—'}
                {' · '}
                <span style={{ color: r.days_overdue >= 30 ? 'var(--danger)' : 'var(--warning)', fontWeight: 700 }}>
                  {r.days_overdue}d overdue
                </span>
                {!r.customer_phone ? ' · no phone' : ''}
              </div>
            </button>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(remindDialog)}
        title={remindDialog?.title || ''}
        message={remindDialog?.message || ''}
        confirmLabel={remindDialog?.confirmLabel || 'OK'}
        cancelLabel={remindDialog?.cancelLabel || 'Cancel'}
        danger={false}
        busy={false}
        onCancel={cancelRemindStep}
        onConfirm={confirmRemindStep}
      />
    </div>
  );
}
