import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  Users2,
  DollarSign,
  TrendingUp,
  Download,
  FileSpreadsheet,
  FileText,
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
  Handshake,
  AlertCircle,
  BarChart3,
  PieChart,
  MessageCircle,
  Search,
  Check,
  X,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import { formatCurrency, formatPkMoney, pakistanToday } from '../utils/pakistan';
import { playSuccessChime, playTapSound } from '../utils/audioEffects';
import { downloadPartnerReportPdf } from '../utils/tableExport';
import EmptyState from './EmptyState';
import PartnerEquityCharts from './PartnerEquityCharts';
import PartnerWhatsAppDigestModal from './PartnerWhatsAppDigestModal';
import ConfirmDialog from './ConfirmDialog';
import useDialog from '../utils/useDialog';

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
  const payoutDialogRef = useDialog(showPayoutModal, () => setShowPayoutModal(false));
  const [payoutForm, setPayoutForm] = useState({
    partner_id: '',
    amount: '',
    transaction_date: pakistanToday(),
    payment_method: 'Meezan Bank Transfer',
    notes: '',
    type: 'payout',
  });
  const [submittingPayout, setSubmittingPayout] = useState(false);

  const [confirmingOrderId, setConfirmingOrderId] = useState(null);
  const [settlingOrderId, setSettlingOrderId] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Delete',
    onConfirm: null,
  });

  const [activeSubTab, setActiveSubTab] = useState('breakdown'); // 'breakdown' | 'help' | 'analytics' | 'payouts' | 'settlements'
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('daily'); // 'daily' | 'itemized'
  const [expandedDates, setExpandedDates] = useState({});
  const [settlingDate, setSettlingDate] = useState(null);
  const [confirmingDate, setConfirmingDate] = useState(null);

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

  // Initial Mount Only - prevents screen jumping/scrolling to top on filter changes
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      setLoading(true);
      await Promise.all([fetchPartners(), fetchAuxData(), fetchBreakdown()]);
      if (isMounted) setLoading(false);
    };
    init();
    return () => {
      isMounted = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch breakdown smoothly in background when filter/period changes without unmounting DOM
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

  const promptDeletePayout = (id) => {
    playTapSound();
    setConfirmDialog({
      open: true,
      title: 'Delete Payout Record',
      message: 'Are you sure you want to delete this payout entry? This will adjust the partner balance.',
      confirmLabel: 'Delete Payout',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        try {
          await apiFetch(`/api/partners/payouts/${id}`, { method: 'DELETE' });
          toast.success('Payout deleted.');
          await Promise.all([fetchPartners(), fetchAuxData()]);
        } catch (err) {
          toast.error('Error deleting payout: ' + err.message);
        }
      },
    });
  };

  // Toggle individual bill settlement status (Settled vs Unsettled)
  const handleToggleBillSettled = async (order) => {
    setSettlingOrderId(order.id);
    try {
      const newStatus = !order.is_partner_settled;
      await apiFetch(`/api/partners/bills/${order.id}/settle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_partner_settled: newStatus }),
      });

      playSuccessChime();
      toast.success(
        newStatus
          ? `Invoice #${order.invoice_number} marked as Settled!`
          : `Invoice #${order.invoice_number} reverted to Unsettled.`
      );
      setConfirmingOrderId(null);
      await Promise.all([fetchPartners(), fetchAuxData(), fetchBreakdown()]);
    } catch (err) {
      toast.error('Failed to update settlement status: ' + err.message);
    } finally {
      setSettlingOrderId(null);
    }
  };

  // Toggle consolidated entire day settlement status
  const handleToggleDateSettled = async (date, isCurrentlySettled) => {
    setSettlingDate(date);
    try {
      const newStatus = !isCurrentlySettled;
      await apiFetch(`/api/partners/dates/${encodeURIComponent(date)}/settle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_partner_settled: newStatus }),
      });

      playSuccessChime();
      toast.success(
        newStatus
          ? `All bills on ${date} marked as 50/50 Settled!`
          : `Bills on ${date} reverted to Unsettled.`
      );
      setConfirmingDate(null);
      await Promise.all([fetchPartners(), fetchAuxData(), fetchBreakdown()]);
    } catch (err) {
      toast.error('Failed to update daily settlement: ' + err.message);
    } finally {
      setSettlingDate(null);
    }
  };

  const toggleDateExpanded = (date) => {
    playTapSound();
    setExpandedDates((prev) => ({
      ...prev,
      [date]: prev[date] === undefined ? false : !prev[date],
    }));
  };

  const promptDeleteSettlement = (id) => {
    playTapSound();
    setConfirmDialog({
      open: true,
      title: 'Delete Settlement Checkpoint',
      message: 'Are you sure you want to delete this settlement checkpoint? This will revert the calculation baseline.',
      confirmLabel: 'Delete Checkpoint',
      onConfirm: async () => {
        setConfirmDialog((prev) => ({ ...prev, open: false }));
        try {
          await apiFetch(`/api/partners/settlements/${id}`, { method: 'DELETE' });
          toast.success('Settlement checkpoint removed.');
          await Promise.all([fetchPartners(), fetchAuxData(), fetchBreakdown()]);
        } catch (err) {
          toast.error('Error deleting checkpoint: ' + err.message);
        }
      },
    });
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

  // Filtered help / friendly loan orders list by search
  const filteredHelpOrders = useMemo(() => {
    if (!searchQuery.trim()) return calcData.help_orders || [];
    const q = searchQuery.toLowerCase();
    return (calcData.help_orders || []).filter(
      (o) =>
        (o.customer_name || '').toLowerCase().includes(q) ||
        (o.invoice_number || '').toLowerCase().includes(q) ||
        (o.notes || '').toLowerCase().includes(q)
    );
  }, [calcData.help_orders, searchQuery]);

  // Consolidated Daily Groups for the Daily Rollup view
  const dailyGroups = useMemo(() => {
    const map = {};
    (filteredOrders || []).forEach((o) => {
      const d = o.bill_date || 'Other';
      if (!map[d]) {
        map[d] = {
          date: d,
          sales: 0,
          buying: 0,
          salesCount: 0,
          buyingCount: 0,
          orders: [],
          allSettled: true,
          anySettled: false,
        };
      }
      if (o.is_supplier || o.bill_type === 'supplier') {
        map[d].buying += Number(o.total_amount) || 0;
        map[d].buyingCount += 1;
      } else {
        map[d].sales += Number(o.total_amount) || 0;
        map[d].salesCount += 1;
      }
      if (!o.is_partner_settled) map[d].allSettled = false;
      if (o.is_partner_settled) map[d].anySettled = true;
      map[d].orders.push(o);
    });
    return Object.values(map).sort((a, b) => b.date.localeCompare(a.date));
  }, [filteredOrders]);

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
          <div
            className="chart-pill-group"
            role="group"
            aria-label="Time Range"
            style={{ maxWidth: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch', flexShrink: 1 }}
          >
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

        {/* Summary Metric Cards */}
        {(() => {
          const allOrders = calcData.orders || [];
          const unsettledCount = allOrders.filter((o) => !o.is_partner_settled).length;
          const settledCount = allOrders.filter((o) => o.is_partner_settled).length;

          return (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
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

              <div style={{ padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-md)', background: 'rgba(217, 119, 6, 0.08)', border: '1px solid rgba(217, 119, 6, 0.2)' }}>
                <div style={{ fontSize: '0.68rem', color: '#d97706', fontWeight: 700 }}>UNSETTLED BILLS</div>
                <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#d97706' }}>
                  {unsettledCount} <span style={{ fontSize: '0.72rem', fontWeight: 500, color: 'var(--text-muted)' }}>/ {allOrders.length}</span>
                </div>
                <div style={{ fontSize: '0.68rem', color: settledCount > 0 ? 'var(--status-paid)' : 'var(--text-muted)' }}>
                  {settledCount > 0 ? `${settledCount} settled` : 'All unsettled'}
                </div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* 5. Sub-Tabs (Itemized Sales & Buying | Help & Loans | Visual Analytics | Payouts | History) */}
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
          <Layers size={14} /> Itemized Sales & Buying ({calcData.orders?.length || 0})
        </button>

        <button
          type="button"
          className={`btn-secondary${activeSubTab === 'help' ? ' active' : ''}`}
          onClick={() => {
            playTapSound();
            setActiveSubTab('help');
          }}
          style={{
            padding: '0.4rem 0.8rem',
            fontSize: '0.82rem',
            fontWeight: activeSubTab === 'help' ? 700 : 500,
            borderColor: activeSubTab === 'help' ? 'var(--accent-indigo, #6366f1)' : undefined,
          }}
        >
          <Handshake size={14} style={{ color: 'var(--accent-indigo, #6366f1)' }} /> Help & Loan Float ({calcData.help_orders?.length || 0})
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem', flexWrap: 'wrap', gap: '0.6rem' }}>
            <div style={{ position: 'relative', flex: '1 1 240px', maxWidth: '360px', display: 'flex', alignItems: 'center' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.85rem', color: 'var(--text-muted)', pointerEvents: 'none' }} />
              <input
                type="text"
                placeholder="Search orders, invoices, clients..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '0.42rem 2.2rem 0.42rem 2.4rem',
                  fontSize: '0.82rem',
                  background: 'var(--bg-input, rgba(255, 255, 255, 0.05))',
                  border: '1px solid var(--border-color)',
                  borderRadius: '999px',
                  color: 'var(--text-primary)',
                  outline: 'none',
                  transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: '0.6rem',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '2px',
                  }}
                  title="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              {/* View Mode Toggle: Daily Grouped vs All Bills */}
              <div
                style={{
                  display: 'inline-flex',
                  background: 'rgba(0,0,0,0.05)',
                  borderRadius: '999px',
                  padding: '2px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <button
                  type="button"
                  onClick={() => {
                    playTapSound();
                    setViewMode('daily');
                  }}
                  style={{
                    padding: '0.32rem 0.75rem',
                    fontSize: '0.75rem',
                    borderRadius: '999px',
                    border: 'none',
                    fontWeight: viewMode === 'daily' ? 750 : 500,
                    background: viewMode === 'daily' ? 'var(--accent-teal, #14b8a6)' : 'transparent',
                    color: viewMode === 'daily' ? '#ffffff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  📅 Group by Date
                </button>
                <button
                  type="button"
                  onClick={() => {
                    playTapSound();
                    setViewMode('itemized');
                  }}
                  style={{
                    padding: '0.32rem 0.75rem',
                    fontSize: '0.75rem',
                    borderRadius: '999px',
                    border: 'none',
                    fontWeight: viewMode === 'itemized' ? 750 : 500,
                    background: viewMode === 'itemized' ? 'var(--accent-teal, #14b8a6)' : 'transparent',
                    color: viewMode === 'itemized' ? '#ffffff' : 'var(--text-secondary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  📄 All Bills
                </button>
              </div>

              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'nowrap' }}>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleDownloadPdf}
                  style={{
                    padding: '0.42rem 0.85rem',
                    fontSize: '0.78rem',
                    borderRadius: '999px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    borderColor: 'var(--accent-teal)',
                    color: 'var(--accent-teal)',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                  }}
                  title="Download / Share Partner Statement PDF"
                >
                  <FileText size={13} /> Export PDF
                </button>
              </div>
            </div>
          </div>

          {viewMode === 'daily' ? (
            /* 1. Daily Consolidated Rollup Table */
            <div className="table-responsive" style={{ maxHeight: '460px', overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
              <table className="data-table" style={{ width: '100%', minWidth: '820px', fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th style={{ width: '32px' }}></th>
                    <th>Date</th>
                    <th>Transactions Included</th>
                    <th style={{ textAlign: 'right' }}>Total Sales (+)</th>
                    <th style={{ textAlign: 'right' }}>Buying Cost (−)</th>
                    <th style={{ textAlign: 'right' }}>Net Daily Profit</th>
                    <th style={{ textAlign: 'center' }}>50/50 Division</th>
                    <th style={{ textAlign: 'center' }}>Daily Settlement</th>
                  </tr>
                </thead>
                <tbody>
                  {dailyGroups.length === 0 ? (
                    <tr>
                      <td colSpan={8} style={{ textAlign: 'center', padding: '2.5rem 0', color: 'var(--text-muted)' }}>
                        No orders or shipments found for this time period.
                      </td>
                    </tr>
                  ) : (
                    dailyGroups.map((group) => {
                      const isExpanded = expandedDates[group.date] !== false; // default expanded
                      const netProfit = group.sales - group.buying;
                      const nomiShare = Math.round((netProfit * 0.5) * 100) / 100;
                      const harisShare = nomiShare;
                      const isSettling = settlingDate === group.date;
                      const isConfirming = confirmingDate === group.date;

                      return (
                        <React.Fragment key={`day-${group.date}`}>
                          {/* Daily Summary Row */}
                          <tr
                            style={{
                              background: group.allSettled
                                ? 'rgba(52, 168, 83, 0.05)'
                                : 'rgba(245, 158, 11, 0.05)',
                              fontWeight: 600,
                            }}
                          >
                            <td style={{ textAlign: 'center', cursor: 'pointer' }} onClick={() => toggleDateExpanded(group.date)}>
                              <button
                                type="button"
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', padding: 0 }}
                              >
                                {isExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                              </button>
                            </td>
                            <td onClick={() => toggleDateExpanded(group.date)} style={{ cursor: 'pointer' }}>
                              <strong style={{ fontSize: '0.88rem' }}>{group.date}</strong>
                            </td>
                            <td onClick={() => toggleDateExpanded(group.date)} style={{ cursor: 'pointer' }}>
                              <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
                                {group.salesCount > 0 && (
                                  <span className="badge badge-teal" style={{ fontSize: '0.66rem' }}>
                                    {group.salesCount} Sales
                                  </span>
                                )}
                                {group.buyingCount > 0 && (
                                  <span className="badge badge-amber" style={{ fontSize: '0.66rem' }}>
                                    {group.buyingCount} Saudia Buying
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: group.sales > 0 ? 'var(--status-paid)' : 'inherit' }}>
                              {group.sales > 0 ? `${currencySymbol} ${formatPkMoney(group.sales)}` : '—'}
                            </td>
                            <td style={{ textAlign: 'right', fontWeight: 700, color: group.buying > 0 ? 'var(--status-overdue)' : 'inherit' }}>
                              {group.buying > 0 ? `${currencySymbol} ${formatPkMoney(group.buying)}` : '—'}
                            </td>
                            <td
                              style={{
                                textAlign: 'right',
                                fontWeight: 800,
                                fontSize: '0.88rem',
                                color: netProfit >= 0 ? 'var(--status-paid)' : 'var(--status-overdue)',
                              }}
                            >
                              {netProfit >= 0 ? '+' : ''}{currencySymbol} {formatPkMoney(netProfit)}
                            </td>
                            <td style={{ textAlign: 'center', fontSize: '0.74rem' }}>
                              <span style={{ color: '#3b82f6', fontWeight: 700 }}>N: {currencySymbol} {formatPkMoney(nomiShare)}</span>
                              <span style={{ margin: '0 0.25rem', color: 'var(--text-muted)' }}>|</span>
                              <span style={{ color: 'var(--accent-teal)', fontWeight: 700 }}>H: {currencySymbol} {formatPkMoney(harisShare)}</span>
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {group.allSettled ? (
                                isConfirming ? (
                                  <div
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      background: 'rgba(239, 68, 68, 0.12)',
                                      border: '1px solid rgba(239, 68, 68, 0.35)',
                                      borderRadius: '999px',
                                      padding: '2px',
                                      gap: '3px',
                                    }}
                                  >
                                    <button
                                      type="button"
                                      className="btn-danger"
                                      onClick={() => handleToggleDateSettled(group.date, true)}
                                      disabled={isSettling}
                                      style={{
                                        padding: '0.22rem 0.55rem',
                                        fontSize: '0.68rem',
                                        borderRadius: '999px',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '0.25rem',
                                        fontWeight: 700,
                                        height: '24px',
                                      }}
                                    >
                                      {isSettling ? 'Reverting...' : 'Revert Day'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmingDate(null)}
                                      style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: 'transparent',
                                        color: 'var(--text-secondary)',
                                        border: 'none',
                                        borderRadius: '50%',
                                        width: '22px',
                                        height: '22px',
                                        cursor: 'pointer',
                                        padding: 0,
                                      }}
                                      title="Cancel"
                                    >
                                      <X size={12} />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    className="badge badge-paid"
                                    onClick={() => {
                                      playTapSound();
                                      setConfirmingDate(group.date);
                                    }}
                                    style={{
                                      fontSize: '0.70rem',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                      whiteSpace: 'nowrap',
                                      cursor: 'pointer',
                                      border: '1px solid var(--status-paid)',
                                      background: 'rgba(52, 168, 83, 0.15)',
                                    }}
                                    title="All bills settled for this day. Click to revert."
                                  >
                                    <CheckCircle2 size={11} /> Day Settled
                                  </button>
                                )
                              ) : isConfirming ? (
                                <div
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    background: 'rgba(217, 119, 6, 0.12)',
                                    border: '1px solid rgba(217, 119, 6, 0.35)',
                                    borderRadius: '999px',
                                    padding: '2px',
                                    gap: '3px',
                                  }}
                                >
                                  <button
                                    type="button"
                                    className="btn-primary"
                                    onClick={() => handleToggleDateSettled(group.date, false)}
                                    disabled={isSettling}
                                    style={{
                                      padding: '0.22rem 0.6rem',
                                      fontSize: '0.68rem',
                                      borderRadius: '999px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '0.25rem',
                                      fontWeight: 700,
                                      height: '24px',
                                    }}
                                  >
                                    <Check size={12} />
                                    {isSettling ? 'Settling...' : 'Confirm Settle'}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmingDate(null)}
                                    style={{
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      background: 'transparent',
                                      color: 'var(--text-secondary)',
                                      border: 'none',
                                      borderRadius: '50%',
                                      width: '22px',
                                      height: '22px',
                                      cursor: 'pointer',
                                      padding: 0,
                                    }}
                                    title="Cancel"
                                  >
                                    <X size={12} />
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  className="badge badge-amber"
                                  onClick={() => {
                                    playTapSound();
                                    setConfirmingDate(group.date);
                                  }}
                                  style={{
                                    fontSize: '0.70rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    whiteSpace: 'nowrap',
                                    cursor: 'pointer',
                                    border: '1px solid #f59e0b',
                                    background: 'rgba(245, 158, 11, 0.18)',
                                    color: '#d97706',
                                    fontWeight: 750,
                                    padding: '0.28rem 0.55rem',
                                    borderRadius: '999px',
                                    transition: 'all 0.15s ease',
                                  }}
                                  title="Click to settle all bills on this date"
                                >
                                  <Flag size={11} /> Settle Day ({group.orders.length})
                                </button>
                              )}
                            </td>
                          </tr>

                          {/* Expandable Drilldown Itemized Sub-Table */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} style={{ padding: '0.4rem 0.6rem 0.8rem 1.8rem', background: 'rgba(0,0,0,0.015)' }}>
                                <div style={{ borderLeft: '2px solid var(--border-color)', paddingLeft: '0.75rem' }}>
                                  <div style={{ fontSize: '0.70rem', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '0.35rem', textTransform: 'uppercase' }}>
                                    Individual Invoices on {group.date}:
                                  </div>
                                  <table style={{ width: '100%', fontSize: '0.78rem', borderCollapse: 'collapse' }}>
                                    <tbody>
                                      {group.orders.map((o) => {
                                        const isBuy = o.is_supplier || o.bill_type === 'supplier';
                                        const isOrderSettled = Boolean(o.is_partner_settled);

                                        return (
                                          <tr key={`item-${o.id}`} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                                            <td style={{ padding: '0.35rem 0.4rem', width: '110px' }}>
                                              <strong>{o.invoice_number}</strong>
                                            </td>
                                            <td style={{ padding: '0.35rem 0.4rem', width: '120px' }}>
                                              <span
                                                className={`badge ${isBuy ? 'badge-amber' : 'badge-teal'}`}
                                                style={{ fontSize: '0.64rem', textTransform: 'uppercase' }}
                                              >
                                                {isBuy ? 'Saudia Buying' : 'Customer Sale'}
                                              </span>
                                            </td>
                                            <td style={{ padding: '0.35rem 0.4rem' }}>
                                              <span style={{ fontWeight: 600 }}>{o.customer_name}</span>
                                              {o.notes && <span style={{ fontSize: '0.70rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>({o.notes})</span>}
                                            </td>
                                            <td style={{ padding: '0.35rem 0.4rem', textAlign: 'right', fontWeight: 700, color: isBuy ? 'var(--status-overdue)' : 'var(--status-paid)', width: '130px' }}>
                                              {isBuy ? '−' : '+'}{currencySymbol} {formatPkMoney(o.total_amount)}
                                            </td>
                                            <td style={{ padding: '0.35rem 0.4rem', textAlign: 'center', width: '130px' }}>
                                              <button
                                                type="button"
                                                className={`badge ${isOrderSettled ? 'badge-paid' : 'badge-amber'}`}
                                                onClick={() => handleToggleBillSettled(o)}
                                                disabled={settlingOrderId === o.id}
                                                style={{
                                                  fontSize: '0.65rem',
                                                  display: 'inline-flex',
                                                  alignItems: 'center',
                                                  gap: '0.2rem',
                                                  cursor: 'pointer',
                                                  padding: '0.15rem 0.45rem',
                                                  borderRadius: '999px',
                                                }}
                                              >
                                                {isOrderSettled ? <CheckCircle2 size={10} /> : <Flag size={10} />}
                                                <span>{isOrderSettled ? 'Settled' : 'Unsettled'}</span>
                                              </button>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            /* 2. Flat Itemized Table */

          <div className="table-responsive" style={{ maxHeight: '420px', overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
            <table className="data-table" style={{ width: '100%', minWidth: '780px', fontSize: '0.82rem' }}>
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
                  <th style={{ textAlign: 'center' }}>Settlement Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
                      No orders or shipments found for this time period.
                    </td>
                  </tr>
                ) : (
                  filteredOrders.map((o) => {
                    const isBuy = o.is_supplier || o.bill_type === 'supplier';
                    const isHelp = o.is_help || o.bill_type === 'help';
                    const halfShare = Math.round((Math.abs(o.profit_effect) / 2) * 100) / 100;

                    const isOrderSettled = Boolean(o.is_partner_settled);

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
                        <td style={{ textAlign: 'center' }}>
                          {isOrderSettled ? (
                            confirmingOrderId === o.id ? (
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  background: 'rgba(234, 67, 53, 0.12)',
                                  border: '1px solid rgba(234, 67, 53, 0.35)',
                                  borderRadius: '999px',
                                  padding: '2px',
                                  gap: '3px',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => handleToggleBillSettled(o)}
                                  disabled={settlingOrderId === o.id}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    background: 'var(--status-overdue)',
                                    color: '#ffffff',
                                    border: 'none',
                                    borderRadius: '999px',
                                    padding: '0.22rem 0.6rem',
                                    fontSize: '0.72rem',
                                    fontWeight: 750,
                                    cursor: 'pointer',
                                    height: '24px',
                                    lineHeight: 1,
                                    whiteSpace: 'nowrap',
                                  }}
                                  title="Revert this bill back to Unsettled"
                                >
                                  {settlingOrderId === o.id ? 'Updating...' : 'Unsettle'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingOrderId(null)}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'transparent',
                                    color: 'var(--text-secondary)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '22px',
                                    height: '22px',
                                    cursor: 'pointer',
                                    padding: 0,
                                  }}
                                  title="Cancel"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="badge badge-paid"
                                onClick={() => {
                                  playTapSound();
                                  setConfirmingOrderId(o.id);
                                }}
                                style={{
                                  fontSize: '0.70rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  whiteSpace: 'nowrap',
                                  cursor: 'pointer',
                                  border: '1px solid var(--status-paid)',
                                  background: 'rgba(52, 168, 83, 0.15)',
                                }}
                                title="Click to revert this record to Unsettled"
                              >
                                <CheckCircle2 size={11} /> Settled
                              </button>
                            )
                          ) : confirmingOrderId === o.id ? (
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                background: 'rgba(217, 119, 6, 0.12)',
                                border: '1px solid rgba(217, 119, 6, 0.35)',
                                borderRadius: '999px',
                                padding: '2px',
                                gap: '3px',
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => handleToggleBillSettled(o)}
                                disabled={settlingOrderId === o.id}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  background: '#d97706',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '999px',
                                  padding: '0.22rem 0.65rem',
                                  fontSize: '0.72rem',
                                  fontWeight: 750,
                                  cursor: 'pointer',
                                  height: '24px',
                                  lineHeight: 1,
                                  whiteSpace: 'nowrap',
                                  boxShadow: '0 1px 4px rgba(217, 119, 6, 0.3)',
                                }}
                              >
                                <Check size={12} />
                                {settlingOrderId === o.id ? 'Saving...' : 'Settle'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingOrderId(null)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: 'transparent',
                                  color: 'var(--text-secondary)',
                                  border: 'none',
                                  borderRadius: '50%',
                                  width: '22px',
                                  height: '22px',
                                  cursor: 'pointer',
                                  padding: 0,
                                }}
                                title="Cancel"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="badge badge-amber"
                              onClick={() => {
                                playTapSound();
                                setConfirmingOrderId(o.id);
                              }}
                              style={{
                                fontSize: '0.70rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                whiteSpace: 'nowrap',
                                cursor: 'pointer',
                                border: '1px solid #f59e0b',
                                background: 'rgba(245, 158, 11, 0.18)',
                                color: '#d97706',
                                fontWeight: 750,
                                padding: '0.28rem 0.55rem',
                                borderRadius: '999px',
                                transition: 'all 0.15s ease',
                              }}
                              title="Click to mark this record as Settled"
                            >
                              <Flag size={11} /> Unsettled
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )}

      {/* Sub-Tab 1.5: Help & Loan Float Ledger (Separated from Sales & Buying Dividends) */}
      {activeSubTab === 'help' && (
        <div className="glass-panel" style={{ padding: '1rem', borderRadius: 'var(--radius-lg)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.9rem', flexWrap: 'wrap', gap: '0.6rem' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <Handshake size={18} style={{ color: 'var(--accent-indigo, #6366f1)' }} /> Help & Friendly Loan Float Ledger
              </h3>
              <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)', margin: '0.15rem 0 0 0' }}>
                These transactions represent capital float and friendly loans. They are tracked separately and do not affect the 50/50 profit pool.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center' }}>
              <div style={{ padding: '0.4rem 0.75rem', borderRadius: 'var(--radius-md)', background: 'rgba(99, 102, 241, 0.08)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
                <span style={{ fontSize: '0.68rem', color: 'var(--accent-indigo, #6366f1)', fontWeight: 700 }}>TOTAL FLOAT: </span>
                <strong style={{ fontSize: '0.88rem' }}>{currencySymbol} {formatPkMoney(calcData.help_summary?.total_help || 0)}</strong>
              </div>
            </div>
          </div>

          <div className="table-responsive" style={{ maxHeight: '420px', overflowY: 'auto', overflowX: 'auto', WebkitOverflowScrolling: 'touch', width: '100%' }}>
            <table className="data-table" style={{ width: '100%', minWidth: '780px', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ref #</th>
                  <th>Beneficiary / Party</th>
                  <th>Description / Notes</th>
                  <th style={{ textAlign: 'right' }}>Float / Loan Amount</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                  <th style={{ textAlign: 'center' }}>Settlement Tag</th>
                </tr>
              </thead>
              <tbody>
                {filteredHelpOrders.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '2.5rem 0', color: 'var(--text-muted)' }}>
                      No help or friendly loan records found for this period.
                    </td>
                  </tr>
                ) : (
                  filteredHelpOrders.map((h) => {
                    const isSettled = Boolean(h.is_partner_settled);
                    return (
                      <tr key={h.id}>
                        <td>{h.bill_date}</td>
                        <td><strong>{h.invoice_number}</strong></td>
                        <td><div style={{ fontWeight: 700 }}>{h.customer_name}</div></td>
                        <td><div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{h.notes || 'Friendly Float / Assistance'}</div></td>
                        <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--accent-indigo, #6366f1)' }}>
                          {currencySymbol} {formatPkMoney(h.total_amount)}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`badge ${h.status === 'paid' ? 'badge-paid' : 'badge-amber'}`} style={{ fontSize: '0.68rem' }}>
                            {h.status === 'paid' ? 'Cleared' : h.status || 'Pending'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          {isSettled ? (
                            confirmingOrderId === h.id ? (
                              <div
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  background: 'rgba(239, 68, 68, 0.12)',
                                  border: '1px solid rgba(239, 68, 68, 0.35)',
                                  borderRadius: '999px',
                                  padding: '2px',
                                  gap: '3px',
                                }}
                              >
                                <button
                                  type="button"
                                  className="btn-danger"
                                  onClick={() => handleToggleBillSettled(h)}
                                  disabled={settlingOrderId === h.id}
                                  style={{
                                    padding: '0.22rem 0.55rem',
                                    fontSize: '0.68rem',
                                    borderRadius: '999px',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '0.25rem',
                                    fontWeight: 700,
                                    height: '24px',
                                  }}
                                >
                                  {settlingOrderId === h.id ? 'Reverting...' : 'Revert'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingOrderId(null)}
                                  style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    background: 'transparent',
                                    color: 'var(--text-secondary)',
                                    border: 'none',
                                    borderRadius: '50%',
                                    width: '22px',
                                    height: '22px',
                                    cursor: 'pointer',
                                    padding: 0,
                                  }}
                                  title="Cancel"
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                className="badge badge-paid"
                                onClick={() => {
                                  playTapSound();
                                  setConfirmingOrderId(h.id);
                                }}
                                style={{
                                  fontSize: '0.70rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  whiteSpace: 'nowrap',
                                  cursor: 'pointer',
                                  border: '1px solid var(--status-paid)',
                                  background: 'rgba(52, 168, 83, 0.15)',
                                }}
                                title="Click to revert this record to Unsettled"
                              >
                                <CheckCircle2 size={11} /> Settled
                              </button>
                            )
                          ) : confirmingOrderId === h.id ? (
                            <div
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                background: 'rgba(217, 119, 6, 0.12)',
                                border: '1px solid rgba(217, 119, 6, 0.35)',
                                borderRadius: '999px',
                                padding: '2px',
                                gap: '3px',
                              }}
                            >
                              <button
                                type="button"
                                className="btn-primary"
                                onClick={() => handleToggleBillSettled(h)}
                                disabled={settlingOrderId === h.id}
                                style={{
                                  padding: '0.22rem 0.6rem',
                                  fontSize: '0.68rem',
                                  borderRadius: '999px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '0.25rem',
                                  fontWeight: 700,
                                  height: '24px',
                                }}
                              >
                                <Check size={12} />
                                {settlingOrderId === h.id ? 'Saving...' : 'Settle'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingOrderId(null)}
                                style={{
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  background: 'transparent',
                                  color: 'var(--text-secondary)',
                                  border: 'none',
                                  borderRadius: '50%',
                                  width: '22px',
                                  height: '22px',
                                  cursor: 'pointer',
                                  padding: 0,
                                }}
                                title="Cancel"
                              >
                                <X size={12} />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              className="badge badge-amber"
                              onClick={() => {
                                playTapSound();
                                setConfirmingOrderId(h.id);
                              }}
                              style={{
                                fontSize: '0.70rem',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                whiteSpace: 'nowrap',
                                cursor: 'pointer',
                                border: '1px solid #f59e0b',
                                background: 'rgba(245, 158, 11, 0.18)',
                                color: '#d97706',
                                fontWeight: 750,
                                padding: '0.28rem 0.55rem',
                                borderRadius: '999px',
                                transition: 'all 0.15s ease',
                              }}
                              title="Click to mark this record as Settled"
                            >
                              <Flag size={11} /> Unsettled
                            </button>
                          )}
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

          <div className="table-responsive" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="data-table" style={{ width: '100%', minWidth: '780px', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th style={{ minWidth: '95px' }}>Date</th>
                  <th style={{ minWidth: '100px' }}>Partner</th>
                  <th style={{ minWidth: '110px' }}>Type</th>
                  <th style={{ minWidth: '130px' }}>Method</th>
                  <th style={{ minWidth: '180px' }}>Memo / Reference</th>
                  <th style={{ textAlign: 'right', minWidth: '100px' }}>Amount</th>
                  <th style={{ textAlign: 'center', width: '60px' }}>Action</th>
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
                      <td style={{ whiteSpace: 'nowrap' }}>{p.transaction_date}</td>
                      <td>
                        <strong>{p.partner_name}</strong>
                      </td>
                      <td>
                        <span className={`badge ${p.type === 'capital_in' ? 'badge-teal' : 'badge-amber'}`} style={{ fontSize: '0.68rem', whiteSpace: 'nowrap' }}>
                          {p.type === 'capital_in' ? 'Investment (+)' : 'Withdrawal (−)'}
                        </span>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{p.payment_method}</td>
                      <td style={{ minWidth: '180px', wordBreak: 'break-word' }}>{p.notes || '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: p.type === 'capital_in' ? 'var(--status-paid)' : 'var(--status-overdue)' }}>
                        {p.type === 'capital_in' ? '+' : '−'}{currencySymbol} {formatPkMoney(p.amount)}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => promptDeletePayout(p.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            background: 'rgba(234, 67, 53, 0.12)',
                            border: '1px solid rgba(234, 67, 53, 0.3)',
                            color: '#ea4335',
                            cursor: 'pointer',
                            padding: 0,
                            transition: 'all 0.15s ease',
                          }}
                          title="Delete payout"
                        >
                          <Trash2 size={13} />
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

          <div className="table-responsive" style={{ width: '100%', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
            <table className="data-table" style={{ width: '100%', minWidth: '1080px', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  <th style={{ minWidth: '140px' }}>Code</th>
                  <th style={{ minWidth: '105px' }}>Settlement Date</th>
                  <th style={{ minWidth: '140px' }}>Period Settled</th>
                  <th style={{ textAlign: 'right', minWidth: '100px' }}>Total Sales</th>
                  <th style={{ textAlign: 'right', minWidth: '100px' }}>Buying Cost</th>
                  <th style={{ textAlign: 'right', minWidth: '115px' }}>Net Settled Profit</th>
                  <th style={{ textAlign: 'right', minWidth: '95px' }}>Nomi 50%</th>
                  <th style={{ textAlign: 'right', minWidth: '95px' }}>Haris 50%</th>
                  <th style={{ minWidth: '220px' }}>Notes / Memo</th>
                  <th style={{ textAlign: 'center', width: '60px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {settlements.length === 0 ? (
                  <tr>
                    <td colSpan={10} style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
                      No settlement checkpoints recorded yet.
                    </td>
                  </tr>
                ) : (
                  settlements.map((s) => (
                    <tr key={s.id}>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <code style={{ fontWeight: 700, color: '#d97706' }}>{s.settlement_code}</code>
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>{s.settled_at?.slice(0, 10)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{s.period_start ? `${s.period_start} to ${s.period_end}` : `Up to ${s.period_end}`}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{currencySymbol} {formatPkMoney(s.total_sales)}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{currencySymbol} {formatPkMoney(s.total_buying)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap', color: 'var(--accent-teal)' }}>
                        {currencySymbol} {formatPkMoney(s.net_profit)}
                      </td>
                      <td style={{ textAlign: 'right', color: '#3b82f6', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {currencySymbol} {formatPkMoney(s.nomi_share)}
                      </td>
                      <td style={{ textAlign: 'right', color: 'var(--accent-teal)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                        {currencySymbol} {formatPkMoney(s.haris_share)}
                      </td>
                      <td style={{ minWidth: '220px', wordBreak: 'break-word', lineHeight: 1.45 }}>{s.notes || '—'}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => promptDeleteSettlement(s.id)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '28px',
                            height: '28px',
                            borderRadius: '8px',
                            background: 'rgba(234, 67, 53, 0.12)',
                            border: '1px solid rgba(234, 67, 53, 0.3)',
                            color: '#ea4335',
                            cursor: 'pointer',
                            padding: 0,
                            transition: 'all 0.15s ease',
                          }}
                          title="Undo settlement marker"
                        >
                          <Trash2 size={13} />
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
      {showPayoutModal &&
        createPortal(
          <div className="client-modal-overlay" onClick={() => setShowPayoutModal(false)} role="presentation">
            <div
              ref={payoutDialogRef}
              className="client-modal-card glass-panel"
              onClick={(e) => e.stopPropagation()}
              style={{ width: '100%', maxWidth: '460px' }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="partner-payout-title"
              tabIndex={-1}
            >
              <h3 id="partner-payout-title" style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: '0.8rem' }}>Record Partner Payout</h3>

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
          </div>,
          document.body
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

      {/* In-App Confirmation Modal */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel || 'Delete'}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
