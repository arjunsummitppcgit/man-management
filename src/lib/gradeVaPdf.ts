// ─── Grade Vs VA: the paper layout ───────────────────────────────────────────
// Written against A4 (794px at 96dpi) and styled like the HON to HL
// location-wise summary the client already prints: teal masthead, a row of
// tiles, then the statement itself.
//
// Every figure gets `white-space: nowrap` and every column an explicit width,
// which is the whole point of the exercise — the generic table exporter wrapped
// "21,698.000" onto two lines and a statement you have to reassemble in your
// head is not a statement.

import { escapeHtml } from './export';
import { buildGradeVaMatrix, REPORT_VARIETIES, type GradeVaEntry } from './gradeVa';
import { formatVaQty } from './hlVa';

const DASH = '<span class="gva-nil">-</span>';

const cell = (v: number) => (v > 0 ? formatVaQty(v) : DASH);

/** kg, rounded — tiles read as headlines, not as register lines. */
const kg = (v: number) => v.toLocaleString('en-IN', { maximumFractionDigits: 0 });

const STYLES = `
.gva { font-family: 'Segoe UI', system-ui, -apple-system, Arial, sans-serif; color: #1f2937; background: #ffffff; padding: 26px; }
.gva * { margin: 0; padding: 0; box-sizing: border-box; }

.gva-head { background: linear-gradient(135deg, #0d9488 0%, #0f766e 55%, #115e59 100%); color: #ffffff; border-radius: 16px; padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; }
.gva-head h1 { font-size: 21px; font-weight: 700; letter-spacing: 0.3px; color: #ffffff; }
.gva-head .gva-sub { font-size: 12px; color: #ccfbf1; margin-top: 5px; }
.gva-brand { text-align: right; }
.gva-brand .gva-name { font-size: 14px; font-weight: 700; color: #ffffff; }
.gva-brand .gva-tag { font-size: 10px; color: #99f6e4; margin-top: 2px; }

.gva-tiles { display: flex; gap: 11px; margin: 16px 0; }
.gva-tile { flex: 1; border-radius: 14px; padding: 12px 14px; border: 1px solid #e5e7eb; }
.gva-tile .gva-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700; }
.gva-tile .gva-value { font-size: 19px; font-weight: 800; margin-top: 4px; white-space: nowrap; }
.gva-tile .gva-note { font-size: 10px; font-weight: 600; margin-top: 2px; }
.gva-tile.t-total { background: #f0fdfa; border-color: #99f6e4; }
.gva-tile.t-total .gva-label { color: #0d9488; } .gva-tile.t-total .gva-value { color: #115e59; } .gva-tile.t-total .gva-note { color: #14b8a6; }
.gva-tile.t-grade { background: #eef2ff; border-color: #c7d2fe; }
.gva-tile.t-grade .gva-label { color: #4f46e5; } .gva-tile.t-grade .gva-value { color: #3730a3; } .gva-tile.t-grade .gva-note { color: #6366f1; }
.gva-tile.t-variety { background: #ecfdf5; border-color: #a7f3d0; }
.gva-tile.t-variety .gva-label { color: #059669; } .gva-tile.t-variety .gva-value { color: #065f46; } .gva-tile.t-variety .gva-note { color: #10b981; }
.gva-tile.t-rows { background: #fffbeb; border-color: #fde68a; }
.gva-tile.t-rows .gva-label { color: #d97706; } .gva-tile.t-rows .gva-value { color: #92400e; } .gva-tile.t-rows .gva-note { color: #f59e0b; }

.gva-frame { border: 1px solid #e5e7eb; border-radius: 14px; overflow: hidden; }
.gva-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.gva-table caption { background: #e0e7ff; color: #1e1b4b; font-size: 12px; font-weight: 800; letter-spacing: 1.2px; padding: 8px 0; }
.gva-table thead th { background: #0d9488; color: #ffffff; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; padding: 10px 6px; text-align: right; white-space: nowrap; }
.gva-table thead th:first-child { text-align: left; padding-left: 12px; }
.gva-table tbody td { font-size: 11px; padding: 7px 6px; text-align: right; white-space: nowrap; border-bottom: 1px solid #f1f5f9; font-variant-numeric: tabular-nums; color: #334155; }
.gva-table tbody td:first-child { text-align: left; padding-left: 12px; font-weight: 700; color: #0f172a; border-right: 1px solid #f1f5f9; }
.gva-table tbody td.gva-rowtotal { font-weight: 700; color: #0f172a; }
.gva-table tbody tr.gva-alt td { background: #f8fafc; }
.gva-table tbody tr.gva-idle td:first-child { color: #94a3b8; }
.gva-nil { color: #cbd5e1; }

.gva-table tfoot td { background: #ccfbf1; color: #134e4a; font-size: 11.5px; font-weight: 800; padding: 10px 6px; text-align: right; white-space: nowrap; border-top: 2px solid #5eead4; font-variant-numeric: tabular-nums; }
.gva-table tfoot td:first-child { text-align: left; padding-left: 12px; letter-spacing: 0.5px; }
.gva-table tfoot td.gva-grand { background: #5eead4; color: #042f2e; }

.gva-foot { margin-top: 16px; font-size: 10px; color: #9ca3af; text-align: center; }
`;

