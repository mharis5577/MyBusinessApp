import React, { useEffect, useState } from 'react';
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
  Download,
  FileSpreadsheet,
  CheckCircle2,
  Package,
  Layers,
  ArrowUpRight,
  ArrowDownRight
} from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import EmptyState from './EmptyState';
import { billTypeBadgeClass, billTypeShortLabel, isHelpBill } from '../utils/billTypes';
import { downloadCashflowReportPdf } from '../utils/tableExport';

/**
 * Modern Stripe/Shopify-style Financial Breakdown & Daily Profit Ledger
 * Replaces clunky SVG graphs with a clean, fully responsive daily timeline.
 */
function DailyFinancialBreakdown({ data = [], currencySymbol = 'Rs.' }) {
  const [timeRange, setTimeRange] = useState('7d');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'profitable' | 'costs'
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setCurrentPage(1);
  }, [timeRange, filterMode]);

  // Filter data based on selected time range
  const rangeLimit =
    timeRange === '1d'
      ? 1
      : timeRange === '7d'
      ? 7
      : timeRange === '14d'
      ? 14
      : timeRange === '30d'
      ? 30
      : 999;
  const filteredTimeline = (data || []).slice(-rangeLimit).reverse();

  const totalPeriodSales = filteredTimeline.reduce((s, d) => s + (Number(d.sales) || 0), 0);
  const totalPeriodBuying = filteredTimeline.reduce((s, d) => s + (Number(d.buying) || 0), 0);
  const totalPeriodProfit = totalPeriodSales - totalPeriodBuying;
  const periodMargin = totalPeriodSales > 0 ? ((totalPeriodProfit / totalPeriodSales) * 100).toFixed(1) : '0.0';

  if (!filteredTimeline || filteredTimeline.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
        No financial timeline data recorded yet.
      </div>
    );
  }

  const displayedRows = filteredTimeline.filter((item) => {
    if (filterMode === 'profitable') return (Number(item.profit) || 0) > 0;
    if (filterMode === 'costs') return (Number(item.buying) || 0) > 0;
    return true;
  });

  const pageSize = 3;
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
        </div>

        <div className="cashflow-chart-controls">
          {/* Time Range Filter */}
          <div className="chart-pill-group" role="group" aria-label="Time Range">
            <button
              type="button"
              className={`chart-pill-btn${timeRange === '1d' ? ' is-active' : ''}`}
              onClick={() => setTimeRange('1d')}
              title="Today (1 Day)"
            >
              1D
            </button>
            <button
              type="button"
              className={`chart-pill-btn${timeRange === '7d' ? ' is-active' : ''}`}
              onClick={() => setTimeRange('7d')}
            >
              7D
            </button>
            <button
              type="button"
              className={`chart-pill-btn${timeRange === '14d' ? ' is-active' : ''}`}
              onClick={() => setTimeRange('14d')}
            >
              14D
            </button>
            <button
              type="button"
              className={`chart-pill-btn${timeRange === '30d' ? ' is-active' : ''}`}
              onClick={() => setTimeRange('30d')}
            >
              30D
            </button>
            <button
              type="button"
              className={`chart-pill-btn${timeRange === 'all' ? ' is-active' : ''}`}
              onClick={() => setTimeRange('all')}
            >
              All
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
          <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', fontWeight: 650 }}>Sales Revenue</div>
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

      {/* 3. Daily Ledger Cards List — 3 per page */}
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

      {/* Pagination Page Shifter — Max 3 Days per Page */}
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

              {/* Page Number Buttons */}
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

