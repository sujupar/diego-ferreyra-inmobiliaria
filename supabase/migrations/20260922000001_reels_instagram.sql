-- =============================================================================
-- Reels de Instagram por propiedad — tablas, RLS e interruptores
-- =============================================================================
-- Spec: docs/superpowers/specs/2026-09-22-reels-instagram-design.md
--
-- Tres tablas:
--   property_reels     — el reel (subido o enganchado) y su configuración
--   reel_comentarios   — cada comentario visto, y qué se hizo con él
--   instagram_ajustes  — los dos interruptores globales, APAGADOS de fábrica
--
-- Decisiones que NO se pueden cambiar sin romper algo:
--
--  * `created_by` va ON DELETE SET NULL. Regla del repo: con el default
--    (NO ACTION) borrar un usuario desde Supabase Auth falla con "Database
--    error deleting user", porque el borrado cascadea a profiles y choca acá.
--
--  * `ig_media_id` es UNIQUE. Es por donde el webhook encuentra el reel, y
--    además impide enganchar dos veces el mismo aviso de Instagram.
--
--  * `ig_comment_id` es UNIQUE. Meta REINTENTA sus avisos cuando no recibe un
--    200 a tiempo. Sin esta restricción, un reintento haría que la misma
--    persona reciba dos respuestas y dos mensajes privados.
--
--  * Las políticas de RLS copian las de `property_landings` (20260723000002):
--    operaciones POR UN LADO y el asesor asignado a esa propiedad POR OTRO. Con
--    solo `is_operations_user()` (admin/dueño/coordinador) un asesor no vería
--    ni sus propios reels.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.property_reels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  -- 'subido' = el archivo lo cargó el asesor; 'existente' = se enganchó un reel
  -- que ya estaba publicado en Instagram.
  origen text NOT NULL CHECK (origen IN ('subido', 'existente')),
  video_url text,

  descripcion text NOT NULL DEFAULT '',
  palabra_clave text,

  -- Textos del mensaje privado, POR REEL (decisión del dueño, 2026-09-22):
  -- quiso poder escribirlos distinto en cada uno, no una plantilla única.
  dm_texto text,
  dm_boton text NOT NULL DEFAULT 'Sí, pasámela',
  dm_seguimiento text,

  estado text NOT NULL DEFAULT 'borrador'
    CHECK (estado IN ('borrador', 'programado', 'procesando', 'publicado', 'fallido')),
  programado_para timestamptz,

  ig_creation_id text,
  ig_media_id text UNIQUE,
  ig_permalink text,
  publicado_en timestamptz,
  ultimo_error text,

  automatizacion_activa boolean NOT NULL DEFAULT false,
  -- Desde cuándo se automatiza. Un comentario ANTERIOR a esta marca no se toca:
  -- enganchar un reel viejo no puede escribirle a quien comentó hace días
  -- esperando otra cosa (Instagram lo leería como spam).
  automatizacion_desde timestamptz,
  -- Modo simulacro: registra lo que HABRÍA hecho, sin llamar a Instagram.
  -- Nace prendido a propósito.
  simulacro boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS property_reels_property_idx
  ON public.property_reels(property_id);

-- El cron busca exactamente esto cada 5 minutos.
CREATE INDEX IF NOT EXISTS property_reels_pendientes_idx
  ON public.property_reels(estado, programado_para)
  WHERE estado IN ('programado', 'procesando');

CREATE TABLE IF NOT EXISTS public.reel_comentarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reel_id uuid NOT NULL REFERENCES public.property_reels(id) ON DELETE CASCADE,

  ig_comment_id text NOT NULL UNIQUE,
  ig_user_id text NOT NULL,
  username text,
  texto text,

  coincide boolean NOT NULL DEFAULT false,
  -- Por qué NO se hizo nada. Se escribe SIEMPRE que se ignora: un cron o un
  -- webhook que decide no actuar tiene que dejar el motivo, o el día que algo
  -- falle no hay forma de distinguir "no correspondía" de "se rompió".
  motivo_ignorado text,

  respondido_en timestamptz,
  dm_enviado_en timestamptz,
  boton_tocado_en timestamptz,
  enlace_enviado_en timestamptz,
  error text,
  simulado boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now()
);

-- Un privado por persona y por reel: esta es la consulta que lo comprueba.
CREATE INDEX IF NOT EXISTS reel_comentarios_persona_idx
  ON public.reel_comentarios(reel_id, ig_user_id);

CREATE TABLE IF NOT EXISTS public.instagram_ajustes (
  id text PRIMARY KEY DEFAULT 'default',
  -- El interruptor madre. Apagado, ningún comentario dispara nada.
  automatizacion_habilitada boolean NOT NULL DEFAULT false,
  -- Los mensajes privados. Apagado hasta que Meta destrabe pages_messaging.
  dm_habilitado boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.instagram_ajustes (id) VALUES ('default')
  ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.property_reels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reel_comentarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.instagram_ajustes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reels_ops_all ON public.property_reels;
CREATE POLICY reels_ops_all ON public.property_reels
  FOR ALL TO authenticated
  USING (public.is_operations_user())
  WITH CHECK (public.is_operations_user());

DROP POLICY IF EXISTS reels_asesor_own ON public.property_reels;
CREATE POLICY reels_asesor_own ON public.property_reels
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_id AND p.assigned_to = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_id AND p.assigned_to = auth.uid()));

DROP POLICY IF EXISTS reel_comentarios_ops ON public.reel_comentarios;
CREATE POLICY reel_comentarios_ops ON public.reel_comentarios
  FOR ALL TO authenticated
  USING (public.is_operations_user())
  WITH CHECK (public.is_operations_user());

DROP POLICY IF EXISTS reel_comentarios_asesor ON public.reel_comentarios;
CREATE POLICY reel_comentarios_asesor ON public.reel_comentarios
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.property_reels r
    JOIN public.properties p ON p.id = r.property_id
    WHERE r.id = reel_id AND p.assigned_to = auth.uid()))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.property_reels r
    JOIN public.properties p ON p.id = r.property_id
    WHERE r.id = reel_id AND p.assigned_to = auth.uid()));

-- Los interruptores globales los toca solo operaciones: son el freno que
-- decide si el sistema le habla o no a clientes reales.
DROP POLICY IF EXISTS instagram_ajustes_ops ON public.instagram_ajustes;
CREATE POLICY instagram_ajustes_ops ON public.instagram_ajustes
  FOR ALL TO authenticated
  USING (public.is_operations_user())
  WITH CHECK (public.is_operations_user());

-- =============================================================================
-- VERIFICACIÓN (la corre scripts/apply-reels-instagram-pg.ts y aborta si falla)
--   SELECT relname, relrowsecurity FROM pg_class
--     WHERE relname IN ('property_reels','reel_comentarios','instagram_ajustes');
--   SELECT * FROM instagram_ajustes;
-- =============================================================================
