-- El precio ya NO reenvía la ficha a los portales por sí solo: el dueño pidió que
-- un cambio de precio se confirme desde el cuadro nuevo (decisión explícita), no
-- que viaje solo al guardar. Quedan solo fotos y expensas (metadata.cambios_ficha).
-- APLICAR DESPUÉS de deployar el código del cuadro (si no, nada reenvía el precio).
CREATE OR REPLACE FUNCTION public.requeue_listings_on_update()
RETURNS TRIGGER AS $$
DECLARE
  cambios text[] := ARRAY[]::text[];
BEGIN
  IF NEW.status = 'approved' THEN
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
