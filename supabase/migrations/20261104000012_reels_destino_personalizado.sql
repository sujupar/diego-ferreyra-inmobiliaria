-- Comentarios "personalizados" desde Publicaciones: un video que no es de una propiedad
-- también responde y manda el privado, con un botón que lleva al enlace que se elija
-- (WhatsApp, una landing de tasación, lo que sea). Ese reel no tiene propiedad.
--
-- Lo existente no cambia: todos los reels de hoy tienen propiedad y siguen llevando a su landing.

ALTER TABLE public.property_reels ALTER COLUMN property_id DROP NOT NULL;
ALTER TABLE public.property_reels ADD COLUMN IF NOT EXISTS enlace_destino text NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_reels_enlace_destino_check') THEN
    -- Solo https y de largo razonable: el enlace va dentro de un botón de un mensaje a un cliente.
    ALTER TABLE public.property_reels ADD CONSTRAINT property_reels_enlace_destino_check
      CHECK (enlace_destino IS NULL OR (enlace_destino ~ '^https://[^\s]+$' AND char_length(enlace_destino) <= 500));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'property_reels_propiedad_o_destino_check') THEN
    -- Sin propiedad y sin enlace, el privado no tendría adónde llevar.
    ALTER TABLE public.property_reels ADD CONSTRAINT property_reels_propiedad_o_destino_check
      CHECK (property_id IS NOT NULL OR enlace_destino IS NOT NULL);
  END IF;
END $$;
