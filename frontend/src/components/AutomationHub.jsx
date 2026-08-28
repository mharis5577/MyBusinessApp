import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  MessageCircle,
  Copy,
  Check,
  ShieldCheck,
  TrendingUp,
  AlertCircle,
  X,
  RefreshCw,
  Bell,
  HardDriveDownload,
  Zap,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import { formatCurrency, pakistanToday } from '../utils/pakistan';
import { openWhatsAppReminder, normalizeWhatsAppPhone } from '../utils/paymentReminder';
import { playSuccessChime, playTapSound } from '../utils/audioEffects';
import useDialog from '../utils/useDialog';

export default function AutomationHub({
  open = false,
  onClose,
  currencySymbol = 'Rs.',
  initialTab = 'brief', // 'brief' | 'reminders' | 'backup'
}) {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [period, setPeriod] = useState('today'); // 'today' | 'week' | 'month' | 'all' | 'custom'
  const [startDate, setStartDate] = useState(pakistanToday());
  const [endDate, setEndDate] = useState(pakistanToday());
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [businessBrief, setBusinessBrief] = useState(null);
  const [overdueQueue, setOverdueQueue] = useState([]);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupSuccessMsg, setBackupSuccessMsg] = useState('');
  const dialogRef = useDialog(open, onClose);

  useEffect(() => {
    if (open) {
      setActiveTab(initialTab);
      fetchBrief(period, startDate, endDate);
      fetchOverdueQueue();
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [open, initialTab]);

  const fetchBrief = async (p = period, sDate = startDate, eDate = endDate) => {
    setLoading(true);
    setErrorMsg('');
    try {
      let query = `/api/automation/daily-brief?period=${p}&currency=${encodeURIComponent(currencySymbol)}`;
      if (p === 'custom') {
        query += `&startDate=${sDate}&endDate=${eDate}`;
      }
      const res = await apiFetch(query);
      const data = await res.json();
      if (res.ok && data) {
        setBusinessBrief(data);
      } else {
        throw new Error(data?.error || 'Failed to load report summary');
      }
    } catch (err) {
      console.error(err);
      setErrorMsg(err.message || 'Could not load summary. Tap retry.');
    } finally {
      setLoading(false);
    }
  };

  const handlePeriodChange = (newPeriod) => {
    playTapSound();
    setPeriod(newPeriod);
    fetchBrief(newPeriod, startDate, endDate);
  };

  const handleCustomApply = (e) => {
    e.preventDefault();
    playTapSound();
    fetchBrief('custom', startDate, endDate);
  };

  const fetchOverdueQueue = async () => {
    try {
      const res = await apiFetch(`/api/automation/overdue-queue?currency=${encodeURIComponent(currencySymbol)}`);
      const data = await res.json();
      if (res.ok) setOverdueQueue(data || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCopyBrief = () => {
    if (!businessBrief?.messageText) return;
    navigator.clipboard.writeText(businessBrief.messageText);
    setCopied(true);
    playSuccessChime();
    toast.success('Business brief copied to clipboard!');
    setTimeout(() => setCopied(false), 3000);
  };

  const handleSendBriefWhatsApp = () => {
    if (!businessBrief?.messageText) return;
    playTapSound();
    openWhatsAppReminder('', businessBrief.messageText);
  };

  const handleSendReminder = (item) => {
    if (!item.phone || !normalizeWhatsAppPhone(item.phone)) {
      toast.error(`No phone number for ${item.customer_name}`);
      return;
    }
    playTapSound();
    openWhatsAppReminder(item.phone, item.reminder_text);
  };

  const handleRunBackupNow = async () => {
    setBackupRunning(true);
    setBackupSuccessMsg('');
    try {
      const res = await apiFetch('/api/automation/run-backup', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        playSuccessChime();
        setBackupSuccessMsg(`Backup saved: ${data.filename} (${data.count} snapshots stored)`);
        toast.success('Database backup created successfully!');
      } else {
        throw new Error(data.error || 'Backup failed');
      }
    } catch (err) {
      toast.error('Backup error: ' + err.message);
    } finally {
      setBackupRunning(false);
    }
  };

  if (!open) return null;

  return createPortal(
    <div className="client-modal-overlay auto-hub-overlay" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="client-modal-card auto-hub-modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="automation-hub-title"
        tabIndex={-1}
      >
        {/* ── Modal Header ── */}
        <div className="auto-hub-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div className="auto-hub-icon-badge">
                <Zap size={18} color="#fff" />
              </div>
              <div>
                <h3 id="automation-hub-title" style={{ fontSize: '1.05rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                  Business Reports & Automation
                </h3>
                <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', margin: '0.1rem 0 0' }}>
                  Daily summaries · WhatsApp brief · Overdue recovery
                </p>
              </div>
            </div>
            <button
              type="button"
              className="auto-hub-close-btn"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>

          {/* Tab Switcher */}
          <div className="auto-hub-tabs" style={{ marginTop: '0.85rem' }}>
            <button
              type="button"
              className={`auto-hub-tab-btn${activeTab === 'brief' ? ' is-active' : ''}`}
              onClick={() => { playTapSound(); setActiveTab('brief'); }}
            >
              <TrendingUp size={13} style={{ flexShrink: 0 }} /> <span>Profit Brief</span>
            </button>
            <button
              type="button"
              className={`auto-hub-tab-btn${activeTab === 'reminders' ? ' is-active' : ''}`}
              onClick={() => { playTapSound(); setActiveTab('reminders'); }}
            >
              <Bell size={13} style={{ flexShrink: 0 }} /> <span>Overdue</span>
              {overdueQueue.length > 0 && (
                <span className="auto-hub-badge-count">
                  {overdueQueue.length}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`auto-hub-tab-btn${activeTab === 'backup' ? ' is-active' : ''}`}
              onClick={() => { playTapSound(); setActiveTab('backup'); }}
            >
              <ShieldCheck size={13} style={{ flexShrink: 0 }} /> <span>Backups</span>
            </button>
          </div>
        </div>

        {/* ── Modal Body (Scrollable) ── */}
        <div className="auto-hub-body">

          {/* TAB 1: PROFIT BRIEF */}
          {activeTab === 'brief' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {/* Period Pills */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <div className="auto-hub-periods">
                  {[
                    { id: 'today', label: 'Today' },
                    { id: 'week', label: '7 Days' },
                    { id: 'month', label: 'This Month' },
                    { id: 'all', label: 'All Time' },
                    { id: 'custom', label: 'Custom' },
                  ].map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className={`auto-hub-period-btn${period === p.id ? ' is-active' : ''}`}
                      onClick={() => handlePeriodChange(p.id)}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {businessBrief?.dateRangeLabel && (
                  <div style={{ fontSize: '0.73rem', color: 'var(--accent-teal, #2dd4c8)', fontWeight: 750, paddingLeft: '0.2rem' }}>
                    📅 {businessBrief.dateRangeLabel}
                  </div>
                )}
              </div>

              {/* Custom Date Picker */}
              {period === 'custom' && (
                <form onSubmit={handleCustomApply} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', background: 'var(--surface-muted)', padding: '0.75rem 0.9rem', borderRadius: '12px', border: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ margin: 0, flex: '1 1 120px' }}>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>Start Date</label>
                    <input type="date" className="form-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                  </div>
                  <div className="form-group" style={{ margin: 0, flex: '1 1 120px' }}>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>End Date</label>
                    <input type="date" className="form-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                  </div>
                  <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.8rem' }}>Apply</button>
                </form>
              )}

              {loading && (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  <RefreshCw size={20} className="spin" style={{ margin: '0 auto 0.5rem', display: 'block', color: 'var(--accent-teal)' }} />
                  Loading business summary…
                </div>
              )}

              {errorMsg && !loading && (
                <div style={{ textAlign: 'center', padding: '1.5rem', background: 'rgba(239, 68, 68, 0.08)', borderRadius: '12px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                  <AlertCircle size={24} style={{ color: '#ef4444', margin: '0 auto 0.5rem', display: 'block' }} />
                  <p style={{ fontSize: '0.82rem', color: '#ef4444', margin: '0 0 0.75rem' }}>{errorMsg}</p>
                  <button type="button" className="btn-secondary" style={{ width: 'auto', padding: '0.4rem 1rem', fontSize: '0.8rem' }} onClick={() => fetchBrief(period, startDate, endDate)}>
                    Try Again
                  </button>
                </div>
              )}

              {businessBrief && !loading && (
                <>
                  {/* 4-Metric Grid */}
                  <div className="auto-hub-metric-grid">
                    {/* Online Sales */}
                    <div className="auto-hub-metric-card" style={{ borderLeft: '3.5px solid #3b82f6' }}>
                      <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sales</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', margin: '0.2rem 0 0.1rem' }}>
                        {formatCurrency(currencySymbol, businessBrief.metrics?.totalSales || 0)}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{businessBrief.metrics?.salesCount || 0} orders</div>
                    </div>

                    {/* Buying Cost */}
                    <div className="auto-hub-metric-card" style={{ borderLeft: '3.5px solid #f43f5e' }}>
                      <div style={{ fontSize: '0.66rem', fontWeight: 800, color: '#f43f5e', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Buying Cost</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#f43f5e', fontFamily: 'var(--font-mono)', margin: '0.2rem 0 0.1rem' }}>
                        {formatCurrency(currencySymbol, businessBrief.metrics?.totalBuying || 0)}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{businessBrief.metrics?.buyingCount || 0} purchases</div>
                    </div>

                    {/* Net Profit */}
                    <div className="auto-hub-metric-card" style={{ borderLeft: `3.5px solid ${(businessBrief.metrics?.netProfit || 0) >= 0 ? '#10b981' : '#ef4444'}`, background: (businessBrief.metrics?.netProfit || 0) >= 0 ? 'rgba(16, 185, 129, 0.06)' : 'rgba(239, 68, 68, 0.06)' }}>
                      <div style={{ fontSize: '0.66rem', fontWeight: 800, color: (businessBrief.metrics?.netProfit || 0) >= 0 ? '#10b981' : '#ef4444', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Net Profit</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: (businessBrief.metrics?.netProfit || 0) >= 0 ? '#10b981' : '#ef4444', fontFamily: 'var(--font-mono)', margin: '0.2rem 0 0.1rem' }}>
                        {formatCurrency(currencySymbol, businessBrief.metrics?.netProfit || 0)}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: (businessBrief.metrics?.netProfit || 0) >= 0 ? '#10b981' : '#ef4444', fontWeight: 700 }}>
                        {businessBrief.metrics?.profitMarginPct || '0.0'}% margin
                      </div>
                    </div>

                    {/* Cash Collected */}
                    <div className="auto-hub-metric-card" style={{ borderLeft: '3.5px solid var(--accent-teal, #2dd4c8)' }}>
                      <div style={{ fontSize: '0.66rem', fontWeight: 800, color: 'var(--accent-teal, #2dd4c8)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Collections</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 900, color: 'var(--accent-teal, #2dd4c8)', fontFamily: 'var(--font-mono)', margin: '0.2rem 0 0.1rem' }}>
                        {formatCurrency(currencySymbol, businessBrief.metrics?.totalCashCollected || 0)}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Cash in hand</div>
                    </div>
                  </div>

                  {/* WhatsApp Message Preview */}
                  <div style={{ borderRadius: '12px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.85rem', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-secondary)' }}>
                        WhatsApp Brief · {businessBrief.periodTitle}
                      </span>
                      <span style={{ fontSize: '0.68rem', color: '#25d366', fontWeight: 750, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#25d366', display: 'inline-block' }} />
                        Ready
                      </span>
                    </div>
                    <pre style={{
                      background: 'var(--bg-card)',
                      padding: '0.8rem 0.9rem',
                      fontSize: '0.78rem',
                      fontFamily: 'var(--font-mono, monospace)',
                      color: 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: '170px',
                      overflowY: 'auto',
                      margin: 0,
                      lineHeight: 1.5,
                    }}>
                      {businessBrief.messageText}
                    </pre>
                  </div>

                  {/* Actions Row */}
                  <div style={{ display: 'flex', gap: '0.55rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                    <button
                      type="button"
                      className="btn-primary"
                      style={{
                        flex: '1 1 160px',
                        background: '#25d366',
                        borderColor: '#25d366',
                        color: '#fff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.45rem',
                        fontWeight: 850,
                        fontSize: '0.86rem',
                        padding: '0.7rem 1.1rem',
                        borderRadius: '12px',
                        boxShadow: '0 4px 12px rgba(37, 211, 102, 0.3)',
                      }}
                      onClick={handleSendBriefWhatsApp}
                    >
                      <MessageCircle size={17} /> Send via WhatsApp
                    </button>

                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.7rem 1rem', borderRadius: '12px', fontSize: '0.82rem' }}
                      onClick={handleCopyBrief}
                    >
                      {copied ? <Check size={14} style={{ color: 'var(--success)' }} /> : <Copy size={14} />}
                      {copied ? 'Copied!' : 'Copy'}
                    </button>

                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: 'auto', padding: '0.7rem 0.85rem', borderRadius: '12px' }}
                      title="Refresh report"
                      onClick={() => fetchBrief(period, startDate, endDate)}
                    >
                      <RefreshCw size={15} className={loading ? 'spin' : ''} />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* TAB 2: OVERDUE REMINDERS */}
          {activeTab === 'reminders' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Unpaid customer invoices requiring recovery.
                </p>
                <span style={{
                  background: overdueQueue.length > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                  color: overdueQueue.length > 0 ? '#ef4444' : '#16a34a',
                  border: `1px solid ${overdueQueue.length > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
                  fontSize: '0.7rem', fontWeight: 850, padding: '0.18rem 0.6rem', borderRadius: '999px',
                }}>
                  {overdueQueue.length > 0 ? `${overdueQueue.length} Pending` : '✓ All Clear'}
                </span>
              </div>

              {overdueQueue.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', background: 'var(--surface-muted)', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
                  <Check size={28} style={{ color: '#10b981', margin: '0 auto 0.5rem', display: 'block' }} />
                  <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', fontWeight: 800 }}>All Caught Up!</h4>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: 0 }}>No overdue customer balances.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {overdueQueue.map((item) => (
                    <div
                      key={item.bill_id}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: 'var(--bg-card)', padding: '0.75rem 0.9rem',
                        borderRadius: '12px', border: '1px solid var(--border-color)',
                        borderLeft: '3.5px solid #ef4444',
                        flexWrap: 'wrap', gap: '0.5rem',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.15rem' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.86rem', color: 'var(--text-primary)' }}>{item.customer_name}</span>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{item.invoice_number}</span>
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                          Due: <strong style={{ color: '#ef4444', fontFamily: 'var(--font-mono)' }}>{formatCurrency(currencySymbol, item.balance_due)}</strong>
                          {item.days_overdue > 0 && (
                            <span style={{ marginLeft: '0.45rem', color: '#f59e0b', fontWeight: 700 }}>
                              · {item.days_overdue}d past
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="client-act-btn is-wa"
                        style={{ padding: '0.38rem 0.8rem', width: 'auto', flex: 'none', borderRadius: '10px', fontSize: '0.76rem' }}
                        onClick={() => handleSendReminder(item)}
                      >
                        <MessageCircle size={13} /> WA Reminder
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: BACKUPS */}
          {activeTab === 'backup' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{
                background: 'rgba(16, 185, 129, 0.07)', border: '1px solid rgba(16, 185, 129, 0.22)',
                borderRadius: '12px', padding: '0.9rem 1rem',
                display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
              }}>
                <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ShieldCheck size={18} style={{ color: '#10b981' }} />
                </div>
                <div>
                  <h4 style={{ margin: '0 0 0.2rem', fontSize: '0.9rem', color: '#10b981', fontWeight: 850 }}>Automated Nightly Backups Active</h4>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
                    Full database snapshot saved automatically to <code style={{ background: 'var(--surface-muted)', padding: '0.1rem 0.3rem', borderRadius: '4px' }}>backups/</code>.
                  </p>
                </div>
              </div>

              {backupSuccessMsg && (
                <div style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)', padding: '0.7rem 0.9rem', borderRadius: '12px', fontSize: '0.8rem', fontWeight: 750, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Check size={15} /> {backupSuccessMsg}
                </div>
              )}

              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'var(--bg-card)', padding: '0.9rem 1rem',
                borderRadius: '12px', border: '1px solid var(--border-color)',
                boxShadow: '0 1px 6px rgba(0,0,0,0.04)', flexWrap: 'wrap', gap: '0.75rem',
              }}>
                <div>
                  <h5 style={{ margin: '0 0 0.15rem', fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-primary)' }}>Run Manual Snapshot</h5>
                  <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--text-secondary)' }}>Store a fresh copy right now.</p>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: 'auto', padding: '0.55rem 1.1rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', borderRadius: '10px' }}
                  disabled={backupRunning}
                  onClick={handleRunBackupNow}
                >
                  <HardDriveDownload size={15} /> {backupRunning ? 'Backing up…' : 'Backup Now'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>,
    document.body
  );
}


