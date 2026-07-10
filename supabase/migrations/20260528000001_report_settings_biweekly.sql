-- Add biweekly_enabled flag to report_settings.
--
-- Background: hasta hoy el código de scheduled-biweekly-report.mts leía
-- `weekly_enabled` para decidir si disparar el reporte quincenal — eso hacía
-- que biweekly y weekly compartieran toggle. Ahora cada reporte tiene su
-- propio enabled flag. Default = true para que el reporte arranque a
-- enviarse a partir del próximo domingo de semana ISO par.

ALTER TABLE public.report_settings
  ADD COLUMN IF NOT EXISTS biweekly_enabled BOOLEAN NOT NULL DEFAULT true;

-- Activar explícitamente en la fila default (idempotente).
UPDATE public.report_settings
SET biweekly_enabled = true,
    updated_at = NOW()
WHERE id = 'default';
