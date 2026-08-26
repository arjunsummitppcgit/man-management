// ─── POST /api/assistant ─────────────────────────────────────────────────────
// Runs one assistant turn: authenticates the Supabase session, builds the
// tool set (which enforces admin-only + staff-today-only rules server-side),
// and drives Claude Haiku 4.5 with the SDK Tool Runner. "Analyse" questions
// escalate to Sonnet 5 inside the analyze tool. Returns the final summary
// plus the full ToolResult envelopes for the results canvas.
//
// Every turn is appended to assistant_query_log (migration 034) under the
// asker's own session. GET on this route reads that log back as suggestion
// chips. Both sides degrade quietly if the migration has not been applied.

import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { STATIC_SYSTEM_PROMPT, buildRuntimePrompt } from '@/lib/assistant/prompt';
import { humanizeDates } from '@/lib/assistant/format';
import { buildAssistantTools, type ToolContext } from '@/lib/assistant/tools';
import type { AssistantApiRequest, AssistantApiResponse, ToolResult } from '@/lib/assistant/types';

export const runtime = 'nodejs';

const ROUTER_MODEL = 'claude-haiku-4-5';
const MAX_HISTORY_TURNS = 12;
const MAX_QUESTION_CHARS = 600;

function todayInIST(): string {
  // en-CA formats as yyyy-MM-dd
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

/** Collapses phrasing differences so repeats of one question rank together. */
function normalizeQuestion(q: string): string {
  return q.toLowerCase().replace(/\s+/g, ' ').replace(/[?.!]+$/, '').trim();
}

/**
 * Appends one turn to the query log. Never throws and never blocks the answer:
 * if migration 034 has not been applied yet the insert simply fails and the
 * assistant carries on — logging is for tuning, not for correctness.
 */
async function logQuery(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  userId: string,
  entry: {
    question: string;
    toolsUsed: string[];
    results: ToolResult[];
    succeeded: boolean;
    errorText?: string;
    durationMs: number;
  }
): Promise<void> {
  try {
    await supabase.from('assistant_query_log').insert({
      user_id: userId,
      question: entry.question,
      normalized_question: normalizeQuestion(entry.question),
      tools_used: entry.toolsUsed,
      result_kinds: entry.results.map((r) => r.kind),
      row_total: entry.results.reduce((sum, r) => sum + (r.meta.row_count || 0), 0),
      succeeded: entry.succeeded,
      error_text: entry.errorText ?? null,
      model: ROUTER_MODEL,
      duration_ms: entry.durationMs,
    });
  } catch (err) {
    console.warn('assistant_query_log insert skipped:', err);
  }
}

// ─── GET /api/assistant ──────────────────────────────────────────────────────
// Suggestion chips: this user's own questions that actually reached a tool,
// ranked by how often they ask it and how recently. Returns an empty list (not
// an error) when there is no history yet — the page falls back to its seeds.
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('assistant_query_log')
    .select('question, normalized_question, created_at')
    .eq('user_id', user.id)
    .eq('succeeded', true)
    .neq('tools_used', '{}')
    .order('created_at', { ascending: false })
    .limit(60);

  if (error || !data) {
    // Table missing (migration not applied) or unreadable — no chips, no noise.
    return NextResponse.json({ suggestions: [] });
  }

  type Entry = { question: string; hits: number; rank: number };
  const byQuestion = new Map<string, Entry>();
  data.forEach((row, i) => {
    const key = row.normalized_question;
    const existing = byQuestion.get(key);
    if (existing) {
      existing.hits += 1;
    } else {
      // `i` is position in a newest-first list, so a smaller i is more recent.
      byQuestion.set(key, { question: row.question, hits: 1, rank: i });
    }
  });

  const suggestions = [...byQuestion.values()]
    .sort((a, b) => b.hits - a.hits || a.rank - b.rank)
    .slice(0, 3)
    .map((e) => e.question);

  return NextResponse.json({ suggestions });
}

export async function POST(request: NextRequest) {
  // ── 1. Auth: same session the rest of the app uses (RLS applies) ──────────
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  // Role comes from the database, not an email list — same source the RLS
  // policies use, so the assistant can never be more permissive than the tables.
  const { data: profile } = await supabase
    .from('app_users')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle();
  const isAdmin = profile?.role === 'admin' && profile.is_active === true;

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Assistant is not configured yet — add ANTHROPIC_API_KEY to .env.local and restart the server.' },
      { status: 503 }
    );
  }

  // ── 2. Parse request ──────────────────────────────────────────────────────
  let body: AssistantApiRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const question = (body.question || '').trim().slice(0, MAX_QUESTION_CHARS);
  if (!question) {
    return NextResponse.json({ error: 'Ask a question.' }, { status: 400 });
  }
  const history = Array.isArray(body.history)
    ? body.history
        .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-MAX_HISTORY_TURNS)
    : [];

  // ── 3. Live rosters for the runtime prompt (locations are data-driven) ────
  const [locs, sups, batches] = await Promise.all([
    supabase.from('locations').select('name').eq('is_active', true).order('sort_order'),
    supabase.from('supervisors').select('name').eq('is_active', true).order('name'),
    isAdmin
      ? supabase.from('local_ladies_batches').select('name').eq('is_active', true).order('sort_order')
      : Promise.resolve({ data: [] as { name: string }[], error: null }),
  ]);

  const today = todayInIST();
  const runtimePrompt = buildRuntimePrompt({
    today,
    isAdmin,
    locations: (locs.data || []).map((l) => l.name),
    supervisors: (sups.data || []).map((s) => s.name),
    ladiesBatches: (batches.data || []).map((b) => b.name),
  });

  // ── 4. Run the tool loop ──────────────────────────────────────────────────
  const anthropic = new Anthropic();
  const collected: ToolResult[] = [];
  const ctx: ToolContext = {
    supabase,
    anthropic,
    isAdmin,
    today,
    collected,
    resolved: {},
    toolsUsed: [],
  };
  const startedAt = Date.now();

  try {
    const finalMessage = await anthropic.beta.messages.toolRunner({
      model: ROUTER_MODEL,
      max_tokens: 1024,
      max_iterations: 8,
      // Static block is cached; volatile runtime context goes AFTER the breakpoint.
      system: [
        { type: 'text', text: STATIC_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: runtimePrompt },
      ],
      tools: buildAssistantTools(ctx),
      messages: [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: 'user' as const, content: question },
      ],
    });

    const summary = finalMessage.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    const resolvedParts = [ctx.resolved.person, ctx.resolved.date].filter(Boolean);
    const payload: AssistantApiResponse = {
      summary: summary || 'Done — see the results panel.',
      results: collected,
      // dd-mm-yy for the chat pill, same as the results panel shows.
      resolved: resolvedParts.length ? humanizeDates(resolvedParts.join(' · ')) : undefined,
      model: ROUTER_MODEL,
    };
    await logQuery(supabase, user.id, {
      question,
      toolsUsed: ctx.toolsUsed,
      results: collected,
      succeeded: true,
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json(payload);
  } catch (err) {
    console.error('Assistant error:', err);
    const message =
      err instanceof Anthropic.APIError
        ? `Assistant model error (${err.status}): ${err.message}`
        : 'Something went wrong answering that — please try again.';
    await logQuery(supabase, user.id, {
      question,
      toolsUsed: ctx.toolsUsed,
      results: collected,
      succeeded: false,
      errorText: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
      durationMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
