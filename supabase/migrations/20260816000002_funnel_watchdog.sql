-- Estado del VIGILANTE de la cola del embudo (`/api/cron/funnel-watchdog`).
--
-- La cola de avisos (`funnel_lead_jobs`) no tenía NINGÚN mecanismo que avisara
-- si se atrasaba o si el cron que la drena moría: el resumen de cada corrida se
-- descarta (pg_net es fire-and-forget) y la única alarma existente corre DENTRO
-- del worker — con el worker muerto, nunca suena. Ya costó 6 horas de ceguera
-- el 2026-08-13 (deploy 9c667e4) con el dueño probando activamente ese día.
--
-- Singleton: una sola fila. `last_alert_at` es el dedup de la alerta (una cada
-- 6 h como mucho, no un email por corrida); `last_check_at` deja constancia de
-- que el vigilante mismo está vivo.
CREATE TABLE IF NOT EXISTS public.funnel_watchdog_state (
  id            BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  last_check_at TIMESTAMPTZ,
  last_alert_at TIMESTAMPTZ,
  last_backlog  INT NOT NULL DEFAULT 0
);

INSERT INTO public.funnel_watchdog_state (id) VALUES (TRUE)
ON CONFLICT DO NOTHING;

-- Solo el service role (la ruta del cron) la toca. RLS sin políticas = nadie
-- más puede leerla ni escribirla vía PostgREST.
ALTER TABLE public.funnel_watchdog_state ENABLE ROW LEVEL SECURITY;
