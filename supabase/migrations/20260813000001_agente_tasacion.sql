-- Agente de WhatsApp que atiende a quien pidió una TASACIÓN por la landing.
-- Aditiva. Correr en el SQL Editor del Dashboard.
--
-- Es el guion que sigue al primer mensaje (plantilla `tasacion_coordinar_util`):
-- canal → día y hora → dirección → cierre. NO agenda nada: junta los datos y le
-- dice al cliente que un asesor lo contacta para confirmar la visita.

-- =====================================================================
-- 1) Dónde vive la conversación. En el TRATO, no en una tabla nueva ni en
--    `conversation_ai_state`: ese estado es del agente de propiedades y
--    mezclarlos ataría dos guiones que no tienen nada que ver. Acá el estado
--    es del lead de tasación, y muere con él.
-- =====================================================================
alter table public.deals
  add column if not exists tasacion_wa_state jsonb;

comment on column public.deals.tasacion_wa_state is
  'Guion del agente de tasación por WhatsApp: {paso, canal, diaHora, direccion}. '
  'paso: esperando_canal | esperando_dia_hora | esperando_direccion | cerrado | derivado.';

-- =====================================================================
-- 2) El interruptor. Arranca APAGADO y es SEPARADO del agente de propiedades:
--    prender uno no puede prender el otro por accidente. Fail-closed en el
--    código: si esta columna no se puede leer, el agente no escribe.
-- =====================================================================
alter table public.ai_agent_settings
  add column if not exists tasacion_enabled boolean not null default false;

comment on column public.ai_agent_settings.tasacion_enabled is
  'Interruptor del agente de tasación por WhatsApp. Default false: se prende a mano '
  'después de probarlo con un número propio.';

-- Para prenderlo (después de la prueba):
--   update ai_agent_settings set tasacion_enabled = true;
