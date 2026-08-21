import { downloadBlob } from './downloadFile';
import { formatPkMoney } from './pakistan';

/** Escape a CSV cell (quotes, commas, newlines). */
export function csvEscape(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Build a UTF-8 CSV string (with BOM for Excel). */
export function buildCsv(headers, rows) {
  const lines = [
    headers.map(csvEscape).join(','),
    ...rows.map((row) => row.map(csvEscape).join(',')),
  ];
  return `\uFEFF${lines.join('\n')}`;
}

export async function downloadCsv(headers, rows, filename) {
  const csv = buildCsv(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  await downloadBlob(blob, filename, 'text/csv');
  return 'downloaded';
}

/** Format money for exports (thousands separators, no currency symbol clutter). */
export function exportMoney(amount) {
  return formatPkMoney(amount, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/**
 * Export a table as a multi-page PDF with proportional columns (avoids jammed numbers).
 * @param {number[]} [colWeights] relative widths per column
 */
export async function downloadTablePdf({
  title,
  subtitle = '',
  headers,
  rows,
  filename,
  landscape = false,
  colWeights = null,
}) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: landscape || headers.length > 6 ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 28;
  const usableWidth = pageWidth - margin * 2;
  const colCount = Math.max(headers.length, 1);
  const weights =
    Array.isArray(colWeights) && colWeights.length === colCount
      ? colWeights
      : headers.map(() => 1);
  const weightSum = weights.reduce((s, w) => s + (Number(w) || 1), 0) || colCount;
  const colWidths = weights.map((w) => (usableWidth * (Number(w) || 1)) / weightSum);
  const colX = [];
  {
    let x = margin;
    for (let i = 0; i < colCount; i += 1) {
      colX.push(x);
      x += colWidths[i];
    }
  }

  const rowMinH = 18;
  const headerH = 22;
  let y = margin;

  const clipText = (text, maxW) => {
    const s = String(text ?? '');
    const lines = pdf.splitTextToSize(s, Math.max(8, maxW));
    return lines;
  };

  const paintHeaderBand = () => {
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(17, 17, 17);
    pdf.text(String(title || 'Export'), margin, y);
    y += 15;
    if (subtitle) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(90, 90, 90);
      const subLines = pdf.splitTextToSize(String(subtitle), usableWidth);
      pdf.text(subLines, margin, y);
      y += subLines.length * 11 + 4;
    }
    pdf.setDrawColor(0, 179, 166);
    pdf.setLineWidth(2);
    pdf.line(margin, y, pageWidth - margin, y);
    y += 10;

    pdf.setFillColor(17, 17, 17);
    pdf.rect(margin, y, usableWidth, headerH, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(255, 255, 255);
    headers.forEach((h, i) => {
      const lines = clipText(h, colWidths[i] - 6);
      pdf.text(lines[0] || '', colX[i] + 3, y + 14);
    });
    y += headerH + 3;
  };

  const newPage = () => {
    pdf.addPage();
    y = margin;
    paintHeaderBand();
  };

  paintHeaderBand();

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(17, 17, 17);

  rows.forEach((row, rowIndex) => {
    const cellLines = row.map((cell, i) => clipText(cell, colWidths[i] - 6));
    let needed = rowMinH;
    cellLines.forEach((lines) => {
      needed = Math.max(needed, lines.length * 9 + 8);
    });

    if (y + needed > pageHeight - margin) newPage();

    if (rowIndex % 2 === 0) {
      pdf.setFillColor(248, 247, 243);
      pdf.rect(margin, y - 1, usableWidth, needed, 'F');
    }

    // vertical guides so columns stay readable
    pdf.setDrawColor(235, 233, 226);
    pdf.setLineWidth(0.3);
    for (let i = 1; i < colCount; i += 1) {
      pdf.line(colX[i], y - 1, colX[i], y + needed - 1);
    }

    cellLines.forEach((lines, i) => {
      pdf.setTextColor(17, 17, 17);
      pdf.text(lines, colX[i] + 3, y + 11);
    });

    y += needed;
    pdf.setDrawColor(220, 218, 210);
    pdf.setLineWidth(0.4);
    pdf.line(margin, y - 1, pageWidth - margin, y - 1);
  });

  const pageCount = pdf.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    pdf.setPage(p);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(140, 140, 140);
    pdf.text(`Page ${p} of ${pageCount}`, pageWidth - margin, pageHeight - 14, { align: 'right' });
  }

  const blob = pdf.output('blob');
  await downloadBlob(blob, filename, 'application/pdf');
  return 'downloaded';
}

/**
 * Generate a luxury 1-page Daily Profit & Sales Summary PDF report.
 */
export async function downloadDailyProfitSummaryPdf({
  companyName = 'ELITE CHOCOLATE',
  currencySymbol = 'Rs.',
  stats = {},
  bills = [],
  filename = 'Daily_Profit_Summary.pdf',
}) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 32;
  const usableW = pageWidth - margin * 2;
  let y = margin;

  // 1. Top Brand Banner
  pdf.setFillColor(20, 13, 9);
  pdf.roundedRect(margin, y, usableW, 58, 6, 6, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.setTextColor(212, 175, 55);
  pdf.text(String(companyName).toUpperCase(), margin + 14, y + 24);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(230, 220, 210);
  pdf.text('DAILY PERFORMANCE & PROFIT EXECUTIVE REPORT', margin + 14, y + 42);

  const nowStr = new Date().toLocaleDateString('en-PK', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(255, 255, 255);
  pdf.text(nowStr, pageWidth - margin - 14, y + 33, { align: 'right' });

  y += 72;

  // 2. KPI Cards Grid (4 boxes)
  const kpis = [
    { label: 'SALES TODAY', value: `${currencySymbol} ${exportMoney(stats.sales_today || 0)}`, color: [0, 179, 166] },
    { label: 'IMPORT / STOCK COST', value: `${currencySymbol} ${exportMoney(stats.cost_today || 0)}`, color: [100, 100, 100] },
    { label: 'NET PROFIT TODAY', value: `${currencySymbol} ${exportMoney(stats.profit_today || 0)}`, color: [34, 197, 94] },
    { label: 'PROFIT MARGIN', value: `${Number(stats.margin_today || 0).toFixed(1)}%`, color: [212, 175, 55] },
  ];

  const cardW = (usableW - 18) / 2;
  const cardH = 46;

  kpis.forEach((kpi, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const cx = margin + col * (cardW + 18);
    const cy = y + row * (cardH + 10);

    pdf.setFillColor(248, 247, 244);
    pdf.setDrawColor(220, 218, 210);
    pdf.roundedRect(cx, cy, cardW, cardH, 4, 4, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(110, 110, 110);
    pdf.text(kpi.label, cx + 10, cy + 16);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    pdf.text(kpi.value, cx + 10, cy + 34);
  });

  y += cardH * 2 + 22;

  // 3. Additional Financial Metrics Row
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(20, 20, 20);
  pdf.text("Today's Bills & Invoices", margin, y);
  y += 12;

  // 4. Bills Table
  const headers = ['Type', 'Invoice #', 'Customer / Party', 'Amount', 'Status'];
  const colWeights = [1.2, 1.6, 2.8, 1.8, 1.2];
  const weightSum = colWeights.reduce((a, b) => a + b, 0);
  const colWidths = colWeights.map((w) => (usableW * w) / weightSum);
  const colX = [];
  {
    let x = margin;
    for (let i = 0; i < headers.length; i += 1) {
      colX.push(x);
      x += colWidths[i];
    }
  }

  // Header band
  pdf.setFillColor(20, 13, 9);
  pdf.rect(margin, y, usableW, 20, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(212, 175, 55);
  headers.forEach((h, i) => {
    pdf.text(h, colX[i] + 4, y + 13);
  });
  y += 20;

  const todayBills = (bills || []).slice(0, 18);
  if (!todayBills.length) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9);
    pdf.setTextColor(130, 130, 130);
    pdf.text('No bills generated today so far.', margin + 8, y + 18);
    y += 30;
  } else {
    todayBills.forEach((b, rIdx) => {
      const bg = rIdx % 2 === 0 ? 255 : 249;
      pdf.setFillColor(bg, bg, bg);
      pdf.rect(margin, y, usableW, 20, 'F');

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(30, 30, 30);

      const typeStr = (b.bill_type || 'sale').toUpperCase();
      const invStr = String(b.invoice_number || '');
      const custStr = String(b.customer_name || 'Walk-in');
      const amtStr = `${currencySymbol} ${exportMoney(b.total_amount || 0)}`;
      const statusStr = (b.status || 'paid').toUpperCase();

      pdf.text(typeStr, colX[0] + 4, y + 13);
      pdf.text(invStr, colX[1] + 4, y + 13);
      pdf.text(custStr.substring(0, 24), colX[2] + 4, y + 13);
      pdf.setFont('helvetica', 'bold');
      pdf.text(amtStr, colX[3] + 4, y + 13);
      pdf.setFont('helvetica', 'normal');
      pdf.text(statusStr, colX[4] + 4, y + 13);

      y += 20;
    });
  }

  // Footer Note
  pdf.setDrawColor(212, 175, 55);
  pdf.setLineWidth(1);
  pdf.line(margin, y + 8, pageWidth - margin, y + 8);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(140, 140, 140);
  pdf.text('Generated with Elite Chocolate POS & Business Suite · Confidential Business Report', margin, y + 22);

  const blob = pdf.output('blob');
  await downloadBlob(blob, filename, 'application/pdf');
  return 'downloaded';
}

/**
 * Generate a luxury multi-section Executive Cashflow & Profit Statement PDF.
 */
export async function downloadCashflowReportPdf({
  companyName = 'ELITE CHOCOLATE',
  currencySymbol = 'Rs.',
  cashflow = {},
  dailyTrend = [],
  moneyFlow = [],
  filename = 'Cashflow_Statement.pdf',
}) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const margin = 32;
  const usableW = pageWidth - margin * 2;
  let y = margin;

  // 1. Top Brand Banner
  pdf.setFillColor(15, 23, 42);
  pdf.roundedRect(margin, y, usableW, 58, 6, 6, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(15);
  pdf.setTextColor(45, 212, 191);
  pdf.text(String(companyName).toUpperCase(), margin + 14, y + 24);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(226, 232, 240);
  pdf.text('EXECUTIVE CASHFLOW & PROFIT MARGIN STATEMENT', margin + 14, y + 42);

  const nowStr = new Date().toLocaleDateString('en-PK', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(255, 255, 255);
  pdf.text(nowStr, pageWidth - margin - 14, y + 33, { align: 'right' });

  y += 70;

  // 2. KPI Cards Grid (4 boxes)
  const totalSales = Number(cashflow.total_sales) || 0;
  const buyingCost = Number(cashflow.buying_cost) || 0;
  const netProfit = Number(cashflow.net_profit) || totalSales - buyingCost;
  const marginPct = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : '0.0';
  const helpOut = Number(cashflow.help_outstanding) || 0;

  const kpis = [
    { label: 'TOTAL SALES (INVOICED)', value: `${currencySymbol} ${exportMoney(totalSales)}`, color: [16, 185, 129] },
    { label: 'SAUDIA BUYING (EXPENSES)', value: `${currencySymbol} ${exportMoney(buyingCost)}`, color: [244, 63, 94] },
    { label: 'NET PROFIT RETAINED', value: `${currencySymbol} ${exportMoney(netProfit)}`, color: [14, 165, 233] },
    { label: 'PROFIT MARGIN %', value: `${marginPct}%`, color: [212, 175, 55] },
  ];

  const cardW = (usableW - 18) / 2;
  const cardH = 46;

  kpis.forEach((kpi, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const cx = margin + col * (cardW + 18);
    const cy = y + row * (cardH + 10);

    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(cx, cy, cardW, cardH, 4, 4, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(kpi.label, cx + 10, cy + 16);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12.5);
    pdf.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    pdf.text(kpi.value, cx + 10, cy + 34);
  });

  y += cardH * 2 + 18;

  // 3. Daily Breakdown Table
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text('Daily Cashflow & Margin Breakdown (Recent Activity)', margin, y);
  y += 10;

  const dayHeaders = ['Date', 'Sales In', 'Buying Out', 'Help Lent', 'Net Profit', 'Margin'];
  const dayColW = [usableW * 0.2, usableW * 0.18, usableW * 0.18, usableW * 0.15, usableW * 0.17, usableW * 0.12];
  const dayColX = [];
  {
    let x = margin;
    for (let i = 0; i < dayHeaders.length; i += 1) {
      dayColX.push(x);
      x += dayColW[i];
    }
  }

  // Header band
  pdf.setFillColor(30, 41, 59);
  pdf.rect(margin, y, usableW, 18, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(255, 255, 255);
  dayHeaders.forEach((h, i) => {
    pdf.text(h, dayColX[i] + 4, y + 12);
  });
  y += 18;

  const rows = (dailyTrend || []).slice(-10).reverse();
  if (!rows.length) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8.5);
    pdf.setTextColor(140, 140, 140);
    pdf.text('No daily cashflow records yet.', margin + 8, y + 16);
    y += 24;
  } else {
    rows.forEach((r, idx) => {
      const bg = idx % 2 === 0 ? 255 : 248;
      pdf.setFillColor(bg, bg, bg);
      pdf.rect(margin, y, usableW, 17, 'F');

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(30, 41, 59);

      const dSales = Number(r.sales) || 0;
      const dBuying = Number(r.buying) || 0;
      const dHelp = Number(r.help) || 0;
      const dProfit = Number(r.profit) || dSales - dBuying;
      const dMarg = dSales > 0 ? `${((dProfit / dSales) * 100).toFixed(1)}%` : '0%';

      pdf.text(String(r.date || ''), dayColX[0] + 4, y + 11);
      pdf.setTextColor(16, 185, 129);
      pdf.text(`${currencySymbol} ${exportMoney(dSales)}`, dayColX[1] + 4, y + 11);
      pdf.setTextColor(244, 63, 94);
      pdf.text(`${currencySymbol} ${exportMoney(dBuying)}`, dayColX[2] + 4, y + 11);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`${currencySymbol} ${exportMoney(dHelp)}`, dayColX[3] + 4, y + 11);
      pdf.setTextColor(dProfit >= 0 ? 16 : 239, dProfit >= 0 ? 185 : 68, dProfit >= 0 ? 129 : 68);
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${currencySymbol} ${exportMoney(dProfit)}`, dayColX[4] + 4, y + 11);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(30, 41, 59);
      pdf.text(dMarg, dayColX[5] + 4, y + 11);

      y += 17;
    });
  }

  y += 14;

  // 4. Recent Transactions Flow
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text('Recent Money Transactions', margin, y);
  y += 10;

  const flowHeaders = ['Type', 'Invoice #', 'Date', 'Party / Description', 'Amount'];
  const flowColW = [usableW * 0.15, usableW * 0.2, usableW * 0.18, usableW * 0.3, usableW * 0.17];
  const flowColX = [];
  {
    let x = margin;
    for (let i = 0; i < flowHeaders.length; i += 1) {
      flowColX.push(x);
      x += flowColW[i];
    }
  }

  pdf.setFillColor(30, 41, 59);
  pdf.rect(margin, y, usableW, 18, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(255, 255, 255);
  flowHeaders.forEach((h, i) => {
    pdf.text(h, flowColX[i] + 4, y + 12);
  });
  y += 18;

  const flowList = (moneyFlow || []).slice(0, 10);
  if (!flowList.length) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8.5);
    pdf.setTextColor(140, 140, 140);
    pdf.text('No recent transactions.', margin + 8, y + 16);
    y += 24;
  } else {
    flowList.forEach((f, idx) => {
      const bg = idx % 2 === 0 ? 255 : 248;
      pdf.setFillColor(bg, bg, bg);
      pdf.rect(margin, y, usableW, 17, 'F');

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(30, 41, 59);

      const tStr = (f.bill_type || 'sale').toUpperCase();
      const invStr = String(f.invoice_number || '');
      const dStr = String(f.date || '');
      const commStr = String(f.comment || '').substring(0, 32);
      const isHelp = tStr === 'HELP';
      const isBuy = tStr === 'SUPPLIER' || f.buying > 0;
      const amtNum = isHelp ? f.expenditure : isBuy ? f.buying : f.selling;
      const amtStr = `${isBuy || isHelp ? '−' : '+'}${currencySymbol} ${exportMoney(amtNum || 0)}`;

      pdf.text(tStr, flowColX[0] + 4, y + 11);
      pdf.text(invStr, flowColX[1] + 4, y + 11);
      pdf.text(dStr, flowColX[2] + 4, y + 11);
      pdf.text(commStr, flowColX[3] + 4, y + 11);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(isBuy || isHelp ? 244 : 16, isBuy || isHelp ? 63 : 185, isBuy || isHelp ? 94 : 129);
      pdf.text(amtStr, flowColX[4] + 4, y + 11);

      y += 17;
    });
  }

  // Footer line
  pdf.setDrawColor(45, 212, 191);
  pdf.setLineWidth(1);
  pdf.line(margin, y + 10, pageWidth - margin, y + 10);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(140, 140, 140);
  pdf.text('Generated with Elite Chocolate POS & Business Suite · Confidential Business Report', margin, y + 24);

  const blob = pdf.output('blob');
  await downloadBlob(blob, filename, 'application/pdf');
  return 'downloaded';
}

/**
 * Export Cashflow Transactions to CSV / Excel spreadsheet format.
 */
export async function downloadCashflowCsv({
  moneyFlow = [],
  dailyTrend = [],
  currencySymbol = 'Rs.',
  filename = 'Cashflow_Export.csv',
}) {
  const rows = [
    ['=== DAILY CASHFLOW SUMMARY ==='],
    ['Date', `Sales (${currencySymbol})`, `Buying (${currencySymbol})`, `Help Lent (${currencySymbol})`, `Net Profit (${currencySymbol})`],
  ];

  dailyTrend.forEach((d) => {
    rows.push([
      `"${d.date || ''}"`,
      d.sales || 0,
      d.buying || 0,
      d.help || 0,
      d.profit || 0,
    ]);
  });

  rows.push([]);
  rows.push(['=== TRANSACTION MONEY FLOW ===']);
  rows.push(['Date', 'Invoice #', 'Type', 'Description', 'Direction', `Amount (${currencySymbol})`]);

  moneyFlow.forEach((f) => {
    const isBuy = f.bill_type === 'supplier' || f.buying > 0;
    const isHelp = f.bill_type === 'help';
    const dir = isBuy ? 'OUT (Buying)' : isHelp ? 'OUT (Help)' : 'IN (Sales)';
    const amt = isHelp ? f.expenditure : isBuy ? f.buying : f.selling;
    rows.push([
      `"${f.date || ''}"`,
      `"${f.invoice_number || ''}"`,
      `"${f.bill_type || 'sale'}"`,
      `"${String(f.comment || '').replace(/"/g, '""')}"`,
      `"${dir}"`,
      amt || 0,
    ]);
  });

  const csvContent = rows.map((r) => r.join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  await downloadBlob(blob, filename, 'text/csv');
  return 'downloaded';
}

