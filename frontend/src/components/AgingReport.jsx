import React, { useEffect, useMemo, useState } from 'react';
import { Clock, MessageCircle, RefreshCw, Send, CheckCircle, AlertTriangle, AlertCircle, Calendar } from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';
import { billTypeBadgeClass, billTypeShortLabel, isHelpBill } from '../utils/billTypes';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import { buildPaymentReminderText, openWhatsAppReminder, normalizeWhatsAppPhone } from '../utils/paymentReminder';
import ConfirmDialog from './ConfirmDialog';

const BUCKETS = [
  { key: 'all', label: 'All Open', icon: Clock },
  { key: 'current', label: '< 30 Days (Current)', color: '#10b981' },
  { key: 'd30', label: '30–60 Days', color: '#f59e0b' },
  { key: 'd60', label: '60–90 Days', color: '#f97316' },
  { key: 'd90', label: '90+ Days', color: '#ef4444' },
];

export default function AgingReport({
  currencySymbol = 'Rs.',
  settings = {},
  onOpenBill,
  compact = false,
}) {
  const toast = useToast();
  const [report, setReport] = useState(null);
  const [bucket, setBucket] = useState('all');
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

  const handleSendSingleReminder = (e, bill) => {
    e.stopPropagation();
    if (!bill.customer_phone) {
      toast.info('No phone number recorded for this customer.');
      return;
    }
    const text = buildPaymentReminderText({
      bill,
      settings,
      currencySymbol,
      urdu: Boolean(settings.urdu_labels),
    });
    openWhatsAppReminder(bill.customer_phone, text);
    toast.success(`WhatsApp reminder opened for ${bill.customer_name}`);
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
      <div className="glass-panel" style={{ padding: '1.75rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        <RefreshCw className="spin" size={24} style={{ color: 'var(--accent-teal, #14b8a6)', marginBottom: '0.5rem' }} />
        <div>Loading aging report…</div>
      </div>
    );
  }

  const totals = report?.totals || {};

  const bucketCards = [
    { key: 'current', label: '< 30 Days', sub: 'Current / Recent', amt: totals.current || 0, color: '#10b981', count: report?.buckets?.current?.length || 0 },
    { key: 'd30', label: '30–60 Days', sub: 'Past Due', amt: totals.d30 || 0, color: '#f59e0b', count: report?.buckets?.d30?.length || 0 },
    { key: 'd60', label: '60–90 Days', sub: 'Overdue', amt: totals.d60 || 0, color: '#f97316', count: report?.buckets?.d60?.length || 0 },
    { key: 'd90', label: '90+ Days', sub: 'High Risk', amt: totals.d90 || 0, color: '#ef4444', count: report?.buckets?.d90?.length || 0 },
  ];

  return (
    <div className="glass-panel" style={{ padding: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.45rem', color: 'var(--text-primary)' }}>
            <Clock size={19} style={{ color: 'var(--warning, #f59e0b)' }} /> Collections Aging Report
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: '0.2rem 0 0 0' }}>
            Open customer balances grouped by aging brackets · As of {report?.today}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn-secondary" style={{ width: 'auto', padding: '0.4rem 0.75rem', fontSize: '0.8rem' }} onClick={load}>
            <RefreshCw size={14} className={loading ? 'spin' : ''} /> Refresh
          </button>
          <button
            type="button"
            className="btn-primary"
            style={{ width: 'auto', padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
            disabled={reminding || overdueForRemind.length === 0}
            onClick={startRemindAll}
            title={overdueForRemind.length === 0 ? 'No overdue bills' : `Send WhatsApp reminders to ${overdueForRemind.length} overdue parties`}
          >
            <MessageCircle size={14} /> Remind Overdue ({overdueForRemind.length})
          </button>
        </div>
      </div>

      {/* 4 Buckets Grid — 4 cols desktop / 2x2 mobile */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '0.65rem',
          marginBottom: '1rem',
        }}
      >
        {bucketCards.map((b) => {
          const isSelected = bucket === b.key;
          const hasBalance = b.amt > 0;
          return (
            <div
              key={b.key}
              onClick={() => setBucket(b.key)}
              className="aging-bucket-tile"
              style={{
                cursor: 'pointer',
                borderLeft: `3px solid ${b.color}`,
                background: isSelected ? 'var(--card-hover-bg, rgba(255,255,255,0.08))' : undefined,
                boxShadow: isSelected ? `0 0 0 1px ${b.color}40, 0 4px 12px rgba(0,0,0,0.2)` : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: b.color }}>{b.label}</span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '0.1rem 0.35rem',
                    borderRadius: '999px',
                    background: hasBalance ? `${b.color}20` : 'rgba(255,255,255,0.06)',
                    color: hasBalance ? b.color : 'var(--text-muted)',
                  }}
                >
                  {b.count}
                </span>
              </div>
              <div
                style={{
                  fontWeight: 800,
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.95rem',
                  color: hasBalance ? 'var(--text-primary)' : 'var(--text-muted)',
                  marginTop: '0.15rem',
                }}
              >
                {formatCurrency(currencySymbol, b.amt)}
              </div>
              <div style={{ fontSize: '0.66rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>
                {b.sub}
              </div>
            </div>
          );
        })}
      </div>

      {/* Filter Tabs */}
      <div className="aging-bucket-tabs">
        {BUCKETS.map((b) => (
          <button
            key={b.key}
            type="button"
            className={`party-filter-chip ${bucket === b.key ? 'active' : ''}`}
            onClick={() => setBucket(b.key)}
            style={{
              whiteSpace: 'nowrap',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
            }}
          >
            <span>{b.label}</span>
            <span style={{ fontSize: '0.72rem', opacity: 0.85 }}>
              ({b.key === 'all' ? (report?.count || 0) : (report?.buckets?.[b.key]?.length || 0)})
            </span>
          </button>
        ))}
      </div>

      {/* Bills Itemized List */}
      {rows.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '2rem 1rem',
            color: 'var(--text-muted)',
            background: 'var(--card-bg, rgba(255, 255, 255, 0.02))',
            borderRadius: 'var(--radius-md, 10px)',
            border: '1px dashed var(--border-color, rgba(255,255,255,0.08))',
          }}
        >
          <CheckCircle size={24} style={{ color: '#10b981', margin: '0 auto 0.4rem' }} />
          <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            No open balances in this aging bracket
          </p>
          <p style={{ margin: '0.2rem 0 0', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
            All accounts in this category are clear.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: compact ? 300 : 440, overflowY: 'auto' }}>
          {rows.map((r) => {
            const daysOverdue = Number(r.days_overdue) || 0;
            const isOverdue = daysOverdue > 0;
            const isCritical = daysOverdue >= 30;

            return (
              <div
                key={r.id}
                className="aging-row"
                onClick={() => onOpenBill && onOpenBill(r)}
                title="Click to view full invoice"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <strong style={{ fontSize: '0.92rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                      {r.customer_name}
                    </strong>
                    {isHelpBill(r) && (
                      <span className={`type-badge ${billTypeBadgeClass(r)}`} style={{ fontSize: '0.68rem', padding: '0.1rem 0.4rem' }}>
                        {billTypeShortLabel(r)}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, fontSize: '0.95rem', color: 'var(--accent-gold, #f59e0b)' }}>
                      {formatCurrency(currencySymbol, r.balance_due)}
                    </span>
                    {r.customer_phone && (
                      <button
                        type="button"
                        onClick={(e) => handleSendSingleReminder(e, r)}
                        title="Send WhatsApp Reminder"
                        style={{
                          background: 'rgba(37, 211, 102, 0.12)',
                          border: '1px solid rgba(37, 211, 102, 0.3)',
                          borderRadius: '6px',
                          color: '#25d366',
                          padding: '0.25rem 0.45rem',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <Send size={11} /> Remind
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.76rem', color: 'var(--text-secondary)', marginTop: '0.15rem', flexWrap: 'wrap', gap: '0.35rem' }}>
                  <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="invoice-mono" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
                      {r.invoice_number}
                    </span>
                    <span>·</span>
                    <span>Due {r.due_date || '—'}</span>
                  </div>

                  <div>
                    {isCritical ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          color: '#ef4444',
                          fontWeight: 700,
                          background: 'rgba(239, 68, 68, 0.12)',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '999px',
                        }}
                      >
                        <AlertCircle size={12} /> {daysOverdue}d overdue
                      </span>
                    ) : isOverdue ? (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          color: '#f59e0b',
                          fontWeight: 700,
                          background: 'rgba(245, 158, 11, 0.12)',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '999px',
                        }}
                      >
                        <AlertTriangle size={12} /> {daysOverdue}d overdue
                      </span>
                    ) : (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.25rem',
                          color: '#10b981',
                          fontWeight: 600,
                          background: 'rgba(16, 185, 129, 0.1)',
                          padding: '0.15rem 0.45rem',
                          borderRadius: '999px',
                        }}
                      >
                        <CheckCircle size={12} /> Current
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
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
