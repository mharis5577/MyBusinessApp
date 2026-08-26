import { downloadBlob } from './downloadFile';
import { formatPkMoney } from './pakistan';

/** Escape a CSV cell (quotes, commas, newlines). */
export function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r\t]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** Build a clean standard RFC-4180 UTF-8 CSV string (with BOM). */
export function buildCsv(headers, rows) {
  const lines = [];
  if (Array.isArray(headers) && headers.length > 0) {
    lines.push(headers.map(csvEscape).join(','));
  }
  if (Array.isArray(rows)) {
    rows.forEach((row) => {
      if (Array.isArray(row)) {
        lines.push(row.map(csvEscape).join(','));
      }
    });
  }
  return `\uFEFF${lines.join('\r\n')}`;
}

export async function downloadCsv(headers, rows, filename = 'Export.csv') {
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
 * World-Class Multi-Page Table PDF Generator
 * Built with luxury branding, financial KPI banner cards, aligned numbers, status pills, and page footers.
 */
export async function downloadTablePdf({
  title = 'Elite Chocolate — Document Export',
  subtitle = '',
  headers = [],
  rows = [],
  filename = 'Document_Export.pdf',
  landscape = false,
  colWeights = null,
  summaryCards = null,
  currencySymbol = 'Rs.',
}) {
  const { jsPDF } = await import('jspdf');
  const isLandscape = landscape || headers.length > 6;
  const pdf = new jsPDF({
    orientation: isLandscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 28;
  const usableWidth = pageWidth - margin * 2;
  const colCount = Math.max(headers.length, 1);

  // Derive column alignments from header names
  const colAlignments = headers.map((h) => {
    const s = String(h || '').toLowerCase();
    if (
      s.includes('total') ||
      s.includes('paid') ||
      s.includes('balance') ||
      s.includes('subtotal') ||
      s.includes('amount') ||
      s.includes('cost') ||
      s.includes('sales') ||
      s.includes('buying') ||
      s.includes('profit') ||
      s.includes('price') ||
      s.includes('share') ||
      s.includes('rs.')
    ) {
      return 'right';
    }
    if (
      s.includes('invoice') ||
      s.includes('date') ||
      s.includes('time') ||
      s.includes('status') ||
      s.includes('category') ||
      s.includes('type') ||
      s.includes('#')
    ) {
      return 'center';
    }
    return 'left';
  });

  const weights =
    Array.isArray(colWeights) && colWeights.length === colCount
      ? colWeights
      : headers.map((h, i) => (colAlignments[i] === 'left' ? 1.4 : 1.0));
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

  const rowMinH = 19;
  const headerH = 22;
  let y = margin;

  const clipText = (text, maxW) => {
    const s = String(text ?? '');
    return pdf.splitTextToSize(s, Math.max(8, maxW));
  };

  const drawHeaderBand = (isFirstPage = true) => {
    // 1. Executive Top Header Banner
    pdf.setFillColor(15, 23, 42); // slate-900
    pdf.roundedRect(margin, y, usableWidth, 48, 5, 5, 'F');

    // Gold / Teal Luxury Accent Strip
    pdf.setFillColor(212, 175, 55); // 24k Gold
    pdf.rect(margin, y + 46, usableWidth, 2.5, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12.5);
    pdf.setTextColor(255, 255, 255);
    pdf.text(String(title || 'Elite Chocolate Report').toUpperCase(), margin + 14, y + 20);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(148, 163, 184);
    const sub = subtitle || `Generated on ${new Date().toLocaleDateString('en-PK')} · Confidential`;
    pdf.text(String(sub), margin + 14, y + 36);

    // Document Badge on Right
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(45, 212, 191);
    pdf.text('ELITE CHOCOLATE POS', pageWidth - margin - 110, y + 22);

    y += 58;

    // 2. Financial Summary Cards (if first page and cards exist)
    if (isFirstPage && Array.isArray(summaryCards) && summaryCards.length > 0) {
      const cardCount = Math.min(4, summaryCards.length);
      const gap = 8;
      const cardW = (usableWidth - (cardCount - 1) * gap) / cardCount;
      const cardH = 36;

      summaryCards.slice(0, cardCount).forEach((c, idx) => {
        const cx = margin + idx * (cardW + gap);
        pdf.setFillColor(248, 250, 252);
        pdf.setDrawColor(226, 232, 240);
        pdf.roundedRect(cx, y, cardW, cardH, 3, 3, 'FD');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.8);
        pdf.setTextColor(100, 116, 139);
        pdf.text(String(c.label || '').toUpperCase(), cx + 8, y + 12);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(10.5);
        if (c.color) {
          pdf.setTextColor(c.color[0], c.color[1], c.color[2]);
        } else {
          pdf.setTextColor(15, 23, 42);
        }
        pdf.text(String(c.value || ''), cx + 8, y + 28);
      });

      y += cardH + 12;
    }

    // 3. Table Column Header Row
    pdf.setFillColor(30, 41, 59); // slate-800
    pdf.rect(margin, y, usableWidth, headerH, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.8);
    pdf.setTextColor(212, 175, 55); // Gold headers

    headers.forEach((h, i) => {
      const align = colAlignments[i];
      const lines = clipText(h, colWidths[i] - 8);
      let tx = colX[i] + 4;
      if (align === 'right') {
        tx = colX[i] + colWidths[i] - 4;
      } else if (align === 'center') {
        tx = colX[i] + colWidths[i] / 2;
      }
      pdf.text(lines[0] || '', tx, y + 14, { align });
    });

    y += headerH;
  };

  const newPage = () => {
    pdf.addPage();
    y = margin;
    drawHeaderBand(false);
  };

  drawHeaderBand(true);

  // Table Data Rows
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);

  let totalNumericCols = {};

  rows.forEach((row, rowIndex) => {
    const cellLines = row.map((cell, i) => clipText(cell, colWidths[i] - 8));
    let neededH = rowMinH;
    cellLines.forEach((lines) => {
      neededH = Math.max(neededH, lines.length * 8.5 + 9);
    });

    if (y + neededH > pageHeight - margin - 25) {
      newPage();
    }

    // Zebra striping
    const isAlt = rowIndex % 2 === 1;
    pdf.setFillColor(isAlt ? 248 : 255, isAlt ? 250 : 255, isAlt ? 252 : 255);
    pdf.rect(margin, y, usableWidth, neededH, 'F');

    // Horizontal Row Border
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.4);
    pdf.line(margin, y + neededH, pageWidth - margin, y + neededH);

    // Draw cells
    row.forEach((cell, i) => {
      const align = colAlignments[i];
      const str = String(cell ?? '');
      const lines = cellLines[i];

      // Track numeric totals if column is right-aligned
      if (align === 'right') {
        const numVal = parseFloat(str.replace(/[^0-9.-]/g, ''));
        if (!isNaN(numVal)) {
          totalNumericCols[i] = (totalNumericCols[i] || 0) + numVal;
        }
      }

      // Check if status pill
      const lower = str.toLowerCase();
      if (align === 'center' && (lower === 'paid' || lower === 'due' || lower === 'cancelled' || lower === 'settled' || lower === 'unsettled')) {
        const isGreen = lower === 'paid' || lower === 'settled';
        const isAmber = lower === 'due' || lower === 'unsettled';
        const isRed = lower === 'cancelled' || lower === 'canceled';

        const pillW = Math.min(colWidths[i] - 6, 48);
        const pillH = 13;
        const px = colX[i] + (colWidths[i] - pillW) / 2;
        const py = y + (neededH - pillH) / 2;

        if (isGreen) {
          pdf.setFillColor(220, 252, 231);
          pdf.setDrawColor(187, 247, 208);
          pdf.setTextColor(22, 163, 74);
        } else if (isAmber) {
          pdf.setFillColor(254, 243, 199);
          pdf.setDrawColor(253, 230, 138);
          pdf.setTextColor(180, 83, 9);
        } else {
          pdf.setFillColor(241, 245, 249);
          pdf.setDrawColor(226, 232, 240);
          pdf.setTextColor(100, 116, 139);
        }

        pdf.roundedRect(px, py, pillW, pillH, 2, 2, 'FD');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.5);
        pdf.text(str.toUpperCase(), px + pillW / 2, py + 9.5, { align: 'center' });
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
      } else {
        pdf.setTextColor(15, 23, 42);
        let tx = colX[i] + 4;
        if (align === 'right') {
          tx = colX[i] + colWidths[i] - 4;
        } else if (align === 'center') {
          tx = colX[i] + colWidths[i] / 2;
        }
        pdf.text(lines, tx, y + 12, { align });
      }
    });

    y += neededH;
  });

  // 4. Grand Totals Summary Row at Bottom of Table
  const hasTotals = Object.keys(totalNumericCols).length > 0;
  if (hasTotals) {
    if (y + 22 > pageHeight - margin - 20) {
      newPage();
    }

    pdf.setFillColor(241, 245, 249);
    pdf.rect(margin, y, usableWidth, 20, 'F');

    pdf.setDrawColor(15, 23, 42);
    pdf.setLineWidth(1.2);
    pdf.line(margin, y, pageWidth - margin, y);
    pdf.line(margin, y + 20, pageWidth - margin, y + 20);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text(`TOTALS (${rows.length} Records)`, margin + 6, y + 13);

    headers.forEach((h, i) => {
      if (totalNumericCols[i] !== undefined) {
        const sumVal = totalNumericCols[i];
        const sumStr = `${exportMoney(sumVal)}`;
        const tx = colX[i] + colWidths[i] - 4;
        pdf.text(sumStr, tx, y + 13, { align: 'right' });
      }
    });

    y += 26;
  }

  // 5. Page Numbering & Bottom Brand Footer on All Pages
  const pageCount = pdf.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    pdf.setPage(p);

    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.5);
    pdf.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(148, 163, 184);
    pdf.text('Elite Chocolate POS & Ledger Suite · Confidential', margin, pageHeight - 10);
    pdf.text(`Page ${p} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
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
  pdf.setFillColor(15, 23, 42); // slate-900
  pdf.roundedRect(margin, y, usableW, 58, 6, 6, 'F');

  // Gold luxury accent line
  pdf.setFillColor(212, 175, 55); // 24k Gold
  pdf.rect(margin, y + 55, usableW, 3, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14.5);
  pdf.setTextColor(255, 255, 255);
  pdf.text(String(companyName).toUpperCase(), margin + 14, y + 22);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(212, 175, 55);
  pdf.text('DAILY PERFORMANCE & EXECUTIVE PROFIT REPORT', margin + 14, y + 36);

  const nowStr = new Date().toLocaleDateString('en-PK', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(203, 213, 225);
  pdf.text(nowStr, pageWidth - margin - 14, y + 28, { align: 'right' });

  y += 72;

  // 2. KPI Cards Grid (4 boxes)
  const kpis = [
    { label: 'SALES TODAY', value: `${currencySymbol} ${exportMoney(stats.sales_today || 0)}`, color: [16, 185, 129] },
    { label: 'STOCK / BUYING COST', value: `${currencySymbol} ${exportMoney(stats.cost_today || 0)}`, color: [239, 68, 68] },
    { label: 'NET PROFIT TODAY', value: `${currencySymbol} ${exportMoney(stats.profit_today || 0)}`, color: [14, 165, 233] },
    { label: 'PROFIT MARGIN', value: `${Number(stats.margin_today || 0).toFixed(1)}%`, color: [212, 175, 55] },
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
    pdf.setFontSize(7.2);
    pdf.setTextColor(100, 116, 139);
    pdf.text(kpi.label, cx + 10, cy + 15);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    pdf.text(kpi.value, cx + 10, cy + 34);
  });

  y += 2 * (cardH + 10) + 12;

  // 3. Section Title: Today's Invoices
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(15, 23, 42);
  pdf.text("Today's Invoices & Retail Transactions", margin, y);
  y += 10;

  // 4. Table Header
  const headers = ['Time', 'Invoice #', 'Customer / Party', 'Items', 'Amount', 'Status'];
  const colW = [usableW * 0.12, usableW * 0.18, usableW * 0.32, usableW * 0.1, usableW * 0.16, usableW * 0.12];
  const colX = [];
  {
    let x = margin;
    for (let i = 0; i < colW.length; i += 1) {
      colX.push(x);
      x += colW[i];
    }
  }

  pdf.setFillColor(30, 41, 59);
  pdf.rect(margin, y, usableW, 18, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(212, 175, 55);
  headers.forEach((h, i) => {
    const align = i === 4 ? 'right' : i === 0 || i === 1 || i === 3 || i === 5 ? 'center' : 'left';
    let tx = colX[i] + 4;
    if (align === 'right') tx = colX[i] + colW[i] - 4;
    else if (align === 'center') tx = colX[i] + colW[i] / 2;
    pdf.text(h, tx, y + 12, { align });
  });
  y += 18;

  // 5. Table Rows (limit to first 12 today)
  const todayBills = (bills || []).slice(0, 14);

  if (!todayBills.length) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8.5);
    pdf.setTextColor(140, 140, 140);
    pdf.text('No sales recorded today yet.', margin + 8, y + 20);
    y += 30;
  } else {
    todayBills.forEach((b, idx) => {
      const isAlt = idx % 2 === 1;
      pdf.setFillColor(isAlt ? 248 : 255, isAlt ? 250 : 255, isAlt ? 252 : 255);
      pdf.rect(margin, y, usableW, 17, 'F');

      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.4);
      pdf.line(margin, y + 17, margin + usableW, y + 17);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(15, 23, 42);

      const timeStr = String(b.bill_time || '').slice(0, 5) || '—';
      const invStr = String(b.invoice_number || '—');
      const custStr = String(b.customer_name || 'Walk-in Customer').substring(0, 28);
      const itemsCount = String(b.items?.length || 1);
      const amtStr = `${currencySymbol} ${exportMoney(b.total_amount || 0)}`;
      const statusStr = (b.status || 'paid').toUpperCase();

      pdf.text(timeStr, colX[0] + colW[0] / 2, y + 11.5, { align: 'center' });
      pdf.text(invStr, colX[1] + colW[1] / 2, y + 11.5, { align: 'center' });
      pdf.text(custStr, colX[2] + 4, y + 11.5, { align: 'left' });
      pdf.text(itemsCount, colX[3] + colW[3] / 2, y + 11.5, { align: 'center' });

      pdf.setFont('helvetica', 'bold');
      pdf.text(amtStr, colX[4] + colW[4] - 4, y + 11.5, { align: 'right' });

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      if (statusStr === 'PAID') pdf.setTextColor(22, 163, 74);
      else if (statusStr === 'CANCELLED') pdf.setTextColor(239, 68, 68);
      else pdf.setTextColor(217, 119, 6);
      pdf.text(statusStr, colX[5] + colW[5] / 2, y + 11.5, { align: 'center' });

      y += 17;
    });
  }

  // Footer Line & Branding
  pdf.setDrawColor(212, 175, 55);
  pdf.setLineWidth(1.5);
  pdf.line(margin, y + 10, pageWidth - margin, y + 10);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(148, 163, 184);
  pdf.text('Generated by Elite Chocolate Business Engine · Confidential', margin, y + 24);

  const blob = pdf.output('blob');
  await downloadBlob(blob, filename, 'application/pdf');
  return 'downloaded';
}

/**
 * Generate a luxury Cashflow Statement PDF report (supports Formal A4 Document and FinTech Mobile Pass format).
 * Supports period-specific reports and Master all-time comprehensive statements with multi-page pagination.
 */
export async function downloadCashflowReportPdf({
  companyName = 'ELITE CHOCOLATE',
  currencySymbol = 'Rs.',
  cashflow = {},
  dailyTrend = [],
  moneyFlow = [],
  isMobile = false,
  periodLabel = 'All Time',
  dateRange = '',
  isMaster = false,
  filename = 'Cashflow_Statement.pdf',
}) {
  const { jsPDF } = await import('jspdf');

  // ==========================================
  // 1. MOBILE FINTECH PASS FORMAT (Phone Size)
  // ==========================================
  if (isMobile) {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: [380, 850],
      compress: true,
    });

    const pageWidth = 380;
    const pageHeight = 850;
    const margin = 14;
    const usableW = pageWidth - margin * 2;
    let y = margin;

    // A. Mobile Pass Header Card
    pdf.setFillColor(15, 23, 42); // slate-900
    pdf.roundedRect(margin, y, usableW, 58, 8, 8, 'F');

    // Gold Accent Stripe
    pdf.setFillColor(212, 175, 55); // 24k Gold
    pdf.roundedRect(margin, y + 55, usableW, 3, 2, 2, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(255, 255, 255);
    pdf.text(String(companyName).toUpperCase(), margin + 12, y + 22);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.setTextColor(isMaster ? 212 : 45, isMaster ? 175 : 212, isMaster ? 55 : 191);
    pdf.text(isMaster ? 'MASTER CASHFLOW PASS (ALL-TIME)' : `CASHFLOW PASS · ${periodLabel.toUpperCase()}`, margin + 12, y + 36);

    const dateStr = new Date().toLocaleDateString('en-PK', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(203, 213, 225);
    pdf.text(dateStr, pageWidth - margin - 12, y + 26, { align: 'right' });

    y += 68;

    // B. Hero Net Profit Card
    const totalSales = Number(cashflow.total_sales || 0);
    const buyingCost = Number(cashflow.buying_cost || 0);
    const netProfit = Number(cashflow.net_profit || 0);
    const profitMargin = totalSales > 0 ? Math.round((netProfit / totalSales) * 100) : 0;

    pdf.setFillColor(240, 253, 244); // light emerald surface
    pdf.setDrawColor(187, 247, 208);
    pdf.setLineWidth(1);
    pdf.roundedRect(margin, y, usableW, 64, 8, 8, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(21, 128, 61); // emerald-700
    pdf.text('NET PROFIT RETAINED', margin + 14, y + 18);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(5, 150, 105); // emerald-600
    pdf.text(`${currencySymbol} ${exportMoney(netProfit)}`, margin + 14, y + 42);

    // Margin Pill on right
    pdf.setFillColor(16, 185, 129);
    pdf.roundedRect(pageWidth - margin - 88, y + 26, 74, 20, 10, 10, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.setTextColor(255, 255, 255);
    pdf.text(`${profitMargin}% Margin`, pageWidth - margin - 51, y + 39, { align: 'center' });

    y += 72;

    // C. 2x2 Metrics Grid Cards
    const metrics = [
      { label: 'SALES (INVOICED)', value: `${currencySymbol} ${exportMoney(totalSales)}`, color: [16, 185, 129] },
      { label: 'SAUDIA BUYING', value: `${currencySymbol} ${exportMoney(buyingCost)}`, color: [244, 63, 94] },
      { label: 'PAID COLLECTED', value: `${currencySymbol} ${exportMoney(cashflow.paid_sales || 0)}`, color: [14, 165, 233] },
      { label: 'RECEIVABLES / DUE', value: `${currencySymbol} ${exportMoney(cashflow.pending_sales || 0)}`, color: [234, 179, 8] },
    ];

    const cardW = (usableW - 8) / 2;
    const cardH = 42;

    metrics.forEach((m, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const cx = margin + col * (cardW + 8);
      const cy = y + row * (cardH + 7);

      pdf.setFillColor(248, 250, 252);
      pdf.setDrawColor(226, 232, 240);
      pdf.roundedRect(cx, cy, cardW, cardH, 6, 6, 'FD');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(6.8);
      pdf.setTextColor(100, 116, 139);
      pdf.text(m.label, cx + 8, cy + 14);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(m.color[0], m.color[1], m.color[2]);
      pdf.text(m.value, cx + 8, cy + 31);
    });

    y += 2 * (cardH + 7) + 8;

    // D. Visual Cashflow Split Bar
    const gross = Math.max(1, totalSales + buyingCost);
    const salesPct = Math.min(100, Math.max(0, Math.round((totalSales / gross) * 100)));
    const barW = usableW;
    const salesBarW = (barW * salesPct) / 100;

    pdf.setFillColor(244, 63, 94); // red/rose base
    pdf.roundedRect(margin, y, barW, 8, 4, 4, 'F');
    pdf.setFillColor(16, 185, 129); // green sales
    pdf.roundedRect(margin, y, Math.max(12, salesBarW), 8, 4, 4, 'F');

    y += 18;

    // E. Recent Transactions (Mobile Feed Cards)
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(15, 23, 42);
    pdf.text(isMaster ? 'HISTORICAL ACTIVITY FEED' : `PERIOD ACTIVITY FEED (${periodLabel})`, margin, y);
    y += 8;

    const feedList = (moneyFlow || []).slice(0, 11);
    if (!feedList.length) {
      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);
      pdf.text('No transaction records found.', margin + 8, y + 14);
      y += 22;
    } else {
      feedList.forEach((f) => {
        const isHelp = f.bill_type === 'help';
        const isBuy = f.bill_type === 'supplier' || f.buying > 0;
        const amtNum = isHelp ? f.expenditure : isBuy ? f.buying : f.selling;
        const amtStr = `${isBuy || isHelp ? '-' : '+'}${currencySymbol} ${exportMoney(amtNum || 0)}`;
        const typeLabel = isBuy ? 'BUY' : isHelp ? 'HELP' : 'SALE';

        // Card Container
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(226, 232, 240);
        pdf.roundedRect(margin, y, usableW, 32, 5, 5, 'FD');

        // Type Pill
        if (isBuy) pdf.setFillColor(254, 226, 226);
        else if (isHelp) pdf.setFillColor(254, 243, 199);
        else pdf.setFillColor(220, 252, 231);
        pdf.roundedRect(margin + 6, y + 6, 32, 12, 3, 3, 'F');

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6);
        if (isBuy) pdf.setTextColor(220, 38, 38);
        else if (isHelp) pdf.setTextColor(217, 119, 6);
        else pdf.setTextColor(22, 163, 74);
        pdf.text(typeLabel, margin + 22, y + 14.5, { align: 'center' });

        // Party / Customer Name
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7.8);
        pdf.setTextColor(15, 23, 42);
        const partyName = String(f.comment || 'Transaction').substring(0, 34);
        pdf.text(partyName, margin + 43, y + 14);

        // Sub Meta: Inv # and Date
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.8);
        pdf.setTextColor(100, 116, 139);
        pdf.text(`${f.invoice_number || '—'} · ${f.date || ''}`, margin + 43, y + 25);

        // Right Amount Badge
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9.5);
        if (isBuy || isHelp) pdf.setTextColor(225, 29, 72);
        else pdf.setTextColor(16, 185, 129);
        pdf.text(amtStr, pageWidth - margin - 8, y + 19, { align: 'right' });

        y += 36;
      });
    }

    // F. Mobile Pass Footer Stamp
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.5);
    pdf.line(margin, pageHeight - 24, pageWidth - margin, pageHeight - 24);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text('📱 Verified Mobile Cashflow Pass', margin, pageHeight - 12);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Elite Chocolate Suite', pageWidth - margin, pageHeight - 12, { align: 'right' });

    const blob = pdf.output('blob');
    await downloadBlob(blob, filename, 'application/pdf');
    return 'downloaded';
  }

  // ==========================================
  // 2. FORMAL A4 DOCUMENT FORMAT (Desktop/Print)
  // Multi-page supported for period and Master reports
  // ==========================================
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4',
    compress: true,
  });

  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 28;
  const usableW = pageWidth - margin * 2;
  let y = margin;

  const checkPageBreak = (neededH) => {
    if (y + neededH > pageHeight - margin - 25) {
      pdf.addPage();
      y = margin + 10;
      return true;
    }
    return false;
  };

  // 1. Header Banner
  pdf.setFillColor(15, 23, 42); // slate-900
  pdf.roundedRect(margin, y, usableW, 60, 6, 6, 'F');

  // Gold accent
  pdf.setFillColor(212, 175, 55);
  pdf.rect(margin, y + 57, usableW, 3, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(13.5);
  pdf.setTextColor(255, 255, 255);
  pdf.text(String(companyName).toUpperCase(), margin + 14, y + 22);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8.5);
  pdf.setTextColor(isMaster ? 212 : 45, isMaster ? 175 : 212, isMaster ? 55 : 191);
  pdf.text(
    isMaster
      ? 'MASTER CASHFLOW & ALL-TIME OPERATING STATEMENT'
      : `CASHFLOW & OPERATING FINANCIAL STATEMENT — ${String(periodLabel || 'PERIOD').toUpperCase()}`,
    margin + 14,
    y + 36
  );

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);
  pdf.setTextColor(148, 163, 184);
  const periodSub = dateRange
    ? `Period: ${periodLabel} (${dateRange}) · Generated ${new Date().toLocaleDateString('en-PK')}`
    : `Period: ${periodLabel} · Generated ${new Date().toLocaleDateString('en-PK')}`;
  pdf.text(periodSub, margin + 14, y + 49);

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(212, 175, 55);
  pdf.text(isMaster ? 'MASTER LEDGER' : 'PERIOD REPORT', pageWidth - margin - 90, y + 22);

  y += 74;

  // 2. Financial Overview Cards
  const totalSales = Number(cashflow.total_sales || 0);
  const buyingCost = Number(cashflow.buying_cost || 0);
  const netProfit = Number(cashflow.net_profit || 0);
  const helpGiven = Number(cashflow.help_given || 0);
  const profitMarginPct = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : '0.0';

  const kpis = [
    { label: 'TOTAL SALES (INVOICED)', value: `${currencySymbol} ${exportMoney(totalSales)}`, color: [16, 185, 129] },
    { label: 'SAUDIA BUYING (OUTFLOW)', value: `${currencySymbol} ${exportMoney(buyingCost)}`, color: [244, 63, 94] },
    { label: 'NET PROFIT RETAINED', value: `${currencySymbol} ${exportMoney(netProfit)} (${profitMarginPct}%)`, color: [14, 165, 233] },
    { label: 'HELP MONEY GIVEN (OUT)', value: `${currencySymbol} ${exportMoney(helpGiven)}`, color: [234, 179, 8] },
  ];

  const cardW = (usableW - 18) / 2;
  const cardH = 42;

  kpis.forEach((kpi, idx) => {
    const col = idx % 2;
    const row = Math.floor(idx / 2);
    const cx = margin + col * (cardW + 18);
    const cy = y + row * (cardH + 8);

    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(cx, cy, cardW, cardH, 4, 4, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text(kpi.label, cx + 10, cy + 14);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    pdf.text(kpi.value, cx + 10, cy + 30);
  });

  y += 2 * (cardH + 8) + 12;

  // 3. Daily Performance Table (Full Multi-Page Rendering)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text(`Daily Cashflow Trend Breakdown (${dailyTrend.length} Days)`, margin, y);
  y += 8;

  const dayHeaders = ['Date', 'Sales In', 'Saudia Buying', 'Help Out', 'Net Profit'];
  const dayColW = [usableW * 0.22, usableW * 0.2, usableW * 0.2, usableW * 0.18, usableW * 0.2];
  const dayColX = [];
  {
    let x = margin;
    for (let i = 0; i < dayHeaders.length; i += 1) {
      dayColX.push(x);
      x += dayColW[i];
    }
  }

  const drawDayHeader = () => {
    pdf.setFillColor(30, 41, 59);
    pdf.rect(margin, y, usableW, 16, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.2);
    pdf.setTextColor(212, 175, 55);
    dayHeaders.forEach((h, i) => {
      const align = i === 0 ? 'left' : 'right';
      const tx = align === 'right' ? dayColX[i] + dayColW[i] - 4 : dayColX[i] + 4;
      pdf.text(h, tx, y + 11.5, { align });
    });
    y += 16;
  };

  drawDayHeader();

  if (!dailyTrend.length) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8);
    pdf.setTextColor(140, 140, 140);
    pdf.text('No cashflow trend data recorded for this period.', margin + 8, y + 14);
    y += 22;
  } else {
    dailyTrend.forEach((t, idx) => {
      if (checkPageBreak(18)) {
        drawDayHeader();
      }

      const isAlt = idx % 2 === 1;
      pdf.setFillColor(isAlt ? 248 : 255, isAlt ? 250 : 255, isAlt ? 252 : 255);
      pdf.rect(margin, y, usableW, 15, 'F');

      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.4);
      pdf.line(margin, y + 15, margin + usableW, y + 15);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.2);
      pdf.setTextColor(15, 23, 42);

      const dSales = Number(t.sales || 0);
      const dBuying = Number(t.buying || 0);
      const dHelp = Number(t.help || 0);
      const dProfit = Number(t.profit || 0);

      pdf.text(String(t.date || '—'), dayColX[0] + 4, y + 10.5);
      pdf.text(`${currencySymbol} ${exportMoney(dSales)}`, dayColX[1] + dayColW[1] - 4, y + 10.5, { align: 'right' });
      pdf.text(`${currencySymbol} ${exportMoney(dBuying)}`, dayColX[2] + dayColW[2] - 4, y + 10.5, { align: 'right' });
      pdf.text(`${currencySymbol} ${exportMoney(dHelp)}`, dayColX[3] + dayColW[3] - 4, y + 10.5, { align: 'right' });

      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(dProfit >= 0 ? 16 : 239, dProfit >= 0 ? 185 : 68, dProfit >= 0 ? 129 : 68);
      pdf.text(`${currencySymbol} ${exportMoney(dProfit)}`, dayColX[4] + dayColW[4] - 4, y + 10.5, { align: 'right' });

      y += 15;
    });
  }

  y += 14;
  checkPageBreak(90);

  // 4. Recent Transactions Flow (Full Multi-Page Rendering)
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text(`Itemized Cashflow Transactions (${moneyFlow.length} Total)`, margin, y);
  y += 8;

  const flowHeaders = ['Type', 'Invoice #', 'Date', 'Party / Description', 'Amount'];
  const flowColW = [usableW * 0.12, usableW * 0.16, usableW * 0.14, usableW * 0.42, usableW * 0.16];
  const flowColX = [];
  {
    let x = margin;
    for (let i = 0; i < flowHeaders.length; i += 1) {
      flowColX.push(x);
      x += flowColW[i];
    }
  }

  const drawFlowHeader = () => {
    pdf.setFillColor(30, 41, 59);
    pdf.rect(margin, y, usableW, 16, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.2);
    pdf.setTextColor(212, 175, 55);
    flowHeaders.forEach((h, i) => {
      const align = i === 4 ? 'right' : i === 0 || i === 1 || i === 2 ? 'center' : 'left';
      const tx = align === 'right' ? flowColX[i] + flowColW[i] - 4 : align === 'center' ? flowColX[i] + flowColW[i] / 2 : flowColX[i] + 4;
      pdf.text(h, tx, y + 11.5, { align });
    });
    y += 16;
  };

  drawFlowHeader();

  if (!moneyFlow.length) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8);
    pdf.setTextColor(140, 140, 140);
    pdf.text('No transactions recorded for this period.', margin + 8, y + 14);
    y += 22;
  } else {
    moneyFlow.forEach((f, idx) => {
      if (checkPageBreak(18)) {
        drawFlowHeader();
      }

      const isAlt = idx % 2 === 1;
      pdf.setFillColor(isAlt ? 248 : 255, isAlt ? 250 : 255, isAlt ? 252 : 255);
      pdf.rect(margin, y, usableW, 15, 'F');

      pdf.setDrawColor(226, 232, 240);
      pdf.setLineWidth(0.4);
      pdf.line(margin, y + 15, margin + usableW, y + 15);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.2);
      pdf.setTextColor(15, 23, 42);

      const tStr = (f.bill_type || 'sale').toUpperCase();
      const invStr = String(f.invoice_number || '—');
      const dStr = String(f.date || '');
      const commStr = String(f.comment || '').substring(0, 60);
      const isHelp = tStr === 'HELP';
      const isBuy = tStr === 'SUPPLIER' || f.buying > 0;
      const amtNum = isHelp ? f.expenditure : isBuy ? f.buying : f.selling;
      const amtStr = `${isBuy || isHelp ? '-' : '+'}${currencySymbol} ${exportMoney(amtNum || 0)}`;

      pdf.text(tStr, flowColX[0] + flowColW[0] / 2, y + 10.5, { align: 'center' });
      pdf.text(invStr, flowColX[1] + flowColW[1] / 2, y + 10.5, { align: 'center' });
      pdf.text(dStr, flowColX[2] + flowColW[2] / 2, y + 10.5, { align: 'center' });
      pdf.text(commStr, flowColX[3] + 4, y + 10.5, { align: 'left' });

      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(isBuy || isHelp ? 244 : 16, isBuy || isHelp ? 63 : 185, isBuy || isHelp ? 94 : 129);
      pdf.text(amtStr, flowColX[4] + flowColW[4] - 4, y + 10.5, { align: 'right' });

      y += 15;
    });
  }

  // Page Footers on All Pages
  const pageCount = pdf.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    pdf.setPage(p);
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.5);
    pdf.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(148, 163, 184);
    pdf.text(
      isMaster
        ? 'Elite Chocolate POS & Business Suite · Master All-Time Cashflow Ledger · Confidential'
        : `Elite Chocolate POS & Business Suite · Cashflow Report (${periodLabel}) · Confidential`,
      margin,
      pageHeight - 10
    );
    pdf.text(`Page ${p} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
  }

  const blob = pdf.output('blob');
  await downloadBlob(blob, filename, 'application/pdf');
  return 'downloaded';
}

