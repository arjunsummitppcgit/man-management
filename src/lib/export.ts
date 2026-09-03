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
 * Export a piece of the page itself as a PDF — the rendered card, exactly as it
 * looks on screen, rather than a table rebuilt from the same numbers.
 *
 * Used by the Daily Plan, which is read as a laid-out sheet (totals tile,
 * a block per location, teal subtotal rows) and not as a spreadsheet. A rebuilt
 * table is a different document that happens to hold the same figures; this is
 * the document people already know from the screen.
 *
 * Whatever theme is on screen is what lands in the file — press it in dark mode
 * and the PDF is dark.
 */
export async function exportNodeToPDF(
  node: HTMLElement,
  filename: string
): Promise<void> {
  // Loaded on demand: it is a heavy library, and nothing on first paint needs it.
  //
  // html2canvas-pro rather than the html2canvas jsPDF carries: Tailwind v4 emits
  // its palette as oklch(), which html2canvas 1.x refuses to parse ("unsupported
  // color function"), and the fork added oklch/lab support.
  const { default: html2canvas } = await import('html2canvas-pro');

  const canvas = await html2canvas(node, {
    // Retina-ish, so the text in the PDF is sharp rather than a blown-up
    // screenshot of a phone.
    scale: Math.max(2, window.devicePixelRatio || 1),
    // The card's own corners are rounded, so the page shows through them. Take
    // the page's colour rather than html2canvas's default white, which would
    // put four white notches on a dark sheet.
    backgroundColor: getComputedStyle(document.body).backgroundColor || null,
    useCORS: true,
    logging: false,
    // The share row is chrome, not content: a PDF containing a PDF button is
    // a puzzle for whoever opens it.
    ignoreElements: (el) => el instanceof HTMLElement && el.dataset.exportHide === 'true',
  });

  const width = 210; // A4 portrait, mm
  const height = (canvas.height / canvas.width) * width;

  // A plan that fits goes on A4, so it prints on ordinary paper. A long one
  // becomes a single tall page instead: slicing it into A4 sheets cuts a batch
  // row in half across the break, and a batch row cut in half is a figure
  // someone has to guess at.
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: height <= 297 ? 'a4' : [width, height],
  });

  doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, width, height, undefined, 'FAST');

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
