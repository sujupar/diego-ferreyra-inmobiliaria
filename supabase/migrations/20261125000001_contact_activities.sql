-- crm-ficha-y-llamadas (design.md D1): registro de notas, llamadas y WhatsApp de un
-- contacto, y dos columnas opcionales en `tasks` para saber qué tarea creó o cerró la
-- cadencia de llamadas.
--
-- `tasks` es camino crítico de toda la plataforma: acá solo se le AGREGAN dos columnas
-- opcionales y cuatro índices. No se toca ningún CHECK, índice existente ni policy.
--
-- Idempotente: se puede correr dos veces seguidas sin error, y la segunda vez vuelve a
-- dejar los CHECK y la policy como dice este archivo. Lo aplica y verifica
-- `scripts/apply-contact-activities-pg.ts`, que re-ejecuta el archivo ENTERO: cualquier
-- arreglo posterior de un CHECK o de la policy se hace TAMBIÉN acá, no solo en una
-- migración nueva (si no, volver a correr el script revierte el arreglo en silencio).

CREATE TABLE IF NOT EXISTS public.contact_activities (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  deal_id       uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  kind          text NOT NULL,
  call_outcome  text,
  body          text,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  callback_at   timestamptz,                -- día y hora pedidos en "volver a llamar"
  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz,                -- solo notas editadas
  voided_at     timestamptz,
  voided_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_token  uuid,                       -- anti doble guardado
  automatic     boolean NOT NULL DEFAULT false   -- nota escrita por el sistema (D4, `/cliente`)
);

-- Por si alguna vez se aplicó una versión anterior de este archivo sin la columna: el
-- CREATE TABLE IF NOT EXISTS no la agregaría nunca.
ALTER TABLE public.contact_activities
  ADD COLUMN IF NOT EXISTS automatic boolean NOT NULL DEFAULT false;

-- Los 8 CHECK van aparte, cada uno con DROP + ADD (como en 20260806000001): dentro de
-- un CREATE TABLE IF NOT EXISTS no se actualizarían al volver a correr el archivo.
-- No hay CHECK que ate `voided_at` con `voided_by`: al borrar un usuario, `voided_by`
-- pasa a NULL (FK con SET NULL) y ese CHECK haría fallar el borrado.
ALTER TABLE public.contact_activities DROP CONSTRAINT IF EXISTS contact_activities_kind_check;
ALTER TABLE public.contact_activities ADD CONSTRAINT contact_activities_kind_check
  CHECK (kind IN ('note','call','whatsapp_sent'));
ALTER TABLE public.contact_activities DROP CONSTRAINT IF EXISTS contact_activities_outcome_check;
ALTER TABLE public.contact_activities ADD CONSTRAINT contact_activities_outcome_check
  CHECK (call_outcome IS NULL OR call_outcome IN
    ('no_atendio','agendo','volver_a_llamar','no_interesa','numero_equivocado'));
ALTER TABLE public.contact_activities DROP CONSTRAINT IF EXISTS contact_activities_outcome_solo_llamadas_check;
ALTER TABLE public.contact_activities ADD CONSTRAINT contact_activities_outcome_solo_llamadas_check
  CHECK ((kind = 'call') = (call_outcome IS NOT NULL));
ALTER TABLE public.contact_activities DROP CONSTRAINT IF EXISTS contact_activities_nota_con_texto_check;
ALTER TABLE public.contact_activities ADD CONSTRAINT contact_activities_nota_con_texto_check
  CHECK (kind <> 'note' OR (body IS NOT NULL AND char_length(btrim(body)) > 0));
ALTER TABLE public.contact_activities DROP CONSTRAINT IF EXISTS contact_activities_body_largo_check;
ALTER TABLE public.contact_activities ADD CONSTRAINT contact_activities_body_largo_check
  CHECK (body IS NULL OR char_length(body) <= 2000);
-- 5 minutos de margen: con la hora corregida, `occurred_at` lo calcula el servidor de la
-- app y `created_at` la base; sin margen, un desfase de relojes rechazaría guardados válidos.
ALTER TABLE public.contact_activities DROP CONSTRAINT IF EXISTS contact_activities_ocurrio_check;
ALTER TABLE public.contact_activities ADD CONSTRAINT contact_activities_ocurrio_check
  CHECK (occurred_at <= created_at + interval '5 minutes'
     AND occurred_at >= created_at - interval '7 days 5 minutes');
