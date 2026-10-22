-- Barridos diarios del Reportero (newsjacking inmobiliario) — una fila por día,
-- con el ranking de noticias de esa corrida guardado como jsonb.
-- Correr a mano en el SQL Editor del Dashboard. Idempotente.
--
-- `items` es un array de objetos con esta forma (los campos pueden faltar si el
-- log de ese día no los traía — el parser del backfill es tolerante):
--   {
--     "rank":    int,      -- orden en el ranking del día (1 = más alto)
--     "titulo":  text,     -- titular de la noticia
--     "medio":   text,     -- fuente (Clarín, Infobae, Ámbito, …)
--     "fecha":   text,     -- fecha de la noticia tal como vino en el log
--     "impacto": int,      -- puntaje 0-100 de la rúbrica del Reportero
--     "por_que": text,     -- por qué le sirve al propietario/vendedor
--     "angulo":  text,     -- ángulo sugerido para el contenido
--     "formato": text,     -- formato sugerido (a-camara, numeros, …)
--     "url":     text      -- link al artículo real, si estaba en el log
--   }

CREATE TABLE IF NOT EXISTS public.news_scans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_date   date NOT NULL UNIQUE,
  items       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Orden natural de consulta: el día más reciente primero.
CREATE INDEX IF NOT EXISTS news_scans_scan_date_desc ON public.news_scans (scan_date DESC);

ALTER TABLE public.news_scans ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado (los barridos no son sensibles por rol,
-- mismo criterio que `neighborhoods`). Escritura: solo service_role (el motor del
-- Reportero y el backfill), que ignora RLS — por eso no hace falta política de
-- INSERT/UPDATE para `authenticated`.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='news_scans'
                 AND policyname='news_scans_select_all') THEN
    CREATE POLICY news_scans_select_all ON public.news_scans
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
