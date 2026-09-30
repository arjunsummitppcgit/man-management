'use client';

import React, { useMemo, useState } from 'react';
import Modal from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { exportStyledHtmlToPDF } from '@/lib/export';
import { formatHours, runningHours } from '@/lib/grading';
import {
  DEFECT_SUGGESTIONS,
  GRADE_SUGGESTIONS,
  GRADING_PARTICULARS,
  bsRatio,
  formatBsRatio,
  emptyDefect,
  emptyGradingLine,
  formLineTotals,
  formatGradingKg,
  gradingBatchKey,
  gradingFormFrom,
  gradingSavePayload,
  gradingTotals,
  groupGradingBatches,
  normaliseParticulars,
  parseGradingNumber,
  sheetDate,
  signedKg,
  suggestGrade,
  type GradingBatch,
  type GradingSavePayload,
} from '@/lib/gradingReport';
import { gradingReportSheetHtml } from '@/lib/gradingReportPdf';
import type {
  GradingReport,
  GradingReportForm,
  GradingReportLineForm,
  YieldEntry,
} from '@/types';

// ─── Grading Report tab ──────────────────────────────────────────────────────
// Every batch on the date's HONS TO HL register gets one sheet. The list shows
// which are graded; opening one shows the sheet, its top half read from HONS TO
// HL and the rest typed in from the paper.

interface GradingReportTabProps {
  date: string;
  /** The date's HONS TO HL lines — the batches there are to grade. */
  batchEntries: YieldEntry[];
  reports: GradingReport[];
  saving: boolean;
  /** Hands the sheet to the page, which confirms the date and saves it. */
  onSave: (batchId: string, payload: GradingSavePayload) => void;
  /** Resolves true once the sheet is gone. */
  onDelete: (batchId: string) => Promise<boolean>;
}

const inputClass =
  'w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-sky-400';
const cellClass =
  'w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-900 placeholder-gray-400 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/10';
const labelClass = 'block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1';

const pct = (v: number | null) => (v === null ? '-' : `${v.toFixed(2)}%`);

