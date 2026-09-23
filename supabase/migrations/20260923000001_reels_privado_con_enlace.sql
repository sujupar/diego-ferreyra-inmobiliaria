-- =============================================================================
-- Reels: el privado lleva el enlace a la landing (2026-09-23)
-- =============================================================================
-- Con el acceso ESTÁNDAR de la app, Meta deja mandar el privado que responde a
-- un comentario, pero no avisa cuando la persona toca un botón de respuesta ni
-- deja escribirle un segundo mensaje. El enlace tiene que ir en el PRIMER
-- privado: un botón "Ver la propiedad" que abre la landing.
--
-- Cambian los textos de fábrica del privado (lib/social/reels/textos-por-defecto.ts;
-- una prueba compara los dos lados) y se actualizan los reels que tenían los
-- viejos SIN tocar lo que un asesor haya escrito a mano.
--
-- Topes en la base, igual que la ruta: el privado hasta 640 (lo que admite un
-- mensaje con botón) y el botón hasta 20 (Instagram rechaza el mensaje entero).
--
-- Idempotente. Se aplica con scripts/apply-reels-privado-con-enlace-pg.ts.
-- =============================================================================

ALTER TABLE public.property_reels ALTER COLUMN dm_boton SET DEFAULT 'Ver la propiedad';

UPDATE public.property_reels SET dm_boton = 'Ver la propiedad' WHERE dm_boton = 'Sí, pasámela';

UPDATE public.property_reels
   SET dm_texto = '¡Hola! Gracias por comentar 🙌 Te dejo la ficha completa de la propiedad, con fotos y todos los detalles 👇'
 WHERE dm_texto = 'Hola! Vi que comentaste en el reel. Te armé la ficha completa de la propiedad, con fotos y todos los detalles. ¿Te la paso?';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.property_reels'::regclass AND conname = 'property_reels_privado_largo') THEN
    ALTER TABLE public.property_reels
      ADD CONSTRAINT property_reels_privado_largo
      CHECK ((dm_texto IS NULL OR char_length(dm_texto) <= 640) AND char_length(dm_boton) BETWEEN 1 AND 20);
  END IF;
END $$;
