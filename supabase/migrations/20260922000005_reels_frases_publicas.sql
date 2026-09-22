-- =============================================================================
-- Reels: las frases públicas del comentario, por reel y editables
-- =============================================================================
-- Hasta ahora las frases con que se responde el comentario estaban fijas en el
-- código y no se veían en ningún lado. El dueño pidió verlas y poder editarlas
-- al enganchar o subir cada reel (2026-09-22).
--
-- Son dos grupos, porque la respuesta pública depende de lo que REALMENTE pasó
-- con el privado: si salió, se avisa que lo mire; si no salió, solo se agradece
-- (prometer un mensaje que no llegó es mentirle a la persona delante de todos).
--
-- El default son las frases de fábrica de lib/social/reels/textos-por-defecto.ts
-- (una prueba compara los dos textos): los reels que ya existen las reciben
-- solas, sin reconfigurar nada.
--
-- Aditiva e idempotente. Se aplica con scripts/apply-reels-frases-pg.ts.
-- =============================================================================

ALTER TABLE public.property_reels
  ADD COLUMN IF NOT EXISTS respuestas_con_privado text[] NOT NULL DEFAULT ARRAY[
    '¡Listo! Te escribí al privado 📩',
    'Gracias por comentar 🙌 Te dejé todo en el privado',
    '¡Gracias! Te mandé la info al privado 📲'
  ]::text[],
  ADD COLUMN IF NOT EXISTS respuestas_sin_privado text[] NOT NULL DEFAULT ARRAY[
    '¡Gracias por comentar! 🙌',
    '¡Gracias por el interés! ✨',
    'Gracias por pasar 👋'
  ]::text[];

-- De 1 a 3 frases, cada una de 1 a 300 caracteres. Un CHECK no admite
-- subconsultas, así que la regla va en una función inmutable.
--
-- `cardinality` + `array_ndims = 1`, y no `array_length(frases, 1)`: esa cuenta
-- solo la primera dimensión, así que un arreglo 3x3 pasaba con 9 frases
-- (revisión de seguridad). Y `btrim` con saltos de línea y tabulaciones: una
-- frase que es solo un "\n" no es una frase.
-- `SET search_path = ''`: todo lo que usa vive en pg_catalog, que siempre se busca.
CREATE OR REPLACE FUNCTION public.reels_frases_validas(frases text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT frases IS NOT NULL
     AND array_ndims(frases) = 1
     AND cardinality(frases) BETWEEN 1 AND 3
     AND NOT EXISTS (
       SELECT 1 FROM unnest(frases) AS f
       WHERE f IS NULL OR char_length(btrim(f, E' \t\r\n')) = 0 OR char_length(f) > 300
     )
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.property_reels'::regclass AND conname = 'property_reels_frases_validas'
  ) THEN
    ALTER TABLE public.property_reels
      ADD CONSTRAINT property_reels_frases_validas
      CHECK (public.reels_frases_validas(respuestas_con_privado)
         AND public.reels_frases_validas(respuestas_sin_privado));
  END IF;
END $$;
