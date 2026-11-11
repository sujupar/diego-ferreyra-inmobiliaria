-- Reserva de un listing mientras la plataforma sincroniza el aviso con la ficha
-- (rutas /api/properties/[id]/portales/sincronizar y /diferencias).
--
-- Por qué funciones y no un UPDATE desde la app: la app tenía que escribir la
-- metadata ENTERA (una foto leída cientos de ms antes) y podía pisar marcas que
-- el trigger de la ficha o el worker escribieron mientras tanto
-- (needs_update, cambios_ficha, needs_pause_after_active…). Acá solo se tocan
-- las dos claves de la reserva, con `||` / `-` sobre la fila actual.
--
-- Postgres re-evalúa el WHERE tras tomar el lock de la fila: de dos pedidos
-- simultáneos, uno solo obtiene la reserva.
--
-- APLICAR ANTES de deployar el código que las llama
-- (scripts/apply-reclamo-sync-pg.ts aplica y verifica dentro de BEGIN…ROLLBACK).

CREATE OR REPLACE FUNCTION public.reclamar_sync_listing(p_listing uuid, p_token text, p_limite timestamptz)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE property_listings
     SET metadata = COALESCE(metadata, '{}'::jsonb)
                    || jsonb_build_object('sync_en_curso', p_token, 'sync_en_curso_desde', now())
   WHERE id = p_listing
     AND (
       metadata->>'sync_en_curso' IS NULL
       -- Una reserva sin fecha no puede bloquear para siempre.
       OR metadata->>'sync_en_curso_desde' IS NULL
       -- Vencida: el proceso que la tomó se cortó (límite de tiempo de Netlify).
       OR (metadata->>'sync_en_curso_desde')::timestamptz < p_limite
     );
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.liberar_sync_listing(p_listing uuid, p_token text)
RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  -- Solo el dueño de la reserva la libera: si venció y la tomó otro, no se toca.
  UPDATE property_listings
     SET metadata = metadata - 'sync_en_curso' - 'sync_en_curso_desde'
   WHERE id = p_listing
     AND metadata->>'sync_en_curso' = p_token;
$$;

REVOKE ALL ON FUNCTION public.reclamar_sync_listing(uuid, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.liberar_sync_listing(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclamar_sync_listing(uuid, text, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.liberar_sync_listing(uuid, text) TO service_role;
