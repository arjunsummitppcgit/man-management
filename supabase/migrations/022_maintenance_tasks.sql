-- ============================================
-- 022: MAINTENANCE TASKS ("My Tasks")
-- Plant maintenance issues (exhaust fan, grading
-- machine, lights, ...) raised by the admin, chased
-- through dated follow-up notes, and closed off with
-- a resolved date.
-- ============================================

CREATE TABLE maintenance_tasks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    -- Short label shown on the task box, e.g. 'Exhaust fan'
    title TEXT NOT NULL,
    -- Full description, e.g. 'Exhaust fan not working'
    problem TEXT NOT NULL DEFAULT '',
    -- Free-text person responsible + phone to chase them on
    assigned_to TEXT NOT NULL DEFAULT '',
    assigned_phone TEXT,
    location_id UUID REFERENCES locations(id) ON DELETE SET NULL,
    priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'resolved')),
    -- When the problem was raised / escalated
    escalated_on DATE NOT NULL DEFAULT CURRENT_DATE,
    -- Drives the in-app follow-up alert badges
    next_followup_on DATE,
    resolved_on DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maintenance_tasks_status ON maintenance_tasks(status);
CREATE INDEX idx_maintenance_tasks_followup ON maintenance_tasks(next_followup_on);
CREATE INDEX idx_maintenance_tasks_escalated ON maintenance_tasks(escalated_on DESC);

-- Dated follow-up notes attached to a task
CREATE TABLE maintenance_task_followups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    task_id UUID NOT NULL REFERENCES maintenance_tasks(id) ON DELETE CASCADE,
    note TEXT NOT NULL,
    followup_on DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maintenance_followups_task ON maintenance_task_followups(task_id, followup_on DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_maintenance_task_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_maintenance_task_updated
    BEFORE UPDATE ON maintenance_tasks
    FOR EACH ROW
    EXECUTE FUNCTION update_maintenance_task_timestamp();

-- Enable RLS
ALTER TABLE maintenance_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_task_followups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can do everything on maintenance_tasks"
    ON maintenance_tasks FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can do everything on maintenance_task_followups"
    ON maintenance_task_followups FOR ALL USING (auth.role() = 'authenticated');
