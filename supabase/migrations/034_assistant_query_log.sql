-- ============================================
-- 034: ASSISTANT QUERY LOG
--
-- The assistant model is stateless — it learns nothing between questions, and
-- it never will. Everything it "remembers" about this business lives in the
-- system prompt, which we edit by hand. What it CANNOT know is how this team
-- actually asks things: which questions come up every morning, which phrasings
-- it keeps failing to answer, which tools carry the real load.
--
-- That is what this table is for. One row per assistant turn, written by the
-- signed-in user's own session (so RLS applies normally, no service key). Two
-- things read it back:
--
--   1. The suggestion chips on the Assistant page — real recent/frequent
--      questions for THIS user instead of a hardcoded seed list.
--   2. Us, when tuning the prompt: rows with succeeded = false or an empty
--      tools_used are questions the assistant could not route, and each one is
--      a candidate for a new glossary line or a new tool.
--
-- Deliberately NOT stored: the answer text and the result rows. The tables are
-- already in the database; keeping a second copy of every figure the assistant
-- ever displayed would age badly and leak admin-only numbers into a table with
-- looser access than the source.
-- ============================================

CREATE TABLE assistant_query_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- The asker. Kept on user delete so aggregate history survives an account
    -- being removed; the chips only ever read back your own rows.
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    -- Exactly what was typed, for reading back as a suggestion chip.
    question TEXT NOT NULL,
    -- Lowercased and whitespace-collapsed, so "How many supervisors today?" and
    -- "how many supervisors today" count as the same question when ranking.
    normalized_question TEXT NOT NULL,
    -- Tool names in call order, e.g. {resolve_person,get_supervisor_attendance}.
    -- An empty array means the model answered (or refused) without touching the
    -- database — usually a clarifying question, sometimes a routing failure.
    tools_used TEXT[] NOT NULL DEFAULT '{}',
    -- Which cards the results panel ended up showing: kpi / table / card / chart.
    result_kinds TEXT[] NOT NULL DEFAULT '{}',
    -- Total rows across every card, so we can spot questions that "worked" but
    -- came back empty.
    row_total INTEGER NOT NULL DEFAULT 0,
    -- False when the turn threw: model error, tool error, timeout.
    succeeded BOOLEAN NOT NULL DEFAULT TRUE,
    error_text TEXT,
    -- Router model that answered, so a model change is visible in the history.
    model TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- The chips query: this user's rows, newest first.
CREATE INDEX idx_assistant_query_log_user_time
    ON assistant_query_log(user_id, created_at DESC);

-- Frequency ranking across the log.
CREATE INDEX idx_assistant_query_log_normalized
    ON assistant_query_log(normalized_question);

-- Finding what the assistant could not route.
CREATE INDEX idx_assistant_query_log_failures
    ON assistant_query_log(created_at DESC)
    WHERE succeeded = FALSE OR tools_used = '{}';

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Your own questions are yours; admins can read the whole log to tune the
-- prompt. Nobody edits history — there is no UPDATE policy, so the log is
-- append-only for every role that reaches it through PostgREST.
ALTER TABLE assistant_query_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert own assistant queries" ON assistant_query_log;
CREATE POLICY "insert own assistant queries" ON assistant_query_log
    FOR INSERT WITH CHECK (user_id = auth.uid() AND is_active_app_user());

DROP POLICY IF EXISTS "read own or admin reads all assistant queries" ON assistant_query_log;
CREATE POLICY "read own or admin reads all assistant queries" ON assistant_query_log
    FOR SELECT USING (user_id = auth.uid() OR is_app_admin());

DROP POLICY IF EXISTS "admins delete assistant queries" ON assistant_query_log;
CREATE POLICY "admins delete assistant queries" ON assistant_query_log
    FOR DELETE USING (is_app_admin());
