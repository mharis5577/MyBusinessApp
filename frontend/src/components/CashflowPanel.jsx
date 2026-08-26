import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  ArrowDownUp,
  BarChart2,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  TrendingUp,
  DollarSign,
  Wallet,
  Calendar,
  CalendarDays,
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Package,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  Smartphone,
  Sparkles,
  ChevronDown,
  Clock,
  Filter,
  Check,
  X,
  FileDown,
} from 'lucide-react';
import { formatCurrency, pakistanToday, addDaysToDateString } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import EmptyState from './EmptyState';
import { billTypeBadgeClass, billTypeShortLabel, isHelpBill } from '../utils/billTypes';
import { downloadCashflowReportPdf, downloadCashflowCsv } from '../utils/tableExport';

/**
 * Modern Stripe/Shopify-style Financial Breakdown & Daily Profit Ledger
 * Displays the daily profit timeline for the active view with pagination.
 */
function DailyFinancialBreakdown({ data = [], currencySymbol = 'Rs.' }) {
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'profitable' | 'costs'
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [data, filterMode]);

  const displayedTimeline = [...(data || [])].reverse();

  const totalPeriodSales = displayedTimeline.reduce((s, d) => s + (Number(d.sales) || 0), 0);
  const totalPeriodBuying = displayedTimeline.reduce((s, d) => s + (Number(d.buying) || 0), 0);
  const totalPeriodProfit = totalPeriodSales - totalPeriodBuying;
  const periodMargin = totalPeriodSales > 0 ? ((totalPeriodProfit / totalPeriodSales) * 100).toFixed(1) : '0.0';

  if (!displayedTimeline || displayedTimeline.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
        No financial timeline data recorded for this period.
      </div>
    );
  }

  const displayedRows = displayedTimeline.filter((item) => {
    if (filterMode === 'profitable') return (Number(item.profit) || 0) > 0;
    if (filterMode === 'costs') return (Number(item.buying) || 0) > 0;
    return true;
  });

  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(displayedRows.length / pageSize));
  const validPage = Math.min(Math.max(1, currentPage), totalPages);
  const startIndex = (validPage - 1) * pageSize;
  const pageRows = displayedRows.slice(startIndex, startIndex + pageSize);

  return (
    <div className="cashflow-chart-container" style={{ padding: '1.15rem' }}>
      {/* 1. Header & Controls */}
      <div className="cashflow-chart-header" style={{ marginBottom: '1rem' }}>
        <div className="cashflow-chart-title-group">
          <Layers size={18} style={{ color: 'var(--accent-teal)' }} />
          <span className="cashflow-chart-title">Daily Profit & Financial Breakdown</span>
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>
            ({displayedTimeline.length} Day{displayedTimeline.length === 1 ? '' : 's'})
          </span>
        </div>

        <div className="cashflow-chart-controls">
          <div className="chart-pill-group" role="group" aria-label="Ledger Filter">
            <button
              type="button"
              className={`chart-pill-btn${filterMode === 'all' ? ' is-active' : ''}`}
              onClick={() => setFilterMode('all')}
            >
              All Days
            </button>
            <button
              type="button"
              className={`chart-pill-btn${filterMode === 'profitable' ? ' is-active' : ''}`}
              onClick={() => setFilterMode('profitable')}
            >
              Profitable Only
            </button>
            <button
              type="button"
              className={`chart-pill-btn${filterMode === 'costs' ? ' is-active' : ''}`}
              onClick={() => setFilterMode('costs')}
            >
              Purchases Only
            </button>
          </div>
        </div>
      </div>

      {/* 2. Range KPI Highlights */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
          gap: '0.65rem',
          marginBottom: '1rem',
        }}
      >
        <div style={{ background: 'var(--surface-muted)', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 650 }}>Period Sales</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--status-paid)', marginTop: 2 }}>
            {formatCurrency(currencySymbol, totalPeriodSales)}
          </div>
        </div>

        <div style={{ background: 'var(--surface-muted)', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 650 }}>Saudia Purchases</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#f43f5e', marginTop: 2 }}>
            {formatCurrency(currencySymbol, totalPeriodBuying)}
          </div>
        </div>

        <div style={{ background: 'rgba(16, 185, 129, 0.08)', padding: '0.75rem', borderRadius: 10, border: '1px solid rgba(16, 185, 129, 0.25)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--success)', fontWeight: 650 }}>Period Net Profit</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--success)', marginTop: 2 }}>
            {formatCurrency(currencySymbol, totalPeriodProfit)}
          </div>
        </div>

        <div style={{ background: 'var(--surface-muted)', padding: '0.75rem', borderRadius: 10, border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 650 }}>Operating Margin</div>
          <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--accent-teal)', marginTop: 2 }}>
            {periodMargin}%
          </div>
        </div>
      </div>

      {/* 3. Daily Ledger Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
        {pageRows.map((item, idx) => {
          const sales = Number(item.sales) || 0;
          const buying = Number(item.buying) || 0;
          const profit = sales - buying;
          const marginPct = sales > 0 ? ((profit / sales) * 100).toFixed(1) : '0.0';
          const maxVal = Math.max(1, sales + buying);
          const salesBarPct = Math.round((sales / maxVal) * 100);
          const buyingBarPct = Math.round((buying / maxVal) * 100);

          return (
            <div
              key={item.date || idx}
              style={{
                background: 'var(--surface-muted)',
                borderRadius: 10,
                border: '1px solid var(--border-color)',
                padding: '0.85rem 1rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.5rem',
                transition: 'all 0.15s ease',
              }}
            >
              {/* Row Header: Date & Profit Pill */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calendar size={14} style={{ color: 'var(--accent-teal)' }} />
                  <span style={{ fontWeight: 800, fontSize: '0.9rem' }}>{item.date}</span>
                  {item.sales_count != null && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      ({item.sales_count} order{item.sales_count === 1 ? '' : 's'})
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 750,
                      padding: '0.2rem 0.55rem',
                      borderRadius: 999,
                      background: profit >= 0 ? 'rgba(16, 185, 129, 0.14)' : 'rgba(239, 68, 68, 0.14)',
                      color: profit >= 0 ? '#10b981' : '#f87171',
                      border: `1px solid ${profit >= 0 ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                    }}
                  >
                    {profit >= 0 ? `+${marginPct}% Margin` : `${marginPct}%`}
                  </span>
                </div>
              </div>

              {/* Financial Flow Split Bar */}
              <div
                style={{
                  height: '6px',
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.06)',
                  borderRadius: '999px',
                  display: 'flex',
                  overflow: 'hidden',
                  margin: '0.15rem 0',
                }}
              >
                <div
                  style={{ width: `${salesBarPct}%`, background: '#10b981', transition: 'width 0.3s ease' }}
                  title={`Sales: ${salesBarPct}%`}
                />
                <div
                  style={{ width: `${buyingBarPct}%`, background: '#f43f5e', transition: 'width 0.3s ease' }}
                  title={`Saudia Buying: ${buyingBarPct}%`}
                />
              </div>

              {/* Row Metrics Breakdown */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                  fontSize: '0.8rem',
                }}
              >
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Sales:{' '}
                    <strong style={{ color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                      +{formatCurrency(currencySymbol, sales)}
                    </strong>
                  </span>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    Saudia:{' '}
                    <strong style={{ color: '#f43f5e', fontFamily: 'var(--font-mono)' }}>
                      −{formatCurrency(currencySymbol, buying)}
                    </strong>
                  </span>
                </div>

                <div>
                  <span style={{ color: 'var(--text-secondary)' }}>Net Profit: </span>
                  <strong
                    style={{
                      color: profit >= 0 ? '#10b981' : '#f87171',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.88rem',
                    }}
                  >
                    {formatCurrency(currencySymbol, profit)}
                  </strong>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination Page Shifter */}
      {displayedRows.length > 0 && (
        <div
          className="bills-pagination-bar"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.6rem',
            marginTop: '1.25rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-subtle)',
            textAlign: 'center',
          }}
        >
          {totalPages > 1 && (
            <div className="bills-pagination-controls" style={{ display: 'inline-flex', flexDirection: 'row', flexWrap: 'nowrap', alignItems: 'center', justifyContent: 'center', gap: '0.35rem' }}>
              <button
                type="button"
                className="btn-secondary bills-pagination-btn"
                onClick={() => setCurrentPage(1)}
                disabled={validPage === 1}
                style={{ width: 'auto', minWidth: '32px', flex: '0 0 auto', padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}
                title="First page"
              >
                <ChevronsLeft size={14} />
              </button>

              <button
                type="button"
                className="btn-secondary bills-pagination-btn"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={validPage === 1}
                style={{ width: 'auto', flex: '0 0 auto', padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                title="Previous page"
              >
                <ChevronLeft size={14} /> Prev
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <button
                  key={pageNum}
                  type="button"
                  className={`btn-${validPage === pageNum ? 'primary' : 'secondary'} bills-pagination-btn`}
                  onClick={() => setCurrentPage(pageNum)}
                  style={{
                    width: 'auto',
                    minWidth: '32px',
                    flex: '0 0 auto',
                    padding: '0.35rem 0.65rem',
                    fontSize: '0.78rem',
                    fontWeight: validPage === pageNum ? 800 : 500,
                  }}
                >
                  {pageNum}
                </button>
              ))}

              <button
                type="button"
                className="btn-secondary bills-pagination-btn"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={validPage === totalPages}
                style={{ width: 'auto', flex: '0 0 auto', padding: '0.35rem 0.65rem', fontSize: '0.78rem' }}
                title="Next page"
              >
                Next <ChevronRight size={14} />
              </button>

              <button
                type="button"
                className="btn-secondary bills-pagination-btn"
                onClick={() => setCurrentPage(totalPages)}
                disabled={validPage === totalPages}
                style={{ width: 'auto', minWidth: '32px', flex: '0 0 auto', padding: '0.35rem 0.6rem', fontSize: '0.78rem' }}
                title="Last page"
              >
                <ChevronsRight size={14} />
              </button>
            </div>
          )}

          <div style={{ fontSize: '0.80rem', color: 'var(--text-secondary)' }}>
            Showing <strong style={{ color: 'var(--text-primary)' }}>{startIndex + 1}</strong>–
            <strong style={{ color: 'var(--text-primary)' }}>
              {Math.min(startIndex + pageSize, displayedRows.length)}
            </strong> of <strong style={{ color: 'var(--text-primary)' }}>{displayedRows.length}</strong> days
            {totalPages > 1 && <span> · Page {validPage} of {totalPages}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Helper to compute startDate, endDate, and human-friendly label for any period preset.
 */
function getPeriodDetails(periodKey, customStart = '', customEnd = '') {
  const today = pakistanToday();
  if (periodKey === 'today') {
    return { startDate: today, endDate: today, label: 'Today', dateRangeStr: today, isMaster: false };
  }
  if (periodKey === 'yesterday') {
    const yest = addDaysToDateString(today, -1);
    return { startDate: yest, endDate: yest, label: 'Yesterday', dateRangeStr: yest, isMaster: false };
  }
  if (periodKey === '7d') {
    const start = addDaysToDateString(today, -6);
    return { startDate: start, endDate: today, label: 'Last 7 Days', dateRangeStr: `${start} to ${today}`, isMaster: false };
  }
  if (periodKey === '14d') {
    const start = addDaysToDateString(today, -13);
    return { startDate: start, endDate: today, label: 'Last 14 Days', dateRangeStr: `${start} to ${today}`, isMaster: false };
  }
  if (periodKey === '30d') {
    const start = addDaysToDateString(today, -29);
    return { startDate: start, endDate: today, label: 'Last 30 Days', dateRangeStr: `${start} to ${today}`, isMaster: false };
  }
  if (periodKey === 'this_month') {
    const start = `${today.slice(0, 7)}-01`;
    return { startDate: start, endDate: today, label: 'This Month', dateRangeStr: `${start} to ${today}`, isMaster: false };
  }
  if (periodKey === 'custom') {
    const s = customStart || today;
    const e = customEnd || today;
    return { startDate: s, endDate: e, label: 'Custom Range', dateRangeStr: `${s} to ${e}`, isMaster: false };
  }
  // 'all' / default
  return { startDate: '', endDate: '', label: 'All Time', dateRangeStr: 'From Beginning to Present', isMaster: true };
}

/**
 * Cashflow & Operating Balance Dashboard
 * Tracks incoming money (sales) vs outgoing money (Saudia buying).
 * Includes Period Filtering, Specific Period Downloads (PDF/Mobile/CSV),
 * and Master Download to export all historical cashflow from the very beginning.
 */
export function CashflowPanel({
  compact = false,
  embedded = false,
  currencySymbol = 'Rs.',
  helpGiven = null,
  helpOutstanding: helpOutstandingProp = null,
  onNavigate,
  onViewBill,
}) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportingState, setExportingState] = useState(null); // 'period_pdf' | 'period_mobile' | 'period_csv' | 'master_pdf' | 'master_csv' | null

  // Period filtering state
  const [periodFilter, setPeriodFilter] = useState('all'); // 'all' | 'today' | 'yesterday' | '7d' | '14d' | '30d' | 'this_month' | 'custom'
  const [customStart, setCustomStart] = useState(pakistanToday());
  const [customEnd, setCustomEnd] = useState(pakistanToday());
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showMasterMenu, setShowMasterMenu] = useState(false);

  const exportMenuRef = useRef(null);
  const masterMenuRef = useRef(null);

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
      if (masterMenuRef.current && !masterMenuRef.current.contains(e.target)) {
        setShowMasterMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const load = useCallback(
    async (preset = periodFilter, cStart = customStart, cEnd = customEnd) => {
      setLoading(true);
      try {
        const periodInfo = getPeriodDetails(preset, cStart, cEnd);
        const params = new URLSearchParams();
        if (compact) params.append('compact', '1');
        if (periodInfo.startDate) params.append('startDate', periodInfo.startDate);
        if (periodInfo.endDate) params.append('endDate', periodInfo.endDate);

        const res = await apiFetch(`/api/cashflow?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
        setData(json);
      } catch (err) {
        toast.error(err.message || 'Cashflow load failed');
      } finally {
        setLoading(false);
      }
    },
    [compact, periodFilter, customStart, customEnd]
  );

  useEffect(() => {
    load(periodFilter, customStart, customEnd);
  }, [periodFilter, compact]);

  const handlePeriodChange = (newPeriod) => {
    setPeriodFilter(newPeriod);
    if (newPeriod === 'custom') {
      setShowCustomPicker(true);
    } else {
      setShowCustomPicker(false);
      load(newPeriod, customStart, customEnd);
    }
  };

  const applyCustomRange = () => {
    if (!customStart || !customEnd) {
      toast.warning('Please select both start and end dates');
      return;
    }
    if (customStart > customEnd) {
      toast.error('Start date cannot be after end date');
      return;
    }
    setShowCustomPicker(false);
    load('custom', customStart, customEnd);
  };

  const openFlowBill = (row) => {
    if (!row?.id) return;
    if (onViewBill) onViewBill(row);
    else if (onNavigate) onNavigate('database');
  };

  // -------------------------------------------------------------
  // 1. SPECIFIC PERIOD DOWNLOAD HANDLERS
  // -------------------------------------------------------------
  const handleExportPeriod = async (type = 'pdf') => {
    setShowExportMenu(false);
    const periodInfo = getPeriodDetails(periodFilter, customStart, customEnd);
    setExportingState(`period_${type}`);

    try {
      // Fetch full records for this period (all_records=1 ensures 100% data export)
      const params = new URLSearchParams({ all_records: '1' });
      if (periodInfo.startDate) params.append('startDate', periodInfo.startDate);
      if (periodInfo.endDate) params.append('endDate', periodInfo.endDate);

      const res = await apiFetch(`/api/cashflow?${params.toString()}`);
      const fullData = await res.json();
      if (!res.ok) throw new Error(fullData.error || 'Failed to fetch period data');

      const dateSlug = periodInfo.startDate && periodInfo.endDate
        ? `${periodInfo.startDate}_to_${periodInfo.endDate}`
        : pakistanToday();

      if (type === 'csv') {
        await downloadCashflowCsv({
          companyName: 'ELITE CHOCOLATE',
          currencySymbol,
          cashflow: fullData,
          dailyTrend: fullData?.daily_trend || [],
          moneyFlow: fullData?.money_flow || [],
          periodLabel: periodInfo.label,
          dateRange: periodInfo.dateRangeStr,
          isMaster: periodInfo.isMaster,
          filename: `Cashflow_${periodInfo.label.replace(/\s+/g, '_')}_${dateSlug}.csv`,
        });
        toast.success(`Period CSV (${periodInfo.label}) downloaded!`);
      } else {
        const isMobile = type === 'mobile';
        await downloadCashflowReportPdf({
          companyName: 'ELITE CHOCOLATE',
          currencySymbol,
          cashflow: fullData,
          dailyTrend: fullData?.daily_trend || [],
          moneyFlow: fullData?.money_flow || [],
          isMobile,
          periodLabel: periodInfo.label,
          dateRange: periodInfo.dateRangeStr,
          isMaster: periodInfo.isMaster,
          filename: isMobile
            ? `Cashflow_Mobile_${periodInfo.label.replace(/\s+/g, '_')}_${dateSlug}.pdf`
            : `Cashflow_Statement_${periodInfo.label.replace(/\s+/g, '_')}_${dateSlug}.pdf`,
        });
        toast.success(isMobile ? `Mobile PDF Pass (${periodInfo.label}) downloaded!` : `A4 PDF Statement (${periodInfo.label}) downloaded!`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate export file');
    } finally {
      setExportingState(null);
    }
  };

  // -------------------------------------------------------------
  // 2. MASTER DOWNLOAD HANDLERS (ALL-TIME FROM INCEPTION)
  // -------------------------------------------------------------
  const handleExportMaster = async (format = 'pdf') => {
    setShowMasterMenu(false);
    setExportingState(`master_${format}`);

    try {
      // Fetch entire master historical dataset without date bounds
      const res = await apiFetch('/api/cashflow?all_records=1&master=1');
      const masterData = await res.json();
      if (!res.ok) throw new Error(masterData.error || 'Failed to fetch master data');

      const todaySlug = pakistanToday();
      const isMobile = format === 'mobile';

      await downloadCashflowReportPdf({
        companyName: 'ELITE CHOCOLATE',
        currencySymbol,
        cashflow: masterData,
        dailyTrend: masterData?.daily_trend || [],
        moneyFlow: masterData?.money_flow || [],
        isMobile,
        periodLabel: 'All Time (From Inception)',
        dateRange: 'Complete Historical Statement',
        isMaster: true,
        filename: isMobile
          ? `Cashflow_MASTER_Mobile_${todaySlug}.pdf`
          : `Cashflow_MASTER_AllTime_Statement_${todaySlug}.pdf`,
      });
      toast.success(isMobile ? 'Master Mobile View PDF downloaded!' : 'Master All-Time PDF Statement downloaded!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate Master statement');
    } finally {
      setExportingState(null);
    }
  };

  if (loading && !data) {
    return (
      <div className={`panel-flat${embedded ? ' is-embedded' : ''}`} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem 0' }}>
        <RefreshCw className="spin" size={24} style={{ color: 'var(--accent-teal)', marginBottom: '0.5rem' }} />
        <div>Loading cashflow ledger…</div>
      </div>
    );
  }

  const {
    total_sales = 0,
    buying_cost = 0,
    net_profit = 0,
    paid_sales = 0,
    pending_sales = 0,
    help_given = 0,
    help_outstanding = 0,
    money_flow = [],
    daily_trend = [],
  } = data || {};

  const activePeriod = getPeriodDetails(periodFilter, customStart, customEnd);
  const helpGivenShow = helpGiven != null ? helpGiven : help_given;
  const helpOutShow = helpOutstandingProp != null ? helpOutstandingProp : help_outstanding;

  // Calculate allocation percentages
  const grossTotal = Math.max(1, total_sales + buying_cost);
  const buyingPct = Math.round((buying_cost / grossTotal) * 100);
  const profitPct = Math.round((Math.max(0, net_profit) / grossTotal) * 100);

  return (
    <div className={`panel-flat cashflow-panel${compact ? ' is-compact' : ''}${embedded ? ' is-embedded' : ''}`}>
      {/* Top Header Banner */}
      {!embedded && (
        <div className="panel-flat-head" style={{ alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <h3 className="panel-flat-title" style={{ margin: 0 }}>
                <ArrowDownUp size={18} style={{ color: 'var(--accent-teal)' }} /> Cashflow & Operating Balance
              </h3>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 750,
                  padding: '0.15rem 0.5rem',
                  borderRadius: 999,
                  background: activePeriod.isMaster ? 'rgba(212, 175, 55, 0.15)' : 'rgba(45, 212, 191, 0.15)',
                  color: activePeriod.isMaster ? '#eab308' : 'var(--accent-teal)',
                  border: `1px solid ${activePeriod.isMaster ? 'rgba(212, 175, 55, 0.3)' : 'rgba(45, 212, 191, 0.3)'}`,
                }}
              >
                {activePeriod.label}
              </span>
            </div>
            <p className="panel-flat-sub" style={{ marginTop: '0.2rem' }}>
              Incoming sales vs Saudia buying costs · Personal loans separated
            </p>
          </div>

          {/* Action Buttons Toolbar */}
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap', alignItems: 'center' }}>
            {/* 1. MASTER DOWNLOAD BUTTON (ALL TIME FROM BEGINNING) */}
            <div style={{ position: 'relative' }} ref={masterMenuRef}>
              <button
                type="button"
                className="btn-primary"
                style={{
                  width: 'auto',
                  minHeight: 34,
                  padding: '0.35rem 0.8rem',
                  fontSize: '0.76rem',
                  fontWeight: 750,
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  border: 'none',
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
                disabled={Boolean(exportingState)}
                onClick={() => setShowMasterMenu((prev) => !prev)}
                title="Download complete Master Cashflow from beginning of time"
              >
                {exportingState?.startsWith('master') ? (
                  <RefreshCw className="spin" size={13} />
                ) : (
                  <Sparkles size={13} style={{ color: '#fef08a' }} />
                )}
                <span>Master Download (All Time)</span>
                <ChevronDown size={12} />
              </button>

              {showMasterMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '0.35rem',
                    background: 'var(--surface-dropdown, #1e293b)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 10,
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
                    minWidth: 230,
                    zIndex: 50,
                    padding: '0.4rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                  }}
                >
                  <div style={{ padding: '0.35rem 0.55rem', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    All-Time Master Downloads
                  </div>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ justifyContent: 'flex-start', padding: '0.45rem 0.6rem', fontSize: '0.76rem', gap: '0.5rem', width: '100%', textAlign: 'left', borderRadius: 6 }}
                    onClick={() => handleExportMaster('pdf')}
                  >
                    <FileText size={14} style={{ color: '#eab308' }} />
                    <div>
                      <div style={{ fontWeight: 700 }}>Master PDF Statement (A4)</div>
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Complete multi-page history</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ justifyContent: 'flex-start', padding: '0.45rem 0.6rem', fontSize: '0.76rem', gap: '0.5rem', width: '100%', textAlign: 'left', borderRadius: 6 }}
                    onClick={() => handleExportMaster('mobile')}
                  >
                    <Smartphone size={14} style={{ color: 'var(--accent-teal)' }} />
                    <div>
                      <div style={{ fontWeight: 700 }}>Master Mobile View Download</div>
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Phone-optimized mobile PDF pass</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* 2. SPECIFIC PERIOD DOWNLOAD BUTTON */}
            <div style={{ position: 'relative' }} ref={exportMenuRef}>
              <button
                type="button"
                className="btn-secondary"
                style={{
                  width: 'auto',
                  minHeight: 34,
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.75rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  borderColor: 'var(--border-color)',
                }}
                disabled={Boolean(exportingState)}
                onClick={() => setShowExportMenu((prev) => !prev)}
                title="Download Statement for the selected period"
              >
                {exportingState?.startsWith('period') ? (
                  <RefreshCw className="spin" size={13} />
                ) : (
                  <Download size={13} />
                )}
                <span>Export Period</span>
                <ChevronDown size={12} />
              </button>

              {showExportMenu && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '0.35rem',
                    background: 'var(--surface-dropdown, #1e293b)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 10,
                    boxShadow: '0 10px 25px rgba(0, 0, 0, 0.4)',
                    minWidth: 220,
                    zIndex: 50,
                    padding: '0.4rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.25rem',
                  }}
                >
                  <div style={{ padding: '0.35rem 0.55rem', fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    {activePeriod.label} Exports
                  </div>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ justifyContent: 'flex-start', padding: '0.45rem 0.6rem', fontSize: '0.76rem', gap: '0.5rem', width: '100%', textAlign: 'left', borderRadius: 6 }}
                    onClick={() => handleExportPeriod('pdf')}
                  >
                    <FileText size={14} style={{ color: 'var(--status-paid)' }} />
                    <div>
                      <div style={{ fontWeight: 700 }}>Period PDF Statement</div>
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Formal A4 report for {activePeriod.label}</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ justifyContent: 'flex-start', padding: '0.45rem 0.6rem', fontSize: '0.76rem', gap: '0.5rem', width: '100%', textAlign: 'left', borderRadius: 6 }}
                    onClick={() => handleExportPeriod('csv')}
                  >
                    <FileSpreadsheet size={14} style={{ color: '#38bdf8' }} />
                    <div>
                      <div style={{ fontWeight: 700 }}>Period CSV Spreadsheet</div>
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Structured Excel / CSV ledger</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ justifyContent: 'flex-start', padding: '0.45rem 0.6rem', fontSize: '0.76rem', gap: '0.5rem', width: '100%', textAlign: 'left', borderRadius: 6 }}
                    onClick={() => handleExportPeriod('mobile')}
                  >
                    <Smartphone size={14} style={{ color: 'var(--accent-teal)' }} />
                    <div>
                      <div style={{ fontWeight: 700 }}>Period Mobile Pass</div>
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)' }}>Quick mobile receipt pass</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Refresh button */}
            <button
              type="button"
              className="btn-secondary"
              style={{ width: 'auto', minHeight: 34, padding: '0.35rem 0.7rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              disabled={loading}
              onClick={() => load(periodFilter, customStart, customEnd)}
            >
              <RefreshCw size={13} className={loading ? 'spin' : undefined} /> <span>Refresh</span>
            </button>
          </div>
        </div>
      )}

      {/* PERIOD FILTER SELECTOR BAR */}
      <div
        style={{
          background: 'var(--surface-muted)',
          borderRadius: 12,
          padding: '0.6rem 0.75rem',
          margin: '0.75rem 0',
          border: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.5rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.76rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
            <CalendarDays size={15} style={{ color: 'var(--accent-teal)' }} />
            <span>Select Period:</span>
          </div>

          {/* Quick Period Filter Pills */}
          <div className="chart-pill-group" role="group" aria-label="Cashflow Period" style={{ flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`chart-pill-btn${periodFilter === 'all' ? ' is-active' : ''}`}
              onClick={() => handlePeriodChange('all')}
              title="All-Time from Beginning"
            >
              All Time
            </button>
            <button
              type="button"
              className={`chart-pill-btn${periodFilter === 'today' ? ' is-active' : ''}`}
              onClick={() => handlePeriodChange('today')}
              title="Today Only"
            >
              Today
            </button>
            <button
              type="button"
              className={`chart-pill-btn${periodFilter === 'yesterday' ? ' is-active' : ''}`}
              onClick={() => handlePeriodChange('yesterday')}
              title="Yesterday Only"
            >
              Yesterday
            </button>
            <button
              type="button"
              className={`chart-pill-btn${periodFilter === '7d' ? ' is-active' : ''}`}
              onClick={() => handlePeriodChange('7d')}
              title="Last 7 Days"
            >
              7D
            </button>
            <button
              type="button"
              className={`chart-pill-btn${periodFilter === '14d' ? ' is-active' : ''}`}
              onClick={() => handlePeriodChange('14d')}
              title="Last 14 Days"
            >
              14D
            </button>
            <button
              type="button"
              className={`chart-pill-btn${periodFilter === '30d' ? ' is-active' : ''}`}
              onClick={() => handlePeriodChange('30d')}
              title="Last 30 Days"
            >
              30D
            </button>
            <button
              type="button"
              className={`chart-pill-btn${periodFilter === 'this_month' ? ' is-active' : ''}`}
              onClick={() => handlePeriodChange('this_month')}
              title="This Current Month"
            >
              This Month
            </button>
            <button
              type="button"
              className={`chart-pill-btn${periodFilter === 'custom' ? ' is-active' : ''}`}
              onClick={() => handlePeriodChange('custom')}
              title="Pick Custom Date Range"
            >
              Custom Range…
            </button>
          </div>
        </div>

        {/* Custom Date Range Selector Form */}
        {(showCustomPicker || periodFilter === 'custom') && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.6rem',
              paddingTop: '0.5rem',
              borderTop: '1px dashed var(--border-subtle)',
              marginTop: '0.2rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>From:</span>
              <input
                type="date"
                className="input-field"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                style={{ minHeight: 30, padding: '0.25rem 0.5rem', fontSize: '0.78rem', width: 'auto' }}
              />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.78rem' }}>
              <span style={{ color: 'var(--text-secondary)' }}>To:</span>
              <input
                type="date"
                className="input-field"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                style={{ minHeight: 30, padding: '0.25rem 0.5rem', fontSize: '0.78rem', width: 'auto' }}
              />
            </div>
            <button
              type="button"
              className="btn-primary"
              style={{ width: 'auto', minHeight: 30, padding: '0.25rem 0.75rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
              onClick={applyCustomRange}
            >
              <Check size={13} /> Apply Range
            </button>
          </div>
        )}

        {/* Active Range Subtitle Banner */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.74rem', color: 'var(--text-secondary)', flexWrap: 'wrap', gap: '0.4rem' }}>
          <span>
            Active Scope: <strong style={{ color: 'var(--text-primary)' }}>{activePeriod.label}</strong>
            {activePeriod.dateRangeStr && <span> ({activePeriod.dateRangeStr})</span>}
          </span>
          <span style={{ color: 'var(--accent-teal)' }}>
            Showing <strong>{daily_trend.length}</strong> active trading day{daily_trend.length === 1 ? '' : 's'}
          </span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="cashflow-stats-grid">
        <div className="cashflow-stat-box">
          <div className="cashflow-stat-title">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-paid)' }} />
            Sales (in)
          </div>
          <div className="cashflow-stat-num" style={{ color: 'var(--status-paid)' }}>
            {formatCurrency(currencySymbol, total_sales)}
          </div>
        </div>

        <div className="cashflow-stat-box">
          <div className="cashflow-stat-title">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f43f5e' }} />
            Saudia buying
          </div>
          <div className="cashflow-stat-num" style={{ color: '#f43f5e' }}>
            {formatCurrency(currencySymbol, buying_cost)}
          </div>
        </div>

        <div className="cashflow-stat-box">
          <div className="cashflow-stat-title">
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: net_profit >= 0 ? '#10b981' : '#ef4444' }} />
            Est. profit
          </div>
          <div className="cashflow-stat-num" style={{ color: net_profit >= 0 ? '#10b981' : '#ef4444' }}>
            {formatCurrency(currencySymbol, net_profit)}
          </div>
        </div>

        <div className="cashflow-stat-box">
          <div className="cashflow-stat-title">Paid / due</div>
          <div className="cashflow-stat-num" style={{ fontSize: '0.92rem', color: 'var(--text-primary)' }}>
            {formatCurrency(currencySymbol, paid_sales)} <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>/</span> <span style={{ color: pending_sales > 0 ? 'var(--warning)' : 'inherit' }}>{formatCurrency(currencySymbol, pending_sales)}</span>
          </div>
        </div>

        <div className="cashflow-stat-box">
          <div className="cashflow-stat-title">Help given</div>
          <div className="cashflow-stat-num" style={{ fontSize: '0.92rem', color: 'var(--accent-teal)' }}>
            {formatCurrency(currencySymbol, helpGivenShow)}
          </div>
        </div>

        <div className="cashflow-stat-box">
          <div className="cashflow-stat-title">Help outstanding</div>
          <div className="cashflow-stat-num" style={{ fontSize: '0.92rem', color: helpOutShow > 0 ? '#f59e0b' : 'var(--text-secondary)' }}>
            {formatCurrency(currencySymbol, helpOutShow)}
          </div>
        </div>
      </div>

      {/* Visual Cashflow Distribution Bar */}
      <div className="cashflow-distribution-card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', fontWeight: 800 }}>
          <span style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Cash Flow Distribution ({activePeriod.label})</span>
          <span style={{ color: 'var(--accent-teal)', fontSize: '0.75rem', fontWeight: 750 }}>
            {total_sales > 0 ? `Profit Margin: ${((net_profit / total_sales) * 100).toFixed(1)}%` : '0%'}
          </span>
        </div>

        <div className="cashflow-allocation-bar">
          <div className="cashflow-alloc-segment" style={{ width: `${buyingPct}%`, background: '#f43f5e' }} title={`Saudia Buying: ${buyingPct}%`} />
          <div className="cashflow-alloc-segment" style={{ width: `${profitPct}%`, background: '#10b981' }} title={`Net Profit: ${profitPct}%`} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.5rem', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f43f5e' }} />
            Saudia Buying: {formatCurrency(currencySymbol, buying_cost)} ({buyingPct}%)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#10b981' }} />
            Net Profit: {formatCurrency(currencySymbol, net_profit)} ({profitPct}%)
          </span>
        </div>
      </div>

      {/* Daily Financial Breakdown */}
      <DailyFinancialBreakdown data={daily_trend.length ? daily_trend : []} currencySymbol={currencySymbol} />

      {!compact && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem', margin: '1rem 0 0.5rem 0' }}>
            <h4 className="panel-flat-section" style={{ margin: 0 }}>
              Recent money flow {money_flow.length > 0 && <span style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>({money_flow.length} items)</span>}
            </h4>
            <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn-secondary"
                style={{ width: 'auto', minHeight: 30, padding: '0.25rem 0.65rem', fontSize: '0.74rem' }}
                onClick={() => handleExportPeriod('csv')}
              >
                <FileSpreadsheet size={13} /> Export Stream CSV
              </button>
              {onNavigate && (
                <button type="button" className="btn-secondary" style={{ width: 'auto', minHeight: 30, padding: '0.25rem 0.65rem', fontSize: '0.74rem' }} onClick={() => onNavigate('create')}>
                  <TrendingUp size={13} /> New sale / buy bill
                </button>
              )}
            </div>
          </div>

          {money_flow.length === 0 ? (
            <EmptyState title="No bills found for this period" body="Try selecting a different date range or All Time." />
          ) : (
            <div className="mobile-card-list">
              {money_flow.slice(0, 60).map((row) => (
                <button
                  key={`${row.id}-${row.date}`}
                  type="button"
                  className="cashflow-flow-row"
                  onClick={() => openFlowBill(row)}
                >
                  <span className="cashflow-flow-copy">
                    <span className="cashflow-flow-top">
                      <span className={`type-badge ${billTypeBadgeClass(row)}`}>
                        {billTypeShortLabel(row)}
                      </span>
                      <span className="invoice-mono">{row.invoice_number}</span>
                      <span className="cashflow-flow-date">{row.date}</span>
                    </span>
                    <span className="cashflow-flow-comment">{row.comment}</span>
                  </span>
                  <span className="cashflow-flow-amt">
                    {isHelpBill(row)
                      ? `−${formatCurrency(currencySymbol, row.expenditure || 0)}`
                      : row.selling > 0
                        ? `+${formatCurrency(currencySymbol, row.selling)}`
                        : `−${formatCurrency(currencySymbol, row.buying)}`}
                  </span>
                  <ChevronRight className="cashflow-flow-chevron" size={16} aria-hidden />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default CashflowPanel;