/**
 * Generate a clean, multi-section Cashflow CSV export (supports Period and Master All-Time).
 */
export async function downloadCashflowCsv({
  companyName = 'ELITE CHOCOLATE',
  currencySymbol = 'Rs.',
  cashflow = {},
  dailyTrend = [],
  moneyFlow = [],
  periodLabel = 'All Time',
  dateRange = '',
  isMaster = false,
  filename = 'Cashflow_Export.csv',
}) {
  const totalSales = Number(cashflow.total_sales || 0);
  const buyingCost = Number(cashflow.buying_cost || 0);
  const netProfit = Number(cashflow.net_profit || 0);
  const helpGiven = Number(cashflow.help_given || 0);
  const helpOut = Number(cashflow.help_outstanding || 0);
  const paidSales = Number(cashflow.paid_sales || 0);
  const dueSales = Number(cashflow.pending_sales || 0);
  const marginPct = totalSales > 0 ? ((netProfit / totalSales) * 100).toFixed(1) : '0.0';

  const rows = [];

  // 1. Report Title & Header
  rows.push([`${companyName} — CASHFLOW FINANCIAL STATEMENT`]);
  rows.push(['STATEMENT TYPE', isMaster ? 'MASTER CASHFLOW (ALL-TIME FROM INCEPTION)' : 'PERIOD CASHFLOW STATEMENT']);
  rows.push(['PERIOD', periodLabel]);
  if (dateRange) rows.push(['DATE RANGE', dateRange]);
  rows.push(['GENERATED AT', new Date().toLocaleString('en-PK')]);
  rows.push([]);

  // 2. Executive KPI Summary
  rows.push(['--- EXECUTIVE KPI SUMMARY ---']);
  rows.push(['Metric', `Amount (${currencySymbol})`]);
  rows.push(['Total Sales (Revenue)', totalSales]);
  rows.push(['Saudia Buying (Costs)', buyingCost]);
  rows.push(['Net Profit', netProfit]);
  rows.push(['Operating Margin (%)', `${marginPct}%`]);
  rows.push(['Paid Sales (Collected)', paidSales]);
  rows.push(['Pending / Receivables', dueSales]);
  rows.push(['Help Given (Loans Out)', helpGiven]);
  rows.push(['Help Outstanding (Unrecovered)', helpOut]);
  rows.push([]);

  // 3. Daily Profit Ledger
  rows.push(['--- DAILY FINANCIAL LEDGER BREAKDOWN ---']);
  rows.push(['Date', `Sales In (${currencySymbol})`, `Saudia Buying Out (${currencySymbol})`, `Help Out (${currencySymbol})`, `Net Profit (${currencySymbol})`, 'Orders Count']);
  (dailyTrend || []).forEach((d) => {
    rows.push([
      d.date || '',
      Number(d.sales || 0),
      Number(d.buying || 0),
      Number(d.help || 0),
      Number(d.profit || 0),
      Number(d.sales_count || 0),
    ]);
  });
  rows.push([]);

  // 4. Itemized Transaction Stream
  rows.push(['--- ITEMIZED CASHFLOW TRANSACTIONS ---']);
  rows.push(['Date', 'Invoice #', 'Type', 'Party / Description', `Amount (${currencySymbol})`, 'Cash Effect', 'Status']);
  (moneyFlow || []).forEach((m) => {
    const isHelp = m.bill_type === 'help';
    const isBuy = m.bill_type === 'supplier' || m.buying > 0;
    const amt = isHelp ? m.expenditure : isBuy ? m.buying : m.selling;
    const effect = isBuy || isHelp ? 'OUTFLOW (-)' : 'INFLOW (+)';
    rows.push([
      m.date || '',
      m.invoice_number || '',
      (m.bill_type || 'sale').toUpperCase(),
      m.comment || '',
      Number(amt || 0),
      effect,
      (m.status || '').toUpperCase(),
    ]);
  });

  const csv = buildCsv([], rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
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
    if (y + neededHeight > pageHeight - margin - 25) {
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
    { label: 'Profit Margin', val: `${profitMarginPct > 0 ? profitMarginPct : totalSales > 0 ? Math.round((netProfit / totalSales) * 100) : 0}%`, color: [212, 175, 55] },
  ];

  kpis.forEach((kpi, idx) => {
    const cx = margin + idx * (cardW + 6);
    pdf.setFillColor(248, 250, 252);
    pdf.setDrawColor(226, 232, 240);
    pdf.roundedRect(cx, y, cardW, 40, 3, 3, 'FD');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(100, 116, 139);
    pdf.text(kpi.label.toUpperCase(), cx + 7, y + 13);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    pdf.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
    pdf.text(kpi.val, cx + 7, y + 30);
  });

  y += 48;

  // 3. 50/50 Partner Distribution Section
  pdf.setFillColor(241, 245, 249);
  pdf.rect(margin, y, usableW, 16, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(15, 23, 42);
  pdf.text('PARTNER PROFIT DISTRIBUTION (50% / 50% SPLIT)', margin + 8, y + 11);
  y += 20;

  const partnerCardW = (usableW - 10) / 2;
  (partners || []).forEach((p, pIdx) => {
    const px = margin + pIdx * (partnerCardW + 10);
    const shareAmt = (netProfit * (p.profit_share_pct || 50)) / 100;

    pdf.setFillColor(255, 255, 255);
    pdf.setDrawColor(203, 213, 225);
    pdf.roundedRect(px, y, partnerCardW, 52, 4, 4, 'FD');

    pdf.setFillColor(15, 23, 42);
    pdf.rect(px, y, 4, 52, 'F');

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9.5);
    pdf.setTextColor(15, 23, 42);
    pdf.text(String(p.name || 'Partner').toUpperCase(), px + 10, y + 15);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Equity Share: ${p.profit_share_pct || 50}%`, px + 10, y + 28);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10.5);
    pdf.setTextColor(14, 165, 233);
    pdf.text(`${currencySymbol} ${exportMoney(shareAmt)}`, px + 100, y + 30);

    if (p.current_balance !== undefined) {
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7);
      pdf.setTextColor(71, 85, 105);
      pdf.text(`All-Time Undrawn Balance: ${currencySymbol} ${exportMoney(p.current_balance)}`, px + 10, y + 44);
    }
  });

  y += 60;

  // 4. Itemized Shipment & Order Breakdown Table
  checkPageBreak(120);

  pdf.setFillColor(15, 23, 42);
  pdf.rect(margin, y, usableW, 18, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(255, 255, 255);
  pdf.text(`ITEMIZED SHIPMENTS & ORDER BREAKDOWN (${orders.length} TOTAL)`, margin + 8, y + 12);
  y += 18;

  // Table Column Headers
  const headers = ['Date', 'Invoice #', 'Type', 'Party / Shipment', 'Sales', 'Buying', 'Profit Effect', 'Status'];
  const colW = [
    usableW * 0.12,
    usableW * 0.13,
    usableW * 0.11,
    usableW * 0.22,
    usableW * 0.11,
    usableW * 0.11,
    usableW * 0.11,
    usableW * 0.09,
  ];
  const colX = [];
  {
    let cx = margin;
    for (let i = 0; i < colW.length; i += 1) {
      colX.push(cx);
      cx += colW[i];
    }
  }

  const drawTableHeader = () => {
    pdf.setFillColor(30, 41, 59);
    pdf.rect(margin, y, usableW, 16, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7);
    pdf.setTextColor(212, 175, 55); // Gold headers
    headers.forEach((h, i) => {
      const align = i >= 4 && i <= 6 ? 'right' : i === 0 || i === 1 || i === 2 || i === 7 ? 'center' : 'left';
      const tx = align === 'right' ? colX[i] + colW[i] - 3 : align === 'center' ? colX[i] + colW[i] / 2 : colX[i] + 3;
      pdf.text(h, tx, y + 11, { align });
    });
    y += 16;
  };

  drawTableHeader();

  // Draw Orders Rows
  orders.forEach((o, idx) => {
    if (checkPageBreak(22)) {
      drawTableHeader();
    }

    const isAlt = idx % 2 === 1;
    pdf.setFillColor(isAlt ? 248 : 255, isAlt ? 250 : 255, isAlt ? 252 : 255);
    pdf.rect(margin, y, usableW, 16, 'F');

    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.4);
    pdf.line(margin, y + 16, margin + usableW, y + 16);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(15, 23, 42);

    const isBuy = o.is_supplier || o.bill_type === 'supplier';
    const isHelp = o.is_help || o.bill_type === 'help';
    const typeStr = isBuy ? 'Saudia Buy' : isHelp ? 'Help' : 'Sale';
    const dateStr = String(o.bill_date || '').substring(5); // MM-DD
    const invStr = String(o.invoice_number || '').substring(0, 14);
    const partyStr = String(o.customer_name || 'Walk-in').substring(0, 24);

    const salesStr = isBuy || isHelp ? '—' : `${exportMoney(o.total_amount || 0)}`;
    const buyStr = isBuy ? `${exportMoney(o.total_amount || 0)}` : '—';
    const profitStr = isHelp ? 'Rs. 0' : isBuy ? `-Rs. ${exportMoney(o.total_amount)}` : `+Rs. ${exportMoney(o.total_amount)}`;

    const isSettled = Boolean(
      settlementInfo &&
        (String(o.bill_date || '') < String(settlementInfo.period_end || '') ||
          (String(o.bill_date || '') === String(settlementInfo.period_end || '') &&
            Number(o.id) <= Number(settlementInfo.last_bill_id || Infinity)))
    );

    pdf.text(dateStr, colX[0] + colW[0] / 2, y + 11, { align: 'center' });
    pdf.text(invStr, colX[1] + colW[1] / 2, y + 11, { align: 'center' });
    pdf.text(typeStr, colX[2] + colW[2] / 2, y + 11, { align: 'center' });
    pdf.text(partyStr, colX[3] + 3, y + 11, { align: 'left' });
    pdf.text(salesStr, colX[4] + colW[4] - 3, y + 11, { align: 'right' });
    pdf.text(buyStr, colX[5] + colW[5] - 3, y + 11, { align: 'right' });

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(isBuy ? 239 : isHelp ? 148 : 16, isBuy ? 68 : isHelp ? 163 : 185, isBuy ? 68 : isHelp ? 184 : 129);
    pdf.text(profitStr, colX[6] + colW[6] - 3, y + 11, { align: 'right' });

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(6.5);
    pdf.setTextColor(isSettled ? 22 : 217, isSettled ? 163 : 119, isSettled ? 74 : 6);
    pdf.text(isSettled ? 'SETTLED' : 'UNSETTLED', colX[7] + colW[7] / 2, y + 11, { align: 'center' });

    y += 16;
  });

  // 5. Signature Authorization Box at bottom
  checkPageBreak(65);
  y += 10;

  pdf.setDrawColor(203, 213, 225);
  pdf.setLineWidth(0.8);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 12;

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

  // Page Numbering Footer
  const pageCount = pdf.getNumberOfPages();
  for (let p = 1; p <= pageCount; p += 1) {
    pdf.setPage(p);
    pdf.setDrawColor(226, 232, 240);
    pdf.setLineWidth(0.5);
    pdf.line(margin, pageHeight - 20, pageWidth - margin, pageHeight - 20);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(148, 163, 184);
    pdf.text('Elite Chocolate · Partner 50/50 Equity & Settlement Document · Confidential', margin, pageHeight - 10);
    pdf.text(`Page ${p} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
  }

  const blob = pdf.output('blob');
  await downloadBlob(blob, filename, 'application/pdf');
  return 'downloaded';
}
