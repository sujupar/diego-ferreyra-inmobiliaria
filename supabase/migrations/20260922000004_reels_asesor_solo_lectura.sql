-- =============================================================================
-- Reels: el asesor LEE sus reels, no los escribe directo; y tope a las palabras
-- =============================================================================
-- Hallazgo de la revisión de seguridad (2026-09-22): las políticas del asesor
-- eran FOR ALL. Con su sesión y la clave pública, un asesor podía escribir por
-- la API REST de Supabase sin pasar por la plataforma y saltearse todas sus
-- reglas: apagar el simulacro o activar un reel sin landing, apuntar un reel a
-- otra publicación de la cuenta, o borrar la marca del privado para que la misma
-- persona reciba otro. El único freno que quedaba era el interruptor global.
--
-- Ninguna pantalla escribe estas tablas directo: TODAS las escrituras pasan por
-- las rutas del servidor con la clave de servicio (servicio.ts, procesador.ts,
-- publicador.ts; verificado con grep). Así que el asesor queda en SOLO LECTURA
-- sin romper nada. Operaciones (admin, dueño, coordinador) sigue igual.
--
-- Además, la base pone su propio tope a la lista de palabras (200 caracteres,
-- el mismo de la ruta): una lista enorme escrita por otro camino se vuelve a
-- partir en CADA comentario y puede hacer que el aviso de Meta se pase de tiempo.
--
-- OJO: 20260922000001 se corrigió también (sus políticas ahora son FOR SELECT),
-- porque los scripts de verificación re-ejecutan ese archivo entero y, si no,
-- "verificar" revertiría esto en silencio. Es la trampa que ya mordió con la
-- RLS de conversation_ai_state (ver CLAUDE.md).
--
-- Idempotente. Se aplica con scripts/apply-reels-asesor-solo-lectura-pg.ts.
-- =============================================================================

DROP POLICY IF EXISTS reels_asesor_own ON public.property_reels;
CREATE POLICY reels_asesor_own ON public.property_reels
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = property_id AND p.assigned_to = auth.uid()));

DROP POLICY IF EXISTS reel_comentarios_asesor ON public.reel_comentarios;
CREATE POLICY reel_comentarios_asesor ON public.reel_comentarios
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.property_reels r
    JOIN public.properties p ON p.id = r.property_id
    WHERE r.id = reel_id AND p.assigned_to = auth.uid()));

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.property_reels'::regclass
      AND conname = 'property_reels_palabra_clave_largo'
  ) THEN
    ALTER TABLE public.property_reels
      ADD CONSTRAINT property_reels_palabra_clave_largo
      CHECK (palabra_clave IS NULL OR char_length(palabra_clave) <= 200);
  END IF;
END $$;
