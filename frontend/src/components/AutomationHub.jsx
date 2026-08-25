import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  Sparkles,
  MessageCircle,
  Copy,
  Check,
  ShieldCheck,
  Send,
  Calendar,
  DollarSign,
  TrendingUp,
  AlertCircle,
  X,
  RefreshCw,
  Bell,
  HardDriveDownload,
  Zap,
  Filter
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import { formatCurrency, pakistanToday } from '../utils/pakistan';
import { openWhatsAppReminder, normalizeWhatsAppPhone } from '../utils/paymentReminder';
import { playSuccessChime, playTapSound } from '../utils/audioEffects';

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
  const [copied, setCopied] = useState(false);
  const [businessBrief, setBusinessBrief] = useState(null);
  const [overdueQueue, setOverdueQueue] = useState([]);
  const [backupRunning, setBackupRunning] = useState(false);
  const [backupSuccessMsg, setBackupSuccessMsg] = useState('');

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
    try {
      let query = `/api/automation/daily-brief?period=${p}&currency=${encodeURIComponent(currencySymbol)}`;
      if (p === 'custom') {
        query += `&startDate=${sDate}&endDate=${eDate}`;
      }
      const res = await apiFetch(query);
      const data = await res.json();
      if (res.ok) setBusinessBrief(data);
    } catch (err) {
      console.error(err);
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
    const encoded = encodeURIComponent(businessBrief.messageText);
    window.open(`https://api.whatsapp.com/send?text=${encoded}`, '_blank');
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
    <div className="client-modal-overlay" onClick={onClose}>
      <div
        className="client-modal-card"
        style={{ maxWidth: '700px', padding: 0, overflow: 'hidden', borderRadius: '20px' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Premium Modal Header ── */}
        <div style={{
          padding: '1.35rem 1.5rem 1.1rem',
          background: 'linear-gradient(135deg, var(--bg-card) 0%, color-mix(in srgb, var(--accent-teal) 6%, var(--bg-card)) 100%)',
          borderBottom: '1px solid var(--border-color)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Accent top stripe */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: '3px',
            background: 'linear-gradient(90deg, var(--accent-teal), #3b82f6, var(--accent-teal))',
            backgroundSize: '200% auto',
          }} />

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div style={{
                width: '42px', height: '42px', borderRadius: '12px',
                background: 'linear-gradient(135deg, var(--accent-teal) 0%, #3b82f6 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0, 179, 166, 0.35)',
                flexShrink: 0,
              }}>
                <Zap size={20} color="#fff" />
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 900, margin: 0, letterSpacing: '-0.02em', color: 'var(--text-primary)' }}>
                  Business Reports & Automation
                </h3>
                <p style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', margin: '0.15rem 0 0', lineHeight: 1.4 }}>
                  Profit reports · Overdue reminders · Auto-backups
                </p>
              </div>
            </div>
            <button
              type="button"
              style={{
                width: '32px', height: '32px', borderRadius: '10px',
                border: '1px solid var(--border-color)', background: 'var(--surface-muted)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'var(--text-secondary)', flexShrink: 0,
                transition: 'all 0.15s ease',
              }}
              onClick={onClose}
            >
              <X size={15} />
            </button>
          </div>

          {/* Tab Switcher */}
          <div className="auto-hub-tabs" style={{ marginTop: '1.1rem' }}>
            <button
              type="button"
              className={`auto-hub-tab-btn${activeTab === 'brief' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('brief')}
            >
              <TrendingUp size={14} /> Profit Brief
            </button>
            <button
              type="button"
              className={`auto-hub-tab-btn${activeTab === 'reminders' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('reminders')}
            >
              <Bell size={14} /> Overdue
              {overdueQueue.length > 0 && (
                <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.62rem', fontWeight: 850, borderRadius: '999px', padding: '0 5px', minWidth: '17px', height: '17px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  {overdueQueue.length}
                </span>
              )}
            </button>
            <button
              type="button"
              className={`auto-hub-tab-btn${activeTab === 'backup' ? ' is-active' : ''}`}
              onClick={() => setActiveTab('backup')}
            >
              <ShieldCheck size={14} /> Backups
            </button>
          </div>
        </div>

        {/* ── Tab Body ── */}
        <div style={{ padding: '1.25rem 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', maxHeight: '70vh', overflowY: 'auto' }}>

          {/* TAB 1: PROFIT BRIEF */}
          {activeTab === 'brief' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Period Pills */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div className="auto-hub-periods">
                  {[
                    { id: 'today', label: 'Today' },
                    { id: 'week', label: '7 Days' },
                    { id: 'month', label: 'This Month' },
                    { id: 'all', label: 'All Time' },
                    { id: 'custom', label: 'Custom Dates' },
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
                  <div style={{ fontSize: '0.73rem', color: 'var(--accent-teal)', fontWeight: 700, paddingLeft: '0.1rem' }}>
                    📅 {businessBrief.dateRangeLabel}
                  </div>
                )}
              </div>

              {/* Custom Date Picker */}
              {period === 'custom' && (
                <form onSubmit={handleCustomApply} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-end', background: 'var(--surface-muted)', padding: '0.85rem 1rem', borderRadius: '12px', border: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ margin: 0, flex: '1 1 130px' }}>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>Start Date</label>
                    <input type="date" className="form-input" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
                  </div>
                  <div className="form-group" style={{ margin: 0, flex: '1 1 130px' }}>
                    <label className="form-label" style={{ fontSize: '0.72rem' }}>End Date</label>
                    <input type="date" className="form-input" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
                  </div>
                  <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '0.5rem 1.1rem', fontSize: '0.82rem' }}>Apply</button>
                </form>
              )}

              {loading && (
                <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Loading report…
                </div>
              )}

              {businessBrief && !loading && (
                <>
                  {/* 4-Metric Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.7rem' }}>
                    {/* Online Sales */}
                    <div style={{ padding: '1rem', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderLeft: '4px solid #3b82f6', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>Online Sales</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>
                        {formatCurrency(currencySymbol, businessBrief.metrics?.totalSales || 0)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem', fontWeight: 600 }}>{businessBrief.metrics?.salesCount || 0} orders</div>
                    </div>

                    {/* Buying Cost */}
                    <div style={{ padding: '1rem', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderLeft: '4px solid #f43f5e', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#f43f5e', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>Saudia Buying</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#f43f5e', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>
                        {formatCurrency(currencySymbol, businessBrief.metrics?.totalBuying || 0)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem', fontWeight: 600 }}>{businessBrief.metrics?.buyingCount || 0} purchases</div>
                    </div>

                    {/* Net Profit */}
                    <div style={{ padding: '1rem', borderRadius: '14px', background: 'rgba(16, 185, 129, 0.06)', border: '1px solid rgba(16, 185, 129, 0.22)', borderLeft: '4px solid #10b981', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>Operating Profit</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#10b981', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>
                        {formatCurrency(currencySymbol, businessBrief.metrics?.netProfit || 0)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: '#10b981', marginTop: '0.2rem', fontWeight: 700 }}>{businessBrief.metrics?.profitMarginPct || '0.0'}% margin</div>
                    </div>

                    {/* Cash Collected */}
                    <div style={{ padding: '1rem', borderRadius: '14px', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderLeft: '4px solid var(--accent-teal)', boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
                      <div style={{ fontSize: '0.68rem', fontWeight: 800, color: 'var(--accent-teal)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.35rem' }}>Collections In</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--accent-teal)', fontFamily: 'var(--font-mono)', letterSpacing: '-0.02em' }}>
                        {formatCurrency(currencySymbol, businessBrief.metrics?.totalCashCollected || 0)}
                      </div>
                      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem', fontWeight: 600 }}>Cash received</div>
                    </div>
                  </div>

                  {/* WhatsApp Message Preview */}
                  <div style={{ borderRadius: '14px', border: '1px solid var(--border-color)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.65rem 1rem', background: 'var(--surface-muted)', borderBottom: '1px solid var(--border-color)' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-secondary)' }}>
                        WhatsApp Brief · {businessBrief.periodTitle}
                      </span>
                      <span style={{ fontSize: '0.7rem', color: '#25d366', fontWeight: 750, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#25d366', display: 'inline-block' }} />
                        Ready to share
                      </span>
                    </div>
                    <pre style={{
                      background: 'var(--bg-card)',
                      padding: '0.9rem 1rem',
                      fontSize: '0.8rem',
                      fontFamily: 'var(--font-mono, monospace)',
                      color: 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: '180px',
                      overflowY: 'auto',
                      margin: 0,
                      lineHeight: 1.55,
                    }}>
                      {businessBrief.messageText}
                    </pre>
                  </div>

                  {/* Actions Row */}
                  <div style={{ display: 'flex', gap: '0.65rem', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      style={{
                        flex: 1, minWidth: '140px',
                        background: '#25d366', color: '#fff', border: 'none',
                        borderRadius: '12px', padding: '0.75rem 1.25rem',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        gap: '0.5rem', fontFamily: 'inherit', fontWeight: 850, fontSize: '0.88rem',
                        cursor: 'pointer', boxShadow: '0 4px 14px rgba(37, 211, 102, 0.3)',
                        transition: 'all 0.18s ease',
                      }}
                      onClick={handleSendBriefWhatsApp}
                    >
                      <MessageCircle size={16} /> Send via WhatsApp
                    </button>

                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.4rem', padding: '0.75rem 1.1rem', borderRadius: '12px' }}
                      onClick={handleCopyBrief}
                    >
                      {copied ? <Check size={15} style={{ color: 'var(--success)' }} /> : <Copy size={15} />}
                      {copied ? 'Copied!' : 'Copy Text'}
                    </button>

                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ width: 'auto', padding: '0.75rem', borderRadius: '12px' }}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Unpaid customer invoices requiring follow-up.
                </p>
                <span style={{
                  background: overdueQueue.length > 0 ? 'rgba(239, 68, 68, 0.12)' : 'rgba(34, 197, 94, 0.12)',
                  color: overdueQueue.length > 0 ? '#ef4444' : '#16a34a',
                  border: `1px solid ${overdueQueue.length > 0 ? 'rgba(239,68,68,0.25)' : 'rgba(34,197,94,0.25)'}`,
                  fontSize: '0.72rem', fontWeight: 850, padding: '0.2rem 0.65rem', borderRadius: '999px',
                }}>
                  {overdueQueue.length > 0 ? `${overdueQueue.length} Pending` : '✓ All Clear'}
                </span>
              </div>

              {overdueQueue.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2.5rem 1rem', background: 'var(--surface-muted)', borderRadius: '14px', border: '1px solid var(--border-color)' }}>
                  <Check size={32} style={{ color: '#10b981', margin: '0 auto 0.65rem', display: 'block' }} />
                  <h4 style={{ margin: '0 0 0.35rem', fontSize: '1rem', fontWeight: 800 }}>All Caught Up!</h4>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>No overdue invoices right now.</p>
                </div>
              ) : (
                <div style={{ maxHeight: '340px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {overdueQueue.map((item) => (
                    <div
                      key={item.bill_id}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        background: 'var(--bg-card)', padding: '0.9rem 1rem',
                        borderRadius: '12px', border: '1px solid var(--border-color)',
                        borderLeft: '4px solid #ef4444',
                        flexWrap: 'wrap', gap: '0.65rem',
                        boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
                          <span style={{ fontWeight: 800, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{item.customer_name}</span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{item.invoice_number}</span>
                        </div>
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                          Due: <strong style={{ color: '#ef4444', fontFamily: 'var(--font-mono)' }}>{formatCurrency(currencySymbol, item.balance_due)}</strong>
                          {item.days_overdue > 0 && (
                            <span style={{ marginLeft: '0.5rem', color: '#f59e0b', fontWeight: 700 }}>
                              · {item.days_overdue}d past due
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="client-act-btn is-wa"
                        style={{ padding: '0.42rem 0.9rem', width: 'auto', flex: 'none', borderRadius: '10px' }}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{
                background: 'rgba(16, 185, 129, 0.07)', border: '1px solid rgba(16, 185, 129, 0.22)',
                borderRadius: '14px', padding: '1.1rem 1.25rem',
                display: 'flex', alignItems: 'flex-start', gap: '0.85rem',
              }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(16,185,129,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ShieldCheck size={20} style={{ color: '#10b981' }} />
                </div>
                <div>
                  <h4 style={{ margin: '0 0 0.3rem', fontSize: '0.95rem', color: '#10b981', fontWeight: 850 }}>Automated Nightly Backups Active</h4>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
                    Full database snapshot every night → <code style={{ background: 'var(--surface-muted)', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>backups/</code> folder. Keeps 30-day history.
                  </p>
                </div>
              </div>

              {backupSuccessMsg && (
                <div style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)', padding: '0.75rem 1rem', borderRadius: '12px', fontSize: '0.82rem', fontWeight: 750, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Check size={16} /> {backupSuccessMsg}
                </div>
              )}

              <div style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: 'var(--bg-card)', padding: '1.1rem 1.25rem',
                borderRadius: '14px', border: '1px solid var(--border-color)',
                boxShadow: '0 1px 6px rgba(0,0,0,0.04)', flexWrap: 'wrap', gap: '1rem',
              }}>
                <div>
                  <h5 style={{ margin: '0 0 0.25rem', fontSize: '0.92rem', fontWeight: 800, color: 'var(--text-primary)' }}>Run Manual Snapshot</h5>
                  <p style={{ margin: 0, fontSize: '0.76rem', color: 'var(--text-secondary)' }}>Create an extra backup before making big edits.</p>
                </div>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ width: 'auto', padding: '0.65rem 1.25rem', fontSize: '0.84rem', display: 'inline-flex', alignItems: 'center', gap: '0.45rem', borderRadius: '12px' }}
                  disabled={backupRunning}
                  onClick={handleRunBackupNow}
                >
                  <HardDriveDownload size={16} /> {backupRunning ? 'Backing up…' : 'Backup Now'}
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

