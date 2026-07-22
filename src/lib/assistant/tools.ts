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

export interface ToolContext {
  supabase: SupabaseClient;
  anthropic: Anthropic;
  isAdmin: boolean;
  today: string; // yyyy-MM-dd (IST)
  collected: ToolResult[];
  resolved: { person?: string; date?: string };
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
        title: supervisor_id ? 'Supervisor attendance' : 'Supervisors present',
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
        title: `${sup.data.name} — absences in ${month}`,
        kpis: [
          { label: 'Absent days', value: absentDays.length, tone: absentDays.length ? 'danger' : 'success' },
          { label: 'Present days', value: presentDays.size, tone: 'success' },
          { label: 'Recorded days', value: recordedDays.length },
        ],
        columns: [{ key: 'date', label: 'Absent on', format: 'date' }],
        rows: absentDays.map((d) => ({ date: d })),
        meta: {
          person_resolved: sup.data.name,
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
        kpis: [
          { label: 'Company', value: totalCompany, tone: 'accent' },
          { label: 'Outside (non-local)', value: totalNonLocal, tone: 'default' },
        ],
        columns: [
          { key: 'location', label: 'Location' },
          { key: 'company', label: 'Company', format: 'number' },
          { key: 'non_local', label: 'Outside', format: 'number' },
          { key: 'kg_basic', label: 'KG basic', format: 'number' },
          { key: 'daily_wage', label: 'Daily wage', format: 'number' },
          { key: 'total_labour', label: 'Total labour', format: 'number' },
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
        title: 'Grade vs VA',
        kpis: [
          { label: 'Total HL', value: totalHl, unit: 'kg' },
          { label: 'Total VA', value: totalVa, unit: 'kg', tone: 'accent' },
          { label: 'Grades', value: rows.length },
        ],
        columns: [
          { key: 'grade', label: 'Grade' },
          { key: 'hl_kgs', label: 'HL', format: 'kg' },
          { key: 'va_kgs', label: 'VA', format: 'kg' },
          { key: 'yield_pct', label: 'VA/HL %', format: 'number' },
          { key: 'varieties', label: 'Varieties' },
        ],
        rows,
        meta: {
          date_resolved: ctx.resolved.date,
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
      'Production summary per location for a date range from daily processing: HON→HL (de-heading) and HL→VA (value addition) completed kg plus work-in-process kg. Use for "HON to HL summary" / "HL to VA summary".',
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
      const byLoc = new Map<string, { honHl: number; hlVa: number; wipHonHl: number; wipHlVa: number }>();
      for (const r of (data as unknown as Row[]) || []) {
        const loc = r.location?.name ?? '—';
        const cur = byLoc.get(loc) || { honHl: 0, hlVa: 0, wipHonHl: 0, wipHlVa: 0 };
        cur.honHl += Number(r.hon_to_headless) || 0;
        cur.hlVa += Number(r.headless_to_va) || 0;
        cur.wipHonHl += Number(r.wip_hon_to_headless) || 0;
        cur.wipHlVa += Number(r.wip_headless_to_va) || 0;
        byLoc.set(loc, cur);
      }
      const rows = [...byLoc.entries()].map(([location, v]) => ({
        location,
        hon_to_hl: kg(v.honHl),
        hl_to_va: kg(v.hlVa),
        wip_hon_to_hl: kg(v.wipHonHl),
        wip_hl_to_va: kg(v.wipHlVa),
      }));
      const tHonHl = kg(rows.reduce((s, r) => s + r.hon_to_hl, 0));
      const tHlVa = kg(rows.reduce((s, r) => s + r.hl_to_va, 0));

      const result: ToolResult = {
        kind: 'table',
        title: 'Processing summary',
        kpis: [
          { label: 'HON → HL', value: tHonHl, unit: 'kg', tone: 'accent' },
          { label: 'HL → VA', value: tHlVa, unit: 'kg', tone: 'accent' },
        ],
        columns: [
          { key: 'location', label: 'Location' },
          { key: 'hon_to_hl', label: 'HON→HL', format: 'kg' },
          { key: 'hl_to_va', label: 'HL→VA', format: 'kg' },
          { key: 'wip_hon_to_hl', label: 'WIP HON→HL', format: 'kg' },
          { key: 'wip_hl_to_va', label: 'WIP HL→VA', format: 'kg' },
        ],
        rows,
        meta: {
          date_resolved: ctx.resolved.date,
          source_tables: ['daily_processing'],
          row_count: rows.length,
          no_data: rows.length === 0,
          unit: 'kg',
        },
      };
      ctx.collected.push(result);
      return forModel(result, { from, to: end });
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
        title: 'Ladies attendance',
        kpis: [
          { label: 'Total lady-days', value: grandTotal, tone: 'accent' },
          { label: 'Batches', value: rows.length },
          { label: 'Days', value: dates.length },
        ],
        columns: [
          { key: 'batch', label: 'Batch' },
          ...dates.map((d) => ({ key: d, label: d.slice(5), format: 'number' as const })),
          { key: 'total', label: 'Total', format: 'number' as const },
        ],
        rows,
        meta: {
          date_resolved: ctx.resolved.date,
          source_tables: ['local_ladies_attendance'],
          row_count: rows.length,
          no_data: raw.length === 0,
        },
      };
      ctx.collected.push(result);
      return forModel(result, { from, to: end, dates });
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
    analyze,
  ];
}