/**
 * Professional Multi-page PDF Generator for Partner Profit & Settlement Statement
 * (Nomi & Haris 50/50 Split with Itemized Order / Shipment Breakdown)
 */
export async function downloadPartnerReportPdf({
  periodLabel = 'All Time',
  dateRange = '',
  totalSales = 0,
  totalBuying = 0,
  netProfit = 0,
  profitMarginPct = 0,
  partners = [],
  orders = [],
  payouts = [],
  settlementInfo = null,
  currencySymbol = 'Rs.',
  filename = 'Partner_Profit_Statement.pdf',
}) {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 28;
  const usableW = pageWidth - margin * 2;
  let y = margin;

  const checkPageBreak = (neededHeight) => {
    if (y + neededHeight > pageHeight - margin) {
      pdf.addPage();
      y = margin + 10;
      return true;
    }
    return false;
  };

  // 1. Header Banner
  pdf.setFillColor(15, 23, 42); // slate-900
  pdf.rect(margin, y, usableW, 58, 'F');

  // Gold luxury accent line
  pdf.setFillColor(212, 175, 55); // 24k gold
  pdf.rect(margin, y + 55, usableW, 3, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13.5);
  pdf.setTextColor(255, 255, 255);
  pdf.text('ELITE CHOCOLATE · LUXURY CONFECTIONERY', margin + 14, y + 20);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9);
  pdf.setTextColor(212, 175, 55);
  pdf.text('MONTHLY PARTNER DIVIDEND & SETTLEMENT STATEMENT (50/50 EQUITY)', margin + 14, y + 34);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(148, 163, 184);
  pdf.text(`Period: ${periodLabel} ${dateRange ? `(${dateRange})` : ''} · Issue Date: ${new Date().toLocaleDateString('en-PK')}`, margin + 14, y + 48);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(45, 212, 191);
  pdf.text('NOMI & HARIS EQUITY', pageWidth - margin - 110, y + 20);

  y += 68;

  // 2. Financial Overview Cards (4 Columns)
  const cardW = (usableW - 18) / 4;
  const kpis = [
    { label: 'Total Sales', val: `${currencySymbol} ${exportMoney(totalSales)}`, color: [16, 185, 129] },
    { label: 'Buying Costs', val: `${currencySymbol} ${exportMoney(totalBuying)}`, color: [239, 68, 68] },
    { label: 'Net Profit', val: `${currencySymbol} ${exportMoney(netProfit)}`, color: [14, 165, 233] },
    { label: 'Profit Margin', val: `${profitMarginPct}%`, color: [168, 85, 247] },
  ];

  kpis.forEach((kpi, idx) => {
    const cx = margin + idx * (cardW + 6);
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(1);
    pdf.roundedRect(cx, y, cardW, 40, 4, 4, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text(kpi.label.toUpperCase(), cx + 8, y + 14);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    pdf.text(kpi.val, cx + 8, y + 30);
  });

  y += 50;

  // 3. Partner 50/50 Division Cards (Nomi & Haris)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(15, 23, 42);
  pdf.text('Partner 50/50 Profit Division Summary', margin, y);
  y += 10;

  const pCardW = (usableW - 10) / Math.max(1, partners.length);
  partners.forEach((p, idx) => {
    const px = margin + idx * (pCardW + 10);
    pdf.setFillColor(241, 245, 249);
    pdf.setDrawColor(203, 213, 225);
    pdf.roundedRect(px, y, pCardW, 52, 4, 4, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(15, 23, 42);
    pdf.text(`${p.name} (${p.profit_share_pct || 50}% Share)`, px + 10, y + 16);

    const shareAmt = p.share_amount !== undefined ? p.share_amount : (netProfit * (p.profit_share_pct || 50)) / 100;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(71, 85, 105);
    pdf.text(`Period Profit Share:`, px + 10, y + 30);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    pdf.setTextColor(16, 185, 129);
    pdf.text(`${currencySymbol} ${exportMoney(shareAmt)}`, px + 100, y + 30);

    if (p.current_balance !== undefined) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`All-Time Undrawn Balance: ${currencySymbol} ${exportMoney(p.current_balance)}`, px + 10, y + 44);
    }
  });

  y += 62;

  // 4. Settlement Checkpoint Banner if marked
  if (settlementInfo) {
    pdf.setFillColor(254, 243, 199);
    pdf.setDrawColor(245, 158, 11);
    pdf.roundedRect(margin, y, usableW, 26, 3, 3, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(180, 83, 9);
    pdf.text(`SETTLEMENT CHECKPOINT: ${settlementInfo.settlement_code || 'Settled'} · Notes: ${settlementInfo.notes || 'Settlement finalized up to this checkpoint.'}`, margin + 8, y + 16);
    y += 34;
  }

  // 5. Itemized Order & Shipment Profit Breakdown Table
  checkPageBreak(80);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(15, 23, 42);
  pdf.text(`Itemized Orders & Shipments Breakdown (${orders.length} transactions)`, margin, y);
  y += 10;

  const orderHeaders = ['Date', 'Invoice #', 'Type', 'Party / Shipment', 'Sales (Rs.)', 'Buying (Rs.)', 'Profit Effect', 'Status'];
  const orderColW = [usableW * 0.12, usableW * 0.15, usableW * 0.10, usableW * 0.24, usableW * 0.11, usableW * 0.10, usableW * 0.10, usableW * 0.08];
  const orderColX = [];
  {
    let curX = margin;
    for (let i = 0; i < orderHeaders.length; i += 1) {
      orderColX.push(curX);
      curX += orderColW[i];
    }
  }

  const paintOrderHeader = () => {
    pdf.setFillColor(30, 41, 59);
    pdf.rect(margin, y, usableW, 17, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(255, 255, 255);
    orderHeaders.forEach((h, i) => {
      pdf.text(h, orderColX[i] + 3, y + 11);
    });
    y += 17;
  };

  paintOrderHeader();

  if (!orders.length) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8);
    pdf.setTextColor(148, 163, 184);
    pdf.text('No transactions in this period.', margin + 8, y + 14);
    y += 20;
  } else {
    orders.forEach((o, idx) => {
      if (checkPageBreak(22)) {
        paintOrderHeader();
      }

      const bg = idx % 2 === 0 ? 255 : 248;
      pdf.setFillColor(bg, bg, bg);
      pdf.rect(margin, y, usableW, 16, 'F');

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(30, 41, 59);

      const dStr = String(o.bill_date || '');
      const invStr = String(o.invoice_number || '');
      const tStr = (o.bill_type || 'sale').toUpperCase();
      const partyStr = String(o.customer_name || '').substring(0, 22);
      const isBuy = o.is_supplier || o.bill_type === 'supplier';
      const isHelp = o.is_help || o.bill_type === 'help';

      const salesStr = isBuy || isHelp ? '−' : `${exportMoney(o.total_amount || 0)}`;
      const buyStr = isBuy ? `${exportMoney(o.total_amount || 0)}` : '−';
      const profitStr = isHelp ? 'Rs. 0' : isBuy ? `-Rs. ${exportMoney(o.total_amount)}` : `+Rs. ${exportMoney(o.total_amount)}`;

      const isSettled = Boolean(settlementInfo && (dStr < (settlementInfo.period_end || '') || (dStr === (settlementInfo.period_end || '') && Number(o.id) <= Number(settlementInfo.last_bill_id || Infinity))));
      const statusStr = isSettled ? 'Settled' : 'Unsettled';

      pdf.text(dStr, orderColX[0] + 2, y + 10);
      pdf.text(invStr, orderColX[1] + 2, y + 10);
      pdf.text(tStr, orderColX[2] + 2, y + 10);
      pdf.text(partyStr, orderColX[3] + 2, y + 10);
      pdf.text(salesStr, orderColX[4] + 2, y + 10);
      pdf.text(buyStr, orderColX[5] + 2, y + 10);

      pdf.setFont('helvetica', 'bold');
      if (isBuy) {
        pdf.setTextColor(239, 68, 68);
      } else {
        pdf.setTextColor(16, 185, 129);
      }
      pdf.text(profitStr, orderColX[6] + 2, y + 10);

      if (isSettled) {
        pdf.setTextColor(16, 185, 129);
      } else {
        pdf.setTextColor(217, 119, 6);
      }
      pdf.text(statusStr, orderColX[7] + 2, y + 10);

      y += 16;
    });
  }

  y += 16;

  // 6. Footer / Signatures
  checkPageBreak(65);
  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(1);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 12;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text('Partner Approval & Dividend Sign-off:', margin, y);
  y += 14;

  const sigBoxW = (usableW - 20) / 2;

  // Nomi signature box
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(margin, y, sigBoxW, 36, 3, 3, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(51, 65, 85);
  pdf.text('Partner: Nomi (50% Equity)', margin + 8, y + 12);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(148, 163, 184);
  pdf.text('Signature: __________________________  Date: _________', margin + 8, y + 26);

  // Haris signature box
  pdf.setFillColor(248, 250, 252);
  pdf.setDrawColor(226, 232, 240);
  pdf.roundedRect(margin + sigBoxW + 20, y, sigBoxW, 36, 3, 3, 'FD');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(51, 65, 85);
  pdf.text('Partner: Haris (50% Equity)', margin + sigBoxW + 28, y + 12);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(148, 163, 184);
  pdf.text('Signature: __________________________  Date: _________', margin + sigBoxW + 28, y + 26);

  const blob = pdf.output('blob');
  await downloadBlob(blob, filename, 'application/pdf');
  return 'downloaded';
}

