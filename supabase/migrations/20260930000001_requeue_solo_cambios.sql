-- Re-encolar listings SOLO por precio, fotos y expensas, anotando QUÉ cambió
-- (metadata.cambios_ficha). Antes cualquier cambio de título/descripción/fotos/…
-- reenviaba la ficha entera y pisaba lo corregido a mano en los portales.
-- APLICAR DESPUÉS de deployar el worker nuevo (con el viejo, reenviaría todo).
CREATE OR REPLACE FUNCTION public.requeue_listings_on_update()
RETURNS TRIGGER AS $$
DECLARE
  cambios text[] := ARRAY[]::text[];
BEGIN
  IF NEW.status = 'approved' THEN
    IF OLD.asking_price IS DISTINCT FROM NEW.asking_price THEN cambios := cambios || 'precio'::text; END IF;
    IF OLD.photos       IS DISTINCT FROM NEW.photos       THEN cambios := cambios || 'fotos'::text;  END IF;
    IF OLD.expensas     IS DISTINCT FROM NEW.expensas     THEN cambios := cambios || 'expensas'::text; END IF;

    IF array_length(cambios, 1) > 0 THEN
      UPDATE public.property_listings pl
         SET metadata = (COALESCE(pl.metadata, '{}'::jsonb) - 'actualizacion_fallida')
                        || jsonb_build_object(
                             'needs_update', true,
                             'intentos_actualizacion', 0,
                             'cambios_ficha', (
                               SELECT to_jsonb(array_agg(DISTINCT c ORDER BY c))
                                 FROM unnest(
                                   ARRAY(SELECT jsonb_array_elements_text(COALESCE(pl.metadata->'cambios_ficha', '[]'::jsonb)))
                                   || cambios
                                 ) AS c))
       WHERE pl.property_id = NEW.id AND pl.status = 'published';
    END IF;
  END IF;

  IF NEW.status IN ('sold', 'withdrawn') AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.property_listings
       SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{needs_unpublish}', 'true'::jsonb)
     WHERE property_id = NEW.id AND status = 'published';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