export default function GradingReportTab({
  date,
  batchEntries,
  reports,
  saving,
  onSave,
  onDelete,
}: GradingReportTabProps) {
  const batches = useMemo(() => groupGradingBatches(batchEntries), [batchEntries]);
  const reportByKey = useMemo(
    () => new Map(reports.map((r) => [gradingBatchKey(r.batch_id), r])),
    [reports]
  );
  // A sheet whose batch has left HONS TO HL (its Batch ID was retyped there) is
  // still shown, so it can be read and removed rather than silently lost
  const orphans = useMemo(() => {
    const keys = new Set(batches.map((b) => b.key));
    return reports.filter((r) => !keys.has(gradingBatchKey(r.batch_id)));
  }, [batches, reports]);

  const [openKey, setOpenKey] = useState<string | null>(null);

  if (openKey) {
    const batch = batches.find((b) => b.key === openKey) ?? null;
    const report = reportByKey.get(openKey) ?? null;
    if (batch || report) {
      return (
        <GradingSheet
          // A fresh save (new updated_at) re-opens the sheet from what was stored
          key={`${openKey}|${report?.updated_at ?? 'new'}`}
          date={date}
          batch={batch}
          report={report}
          saving={saving}
          onBack={() => setOpenKey(null)}
          onSave={onSave}
          onDelete={async (batchId) => {
            const gone = await onDelete(batchId);
            if (gone) setOpenKey(null);
            return gone;
          }}
        />
      );
    }
  }

  const graded = batches.filter((b) => reportByKey.has(b.key)).length;

  return (
    <div className="animate-fade-in space-y-4">
      <div className="bg-sky-50 rounded-2xl px-4 py-3 border border-sky-100">
        <p className="text-xs font-semibold text-sky-700">Grading Report</p>
        <p className="text-[11px] text-sky-600 mt-0.5">
          One sheet per batch on this date&apos;s HONS TO HL register. HON count, HON weight, H/L
          weighment, R/M grader and theoretical yield come from HONS TO HL — correct them there. The
          location selector above doesn&apos;t apply here.
        </p>
      </div>

      {batches.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center">
          <p className="text-sm font-semibold text-gray-700">No batches on HONS TO HL for this date</p>
          <p className="text-xs text-gray-500 mt-1">
            Enter the day on the HONS TO HL tab first — each batch there gets a grading sheet here.
          </p>
        </div>
      ) : (
        <>
          <p className="text-[11px] font-semibold text-gray-500 px-1">
            {graded} of {batches.length} batch{batches.length === 1 ? '' : 'es'} graded
          </p>
          <div className="space-y-2">
            {batches.map((b) => (
              <BatchCard
                key={b.key}
                batch={b}
                report={reportByKey.get(b.key) ?? null}
                onOpen={() => setOpenKey(b.key)}
              />
            ))}
          </div>
        </>
      )}

      {orphans.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold text-rose-600 px-1">
            Sheets whose batch is no longer on HONS TO HL for this date
          </p>
          {orphans.map((r) => (
            <BatchCard
              key={r.id}
              batch={null}
              report={r}
              onOpen={() => setOpenKey(gradingBatchKey(r.batch_id))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── One batch in the list ──────────────────────────────────────────────────

function BatchCard({
  batch,
  report,
  onOpen,
}: {
  batch: GradingBatch | null;
  report: GradingReport | null;
  onOpen: () => void;
}) {
  const totals = report
    ? gradingTotals(report.lines.map((l) => (l.total_kgs === null ? null : Number(l.total_kgs))), batch)
    : null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full text-left bg-white rounded-2xl p-3.5 shadow-sm border transition-colors hover:border-sky-200 ${
        batch ? 'border-gray-100' : 'border-rose-100'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900 truncate">{batch?.batchId ?? report?.batch_id}</p>
          {batch ? (
            <p className="text-[11px] text-gray-500 mt-0.5">
              {batch.locations.join(' + ') || '-'} · Count {batch.countText || '-'} · HON{' '}
              {formatGradingKg(batch.honKgs)} · HL {formatGradingKg(batch.hlKgs)}
            </p>
          ) : (
            <p className="text-[11px] text-rose-600 mt-0.5">Not on HONS TO HL for this date</p>
          )}
        </div>
        {report ? (
          <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-[10px] font-bold whitespace-nowrap">
            Graded
          </span>
        ) : (
          <span className="px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[10px] font-bold whitespace-nowrap">
            Not graded
          </span>
        )}
      </div>
      {report && totals && (
        <p className="text-[11px] font-semibold text-gray-700 mt-1.5">
          Graded {formatGradingKg(totals.graded)} kg
          {totals.difference !== null && ` (${signedKg(totals.difference)})`}
          {totals.gradingYield !== null && ` · Yield ${pct(totals.gradingYield)}`}
          {report.grader_name && ` · ${report.grader_name}`}
        </p>
      )}
    </button>
  );
}

// ─── The sheet ──────────────────────────────────────────────────────────────

interface GradingSheetProps {
  date: string;
  batch: GradingBatch | null;
  report: GradingReport | null;
  saving: boolean;
  onBack: () => void;
  onSave: (batchId: string, payload: GradingSavePayload) => void;
  onDelete: (batchId: string) => Promise<boolean>;
}

const LINE_COLS = 7; // grade, count, particulars, total, remarks, big, small

function GradingSheet({ date, batch, report, saving, onBack, onSave, onDelete }: GradingSheetProps) {
  const { showToast } = useToast();
  const [initial] = useState<GradingReportForm>(() => gradingFormFrom(report, batch, date));
  const [form, setForm] = useState<GradingReportForm>(initial);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const batchId = batch?.batchId ?? report?.batch_id ?? '';
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const totals = gradingTotals(formLineTotals(form), batch);
  const hours = runningHours(form.start_time, form.end_time);

  const set = <K extends keyof GradingReportForm>(field: K, value: GradingReportForm[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const setLine = (idx: number, field: keyof GradingReportLineForm, value: string) =>
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, [field]: value };
        // Fill the grade from the count while the grade is still the one the
        // app suggested — a grade typed by hand is never overwritten
        if (field === 'count_text' && (l.grade === '' || l.grade === suggestGrade(l.count_text))) {
          next.grade = suggestGrade(value) ?? '';
        }
        return next;
      }),
    }));

  const handleLineKey = (e: React.KeyboardEvent, row: number, col: number) => {
    let r = row;
    let c = col;
    if (e.key === 'ArrowUp') r = Math.max(0, row - 1);
    else if (e.key === 'ArrowDown') r = Math.min(form.lines.length - 1, row + 1);
    else if (e.key === 'ArrowLeft' && e.altKey) c = Math.max(0, col - 1);
    else if (e.key === 'ArrowRight' && e.altKey) c = Math.min(LINE_COLS - 1, col + 1);
    else return;
    if (r !== row || c !== col) {
      e.preventDefault();
      document.getElementById(`grl-${r}-${c}`)?.focus();
    }
  };

  // A value saved from somewhere else still shows, even if the list lacks it
  const particularOptions = (current: string): string[] => {
    const value = normaliseParticulars(current);
    return value && !(GRADING_PARTICULARS as readonly string[]).includes(value)
      ? [...GRADING_PARTICULARS, value]
      : [...GRADING_PARTICULARS];
  };

  const handleExport = async () => {
    if (!report) return;
    setExporting(true);
    try {
      const safeBatch = report.batch_id.replace(/[\\/:*?"<>|]+/g, '-');
      await exportStyledHtmlToPDF(
        gradingReportSheetHtml({ report, batch }),
        `Grading Report ${safeBatch} ${date}`
      );
    } catch (error) {
      console.error('Grading report PDF failed:', error);
      showToast('Could not create the PDF. Please try again.', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="animate-fade-in space-y-4">
      {/* Title */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            if (dirty && !window.confirm('Leave this sheet? What you typed has not been saved.')) return;
            onBack();
          }}
          className="px-3 py-2 rounded-xl bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200"
        >
          ← All batches
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-gray-900 truncate">Grading Report · {batchId}</p>
          <p className="text-[11px] text-gray-500">
            {report ? 'Saved sheet' : 'New sheet'}
            {dirty && ' · unsaved changes'}
          </p>
        </div>
      </div>

      {!batch && (
        <div className="bg-rose-50 rounded-2xl px-4 py-3 border border-rose-100">
          <p className="text-xs font-semibold text-rose-700">This batch is not on HONS TO HL for {sheetDate(date)}</p>
          <p className="text-[11px] text-rose-600 mt-0.5">
            Its Batch ID was probably changed on the HONS TO HL tab. This sheet can&apos;t be saved
            again — download it if you need it, then delete it and grade the batch under its new ID.
          </p>
        </div>
      )}

      {/* From HONS TO HL */}
      {batch && (
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-semibold text-gray-700">From HONS TO HL</h3>
            <span className="text-[10px] font-semibold text-gray-400">Change these on the HONS TO HL tab</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Fact label="Batch No." value={batch.batchId} />
            <Fact label="Location" value={batch.locations.join(' + ') || '-'} />
            <Fact label="HON Count" value={batch.countText || '-'} />
            <Fact label="R/M Grader" value={batch.rmGrader || '-'} />
            <Fact label="HON Weight" value={`${formatGradingKg(batch.honKgs)} kg`} />
            <Fact label="H/L Weighment" value={`${formatGradingKg(batch.hlKgs)} kg`} />
            <Fact label="Theoretical Yield" value={pct(batch.theoreticalYield)} tone="text-purple-700" />
            {batch.rows.length > 1 && (
              <Fact label="Lines added" value={`${batch.rows.length} locations`} />
            )}
          </div>
        </div>
      )}

      {/* Sheet details */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-3">
        <h3 className="text-sm font-semibold text-gray-700">Sheet</h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>R/M Date</label>
            <input type="date" value={form.rm_date} onChange={(e) => set('rm_date', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Grading Date</label>
            <input type="date" value={form.grading_date} onChange={(e) => set('grading_date', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Grader Name</label>
            <input
              type="text"
              value={form.grader_name}
              onChange={(e) => set('grader_name', e.target.value)}
              placeholder="Name"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Checking Count</label>
            <input
              type="text"
              value={form.checking_count}
              onChange={(e) => set('checking_count', e.target.value)}
              placeholder="Count"
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Grading Start</label>
            <input type="time" value={form.start_time} onChange={(e) => set('start_time', e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>
              Grading End
              {hours !== null && <span className="ml-1 normal-case text-sky-600">· {formatHours(hours)}</span>}
            </label>
            <input type="time" value={form.end_time} onChange={(e) => set('end_time', e.target.value)} className={inputClass} />
          </div>
          <div className="col-span-2">
            <label className={labelClass}>Remarks</label>
            <input
              type="text"
              value={form.remarks}
              onChange={(e) => set('remarks', e.target.value)}
              placeholder="e.g. S.M.T Plant"
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Grade lines */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-x-auto">
        <div className="min-w-[720px] p-3">
          <div className="grid grid-cols-[76px_60px_96px_84px_1fr_70px_70px_48px_28px] gap-1.5 mb-2 px-1 border-b border-gray-100 pb-2">
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Grade</span>
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Count</span>
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Particulars</span>
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider text-right">Total (kg)</span>
            <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Remarks</span>
            <span className="text-[10px] font-semibold text-sky-600 uppercase tracking-wider text-right">Big</span>
            <span className="text-[10px] font-semibold text-sky-600 uppercase tracking-wider text-right">Small</span>
            <span className="text-[10px] font-semibold text-sky-600 uppercase tracking-wider text-right">B/S</span>
            <span></span>
          </div>

          <div className="space-y-1.5">
            {form.lines.map((line, idx) => {
              const ratio = bsRatio(parseGradingNumber(line.big_weight), parseGradingNumber(line.small_weight));
              return (
                <div
                  key={idx}
                  className="group grid grid-cols-[76px_60px_96px_84px_1fr_70px_70px_48px_28px] gap-1.5 items-center px-1"
                >
                  <input
                    id={`grl-${idx}-0`}
                    type="text"
                    list="grading-grades"
                    value={line.grade}
                    onChange={(e) => setLine(idx, 'grade', e.target.value)}
                    onKeyDown={(e) => handleLineKey(e, idx, 0)}
                    placeholder="21/25"
                    className={cellClass}
                  />
                  <input
                    id={`grl-${idx}-1`}
                    type="text"
                    value={line.count_text}
                    onChange={(e) => setLine(idx, 'count_text', e.target.value)}
                    onKeyDown={(e) => handleLineKey(e, idx, 1)}
                    placeholder="22"
                    className={cellClass}
                  />
                  <select
                    id={`grl-${idx}-2`}
                    value={normaliseParticulars(line.particulars)}
                    onChange={(e) => setLine(idx, 'particulars', e.target.value)}
                    onKeyDown={(e) => handleLineKey(e, idx, 2)}
                    className="w-full px-2 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-700 focus:border-teal-500 appearance-none"
                  >
                    <option value="">HL-...</option>
                    {particularOptions(line.particulars).map((p) => (
                      <option key={p} value={p}>
                        HL-{p}
                      </option>
                    ))}
                  </select>
                  <input
                    id={`grl-${idx}-3`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.001"
                    value={line.total_kgs}
                    onChange={(e) => setLine(idx, 'total_kgs', e.target.value)}
                    onKeyDown={(e) => handleLineKey(e, idx, 3)}
                    placeholder="0"
                    className={`${cellClass} text-right`}
                  />
                  <input
                    id={`grl-${idx}-4`}
                    type="text"
                    value={line.remarks}
                    onChange={(e) => setLine(idx, 'remarks', e.target.value)}
                    onKeyDown={(e) => handleLineKey(e, idx, 4)}
                    placeholder="Remarks"
                    className={cellClass}
                  />
                  <input
                    id={`grl-${idx}-5`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.001"
                    value={line.big_weight}
                    onChange={(e) => setLine(idx, 'big_weight', e.target.value)}
                    onKeyDown={(e) => handleLineKey(e, idx, 5)}
                    placeholder="Big"
                    className={`${cellClass} text-right`}
                  />
                  <input
                    id={`grl-${idx}-6`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.001"
                    value={line.small_weight}
                    onChange={(e) => setLine(idx, 'small_weight', e.target.value)}
                    onKeyDown={(e) => handleLineKey(e, idx, 6)}
                    placeholder="Small"
                    className={`${cellClass} text-right`}
                  />
                  <span className="text-[11px] font-bold text-right px-1 text-sky-700">
                    {formatBsRatio(ratio) || '-'}
                  </span>
                  <div className="flex justify-end pr-1">
                    <button
                      type="button"
                      aria-label={`Remove line ${idx + 1}`}
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          lines:
                            prev.lines.length > 1
                              ? prev.lines.filter((_, i) => i !== idx)
                              : [emptyGradingLine()],
                        }))
                      }
                      className="w-6 h-6 flex items-center justify-center rounded bg-rose-50 text-rose-500 hover:bg-rose-100 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-[76px_60px_96px_84px_1fr_70px_70px_48px_28px] gap-1.5 items-center px-1 mt-2 pt-2 border-t border-gray-100">
            <span className="col-span-3 text-[11px] font-bold text-gray-700 uppercase tracking-wider">Total</span>
            <span className="text-xs font-bold text-right text-gray-900 pr-2">{formatGradingKg(totals.graded) || '0'}</span>
            <span className="col-span-5"></span>
          </div>
        </div>
        {/* Outside the scrolling grid, so a phone sees them without scrolling */}
        <div className="px-3 pb-3 sticky left-0">
          <button
            type="button"
            onClick={() => setForm((prev) => ({ ...prev, lines: [...prev.lines, emptyGradingLine()] }))}
            className="w-full py-2.5 border border-dashed border-gray-200 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50"
          >
            + Add grade line
          </button>
          <p className="text-[10px] text-gray-400 mt-2">
            Big / Small: the B/S sample for that count (e.g. 105 / 95) — scroll right on a phone. B/S =
            Big ÷ Small. Leave blank where no sample was taken.
          </p>
        </div>
      </div>

      {/* The sums the sheet is read for */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Tile label="Total Graded" value={`${formatGradingKg(totals.graded) || '0'} kg`} />
        <Tile
          label="Difference"
          value={totals.difference === null ? '-' : `${signedKg(totals.difference)} kg`}
          note={batch ? `vs H/L weighment ${formatGradingKg(batch.hlKgs)}` : undefined}
        />
        <Tile
          label="Grading H/L Yield"
          value={pct(totals.gradingYield)}
          note={batch ? 'Total graded ÷ HON weight' : undefined}
        />
        <Tile
          label="Vs Theoretical"
          value={
            totals.vsTheoretical === null
              ? '-'
              : `${totals.vsTheoretical >= 0 ? '+' : ''}${totals.vsTheoretical.toFixed(2)}%`
          }
          tone={
            totals.vsTheoretical === null
              ? undefined
              : totals.vsTheoretical >= 0
                ? 'text-emerald-600'
                : 'text-rose-600'
          }
          note={batch?.theoreticalYield != null ? `Theoretical ${pct(batch.theoreticalYield)}` : undefined}
        />
      </div>

      {/* Defects */}
      <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Defects</h3>
        {form.defects.length === 0 && (
          <p className="text-[11px] text-gray-400">None recorded.</p>
        )}
        {form.defects.map((d, idx) => (
          <div key={idx} className="grid grid-cols-[1fr_96px_32px] gap-2 items-center">
            <input
              type="text"
              list="grading-defects"
              value={d.defect}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  defects: prev.defects.map((x, i) => (i === idx ? { ...x, defect: e.target.value } : x)),
                }))
              }
              placeholder="e.g. Soft"
              className={cellClass}
            />
            <div className="relative">
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                value={d.percent}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    defects: prev.defects.map((x, i) => (i === idx ? { ...x, percent: e.target.value } : x)),
                  }))
                }
                placeholder="0.0"
                className={`${cellClass} text-right pr-6`}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">%</span>
            </div>
            <button
              type="button"
              aria-label={`Remove defect ${idx + 1}`}
              onClick={() => setForm((prev) => ({ ...prev, defects: prev.defects.filter((_, i) => i !== idx) }))}
              className="w-7 h-7 flex items-center justify-center rounded bg-rose-50 text-rose-500 hover:bg-rose-100"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-3.5 h-3.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => setForm((prev) => ({ ...prev, defects: [...prev.defects, emptyDefect()] }))}
          className="w-full py-2.5 border border-dashed border-gray-200 rounded-xl text-xs font-semibold text-gray-500 hover:bg-gray-50"
        >
          + Add defect
        </button>
      </div>

      {/* Actions */}
      {batch && (
        <button
          onClick={() => onSave(batch.batchId, gradingSavePayload(form))}
          disabled={saving}
          className="w-full py-3.5 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-semibold rounded-xl shadow-lg shadow-sky-600/25 transition-all disabled:opacity-50 min-h-[48px]"
        >
          {saving ? 'Saving...' : 'Save Grading Report'}
        </button>
      )}
      {report && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting || dirty}
            title={dirty ? 'Save first — the PDF is the saved sheet' : undefined}
            className="py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm rounded-xl disabled:opacity-50 min-h-[44px]"
          >
            {exporting ? 'Preparing...' : 'Download PDF'}
          </button>
          <button
            type="button"
            onClick={() => setDeleteOpen(true)}
            className="py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 font-semibold text-sm rounded-xl min-h-[44px]"
          >
            Delete sheet
          </button>
        </div>
      )}
      {report && dirty && (
        <p className="text-[10px] text-gray-400 text-center -mt-2">Save first to download — the PDF is the saved sheet.</p>
      )}

      <datalist id="grading-grades">
        {GRADE_SUGGESTIONS.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>
      <datalist id="grading-defects">
        {DEFECT_SUGGESTIONS.map((d) => (
          <option key={d} value={d} />
        ))}
      </datalist>

      <Modal isOpen={deleteOpen} onClose={() => !deleting && setDeleteOpen(false)} title="Delete grading report">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            Delete the grading report for <strong>{batchId}</strong> ({sheetDate(date)})? Its grade lines and
            defects go with it. HONS TO HL is not touched.
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
              className="flex-1 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold text-sm rounded-xl disabled:opacity-50 min-h-[44px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                setDeleting(true);
                const gone = await onDelete(batchId);
                setDeleting(false);
                if (!gone) setDeleteOpen(false);
              }}
              disabled={deleting}
              className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-sm rounded-xl disabled:opacity-50 min-h-[44px]"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-sm font-bold truncate ${tone ?? 'text-gray-900'}`}>{value}</p>
    </div>
  );
}

function Tile({ label, value, note, tone }: { label: string; value: string; note?: string; tone?: string }) {
  return (
    <div className="bg-white rounded-2xl p-3 shadow-sm border border-gray-100">
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-base font-bold mt-0.5 ${tone ?? 'text-gray-900'}`}>{value}</p>
      {note && <p className="text-[10px] text-gray-400 mt-0.5">{note}</p>}
    </div>
  );
}
