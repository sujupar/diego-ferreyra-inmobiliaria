# Design

## Context

Motivo y alcance: `proposal.md`. Lo visual está aprobado en
`../archive/2026-11-25-crm-sistema-diseno/maqueta/`: `pantallas/tareas.{html,js,css}`
(Pendientes, "Nueva tarea", "Posponer", panel de la campanita), `base.js` (`fmt.vencimiento`,
`TIPOS_TAREA`, `yaVencio`, `avisos`) y las capturas `campanita-*`, `tareas-*`. Las specs
vigentes de `crm-sistema-diseno` ("Campanita", "Página de pendientes", textos de vencimiento,
"Un solo formulario de nueva tarea") mandan sobre la forma; las de este change, sobre el
comportamiento.

Estado verificado (código de `main` y base de producción, solo lectura, 2026-11-27):

- **Datos:** 638 pendientes; 628 sin fecha (597 de la coordinación, ~300 cada una), 10 con
  fecha, 2 con hora. Tipos: `update_contact` 519, `informe_quincenal` 72, `new_assignment`
  25, `follow_up` 10, `complete_imported_property` 10, `review_property` 2. 628 sin `channel`.
  El dueño tiene 9 vencidas de antes (no deben sonar).
- **`getMyTasks`** (`lib/supabase/tasks.ts:125`) esconde las futuras y corta en 50 sin total;
  lo usan `/tasks` e Inicio (`TOPE_PENDIENTES`). `GET /api/tasks` siempre filtra por un
  `assigned_to` (`resolverAlcanceAsignado`). No hay "todo el equipo".
- **`PUT /api/tasks/[id]`** solo `complete`/`dismiss`, con control de dueño (`pipeline.view_all`
  o asignado). No hay reabrir ni posponer.
- **`POST /api/tasks`** y `AddTaskDialog` calculan "hoy" en UTC (`route.ts:50`,
  `AddTaskDialog.tsx:26-28`); `validate-task-input` exige fecha y acepta 200 caracteres.
  `AddTaskDialog` ofrece "Email", "Todo el día" marcado y una "Nota"; lo usan `/tasks`, la ficha
  (`LateralTareas`), `pipeline/[id]`, `properties/[id]` y `appraisals/[id]`.
- **Barra superior:** `components/dashboard/Topbar.tsx` recibe `children`; el layout
  (`app/(dashboard)/layout.tsx:120`) monta `BotonNuevo` y `UserMenu`. Sin campanita.
- **Regla de vencimiento existente:** `vencimientoDeTarea` (`lib/crm/tareas-ficha.ts:50`): con
  hora vence a esa hora; con fecha sola, al día siguiente. `textoVencimiento`
  (`lib/crm/formato-fecha.ts:89`) ya arma los textos de la maqueta, incluido "Espera hace".
  `horario-laboral.ts` tiene `enArgentina`, `instanteDesdeAR`, `esDiaHabil`,
  `siguienteDiaHabil`.
- **Tarea de entrada del lead:** `tareaDeCoordinacion` (`lib/funnel/side-effect-handlers.ts:42`)
  la crea con `createTaskForRole('coordinador', …)` sin fecha, desde el worker del embudo.
- **Columnas:** `due_date date`, `due_time time`, `all_day boolean default true`, `channel`
  (CHECK `call|email|message|visit|document|other`). Índice `idx_tasks_due_date
  (assigned_to, due_date) WHERE pending`: alcanza, sin migración.

## Goals / Non-Goals

**Goals:** reglas (grupo, tipo, cuándo suena, posponer, vencimiento de la entrada) en un
módulo puro con tests; lecturas exactas sin techo oculto; la maqueta aprobada dentro del
layout real; hora de Argentina en todo.

**Non-Goals:** push, WhatsApp o email; limpiar las tareas viejas; recurrentes; calendario;
el Inicio (sigue con `GET /api/tasks` sin cambios hasta `crm-inicio`); los pendientes de la
ficha que la propuesta lista y no son de tareas (borrar contactos, permisos de procesos).

