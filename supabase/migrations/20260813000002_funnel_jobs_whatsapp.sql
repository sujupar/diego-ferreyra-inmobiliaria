-- El tipo de trabajo 'whatsapp' faltaba en el CHECK de funnel_lead_jobs.
--
-- Los cinco avisos de un registro se encolan en UNA sola sentencia
-- (`insert ... select from jsonb_array_elements` dentro de
-- `completar_envio_embudo`). Un solo `kind` rechazado por el CHECK aborta la
-- sentencia entera, así que el lead se quedaba sin NADA: sin el WhatsApp, sí,
-- pero también sin el email al equipo, sin la tarea de la coordinadora, sin
-- Mailchimp y sin el evento de conversión a Meta. Y como todo eso vive dentro
-- de una función, el UPDATE del envío también se revertía: el registro quedaba
-- en 'reserved' y no contaba como conversión.
--
-- El síntoma visible era "no llega el WhatsApp", que apunta al lugar equivocado.
-- Roto el 2026-08-13 11:31 (deploy 9c667e4), detectado a las 17:49 del mismo día.
-- Un único registro afectado, ninguno de un cliente real.
--
-- `lib/funnel/jobs-check-sync.test.ts` compara esta lista contra el catálogo de
-- TypeScript en cada corrida de tests, para que no puedan volver a separarse.

ALTER TABLE public.funnel_lead_jobs
  DROP CONSTRAINT IF EXISTS funnel_lead_jobs_kind_check;

ALTER TABLE public.funnel_lead_jobs
  ADD CONSTRAINT funnel_lead_jobs_kind_check
  CHECK (kind IN ('whatsapp','coordinator_task','notify','mailchimp','anon_stitch','capi'));
