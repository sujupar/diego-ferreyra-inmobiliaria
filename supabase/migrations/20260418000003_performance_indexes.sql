-- supabase/migrations/20260418000003_performance_indexes.sql
-- Indexes para queries frecuentes de CRM, tasks y properties.

CREATE INDEX IF NOT EXISTS idx_deals_assigned_created ON deals(assigned_to, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_stage_created ON deals(stage, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deals_origin_created ON deals(origin, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_status ON tasks(assigned_to, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_status_created ON properties(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_properties_assigned ON properties(assigned_to, created_at DESC);
