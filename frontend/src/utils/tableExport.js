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

