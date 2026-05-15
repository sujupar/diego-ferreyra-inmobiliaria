-- =============================================================================
-- Migration: tabla singleton para estado del polling de GHL
-- Date: 2026-05-14
--
-- El cron `/api/cron/ghl-poll` (schedule */10 *) lee `last_polled_at` para
-- saber desde cuándo traer opps nuevas/actualizadas, procesa, y persiste
-- la nueva marca + stats de la última corrida.
--
-- Tabla singleton (id=1 fijo) para evitar lock contention y mantener la
-- semántica simple.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ghl_poll_state (
  id INTEGER PRIMARY KEY DEFAULT 1,
  last_polled_at TIMESTAMPTZ,
  last_run_stats JSONB,
  last_run_started_at TIMESTAMPTZ,
  last_run_finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT ghl_poll_state_singleton CHECK (id = 1)
);

INSERT INTO public.ghl_poll_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Permitir que el service role lea/escriba sin RLS (vía endpoint del cron)
ALTER TABLE public.ghl_poll_state ENABLE ROW LEVEL SECURITY;

-- Solo authenticated users con rol admin/dueño pueden ver el estado (para debugging)
DROP POLICY IF EXISTS ghl_poll_state_select_admin ON public.ghl_poll_state;
CREATE POLICY ghl_poll_state_select_admin ON public.ghl_poll_state
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'dueno')
    )
  );
-- service role bypassa RLS por defecto, no necesita policy.
