import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDate } from '@/lib/utils';

/**
 * A cell value. `null` writes a genuinely empty cell rather than the string
 * 'null' — worth having for wide statements, where a zero on every idle column
 * is noise the reader has to look past.
 */
export type ExportCell = string | number | null;

export interface ExportOptions {
  /** Wide tables need the long edge of the sheet to stay readable. */
  orientation?: 'portrait' | 'landscape';
  /**
   * Excel number format applied to numeric cells, e.g. '##,##,##0.000' for the
   * Indian grouping used across the register. Only meaningful when the rows
   * carry real numbers instead of pre-formatted strings.
   */
  numberFormat?: string;
}

const cellText = (cell: ExportCell): string => (cell === null || cell === undefined ? '' : String(cell));

/**
 * Export data as a PDF with a title, date, and auto-table.
 * The file downloads automatically in the browser.
 */
export function exportToPDF(
  title: string,
  headers: string[],
  rows: ExportCell[][],
  filename: string,
  options?: ExportOptions
): void {
  const landscape = options?.orientation === 'landscape';
  const doc = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait' });

  // Title
  doc.setFontSize(18);
  doc.setTextColor(13, 148, 136); // teal-600
  doc.text(title, 14, 22);

  // Date
  doc.setFontSize(10);
  doc.setTextColor(107, 114, 128); // gray-500
  doc.text(`Generated: ${formatDate(new Date())}`, 14, 30);

  // Table
  autoTable(doc, {
    startY: 38,
    head: [headers],
    body: rows.map((row) => row.map(cellText)),
    theme: 'grid',
    headStyles: {
      fillColor: [13, 148, 136], // teal-600
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
    },
    bodyStyles: {
      textColor: [55, 65, 81], // gray-700
      halign: 'center',
    },
    alternateRowStyles: {
      fillColor: [240, 253, 250], // teal-50
    },
    // Landscape is only reached for it, so tighten to fit the extra columns
    styles: {
      fontSize: landscape ? 7.5 : 9,
      cellPadding: landscape ? 2.5 : 4,
      overflow: 'linebreak',
    },
    margin: { top: 38, left: 14, right: 14 },
  });

  // Download
  const safeName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  doc.save(safeName);
}

/**
 * Export data as an Excel (.xlsx) file.
 * The file downloads automatically in the browser.
 */
export function exportToExcel(
  title: string,
  headers: string[],
  rows: ExportCell[][],
  filename: string,
  options?: ExportOptions
): void {
  // Build worksheet data: title row, blank row, headers, then data
  const wsData: ExportCell[][] = [
    [title],
    [`Generated: ${formatDate(new Date())}`],
    [], // blank row
    headers,
    ...rows,
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(wsData);

  // Rows that carry real numbers stay summable in Excel; all they need is the
  // display format the register uses, applied to the numeric cells only.
  if (options?.numberFormat && worksheet['!ref']) {
    const range = XLSX.utils.decode_range(worksheet['!ref']);
    for (let r = range.s.r; r <= range.e.r; r += 1) {
      for (let c = range.s.c; c <= range.e.c; c += 1) {
        const cell = worksheet[XLSX.utils.encode_cell({ r, c })];
        if (cell && cell.t === 'n') cell.z = options.numberFormat;
      }
    }
  }

  // Set column widths based on header lengths
  worksheet['!cols'] = headers.map((header) => ({
    wch: Math.max(header.length + 4, 12),
  }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');

  // Download
  const safeName = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
  XLSX.writeFile(workbook, safeName);
}
