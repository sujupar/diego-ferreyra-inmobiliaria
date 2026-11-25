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
- **Queda afuera:** avisos al celular (push, WhatsApp, email), limpieza de las 625 tareas
  viejas sin fecha, tareas recurrentes, calendario.

Roles: cada usuario ve y recibe avisos de sus tareas; admin, dueño y coordinador pueden ver
y asignar tareas de otros.

## Capabilities

### New Capabilities
- `tareas`: crear, listar por vencimiento, completar y posponer tareas.
- `tareas-avisos`: cuándo una tarea avisa en la campanita y qué se puede hacer desde ahí.

### Modified Capabilities

Ninguna.

## Impact

- Código: `components/dashboard/Topbar.tsx`, `app/(dashboard)/tasks`, `app/api/tasks`
  (ruta nueva de vencidas y paginado), `lib/supabase/tasks.ts`, `components/tasks/`.
- `app/(dashboard)/inicio` hoy depende del techo de 50: se ajusta en `crm-inicio`.
- Sin migración, salvo índice por (assigned_to, status, due_date) si la lectura lo pide.
- Depende de `crm-sistema-diseno`; independiente de la ficha.
