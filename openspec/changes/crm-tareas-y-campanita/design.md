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
- `INICIO_AVISOS`: las 00:00 de Argentina del día de publicación (se revisa al mergear).
- `enUnaHora(ahora)`: ahora + 60 min, redondeado hacia arriba a 5 min, en día y hora de
  Argentina. `mananaALas9(ahora)`: día de calendario siguiente a las 09:00.
- `validarMomento(fecha, hora, ahora)`: error si es anterior a ahora.
- `vencimientoDeEntrada(registro)`: el registro si es día hábil y entre 9:00 y 17:59; antes
  de las 9 de un día hábil, ese día a las 9; si no, `siguienteDiaHabil` (9:00 del próximo
  hábil). La cartera (`venceDePrimeraLlamada`) usa esta misma función.
- `esperaDesde(t, registradoEn)`: la tarea de entrada cuyo vencimiento coincide con el alta
  del proceso (±5 min) dice "Espera hace…". Una entrada pendiente implica que nadie llamó:
  la llamada de la coordinación la cierra y salir de Solicitud también. La cartera mantiene
  la espera cuando la tarea ya nace con fecha.
- `tipoDeTarea`: "Actualizar contacto: …" (la que deja `advance`) es Otro, no Llamada.
- `esTareaDeEntrada(t)`: `update_contact` con canal `call` y proceso.
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
  `lib/tareas/enlace.ts` (puro); la tarea de entrada nueva abre la ficha.
- `leerPersonas()`: activos, para "De quién" (incluye al abogado, que tiene tareas).
- La embebida `proceso:deal_id(created_at)` da el registro real para la espera.
- Índice: la lectura usa `idx_tasks_assigned_status (assigned_to, status, created_at)`;
  cada "Mostrar 25 más" vuelve a leer la selección entera (~640 filas hoy).

### D3. Rutas

- `GET /api/tasks/agenda?de=mias|todos|<uuid>&tipo=&sin_fecha_desde=`: con
  `pipeline.view_all` respeta `de` (el admin y el dueño arrancan en `todos`); sin permiso,
  siempre las propias (no 403: la pantalla del asesor no ofrece el filtro). `de=<uuid>` de
  alguien que no está entre los activos → lista vacía.
- `GET /api/tasks/avisos`: solo las propias.
- `PUT /api/tasks/[id]`:
  - `complete` también completa las copias hermanas de la entrada
    (`completarCopiasDeEntrada`; si falla, la pedida igual queda).
  - `reopen`: solo `completed` y sin `closed_by_activity_id` (lo que cerró una llamada se
    reabre deshaciendo la llamada); limpia `completed_at`/`completed_by`; 23505 → 409.
  - `posponer {due_date, due_time}`: `validarMomento`, solo pendientes, `all_day=false`;
    responde la fecha anterior. Con `deshacer:true` acepta la fecha anterior (vencida o
    vacía) y solo escribe si la tarea sigue con lo que se le puso (`desde_fecha`,
    `desde_hora`); si no, 409.
  - `dismiss` queda en la API (sin botón). Mismo control de dueño para todo.
- `POST /api/tasks`: "hoy" y la hora en Argentina; `due_date` opcional; hora de hoy ya
  pasada → 400; título hasta 120.
- `GET /api/tasks` y `getMyTasks` no cambian (los usa el Inicio).

### D4. La tarea de entrada nace con fecha y se cierra sola

`construirTrabajos` agrega `registradoEn` (el `eventTimeUnixSeconds` del envío) al trabajo;
`tareaDeCoordinacion` calcula `vencimientoDeEntrada` con él (o con el momento en que corre,
para trabajos viejos) y pasa `due_date`, `due_time`, `all_day:false`, `channel:'call'`.

Migración `20261127000003_tareas_entrada_se_cierran.sql` (aplicada y verificada con
`scripts/apply-tareas-entrada-pg.ts`): trigger AFTER `UPDATE OF stage, scheduled_date` en
`deals`; si el proceso era Solicitud y deja de serlo, completa sus tareas de entrada
(`update_contact` + `call` + pendiente) con el autor del cambio. Las viejas sin canal no se
tocan. Reprogramar una coordinada no hace nada. Camino inverso, SOLO en "Deshacer perdido"
(`lost` → Solicitud): reabre las que el trigger cerró (completadas desde ese cambio de
etapa, sin llamada); un choque con el índice único no reabre nada pero no tira el cambio.

La tarea de entrada de la **clase gratuita** nace sin fecha (como antes): su proceso nace en
`clase_gratuita`, nunca pasa por Solicitud y sonaría para siempre (auditoría de cierre, 1).

"Deshacer" de completar una entrada reabre también la copia cerrada en el mismo instante,
salvo que el proceso ya haya salido de Solicitud.

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
- Completar con "Deshacer" también en la ficha (`LateralTareas`), y la espera ahí.
- Evento `tareas:cambio` (la campanita lo escucha): lo emiten crear, completar, deshacer,
  posponer y poner fecha en Pendientes, el panel, la ficha (tareas y registro/anulación de
  llamadas, que crean y cierran tareas), el "Seguimiento" de `pipeline/[id]` y el tilde del Inicio.
- El "Seguimiento" de `pipeline/[id]` (otro formulario que crea tareas) pasa a "hoy" en
  Argentina, deja de ofrecer "Correo" y recorta el título a 120.

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
   formulario; el Inicio no crea tareas (como la maqueta). El "Seguimiento" del proceso
   sigue siendo su propio modal (con las fechas corregidas).
5. "En 1 hora" redondea hacia arriba de a 5 minutos (la maqueta suma una hora exacta): un
   aviso a las "11:47" no tiene sentido.
6. Texto de error del panel: "No se pudieron actualizar los avisos", con "Reintentar".
7. La tarea de entrada se cierra sola al salir de Solicitud y con su copia (decisión 5).

## Risks / Trade-offs

- **Lectura de "Todo el equipo":** ~640 filas por pedido. Se mide en el QA.
- **Sondeo:** 1 pedido por minuto por pestaña visible; con 8 personas es despreciable.
- **Corte de avisos:** lo vencido antes de publicar no suena; si alguien lo pospone, sí.
- **Copias de la entrada:** completar una completa la otra, y salir de Solicitud las cierra
  (decisión 5). Si una llamada la registra un asesor, las de la coordinación siguen (regla
  de la cadencia) hasta que el proceso sale de Solicitud.
- **El Inicio muestra otro número** que Pendientes hasta `crm-inicio`: sigue con
  `getMyTasks` (tope de 50, sin futuras); las entradas de fuera de horario no cuentan ahí
  hasta su día.
- **API directa de la base:** las policies de `tasks` (`20260505000001`) dejan crear para
  otro o posponer al pasado sin pasar por la plataforma. Pendiente conocido, como en la ficha.
- **"Ver como"** de la cartera no cambia la sesión: la campanita es siempre de quien está
  conectado (con la suplantación de `impersonate_user_id`, de la persona suplantada, como
  todo el resto).
- **Netlify:** la vista previa de este PR falló dos veces en el primer build de un commit
  nuevo y pasó al reintentar sin cambios (el build local termina bien). Si el deploy de
  producción falla, reintentar antes de buscar un error en el código.
- **"Sin fecha" expandido** vuelve a las primeras 25 cada vez que algo cambia una tarea.

## Migration Plan

Sin migración. Deploy; después, verificar en producción la campanita con una tarea `[TEST]`.

## Open Questions

Las cuatro recomendaciones de `proposal.md` se aplican mientras el dueño responde.
