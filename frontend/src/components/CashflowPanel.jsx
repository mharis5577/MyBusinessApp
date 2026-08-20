import React, { useEffect, useState } from 'react';
import { ArrowDownUp, BarChart2, ChevronRight, RefreshCw, TrendingUp, DollarSign, Wallet, Calendar } from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';
import { apiFetch } from '../api/client';
import { useToast } from '../toast/ToastContext';
import EmptyState from './EmptyState';
import { billTypeBadgeClass, billTypeShortLabel, isHelpBill } from '../utils/billTypes';

function CashflowChart({ data = [], currencySymbol = 'Rs.' }) {
  const [timeRange, setTimeRange] = useState('7d');
  const [chartMode, setChartMode] = useState('bars'); // 'bars' | 'trend' | 'cumulative'
  const [activeItem, setActiveItem] = useState(null);

  // Filter data based on selected time range
  const rangeLimit = timeRange === '7d' ? 7 : timeRange === '14d' ? 14 : 30;
  const chartData = data.slice(-rangeLimit);

  if (!chartData || chartData.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
        No transaction trend data available yet.
      </div>
    );
  }

  // Summary Metrics over the active range
  const totalPeriodSales = chartData.reduce((s, d) => s + (Number(d.sales) || 0), 0);
  const totalPeriodBuying = chartData.reduce((s, d) => s + (Number(d.buying) || 0), 0);
  const totalPeriodProfit = totalPeriodSales - totalPeriodBuying;
  const periodMargin = totalPeriodSales > 0 ? ((totalPeriodProfit / totalPeriodSales) * 100).toFixed(1) : '0.0';

  const avgSales = Math.round(totalPeriodSales / chartData.length);
  const avgBuying = Math.round(totalPeriodBuying / chartData.length);

  let peakDay = chartData[0];
  chartData.forEach((d) => {
    if ((Number(d.profit) || 0) > (Number(peakDay?.profit) || 0)) peakDay = d;
  });

  // Calculate Cumulative Series
  let runningBal = 0;
  const cumulativeData = chartData.map((d) => {
    runningBal += Number(d.profit) || 0;
    return { ...d, cumulative: runningBal };
  });

  // Scale calculations
  const maxBarVal = Math.max(
    1,
    ...chartData.map((d) => Math.max(Number(d.sales) || 0, Number(d.buying) || 0))
  );

  const maxTrendVal = Math.max(
    1,
    ...chartData.map((d) => Math.max(0, Number(d.profit) || 0))
  );

  const maxCumVal = Math.max(
    1,
    ...cumulativeData.map((d) => Math.max(0, Number(d.cumulative) || 0))
  );

  const activeMax = chartMode === 'bars' ? maxBarVal : chartMode === 'trend' ? maxTrendVal : maxCumVal;

  const svgWidth = Math.max(520, chartData.length * 64);
  const svgHeight = 210;
  const paddingTop = 20;
  const paddingBottom = 30;
  const paddingLeft = 46;
  const paddingRight = 16;
  const drawWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const groupSpacing = drawWidth / chartData.length;
  const barWidth = Math.min(16, groupSpacing * 0.3);

  // Helper for formatting currency abbreviations
  const fmtShort = (n) => {
    const num = Number(n) || 0;
    if (num >= 100000) return `${(num / 1000).toFixed(0)}k`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
    return String(Math.round(num));
  };

  // Generate SVG Points for Trend / Area Line
  const trendPoints = chartData.map((item, idx) => {
    const cx = paddingLeft + idx * groupSpacing + groupSpacing / 2;
    const val = chartMode === 'cumulative' ? cumulativeData[idx].cumulative : Number(item.profit) || 0;
    const cy = paddingTop + chartHeight - Math.max(0, (val / activeMax) * chartHeight);
    return { cx, cy, item };
  });

  const polylineStr = trendPoints.map((p) => `${p.cx},${p.cy}`).join(' ');
  const areaPathStr = trendPoints.length
    ? `M ${trendPoints[0].cx},${paddingTop + chartHeight} ` +
      trendPoints.map((p) => `L ${p.cx},${p.cy}`).join(' ') +
      ` L ${trendPoints[trendPoints.length - 1].cx},${paddingTop + chartHeight} Z`
    : '';

  return (
    <div className="cashflow-chart-container">
      {/* 1. Header & Controls */}
      <div className="cashflow-chart-header">
        <div className="cashflow-chart-title-group">
          <BarChart2 size={18} style={{ color: 'var(--accent-teal)' }} />
          <span className="cashflow-chart-title">Detailed Cashflow Analytics</span>
        </div>

        <div className="cashflow-chart-controls">
          {/* View Mode Toggle */}
          <div className="cashflow-chart-btn-group" role="group" aria-label="Chart Visualization Mode">
            <button
              type="button"
              className={`cashflow-chart-btn${chartMode === 'bars' ? ' is-active' : ''}`}
              onClick={() => setChartMode('bars')}
            >
              In vs Out Bars
            </button>
            <button
              type="button"
              className={`cashflow-chart-btn${chartMode === 'trend' ? ' is-active' : ''}`}
              onClick={() => setChartMode('trend')}
            >
              Profit Trend
            </button>
            <button
              type="button"
              className={`cashflow-chart-btn${chartMode === 'cumulative' ? ' is-active' : ''}`}
              onClick={() => setChartMode('cumulative')}
            >
              Cumulative
            </button>
          </div>

          {/* Time Range Filter */}
          <div className="cashflow-chart-btn-group" role="group" aria-label="Time range">
            <button
              type="button"
              className={`cashflow-chart-btn${timeRange === '7d' ? ' is-active' : ''}`}
              onClick={() => setTimeRange('7d')}
            >
              7D
            </button>
            <button
              type="button"
              className={`cashflow-chart-btn${timeRange === '14d' ? ' is-active' : ''}`}
              onClick={() => setTimeRange('14d')}
            >
              14D
            </button>
            <button
              type="button"
              className={`cashflow-chart-btn${timeRange === '30d' ? ' is-active' : ''}`}
              onClick={() => setTimeRange('30d')}
            >
              30D
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="cashflow-chart-legend" style={{ justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        <span className="cashflow-legend-item">
          <span className="cashflow-legend-dot is-sales" /> Sales In (Customer)
        </span>
        <span className="cashflow-legend-item">
          <span className="cashflow-legend-dot is-buying" /> Saudia Buying (Cost)
        </span>
        <span className="cashflow-legend-item">
          <span className="cashflow-legend-dot is-profit" /> Net Profit Line
        </span>
      </div>

      {/* 2. Responsive Interactive SVG Chart */}
      <div className="cashflow-chart-svg-wrap">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ width: '100%', height: 'auto', minWidth: '480px', display: 'block' }}
        >
          <defs>
            <linearGradient id="profitAreaGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="salesBarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
            <linearGradient id="buyingBarGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" />
              <stop offset="100%" stopColor="#e11d48" />
            </linearGradient>
          </defs>

          {/* Horizontal Grid & Y-Axis Labels */}
          {[1, 0.5, 0].map((ratio, i) => {
            const yPos = paddingTop + chartHeight * (1 - ratio);
            const valLabel = `${currencySymbol} ${fmtShort(activeMax * ratio)}`;
            return (
              <g key={i}>
                <line
                  x1={paddingLeft}
                  y1={yPos}
                  x2={svgWidth - paddingRight}
                  y2={yPos}
                  stroke="var(--border-color)"
                  strokeWidth="1"
                  strokeDasharray={ratio === 0 ? undefined : '3 3'}
                  opacity={ratio === 0 ? '0.8' : '0.45'}
                />
                <text
                  x={paddingLeft - 6}
                  y={yPos + 3.5}
                  textAnchor="end"
                  fill="var(--text-muted)"
                  fontSize="9.5"
                  fontWeight="600"
                  fontFamily="var(--font-mono, monospace)"
                >
                  {valLabel}
                </text>
              </g>
            );
          })}

          {/* A. Mode: DUAL BARS */}
          {chartMode === 'bars' &&
            chartData.map((item, idx) => {
              const centerX = paddingLeft + idx * groupSpacing + groupSpacing / 2;
              const salesH = Math.max(2, ((Number(item.sales) || 0) / activeMax) * chartHeight);
              const buyingH = Math.max(2, ((Number(item.buying) || 0) / activeMax) * chartHeight);

              const salesY = paddingTop + chartHeight - salesH;
              const buyingY = paddingTop + chartHeight - buyingH;

              const isHovered = activeItem?.date === item.date;

              const [, m, d] = String(item.date || '').split('-');
              const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
              const dateLabel = m && d ? `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]}` : item.date;

              return (
                <g
                  key={item.date || idx}
                  className="cashflow-bar-group"
                  onMouseEnter={() => setActiveItem(item)}
                  onTouchStart={() => setActiveItem(item)}
                >
                  {isHovered && (
                    <rect
                      x={centerX - groupSpacing / 2 + 2}
                      y={paddingTop - 6}
                      width={groupSpacing - 4}
                      height={chartHeight + 12}
                      fill="var(--accent-teal)"
                      opacity="0.09"
                      rx="6"
                    />
                  )}

                  {/* Sales Bar */}
                  <rect
                    x={centerX - barWidth - 2}
                    y={salesY}
                    width={barWidth}
                    height={salesH}
                    fill="url(#salesBarGrad)"
                    rx="3"
                  />

                  {/* Buying Bar */}
                  <rect
                    x={centerX + 2}
                    y={buyingY}
                    width={barWidth}
                    height={buyingH}
                    fill="url(#buyingBarGrad)"
                    rx="3"
                  />

                  {/* Date Label */}
                  <text
                    x={centerX}
                    y={svgHeight - 8}
                    textAnchor="middle"
                    fill={isHovered ? 'var(--text-primary)' : 'var(--text-secondary)'}
                    fontSize="10"
                    fontWeight={isHovered ? '800' : '600'}
                    fontFamily="var(--font-sans, sans-serif)"
                  >
                    {dateLabel}
                  </text>
                </g>
              );
            })}

          {/* B. Mode: TREND AREA OR CUMULATIVE */}
          {(chartMode === 'trend' || chartMode === 'cumulative') && (
            <g>
              {/* Gradient Area Fill */}
              {areaPathStr && <path d={areaPathStr} fill="url(#profitAreaGrad)" />}

              {/* Glowing Line */}
              {polylineStr && (
                <polyline
                  fill="none"
                  stroke="#0ea5e9"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  points={polylineStr}
                />
              )}

              {/* Data Marker Dots & Labels */}
              {trendPoints.map((p, idx) => {
                const isHovered = activeItem?.date === p.item.date;
                const [, m, d] = String(p.item.date || '').split('-');
                const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
                const dateLabel = m && d ? `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]}` : p.item.date;

                return (
                  <g
                    key={p.item.date || idx}
                    className="cashflow-bar-group"
                    onMouseEnter={() => setActiveItem(p.item)}
                    onTouchStart={() => setActiveItem(p.item)}
                  >
                    {isHovered && (
                      <line
                        x1={p.cx}
                        y1={paddingTop}
                        x2={p.cx}
                        y2={paddingTop + chartHeight}
                        stroke="var(--accent-teal)"
                        strokeWidth="1.5"
                        strokeDasharray="2 2"
                      />
                    )}

                    <circle
                      cx={p.cx}
                      cy={p.cy}
                      r={isHovered ? '6' : '4'}
                      fill="#0ea5e9"
                      stroke="#ffffff"
                      strokeWidth="2"
                    />

                    {/* Date label */}
                    <text
                      x={p.cx}
                      y={svgHeight - 8}
                      textAnchor="middle"
                      fill={isHovered ? 'var(--text-primary)' : 'var(--text-secondary)'}
                      fontSize="10"
                      fontWeight={isHovered ? '800' : '600'}
                    >
                      {dateLabel}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      </div>

      {/* 3. Interactive Inspector Card */}
      {activeItem && (
        <div
          style={{
            background: 'color-mix(in srgb, var(--accent-teal) 6%, var(--bg-secondary))',
            border: '1px solid color-mix(in srgb, var(--accent-teal) 25%, var(--border-color))',
            borderRadius: '12px',
            padding: '0.75rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.75rem',
            fontSize: '0.82rem',
            animation: 'card-fade-up 0.2s ease both',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontWeight: 800 }}>
            <Calendar size={15} style={{ color: 'var(--accent-teal)' }} />
            <span>{activeItem.date}</span>
            {activeItem.sales_count != null && (
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                ({activeItem.sales_count} sale{activeItem.sales_count === 1 ? '' : 's'})
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.1rem', flexWrap: 'wrap' }}>
            <span>
              Sales:{' '}
              <strong style={{ color: '#10b981', fontFamily: 'var(--font-mono)' }}>
                {formatCurrency(currencySymbol, activeItem.sales)}
              </strong>
            </span>
            <span>
              Buying:{' '}
              <strong style={{ color: '#f43f5e', fontFamily: 'var(--font-mono)' }}>
                {formatCurrency(currencySymbol, activeItem.buying)}
              </strong>
            </span>
            <span>
              Net Profit:{' '}
              <strong
                style={{
                  color: activeItem.profit >= 0 ? '#10b981' : '#ef4444',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {formatCurrency(currencySymbol, activeItem.profit)}
              </strong>
            </span>
          </div>
        </div>
      )}

      {/* 4. Quick Summary Metrics Row */}
      <div className="cashflow-metrics-row">
        <div className="cashflow-metric-card">
          <span className="cashflow-metric-label">Best Day</span>
          <span className="cashflow-metric-value" style={{ color: '#10b981' }}>
            {peakDay ? formatCurrency(currencySymbol, peakDay.profit) : '—'}
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>{peakDay?.date || ''}</span>
        </div>

        <div className="cashflow-metric-card">
          <span className="cashflow-metric-label">Avg Daily Sales</span>
          <span className="cashflow-metric-value">{formatCurrency(currencySymbol, avgSales)}</span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>over active {timeRange}</span>
        </div>

        <div className="cashflow-metric-card">
          <span className="cashflow-metric-label">Avg Daily Buying</span>
          <span className="cashflow-metric-value" style={{ color: 'var(--text-secondary)' }}>
            {formatCurrency(currencySymbol, avgBuying)}
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Saudia stock</span>
        </div>

        <div className="cashflow-metric-card">
          <span className="cashflow-metric-label">Period Margin</span>
          <span
            className="cashflow-metric-value"
            style={{ color: totalPeriodProfit >= 0 ? 'var(--accent-teal)' : '#ef4444' }}
          >
            {periodMargin}%
          </span>
          <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>
            Net {formatCurrency(currencySymbol, totalPeriodProfit)}
          </span>
        </div>
      </div>
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
              <ArrowDownUp size={17} /> Cashflow
            </h3>
            <p className="panel-flat-sub">Sales in vs Saudia buying · Help money is separate</p>
          </div>
          <button type="button" className="btn-secondary" style={{ width: 'auto', minHeight: 36, padding: '0.35rem 0.7rem', fontSize: '0.75rem' }} onClick={load}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      )}

      {embedded && (
        <div className="dash-dropdown-toolbar">
          <span>Sales · Saudia · Help out {formatCurrency(currencySymbol, helpOutShow)}</span>
          <button type="button" className="btn-secondary" style={{ width: 'auto', minHeight: 32, padding: '0.3rem 0.65rem', fontSize: '0.72rem' }} onClick={load}>
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="stats-grid stats-grid-quiet cashflow-stats">
        <div className="stat-card">
          <div className="stat-card-label">Sales (in)</div>
          <div className="stat-card-value" style={{ color: 'var(--status-paid)' }}>{formatCurrency(currencySymbol, total_sales)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Saudia buying</div>
          <div className="stat-card-value">{formatCurrency(currencySymbol, buying_cost)}</div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Est. profit</div>
          <div className="stat-card-value" style={{ color: net_profit >= 0 ? '#10b981' : '#ef4444' }}>
            {formatCurrency(currencySymbol, net_profit)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Paid / due</div>
          <div className="stat-card-value" style={{ fontSize: '0.95rem' }}>
            {formatCurrency(currencySymbol, paid_sales)} / {formatCurrency(currencySymbol, pending_sales)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Help given</div>
          <div className="stat-card-value" style={{ fontSize: '0.95rem' }}>
            {formatCurrency(currencySymbol, helpGivenShow)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-card-label">Help outstanding</div>
          <div className="stat-card-value" style={{ fontSize: '0.95rem', color: helpOutShow > 0 ? 'var(--warning)' : undefined }}>
            {formatCurrency(currencySymbol, helpOutShow)}
          </div>
        </div>
      </div>

      {/* Visual Cashflow Distribution Bar */}
      <div style={{ margin: '1rem 0 0.5rem', padding: '0.85rem 1rem', background: 'var(--bg-card)', border: '1px solid var(--border-color)', borderRadius: '12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.82rem', fontWeight: 800 }}>
          <span>Cash Flow Distribution</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
            {total_sales > 0 ? `Profit Margin: ${((net_profit / total_sales) * 100).toFixed(1)}%` : '0%'}
          </span>
        </div>

        <div className="cashflow-allocation-bar">
          <div className="cashflow-alloc-segment" style={{ width: `${buyingPct}%`, background: '#f43f5e' }} title={`Saudia Buying: ${buyingPct}%`} />
          <div className="cashflow-alloc-segment" style={{ width: `${profitPct}%`, background: '#10b981' }} title={`Net Profit: ${profitPct}%`} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.4rem', fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f43f5e' }} />
            Saudia Buying: {formatCurrency(currencySymbol, buying_cost)} ({buyingPct}%)
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: '#10b981' }} />
            Net Profit: {formatCurrency(currencySymbol, net_profit)} ({profitPct}%)
          </span>
        </div>
      </div>

      {/* Interactive Dual-Bar Chart */}
      <CashflowChart data={daily_trend.length ? daily_trend : []} currencySymbol={currencySymbol} />

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

