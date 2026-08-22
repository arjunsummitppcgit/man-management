import type {
  DailyPlanHonHlEntry,
  DailyPlanHlVaEntry,
  DailyPlanVsActualRow,
  YieldEntry,
  HlVaEntry,
} from '@/types';

/** kgs, three decimals, the register's own precision. */
export const kg = (n: number): string => n.toFixed(3);

/** A signed variance, so a shortfall reads as one at a glance. */
export const signed = (n: number): string => `${n > 0 ? '+' : ''}${n.toFixed(3)}`;

/** Where a location's name comes from, whichever side of the plan it is on. */
const nameOf = (row: { location?: { name: string } | null }): string =>
  row.location?.name || 'Unknown';

// ─── The plan sheet ──────────────────────────────────────────────────────────

export interface PlanSheetBatch {
  batch_name: string;
  count_text: string;
  planned_qty: number;
  boxes: number;
}

export interface PlanSheetLocation {
  location: string;
  batches: PlanSheetBatch[];
  honQty: number;
  honBoxes: number;
  /** Null, not zero, when this location isn't planned for VA at all. */
  hlVaQty: number | null;
}

export interface PlanSheet {
  locations: PlanSheetLocation[];
  totals: { honQty: number; honBoxes: number; hlVaQty: number; batches: number };
}

/**
 * Fold both halves of the plan into one per-location sheet — the form is
 * entered batch by batch, but the sheet that goes out to the floor is read
 * location by location ("PPC 1, here is your day").
 *
 * A location that appears on only one half still gets a row: an HL to VA
 * allocation with no de-heading behind it is normal (the HL came from
 * yesterday), and so is the reverse.
 */
export function buildPlanSheet(
  honHl: DailyPlanHonHlEntry[],
  hlVa: DailyPlanHlVaEntry[]
): PlanSheet {
  const byLocation = new Map<string, PlanSheetLocation>();
  const bucket = (location: string): PlanSheetLocation => {
    let row = byLocation.get(location);
    if (!row) {
      row = { location, batches: [], honQty: 0, honBoxes: 0, hlVaQty: null };
      byLocation.set(location, row);
    }
    return row;
  };

  honHl.forEach((entry) => {
    const row = bucket(nameOf(entry));
    const qty = Number(entry.planned_qty) || 0;
    const boxes = Number(entry.boxes) || 0;
    row.batches.push({
      batch_name: entry.batch_name,
      count_text: entry.count_text,
      planned_qty: qty,
      boxes,
    });
    row.honQty += qty;
    row.honBoxes += boxes;
  });

  hlVa.forEach((entry) => {
    const row = bucket(nameOf(entry));
    row.hlVaQty = (row.hlVaQty ?? 0) + (Number(entry.planned_qty) || 0);
  });

  const locations = Array.from(byLocation.values()).sort((a, b) =>
    a.location.localeCompare(b.location)
  );

  const totals = locations.reduce(
    (acc, row) => {
      acc.honQty += row.honQty;
      acc.honBoxes += row.honBoxes;
      acc.hlVaQty += row.hlVaQty ?? 0;
      acc.batches += row.batches.length;
      return acc;
    },
    { honQty: 0, honBoxes: 0, hlVaQty: 0, batches: 0 }
  );

  return { locations, totals };
}

// ─── Plan against actual ─────────────────────────────────────────────────────

/**
 * What each location was given against what its register recorded.
 *
 * Both comparisons are input against input — planned HON against the HON that
 * went in (yield_entries.hon_kgs), planned HL against the HL that went into VA
 * (hl_va_entries.hl_kgs). Comparing a plan to the *output* of a stage would
 * fold the day's yield into the variance and blame the plan for it.
 *
 * A location shows up if it appears on either side, so a PPC that processed
 * without being planned is as visible as one that was planned and did nothing.
 */
export function buildPlanVsActual(
  planHonHl: DailyPlanHonHlEntry[],
  planHlVa: DailyPlanHlVaEntry[],
  yieldEntries: YieldEntry[],
  hlVaEntries: HlVaEntry[]
): { rows: DailyPlanVsActualRow[]; totals: Omit<DailyPlanVsActualRow, 'location'> } {
  const byLocation = new Map<string, DailyPlanVsActualRow>();
  const bucket = (location: string): DailyPlanVsActualRow => {
    let row = byLocation.get(location);
    if (!row) {
      row = { location, plannedHon: 0, actualHon: 0, plannedHl: 0, actualHl: 0 };
      byLocation.set(location, row);
    }
    return row;
  };

  planHonHl.forEach((e) => {
    bucket(nameOf(e)).plannedHon += Number(e.planned_qty) || 0;
  });
  planHlVa.forEach((e) => {
    bucket(nameOf(e)).plannedHl += Number(e.planned_qty) || 0;
  });
  yieldEntries.forEach((e) => {
    bucket(nameOf(e)).actualHon += Number(e.hon_kgs) || 0;
  });
  hlVaEntries.forEach((e) => {
    bucket(nameOf(e)).actualHl += Number(e.hl_kgs) || 0;
  });

  const rows = Array.from(byLocation.values()).sort((a, b) =>
    a.location.localeCompare(b.location)
  );

  const totals = rows.reduce(
    (acc, r) => {
      acc.plannedHon += r.plannedHon;
      acc.actualHon += r.actualHon;
      acc.plannedHl += r.plannedHl;
      acc.actualHl += r.actualHl;
      return acc;
    },
    { plannedHon: 0, actualHon: 0, plannedHl: 0, actualHl: 0 }
  );

  return { rows, totals };
}

/**
 * A variance is only worth colouring once there was a plan to miss — an
 * unplanned location's whole output would otherwise read as a huge overshoot.
 */
export function variance(planned: number, actual: number): number | null {
  if (planned <= 0) return null;
  return actual - planned;
}

/** The plan as a message — what actually gets sent to each PPC. */
export function planAsText(sheet: PlanSheet, dateLabel: string): string {
  const lines: string[] = [`*Daily Plan — ${dateLabel}*`, ''];

  sheet.locations.forEach((loc) => {
    lines.push(`*${loc.location}*`);
    if (loc.batches.length > 0) {
      lines.push('HON to HL:');
      loc.batches.forEach((b) => {
        const bits = [b.batch_name];
        if (b.count_text) bits.push(`count ${b.count_text}`);
        bits.push(`${kg(b.planned_qty)} kg`);
        if (b.boxes > 0) bits.push(`${b.boxes} box${b.boxes === 1 ? '' : 'es'}`);
        lines.push(`  • ${bits.join(' — ')}`);
      });
      lines.push(
        `  Total: ${kg(loc.honQty)} kg${loc.honBoxes > 0 ? ` / ${loc.honBoxes} boxes` : ''}`
      );
    }
    if (loc.hlVaQty !== null) {
      lines.push(`HL to VA: ${kg(loc.hlVaQty)} kg`);
    }
    lines.push('');
  });

  lines.push(
    `*Overall* — HON to HL ${kg(sheet.totals.honQty)} kg` +
      `${sheet.totals.honBoxes > 0 ? ` (${sheet.totals.honBoxes} boxes)` : ''}` +
      `, HL to VA ${kg(sheet.totals.hlVaQty)} kg`
  );

  return lines.join('\n');
}
