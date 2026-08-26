'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '@/components/layout/PageHeader';
import ResultCard from '@/components/assistant/ResultCard';
import { useIsDark } from '@/components/analytics/shared';
import { useAuth } from '@/hooks/useAuth';
import type {
  AssistantApiResponse,
  CanvasResult,
  ChatMessage,
} from '@/lib/assistant/types';

const RECENT_KEY = 'ppc-assistant-recent-v1';

const SEED_QUESTIONS = [
  'How many supervisors attended today?',
  'Labour trend this month',
  'Company vs outside labour today',
];

interface RecentEntry {
  q: string;
  count: number;
  last: number;
}

/**
 * Questions worth discovering, each tagged with the tool it exercises so we can
 * offer the ones this user has never reached for. `range` marks a question that
 * spans more than today (staff accounts are clamped to today, so those are
 * dropped for them); `admin` marks admin-only data.
 */
const DISCOVERY: { q: string; tool: string; range?: boolean; admin?: boolean }[] = [
  { q: 'Labour trend this month', tool: 'get_labour_trend', range: true },
  { q: 'Production trend this month', tool: 'get_production_trend', range: true },
  { q: 'Supervisor attendance this month', tool: 'get_attendance_trend', range: true },
  { q: 'Company vs outside labour today', tool: 'compare_labour_sources' },
  { q: 'Grade vs VA this month', tool: 'get_grade_vs_va', range: true },
  { q: "Today's processing summary", tool: 'get_processing_summary' },
  { q: 'Supervisors present today', tool: 'get_supervisor_attendance' },
  { q: 'Ladies attendance this week', tool: 'get_ladies_trend', range: true, admin: true },
];

/**
 * The user's real question history from assistant_query_log. Falls back to the
 * per-browser localStorage list when the log is empty or migration 034 has not
 * been applied yet, so chips never disappear.
 */
async function fetchSuggestions(): Promise<{ recents: string[]; usedTools: string[] }> {
  try {
    const res = await fetch('/api/assistant');
    if (!res.ok) return { recents: [], usedTools: [] };
    const data: { suggestions?: string[]; usedTools?: string[] } = await res.json();
    return {
      recents: Array.isArray(data.suggestions) ? data.suggestions : [],
      usedTools: Array.isArray(data.usedTools) ? data.usedTools : [],
    };
  } catch {
    return { recents: [], usedTools: [] };
  }
}

function loadRecents(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const entries: RecentEntry[] = JSON.parse(raw);
    return entries
      .sort((a, b) => b.count - a.count || b.last - a.last)
      .slice(0, 3)
      .map((e) => e.q);
  } catch {
    return [];
  }
}

function saveRecent(question: string) {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const entries: RecentEntry[] = raw ? JSON.parse(raw) : [];
    const norm = question.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const existing = entries.find(
      (e) => e.q.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() === norm
    );
    if (existing) {
      existing.count += 1;
      existing.last = Date.now();
    } else {
      entries.push({ q: question, count: 1, last: Date.now() });
    }
    localStorage.setItem(RECENT_KEY, JSON.stringify(entries.slice(-30)));
  } catch {
    // localStorage unavailable — recents are a nice-to-have
  }
}

