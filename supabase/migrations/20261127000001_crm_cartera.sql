-- crm-cartera-por-rol (design.md D2): último contacto registrado por persona, para la
-- cartera (/crm, /contacts) y la cabecera de la ficha. Solo lectura. Idempotente: la
-- aplica y verifica scripts/apply-crm-cartera-pg.ts, que re-ejecuta el archivo ENTERO
-- (un arreglo posterior se hace también acá).

-- La ficha y la cartera leen los procesos de una persona: sin índice, recorrido completo.
CREATE INDEX IF NOT EXISTS idx_deals_contact_id
  ON public.deals (contact_id) WHERE contact_id IS NOT NULL;

-- CREATE OR REPLACE: volver a correr el archivo no deja un instante sin función. Si algún
-- día cambian las columnas de salida, hace falta DROP antes (CLAUDE.md: "cambiar return type").
CREATE OR REPLACE FUNCTION public.crm_ultimos_contactos(p_contactos uuid[])
RETURNS TABLE (
  contacto_id         uuid,
  actividad_at        timestamptz,   -- última llamada o WhatsApp marcado, sin anuladas
  actividad_tipo      text,          -- 'call' | 'whatsapp_sent'
  actividad_resultado text,          -- call_outcome de esa llamada
  visita_at           timestamptz    -- última visita de tasación de cualquier proceso
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ids AS (
    SELECT DISTINCT unnest(p_contactos) AS id
  ),
  act AS (
    -- Una nota no es hablar con la persona: solo llamadas y WhatsApp marcados.
    SELECT DISTINCT ON (a.contact_id)
           a.contact_id, a.occurred_at, a.kind, a.call_outcome
      FROM public.contact_activities a
      JOIN ids ON ids.id = a.contact_id
     WHERE a.voided_at IS NULL
       AND a.kind IN ('call', 'whatsapp_sent')
     ORDER BY a.contact_id, a.occurred_at DESC, a.created_at DESC, a.id DESC
  ),
  vis AS (
    -- La misma fuente que la cabecera de la ficha (lib/crm/ultimo-contacto.ts):
    -- deals.visited_at. Si algún día se quiere usar visit_completed_at, se cambia en los
    -- dos lados juntos; si no, la ficha y la lista dirían fechas distintas de la misma persona.
    SELECT d.contact_id, max(d.visited_at) AS visita_at
      FROM public.deals d
      JOIN ids ON ids.id = d.contact_id
     WHERE d.visited_at IS NOT NULL
     GROUP BY d.contact_id
  )
  SELECT ids.id, act.occurred_at, act.kind, act.call_outcome, vis.visita_at
    FROM ids
    LEFT JOIN act ON act.contact_id = ids.id
    LEFT JOIN vis ON vis.contact_id = ids.id
   WHERE act.contact_id IS NOT NULL OR vis.contact_id IS NOT NULL;
$$;

-- Solo el servidor (service role). Con sesión propia nadie la llama: SECURITY INVOKER
-- igual aplicaría la RLS, pero no hay por qué exponerla.
REVOKE ALL ON FUNCTION public.crm_ultimos_contactos(uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_ultimos_contactos(uuid[]) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_ultimos_contactos(uuid[]) TO service_role;