ALTER TABLE public.contact_activities DROP CONSTRAINT IF EXISTS contact_activities_editada_solo_nota_check;
ALTER TABLE public.contact_activities ADD CONSTRAINT contact_activities_editada_solo_nota_check
  CHECK (updated_at IS NULL OR kind = 'note');
ALTER TABLE public.contact_activities DROP CONSTRAINT IF EXISTS contact_activities_callback_check;
ALTER TABLE public.contact_activities ADD CONSTRAINT contact_activities_callback_check
  CHECK ((call_outcome IS NOT DISTINCT FROM 'volver_a_llamar') = (callback_at IS NOT NULL));

CREATE INDEX IF NOT EXISTS idx_contact_activities_contacto
  ON public.contact_activities (contact_id, occurred_at DESC) WHERE voided_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_contact_activities_intentos
  ON public.contact_activities (deal_id, occurred_at)
  WHERE voided_at IS NULL AND kind IN ('call','whatsapp_sent');
CREATE UNIQUE INDEX IF NOT EXISTS uq_contact_activities_client_token
  ON public.contact_activities (client_token) WHERE client_token IS NOT NULL;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS source_activity_id uuid
    REFERENCES public.contact_activities(id) ON DELETE SET NULL;      -- la creó la cadencia
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS closed_by_activity_id uuid
    REFERENCES public.contact_activities(id) ON DELETE SET NULL;      -- la cerró la cadencia

-- El índice único impide duplicar la tarea que crea la cadencia para un mismo intento.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_source_activity
  ON public.tasks (source_activity_id) WHERE source_activity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_closed_by_activity
  ON public.tasks (closed_by_activity_id) WHERE closed_by_activity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_deal_pendientes
  ON public.tasks (deal_id) WHERE status = 'pending' AND deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_contact_pendientes
  ON public.tasks (contact_id) WHERE status = 'pending' AND contact_id IS NOT NULL;

-- RLS: SOLO LECTURA. Toda escritura pasa por las rutas, con service role. Con sesión
-- propia (la clave pública está en el navegador) nadie inserta, cambia ni borra: así el
-- resultado de una llamada no se modifica y la cadencia no se saltea con un insert directo.
ALTER TABLE public.contact_activities ENABLE ROW LEVEL SECURITY;

-- Por si una versión anterior de este archivo llegó a crearlas:
DROP POLICY IF EXISTS contact_activities_insert ON public.contact_activities;
DROP POLICY IF EXISTS contact_activities_update ON public.contact_activities;

-- Lista EXPLÍCITA de roles: operaciones lee todo; `asesor` lee si el contacto, un proceso
-- o una tasación de ese contacto es suyo; cualquier otro rol (abogado, agent, viewer, uno
-- nuevo o un usuario sin perfil) no lee nada aunque tenga un vínculo. `get_my_role()`
-- devuelve `app_role`: se compara como texto para no depender de los valores del tipo.
DROP POLICY IF EXISTS contact_activities_select ON public.contact_activities;
CREATE POLICY contact_activities_select ON public.contact_activities
  FOR SELECT TO authenticated
  USING (
    public.is_operations_user()                       -- admin, dueño, coordinador
    OR (
      public.get_my_role()::text = 'asesor'           -- lista explícita: cualquier otro rol, nada
      AND (
        EXISTS (SELECT 1 FROM public.contacts c
                WHERE c.id = contact_activities.contact_id
                  AND (c.assigned_to = auth.uid() OR c.created_by = auth.uid()))
        OR EXISTS (SELECT 1 FROM public.deals d
                   WHERE d.contact_id = contact_activities.contact_id
                     AND d.assigned_to = auth.uid())
        OR EXISTS (SELECT 1 FROM public.appraisals a
                   WHERE a.contact_id = contact_activities.contact_id
                     AND (a.assigned_to = auth.uid() OR a.user_id = auth.uid()))
      )
    )
  );
-- Sin policy de INSERT, UPDATE ni DELETE: con sesión propia no se escribe.
