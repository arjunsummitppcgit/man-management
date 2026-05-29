import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { formatDate } from '@/lib/utils';

/**
 * Export data as a PDF with a title, date, and auto-table.
 * The file downloads automatically in the browser.
 */
export function exportToPDF(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string
): void {
  const doc = new jsPDF();

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
    body: rows.map((row) => row.map((cell) => String(cell))),
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
    styles: {
      fontSize: 9,
      cellPadding: 4,
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
  rows: (string | number)[][],
  filename: string
): void {
  // Build worksheet data: title row, blank row, headers, then data
  const wsData: (string | number)[][] = [
    [title],
    [`Generated: ${formatDate(new Date())}`],
    [], // blank row
    headers,
    ...rows,
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(wsData);

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