/**
 * Export Partner Profit & Shipment Breakdown to CSV
 */
export async function downloadPartnerReportCsv({
  periodLabel = 'All Time',
  totalSales = 0,
  totalBuying = 0,
  netProfit = 0,
  partners = [],
  orders = [],
  currencySymbol = 'Rs.',
  filename = 'Partner_Profit_Export.csv',
  settlementInfo = null,
}) {
  const rows = [
    ['=== PARTNER PROFIT 50/50 SETTLEMENT STATEMENT ==='],
    ['Period', `"${periodLabel}"`],
    ['Total Sales', totalSales],
    ['Total Buying', totalBuying],
    ['Net Profit', netProfit],
    [],
    ['=== 50/50 PARTNER SHARES ==='],
    ['Partner Name', 'Share %', `Calculated Profit Share (${currencySymbol})`],
  ];

  partners.forEach((p) => {
    const shareAmt = (netProfit * (p.profit_share_pct || 50)) / 100;
    rows.push([`"${p.name}"`, `${p.profit_share_pct || 50}%`, shareAmt]);
  });

  rows.push([]);
  rows.push(['=== SHIPMENT & ORDER-BY-ORDER BREAKDOWN ===']);
  rows.push(['Date', 'Invoice #', 'Type', 'Party / Shipment', `Sales (${currencySymbol})`, `Buying (${currencySymbol})`, `Profit Effect (${currencySymbol})`, 'Settlement Status', 'Notes']);

  orders.forEach((o) => {
    const isBuy = o.is_supplier || o.bill_type === 'supplier';
    const isHelp = o.is_help || o.bill_type === 'help';
    const salesAmt = isBuy || isHelp ? 0 : o.total_amount;
    const buyingAmt = isBuy ? o.total_amount : 0;
    const profitEffect = isHelp ? 0 : isBuy ? -o.total_amount : o.total_amount;

    const isSettled = Boolean(settlementInfo && (String(o.bill_date || '') < (settlementInfo.period_end || '') || (String(o.bill_date || '') === (settlementInfo.period_end || '') && Number(o.id) <= Number(settlementInfo.last_bill_id || Infinity))));
    const statusLabel = isSettled ? 'Settled' : 'Unsettled';

    rows.push([
      `"${o.bill_date || ''}"`,
      `"${o.invoice_number || ''}"`,
      `"${o.bill_type || 'sale'}"`,
      `"${String(o.customer_name || '').replace(/"/g, '""')}"`,
      salesAmt,
      buyingAmt,
      profitEffect,
      `"${statusLabel}"`,
      `"${String(o.notes || '').replace(/"/g, '""')}"`,
    ]);
  });

  const csvContent = rows.map((r) => r.join(',')).join('\r\n');
  const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
  await downloadBlob(blob, filename, 'text/csv');
  return 'downloaded';
}



