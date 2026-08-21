import React, { useMemo, useState, useEffect } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { TrendingUp, PieChart, BarChart3, Users2 } from 'lucide-react';
import { formatCurrency } from '../utils/pakistan';

// Register Chart.js modules
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function PartnerEquityCharts({ orders = [], summary = {}, partners = [], currencySymbol = 'Rs.' }) {
  // Theme observer for reactive Chart.js canvas redraw
  const [currentTheme, setCurrentTheme] = useState(() => {
    return typeof document !== 'undefined'
      ? document.documentElement.getAttribute('data-theme') || 'dark'
      : 'dark';
  });

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      const t = document.documentElement.getAttribute('data-theme') || 'dark';
      setCurrentTheme(t);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    return () => observer.disconnect();
  }, []);

  const isLight = currentTheme === 'light';
  const textColor = isLight ? '#0f172a' : '#f8fafc';
  const mutedColor = isLight ? '#334155' : '#cbd5e1';
  const gridColor = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.12)';
  const tooltipBg = isLight ? '#0f172a' : '#1e293b';
  const tooltipTitleColor = '#ffffff';
  const tooltipBodyColor = '#e2e8f0';

  // 1. Prepare Daily Aggregate Data for Trend Line & Bar Charts
  const dailyData = useMemo(() => {
    const map = {};
    // Sort orders chronological
    const sorted = [...orders].sort((a, b) => String(a.bill_date || '').localeCompare(String(b.bill_date || '')));

    sorted.forEach((order) => {
      const date = order.bill_date || 'Other';
      if (!map[date]) {
        map[date] = { sales: 0, buying: 0, profit: 0, count: 0 };
      }
      if (order.is_supplier) {
        map[date].buying += Number(order.total_amount) || 0;
      } else if (!order.is_help) {
        map[date].sales += Number(order.total_amount) || 0;
      }
      map[date].count += 1;
    });

    const labels = Object.keys(map);
    const salesArr = [];
    const buyingArr = [];
    const profitArr = [];
    const nomiCumArr = [];
    const harisCumArr = [];

    let cumNomi = 0;
    let cumHaris = 0;

    labels.forEach((date) => {
      const s = map[date].sales;
      const b = map[date].buying;
      const p = s - b;
      salesArr.push(s);
      buyingArr.push(b);
      profitArr.push(p);

      const half = Math.round((p / 2) * 100) / 100;
      cumNomi += half;
      cumHaris += half;
      nomiCumArr.push(cumNomi);
      harisCumArr.push(cumHaris);
    });

    return {
      labels: labels.length > 0 ? labels : ['No Data'],
      salesArr: salesArr.length > 0 ? salesArr : [0],
      buyingArr: buyingArr.length > 0 ? buyingArr : [0],
      profitArr: profitArr.length > 0 ? profitArr : [0],
      nomiCumArr: nomiCumArr.length > 0 ? nomiCumArr : [0],
      harisCumArr: harisCumArr.length > 0 ? harisCumArr : [0],
    };
  }, [orders]);

  // Chart 1: Revenue vs Cost vs Net Profit Trend
  const trendChartData = {
    labels: dailyData.labels,
    datasets: [
      {
        type: 'bar',
        label: 'Gross Sales',
        data: dailyData.salesArr,
        backgroundColor: 'rgba(59, 130, 246, 0.45)',
        borderColor: '#3b82f6',
        borderWidth: 1.5,
        borderRadius: 4,
      },
      {
        type: 'bar',
        label: 'Saudia Purchases (Cost)',
        data: dailyData.buyingArr,
        backgroundColor: 'rgba(239, 68, 68, 0.45)',
        borderColor: '#ef4444',
        borderWidth: 1.5,
        borderRadius: 4,
      },
      {
        type: 'line',
        label: 'Net Profit',
        data: dailyData.profitArr,
        borderColor: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointBackgroundColor: '#10b981',
        pointRadius: 4,
      },
    ],
  };

  // Chart 2: Cumulative 50/50 Growth Line
  const cumulativeChartData = {
    labels: dailyData.labels,
    datasets: [
      {
        label: 'Nomi (50% Cumulative)',
        data: dailyData.nomiCumArr,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: 4,
      },
      {
        label: 'Haris (50% Cumulative)',
        data: dailyData.harisCumArr,
        borderColor: '#14b8a6',
        backgroundColor: 'rgba(20, 184, 166, 0.08)',
        fill: true,
        tension: 0.35,
        borderWidth: 2.5,
        pointRadius: 4,
      },
    ],
  };

  // Chart 3: Doughnut Profit vs Cost Ratio
  const totalSales = Number(summary.total_sales) || 0;
  const totalBuying = Number(summary.total_buying) || 0;
  const netProfit = Number(summary.net_profit) || 0;

  const doughnutData = {
    labels: ['Saudia Buying Cost', 'Net Partnership Profit'],
    datasets: [
      {
        data: [
          totalBuying > 0 ? totalBuying : 1,
          netProfit > 0 ? netProfit : (totalSales > 0 ? 0 : 1),
        ],
        backgroundColor: ['rgba(239, 68, 68, 0.8)', 'rgba(16, 185, 129, 0.85)'],
        borderColor: ['#ef4444', '#10b981'],
        borderWidth: 2,
        hoverOffset: 6,
      },
    ],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          color: textColor,
          font: { size: 11, weight: '700', family: 'Outfit, sans-serif' },
          boxWidth: 12,
          padding: 10,
        },
      },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: tooltipTitleColor,
        bodyColor: tooltipBodyColor,
        borderColor: isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.18)',
        borderWidth: 1,
        titleFont: { size: 12, weight: '700', family: 'Outfit, sans-serif' },
        bodyFont: { size: 12, family: 'Outfit, sans-serif' },
        padding: 10,
        cornerRadius: 8,
        callbacks: {
          label: (ctx) => {
            const val = ctx.parsed.y !== undefined ? ctx.parsed.y : ctx.parsed;
            return ` ${ctx.dataset.label || ctx.label}: ${formatCurrency(currencySymbol, val, { maximumFractionDigits: 0 })}`;
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: gridColor },
        ticks: { color: mutedColor, font: { size: 10, weight: '600' } },
      },
      y: {
        grid: { color: gridColor },
        ticks: {
          color: mutedColor,
          font: { size: 10, weight: '600' },
          callback: (v) => formatCurrency(currencySymbol, v, { maximumFractionDigits: 0 }),
        },
      },
    },
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: textColor,
          font: { size: 11, weight: '700', family: 'Outfit, sans-serif' },
          padding: 14,
        },
      },
      tooltip: {
        backgroundColor: tooltipBg,
        titleColor: tooltipTitleColor,
        bodyColor: tooltipBodyColor,
        borderColor: isLight ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.18)',
        borderWidth: 1,
        callbacks: {
          label: (ctx) => {
            const val = ctx.raw || 0;
            const pct = totalSales > 0 ? ((val / totalSales) * 100).toFixed(1) : '50.0';
            return ` ${ctx.label}: ${formatCurrency(currencySymbol, val, { maximumFractionDigits: 0 })} (${pct}%)`;
          },
        },
      },
    },
    cutout: '68%',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', marginTop: '0.5rem', paddingBottom: '3.5rem' }}>
      {/* 2-Column Analytics Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem' }}>
        
        {/* Chart 1: Revenue vs Cost vs Profit */}
        <div
          className="glass-panel"
          style={{
            padding: '1.25rem',
            borderRadius: 'var(--radius-lg, 16px)',
            background: 'var(--card-bg, rgba(255,255,255,0.03))',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart3 size={17} style={{ color: 'var(--accent-teal, #14b8a6)' }} />
              <strong style={{ fontSize: '0.9rem' }}>Profit & Cost Trajectory</strong>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Daily / Order timeline</span>
          </div>

          <div style={{ height: '230px', position: 'relative' }}>
            <Bar key={`bar-${currentTheme}`} data={trendChartData} options={chartOptions} />
          </div>
        </div>

        {/* Chart 2: Cumulative Dividend Growth (50/50) */}
        <div
          className="glass-panel"
          style={{
            padding: '1.25rem',
            borderRadius: 'var(--radius-lg, 16px)',
            background: 'var(--card-bg, rgba(255,255,255,0.03))',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <TrendingUp size={17} style={{ color: '#3b82f6' }} />
              <strong style={{ fontSize: '0.9rem' }}>Nomi & Haris Cumulative Earnings</strong>
            </div>
            <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>50/50 Growth curve</span>
          </div>

          <div style={{ height: '230px', position: 'relative' }}>
            <Line key={`line-${currentTheme}`} data={cumulativeChartData} options={chartOptions} />
          </div>
        </div>
      </div>

      {/* Row 2: Profit Margin Breakdown Donut + Summary Key Metrics */}
      <div
        className="glass-panel"
        style={{
          padding: '1.25rem',
          borderRadius: 'var(--radius-lg, 16px)',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '1.25rem',
          alignItems: 'center',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <PieChart size={17} style={{ color: '#10b981' }} />
            <strong style={{ fontSize: '0.92rem' }}>Cost vs Operating Margin Ratio</strong>
          </div>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.4 }}>
            Visualizes the ratio of Saudia cargo buying costs against your net take-home partnership profit for this period.
          </p>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ padding: '0.6rem 0.8rem', borderRadius: 8, background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <div style={{ fontSize: '0.7rem', color: '#ef4444', fontWeight: 700 }}>Buying Cost</div>
              <div style={{ fontSize: '1rem', fontWeight: 800 }}>{formatCurrency(currencySymbol, totalBuying, { maximumFractionDigits: 0 })}</div>
            </div>
            <div style={{ padding: '0.6rem 0.8rem', borderRadius: 8, background: 'rgba(16, 185, 129, 0.08)', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
              <div style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: 700 }}>Net Profit (50/50 Pool)</div>
              <div style={{ fontSize: '1rem', fontWeight: 800 }}>{formatCurrency(currencySymbol, netProfit, { maximumFractionDigits: 0 })}</div>
            </div>
          </div>
        </div>

        <div style={{ height: '190px', position: 'relative' }}>
          <Doughnut key={`donut-${currentTheme}`} data={doughnutData} options={doughnutOptions} />
          {/* Centered Margin Text */}
          <div
            style={{
              position: 'absolute',
              top: '42%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              textAlign: 'center',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: netProfit >= 0 ? '#10b981' : '#ef4444' }}>
              {summary.profit_margin_pct ?? 0}%
            </div>
            <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>
              Margin
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
