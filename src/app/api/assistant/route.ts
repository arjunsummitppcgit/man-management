// ─── POST /api/assistant ─────────────────────────────────────────────────────
// Runs one assistant turn: authenticates the Supabase session, builds the
// tool set (which enforces admin-only + staff-today-only rules server-side),
// and drives Claude Haiku 4.5 with the SDK Tool Runner. "Analyse" questions
// escalate to Sonnet 5 inside the analyze tool. Returns the final summary
// plus the full ToolResult envelopes for the results canvas.

import Anthropic from '@anthropic-ai/sdk';
import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { isSubUserEmail } from '@/lib/auth/subUsers';
import { STATIC_SYSTEM_PROMPT, buildRuntimePrompt } from '@/lib/assistant/prompt';
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

export async function POST(request: NextRequest) {
  // ── 1. Auth: same session the rest of the app uses (RLS applies) ──────────
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }
  const isAdmin = !isSubUserEmail(user.email);

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
  };

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
      resolved: resolvedParts.length ? resolvedParts.join(' · ') : undefined,
      model: ROUTER_MODEL,
    };
    return NextResponse.json(payload);
  } catch (err) {
    console.error('Assistant error:', err);
    const message =
      err instanceof Anthropic.APIError
        ? `Assistant model error (${err.status}): ${err.message}`
        : 'Something went wrong answering that — please try again.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