export interface GradeVaSheetOptions {
  /** HL→VA rows for the period, already narrowed to the chosen location. */
  entries: GradeVaEntry[];
  /** The period the sheet covers, e.g. "1 Aug – 7 Sep 2026". */
  rangeLabel: string;
  /** Name of the chosen location, when the page is filtered to one. */
  locationLabel?: string;
}

/** The sheet as a standalone block of HTML, ready for exportStyledHtmlToPDF. */
export function gradeVaSheetHtml({
  entries,
  rangeLabel,
  locationLabel,
}: GradeVaSheetOptions): string {
  const { rows, varietyTotals, grandTotal } = buildGradeVaMatrix(entries);

  const bodyHtml = rows
    .map((r, i) => {
      const classes = [i % 2 === 1 ? 'gva-alt' : '', r.total > 0 ? '' : 'gva-idle']
        .filter(Boolean)
        .join(' ');
      return `<tr${classes ? ` class="${classes}"` : ''}>
        <td>${escapeHtml(r.grade)}</td>
        ${r.cells.map((v) => `<td>${cell(v)}</td>`).join('')}
        <td class="gva-rowtotal">${cell(r.total)}</td>
      </tr>`;
    })
    .join('');

  // Headline figures for the tiles. The top grade and variety are read off the
  // matrix rather than the entries, so they can never disagree with the table.
  const topRow = rows.reduce((a, r) => (r.total > a.total ? r : a), { grade: '—', total: 0 });
  const topVarietyIdx = varietyTotals.reduce((a, v, i) => (v > varietyTotals[a] ? i : a), 0);
  const topVariety = varietyTotals[topVarietyIdx] > 0 ? REPORT_VARIETIES[topVarietyIdx] : '—';
  const gradesWithVa = rows.filter((r) => r.total > 0).length;
  const share = (v: number) => (grandTotal > 0 ? `${((v / grandTotal) * 100).toFixed(1)}% of VA` : '—');

  const subtitle = locationLabel
    ? `${escapeHtml(rangeLabel)} · ${escapeHtml(locationLabel)}`
    : escapeHtml(rangeLabel);

  return `<style>${STYLES}</style>
<div class="gva">
  <div class="gva-head">
    <div>
      <h1>Grade Vs VA Report</h1>
      <div class="gva-sub">${subtitle}</div>
    </div>
    <div class="gva-brand">
      <div class="gva-name">PPC Manager</div>
      <div class="gva-tag">Prawn Processing Control</div>
    </div>
  </div>

  <div class="gva-tiles">
    <div class="gva-tile t-total">
      <div class="gva-label">Total VA (Kgs)</div>
      <div class="gva-value">${kg(grandTotal)}</div>
      <div class="gva-note">across ${gradesWithVa} grade${gradesWithVa === 1 ? '' : 's'}</div>
    </div>
    <div class="gva-tile t-grade">
      <div class="gva-label">Top Grade</div>
      <div class="gva-value">${escapeHtml(topRow.total > 0 ? topRow.grade : '—')}</div>
      <div class="gva-note">${topRow.total > 0 ? `${kg(topRow.total)} kg · ${share(topRow.total)}` : 'no VA recorded'}</div>
    </div>
    <div class="gva-tile t-variety">
      <div class="gva-label">Top Variety</div>
      <div class="gva-value">${topVariety}</div>
      <div class="gva-note">${
        varietyTotals[topVarietyIdx] > 0
          ? `${kg(varietyTotals[topVarietyIdx])} kg · ${share(varietyTotals[topVarietyIdx])}`
          : 'no VA recorded'
      }</div>
    </div>
    <div class="gva-tile t-rows">
      <div class="gva-label">Grades With VA</div>
      <div class="gva-value">${gradesWithVa}</div>
      <div class="gva-note">of ${rows.length} on the chart</div>
    </div>
  </div>

  <div class="gva-frame">
    <table class="gva-table">
      <caption>GRADES VS (V/A)</caption>
      <colgroup>
        <col style="width:12%" />
        ${REPORT_VARIETIES.map(() => '<col style="width:10.714%" />').join('')}
        <col style="width:13%" />
      </colgroup>
      <thead>
        <tr>
          <th>Grades</th>
          ${REPORT_VARIETIES.map((v) => `<th>${v}</th>`).join('')}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>${bodyHtml}</tbody>
      <tfoot>
        <tr>
          <td>TOTAL</td>
          ${varietyTotals.map((v) => `<td>${cell(v)}</td>`).join('')}
          <td class="gva-grand">${cell(grandTotal)}</td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="gva-foot">Generated by PPC Manager on ${escapeHtml(new Date().toLocaleString('en-IN'))}</div>
</div>`;
}
