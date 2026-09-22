-- =============================================================================
-- Reels: cuentas de prueba
-- =============================================================================
-- Nombres de usuario de Instagram (sin @, en minúscula) a los que la
-- automatización les responde DE VERDAD aunque el reel esté en simulacro. Al
-- resto de la gente el simulacro la sigue registrando sin escribirle.
--
-- Existe para que el dueño pruebe con SU cuenta sobre un reel real que recibe
-- comentarios de clientes todos los días, sin que ninguno de ellos reciba nada.
--
-- Vacía por defecto: sin cuentas cargadas, el simulacro es simulacro para todos.
-- La regla vive en lib/social/reels/decision.ts (esCuentaDePrueba) y falla
-- cerrado: si el aviso llega sin nombre de usuario, no es cuenta de prueba.
--
-- Aditiva e idempotente. Se aplica con scripts/apply-instagram-cuentas-prueba-pg.ts.
-- =============================================================================

ALTER TABLE public.instagram_ajustes
  ADD COLUMN IF NOT EXISTS cuentas_de_prueba text[] NOT NULL DEFAULT '{}';
