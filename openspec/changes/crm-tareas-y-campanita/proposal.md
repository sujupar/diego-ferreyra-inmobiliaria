# Proposal

## Why

Las tareas existen pero nadie se entera cuando una vence: no hay campanita, la página no
separa lo vencido de lo de hoy, y muestra como máximo 50 sin avisar que hay más. Para que
la cadencia de llamadas funcione, la tarea tiene que avisar a su hora.

## What Changes

- Campanita en la barra superior: cuenta las tareas propias con fecha (y hora, si tienen)
  ya cumplida; se actualiza sola cada minuto y al volver a la pestaña. Desde ahí se
  completa o se pospone (1 hora, mañana, elegir).
- Página de tareas reorganizada en Vencidas / Hoy / Próximas / Sin fecha (plegado), con
  filtro por tipo y, para operaciones, por persona. Total exacto y paginado, sin techo oculto.
- Crear tarea con fecha y hora desde la ficha, la página de tareas y el Inicio.
- La campanita no cuenta tareas sin fecha ni las vencidas antes de la salida de este change.
- La tarea de entrada de cada lead nuevo nace con fecha y hora (la de su registro si entra en
  horario hábil; si no, el día hábil siguiente a las 9:00), así suena en la campanita.
- Un solo formulario "Nueva tarea" (el de la maqueta) en la ficha, Pendientes y las demás
  pantallas que hoy usan `AddTaskDialog`; fechas en hora de Argentina.
- Completar ofrece "Deshacer"; "Descartar" y el filtro de completadas salen de la pantalla.

**Recomendaciones aplicadas mientras el dueño responde (2026-11-27):** 1) la tarea de
entrada nace con fecha; 2) se sigue la maqueta (sin "Descartar" ni filtro de completadas);
3) las ~600 tareas viejas sin fecha quedan en "Sin fecha" con la nota de la maqueta, sin
limpieza automática; 4) los filtros de Pendientes siguen la maqueta aprobada de esa pantalla.
- **Queda afuera:** avisos al celular (push, WhatsApp, email), limpieza de las 625 tareas
  viejas sin fecha, tareas recurrentes, calendario.

Roles: cada usuario ve y recibe avisos de sus tareas; admin, dueño y coordinador pueden ver
y asignar tareas de otros.

## Capabilities

### New Capabilities
- `tareas`: crear, listar por vencimiento, completar y posponer tareas.
- `tareas-avisos`: cuándo una tarea avisa en la campanita y qué se puede hacer desde ahí.

### Modified Capabilities

Ninguna: la anatomía de la campanita, de Pendientes y del formulario ya está en
`crm-sistema-diseno` (requisitos "Campanita", "Página de pendientes", "Un solo formulario de
nueva tarea" y los textos de vencimiento); este change la construye.

## Impact

- Código: `components/dashboard/Topbar.tsx`, `app/(dashboard)/tasks`, `app/api/tasks`
  (ruta nueva de vencidas y paginado), `lib/supabase/tasks.ts`, `components/tasks/`.
- `app/(dashboard)/inicio` hoy depende del techo de 50: se ajusta en `crm-inicio`.
- Sin migración, salvo índice por (assigned_to, status, due_date) si la lectura lo pide.
- Depende de `crm-sistema-diseno`; independiente de la ficha.

## Pendientes que deja `crm-ficha-y-llamadas`

- `POST /api/tasks` y `AddTaskDialog` siguen con las fechas en UTC: de 21 a 24 h de Argentina no
  se puede agendar una tarea para hoy. (`PUT /api/tasks/[id]` sin control de dueño y el "hoy" en
  UTC de `getMyTasks` y `/tasks` ya se corrigieron en la revisión 12.1.)
- El resto de las columnas de `tasks` se puede escribir con sesión propia por la API de la base
  (policies de `20260505000001`). `source_activity_id` y `closed_by_activity_id` ya no: las cuida
  el trigger `trg_tasks_columnas_cadencia_solo_servidor`.
- El "+ Tarea" de la ficha todavía muestra "Email" y no los cinco tipos de la spec vigente de
  `crm-sistema-diseno` (excepción temporal de la propuesta de la ficha).
- Las tareas de la cadencia quedan pendientes cuando un proceso se cierra, y las tareas de
  entrada quedan pendientes cuando se coordina sin registrar una llamada.
- `getTaskLink` ya manda las tareas de la cadencia a la ficha; el resto de sus enlaces sigue sin
  revisar. En particular: la tarea de entrada del lead (`update_contact` con proceso) todavía abre
  `/pipeline/<id>?editContact=1` y no la ficha (desde donde se registra la Llamada 1), y la
  `update_contact` ligada solo a un contacto abre la ficha con `?edit=1` (el editor encima).
- El diálogo de borrar contactos de `/contacts` no avisa que se borra también el historial de
  llamadas y notas, y las tareas de la cadencia de un contacto borrado quedan pendientes y sueltas.
- Las tareas de la cadencia de un asesor quedan en su lista cuando le reasignan el proceso que le
  daba acceso a la ficha.
- `esElMismoGuardado` no compara la hora corregida: reenviar con el mismo token y otro "hace N
  min" devuelve la fila vieja sin aviso.
- Para el change que revise los permisos de procesos: `GET /api/deals/[id]` le sigue devolviendo
  al abogado la persona completa de un proceso; y por la API directa de la base un asesor todavía
  puede cambiar el `contact_id` de un proceso suyo (o insertar un proceso, o insertar/editar una
  tasación suya) y así abrirse la ficha de un contacto ajeno: policies
  `deals_update_owner_or_ops`, `deals_insert_authenticated`, `appraisals_insert_self_or_ops` y
  `appraisals_update_owner_or_ops` de `20260505000001`.