## Decisions

### D1. Módulo puro `lib/tareas/agenda.ts`

- `tipoDeTarea(t)`: `channel` call→`llamada`, message→`mensaje`, visit→`visita`,
  document→`documentacion`, other/email→`otro`; sin canal por `type`: `update_contact`→
  `llamada`, `new_assignment`→`visita`, `review_property`/`rejected_docs`/
  `complete_imported_property`/`informe_quincenal`→`documentacion`, el resto→`otro`.
  `TIPOS = ['llamada','mensaje','visita','documentacion','otro']` con texto e ícono.
- `grupoDeTarea(t, ahora)`: `sin_fecha` | `vencidas` | `hoy` | `proximas`, con
  `vencimientoDeTarea` (no se duplica la regla).
- `momentoDeAviso(t)`: instante desde el que suena: su hora, o las 9:00 de su día si es de
  todo el día; `null` sin fecha.
- `estadoDeAviso(t, ahora, corte)`: `vencida` | `ahora` | `null`. `null` si no tiene fecha,
  si `momentoDeAviso < corte` o si todavía no llegó.
- `INICIO_AVISOS`: el instante de publicación del change (constante, se fija al mergear).
- `enUnaHora(ahora)`: ahora + 60 min, redondeado hacia arriba a 5 min, en día y hora de
  Argentina. `mananaALas9(ahora)`: día de calendario siguiente a las 09:00.
- `validarMomento(fecha, hora, ahora)`: error si es anterior a ahora.
- `vencimientoDeEntrada(registro)`: el registro si `esDiaHabil` y entre 9:00 y 18:00 de
  Argentina; si no, `siguienteDiaHabil` (verificar que devuelva las 9:00 del próximo hábil).
- `esperaDesde(t)`: para la tarea de entrada (`update_contact` con proceso) cuyo vencimiento
  coincide con su creación (±5 min), el texto es "Espera hace…" desde el vencimiento.
- `resumen(grupos)`: "3 vencidas · 2 para hoy · 1 próxima · 625 sin fecha" / "Nada pendiente".

### D2. Lecturas `lib/supabase/agenda-tareas.ts`

- `leerAgenda({ asignados: string[] | 'todos', tipo, sinFechaDesde })`: lee TODAS las
  pendientes de la selección con las columnas de la fila (paginando de a 1000 con `range`,
  hasta 5000; más es error explícito, nunca truncar en silencio), resuelve nombres de
  contacto y asignado, y arma en memoria: grupos con fecha completos, `sinFecha` (orden
  `created_at` desc, 25 desde `sinFechaDesde`, `total`, `quedan`), `porTipo` (cantidades
  antes del filtro de tipo) y `resumen` (después del filtro). Medido: ~640 filas en el
  peor caso ("Todo el equipo").
- `leerAvisos(usuarioId, ahora)`: pendientes de esa persona con fecha (pocas), separadas en
  `vencidas`, `ahora` y `lo_que_viene` (3), más `total`.
- Enlace de cada tarea: `getTaskLink` sale de `app/(dashboard)/tasks/page.tsx` a
  `lib/tareas/enlace.ts` (puro) sin cambiar su regla.

### D3. Rutas

- `GET /api/tasks/agenda?de=mias|todos|<uuid>&tipo=&sin_fecha_desde=`: con
  `pipeline.view_all` respeta `de`; sin permiso, siempre las propias (no 403: la pantalla del
  asesor no ofrece el filtro). `de=<uuid>` de alguien inactivo o inexistente → lista vacía.
- `GET /api/tasks/avisos`: solo las propias.
- `PUT /api/tasks/[id]` suma `reopen` (solo `completed` → 409 si no; limpia `completed_at`,
  `completed_by`, `closed_by_activity_id`; 23505 de los índices de pendientes únicos → 409
  "Ya hay otra tarea igual pendiente") y `posponer {due_date, due_time}` (valida con
  `validarMomento`, pone `all_day=false`). Mismo control de dueño. `dismiss` queda en la API
  (sin botón). Responde la tarea anterior para el "Deshacer" del posponer.
