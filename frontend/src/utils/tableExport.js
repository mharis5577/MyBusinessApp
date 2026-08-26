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

/** Build a standard RFC-4180 UTF-8 CSV string (with BOM for Excel). */
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
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  await downloadBlob(blob, filename, 'text/csv');
  return 'downloaded';
}

/** Format money for exports (thousands separators, no currency symbol clutter). */
export function exportMoney(amount) {
  return formatPkMoney(amount, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** Escape XML special characters. */
export function xmlEscape(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate a Microsoft Excel XML Spreadsheet (SpreadsheetML 2003) workbook string.
 * Supports multiple sheets, cell styles, auto-widths, right-aligned numbers, and frozen header rows.
 */
export function buildExcelXmlWorkbook({
  sheets = [],
  author = 'Elite Chocolate',
  company = 'Elite Chocolate Luxury Confectionery',
}) {
  const nowIso = new Date().toISOString();

  let stylesXml = `
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal">
      <Alignment ss:Vertical="Center"/>
      <Borders/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="10" ss:Color="#1E293B"/>
      <Interior/>
      <NumberFormat/>
      <Protection/>
    </Style>

    <!-- Document Title & Header Banners -->
    <Style ss:ID="DocTitle">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="13" ss:Bold="1" ss:Color="#0F172A"/>
    </Style>
    <Style ss:ID="DocSubtitle">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="9" ss:Color="#64748B"/>
    </Style>
    <Style ss:ID="SectionHeader">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="10.5" ss:Bold="1" ss:Color="#0F172A"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F172A"/>
      </Borders>
    </Style>

    <!-- Column Headers -->
    <Style ss:ID="HeaderLeft">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center" ss:WrapText="0"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="9.5" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
      </Borders>
    </Style>
    <Style ss:ID="HeaderCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center" ss:WrapText="0"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="9.5" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
      </Borders>
    </Style>
    <Style ss:ID="HeaderRight">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center" ss:WrapText="0"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="9.5" ss:Bold="1" ss:Color="#FFFFFF"/>
      <Interior ss:Color="#0F172A" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#334155"/>
      </Borders>
    </Style>

    <!-- Data Cells -->
    <Style ss:ID="CellLeft">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="9.5" ss:Color="#1E293B"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="CellCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="9.5" ss:Color="#1E293B"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="CellNumber">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="9.5" ss:Color="#1E293B"/>
      <NumberFormat ss:Format="#,##0.00;[Red]\-#,##0.00;0.00"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="CellInteger">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="9.5" ss:Color="#1E293B"/>
      <NumberFormat ss:Format="#,##0"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>

    <!-- Zebra Alternate Rows -->
    <Style ss:ID="CellLeftAlt">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="9.5" ss:Color="#1E293B"/>
      <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="CellCenterAlt">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="9.5" ss:Color="#1E293B"/>
      <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
    <Style ss:ID="CellNumberAlt">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="9.5" ss:Color="#1E293B"/>
      <NumberFormat ss:Format="#,##0.00;[Red]\-#,##0.00;0.00"/>
      <Interior ss:Color="#F8FAFC" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>

    <!-- Summary / Total Row -->
    <Style ss:ID="TotalLeft">
      <Alignment ss:Horizontal="Left" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F172A"/>
        <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#0F172A"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      </Borders>
    </Style>
    <Style ss:ID="TotalCenter">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F172A"/>
        <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#0F172A"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      </Borders>
    </Style>
    <Style ss:ID="TotalRight">
      <Alignment ss:Horizontal="Right" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="10" ss:Bold="1" ss:Color="#0F172A"/>
      <NumberFormat ss:Format="#,##0.00;[Red]\-#,##0.00;0.00"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="2" ss:Color="#0F172A"/>
        <Border ss:Position="Bottom" ss:LineStyle="Double" ss:Weight="3" ss:Color="#0F172A"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#CBD5E1"/>
      </Borders>
    </Style>

    <!-- Status Tags -->
    <Style ss:ID="StatusPaid">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="9" ss:Bold="1" ss:Color="#15803D"/>
      <Interior ss:Color="#DCFCE7" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BBF7D0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BBF7D0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BBF7D0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#BBF7D0"/>
      </Borders>
    </Style>
    <Style ss:ID="StatusDue">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="9" ss:Bold="1" ss:Color="#B45309"/>
      <Interior ss:Color="#FEF3C7" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#FDE68A"/>
      </Borders>
    </Style>
    <Style ss:ID="StatusPending">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="9" ss:Bold="1" ss:Color="#4338CA"/>
      <Interior ss:Color="#EEF2FF" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#C7D2FE"/>
      </Borders>
    </Style>
    <Style ss:ID="StatusCancelled">
      <Alignment ss:Horizontal="Center" ss:Vertical="Center"/>
      <Font ss:FontName="Segoe UI" x:Family="Swiss" ss:Size="9" ss:Color="#64748B"/>
      <Interior ss:Color="#F1F5F9" ss:Pattern="Solid"/>
      <Borders>
        <Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
        <Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#E2E8F0"/>
      </Borders>
    </Style>
  </Styles>`;

  let worksheetsXml = '';

  sheets.forEach((sheet) => {
    const sheetName = xmlEscape(sheet.name || 'Sheet1');
    const headers = sheet.headers || [];
    const rows = sheet.rows || [];
    const colTypes = sheet.colTypes || []; // 'text' | 'center' | 'number' | 'integer' | 'status'
    const title = sheet.title || '';
    const subtitle = sheet.subtitle || '';
    const summaryRow = sheet.summaryRow || null;
    const colWidths = sheet.colWidths || [];

    // Calculate dynamic column widths if not explicitly provided
    const computedWidths = headers.map((h, colIdx) => {
      if (colWidths[colIdx]) return colWidths[colIdx];
      let maxLen = String(h || '').length;
      rows.forEach((r) => {
        const val = r[colIdx];
        if (val !== undefined && val !== null) {
          const l = String(val).length;
          if (l > maxLen) maxLen = l;
        }
      });
      // Character length to points conversion (approx 8.2pt per char + 25pt buffer)
      return Math.min(320, Math.max(75, Math.round(maxLen * 8.2 + 25)));
    });

    let sheetTableXml = '  <Table ss:DefaultRowHeight="20">\n';

    // Output column definitions with widths
    computedWidths.forEach((w) => {
      sheetTableXml += `    <Column ss:Width="${w}"/>\n`;
    });

    // 1. Title & Subtitle banner rows (if present)
    if (title) {
      sheetTableXml += '    <Row ss:Height="26">\n';
      sheetTableXml += `      <Cell ss:StyleID="DocTitle"><Data ss:Type="String">${xmlEscape(title)}</Data></Cell>\n`;
      sheetTableXml += '    </Row>\n';
    }
    if (subtitle) {
      sheetTableXml += '    <Row ss:Height="18">\n';
      sheetTableXml += `      <Cell ss:StyleID="DocSubtitle"><Data ss:Type="String">${xmlEscape(subtitle)}</Data></Cell>\n`;
      sheetTableXml += '    </Row>\n';
      sheetTableXml += '    <Row ss:Height="8"/>\n'; // Spacer
    }

    // 2. Header Row
    if (headers.length > 0) {
      sheetTableXml += '    <Row ss:Height="24">\n';
      headers.forEach((h, i) => {
        const type = colTypes[i] || 'text';
        const styleId = type === 'number' || type === 'integer' ? 'HeaderRight' : type === 'center' || type === 'status' ? 'HeaderCenter' : 'HeaderLeft';
        sheetTableXml += `      <Cell ss:StyleID="${styleId}"><Data ss:Type="String">${xmlEscape(h)}</Data></Cell>\n`;
      });
      sheetTableXml += '    </Row>\n';
    }

    // 3. Data Rows
    rows.forEach((row, rowIdx) => {
      const isAlt = rowIdx % 2 === 1;
      sheetTableXml += '    <Row ss:Height="21">\n';

      row.forEach((cellVal, colIdx) => {
        const type = colTypes[colIdx] || 'text';
        let cellStyle = isAlt ? 'CellLeftAlt' : 'CellLeft';
        let dataType = 'String';
        let formattedVal = xmlEscape(cellVal ?? '');

        if (type === 'number') {
          cellStyle = isAlt ? 'CellNumberAlt' : 'CellNumber';
          const num = typeof cellVal === 'number' ? cellVal : parseFloat(String(cellVal).replace(/,/g, ''));
          if (!isNaN(num)) {
            dataType = 'Number';
            formattedVal = String(num);
          }
        } else if (type === 'integer') {
          cellStyle = isAlt ? 'CellNumberAlt' : 'CellInteger';
          const num = typeof cellVal === 'number' ? cellVal : parseInt(String(cellVal).replace(/,/g, ''), 10);
          if (!isNaN(num)) {
            dataType = 'Number';
            formattedVal = String(num);
          }
        } else if (type === 'center') {
          cellStyle = isAlt ? 'CellCenterAlt' : 'CellCenter';
        } else if (type === 'status') {
          const s = String(cellVal || '').toLowerCase();
          if (s.includes('paid') || s.includes('settled') || s.includes('complete')) {
            cellStyle = 'StatusPaid';
          } else if (s.includes('due') || s.includes('unsettled') || s.includes('partial')) {
            cellStyle = 'StatusDue';
          } else if (s.includes('pending')) {
            cellStyle = 'StatusPending';
          } else if (s.includes('cancel')) {
            cellStyle = 'StatusCancelled';
          } else {
            cellStyle = isAlt ? 'CellCenterAlt' : 'CellCenter';
          }
        }

        sheetTableXml += `      <Cell ss:StyleID="${cellStyle}"><Data ss:Type="${dataType}">${formattedVal}</Data></Cell>\n`;
      });

      sheetTableXml += '    </Row>\n';
    });

    // 4. Summary / Total Row
    if (summaryRow && Array.isArray(summaryRow)) {
      sheetTableXml += '    <Row ss:Height="24">\n';
      summaryRow.forEach((cellVal, colIdx) => {
        const type = colTypes[colIdx] || 'text';
        let cellStyle = 'TotalLeft';
        let dataType = 'String';
        let formattedVal = xmlEscape(cellVal ?? '');

        if (type === 'number' || type === 'integer') {
          cellStyle = 'TotalRight';
          const num = typeof cellVal === 'number' ? cellVal : parseFloat(String(cellVal).replace(/,/g, ''));
          if (!isNaN(num)) {
            dataType = 'Number';
            formattedVal = String(num);
          }
        } else if (type === 'center') {
          cellStyle = 'TotalCenter';
        }

        sheetTableXml += `      <Cell ss:StyleID="${cellStyle}"><Data ss:Type="${dataType}">${formattedVal}</Data></Cell>\n`;
      });
      sheetTableXml += '    </Row>\n';
    }

    sheetTableXml += '  </Table>\n';

    // Freeze Header Options
    const freezeRow = (title ? 1 : 0) + (subtitle ? 2 : 0) + 1;
    const worksheetOptionsXml = `  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">
    <PageSetup>
      <Layout x:Orientation="Landscape"/>
      <Header x:Margin="0.3"/>
      <Footer x:Margin="0.3"/>
      <PageMargins x:Bottom="0.5" x:Left="0.5" x:Right="0.5" x:Top="0.5"/>
    </PageSetup>
    <FreezePanes/>
    <FrozenNoSplit/>
    <SplitHorizontal>${freezeRow}</SplitHorizontal>
    <TopRowBottomPane>${freezeRow}</TopRowBottomPane>
    <ActivePane>2</ActivePane>
    <ProtectObjects>False</ProtectObjects>
    <ProtectScenarios>False</ProtectScenarios>
  </WorksheetOptions>\n`;

    worksheetsXml += ` <Worksheet ss:Name="${sheetName}">\n${sheetTableXml}${worksheetOptionsXml} </Worksheet>\n`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:html="http://www.w3.org/TR/REC-html40">
 <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">
  <Author>${xmlEscape(author)}</Author>
  <Company>${xmlEscape(company)}</Company>
  <Created>${nowIso}</Created>
 </DocumentProperties>
${stylesXml}
${worksheetsXml}</Workbook>`;
}

/**
 * Download a multi-sheet or single-sheet Excel workbook as a .xls file.
 */
export async function downloadExcelWorkbook({
  sheets = [],
  filename = 'Workbook.xls',
  author = 'Elite Chocolate System',
  company = 'Elite Chocolate Luxury Confectionery',
}) {
  const xml = buildExcelXmlWorkbook({ sheets, author, company });
  const blob = new Blob([xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  await downloadBlob(blob, filename, 'application/vnd.ms-excel');
  return 'downloaded';
}

/**
 * Generic single-table Excel export helper.
 */
export async function downloadTableExcel({
  title = 'Export',
  subtitle = '',
  sheetName = 'Data',
  headers = [],
  rows = [],
  colTypes = [],
  colWidths = [],
  summaryRow = null,
  filename = 'Export.xls',
}) {
  return downloadExcelWorkbook({
    sheets: [
      {
        name: sheetName,
        title,
        subtitle,
        headers,
        rows,
        colTypes,
        colWidths,
        summaryRow,
      },
    ],
    filename,
  });
}

/**
 * Export Bills Master Database to a luxury formatted Excel spreadsheet (.xls)
 * Includes summary cards, aligned numbers, status badges, and calculated totals.
 */
export async function downloadBillsMasterExcel({
  bills = [],
  filename = 'Bills_Master.xls',
  title = 'Elite Chocolate — Bills Master & Sales Ledger',
  subtitle = '',
}) {
  const headers = [
    'Category',
    'Invoice #',
    'Customer / Party',
    'Date',
    'Time',
    'Subtotal (Rs.)',
    'Total (Rs.)',
    'Paid (Rs.)',
    'Balance (Rs.)',
    'Status',
  ];

  const colTypes = [
    'center',
    'center',
    'text',
    'center',
    'center',
    'number',
    'number',
    'number',
    'number',
    'status',
  ];

  const colWidths = [95, 110, 190, 95, 75, 110, 110, 110, 110, 90];

  let sumSubtotal = 0;
  let sumTotal = 0;
  let sumPaid = 0;
  let sumBalance = 0;

  const rows = bills.map((b) => {
    let subtotal = Number(b.subtotal) || 0;
    let total = Number(b.total_amount) || 0;

    if (Array.isArray(b.items) && b.items.length) {
      const fromItems = b.items.reduce((s, it) => {
        const qty = Math.max(0, (Number(it.quantity) || 0) - (Number(it.returned_qty) || 0));
        return s + qty * (Number(it.unit_price) || 0);
      }, 0);
      const taxRate = Number(b.tax_rate) || 0;
      const discountRate = Number(b.discount_rate) || 0;
      const discount = (fromItems * discountRate) / 100;
      const after = Math.max(0, fromItems - discount);
      const tax = (after * taxRate) / 100;
      const itemsTotal = Math.round((after + tax) * 100) / 100;
      if (itemsTotal > 0 && (total <= 0 || Math.abs(total - itemsTotal) > 0.02)) {
        subtotal = Math.round(fromItems * 100) / 100;
        total = itemsTotal;
      }
    }

    const paid = Number(b.amount_paid) || 0;
    const balance = Math.max(0, Math.round((total - paid) * 100) / 100);

    let status = String(b.status || 'pending').toLowerCase();
    const isCancel = status === 'cancelled' || status === 'canceled';
    if (!isCancel && total > 0) {
      if (balance <= 0) status = 'paid';
      else if (status === 'paid') status = 'due';
    }

    if (!isCancel) {
      sumSubtotal += subtotal;
      sumTotal += total;
      sumPaid += paid;
      sumBalance += balance;
    }

    const typeLabel =
      b.bill_type === 'supplier'
        ? 'Saudia Buying'
        : b.bill_type === 'help'
        ? 'Help'
        : b.bill_type === 'khata'
        ? 'Credit Khata'
        : 'Sale';

    return [
      typeLabel,
      b.invoice_number || '',
      b.customer_name || '',
      b.bill_date || '',
      b.bill_time || '',
      subtotal,
      total,
      paid,
      balance,
      status.toUpperCase(),
    ];
  });

  const summaryRow = [
    'TOTALS',
    `${bills.length} Bills`,
    '',
    '',
    '',
    sumSubtotal,
    sumTotal,
    sumPaid,
    sumBalance,
    '',
  ];

  return downloadExcelWorkbook({
    sheets: [
      {
        name: 'Invoices & Ledger',
        title,
        subtitle: subtitle || `Generated on ${new Date().toLocaleDateString('en-PK')} · ${bills.length} Record(s)`,
        headers,
        rows,
        colTypes,
        colWidths,
        summaryRow,
      },
    ],
    filename,
  });
}

/**
 * Export Cashflow with Multi-Sheet Excel Workbook (.xls)
 * Sheet 1: Daily Summary
 * Sheet 2: Transaction Money Flow
 */
export async function downloadCashflowExcel({
  moneyFlow = [],
  dailyTrend = [],
  currencySymbol = 'Rs.',
  filename = 'Cashflow_Report.xls',
}) {
  // Sheet 1: Daily Summary
  const sheet1Headers = [
    'Date',
    `Sales (${currencySymbol})`,
    `Buying (${currencySymbol})`,
    `Help Lent (${currencySymbol})`,
    `Net Profit (${currencySymbol})`,
    'Margin %',
  ];
  const sheet1Types = ['center', 'number', 'number', 'number', 'number', 'center'];
  const sheet1Widths = [110, 130, 130, 130, 130, 95];

  let sumSales = 0;
  let sumBuying = 0;
  let sumHelp = 0;
  let sumProfit = 0;

  const sheet1Rows = dailyTrend.map((d) => {
    const s = Number(d.sales) || 0;
    const b = Number(d.buying) || 0;
    const h = Number(d.help) || 0;
    const p = Number(d.profit) || 0;
    const margin = s > 0 ? ((p / s) * 100).toFixed(1) + '%' : '0.0%';

    sumSales += s;
    sumBuying += b;
    sumHelp += h;
    sumProfit += p;

    return [d.date || '', s, b, h, p, margin];
  });

  const overallMargin = sumSales > 0 ? ((sumProfit / sumSales) * 100).toFixed(1) + '%' : '0.0%';
  const sheet1Summary = ['TOTALS', sumSales, sumBuying, sumHelp, sumProfit, overallMargin];

  // Sheet 2: Transaction Flow
  const sheet2Headers = [
    'Date',
    'Invoice #',
    'Bill Type',
    'Description / Comment',
    'Cashflow Direction',
    `Amount (${currencySymbol})`,
  ];
  const sheet2Types = ['center', 'center', 'center', 'text', 'center', 'number'];
  const sheet2Widths = [100, 110, 110, 220, 120, 130];

  let sumFlowAmt = 0;
  const sheet2Rows = moneyFlow.map((f) => {
    const isBuy = f.bill_type === 'supplier' || f.buying > 0;
    const isHelp = f.bill_type === 'help';
    const dir = isBuy ? 'OUT (Buying)' : isHelp ? 'OUT (Help)' : 'IN (Sales)';
    const amt = Number(isHelp ? f.expenditure : isBuy ? f.buying : f.selling) || 0;
    sumFlowAmt += amt;

    return [
      f.date || '',
      f.invoice_number || '',
      f.bill_type || 'sale',
      f.comment || '',
      dir,
      amt,
    ];
  });

  const sheet2Summary = ['TOTALS', `${moneyFlow.length} Entries`, '', '', '', sumFlowAmt];

  return downloadExcelWorkbook({
    sheets: [
      {
        name: 'Daily Cashflow Summary',
        title: 'Elite Chocolate — Daily Cashflow & Operating Margin',
        subtitle: `Generated on ${new Date().toLocaleDateString('en-PK')}`,
        headers: sheet1Headers,
        rows: sheet1Rows,
        colTypes: sheet1Types,
        colWidths: sheet1Widths,
        summaryRow: sheet1Summary,
      },
      {
        name: 'Transaction Ledger',
        title: 'Elite Chocolate — Cashflow Inflows & Outflows',
        subtitle: `${moneyFlow.length} Total Transactions`,
        headers: sheet2Headers,
        rows: sheet2Rows,
        colTypes: sheet2Types,
        colWidths: sheet2Widths,
        summaryRow: sheet2Summary,
      },
    ],
    filename,
  });
}

/**
 * Export Partner Profit & Equity Statement with Multi-Sheet Excel Workbook (.xls)
 * Sheet 1: 50/50 Equity Summary & Partner Shares
 * Sheet 2: Order-by-Order & Shipment Ledger
 */
export async function downloadPartnerReportExcel({
  periodLabel = 'All Time',
  totalSales = 0,
  totalBuying = 0,
  netProfit = 0,
  partners = [],
  orders = [],
  currencySymbol = 'Rs.',
  filename = 'Partner_Profit_Statement.xls',
  settlementInfo = null,
}) {
  // Sheet 1: Summary & Shares
  const sheet1Headers = [
    'Partner Name',
    'Equity Share %',
    `Calculated Share (${currencySymbol})`,
    `Undrawn Balance (${currencySymbol})`,
    'Settlement Status',
  ];
  const sheet1Types = ['text', 'center', 'number', 'number', 'status'];
  const sheet1Widths = [180, 120, 160, 160, 130];

  let sumShares = 0;
  const sheet1Rows = partners.map((p) => {
    const pct = Number(p.profit_share_pct || 50);
    const shareAmt = (netProfit * pct) / 100;
    sumShares += shareAmt;
    return [
      p.name || 'Partner',
      `${pct}%`,
      shareAmt,
      Number(p.current_balance) || 0,
      'ACTIVE',
    ];
  });

  const sheet1Summary = ['TOTALS', '100%', sumShares, '', ''];

  // Sheet 2: Itemized Orders
  const sheet2Headers = [
    'Date',
    'Invoice #',
    'Category',
    'Party / Shipment',
    `Sales (${currencySymbol})`,
    `Buying (${currencySymbol})`,
    `Profit Effect (${currencySymbol})`,
    'Settlement Status',
    'Notes',
  ];
  const sheet2Types = [
    'center',
    'center',
    'center',
    'text',
    'number',
    'number',
    'number',
    'status',
    'text',
  ];
  const sheet2Widths = [100, 110, 100, 180, 120, 120, 130, 110, 200];

  let sumOrderSales = 0;
  let sumOrderBuying = 0;
  let sumOrderProfit = 0;

  const sheet2Rows = orders.map((o) => {
    const isBuy = o.is_supplier || o.bill_type === 'supplier';
    const isHelp = o.is_help || o.bill_type === 'help';
    const amt = Number(o.total_amount) || 0;
    const salesAmt = isBuy || isHelp ? 0 : amt;
    const buyingAmt = isBuy ? amt : 0;
    const profitEffect = isHelp ? 0 : isBuy ? -amt : amt;

    sumOrderSales += salesAmt;
    sumOrderBuying += buyingAmt;
    sumOrderProfit += profitEffect;

    const isSettled = Boolean(
      settlementInfo &&
        (String(o.bill_date || '') < String(settlementInfo.period_end || '') ||
          (String(o.bill_date || '') === String(settlementInfo.period_end || '') &&
            Number(o.id) <= Number(settlementInfo.last_bill_id || Infinity)))
    );

    return [
      o.bill_date || '',
      o.invoice_number || '',
      isBuy ? 'Saudia Buying' : isHelp ? 'Help' : 'Sale',
      o.customer_name || '',
      salesAmt,
      buyingAmt,
      profitEffect,
      isSettled ? 'SETTLED' : 'UNSETTLED',
      o.notes || '',
    ];
  });

  const sheet2Summary = [
    'TOTALS',
    `${orders.length} Orders`,
    '',
    '',
    sumOrderSales,
    sumOrderBuying,
    sumOrderProfit,
    '',
    '',
  ];

  return downloadExcelWorkbook({
    sheets: [
      {
        name: 'Partner Equity 50-50',
        title: 'Elite Chocolate — Partner Dividend & Equity Statement',
        subtitle: `Period: ${periodLabel} · Total Sales: ${currencySymbol} ${exportMoney(totalSales)} · Total Buying: ${currencySymbol} ${exportMoney(totalBuying)} · Net Profit: ${currencySymbol} ${exportMoney(netProfit)}`,
        headers: sheet1Headers,
        rows: sheet1Rows,
        colTypes: sheet1Types,
        colWidths: sheet1Widths,
        summaryRow: sheet1Summary,
      },
      {
        name: 'Shipments & Orders Ledger',
        title: 'Elite Chocolate — Itemized Shipments & Orders Breakdown',
        subtitle: `${orders.length} Records in ${periodLabel}`,
        headers: sheet2Headers,
        rows: sheet2Rows,
        colTypes: sheet2Types,
        colWidths: sheet2Widths,
        summaryRow: sheet2Summary,
      },
    ],
    filename,
  });
}

/**
 * Export Cashflow Transactions to clean, aligned CSV.
 */
export async function downloadCashflowCsv({
  moneyFlow = [],
  dailyTrend = [],
  currencySymbol = 'Rs.',
  filename = 'Cashflow_Export.csv',
}) {
  const lines = [
    ['=== DAILY CASHFLOW SUMMARY ===', '', '', '', ''],
    ['Date', `Sales (${currencySymbol})`, `Buying (${currencySymbol})`, `Help Lent (${currencySymbol})`, `Net Profit (${currencySymbol})`],
  ];

  dailyTrend.forEach((d) => {
    lines.push([
      d.date || '',
      Number(d.sales) || 0,
      Number(d.buying) || 0,
      Number(d.help) || 0,
      Number(d.profit) || 0,
    ]);
  });

  lines.push(['', '', '', '', '']);
  lines.push(['=== TRANSACTION MONEY FLOW ===', '', '', '', '']);
  lines.push(['Date', 'Invoice #', 'Type', 'Description', 'Direction', `Amount (${currencySymbol})`]);

  moneyFlow.forEach((f) => {
    const isBuy = f.bill_type === 'supplier' || f.buying > 0;
    const isHelp = f.bill_type === 'help';
    const dir = isBuy ? 'OUT (Buying)' : isHelp ? 'OUT (Help)' : 'IN (Sales)';
    const amt = Number(isHelp ? f.expenditure : isBuy ? f.buying : f.selling) || 0;
    lines.push([
      f.date || '',
      f.invoice_number || '',
      f.bill_type || 'sale',
      f.comment || '',
      dir,
      amt,
    ]);
  });

  const csv = lines.map((r) => r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  await downloadBlob(blob, filename, 'text/csv');
  return 'downloaded';
}

/**
 * Export Partner Profit & Shipment Breakdown to clean, aligned CSV.
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
  const lines = [
    ['=== PARTNER PROFIT 50/50 SETTLEMENT STATEMENT ===', '', '', '', '', '', '', '', ''],
    ['Period', periodLabel, '', '', '', '', '', '', ''],
    ['Total Sales', totalSales, '', '', '', '', '', '', ''],
    ['Total Buying', totalBuying, '', '', '', '', '', '', ''],
    ['Net Profit', netProfit, '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', ''],
    ['=== 50/50 PARTNER SHARES ===', '', '', '', '', '', '', '', ''],
    ['Partner Name', 'Share %', `Calculated Profit Share (${currencySymbol})`, '', '', '', '', '', ''],
  ];

  partners.forEach((p) => {
    const shareAmt = (netProfit * (p.profit_share_pct || 50)) / 100;
    lines.push([p.name || 'Partner', `${p.profit_share_pct || 50}%`, shareAmt, '', '', '', '', '', '']);
  });

  lines.push(['', '', '', '', '', '', '', '', '']);
  lines.push(['=== SHIPMENT & ORDER-BY-ORDER BREAKDOWN ===', '', '', '', '', '', '', '', '']);
  lines.push([
    'Date',
    'Invoice #',
    'Type',
    'Party / Shipment',
    `Sales (${currencySymbol})`,
    `Buying (${currencySymbol})`,
    `Profit Effect (${currencySymbol})`,
    'Settlement Status',
    'Notes',
  ]);

  orders.forEach((o) => {
    const isBuy = o.is_supplier || o.bill_type === 'supplier';
    const isHelp = o.is_help || o.bill_type === 'help';
    const amt = Number(o.total_amount) || 0;
    const salesAmt = isBuy || isHelp ? 0 : amt;
    const buyingAmt = isBuy ? amt : 0;
    const profitEffect = isHelp ? 0 : isBuy ? -amt : amt;

    const isSettled = Boolean(
      settlementInfo &&
        (String(o.bill_date || '') < String(settlementInfo.period_end || '') ||
          (String(o.bill_date || '') === String(settlementInfo.period_end || '') &&
            Number(o.id) <= Number(settlementInfo.last_bill_id || Infinity)))
    );

    lines.push([
      o.bill_date || '',
      o.invoice_number || '',
      o.bill_type || 'sale',
      o.customer_name || '',
      salesAmt,
      buyingAmt,
      profitEffect,
      isSettled ? 'Settled' : 'Unsettled',
      o.notes || '',
    ]);
  });

  const csv = lines.map((r) => r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  await downloadBlob(blob, filename, 'text/csv');
  return 'downloaded';
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

  y += 2 * (cardH + 10) + 10;

  // 3. Section Title: Today's Invoices
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10.5);
  pdf.setTextColor(20, 13, 9);
  pdf.text("Today's Invoices & Activity", margin, y);
  y += 12;

  // 4. Table Header
  const headers = ['Time', 'Invoice #', 'Customer', 'Items', 'Amount', 'Status'];
  const colW = [usableW * 0.12, usableW * 0.2, usableW * 0.32, usableW * 0.1, usableW * 0.14, usableW * 0.12];
  const colX = [];
  {
    let x = margin;
    for (let i = 0; i < colW.length; i += 1) {
      colX.push(x);
      x += colW[i];
    }
  }

  pdf.setFillColor(20, 13, 9);
  pdf.rect(margin, y, usableW, 20, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(8);
  pdf.setTextColor(212, 175, 55);
  headers.forEach((h, i) => {
    pdf.text(h, colX[i] + 4, y + 13);
  });
  y += 20;

  // 5. Table Rows (limit to first 12 today)
  const todayBills = (bills || []).slice(0, 12);

  if (!todayBills.length) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(9);
    pdf.setTextColor(130, 130, 130);
    pdf.text('No sales recorded today yet.', margin + 8, y + 20);
    y += 30;
  } else {
    todayBills.forEach((b, idx) => {
      const bg = idx % 2 === 0 ? 255 : 249;
      pdf.setFillColor(bg, bg, bg);
      pdf.rect(margin, y, usableW, 18, 'F');

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(30, 30, 30);

      const timeStr = String(b.bill_time || '').slice(0, 5) || '—';
      const invStr = String(b.invoice_number || '—');
      const custStr = String(b.customer_name || 'Walk-in Customer').substring(0, 24);
      const itemsCount = String(b.items?.length || 0);
      const amtStr = `${currencySymbol} ${exportMoney(b.total_amount || 0)}`;
      const statusStr = (b.status || 'paid').toUpperCase();

      pdf.text(timeStr, colX[0] + 4, y + 12);
      pdf.text(invStr, colX[1] + 4, y + 12);
      pdf.text(custStr, colX[2] + 4, y + 12);
      pdf.text(itemsCount, colX[3] + 4, y + 12);

      pdf.setFont('helvetica', 'bold');
      pdf.text(amtStr, colX[4] + 4, y + 12);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      if (statusStr === 'PAID') {
        pdf.setTextColor(34, 197, 94);
      } else if (statusStr === 'CANCELLED') {
        pdf.setTextColor(239, 68, 68);
      } else {
        pdf.setTextColor(212, 175, 55);
      }
      pdf.text(statusStr, colX[5] + 4, y + 12);

      y += 18;
    });
  }

  // Footer Line & Branding
  pdf.setDrawColor(212, 175, 55);
  pdf.setLineWidth(1.5);
  pdf.line(margin, y + 10, pageWidth - margin, y + 10);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(130, 130, 130);
  pdf.text('Generated by Elite Chocolate Business Engine · Confidential', margin, y + 24);

  const blob = pdf.output('blob');
  await downloadBlob(blob, filename, 'application/pdf');
  return 'downloaded';
}

/**
 * Generate a luxury multi-page Cashflow Statement PDF report.
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
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 30;
  const usableW = pageWidth - margin * 2;
  let y = margin;

  // 1. Header Banner
  pdf.setFillColor(15, 23, 42); // slate-900
  pdf.roundedRect(margin, y, usableW, 58, 6, 6, 'F');

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14.5);
  pdf.setTextColor(45, 212, 191); // teal-400
  pdf.text(String(companyName).toUpperCase(), margin + 14, y + 24);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(203, 213, 225);
  pdf.text('CASHFLOW & OPERATING FINANCIAL STATEMENT', margin + 14, y + 42);

  const nowStr = new Date().toLocaleDateString('en-PK', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(255, 255, 255);
  pdf.text(nowStr, pageWidth - margin - 14, y + 33, { align: 'right' });

  y += 72;

  // 2. Financial Overview Cards
  const totalSales = Number(cashflow.total_sales || 0);
  const buyingCost = Number(cashflow.buying_cost || 0);
  const netProfit = Number(cashflow.net_profit || 0);
  const helpGiven = Number(cashflow.help_given || 0);

  const kpis = [
    { label: 'TOTAL SALES (INVOICED)', value: `${currencySymbol} ${exportMoney(totalSales)}`, color: [16, 185, 129] },
    { label: 'SAUDIA BUYING (EXPENSES)', value: `${currencySymbol} ${exportMoney(buyingCost)}`, color: [244, 63, 94] },
    { label: 'NET PROFIT RETAINED', value: `${currencySymbol} ${exportMoney(netProfit)}`, color: [14, 165, 233] },
    { label: 'HELP MONEY GIVEN (OUT)', value: `${currencySymbol} ${exportMoney(helpGiven)}`, color: [234, 179, 8] },
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

  y += 2 * (cardH + 10) + 14;

  // 3. Daily Performance Table
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(9.5);
  pdf.setTextColor(15, 23, 42);
  pdf.text('Daily Cashflow Trend (Past 14 Days)', margin, y);
  y += 10;

  const dayHeaders = ['Date', 'Sales In', 'Buying Out', 'Help Given', 'Net Profit'];
  const dayColW = [usableW * 0.22, usableW * 0.2, usableW * 0.2, usableW * 0.18, usableW * 0.2];
  const dayColX = [];
  {
    let x = margin;
    for (let i = 0; i < dayHeaders.length; i += 1) {
      dayColX.push(x);
      x += dayColW[i];
    }
  }

  pdf.setFillColor(15, 23, 42);
  pdf.rect(margin, y, usableW, 18, 'F');
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(7.5);
  pdf.setTextColor(255, 255, 255);
  dayHeaders.forEach((h, i) => {
    pdf.text(h, dayColX[i] + 4, y + 12);
  });
  y += 18;

  const trendList = (dailyTrend || []).slice(0, 14);
  if (!trendList.length) {
    pdf.setFont('helvetica', 'italic');
    pdf.setFontSize(8.5);
    pdf.setTextColor(140, 140, 140);
    pdf.text('No cashflow trend data recorded.', margin + 8, y + 16);
    y += 24;
  } else {
    trendList.forEach((t, idx) => {
      const bg = idx % 2 === 0 ? 255 : 248;
      pdf.setFillColor(bg, bg, bg);
      pdf.rect(margin, y, usableW, 16, 'F');

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(30, 41, 59);

      const dSales = Number(t.sales || 0);
      const dBuying = Number(t.buying || 0);
      const dHelp = Number(t.help || 0);
      const dProfit = Number(t.profit || 0);

      pdf.text(String(t.date || '—'), dayColX[0] + 4, y + 11);
      pdf.text(`${currencySymbol} ${exportMoney(dSales)}`, dayColX[1] + 4, y + 11);
      pdf.text(`${currencySymbol} ${exportMoney(dBuying)}`, dayColX[2] + 4, y + 11);
      pdf.text(`${currencySymbol} ${exportMoney(dHelp)}`, dayColX[3] + 4, y + 11);

      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(dProfit >= 0 ? 16 : 239, dProfit >= 0 ? 185 : 68, dProfit >= 0 ? 129 : 68);
      pdf.text(`${currencySymbol} ${exportMoney(dProfit)}`, dayColX[4] + 4, y + 11);

      y += 16;
    });
  }

  y += 16;

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
      pdf.text(h, colX[i] + 3, y + 11);
    });
    y += 16;
  };

  drawTableHeader();

  // Draw Orders Rows
  orders.forEach((o, idx) => {
    if (checkPageBreak(22)) {
      drawTableHeader();
    }

    const bg = idx % 2 === 0 ? 255 : 248;
    pdf.setFillColor(bg, bg, bg);
    pdf.rect(margin, y, usableW, 16, 'F');

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(30, 41, 59);

    const isBuy = o.is_supplier || o.bill_type === 'supplier';
    const isHelp = o.is_help || o.bill_type === 'help';
    const typeStr = isBuy ? 'Saudia Buy' : isHelp ? 'Help' : 'Sale';
    const dateStr = String(o.bill_date || '').substring(5); // MM-DD
    const invStr = String(o.invoice_number || '').substring(0, 14);
    const partyStr = String(o.customer_name || 'Walk-in').substring(0, 20);

    const salesStr = isBuy || isHelp ? '−' : `${exportMoney(o.total_amount || 0)}`;
    const buyStr = isBuy ? `${exportMoney(o.total_amount || 0)}` : '−';
    const profitStr = isHelp ? 'Rs. 0' : isBuy ? `-Rs. ${exportMoney(o.total_amount)}` : `+Rs. ${exportMoney(o.total_amount)}`;

    const isSettled = Boolean(
      settlementInfo &&
        (String(o.bill_date || '') < String(settlementInfo.period_end || '') ||
          (String(o.bill_date || '') === String(settlementInfo.period_end || '') &&
            Number(o.id) <= Number(settlementInfo.last_bill_id || Infinity)))
    );

    pdf.text(dateStr, colX[0] + 3, y + 11);
    pdf.text(invStr, colX[1] + 3, y + 11);
    pdf.text(typeStr, colX[2] + 3, y + 11);
    pdf.text(partyStr, colX[3] + 3, y + 11);
    pdf.text(salesStr, colX[4] + 3, y + 11);
    pdf.text(buyStr, colX[5] + 3, y + 11);

    pdf.setFont('helvetica', 'bold');
    pdf.setTextColor(isBuy ? 239 : isHelp ? 148 : 16, isBuy ? 68 : isHelp ? 163 : 185, isBuy ? 68 : isHelp ? 184 : 129);
    pdf.text(profitStr, colX[6] + 3, y + 11);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(6.5);
    pdf.setTextColor(isSettled ? 34 : 212, isSettled ? 197 : 175, isSettled ? 94 : 55);
    pdf.text(isSettled ? 'Settled' : 'Unsettled', colX[7] + 3, y + 11);

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

  const blob = pdf.output('blob');
  await downloadBlob(blob, filename, 'application/pdf');
  return 'downloaded';
}
