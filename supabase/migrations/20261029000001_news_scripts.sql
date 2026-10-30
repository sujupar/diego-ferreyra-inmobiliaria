-- Sección Noticias autoservicio: guiones generados a partir de una noticia.
-- Una fila por noticia que el usuario pidió guionizar. El motor (cron
-- `guionizar_pendientes`) toma las filas en estado 'guionizando', escribe el
-- guion y pasa la fila a 'listo' (o 'error' con error_msg).
-- Correr a mano en el SQL Editor del Dashboard. Idempotente.

CREATE TABLE IF NOT EXISTS public.news_scripts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  titulo          text,
  medio           text,
  fecha_articulo  date,
  url             text,
  resumen         text,
  formato         text,
  guion           text,
  estado          text CHECK (estado IN ('guionizando','listo','error')) DEFAULT 'guionizando',
  error_msg       text,
  avisado_at      timestamptz,
  creado_por      uuid
);

-- El motor busca las filas pendientes por estado.
CREATE INDEX IF NOT EXISTS news_scripts_estado_idx ON public.news_scripts (estado);

ALTER TABLE public.news_scripts ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado (mismo criterio que `news_scans`).
-- Escritura: solo service_role (el motor y las rutas del servidor), que ignora
-- RLS — por eso no hace falta política de INSERT/UPDATE para `authenticated`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='news_scripts'
                 AND policyname='news_scripts_select_all') THEN
    CREATE POLICY news_scripts_select_all ON public.news_scripts
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- El job pg_cron ('guionizar_pendientes') y su secreto en cron_config viven en su propia
-- migración: supabase/migrations/20261030000001_cron_guionizar_pendientes.sql (se aplica
-- DESPUÉS del deploy, con scripts/apply-cron-guionizar-pendientes-pg.ts). Esta migración es
-- solo la tabla.
