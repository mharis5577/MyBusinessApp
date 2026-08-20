import React, { useState, useEffect } from 'react';
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

  return (
    <div className="client-modal-overlay" onClick={onClose}>
      <div
        className="client-modal-card"
        style={{ maxWidth: '680px', padding: '1.5rem' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.85rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
            <div style={{ width: '2rem', height: '2rem', borderRadius: 8, background: 'rgba(45, 212, 191, 0.15)', color: 'var(--accent-teal)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Zap size={18} />
            </div>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Executive Business Reports & Automation</h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0 }}>Daily, Weekly, Monthly & Custom Date Profit Reports, Overdue Reminders, and Auto-Backups.</p>
            </div>
          </div>
          <button type="button" className="btn-secondary" style={{ width: 'auto', padding: '0.35rem 0.55rem' }} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Main Tab Switcher */}
        <div className="chart-pill-group" style={{ marginBottom: '1.25rem', width: '100%', display: 'flex' }}>
          <button
            type="button"
            className={`chart-pill-btn${activeTab === 'brief' ? ' is-active' : ''}`}
            style={{ flex: 1, textAlign: 'center', padding: '0.45rem' }}
            onClick={() => setActiveTab('brief')}
          >
            📊 Business Brief & Profit
          </button>
          <button
            type="button"
            className={`chart-pill-btn${activeTab === 'reminders' ? ' is-active' : ''}`}
            style={{ flex: 1, textAlign: 'center', padding: '0.45rem' }}
            onClick={() => setActiveTab('reminders')}
          >
            ⏰ Overdue Queue ({overdueQueue.length})
          </button>
          <button
            type="button"
            className={`chart-pill-btn${activeTab === 'backup' ? ' is-active' : ''}`}
            style={{ flex: 1, textAlign: 'center', padding: '0.45rem' }}
            onClick={() => setActiveTab('backup')}
          >
            🛡️ Auto-Backups
          </button>
        </div>

        {/* TAB 1: EXECUTIVE BUSINESS BRIEF & PROFIT */}
        {activeTab === 'brief' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {/* Period Switcher Pills */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div className="chart-pill-group" style={{ margin: 0 }}>
                <button
                  type="button"
                  className={`chart-pill-btn${period === 'today' ? ' is-active' : ''}`}
                  onClick={() => handlePeriodChange('today')}
                >
                  Today
                </button>
                <button
                  type="button"
                  className={`chart-pill-btn${period === 'week' ? ' is-active' : ''}`}
                  onClick={() => handlePeriodChange('week')}
                >
                  Weekly (7D)
                </button>
                <button
                  type="button"
                  className={`chart-pill-btn${period === 'month' ? ' is-active' : ''}`}
                  onClick={() => handlePeriodChange('month')}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  className={`chart-pill-btn${period === 'all' ? ' is-active' : ''}`}
                  onClick={() => handlePeriodChange('all')}
                >
                  All Time
                </button>
                <button
                  type="button"
                  className={`chart-pill-btn${period === 'custom' ? ' is-active' : ''}`}
                  onClick={() => handlePeriodChange('custom')}
                >
                  Custom Dates
                </button>
              </div>

              <span style={{ fontSize: '0.78rem', color: 'var(--accent-teal)', fontWeight: 700 }}>
                {businessBrief?.dateRangeLabel || ''}
              </span>
            </div>

            {/* Custom Date Range Picker */}
            {period === 'custom' && (
              <form onSubmit={handleCustomApply} style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-end', background: 'var(--surface-muted)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border-color)', flexWrap: 'wrap' }}>
                <div className="form-group" style={{ margin: 0, flex: '1 1 140px' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Start Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group" style={{ margin: 0, flex: '1 1 140px' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>End Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn-primary" style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.82rem' }}>
                  Apply Dates
                </button>
              </form>
            )}

            {businessBrief && (
              <>
                {/* Metrics Highlights */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.65rem' }}>
                  <div style={{ background: 'var(--surface-muted)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 650 }}>Online Sales</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--text-primary)', marginTop: 2 }}>
                      {formatCurrency(currencySymbol, businessBrief.metrics?.totalSales || 0)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{businessBrief.metrics?.salesCount || 0} orders</div>
                  </div>

                  <div style={{ background: 'var(--surface-muted)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 650 }}>Saudia Buying</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f43f5e', marginTop: 2 }}>
                      {formatCurrency(currencySymbol, businessBrief.metrics?.totalBuying || 0)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{businessBrief.metrics?.buyingCount || 0} purchases</div>
                  </div>

                  <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '0.75rem', borderRadius: 8, border: '1px solid rgba(16, 185, 129, 0.25)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--success)', fontWeight: 650 }}>Operating Profit</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--success)', marginTop: 2 }}>
                      {formatCurrency(currencySymbol, businessBrief.metrics?.netProfit || 0)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--success)', fontWeight: 700 }}>{businessBrief.metrics?.profitMarginPct || '0.0'}% margin</div>
                  </div>

                  <div style={{ background: 'var(--surface-muted)', padding: '0.75rem', borderRadius: 8, border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 650 }}>Collections In</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--accent-teal)', marginTop: 2 }}>
                      {formatCurrency(currencySymbol, businessBrief.metrics?.totalCashCollected || 0)}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Cash received</div>
                  </div>
                </div>

                {/* Pre-formatted WhatsApp text box */}
                <div style={{ position: 'relative' }}>
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>WhatsApp Brief Message ({businessBrief.periodTitle})</span>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ready to share</span>
                  </label>
                  <pre
                    style={{
                      background: 'rgba(0, 0, 0, 0.4)',
                      padding: '1rem',
                      borderRadius: 8,
                      border: '1px solid var(--border-color)',
                      fontSize: '0.82rem',
                      fontFamily: 'var(--font-mono, monospace)',
                      color: 'var(--text-primary)',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      maxHeight: '180px',
                      overflowY: 'auto',
                      margin: 0,
                    }}
                  >
                    {businessBrief.messageText}
                  </pre>
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                  <button
                    type="button"
                    className="btn-primary"
                    style={{ flex: 1, background: '#25d366', borderColor: '#25d366', color: '#ffffff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.45rem' }}
                    onClick={handleSendBriefWhatsApp}
                  >
                    <MessageCircle size={16} /> Send via WhatsApp
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ width: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
                    onClick={handleCopyBrief}
                  >
                    {copied ? <Check size={16} style={{ color: 'var(--success)' }} /> : <Copy size={16} />}
                    {copied ? 'Copied!' : 'Copy Text'}
                  </button>

                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ width: 'auto', padding: '0.55rem' }}
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

        {/* TAB 2: OVERDUE REMINDERS QUEUE */}
        {activeTab === 'reminders' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0 }}>
                Unpaid customer invoices requiring follow-up.
              </p>
              <span className="dash-pill-badge" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#f87171' }}>
                {overdueQueue.length} Pending Invoices
              </span>
            </div>

            {overdueQueue.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', background: 'var(--surface-muted)', borderRadius: 8 }}>
                <Check size={28} style={{ color: 'var(--success)', margin: '0 auto 0.5rem' }} />
                <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem' }}>All Caught Up!</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>There are no overdue unpaid invoices in the system right now.</p>
              </div>
            ) : (
              <div style={{ maxHeight: '320px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                {overdueQueue.map((item) => (
                  <div
                    key={item.bill_id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      background: 'var(--surface-muted)',
                      padding: '0.85rem 1rem',
                      borderRadius: 8,
                      border: '1px solid var(--border-color)',
                      flexWrap: 'wrap',
                      gap: '0.5rem',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>{item.customer_name}</span>
                        <span className="invoice-mono" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{item.invoice_number}</span>
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                        Due: <strong style={{ color: '#f87171' }}>{formatCurrency(currencySymbol, item.balance_due)}</strong>
                        {item.days_overdue > 0 && (
                          <span style={{ marginLeft: '0.5rem', color: '#f59e0b', fontWeight: 700 }}>
                            ({item.days_overdue} days past due)
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="client-act-btn is-wa"
                      style={{ padding: '0.4rem 0.85rem', width: 'auto', flex: 'none' }}
                      onClick={() => handleSendReminder(item)}
                    >
                      <MessageCircle size={14} /> 1-Tap WA Reminder
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: AUTO-BACKUP STATUS */}
        {activeTab === 'backup' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.25)', borderRadius: 10, padding: '1rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
              <ShieldCheck size={24} style={{ color: 'var(--success)', flexShrink: 0, marginTop: 2 }} />
              <div>
                <h4 style={{ margin: '0 0 0.25rem', fontSize: '0.95rem', color: 'var(--success)', fontWeight: 800 }}>Automated Nightly Backups Active</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
                  The backend automatically creates a full database backup snapshot every night to the <code>backups/</code> folder and safely keeps a 30-day historical archive.
                </p>
              </div>
            </div>

            {backupSuccessMsg && (
              <div style={{ background: 'rgba(16, 185, 129, 0.15)', color: 'var(--success)', padding: '0.65rem 0.85rem', borderRadius: 8, fontSize: '0.82rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Check size={16} /> {backupSuccessMsg}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-muted)', padding: '1rem', borderRadius: 10, border: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '0.75rem' }}>
              <div>
                <h5 style={{ margin: '0 0 0.2rem', fontSize: '0.9rem', fontWeight: 700 }}>Run Manual Snapshot Now</h5>
                <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>Instantly create an extra backup archive before making big edits.</p>
              </div>

              <button
                type="button"
                className="btn-primary"
                style={{ width: 'auto', padding: '0.5rem 1rem', fontSize: '0.82rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}
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
  );
}