export default function CashflowPanel({
  currencySymbol = 'Rs.',
  compact = false,
  onNavigate,
  onViewBill,
  embedded = false,
  helpGiven,
  helpOutstanding: helpOutstandingProp,
}) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await apiFetch(compact ? '/api/cashflow?compact=1' : '/api/cashflow');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setData(json);
    } catch (err) {
      toast.error(err.message || 'Cashflow load failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [compact]);

  const openFlowBill = (row) => {
    if (!row?.id) return;
    if (onViewBill) onViewBill(row);
    else if (onNavigate) onNavigate('database');
  };

  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      await downloadCashflowReportPdf({
        companyName: 'ELITE CHOCOLATE',
        currencySymbol,
        cashflow: data,
        dailyTrend: data?.daily_trend || [],
        moneyFlow: data?.money_flow || [],
        filename: `Cashflow_Statement_${new Date().toISOString().slice(0, 10)}.pdf`,
      });
      toast.success('Cashflow PDF Statement downloaded!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to generate PDF statement');
    } finally {
      setExportingPdf(false);
    }
  };

  if (loading && !data) {
    return (
      <div className={`panel-flat${embedded ? ' is-embedded' : ''}`} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1rem 0' }}>
        <RefreshCw className="spin" size={20} /> Loading cashflow…
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

  const helpGivenShow = helpGiven != null ? helpGiven : help_given;
  const helpOutShow = helpOutstandingProp != null ? helpOutstandingProp : help_outstanding;

  // Calculate allocation percentages
  const grossTotal = Math.max(1, total_sales + buying_cost);
  const buyingPct = Math.round((buying_cost / grossTotal) * 100);
  const profitPct = Math.round((Math.max(0, net_profit) / grossTotal) * 100);

  return (
    <div className={`panel-flat cashflow-panel${compact ? ' is-compact' : ''}${embedded ? ' is-embedded' : ''}`}>
      {!embedded && (
        <div className="panel-flat-head">
          <div>
            <h3 className="panel-flat-title">
              <ArrowDownUp size={17} /> Cashflow & Operating Balance
            </h3>
            <p className="panel-flat-sub">Sales in vs Saudia buying · Help money is separate</p>
          </div>
          <div style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn-primary"
              style={{ width: 'auto', minHeight: 34, padding: '0.35rem 0.75rem', fontSize: '0.75rem' }}
              disabled={exportingPdf}
              onClick={handleExportPdf}
            >
              <Download size={14} /> {exportingPdf ? 'Exporting PDF…' : 'PDF Statement'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ width: 'auto', minHeight: 34, padding: '0.35rem 0.7rem', fontSize: '0.75rem' }}
              onClick={load}
            >
              <RefreshCw size={14} /> Refresh
            </button>
          </div>
        </div>
      )}

      {embedded && (
        <div className="dash-dropdown-toolbar">
          <span>Sales · Saudia · Help out {formatCurrency(currencySymbol, helpOutShow)}</span>
          <div style={{ display: 'flex', gap: '0.35rem' }}>
            <button
              type="button"
              className="btn-primary"
              style={{ width: 'auto', minHeight: 30, padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}
              disabled={exportingPdf}
              onClick={handleExportPdf}
            >
              <Download size={13} /> PDF
            </button>
            <button
              type="button"
              className="btn-secondary"
              style={{ width: 'auto', minHeight: 30, padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}
              onClick={load}
            >
              <RefreshCw size={13} /> Refresh
            </button>
          </div>
        </div>
      )}

      {/* KPI Cards */}
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
          <span style={{ color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>Cash Flow Distribution</span>
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

      {/* Modern Daily Financial Breakdown (Replaces clunky SVG graph) */}
      <DailyFinancialBreakdown data={daily_trend.length ? daily_trend : []} currencySymbol={currencySymbol} />

      {!compact && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', margin: '0.85rem 0' }}>
            {onNavigate && (
              <button type="button" className="btn-secondary" style={{ width: 'auto' }} onClick={() => onNavigate('create')}>
                <TrendingUp size={14} /> New sale / buy bill
              </button>
            )}
          </div>
          <h4 className="panel-flat-section">Recent money flow</h4>
          {money_flow.length === 0 ? (
            <EmptyState title="No bills yet" body="Cashflow appears after you save sales, Saudia buys, or help loans." />
          ) : (
            <div className="mobile-card-list">
              {money_flow.slice(0, 40).map((row) => (
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