- `POST /api/tasks`: "hoy" en Argentina; `due_date` opcional (sin fecha → `all_day=true`,
  `due_time=null`); título hasta 120.
- `GET /api/tasks` y `getMyTasks` no cambian (los usa el Inicio).

### D4. La tarea de entrada nace con fecha

`tareaDeCoordinacion` calcula `vencimientoDeEntrada` con la fecha de registro del payload
si viene (`registradoEn`; se agrega donde se encola el trabajo) o, si no, el momento en que
corre, y pasa `due_date`, `due_time`, `all_day:false`, `channel:'call'`. Las dos copias de la
coordinación vencen igual. Los demás creadores del sistema no cambian.

### D5. Pantalla (`components/tareas/`)

- `Campanita` (cliente) entra en el layout como `children` de la barra, antes de `UserMenu`:
  número con "99+", `aria-label` de la maqueta, lee `/api/tasks/avisos` al montar, cada 60 s
  con la pestaña visible, en `visibilitychange` y al evento `tareas:cambio` (lo emiten todas
  las mutaciones). Un fallo conserva el último número.
- `PanelAvisos`: panel de 24rem anclado bajo la barra desde 768 px, hoja completa en celular
  (primitivas de `crm-sistema-diseno` ya usadas en la ficha).
- `HojaPosponer`: global, se apila sobre el panel.
- `NuevaTarea`: el formulario de la maqueta. `AddTaskDialog` pasa a envolverlo con la misma
  firma, así sus cinco consumidores no cambian.
- `/tasks` se reescribe con la maqueta: cabecera "Mis pendientes" / "Pendientes del equipo" /
  "Pendientes de X", resumen, filtros (chips con cantidad desde 768 px; dos selectores en
  celular), grupos, "Sin fecha" plegado con nota y "Mostrar 25 más", fila con casilla
  redonda, vencimiento, contacto, asignado (si no son "Mías") y "Posponer"/"Poner fecha".
  Se conservan arriba el cartel de visitas atrasadas y el de usuario sin identificar.
- Completar con "Deshacer" también en la ficha (`LateralTareas`).

### D6. Pruebas

Tests primero en `lib/tareas/*.test.ts`, `lib/supabase/agenda-tareas.test.ts` (base
simulada de la cartera), rutas (`agenda`, `avisos`, `PUT` con `reopen`/`posponer`, `POST`
con fecha de Argentina y sin fecha), `tareaDeCoordinacion`, y componentes (`Campanita`,
`PanelAvisos`, `HojaPosponer`, `NuevaTarea`, página). Se suman a `vitest.crm.config.ts` y
`tsconfig.crm.json`.

## Diferencias con lo aprobado

1. Se conservan en Pendientes el cartel de visitas atrasadas y el de usuario sin identificar
   (la maqueta no los tiene; son avisos que ya existen y sirven).
2. Las tareas con canal "Email" (viejas) se muestran como "Otro"; el formulario ya no lo ofrece.
3. "Descartar" queda solo en la API, sin botón.
4. Pendientes, la ficha, el proceso, la propiedad y la tasación crean con el mismo
   formulario; el Inicio no crea tareas (como la maqueta).

## Risks / Trade-offs

- **Lectura de "Todo el equipo":** ~640 filas por pedido. Se mide en el QA.
- **Sondeo:** 1 pedido por minuto por pestaña visible; con 8 personas es despreciable.
- **Corte de avisos:** lo vencido antes de publicar no suena; si alguien lo pospone, sí.
- **Hora de las dos copias de la entrada:** las dos coordinadoras ven el mismo aviso; al
  completarse una, la otra sigue (regla de copias de `crm-cartera-por-rol`, sin cambios).

## Migration Plan

Sin migración. Deploy; después, verificar en producción la campanita con una tarea `[TEST]`.

## Open Questions

Las cuatro recomendaciones de `proposal.md` se aplican mientras el dueño responde.
