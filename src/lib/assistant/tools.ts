// ─── Assistant server tool layer ─────────────────────────────────────────────
// Each tool is a thin wrapper over the same Supabase queries the app's React
// hooks use, so assistant numbers always match the app. Tools return a compact
// JSON string to the model and push the full ToolResult envelope (for the UI
// results canvas) into ctx.collected.
//
// Security is enforced HERE (server-side), not in the prompt:
//  - admin-only tools refuse for staff (sub-user) sessions
//  - staff sessions are clamped to today's date only

import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ToolResult } from './types';
import { dayCount, daysPhrase, eachDay, periodLabel, toDdMm, toMonthLabel } from './format';

export interface ToolContext {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  isAdmin: boolean;
  today: string; // yyyy-MM-dd (IST)
  collected: ToolResult[];
  resolved: { person?: string; date?: string };
  /** Tool names in call order — written to assistant_query_log by the route. */
  toolsUsed: string[];
}

const ANALYSIS_MODEL = 'claude-sonnet-5';

// ─── helpers ─────────────────────────────────────────────────────────────────

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function kg(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/** Validates a date; for staff sessions, only today is allowed. */
function checkDate(ctx: ToolContext, date: string): string | null {
  if (!DATE_RE.test(date)) return `Invalid date "${date}" — use yyyy-MM-dd.`;
  if (!ctx.isAdmin && date !== ctx.today) {
    return `STAFF_RESTRICTED: staff accounts can only view today's data (${ctx.today}).`;
  }
  return null;
}

/** Longest span a trend tool will pull in one call. */
const MAX_TREND_DAYS = 92;

/** Validates both ends of a range and caps how much history one call can pull. */
function checkRange(ctx: ToolContext, from: string, to: string): string | null {
  const err = checkDate(ctx, from) || checkDate(ctx, to);
  if (err) return err;
  const span = dayCount(from, to);
  if (span === 0) return `Invalid range "${from}" to "${to}" — "to" must be on or after "from".`;
  if (span > MAX_TREND_DAYS) {
    return `Range too long (${span} days). Ask for at most ${MAX_TREND_DAYS} days in one call.`;
  }
  return null;
}

/**
 * Does this row's location match what the user asked for?
 *
 * Compared with letters and digits only, so "ppc 1", "PPC-1" and "PPC1" are
 * the same place — people say the name, they don't copy it out of Settings.
 * An empty `wanted` matches everything, which is what "all locations" means.
 */
function locationMatcher(wanted?: string): (name: string | null | undefined) => boolean {
  const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = norm(wanted?.trim() || '');
  if (!target) return () => true;
  return (name) => norm(name ?? '') === target;
}

function adminOnly(ctx: ToolContext): string | null {
  if (!ctx.isAdmin) {
    return 'ADMIN_ONLY: this information is restricted to admin accounts.';
  }
  return null;
}

/** Compact payload the model sees (full rows go to the UI, not the model). */
function forModel(r: ToolResult, extra?: Record<string, unknown>): string {
  return JSON.stringify({
    title: r.title,
    kpis: r.kpis,
    rows: r.rows?.slice(0, 40),
    row_count: r.meta.row_count,
    no_data: r.meta.no_data ?? false,
    ...extra,
  });
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Simple fuzzy score: token containment both ways (rosters are small). */
function nameScore(query: string, candidate: string): number {
  const q = normalize(query);
  const c = normalize(candidate);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.includes(q) || q.includes(c)) return 0.9;
  const qTokens = q.split(' ');
  const cTokens = c.split(' ');
  let hits = 0;
  for (const t of qTokens) {
    if (cTokens.some((ct) => ct.startsWith(t) || t.startsWith(ct))) hits++;
  }
  return hits / Math.max(qTokens.length, 1) * 0.8;
}

// ─── tool factory ────────────────────────────────────────────────────────────

export function buildAssistantTools(ctx: ToolContext) {
  const resolvePerson = betaTool({
    name: 'resolve_person',
    description:
      'Fuzzy-match a (possibly misspelled) person name against supervisors and ladies batches. Call this BEFORE any person-specific tool. Returns ranked candidates with ids; if confidence is low or the name matches both a supervisor and a batch, ask the user which one they mean.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'The person or batch name as the user said it' },
      },
      required: ['name'],
      additionalProperties: false,
    } as const,
    run: async ({ name }) => {
      ctx.toolsUsed.push('resolve_person');
      const [sup, batches] = await Promise.all([
        ctx.supabase.from('supervisors').select('id, name, is_active').eq('is_active', true),
        ctx.isAdmin
          ? ctx.supabase.from('local_ladies_batches').select('id, name, is_active').eq('is_active', true)
          : Promise.resolve({ data: [], error: null } as const),
      ]);
      if (sup.error) throw sup.error;
      type Cand = { id: string; name: string; type: 'supervisor' | 'ladies_batch'; score: number };
      const cands: Cand[] = [
        ...(sup.data || []).map((s) => ({ id: s.id, name: s.name, type: 'supervisor' as const, score: nameScore(name, s.name) })),
        ...((batches.data as { id: string; name: string }[] | null) || []).map((b) => ({
          id: b.id, name: b.name, type: 'ladies_batch' as const, score: nameScore(name, b.name),
        })),
      ]
        .filter((c) => c.score >= 0.4)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      if (cands.length > 0) ctx.resolved.person = cands[0].name;
      return JSON.stringify({ query: name, candidates: cands });
    },
  });

  const getSupervisorAttendance = betaTool({
    name: 'get_supervisor_attendance',
    description:
      'Supervisor attendance for one date: who was present (with locations), total present, and who was absent. Optionally filter to a single supervisor_id (from resolve_person) to answer "is X present".',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'yyyy-MM-dd' },
        supervisor_id: { type: 'string', description: 'Optional: check one supervisor only' },
      },
      required: ['date'],
      additionalProperties: false,
    } as const,
    run: async ({ date, supervisor_id }) => {
      ctx.toolsUsed.push('get_supervisor_attendance');
      const err = checkDate(ctx, date);
      if (err) return err;
      ctx.resolved.date = date;

      let q = ctx.supabase
        .from('daily_supervisor_assignments')
        .select('is_present, location:locations(name), supervisor:supervisors(id, name)')
        .eq('work_date', date)
        .gt('is_present', 0);
      if (supervisor_id) q = q.eq('supervisor_id', supervisor_id);
      const { data, error } = await q;
      if (error) throw error;

      const { data: active, error: aErr } = await ctx.supabase
        .from('supervisors')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (aErr) throw aErr;

      type Row = { is_present: number; location: { name: string } | null; supervisor: { id: string; name: string } | null };
      const rows = (data as unknown as Row[]) || [];
      const presentIds = new Set(rows.map((r) => r.supervisor?.id).filter(Boolean));
      const absent = (active || []).filter((s) => !presentIds.has(s.id)).map((s) => s.name);
      const totalPresent = rows.reduce((sum, r) => sum + (Number(r.is_present) || 0), 0);
      const locations = new Set(rows.map((r) => r.location?.name).filter(Boolean));

      const result: ToolResult = {
        kind: 'table',
        title: supervisor_id ? 'Supervisor attendance' : 'Supervisors present by location',
        subtitle: supervisor_id
          ? `Attendance record for the selected supervisor on ${periodLabel(date)}.`
          : `Every supervisor marked present on ${periodLabel(date)} and the location they worked at — ${totalPresent} present, ${absent.length} absent.`,
        kpis: [
          { label: 'Present', value: totalPresent, tone: 'success' },
          { label: 'Locations', value: locations.size },
          { label: 'Absent', value: absent.length, tone: absent.length ? 'danger' : 'default' },
        ],
        columns: [
          { key: 'supervisor', label: 'Supervisor' },
          { key: 'location', label: 'Location' },
        ],
        rows: rows.map((r) => ({ supervisor: r.supervisor?.name ?? '—', location: r.location?.name ?? '—' })),
        meta: {
          date_resolved: date,
          period_label: periodLabel(date),
          source_tables: ['daily_supervisor_assignments', 'supervisors'],
          row_count: rows.length,
          no_data: rows.length === 0,
        },
      };
      ctx.collected.push(result);
      return forModel(result, { absent_supervisors: absent, date });
    },
  });

  const getSupervisorDetails = betaTool({
    name: 'get_supervisor_details',
    description:
      'ADMIN ONLY. Salary, joining date and phone for one supervisor (use resolve_person first to get supervisor_id).',
    inputSchema: {
      type: 'object',
      properties: {
        supervisor_id: { type: 'string' },
      },
      required: ['supervisor_id'],
      additionalProperties: false,
    } as const,
    run: async ({ supervisor_id }) => {
      ctx.toolsUsed.push('get_supervisor_details');
      const gate = adminOnly(ctx);
      if (gate) return gate;
      const { data, error } = await ctx.supabase
        .from('supervisors')
        .select('name, phone, joining_date, salary, is_active')
        .eq('id', supervisor_id)
        .single();
      if (error) throw error;
      ctx.resolved.person = data.name;

      const result: ToolResult = {
        kind: 'card',
        title: data.name,
        fields: [
          { label: 'Salary', value: data.salary != null ? `₹${Number(data.salary).toLocaleString('en-IN')}` : 'Not recorded' },
          { label: 'Joining date', value: data.joining_date ?? 'Not recorded' },
          { label: 'Phone', value: data.phone ?? 'Not recorded' },
          { label: 'Status', value: data.is_active ? 'Active' : 'Inactive' },
        ],
        meta: { person_resolved: data.name, source_tables: ['supervisors'], row_count: 1 },
      };
      ctx.collected.push(result);
      return JSON.stringify({ name: data.name, salary: data.salary, joining_date: data.joining_date, phone: data.phone });
    },
  });

  const getAbsentDays = betaTool({
    name: 'get_absent_days',
    description:
      'How many days a supervisor was absent in a month. A day counts as absent only if attendance was recorded for other supervisors that day but not this one (days with no data at all are excluded).',
    inputSchema: {
      type: 'object',
      properties: {
        supervisor_id: { type: 'string' },
        month: { type: 'string', description: 'yyyy-MM' },
      },
      required: ['supervisor_id', 'month'],
      additionalProperties: false,
    } as const,
    run: async ({ supervisor_id, month }) => {
      ctx.toolsUsed.push('get_absent_days');
      if (!/^\d{4}-\d{2}$/.test(month)) return `Invalid month "${month}" — use yyyy-MM.`;
      if (!ctx.isAdmin && month !== ctx.today.slice(0, 7)) {
        return `STAFF_RESTRICTED: staff accounts can only view today's data (${ctx.today}).`;
      }
      const from = `${month}-01`;
      const to = ctx.isAdmin ? `${month}-31` : ctx.today;

      const [all, mine, sup] = await Promise.all([
        ctx.supabase
          .from('daily_supervisor_assignments')
          .select('work_date')
          .gte('work_date', from)
          .lte('work_date', to),
        ctx.supabase
          .from('daily_supervisor_assignments')
          .select('work_date, is_present')
          .eq('supervisor_id', supervisor_id)
          .gte('work_date', from)
          .lte('work_date', to),
        ctx.supabase.from('supervisors').select('name').eq('id', supervisor_id).single(),
      ]);
      if (all.error) throw all.error;
      if (mine.error) throw mine.error;
      if (sup.error) throw sup.error;

      const recordedDays = [...new Set((all.data || []).map((r) => r.work_date))].sort();
      const presentDays = new Set(
        (mine.data || []).filter((r) => Number(r.is_present) > 0).map((r) => r.work_date)
      );
      const absentDays = recordedDays.filter((d) => !presentDays.has(d));
      ctx.resolved.person = sup.data.name;

      const result: ToolResult = {
        kind: 'table',
        title: `${sup.data.name} — absent days in ${toMonthLabel(month)}`,
        subtitle: `A day counts as absent only when attendance was recorded for other supervisors that day but not for ${sup.data.name}. Days with no attendance entered at all are excluded.`,
        kpis: [
          { label: 'Absent days', value: absentDays.length, tone: absentDays.length ? 'danger' : 'success' },
          { label: 'Present days', value: presentDays.size, tone: 'success' },
          { label: 'Recorded days', value: recordedDays.length },
        ],
        columns: [{ key: 'date', label: 'Absent on', format: 'date', total: 'none' }],
        rows: absentDays.map((d) => ({ date: d })),
        meta: {
          person_resolved: sup.data.name,
          period_label: toMonthLabel(month),
          source_tables: ['daily_supervisor_assignments'],
          row_count: absentDays.length,
          no_data: recordedDays.length === 0,
        },
      };
      ctx.collected.push(result);
      return forModel(result, { month, absent_days: absentDays, present_count: presentDays.size });
    },
  });

  const compareLabourSources = betaTool({
    name: 'compare_labour_sources',
    description:
      'Labour breakdown per location for one date: company vs outside (non-local) labour plus kg-basic, daily-wage and total headcount. Use for "which location has more outside labour than company labour".',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'yyyy-MM-dd' },
      },
      required: ['date'],
      additionalProperties: false,
    } as const,
    run: async ({ date }) => {
      ctx.toolsUsed.push('compare_labour_sources');
      const err = checkDate(ctx, date);
      if (err) return err;
      ctx.resolved.date = date;

      const { data, error } = await ctx.supabase
        .from('daily_workforce')
        .select('labour_company, labour_non_locals, labour_kg_basic, labour_daily_wage, labour_count, total_headcount, location:locations(name)')
        .eq('work_date', date);
      if (error) throw error;

      type Row = {
        labour_company: number; labour_non_locals: number; labour_kg_basic: number;
        labour_daily_wage: number; labour_count: number; total_headcount: number;
        location: { name: string } | null;
      };
      const rows = ((data as unknown as Row[]) || []).map((r) => ({
        location: r.location?.name ?? '—',
        company: r.labour_company || 0,
        non_local: r.labour_non_locals || 0,
        kg_basic: r.labour_kg_basic || 0,
        daily_wage: r.labour_daily_wage || 0,
        total_labour: r.labour_count || 0,
      }));
      const totalCompany = rows.reduce((s, r) => s + r.company, 0);
      const totalNonLocal = rows.reduce((s, r) => s + r.non_local, 0);
      const moreOutside = rows.filter((r) => r.non_local > r.company).map((r) => r.location);

      const result: ToolResult = {
        kind: 'chart',
        title: 'Company vs outside labour by location',
        subtitle: `Labour headcount at each location on ${periodLabel(date)}. Company = our own workers; Outside = hired non-local labour. KG basic and daily wage are the two pay bases that make up the total.`,
        kpis: [
          { label: 'Company', value: totalCompany, tone: 'accent' },
          { label: 'Outside (non-local)', value: totalNonLocal, tone: 'default' },
        ],
        columns: [
          { key: 'location', label: 'Location' },
          { key: 'company', label: 'Company', format: 'number', tone: 'company' },
          { key: 'non_local', label: 'Outside', format: 'number', tone: 'outside' },
          { key: 'kg_basic', label: 'KG basic', format: 'number', tone: 'kgBasic' },
          { key: 'daily_wage', label: 'Daily wage', format: 'number', tone: 'dailyWage' },
          { key: 'total_labour', label: 'Total labour', format: 'number', tone: 'total' },
        ],
        rows,
        chart: {
          type: 'bar',
          xKey: 'location',
          series: [
            { key: 'company', label: 'Company' },
            { key: 'non_local', label: 'Outside' },
          ],
        },
        meta: {
          date_resolved: date,
          period_label: periodLabel(date),
          source_tables: ['daily_workforce'],
          row_count: rows.length,
          no_data: rows.length === 0,
        },
      };
      ctx.collected.push(result);
      return forModel(result, { locations_with_more_outside_than_company: moreOutside, date });
    },
  });

  const getGradeVsVa = betaTool({
    name: 'get_grade_vs_va',
    description:
      'Grade-wise HL and Value-Addition (VA) quantities from HL→VA entries for a date or range, grouped by prawn grade. Use for "grade vs VA table".',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'yyyy-MM-dd' },
        to: { type: 'string', description: 'yyyy-MM-dd; omit for a single day' },
      },
      required: ['from'],
      additionalProperties: false,
    } as const,
    run: async ({ from, to }) => {
      ctx.toolsUsed.push('get_grade_vs_va');
      const end = to || from;
      const err = checkDate(ctx, from) || checkDate(ctx, end);
      if (err) return err;
      ctx.resolved.date = from === end ? from : `${from} → ${end}`;

      const { data, error } = await ctx.supabase
        .from('hl_va_entries')
        .select('grade, variety, hl_kgs, va_kgs')
        .gte('work_date', from)
        .lte('work_date', end);
      if (error) throw error;

      const byGrade = new Map<string, { hl: number; va: number; entries: number; varieties: Set<string> }>();
      for (const r of data || []) {
        const g = r.grade || 'Ungraded';
        const cur = byGrade.get(g) || { hl: 0, va: 0, entries: 0, varieties: new Set<string>() };
        cur.hl += Number(r.hl_kgs) || 0;
        cur.va += Number(r.va_kgs) || 0;
        cur.entries += 1;
        if (r.variety) cur.varieties.add(r.variety);
        byGrade.set(g, cur);
      }
      const rows = [...byGrade.entries()]
        .sort((a, b) => b[1].va - a[1].va)
        .map(([grade, v]) => ({
          grade,
          hl_kgs: kg(v.hl),
          va_kgs: kg(v.va),
          yield_pct: v.hl > 0 ? Math.round((v.va / v.hl) * 1000) / 10 : null,
          varieties: [...v.varieties].join(', '),
        }));
      const totalHl = kg(rows.reduce((s, r) => s + (r.hl_kgs || 0), 0));
      const totalVa = kg(rows.reduce((s, r) => s + (r.va_kgs || 0), 0));

      const result: ToolResult = {
        kind: 'table',
        title: 'Value addition by prawn grade',
        subtitle: `HL input and VA output per grade from HL to VA entries over ${periodLabel(from, end)} (${daysPhrase(from, end)}). VA/HL % is the value-addition yield for that grade; the footer averages it across grades that reported.`,
        kpis: [
          { label: 'Total HL', value: totalHl, unit: 'kg' },
          { label: 'Total VA', value: totalVa, unit: 'kg', tone: 'accent' },
          { label: 'Grades', value: rows.length },
        ],
        columns: [
          { key: 'grade', label: 'Grade' },
          { key: 'hl_kgs', label: 'HL', format: 'kg', tone: 'hl' },
          { key: 'va_kgs', label: 'VA', format: 'kg', tone: 'va' },
          { key: 'yield_pct', label: 'VA/HL %', format: 'percent', total: 'avg' },
          { key: 'varieties', label: 'Varieties' },
        ],
        rows,
        meta: {
          date_resolved: ctx.resolved.date,
          period_label: periodLabel(from, end),
          source_tables: ['hl_va_entries'],
          row_count: rows.length,
          no_data: rows.length === 0,
          unit: 'kg',
        },
      };
      ctx.collected.push(result);
      return forModel(result, { from, to: end });
    },
  });

  const getProcessingSummary = betaTool({
    name: 'get_processing_summary',
    description:
      'Production summary per location for a date range from daily processing: HON→HL (de-heading) and HL→VA (value addition) completed kg plus work-in-process kg. Use for "HON to HL summary" / "HL to VA summary". Pass `location` whenever the question names one place ("HL to VA at SME yesterday") so the panel shows that location alone; omit it to compare every location.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'yyyy-MM-dd' },
        to: { type: 'string', description: 'yyyy-MM-dd; omit for a single day' },
        location: { type: 'string', description: 'Optional: one location name, e.g. SME' },
      },
      required: ['from'],
      additionalProperties: false,
    } as const,
    run: async ({ from, to, location }) => {
      ctx.toolsUsed.push('get_processing_summary');
      const end = to || from;
      const err = checkDate(ctx, from) || checkDate(ctx, end);
      if (err) return err;
      ctx.resolved.date = from === end ? from : `${from} → ${end}`;

      const { data, error } = await ctx.supabase
        .from('daily_processing')
        .select('hon_to_headless, headless_to_va, wip_hon_to_headless, wip_headless_to_va, processed_kg, location:locations(name)')
        .gte('work_date', from)
        .lte('work_date', end);
      if (error) throw error;

      type Row = {
        hon_to_headless: number; headless_to_va: number;
        wip_hon_to_headless: number; wip_headless_to_va: number;
        processed_kg: number; location: { name: string } | null;
      };
      const atLocation = locationMatcher(location);
      const byLoc = new Map<string, { honHl: number; hlVa: number; wipHonHl: number; wipHlVa: number }>();
      for (const r of ((data as unknown as Row[]) || []).filter((r) => atLocation(r.location?.name))) {
        const loc = r.location?.name ?? '—';
        const cur = byLoc.get(loc) || { honHl: 0, hlVa: 0, wipHonHl: 0, wipHlVa: 0 };
        cur.honHl += Number(r.hon_to_headless) || 0;
        cur.hlVa += Number(r.headless_to_va) || 0;
        cur.wipHonHl += Number(r.wip_hon_to_headless) || 0;
        cur.wipHlVa += Number(r.wip_headless_to_va) || 0;
        byLoc.set(loc, cur);
      }
      const rows = [...byLoc.entries()].map(([name, v]) => ({
        location: name,
        hon_to_hl: kg(v.honHl),
        hl_to_va: kg(v.hlVa),
        wip_hon_to_hl: kg(v.wipHonHl),
        wip_hl_to_va: kg(v.wipHlVa),
      }));
      const tHonHl = kg(rows.reduce((s, r) => s + r.hon_to_hl, 0));
      const tHlVa = kg(rows.reduce((s, r) => s + r.hl_to_va, 0));

      const result: ToolResult = {
        kind: 'table',
        title: `Processing output${location ? ` — ${location}` : ' by location'}`,
        subtitle: `Completed kg ${location ? `at ${location}` : 'per location'} over ${periodLabel(from, end)} (${daysPhrase(from, end)}). HON to HL is de-heading, HL to VA is value addition; the WIP columns are material still in process, not yet finished.`,
        kpis: [
          { label: 'HON → HL', value: tHonHl, unit: 'kg', tone: 'accent' },
          { label: 'HL → VA', value: tHlVa, unit: 'kg', tone: 'accent' },
        ],
        columns: [
          { key: 'location', label: 'Location' },
          { key: 'hon_to_hl', label: 'HON→HL', format: 'kg', tone: 'hon' },
          { key: 'hl_to_va', label: 'HL→VA', format: 'kg', tone: 'va' },
          { key: 'wip_hon_to_hl', label: 'WIP HON→HL', format: 'kg', tone: 'wip' },
          { key: 'wip_hl_to_va', label: 'WIP HL→VA', format: 'kg', tone: 'wip' },
        ],
        rows,
        meta: {
          date_resolved: ctx.resolved.date,
          period_label: periodLabel(from, end),
          source_tables: ['daily_processing'],
          row_count: rows.length,
          no_data: rows.length === 0,
          unit: 'kg',
        },
      };
      ctx.collected.push(result);
      return forModel(result, { from, to: end, location: location ?? 'all' });
    },
  });

  const getLadiesAttendance = betaTool({
    name: 'get_ladies_attendance',
    description:
      'ADMIN ONLY. Ladies batch attendance (headcount per batch per day) for a date range, optionally one batch (batch_id from resolve_person).',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'yyyy-MM-dd' },
        to: { type: 'string', description: 'yyyy-MM-dd; omit for a single day' },
        batch_id: { type: 'string', description: 'Optional ladies batch id' },
      },
      required: ['from'],
      additionalProperties: false,
    } as const,
    run: async ({ from, to, batch_id }) => {
      ctx.toolsUsed.push('get_ladies_attendance');
      const gate = adminOnly(ctx);
      if (gate) return gate;
      const end = to || from;
      if (!DATE_RE.test(from) || !DATE_RE.test(end)) return 'Invalid date — use yyyy-MM-dd.';
      ctx.resolved.date = from === end ? from : `${from} → ${end}`;

      let q = ctx.supabase
        .from('local_ladies_attendance')
        .select('work_date, ladies_count, batch:local_ladies_batches(name), location:locations(name)')
        .gte('work_date', from)
        .lte('work_date', end)
        .order('work_date');
      if (batch_id) q = q.eq('batch_id', batch_id);
      const { data, error } = await q;
      if (error) throw error;

      type Row = { work_date: string; ladies_count: number; batch: { name: string } | null; location: { name: string } | null };
      const raw = (data as unknown as Row[]) || [];
      const dates = [...new Set(raw.map((r) => r.work_date))].sort();
      const byBatch = new Map<string, Record<string, string | number | null>>();
      for (const r of raw) {
        const b = r.batch?.name ?? '—';
        const row = byBatch.get(b) || { batch: b };
        row[r.work_date] = (Number(row[r.work_date]) || 0) + (r.ladies_count || 0);
        byBatch.set(b, row);
      }
      const rows = [...byBatch.values()].map((row) => ({
        ...row,
        total: dates.reduce((s, d) => s + (Number(row[d]) || 0), 0),
      }));
      const grandTotal = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);

      const result: ToolResult = {
        kind: 'table',
        title: 'Ladies attendance by batch',
        subtitle: `Headcount per batch for each day in ${periodLabel(from, end)} (${daysPhrase(from, end)}). Each dated column is one working day; Total is that batch's lady-days over the whole period.`,
        kpis: [
          { label: 'Total lady-days', value: grandTotal, tone: 'accent' },
          { label: 'Batches', value: rows.length },
          { label: 'Days', value: dates.length },
        ],
        columns: [
          { key: 'batch', label: 'Batch' },
          // One column per working day — per-cell shares would be noise at this width.
          ...dates.map((d) => ({ key: d, label: toDdMm(d), format: 'number' as const, share: false })),
          { key: 'total', label: 'Total', format: 'number' as const, tone: 'total' as const },
        ],
        rows,
        meta: {
          date_resolved: ctx.resolved.date,
          period_label: periodLabel(from, end),
          source_tables: ['local_ladies_attendance'],
          row_count: rows.length,
          no_data: raw.length === 0,
        },
      };
      ctx.collected.push(result);
      return forModel(result, { from, to: end, dates });
    },
  });

  // ─── batch (harvest lot) tools ─────────────────────────────────────────────
  // A batch is a lot of prawn carrying an id like 26H24/2A. It moves through
  // two registers: yield_entries holds its HON→HL de-heading, hl_va_entries its
  // HL→VA value addition — and the two can happen on different dates at
  // different locations, so neither table alone is the whole story.

  const getBatches = betaTool({
    name: 'get_batches',
    description:
      'Which prawn/harvest batches were processed on a date or range, optionally at one location. Returns one row per batch per stage (HON→HL de-heading from yield_entries, HL→VA value addition from hl_va_entries) with count, kg in, kg out, yield and grader. Use for "which batches were processed yesterday", "what batches ran at SME today", "batches handled this week". This is prawn batches — NOT ladies batches.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'yyyy-MM-dd' },
        to: { type: 'string', description: 'yyyy-MM-dd; omit for a single day' },
        location: { type: 'string', description: 'Optional: one location name, e.g. SME' },
      },
      required: ['from'],
      additionalProperties: false,
    } as const,
    run: async ({ from, to, location }) => {
      ctx.toolsUsed.push('get_batches');
      const end = to || from;
      const err = checkRange(ctx, from, end);
      if (err) return err;
      ctx.resolved.date = periodLabel(from, end);

      const [honHl, hlVa] = await Promise.all([
        ctx.supabase
          .from('yield_entries')
          .select('work_date, batch_id, count_text, hon_kgs, hl_kgs, grader_name, location:locations(name)')
          .gte('work_date', from)
          .lte('work_date', end)
          .order('work_date'),
        ctx.supabase
          .from('hl_va_entries')
          .select('work_date, batch_id, count_text, grade, variety, hl_kgs, va_kgs, grader_name, location:locations(name)')
          .gte('work_date', from)
          .lte('work_date', end)
          .order('work_date'),
      ]);
      if (honHl.error) throw honHl.error;
      if (hlVa.error) throw hlVa.error;

      const atLocation = locationMatcher(location);

      type HonRow = {
        work_date: string; batch_id: string; count_text: string; hon_kgs: number;
        hl_kgs: number; grader_name: string; location: { name: string } | null;
      };
      type VaRow = {
        work_date: string; batch_id: string; count_text: string; grade: string; variety: string;
        hl_kgs: number; va_kgs: number; grader_name: string; location: { name: string } | null;
      };

      const rows: Record<string, string | number | null>[] = [];

      for (const r of ((honHl.data as unknown as HonRow[]) || []).filter((r) => atLocation(r.location?.name))) {
        const inKg = kg(Number(r.hon_kgs) || 0);
        const outKg = kg(Number(r.hl_kgs) || 0);
        rows.push({
          batch: r.batch_id,
          stage: 'HON→HL',
          date: r.work_date,
          count: r.count_text || '—',
          detail: r.grader_name || '—',
          location: r.location?.name ?? '—',
          in_kgs: inKg,
          out_kgs: outKg,
          yield_pct: inKg > 0 ? Math.round((outKg / inKg) * 1000) / 10 : null,
        });
      }
      for (const r of ((hlVa.data as unknown as VaRow[]) || []).filter((r) => atLocation(r.location?.name))) {
        const inKg = kg(Number(r.hl_kgs) || 0);
        const outKg = kg(Number(r.va_kgs) || 0);
        rows.push({
          batch: r.batch_id,
          stage: 'HL→VA',
          date: r.work_date,
          count: r.count_text || '—',
          detail: [r.variety, r.grade].filter(Boolean).join(' ') || '—',
          location: r.location?.name ?? '—',
          in_kgs: inKg,
          out_kgs: outKg,
          yield_pct: inKg > 0 ? Math.round((outKg / inKg) * 1000) / 10 : null,
        });
      }
      rows.sort((a, b) =>
        String(a.date).localeCompare(String(b.date)) || String(a.batch).localeCompare(String(b.batch))
      );

      const distinct = [...new Set(rows.map((r) => String(r.batch)))];
      const deheaded = [...new Set(rows.filter((r) => r.stage === 'HON→HL').map((r) => String(r.batch)))];
      const valueAdded = [...new Set(rows.filter((r) => r.stage === 'HL→VA').map((r) => String(r.batch)))];
      const scope = location ? ` at ${location}` : '';

      const result: ToolResult = {
        kind: 'table',
        title: `Batches processed${location ? ` — ${location}` : ''}`,
        subtitle: `Every prawn batch with a register entry${scope} over ${periodLabel(from, end)} (${daysPhrase(from, end)}). One row per batch per stage: HON→HL is de-heading (input is head-on weight), HL→VA is value addition (input is headless weight). A batch can be de-headed at one location and value-added at another, so the same batch may appear twice with different locations.`,
        kpis: [
          { label: 'Batches', value: distinct.length, tone: 'accent' },
          { label: 'De-headed', value: deheaded.length },
          { label: 'Value-added', value: valueAdded.length },
        ],
        columns: [
          { key: 'batch', label: 'Batch' },
          { key: 'stage', label: 'Stage' },
          { key: 'date', label: 'Date', format: 'date', total: 'none' },
          { key: 'count', label: 'Count' },
          { key: 'location', label: 'Location' },
          { key: 'detail', label: 'Grader / product' },
          { key: 'in_kgs', label: 'Input', format: 'kg', tone: 'hon' },
          { key: 'out_kgs', label: 'Output', format: 'kg', tone: 'va' },
          { key: 'yield_pct', label: 'Yield %', format: 'percent', total: 'avg' },
        ],
        rows,
        meta: {
          date_resolved: from === end ? from : `${from} → ${end}`,
          period_label: periodLabel(from, end),
          source_tables: ['yield_entries', 'hl_va_entries'],
          row_count: rows.length,
          no_data: rows.length === 0,
          unit: 'kg',
        },
      };
      ctx.collected.push(result);
      return forModel(result, {
        from, to: end, location: location ?? 'all',
        batch_ids: distinct.slice(0, 40),
        batch_count: distinct.length,
        deheaded_batches: deheaded.slice(0, 40),
        value_added_batches: valueAdded.slice(0, 40),
      });
    },
  });

  const getBatchPipeline = betaTool({
    name: 'get_batch_pipeline',
    description:
      'Follow ONE prawn batch across every date and location: its HON→HL de-heading entries and its HL→VA value-addition entries. Matches the batch id loosely, so a partial id like "26H24" finds 26H24/2A. Use for "track batch 26F04/3", "where did batch X go", "show me batch X history".',
    inputSchema: {
      type: 'object',
      properties: {
        batch_id: { type: 'string', description: 'Batch id or part of one, e.g. 26F04/3' },
      },
      required: ['batch_id'],
      additionalProperties: false,
    } as const,
    run: async ({ batch_id }) => {
      ctx.toolsUsed.push('get_batch_pipeline');
      if (!ctx.isAdmin) {
        return `STAFF_RESTRICTED: a batch spans multiple dates; staff accounts can only view today's data (${ctx.today}).`;
      }
      const needle = batch_id.trim();
      if (!needle) return 'Give a batch id to look up.';

      const [honHl, hlVa] = await Promise.all([
        ctx.supabase
          .from('yield_entries')
          .select('work_date, batch_id, count_text, hon_kgs, hl_kgs, grader_name, location:locations(name)')
          .ilike('batch_id', `%${needle}%`)
          .order('work_date'),
        ctx.supabase
          .from('hl_va_entries')
          .select('work_date, batch_id, count_text, grade, variety, hl_kgs, va_kgs, location:locations(name)')
          .ilike('batch_id', `%${needle}%`)
          .order('work_date'),
      ]);
      if (honHl.error) throw honHl.error;
      if (hlVa.error) throw hlVa.error;

      type HonRow = {
        work_date: string; batch_id: string; count_text: string; hon_kgs: number;
        hl_kgs: number; grader_name: string; location: { name: string } | null;
      };
      type VaRow = {
        work_date: string; batch_id: string; count_text: string; grade: string; variety: string;
        hl_kgs: number; va_kgs: number; location: { name: string } | null;
      };

      const rows: Record<string, string | number | null>[] = [];
      for (const r of (honHl.data as unknown as HonRow[]) || []) {
        const inKg = kg(Number(r.hon_kgs) || 0);
        const outKg = kg(Number(r.hl_kgs) || 0);
        rows.push({
          batch: r.batch_id, stage: 'HON→HL', date: r.work_date, count: r.count_text || '—',
          location: r.location?.name ?? '—', detail: r.grader_name || '—',
          in_kgs: inKg, out_kgs: outKg,
          yield_pct: inKg > 0 ? Math.round((outKg / inKg) * 1000) / 10 : null,
        });
      }
      for (const r of (hlVa.data as unknown as VaRow[]) || []) {
        const inKg = kg(Number(r.hl_kgs) || 0);
        const outKg = kg(Number(r.va_kgs) || 0);
        rows.push({
          batch: r.batch_id, stage: 'HL→VA', date: r.work_date, count: r.count_text || '—',
          location: r.location?.name ?? '—',
          detail: [r.variety, r.grade].filter(Boolean).join(' ') || '—',
          in_kgs: inKg, out_kgs: outKg,
          yield_pct: inKg > 0 ? Math.round((outKg / inKg) * 1000) / 10 : null,
        });
      }
      rows.sort((a, b) =>
        String(a.date).localeCompare(String(b.date)) || String(a.stage).localeCompare(String(b.stage))
      );

      const matched = [...new Set(rows.map((r) => String(r.batch)))];
      const totalHon = kg(rows.filter((r) => r.stage === 'HON→HL').reduce((sum, r) => sum + Number(r.in_kgs || 0), 0));
      const totalVa = kg(rows.filter((r) => r.stage === 'HL→VA').reduce((sum, r) => sum + Number(r.out_kgs || 0), 0));
      const dates = [...new Set(rows.map((r) => String(r.date)))].sort();
      const locations = [...new Set(rows.map((r) => String(r.location)))];
      if (dates.length) ctx.resolved.date = dates.length === 1 ? dates[0] : `${dates[0]} → ${dates[dates.length - 1]}`;

      const result: ToolResult = {
        kind: 'table',
        title: `Batch pipeline — ${matched.join(', ') || needle}`,
        subtitle: matched.length
          ? `Every register entry for ${matched.length === 1 ? 'this batch' : `${matched.length} matching batches`}, across ${dates.length === 1 ? '1 date' : `${dates.length} dates`} and ${locations.length === 1 ? locations[0] : `${locations.length} locations`}. HON→HL is de-heading, HL→VA is value addition — a batch is often de-headed at one location and value-added at another days later.`
          : `No register entry matches a batch id containing "${needle}".`,
        kpis: [
          { label: 'HON received', value: totalHon, unit: 'kg', tone: 'accent' },
          { label: 'VA produced', value: totalVa, unit: 'kg', tone: 'accent' },
          { label: 'Entries', value: rows.length },
        ],
        columns: [
          { key: 'batch', label: 'Batch' },
          { key: 'stage', label: 'Stage' },
          { key: 'date', label: 'Date', format: 'date', total: 'none' },
          { key: 'count', label: 'Count' },
          { key: 'location', label: 'Location' },
          { key: 'detail', label: 'Grader / product' },
          { key: 'in_kgs', label: 'Input', format: 'kg', tone: 'hon', share: false },
          { key: 'out_kgs', label: 'Output', format: 'kg', tone: 'va', share: false },
          { key: 'yield_pct', label: 'Yield %', format: 'percent', total: 'avg' },
        ],
        rows,
        meta: {
          date_resolved: ctx.resolved.date,
          period_label: dates.length ? periodLabel(dates[0], dates[dates.length - 1]) : undefined,
          source_tables: ['yield_entries', 'hl_va_entries'],
          row_count: rows.length,
          no_data: rows.length === 0,
          unit: 'kg',
        },
      };
      ctx.collected.push(result);
      return forModel(result, {
        query: needle, matched_batches: matched, dates, locations,
        total_hon_kgs: totalHon, total_va_kgs: totalVa,
      });
    },
  });

  // ─── daily trend tools ─────────────────────────────────────────────────────
  // One row per calendar day so the canvas can draw a line chart. A day with no
  // register entry comes back as null — a gap in the line, never a zero, because
  // "nobody entered it" and "nobody turned up" are different facts.

  const getLabourTrend = betaTool({
    name: 'get_labour_trend',
    description:
      'Day-by-day labour headcount across a date range (max 92 days): company, outside (non-local), kg-basic, daily-wage and total for each day, optionally for one location. Use this for "labour this month", "workforce trend", "labour line chart", or any labour question spanning more than one day — compare_labour_sources covers a single day only.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'yyyy-MM-dd' },
        to: { type: 'string', description: 'yyyy-MM-dd' },
        location: { type: 'string', description: 'Optional: one location name to filter to' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    } as const,
    run: async ({ from, to, location }) => {
      ctx.toolsUsed.push('get_labour_trend');
      const err = checkRange(ctx, from, to);
      if (err) return err;
      ctx.resolved.date = periodLabel(from, to);

      const { data, error } = await ctx.supabase
        .from('daily_workforce')
        .select(
          'work_date, labour_company, labour_non_locals, labour_kg_basic, labour_daily_wage, labour_count, location:locations(name)'
        )
        .gte('work_date', from)
        .lte('work_date', to)
        .order('work_date');
      if (error) throw error;

      type Row = {
        work_date: string; labour_company: number; labour_non_locals: number;
        labour_kg_basic: number; labour_daily_wage: number; labour_count: number;
        location: { name: string } | null;
      };
      const atLocation = locationMatcher(location);
      const raw = ((data as unknown as Row[]) || []).filter((r) => atLocation(r.location?.name));

      const byDate = new Map<string, { company: number; non_local: number; kg_basic: number; daily_wage: number; total: number }>();
      for (const r of raw) {
        const cur = byDate.get(r.work_date) || { company: 0, non_local: 0, kg_basic: 0, daily_wage: 0, total: 0 };
        cur.company += Number(r.labour_company) || 0;
        cur.non_local += Number(r.labour_non_locals) || 0;
        cur.kg_basic += Number(r.labour_kg_basic) || 0;
        cur.daily_wage += Number(r.labour_daily_wage) || 0;
        cur.total += Number(r.labour_count) || 0;
        byDate.set(r.work_date, cur);
      }

      const rows: Record<string, string | number | null>[] = eachDay(from, to).map((d) => {
        const v = byDate.get(d);
        return v
          ? { date: d, company: v.company, non_local: v.non_local, kg_basic: v.kg_basic, daily_wage: v.daily_wage, total: v.total }
          : { date: d, company: null, non_local: null, kg_basic: null, daily_wage: null, total: null };
      });

      const span = dayCount(from, to);
      const recorded = byDate.size;
      const labourDays = [...byDate.values()].reduce((sum, v) => sum + v.total, 0);
      const avgDaily = recorded ? Math.round(labourDays / recorded) : 0;
      const missing = eachDay(from, to).filter((d) => !byDate.has(d));

      const scope = location ? ` at ${location}` : ' across all locations';
      const result: ToolResult = {
        kind: 'chart',
        title: `Daily labour headcount${location ? ` — ${location}` : ''}`,
        subtitle: `Labour on site each day${scope} over ${periodLabel(from, to)} (${daysPhrase(from, to)}). Data was entered on ${recorded} of ${span} days; days with no entry are shown as gaps, not zeros. The footer shows the average working day, not a sum of headcounts.`,
        kpis: [
          { label: 'Avg per day', value: avgDaily, tone: 'accent' },
          { label: 'Total labour-days', value: labourDays },
          { label: 'Days recorded', value: `${recorded}/${span}`, tone: recorded < span ? 'danger' : 'success' },
        ],
        columns: [
          { key: 'date', label: 'Date', format: 'date', total: 'none' },
          { key: 'company', label: 'Company', format: 'number', tone: 'company', total: 'avg', share: false },
          { key: 'non_local', label: 'Outside', format: 'number', tone: 'outside', total: 'avg', share: false },
          { key: 'kg_basic', label: 'KG basic', format: 'number', tone: 'kgBasic', total: 'avg', share: false },
          { key: 'daily_wage', label: 'Daily wage', format: 'number', tone: 'dailyWage', total: 'avg', share: false },
          { key: 'total', label: 'Total labour', format: 'number', tone: 'total', total: 'avg', share: false },
        ],
        rows,
        chart: {
          type: 'line',
          xKey: 'date',
          series: [
            { key: 'company', label: 'Company' },
            { key: 'non_local', label: 'Outside' },
            { key: 'total', label: 'Total' },
          ],
        },
        meta: {
          date_resolved: `${from} → ${to}`,
          period_label: periodLabel(from, to),
          source_tables: ['daily_workforce'],
          row_count: rows.length,
          no_data: recorded === 0,
        },
      };
      ctx.collected.push(result);
      return forModel(result, {
        from, to, location: location ?? 'all',
        days_recorded: recorded, days_in_range: span,
        days_missing: missing.slice(0, 10),
        avg_labour_per_day: avgDaily, total_labour_days: labourDays,
      });
    },
  });

  const getProductionTrend = betaTool({
    name: 'get_production_trend',
    description:
      'Day-by-day production across a date range (max 92 days): HON→HL (de-heading) and HL→VA (value addition) completed kg per day, optionally for one location. Use for "production trend", "output this month", "processing line chart" — get_processing_summary totals a period by location instead of showing it day by day.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'yyyy-MM-dd' },
        to: { type: 'string', description: 'yyyy-MM-dd' },
        location: { type: 'string', description: 'Optional: one location name to filter to' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    } as const,
    run: async ({ from, to, location }) => {
      ctx.toolsUsed.push('get_production_trend');
      const err = checkRange(ctx, from, to);
      if (err) return err;
      ctx.resolved.date = periodLabel(from, to);

      const { data, error } = await ctx.supabase
        .from('daily_processing')
        .select('work_date, hon_to_headless, headless_to_va, location:locations(name)')
        .gte('work_date', from)
        .lte('work_date', to)
        .order('work_date');
      if (error) throw error;

      type Row = {
        work_date: string; hon_to_headless: number; headless_to_va: number;
        location: { name: string } | null;
      };
      const atLocation = locationMatcher(location);
      const raw = ((data as unknown as Row[]) || []).filter((r) => atLocation(r.location?.name));

      const byDate = new Map<string, { honHl: number; hlVa: number }>();
      for (const r of raw) {
        const cur = byDate.get(r.work_date) || { honHl: 0, hlVa: 0 };
        cur.honHl += Number(r.hon_to_headless) || 0;
        cur.hlVa += Number(r.headless_to_va) || 0;
        byDate.set(r.work_date, cur);
      }

      const rows: Record<string, string | number | null>[] = eachDay(from, to).map((d) => {
        const v = byDate.get(d);
        return v
          ? { date: d, hon_to_hl: kg(v.honHl), hl_to_va: kg(v.hlVa) }
          : { date: d, hon_to_hl: null, hl_to_va: null };
      });

      const span = dayCount(from, to);
      const recorded = byDate.size;
      const totalHonHl = kg([...byDate.values()].reduce((s, v) => s + v.honHl, 0));
      const totalHlVa = kg([...byDate.values()].reduce((s, v) => s + v.hlVa, 0));
      const best = [...byDate.entries()].sort((a, b) => b[1].honHl + b[1].hlVa - (a[1].honHl + a[1].hlVa))[0];

      const result: ToolResult = {
        kind: 'chart',
        title: `Daily production output${location ? ` — ${location}` : ''}`,
        subtitle: `Completed kg finished each day${location ? ` at ${location}` : ' across all locations'} over ${periodLabel(from, to)} (${daysPhrase(from, to)}). HON→HL is de-heading, HL→VA is value addition. Production was entered on ${recorded} of ${span} days; blank days are gaps in the register, not zero output.`,
        kpis: [
          { label: 'Total HON → HL', value: totalHonHl, unit: 'kg', tone: 'accent' },
          { label: 'Total HL → VA', value: totalHlVa, unit: 'kg', tone: 'accent' },
          { label: 'Days recorded', value: `${recorded}/${span}`, tone: recorded < span ? 'danger' : 'success' },
        ],
        columns: [
          { key: 'date', label: 'Date', format: 'date', total: 'none' },
          { key: 'hon_to_hl', label: 'HON→HL', format: 'kg', tone: 'hon', share: false },
          { key: 'hl_to_va', label: 'HL→VA', format: 'kg', tone: 'va', share: false },
        ],
        rows,
        chart: {
          type: 'line',
          xKey: 'date',
          series: [
            { key: 'hon_to_hl', label: 'HON→HL' },
            { key: 'hl_to_va', label: 'HL→VA' },
          ],
        },
        meta: {
          date_resolved: `${from} → ${to}`,
          period_label: periodLabel(from, to),
          source_tables: ['daily_processing'],
          row_count: rows.length,
          no_data: recorded === 0,
          unit: 'kg',
        },
      };
      ctx.collected.push(result);
      return forModel(result, {
        from, to, location: location ?? 'all',
        days_recorded: recorded, days_in_range: span,
        total_hon_to_hl: totalHonHl, total_hl_to_va: totalHlVa,
        busiest_day: best ? best[0] : null,
      });
    },
  });

  const getAttendanceTrend = betaTool({
    name: 'get_attendance_trend',
    description:
      'Day-by-day supervisor attendance across a date range (max 92 days): how many supervisors were present each day. Use for "attendance trend", "supervisor attendance this month", "attendance line chart".',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'yyyy-MM-dd' },
        to: { type: 'string', description: 'yyyy-MM-dd' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    } as const,
    run: async ({ from, to }) => {
      ctx.toolsUsed.push('get_attendance_trend');
      const err = checkRange(ctx, from, to);
      if (err) return err;
      ctx.resolved.date = periodLabel(from, to);

      const { data, error } = await ctx.supabase
        .from('daily_supervisor_assignments')
        .select('work_date, is_present')
        .gte('work_date', from)
        .lte('work_date', to)
        .gt('is_present', 0)
        .order('work_date');
      if (error) throw error;

      const byDate = new Map<string, number>();
      for (const r of (data as { work_date: string; is_present: number }[]) || []) {
        byDate.set(r.work_date, (byDate.get(r.work_date) || 0) + (Number(r.is_present) || 0));
      }

      const rows: Record<string, string | number | null>[] = eachDay(from, to).map((d) => ({
        date: d,
        present: byDate.has(d) ? (byDate.get(d) as number) : null,
      }));

      const span = dayCount(from, to);
      const recorded = byDate.size;
      const supervisorDays = [...byDate.values()].reduce((s, n) => s + n, 0);
      const avgDaily = recorded ? Math.round((supervisorDays / recorded) * 10) / 10 : 0;

      const result: ToolResult = {
        kind: 'chart',
        title: 'Daily supervisor attendance',
        subtitle: `Supervisors present each day over ${periodLabel(from, to)} (${daysPhrase(from, to)}). Attendance was taken on ${recorded} of ${span} days; days with no register are gaps, not zero attendance.`,
        kpis: [
          { label: 'Avg per day', value: avgDaily, tone: 'accent' },
          { label: 'Total supervisor-days', value: supervisorDays },
          { label: 'Days recorded', value: `${recorded}/${span}`, tone: recorded < span ? 'danger' : 'success' },
        ],
        columns: [
          { key: 'date', label: 'Date', format: 'date', total: 'none' },
          { key: 'present', label: 'Present', format: 'number', tone: 'present', total: 'avg', share: false },
        ],
        rows,
        chart: {
          type: 'line',
          xKey: 'date',
          series: [{ key: 'present', label: 'Supervisors present' }],
        },
        meta: {
          date_resolved: `${from} → ${to}`,
          period_label: periodLabel(from, to),
          source_tables: ['daily_supervisor_assignments'],
          row_count: rows.length,
          no_data: recorded === 0,
        },
      };
      ctx.collected.push(result);
      return forModel(result, {
        from, to, days_recorded: recorded, days_in_range: span,
        avg_present_per_day: avgDaily, total_supervisor_days: supervisorDays,
      });
    },
  });

  const getLadiesTrend = betaTool({
    name: 'get_ladies_trend',
    description:
      'ADMIN ONLY. Day-by-day ladies attendance across a date range (max 92 days): total ladies present each day, optionally one batch. Use for "ladies trend", "ladies attendance this month", "ladies line chart" — get_ladies_attendance gives a batch × day grid instead of a daily series.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'yyyy-MM-dd' },
        to: { type: 'string', description: 'yyyy-MM-dd' },
        batch_id: { type: 'string', description: 'Optional ladies batch id from resolve_person' },
      },
      required: ['from', 'to'],
      additionalProperties: false,
    } as const,
    run: async ({ from, to, batch_id }) => {
      ctx.toolsUsed.push('get_ladies_trend');
      const gate = adminOnly(ctx);
      if (gate) return gate;
      const err = checkRange(ctx, from, to);
      if (err) return err;
      ctx.resolved.date = periodLabel(from, to);

      let q = ctx.supabase
        .from('local_ladies_attendance')
        .select('work_date, ladies_count')
        .gte('work_date', from)
        .lte('work_date', to)
        .order('work_date');
      if (batch_id) q = q.eq('batch_id', batch_id);
      const { data, error } = await q;
      if (error) throw error;

      const byDate = new Map<string, number>();
      for (const r of (data as { work_date: string; ladies_count: number }[]) || []) {
        byDate.set(r.work_date, (byDate.get(r.work_date) || 0) + (Number(r.ladies_count) || 0));
      }

      const rows: Record<string, string | number | null>[] = eachDay(from, to).map((d) => ({
        date: d,
        ladies: byDate.has(d) ? (byDate.get(d) as number) : null,
      }));

      const span = dayCount(from, to);
      const recorded = byDate.size;
      const ladyDays = [...byDate.values()].reduce((s, n) => s + n, 0);
      const avgDaily = recorded ? Math.round(ladyDays / recorded) : 0;

      const result: ToolResult = {
        kind: 'chart',
        title: batch_id ? 'Daily ladies attendance — single batch' : 'Daily ladies attendance',
        subtitle: `Ladies present each day over ${periodLabel(from, to)} (${daysPhrase(from, to)})${batch_id ? ' for the selected batch' : ' across all batches'}. Recorded on ${recorded} of ${span} days; blank days are gaps in the register.`,
        kpis: [
          { label: 'Avg per day', value: avgDaily, tone: 'accent' },
          { label: 'Total lady-days', value: ladyDays },
          { label: 'Days recorded', value: `${recorded}/${span}`, tone: recorded < span ? 'danger' : 'success' },
        ],
        columns: [
          { key: 'date', label: 'Date', format: 'date', total: 'none' },
          { key: 'ladies', label: 'Ladies present', format: 'number', tone: 'present', total: 'avg', share: false },
        ],
        rows,
        chart: {
          type: 'line',
          xKey: 'date',
          series: [{ key: 'ladies', label: 'Ladies present' }],
        },
        meta: {
          date_resolved: `${from} → ${to}`,
          period_label: periodLabel(from, to),
          source_tables: ['local_ladies_attendance'],
          row_count: rows.length,
          no_data: recorded === 0,
        },
      };
      ctx.collected.push(result);
      return forModel(result, {
        from, to, days_recorded: recorded, days_in_range: span,
        avg_ladies_per_day: avgDaily, total_lady_days: ladyDays,
      });
    },
  });

  const analyze = betaTool({
    name: 'analyze',
    description:
      'ADMIN ONLY. Deep analysis of data already fetched this turn. Call AFTER the data tools. Sends the fetched tables to a stronger model and returns an interpretation (trends, outliers, comparisons, recommendations). Use when the user asks to analyse / explain / compare / why.',
    inputSchema: {
      type: 'object',
      properties: {
        question: { type: 'string', description: "The user's analytical question" },
      },
      required: ['question'],
      additionalProperties: false,
    } as const,
    run: async ({ question }) => {
      ctx.toolsUsed.push('analyze');
      const gate = adminOnly(ctx);
      if (gate) return gate;
      if (ctx.collected.length === 0) {
        return 'No data fetched yet — call a data tool first, then analyze.';
      }
      const payload = ctx.collected.map((r) => ({
        title: r.title,
        kpis: r.kpis,
        columns: r.columns?.map((c) => c.key),
        rows: r.rows,
        meta: r.meta,
      }));
      const response = await ctx.anthropic.messages.create({
        model: ANALYSIS_MODEL,
        max_tokens: 1024,
        thinking: { type: 'adaptive' },
        system:
          'You are a production analyst for a prawn processing business (HON=head-on, HL=headless, VA=value-added; quantities in kg). Analyse ONLY the JSON data provided — never invent numbers. Be concrete and brief: 3-6 short bullet points covering the key pattern, best/worst performers, any anomaly, and one actionable suggestion. Plain language for a factory manager.',
        messages: [
          {
            role: 'user',
            content: `Question: ${question}\n\nData:\n${JSON.stringify(payload)}`,
          },
        ],
      });
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();

      const result: ToolResult = {
        kind: 'card',
        title: 'Analysis',
        fields: [{ label: 'Insights', value: text }],
        meta: { source_tables: ['analysis'], row_count: 1 },
      };
      ctx.collected.push(result);
      return text || 'No analysis produced.';
    },
  });

  return [
    resolvePerson,
    getSupervisorAttendance,
    getSupervisorDetails,
    getAbsentDays,
    compareLabourSources,
    getGradeVsVa,
    getProcessingSummary,
    getLadiesAttendance,
    getBatches,
    getBatchPipeline,
    getLabourTrend,
    getProductionTrend,
    getAttendanceTrend,
    getLadiesTrend,
    analyze,
  ];
}
