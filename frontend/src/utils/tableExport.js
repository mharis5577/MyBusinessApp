import { jsPDF } from 'jspdf';
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
