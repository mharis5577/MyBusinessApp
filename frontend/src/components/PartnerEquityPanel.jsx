import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  Users2,
  DollarSign,
  TrendingUp,
  Download,
  FileSpreadsheet,
  Share2,
  CheckCircle2,
  Flag,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Calendar,
  Wallet,
  PlusCircle,
  Trash2,
  HelpCircle,
  Clock,
  Send,
  Building2,
  Layers,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  BarChart3,
  PieChart,
  MessageCircle,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import { formatCurrency, formatPkMoney, pakistanToday } from '../utils/pakistan';
import { playSuccessChime, playTapSound } from '../utils/audioEffects';
import { downloadPartnerReportPdf, downloadPartnerReportCsv } from '../utils/tableExport';
import EmptyState from './EmptyState';
import PartnerEquityCharts from './PartnerEquityCharts';
import PartnerWhatsAppDigestModal from './PartnerWhatsAppDigestModal';

export default function PartnerEquityPanel({ currencySymbol = 'Rs.', settings = {} }) {
  const toast = useToast();

  // State
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [partnersData, setPartnersData] = useState({ partners: [], business_totals: {}, last_settlement: null });
  const [payouts, setPayouts] = useState([]);
  const [settlements, setSettlements] = useState([]);

  // Calculator / Time Range
  const [timeRange, setTimeRange] = useState('unsettled'); // 'today' | '7d' | '30d' | 'month' | 'unsettled' | 'custom'
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [calcData, setCalcData] = useState({
    summary: { total_sales: 0, total_buying: 0, net_profit: 0, profit_margin_pct: 0 },
    partner_splits: [],
    orders: [],
    period: {},
  });

  // Modals
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [showDigestModal, setShowDigestModal] = useState(false);
  const [payoutForm, setPayoutForm] = useState({
    partner_id: '',
    amount: '',
    transaction_date: pakistanToday(),
    payment_method: 'Meezan Bank Transfer',
    notes: '',
    type: 'payout',
  });
  const [submittingPayout, setSubmittingPayout] = useState(false);

  const [showSettleModal, setShowSettleModal] = useState(false);
  const [settleNotes, setSettleNotes] = useState('');
  const [submittingSettle, setSubmittingSettle] = useState(false);

  const [activeSubTab, setActiveSubTab] = useState('breakdown'); // 'breakdown' | 'analytics' | 'payouts' | 'settlements'
  const [searchQuery, setSearchQuery] = useState('');

  // 1. Fetch Partner Profiles & Lifetime Overview
  const fetchPartners = useCallback(async () => {
    try {
      const res = await apiFetch('/api/partners');
      const data = await res.json().catch(() => ({}));
      if (data && Array.isArray(data.partners)) {
        setPartnersData(data);
        if (!payoutForm.partner_id && data.partners.length > 0) {
          setPayoutForm((prev) => ({ ...prev, partner_id: data.partners[0].id }));
        }
      }
    } catch (e) {
      console.error('Failed to load partner accounts:', e);
    }
  }, [payoutForm.partner_id]);

  // 2. Fetch Payouts & Settlements
  const fetchAuxData = useCallback(async () => {
    try {
      const [payoutsRes, settlRes] = await Promise.all([
        apiFetch('/api/partners/payouts'),
        apiFetch('/api/partners/settlements'),
      ]);
      const pData = await payoutsRes.json().catch(() => []);
      const sData = await settlRes.json().catch(() => []);
      if (Array.isArray(pData)) setPayouts(pData);
      if (Array.isArray(sData)) setSettlements(sData);
    } catch (e) {
      console.error('Failed to load payouts/settlements:', e);
    }
  }, []);

  // 3. Compute dynamic period profit breakdown
  const fetchBreakdown = useCallback(async () => {
    try {
      const today = pakistanToday();
      let url = '/api/partners/profit-breakdown';
      const params = new URLSearchParams();

      if (timeRange === 'unsettled') {
        params.append('sinceLastSettlement', 'true');
      } else if (timeRange === 'today') {
        params.append('startDate', today);
        params.append('endDate', today);
      } else if (timeRange === '7d') {
        const d = new Date();
        d.setDate(d.getDate() - 6);
        params.append('startDate', d.toISOString().slice(0, 10));
        params.append('endDate', today);
      } else if (timeRange === '30d') {
        const d = new Date();
        d.setDate(d.getDate() - 29);
        params.append('startDate', d.toISOString().slice(0, 10));
        params.append('endDate', today);
      } else if (timeRange === 'month') {
        const now = new Date();
        const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        params.append('startDate', start);
        params.append('endDate', today);
      } else if (timeRange === 'custom') {
        if (customStart) params.append('startDate', customStart);
        if (customEnd) params.append('endDate', customEnd);
      }

      const queryString = params.toString();
      if (queryString) url += `?${queryString}`;

      const res = await apiFetch(url);
      const data = await res.json().catch(() => ({}));
      if (data && data.summary) {
        setCalcData(data);
      }
    } catch (e) {
      console.error('Failed to calculate profit breakdown:', e);
    }
  }, [timeRange, customStart, customEnd]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([fetchPartners(), fetchAuxData(), fetchBreakdown()]);
    setLoading(false);
  }, [fetchPartners, fetchAuxData, fetchBreakdown]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    fetchBreakdown();
  }, [fetchBreakdown]);

  const handleRefresh = async () => {
    playTapSound();
    setRefreshing(true);
    await Promise.all([fetchPartners(), fetchAuxData(), fetchBreakdown()]);
    setRefreshing(false);
    toast.success('Partner ledger refreshed');
  };

  // Record Payout
  const handleCreatePayout = async (e) => {
    e.preventDefault();
    if (!payoutForm.partner_id || !payoutForm.amount || Number(payoutForm.amount) <= 0) {
      toast.error('Please enter a valid amount and partner.');
      return;
    }
    setSubmittingPayout(true);
    try {
      await apiFetch('/api/partners/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payoutForm),
      });
      playSuccessChime();
      toast.success('Payout transaction recorded successfully!');
      setShowPayoutModal(false);
      setPayoutForm((prev) => ({ ...prev, amount: '', notes: '' }));
      await Promise.all([fetchPartners(), fetchAuxData()]);
    } catch (err) {
      toast.error('Failed to record payout: ' + err.message);
    } finally {
      setSubmittingPayout(false);
    }
  };

  const handleDeletePayout = async (id) => {
    if (!window.confirm('Delete this payout record?')) return;
    try {
      await apiFetch(`/api/partners/payouts/${id}`, { method: 'DELETE' });
      toast.success('Payout deleted.');
      await Promise.all([fetchPartners(), fetchAuxData()]);
    } catch (err) {
      toast.error('Error deleting payout: ' + err.message);
    }
  };

  // Create Settlement Marker Checkpoint
  const handleCreateSettlement = async () => {
    if (calcData.orders.length === 0) {
      toast.error('No orders found in current selection to settle.');
      return;
    }
    setSubmittingSettle(true);
    try {
      const summary = calcData.summary || {};
      const splits = calcData.partner_splits || [];
      const nomi = splits.find((s) => s.name.toLowerCase().includes('nomi')) || splits[0] || {};
      const haris = splits.find((s) => s.name.toLowerCase().includes('haris')) || splits[1] || {};

      const payload = {
        period_start: calcData.period?.startDate || '',
        period_end: calcData.period?.endDate || pakistanToday(),
        last_bill_id: summary.max_bill_id || null,
        last_bill_date: calcData.period?.endDate || pakistanToday(),
        total_sales: summary.total_sales || 0,
        total_buying: summary.total_buying || 0,
        net_profit: summary.net_profit || 0,
        nomi_share: nomi.share_amount || 0,
        haris_share: haris.share_amount || 0,
        notes: settleNotes || `Settled 50/50 up to ${calcData.period?.endDate || 'date'}`,
        created_by: 'Owner',
      };

      await apiFetch('/api/partners/settlements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      playSuccessChime();
      toast.success('Settlement marker saved! Profit dividend checkpoint locked.');
      setShowSettleModal(false);
      setSettleNotes('');
      await Promise.all([fetchPartners(), fetchAuxData(), fetchBreakdown()]);
    } catch (err) {
      toast.error('Failed to create settlement checkpoint: ' + err.message);
    } finally {
      setSubmittingSettle(false);
    }
  };

  const handleDeleteSettlement = async (id) => {
    if (!window.confirm('Delete this settlement checkpoint? This will revert the calculation baseline.')) return;
    try {
      await apiFetch(`/api/partners/settlements/${id}`, { method: 'DELETE' });
      toast.success('Settlement checkpoint removed.');
      await Promise.all([fetchPartners(), fetchAuxData(), fetchBreakdown()]);
    } catch (err) {
      toast.error('Error deleting checkpoint: ' + err.message);
    }
  };

  // Export PDF Statement
  const handleDownloadPdf = async () => {
    try {
      playTapSound();
      toast.info('Generating Partner Profit & Settlement PDF...');
      const summary = calcData.summary || {};
      const splits = calcData.partner_splits || [];

      const enrichedSplits = splits.map((s) => {
        const fullP = (partnersData.partners || []).find((p) => p.id === s.id || p.name === s.name);
        return {
          ...s,
          current_balance: fullP?.current_balance || 0,
        };
      });

      await downloadPartnerReportPdf({
        periodLabel:
          timeRange === 'unsettled'
            ? 'Unsettled Orders (Since Last Checkpoint)'
            : timeRange === 'today'
            ? 'Today'
            : timeRange === '7d'
            ? 'Last 7 Days'
            : timeRange === '30d'
            ? 'Last 30 Days'
            : timeRange === 'month'
            ? 'This Month'
            : 'Custom Range',
        dateRange: `${calcData.period?.startDate || ''} to ${calcData.period?.endDate || ''}`,
        totalSales: summary.total_sales || 0,
        totalBuying: summary.total_buying || 0,
        netProfit: summary.net_profit || 0,
        profitMarginPct: summary.profit_margin_pct || 0,
        partners: enrichedSplits,
        orders: calcData.orders || [],
        settlementInfo: calcData.last_settlement,
        currencySymbol,
        filename: `Partner_Profit_50-50_${pakistanToday()}.pdf`,
      });
      playSuccessChime();
      toast.success('Partner Statement PDF downloaded!');
    } catch (err) {
      toast.error('Failed to generate PDF: ' + err.message);
    }
  };

  // Export CSV
  const handleDownloadCsv = async () => {
    try {
      playTapSound();
      const summary = calcData.summary || {};
      await downloadPartnerReportCsv({
        periodLabel: timeRange,
        totalSales: summary.total_sales || 0,
        totalBuying: summary.total_buying || 0,
        netProfit: summary.net_profit || 0,
        partners: calcData.partner_splits || [],
        orders: calcData.orders || [],
        currencySymbol,
        filename: `Partner_Profit_${pakistanToday()}.csv`,
      });
      toast.success('Spreadsheet exported!');
    } catch (err) {
      toast.error('Failed to export CSV: ' + err.message);
    }
  };

  // Share via WhatsApp
  const handleShareWhatsApp = (partnerPhone) => {
    const summary = calcData.summary || {};
    const splits = calcData.partner_splits || [];
    const dateRangeStr = `${calcData.period?.startDate || ''} to ${calcData.period?.endDate || ''}`;

    const splitsText = splits
      .map((s) => `  • *${s.name} (${s.profit_share_pct}%)*: ${currencySymbol} ${formatPkMoney(s.share_amount)}`)
      .join('\n');

    const msg = `📊 *ELITE CHOCOLATE · PARTNER PROFIT STATEMENT*
📅 *Period:* ${dateRangeStr}
💰 *Total Online Sales:* ${currencySymbol} ${formatPkMoney(summary.total_sales)}
📦 *Saudia Purchases:* ${currencySymbol} ${formatPkMoney(summary.total_buying)}
✨ *Net Operating Profit:* ${currencySymbol} ${formatPkMoney(summary.net_profit)} (${summary.profit_margin_pct}% margin)
━━━━━━━━━━━━━━━━━━━━
👥 *50/50 Profit Division:*
${splitsText}
━━━━━━━━━━━━━━━━━━━━
📦 *Orders / Shipments Included:* ${calcData.orders?.length || 0} orders
✅ Accrual verified & synced.`;

    const cleanPhone = (partnerPhone || '').replace(/\D/g, '');
    const url = cleanPhone
      ? `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    window.open(url, '_blank');
  };

  // Filtered orders list by search
  const filteredOrders = useMemo(() => {
    if (!searchQuery.trim()) return calcData.orders || [];
    const q = searchQuery.toLowerCase();
    return (calcData.orders || []).filter(
      (o) =>
        (o.customer_name || '').toLowerCase().includes(q) ||
        (o.invoice_number || '').toLowerCase().includes(q) ||
        (o.notes || '').toLowerCase().includes(q)
    );
  }, [calcData.orders, searchQuery]);

  if (loading) {
    return (
      <div className="tab-content glass-panel" style={{ padding: '2.5rem', textAlign: 'center' }}>
        <RefreshCw size={28} className="spin" style={{ color: 'var(--accent-teal)', marginBottom: '0.8rem' }} />
        <p style={{ color: 'var(--text-muted)' }}>Calculating 50/50 Partner Division & Ledgers...</p>
      </div>
    );
  }

  const partners = partnersData.partners || [];
  const nomi = partners.find((p) => p.name.toLowerCase().includes('nomi')) || partners[0];
  const haris = partners.find((p) => p.name.toLowerCase().includes('haris')) || partners[1];
  const summary = calcData.summary || {};
  const lastSettlement = partnersData.last_settlement;

  return (
    <div className="tab-content fade-in partner-equity-panel" style={{ paddingBottom: '3.5rem' }}>
      {/* 1. Header Section */}
      <div className="panel-header" style={{ marginBottom: '1.25rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
            <span className="badge badge-teal" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
              50/50 Equity Divider
            </span>
            <span className="badge badge-indigo" style={{ fontSize: '0.72rem', fontWeight: 700 }}>
              Nomi & Haris
            </span>
          </div>
          <h2 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users2 size={24} style={{ color: 'var(--accent-teal)' }} /> Partner Profit & Dividends
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.84rem', margin: '0.2rem 0 0 0' }}>
            Automated 50/50 profit recording, shipment-level profit breakdown, and settlement markers.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <button
            type="button"
            className="btn-secondary"
            onClick={handleRefresh}
            disabled={refreshing}
            style={{ padding: '0.45rem 0.8rem', fontSize: '0.82rem' }}
            title="Refresh calculations"
          >
            <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
            <span>Sync</span>
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={handleDownloadPdf}
            style={{ padding: '0.45rem 0.8rem', fontSize: '0.82rem', borderColor: 'var(--accent-teal)' }}
          >
            <Download size={14} style={{ color: 'var(--accent-teal)' }} />
            <span>Export Statement (PDF)</span>
          </button>

          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              playTapSound();
              setShowDigestModal(true);
            }}
            style={{ padding: '0.45rem 0.8rem', fontSize: '0.82rem', borderColor: '#25D366', color: '#25D366' }}
          >
            <MessageCircle size={14} />
            <span>1-Tap WA Digest</span>
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowPayoutModal(true)}
            style={{ padding: '0.45rem 0.9rem', fontSize: '0.82rem' }}
          >
            <Wallet size={14} />
            <span>Record Payout</span>
          </button>
        </div>
      </div>

      {/* 2. Partner Split KPI Cards (50/50 Nomi & Haris) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1rem',
          marginBottom: '1.5rem',
        }}
      >
        {/* Nomi Card */}
        {nomi && (
          <div
            className="glass-panel"
            style={{
              padding: '1.2rem',
              borderRadius: 'var(--radius-lg)',
              borderTop: '4px solid #3b82f6',
              background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#3b82f6', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Partner 1 ({nomi.profit_share_pct || 50}% Share)
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0.1rem 0' }}>{nomi.name}</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{nomi.bank_name || 'Bank Meezan'}</span>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleShareWhatsApp(nomi.phone)}
                style={{ padding: '0.3rem 0.55rem', fontSize: '0.72rem', borderColor: '#25D366' }}
                title="Send update to Nomi"
              >
                <Send size={12} style={{ color: '#25D366' }} /> WhatsApp
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.6rem' }}>
              <div style={{ padding: '0.6rem', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.03)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Unsettled Profit</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--accent-teal)' }}>
                  {currencySymbol} {formatPkMoney(nomi.unsettled_earned_share || 0)}
                </div>
              </div>
              <div style={{ padding: '0.6rem', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.03)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Available Balance</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--status-paid)' }}>
                  {currencySymbol} {formatPkMoney(nomi.current_balance || 0)}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.75rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border-subtle)' }}>
              <span>Lifetime Earned: <strong>{currencySymbol} {formatPkMoney(nomi.lifetime_earned_share || 0)}</strong></span>
              <span>Paid Out: <strong style={{ color: 'var(--status-overdue)' }}>{currencySymbol} {formatPkMoney(nomi.total_payouts || 0)}</strong></span>
            </div>
          </div>
        )}

        {/* Haris Card */}
        {haris && (
          <div
            className="glass-panel"
            style={{
              padding: '1.2rem',
              borderRadius: 'var(--radius-lg)',
              borderTop: '4px solid var(--accent-teal)',
              background: 'linear-gradient(135deg, rgba(20, 184, 166, 0.05) 0%, rgba(255, 255, 255, 0.02) 100%)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-teal)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Partner 2 ({haris.profit_share_pct || 50}% Share)
                </div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0.1rem 0' }}>{haris.name}</h3>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{haris.bank_name || 'Meezan / HBL'}</span>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleShareWhatsApp(haris.phone)}
                style={{ padding: '0.3rem 0.55rem', fontSize: '0.72rem', borderColor: '#25D366' }}
                title="Send update to Haris"
              >
                <Send size={12} style={{ color: '#25D366' }} /> WhatsApp
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.6rem', marginTop: '0.6rem' }}>
              <div style={{ padding: '0.6rem', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.03)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Unsettled Profit</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--accent-teal)' }}>
                  {currencySymbol} {formatPkMoney(haris.unsettled_earned_share || 0)}
                </div>
              </div>
              <div style={{ padding: '0.6rem', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.03)' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Available Balance</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--status-paid)' }}>
                  {currencySymbol} {formatPkMoney(haris.current_balance || 0)}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.73rem', color: 'var(--text-muted)', marginTop: '0.75rem', paddingTop: '0.6rem', borderTop: '1px solid var(--border-subtle)' }}>
              <span>Lifetime Earned: <strong>{currencySymbol} {formatPkMoney(haris.lifetime_earned_share || 0)}</strong></span>
              <span>Paid Out: <strong style={{ color: 'var(--status-overdue)' }}>{currencySymbol} {formatPkMoney(haris.total_payouts || 0)}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Settlement Marker Banner (If Active) */}
      {lastSettlement && (
        <div
          className="glass-panel"
          style={{
            padding: '0.85rem 1.1rem',
            marginBottom: '1.25rem',
            borderRadius: 'var(--radius-md)',
            borderLeft: '4px solid #f59e0b',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.6rem',
            background: 'rgba(245, 158, 11, 0.05)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <Flag size={18} style={{ color: '#f59e0b' }} />
            <div>
              <div style={{ fontSize: '0.82rem', fontWeight: 700 }}>
                Active Settlement Checkpoint: <code style={{ color: '#d97706' }}>{lastSettlement.settlement_code}</code>
              </div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Settled up to {lastSettlement.period_end} · Net Profit Settled: {currencySymbol} {formatPkMoney(lastSettlement.net_profit)} ({lastSettlement.notes || 'Checkpoint'})
              </div>
            </div>
          </div>
          <span className="badge badge-amber" style={{ fontSize: '0.72rem' }}>
            Checkpoint Active
          </span>
        </div>
      )}

      {/* 4. Custom Profit Calculator Filter Bar */}
      <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1.25rem', borderRadius: 'var(--radius-lg)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '0.9rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
            <Calendar size={16} style={{ color: 'var(--accent-teal)' }} />
            <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>Profit Calculator & Date Filter</span>
          </div>

          {/* Time Range Pills */}
          <div className="chart-pill-group" role="group" aria-label="Time Range">
            <button
              type="button"
              className={`chart-pill-btn${timeRange === 'unsettled' ? ' is-active' : ''}`}
              onClick={() => setTimeRange('unsettled')}
              title="Show only new orders since last settlement checkpoint"
            >
              🚩 Unsettled Only
            </button>
            <button
              type="button"
              className={`chart-pill-btn${timeRange === 'today' ? ' is-active' : ''}`}
              onClick={() => setTimeRange('today')}
            >
              Today
            </button>
            <button
              type="button"
              className={`chart-pill-btn${timeRange === '7d' ? ' is-active' : ''}`}
              onClick={() => setTimeRange('7d')}
            >
              7 Days
            </button>
            <button
              type="button"
              className={`chart-pill-btn${timeRange === 'month' ? ' is-active' : ''}`}
              onClick={() => setTimeRange('month')}
            >
              This Month
            </button>
            <button
              type="button"
              className={`chart-pill-btn${timeRange === '30d' ? ' is-active' : ''}`}
              onClick={() => setTimeRange('30d')}
            >
              30 Days
            </button>
            <button
              type="button"
              className={`chart-pill-btn${timeRange === 'custom' ? ' is-active' : ''}`}
              onClick={() => setTimeRange('custom')}
            >
              Custom
            </button>
          </div>
        </div>

        {/* Custom Start / End Date Pickers */}
        {timeRange === 'custom' && (
          <div style={{ display: 'flex', gap: '0.8rem', alignItems: 'center', marginBottom: '0.9rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>From:</label>
              <input
                type="date"
                className="input"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                style={{ padding: '0.35rem 0.55rem', fontSize: '0.8rem', width: 'auto' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 600 }}>To:</label>
              <input
                type="date"
                className="input"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={{ padding: '0.35rem 0.55rem', fontSize: '0.8rem', width: 'auto' }}
              />
            </div>
          </div>
        )}

        {/* Dynamic Period Summary KPIs */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: '0.7rem',
            paddingTop: '0.8rem',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>PERIOD SALES</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--status-paid)' }}>
              {currencySymbol} {formatPkMoney(summary.total_sales || 0)}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{summary.sales_count || 0} orders</div>
          </div>

          <div style={{ padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>BUYING / PURCHASES</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--status-overdue)' }}>
              {currencySymbol} {formatPkMoney(summary.total_buying || 0)}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{summary.buying_count || 0} bills</div>
          </div>

          <div style={{ padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-md)', background: 'rgba(0,0,0,0.02)' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600 }}>NET PERIOD PROFIT</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--accent-teal)' }}>
              {currencySymbol} {formatPkMoney(summary.net_profit || 0)}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--accent-teal)' }}>{summary.profit_margin_pct || 0}% margin</div>
          </div>

          <div style={{ padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-md)', background: 'rgba(59, 130, 246, 0.06)' }}>
            <div style={{ fontSize: '0.68rem', color: '#3b82f6', fontWeight: 700 }}>NOMI 50% SHARE</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#3b82f6' }}>
              {currencySymbol} {formatPkMoney((summary.net_profit || 0) * 0.5)}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Period Dividend</div>
          </div>

          <div style={{ padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-md)', background: 'rgba(20, 184, 166, 0.06)' }}>
            <div style={{ fontSize: '0.68rem', color: 'var(--accent-teal)', fontWeight: 700 }}>HARIS 50% SHARE</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--accent-teal)' }}>
              {currencySymbol} {formatPkMoney((summary.net_profit || 0) * 0.5)}
            </div>
            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Period Dividend</div>
          </div>
        </div>

        {/* Mark as Settled Action Bar */}
        <div
          style={{
            marginTop: '0.9rem',
            paddingTop: '0.8rem',
            borderTop: '1px dashed var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '0.6rem',
          }}
        >
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            Ready to finalize and freeze this period? Add a settlement marker so subsequent calculations start cleanly from this point.
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowSettleModal(true)}
            style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem', background: '#d97706', borderColor: '#d97706' }}
            disabled={calcData.orders.length === 0}
          >
            <Flag size={14} />
            <span>Mark as Settled / Checkpoint</span>
          </button>
        </div>
      </div>

      {/* 5. Sub-Tabs (Itemized Orders | Visual Analytics | Payouts Ledger | Checkpoints History) */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.4rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn-secondary${activeSubTab === 'breakdown' ? ' active' : ''}`}
          onClick={() => {
            playTapSound();
            setActiveSubTab('breakdown');
          }}
          style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem', fontWeight: activeSubTab === 'breakdown' ? 700 : 500 }}
        >
          <Layers size={14} /> Itemized Shipment / Order Breakdown ({calcData.orders?.length || 0})
        </button>

        <button
          type="button"
          className={`btn-secondary${activeSubTab === 'analytics' ? ' active' : ''}`}
          onClick={() => {
            playTapSound();
            setActiveSubTab('analytics');
          }}
          style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem', fontWeight: activeSubTab === 'analytics' ? 700 : 500, borderColor: activeSubTab === 'analytics' ? 'var(--accent-teal)' : undefined }}
        >
          <BarChart3 size={14} style={{ color: 'var(--accent-teal)' }} /> Visual Analytics & Growth Charts
        </button>

        <button
          type="button"
          className={`btn-secondary${activeSubTab === 'payouts' ? ' active' : ''}`}
          onClick={() => {
            playTapSound();
            setActiveSubTab('payouts');
          }}
          style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem', fontWeight: activeSubTab === 'payouts' ? 700 : 500 }}
        >
          <Wallet size={14} /> Payouts & Drawings Ledger ({payouts.length})
        </button>

        <button
          type="button"
          className={`btn-secondary${activeSubTab === 'settlements' ? ' active' : ''}`}
          onClick={() => {
            playTapSound();
            setActiveSubTab('settlements');
          }}
          style={{ padding: '0.4rem 0.8rem', fontSize: '0.82rem', fontWeight: activeSubTab === 'settlements' ? 700 : 500 }}
        >
          <Flag size={14} /> Settlement Markers History ({settlements.length})
        </button>
      </div>

      {/* Sub-Tab 0: Visual Analytics & Interactive Growth Charts */}
      {activeSubTab === 'analytics' && (
        <PartnerEquityCharts
          orders={calcData.orders || []}
          summary={calcData.summary || {}}
          partners={partnersData.partners || []}
          currencySymbol={currencySymbol}
        />
      )}

      {/* Sub-Tab 1: Itemized Order & Shipment Breakdown Table */}
      {activeSubTab === 'breakdown' && (
        <div className="glass-panel" style={{ padding: '1rem', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <input
              type="search"
              placeholder="Search by client, invoice # or note..."
              className="input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ maxWidth: '320px', padding: '0.4rem 0.7rem', fontSize: '0.82rem' }}
            />
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <button type="button" className="btn-secondary" onClick={handleDownloadCsv} style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}>
                <FileSpreadsheet size={13} /> Export Excel
              </button>
            </div>
          </div>

          <div className="table-responsive" style={{ maxHeight: '420px', overflowY: 'auto' }}>
            <table className="data-table" style={{ width: '100%', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Invoice #</th>
                  <th>Type</th>
                  <th>Party / Shipment Description</th>
                  <th style={{ textAlign: 'right' }}>Sales Amount</th>
                  <th style={{ textAlign: 'right' }}>Buying Cost</th>
                  <th style={{ textAlign: 'right' }}>Profit Margin</th>
                  <th style={{ textAlign: 'center' }}>50/50 Share</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
                      No orders or shipments found for this time period.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => {
                    const isBuy = o.is_supplier || o.bill_type === 'supplier';
                    const isHelp = o.is_help || o.bill_type === 'help';
                    const halfShare = Math.round((Math.abs(o.profit_effect) / 2) * 100) / 100;

                    return (
                      <tr key={o.id}>
                        <td>{o.bill_date}</td>
                        <td>
                          <strong>{o.invoice_number}</strong>
                        </td>
                        <td>
                          <span
                            className={`badge ${
                              isBuy ? 'badge-amber' : isHelp ? 'badge-indigo' : 'badge-teal'
                            }`}
                            style={{ fontSize: '0.68rem', textTransform: 'uppercase' }}
                          >
                            {isBuy ? 'Saudia / Buying' : isHelp ? 'Help' : 'Sale'}
                          </span>
                        </td>
                        <td>
                          <div>{o.customer_name}</div>
                          {o.notes && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{o.notes}</div>}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          {isBuy || isHelp ? '—' : `${currencySymbol} ${formatPkMoney(o.total_amount)}`}
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600, color: isBuy ? 'var(--status-overdue)' : 'inherit' }}>
                          {isBuy ? `${currencySymbol} ${formatPkMoney(o.total_amount)}` : '—'}
                        </td>
                        <td
                          style={{
                            textAlign: 'right',
                            fontWeight: 700,
                            color: isHelp ? 'var(--text-muted)' : isBuy ? 'var(--status-overdue)' : 'var(--status-paid)',
                          }}
                        >
                          {isHelp
                            ? 'Rs. 0'
                            : isBuy
                            ? `−${currencySymbol} ${formatPkMoney(o.total_amount)}`
                            : `+${currencySymbol} ${formatPkMoney(o.total_amount)}`}
                        </td>
                        <td style={{ textAlign: 'center', fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                          {isHelp ? '—' : `Rs. ${formatPkMoney(halfShare)} ea.`}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-Tab 2: Payouts & Drawings Ledger */}
      {activeSubTab === 'payouts' && (
        <div className="glass-panel" style={{ padding: '1rem', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Partner Payout & Withdrawal Ledger</h3>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowPayoutModal(true)}
              style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
            >
              <PlusCircle size={13} /> Record Payout
            </button>
          </div>

          <div className="table-responsive">
            <table className="data-table" style={{ width: '100%', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Partner</th>
                  <th>Type</th>
                  <th>Method</th>
                  <th>Memo / Reference</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {payouts.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
                      No partner payouts recorded yet.
                    </td>
                  </tr>
                ) : (
                  payouts.map((p) => (
                    <tr key={p.id}>
                      <td>{p.transaction_date}</td>
                      <td>
                        <strong>{p.partner_name}</strong>
                      </td>
                      <td>
                        <span className={`badge ${p.type === 'capital_in' ? 'badge-teal' : 'badge-amber'}`} style={{ fontSize: '0.68rem' }}>
                          {p.type === 'capital_in' ? 'Investment (+)' : 'Withdrawal (−)'}
                        </span>
                      </td>
                      <td>{p.payment_method}</td>
                      <td>{p.notes || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: p.type === 'capital_in' ? 'var(--status-paid)' : 'var(--status-overdue)' }}>
                        {p.type === 'capital_in' ? '+' : '−'}{currencySymbol} {formatPkMoney(p.amount)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-icon btn-ghost is-danger"
                          onClick={() => handleDeletePayout(p.id)}
                          title="Delete payout"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Sub-Tab 3: Settlement Markers Checkpoints */}
      {activeSubTab === 'settlements' && (
        <div className="glass-panel" style={{ padding: '1rem', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem' }}>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0 }}>Settlement Checkpoint History</h3>
          </div>

          <div className="table-responsive">
            <table className="data-table" style={{ width: '100%', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Settlement Date</th>
                  <th>Period Settled</th>
                  <th style={{ textAlign: 'right' }}>Total Sales</th>
                  <th style={{ textAlign: 'right' }}>Buying Cost</th>
                  <th style={{ textAlign: 'right' }}>Net Settled Profit</th>
                  <th style={{ textAlign: 'right' }}>Nomi 50%</th>
                  <th style={{ textAlign: 'right' }}>Haris 50%</th>
                  <th>Notes</th>
                  <th style={{ textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {settlements.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
                      No settlement checkpoints created yet. Click "Mark as Settled" above to create your first milestone!
                    </td>
                  </tr>
                ) : (
                  settlements.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <code style={{ fontWeight: 700, color: '#d97706' }}>{s.settlement_code}</code>
                      </td>
                      <td>{s.settled_at?.slice(0, 10)}</td>
                      <td>{s.period_start ? `${s.period_start} to ${s.period_end}` : `Up to ${s.period_end}`}</td>
                      <td style={{ textAlign: 'right' }}>{currencySymbol} {formatPkMoney(s.total_sales)}</td>
                      <td style={{ textAlign: 'right' }}>{currencySymbol} {formatPkMoney(s.total_buying)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--accent-teal)' }}>
                        {currencySymbol} {formatPkMoney(s.net_profit)}
                      </td>
                      <td style={{ textAlign: 'right', color: '#3b82f6', fontWeight: 600 }}>
                        {currencySymbol} {formatPkMoney(s.nomi_share)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--accent-teal)', fontWeight: 600 }}>
                        {currencySymbol} {formatPkMoney(s.haris_share)}
                      </td>
                      <td>{s.notes || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn-icon btn-ghost is-danger"
                          onClick={() => handleDeleteSettlement(s.id)}
                          title="Undo settlement marker"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL 1: Record Payout */}
      {showPayoutModal && (
        <div className="more-menu-overlay" onClick={() => setShowPayoutModal(false)}>
          <div className="glass-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '440px', padding: '1.5rem', borderRadius: 'var(--radius-lg)' }}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.8rem' }}>Record Partner Payout</h3>

            <form onSubmit={handleCreatePayout}>
              <div style={{ marginBottom: '0.8rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Partner</label>
                <select
                  className="input"
                  value={payoutForm.partner_id}
                  onChange={(e) => setPayoutForm({ ...payoutForm, partner_id: e.target.value })}
                  required
                >
                  {partners.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.profit_share_pct || 50}% Share)
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '0.8rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Transaction Type</label>
                <select
                  className="input"
                  value={payoutForm.type}
                  onChange={(e) => setPayoutForm({ ...payoutForm, type: e.target.value })}
                >
                  <option value="payout">Profit Withdrawal / Payout (−)</option>
                  <option value="capital_in">Capital / Investment (+)</option>
                </select>
              </div>

              <div style={{ marginBottom: '0.8rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Amount ({currencySymbol})</label>
                <input
                  type="number"
                  step="any"
                  className="input"
                  placeholder="e.g. 50000"
                  value={payoutForm.amount}
                  onChange={(e) => setPayoutForm({ ...payoutForm, amount: e.target.value })}
                  required
                />
              </div>

              <div style={{ marginBottom: '0.8rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Date</label>
                <input
                  type="date"
                  className="input"
                  value={payoutForm.transaction_date}
                  onChange={(e) => setPayoutForm({ ...payoutForm, transaction_date: e.target.value })}
                  required
                />
              </div>

              <div style={{ marginBottom: '0.8rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Payment Method / Bank</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Meezan Bank / Cash / Raast"
                  value={payoutForm.payment_method}
                  onChange={(e) => setPayoutForm({ ...payoutForm, payment_method: e.target.value })}
                />
              </div>

              <div style={{ marginBottom: '1.2rem' }}>
                <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Notes / Memo</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Profit distribution for July batch"
                  value={payoutForm.notes}
                  onChange={(e) => setPayoutForm({ ...payoutForm, notes: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowPayoutModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submittingPayout}>
                  {submittingPayout ? 'Saving...' : 'Save Payout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Create Settlement Checkpoint */}
      {showSettleModal && (
        <div className="more-menu-overlay" onClick={() => setShowSettleModal(false)}>
          <div className="glass-panel" onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: '460px', padding: '1.5rem', borderRadius: 'var(--radius-lg)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
              <Flag size={20} style={{ color: '#d97706' }} />
              <h3 style={{ fontSize: '1.15rem', fontWeight: 800, margin: 0 }}>Create Settlement Checkpoint</h3>
            </div>

            <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              Freezes and records the profit distribution for this period. Future "Unsettled" calculations will start cleanly after this point.
            </p>

            <div style={{ background: 'rgba(0,0,0,0.03)', padding: '0.8rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.8rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
                <span>Period Net Profit:</span>
                <strong>{currencySymbol} {formatPkMoney(summary.net_profit || 0)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#3b82f6', marginBottom: '0.3rem' }}>
                <span>Nomi Share (50%):</span>
                <strong>{currencySymbol} {formatPkMoney((summary.net_profit || 0) * 0.5)}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--accent-teal)' }}>
                <span>Haris Share (50%):</span>
                <strong>{currencySymbol} {formatPkMoney((summary.net_profit || 0) * 0.5)}</strong>
              </div>
            </div>

            <div style={{ marginBottom: '1.2rem' }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: '0.3rem' }}>Settlement Memo / Notes</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Saudia shipment batch 2 distribution settled"
                value={settleNotes}
                onChange={(e) => setSettleNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn-secondary" onClick={() => setShowSettleModal(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleCreateSettlement}
                disabled={submittingSettle}
                style={{ background: '#d97706', borderColor: '#d97706' }}
              >
                {submittingSettle ? 'Creating Checkpoint...' : 'Confirm & Freeze Settlement'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 1-Tap WhatsApp Partner Digest Modal */}
      <PartnerWhatsAppDigestModal
        open={showDigestModal}
        onClose={() => setShowDigestModal(false)}
        calcData={calcData}
        partners={partnersData.partners || []}
        currencySymbol={currencySymbol}
        settings={settings}
        latestSettlement={settlements[0] || null}
      />
    </div>
  );
}
