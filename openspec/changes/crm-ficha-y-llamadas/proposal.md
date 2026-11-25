# Proposal

## Why

Entre la solicitud de tasación y la tasación agendada no queda registro de nada: lo que
pasa en las llamadas de la coordinación solo existe en lo que ella cuenta. Sin registro no
hay tiempos, ni tasas, ni forma de mejorar ese paso.

## What Changes

- La ficha de contacto (`/contacts/[id]`) se reemplaza por la ficha aprobada en
  `crm-sistema-diseno`: persona a la izquierda, nota/llamada y actividad al centro, tareas,
  tasaciones, procesos y archivos a la derecha; pestañas en celular.
- Nota rápida sobre el contacto (editable y borrable por su autor).
- Registrar llamada con resultado: agendó, volver a llamar, no le interesa, no atendió,
  número equivocado. Marca de "WhatsApp enviado" como tercer contacto (no envía nada).
- Cadencia automática: tras no atender una vez, tarea de llamada al día hábil siguiente;
  tras dos seguidas, tarea de enviar WhatsApp; "volver a llamar" pide día y hora.
  Registrar una llamada cierra las tareas de llamada pendientes de ese proceso.
- "Días sin contacto" en la cabecera de la ficha.
- En este change la actividad del centro muestra solo notas, llamadas y WhatsApp marcado;
  el resto de los eventos llega con `crm-linea-de-tiempo`.
- **Queda afuera:** enviar WhatsApp o email, llamar desde la plataforma, cambiar la etapa
  del proceso de forma automática, feriados en el horario laboral, estadísticas.

Roles: coordinador, admin y dueño ven todos los contactos; el asesor, los suyos (asignados
o creados por él); el abogado, ninguno.

## Capabilities

### New Capabilities
- `crm-ficha-contacto`: qué muestra la ficha de un contacto y quién puede verla.
- `crm-registro-actividad`: notas, llamadas con resultado y marca de WhatsApp sobre un contacto.
- `crm-cadencia-llamadas`: qué tarea se crea o se cierra sola según el resultado de cada intento.

### Modified Capabilities

Ninguna.

## Impact

- Base: tabla nueva `contact_activities` con RLS e índices (migración antes del deploy).
- Código: `app/(dashboard)/contacts/[id]`, `app/api/contacts/[id]/activities`, `lib/crm/`,
  `components/crm/`; usa `lib/supabase/tasks.ts` para crear y cerrar tareas.
- Depende de `crm-sistema-diseno` aprobado.