/** Template follow-up chips keyed by the data source of the latest result. */
function followUpsFor(results: CanvasResult[], isAdmin: boolean): string[] {
  const top = results[0];
  const src = top?.meta.source_tables[0];

  // A line chart is already a period view — drill sideways, not into a trend.
  if (top?.chart?.type === 'line') {
    switch (src) {
      case 'daily_workforce':
        return isAdmin
          ? ['Break it down by location', 'Analyse this trend', 'Same period last month']
          : ['Break it down by location'];
      case 'daily_processing':
        return isAdmin
          ? ['Analyse this trend', 'Grade vs VA for the same period', 'Which day was highest?']
          : ['Which day was highest?'];
      case 'daily_supervisor_assignments':
        return ['Which days had the fewest?', 'Who was absent most often?'];
      case 'local_ladies_attendance':
        return ['Which batch attended most?', 'Analyse this trend'];
      default:
        return ['Analyse this trend'];
    }
  }

  switch (src) {
    case 'daily_supervisor_assignments':
      return isAdmin
        ? ['Who was absent?', 'Attendance trend this month', 'Labour breakdown today']
        : ['Who was absent?', 'Labour breakdown today'];
    case 'supervisors':
      return ['Is he present today?', 'How many days absent this month?'];
    case 'daily_workforce':
      return isAdmin
        ? ['Labour trend this month', "Today's processing summary", 'Compare with yesterday']
        : ['Show grade vs VA today', "Today's processing summary"];
    case 'hl_va_entries':
      return isAdmin
        ? ['Analyse this table', 'HON to HL summary for the same day']
        : ['HON to HL summary today'];
    case 'daily_processing':
      return isAdmin
        ? ['Analyse this', 'Production trend this month', 'Grade vs VA for the same period']
        : ['Grade vs VA today'];
    case 'local_ladies_attendance':
      return ['Which batch attended most?', 'Compare with last week'];
    case 'analysis':
      return ['Supervisors present today', "Today's processing summary"];
    default:
      return [];
  }
}

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now()}-${idCounter}`;
}

export default function AssistantPage() {
  const { user, isSubUser, loading: authLoading } = useAuth();
  const isDark = useIsDark();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [results, setResults] = useState<CanvasResult[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [recents, setRecents] = useState<string[]>([]);
  const [usedTools, setUsedTools] = useState<string[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Show the local list immediately, then upgrade to the shared history.
    setRecents(loadRecents());
    let cancelled = false;
    fetchSuggestions().then((fromLog) => {
      if (cancelled) return;
      if (fromLog.recents.length > 0) setRecents(fromLog.recents);
      setUsedTools(fromLog.usedTools);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, loading]);

  const displayName = useMemo(() => {
    const email = user?.email ?? '';
    const name = email ? email.split('@')[0] : '';
    return name ? name.charAt(0).toUpperCase() + name.slice(1) : 'there';
  }, [user]);

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || loading) return;
      setInput('');
      setLoading(true);
      const userMsg: ChatMessage = { id: nextId('u'), role: 'user', content: question };
      setMessages((prev) => [...prev, userMsg]);

      try {
        const history = messages.slice(-10).map((m) => ({ role: m.role, content: m.content }));
        const res = await fetch('/api/assistant', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question, history }),
        });
        const data: AssistantApiResponse & { error?: string } = await res.json();

        if (!res.ok || data.error) {
          setMessages((prev) => [
            ...prev,
            {
              id: nextId('a'),
              role: 'assistant',
              content: data.error || 'Something went wrong — please try again.',
              error: true,
            },
          ]);
          return;
        }

        const askedAt = new Date().toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: 'Asia/Kolkata',
        });
        const canvasResults: CanvasResult[] = (data.results || []).map((r) => ({
          ...r,
          id: nextId('r'),
          askedAt,
          question,
        }));
        // Newest first on the canvas
        setResults((prev) => [...canvasResults.reverse(), ...prev]);
        setMessages((prev) => [
          ...prev,
          {
            id: nextId('a'),
            role: 'assistant',
            content: data.summary,
            resolved: data.resolved,
            resultIds: canvasResults.map((r) => r.id),
          },
        ]);
        saveRecent(question);
        setRecents(loadRecents());
        // The question just landed in the query log — pull the ranked list back
        // so the chips reflect what this user actually asks, not just this tab.
        fetchSuggestions().then((fromLog) => {
          if (fromLog.recents.length > 0) setRecents(fromLog.recents);
          setUsedTools(fromLog.usedTools);
        });
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId('a'),
            role: 'assistant',
            content: "Couldn't reach the server — check your connection and try again.",
            error: true,
          },
        ]);
      } finally {
        setLoading(false);
        inputRef.current?.focus();
      }
    },
    [loading, messages]
  );

  const followUps = useMemo(
    () => (messages.length > 0 && !loading ? followUpsFor(results, !isSubUser) : []),
    [messages.length, results, isSubUser, loading]
  );

  const chips = messages.length === 0 ? (recents.length > 0 ? recents : SEED_QUESTIONS) : followUps;

  // Once a conversation is running the follow-ups take the first row, but the
  // recents stay useful — offer the ones this session has not already asked
  // and that the follow-ups are not already suggesting.
  const askedThisSession = new Set(
    messages.filter((m) => m.role === 'user').map((m) => m.content.toLowerCase().trim())
  );
  const shownAsChips = new Set(chips.map((c) => c.toLowerCase().trim()));
  const recentChips =
    messages.length === 0
      ? []
      : recents
          .filter((r) => {
            const key = r.toLowerCase().trim();
            return !shownAsChips.has(key) && !askedThisSession.has(key);
          })
          .slice(0, 3);

  // Three things to try, biased towards tools this account has never used —
  // once everything has been tried it falls back to the pool order rather than
  // going empty.
  const alreadyOffered = new Set([
    ...shownAsChips,
    ...recentChips.map((c) => c.toLowerCase().trim()),
    ...askedThisSession,
  ]);
  const runnable = DISCOVERY.filter(
    (d) => !(isSubUser && (d.range || d.admin)) && !alreadyOffered.has(d.q.toLowerCase().trim())
  );
  const untried = runnable.filter((d) => !usedTools.includes(d.tool));
  const suggestedChips = (untried.length >= 3 ? untried : [...untried, ...runnable.filter((d) => !untried.includes(d))])
    .slice(0, 3)
    .map((d) => d.q);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Assistant"
        subtitle="Ask about attendance, labour, production, grades & targets"
        rightAction={
          <span className="px-3 py-1.5 bg-teal-50 text-teal-700 rounded-full text-[11px] font-bold">
            {isSubUser ? 'Staff · recent days' : 'AI powered'}
          </span>
        }
      />

      <div className="px-4 pb-8 lg:grid lg:grid-cols-[minmax(360px,420px)_minmax(0,1fr)] lg:gap-6 lg:items-start space-y-4 lg:space-y-0">
        {/* ── Chat rail ── */}
        <div className="bg-white rounded-2xl flex flex-col h-[520px] lg:h-[calc(100vh-190px)] lg:sticky lg:top-6 overflow-hidden">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 && !authLoading && (
              <div className="asst-welcome rounded-2xl p-4">
                <div className="w-10 h-10 rounded-xl gradient-teal flex items-center justify-center text-xl mb-2.5 shadow-md">
                  🦐
                </div>
                <p className="text-sm font-bold text-gray-900 mb-1">
                  Hi {displayName} 👋
                </p>
                <p className="text-xs text-gray-600 leading-relaxed">
                  Ask me about supervisor attendance, labour, ladies, production (HON→HL, HL→VA),
                  grades or targets{isSubUser ? ' — for recent days' : ' — any date'}.
                </p>
                {isSubUser && (
                  <p className="text-[10px] font-semibold text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mt-2">
                    Staff account: you can view today&apos;s data only.
                  </p>
                )}
              </div>
            )}

            {messages.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="asst-bub-user max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2.5 text-[13px] font-medium leading-relaxed">
                    {m.content}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex justify-start">
                  <div
                    className={`max-w-[90%] rounded-2xl rounded-bl-md px-3.5 py-2.5 text-[13px] leading-relaxed ${
                      m.error ? 'bg-rose-50 text-rose-600 font-medium' : 'asst-bub-bot text-gray-900'
                    }`}
                  >
                    <span className="whitespace-pre-wrap">{m.content}</span>
                    {m.resolved && (
                      <span className="block mt-1.5 text-[10px] font-bold text-teal-700 bg-teal-50 rounded-full px-2 py-0.5 w-fit">
                        {m.resolved}
                      </span>
                    )}
                    {!m.error && m.resultIds && m.resultIds.length > 0 && (
                      <span className="block mt-1 text-[10px] font-semibold text-gray-400">
                        → shown on the results panel
                      </span>
                    )}
                  </div>
                </div>
              )
            )}

            {loading && (
              <div className="flex justify-start">
                <div className="asst-bub-bot rounded-2xl rounded-bl-md px-3.5 py-2.5 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse [animation-delay:150ms]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse [animation-delay:300ms]" />
                  <span className="text-[11px] font-semibold text-gray-500 ml-1">Checking the data…</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chips */}
          {(chips.length > 0 || suggestedChips.length > 0 || recentChips.length > 0) && (
            <div className="px-4 pb-2 space-y-2">
              {chips.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 mb-1.5">
                    {messages.length === 0 ? (recents.length > 0 ? 'Recent' : 'Try asking') : 'Follow up'}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {chips.map((c) => (
                      <button
                        key={c}
                        onClick={() => send(c)}
                        disabled={loading}
                        className="asst-chip px-3 py-1.5 rounded-full text-[11px] font-semibold disabled:opacity-50"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {suggestedChips.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 mb-1.5">
                    Suggested
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {suggestedChips.map((c) => (
                      <button
                        key={c}
                        onClick={() => send(c)}
                        disabled={loading}
                        className="asst-chip px-3 py-1.5 rounded-full text-[11px] font-semibold disabled:opacity-50"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {recentChips.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-400 mb-1.5">
                    Recent
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {recentChips.map((c) => (
                      <button
                        key={c}
                        onClick={() => send(c)}
                        disabled={loading}
                        className="asst-chip px-3 py-1.5 rounded-full text-[11px] font-semibold disabled:opacity-50"
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-gray-100">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="flex items-center gap-2"
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question…"
                disabled={loading}
                className="flex-1 min-w-0 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-full text-[13px] font-medium text-gray-900 placeholder:text-gray-400"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                aria-label="Send"
                className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/25 active:scale-95 transition-transform disabled:opacity-40 disabled:shadow-none"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.2} stroke="currentColor" className="w-4.5 h-4.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                </svg>
              </button>
            </form>
          </div>
        </div>

        {/* ── Results canvas ── */}
        <div className="space-y-4 min-w-0">
          {results.length === 0 ? (
            <div className="bg-white rounded-2xl px-6 py-16 flex flex-col items-center justify-center text-center">
              <span className="text-4xl mb-3">📊</span>
              <p className="text-sm font-bold text-gray-900 mb-1">Your reports appear here</p>
              <p className="text-xs text-gray-500 max-w-xs">
                Ask a question on the left — tables, KPIs and charts land on this panel, ready to export.
              </p>
            </div>
          ) : (
            results.map((r) => <ResultCard key={r.id} result={r} isDark={isDark} />)
          )}
        </div>
      </div>
    </div>
  );
}
