# Design

## Context

Motivo, alcance y las cinco decisiones del dueño: `proposal.md`. Lo aprobado visualmente
está en `../archive/2026-11-25-crm-sistema-diseno/maqueta/` (`base.js`: `TIPOS_EVENTO`, los
textos "Se registró · Solicitud de tasación", "Vio el video de la landing · 62 %", "Pasó de
Solicitud a Tasación agendada" con autor) y manda sobre cualquier otro documento.

Inventario verificado contra la base de producción (solo lectura, 2026-11-27) y el código de
`main` (8fa9343f):

- **Actividad hoy.** `GET /api/contacts/[id]/activities` lee `contact_activities` (nota,
  llamada, WhatsApp marcado), de a 50 con `antes=<occurred_at>` y `.lt()`. Dos registros
  con la misma hora en el corte de página se pierden: el bug existe hoy y lo arregla D4.
  `use-ficha.ts` arma `items` con `actividades`; `ItemActividad` dibuja cada fila.
- **Registro.** `funnel_lead_submissions` (`funnel` tasacion|clase, `status` complete|
  reserved, `contact_id`, `deal_id`, `created_at`): 143 completos en 121 contactos, máximo 8
  por persona. 128 de 141 tienen `deals.meta_ad_name`.
- **Etapas.** `deal_stage_history` (`deal_id`, `from_stage`, `to_stage`, `changed_at`,
  `changed_by`). La escribe `fn_deals_write_stage_history` (AFTER, `SECURITY DEFINER`,
  migración `20260520000001`) **sin nombrar `changed_by`**: está vacío en el 100 %. Todas
  las escrituras de `deals` usan service role, así que `auth.uid()` es NULL en el trigger.
  La apertura (`from_stage` null) se repite con el registro cuando el proceso viene del
  embudo.
- **Quién escribe `deals.stage`** (seis funciones, todas en `lib/supabase/`):
  `createDeal`, `updateDealStage`, `deshacerPerdido`, `convertirSolicitud`,
  `linkPropertyToDeal` (`deals.ts`) y `markVisitCompleted` (`visit-data.ts`). Con sesión:
  `POST /api/deals`, `/api/deals/manual`, `[id]/advance` (hoy descarta el `user`),
  `[id]/undo-lost`, `[id]/visit-data` (`autorizar()` no devuelve el `user`) y `POST
  /api/properties`. Sin sesión: `create-funnel-lead` y el webhook GHL en cuarentena.
- **Tareas.** `tasks.created_by` existe pero solo lo escriben `/api/tasks` y la cadencia.
  Faltan `POST /api/deals` (dos lugares), `properties/[id]/review`, `legal-submit` y
  `advance`. **`completed_by` no existe.** Cierran tareas: `completeTask` (`/api/tasks/[id]`),
  `closeTasksByActivity` (cadencia), `undoTasksOfActivity` (deshacer) y
  `cerrarTareasDelInforme` (informes, tiene el `userId` pero no lo pasa). Estados: pending
  638, completed 25, dismissed 9. `createTaskForRole` crea una copia por coordinador.
- **WhatsApp.** `whatsapp_messages` no tiene `contact_id`: se vincula por `phone_e164`
  (sin `+`) contra `contacts.phone_norm` (últimos 10 dígitos). Salientes: 1.205 son
  plantillas de aviso de consultas (`consulta_portal_*`) que van al equipo con datos de
  otros interesados; `consulta_sin_enlace*` y `consulta_plano*` también. `status`
  `agent_*` son notas internas del agente (no salieron por Meta). De 180 textos libres, 155
  son del asistente (`ai_generated`) y 25 tienen `sent_by`. 27 grupos de teléfonos
  compartidos (55 contactos); 1 contacto con el teléfono de alguien del equipo. La RLS de
  la tabla es solo de operaciones: se lee con service role y el permiso lo pone la ruta.
- **Video.** `video_view_state` (`contact_id`, `video_key`, `max_percent`, `first_at`,
  `playback_started`). 39 filas vinculadas. El catálogo `lib/funnel/video-keys.ts` dice de
  qué página es cada clave (`pagina`).
- **Notas y llamadas reales:** `contact_activities` tiene 0 filas hoy. La línea de tiempo
  va a mostrar sobre todo eventos del sistema.

## Goals / Non-Goals

**Goals:**

- Una sola lista por persona, leída de las tablas donde viven los datos, sin copias.
- Reglas (textos, exclusiones, colapso de copias, orden y corte de página) en un módulo
  puro con tests; las lecturas, en funciones chicas con su test.
- Que una fuente rota no tape las demás.
- Empezar a guardar el autor de etapas y tareas sin romper a ningún escritor.

**Non-Goals:**

- Emails, consultas de portal, eventos de lectura (decisiones 1 y 4 del dueño).
- Completar el autor de lo viejo.
- Cambiar quién puede abrir la ficha (`canAccessContact` queda igual).
- Tocar el webhook GHL ni `lib/ghl` (cuarentena): quedan sin autor.

## Decisions

### D1. Base: `deals.stage_changed_by` y `tasks.completed_by`

Migración `supabase/migrations/20261127000002_crm_linea_de_tiempo.sql` (verificar que el
prefijo esté libre):

- `deals.stage_changed_by uuid REFERENCES profiles(id) ON DELETE SET NULL`.
- `fn_deals_write_stage_history` se redefine (`CREATE OR REPLACE`, misma firma) para
  insertar `changed_by`: `COALESCE(auth.uid(), (SELECT p.id FROM profiles p WHERE p.id =
  NEW.stage_changed_by))`. El `SELECT` contra `profiles` evita la violación de FK si el
  perfil se está borrando (patrón de `property_visits_log_event`).
- `tasks.completed_by uuid REFERENCES profiles(id) ON DELETE SET NULL`.
- Índices de lectura: `deal_stage_history(deal_id, changed_at)` si no existe,
  `funnel_lead_submissions(contact_id) WHERE status='complete'`,
  `video_view_state(contact_id) WHERE playback_started`, `tasks(contact_id)` si no existe. Todos `IF NOT EXISTS`.
- Script `scripts/apply-crm-linea-de-tiempo-pg.ts`: aplica, verifica columnas, índices y
  la función, y prueba dentro de una transacción con `ROLLBACK` que un UPDATE de etapa con
  `stage_changed_by` deja `changed_by` en el historial y uno sin él lo deja NULL.

**El riesgo del autor "pegado".** `stage_changed_by` queda en el proceso después del
cambio. Si un escritor posterior cambia la etapa sin mandarlo, el historial le atribuiría
el cambio a la persona anterior. Por eso **las seis funciones que escriben `stage` reciben
`autorId: string | null` como parámetro obligatorio** y siempre escriben
`stage_changed_by: autorId` en el mismo UPDATE/INSERT: TypeScript obliga a cada llamador a
decidir. El sistema pasa `null`. Un test (`lib/supabase/deals.autor.test.ts`) recorre esas
funciones con una base simulada y exige `stage_changed_by` en cada escritura que lleva
`stage`. Los escritores fuera de la app (GHL en cuarentena, scripts viejos) quedan como
riesgo aceptado en "Risks".

### D2. Autor en las escrituras de tareas

- `createTask`, `createTaskForRole` y `createCadenceTask` sin cambio de firma: los
  llamadores con sesión pasan `created_by: user.id` (`POST /api/deals` ×2,
  `properties/[id]/review`, `legal-submit`, `advance`, que pasa a conservar el `user`).
  Los del sistema no pasan nada.
- `completeTask(id, autorId)`, `closeTasksByActivity(…, autorId)` (el autor de la
  actividad que cierra) y `cerrarTareasDelInforme(…, autorId)` escriben `completed_by`.
  `undoTasksOfActivity`, al reabrir, pone `completed_by: null`. `dismissTask` no lo
  escribe: un descarte no es "completó".

### D3. Módulo puro `lib/crm/linea-de-tiempo.ts`

```ts
export type ClaseEvento = 'registro' | 'etapa' | 'tarea' | 'whatsapp' | 'video'
export interface EventoSistema {
  id: string            // `${clase}:${id de origen}[:creada|:completada]`, único y estable
  clase: ClaseEvento
  titulo: string
  detalle: string | null
  autor: { id: string; nombre: string } | null
  fecha: string         // ISO
  fallido?: boolean     // WhatsApp que no se pudo enviar
}
export type ItemLinea =
  | { tipo: 'actividad'; actividad: ActividadDeFicha }
  | { tipo: 'evento'; evento: EventoSistema }
```

Funciones (cada una con su test, primero en rojo):

- `eventosDeRegistro(filas, procesos)`: solo `status='complete'`; título por `funnel`;
  detalle "Anuncio de Meta · {meta_ad_name}" si el proceso lo tiene.
- `eventosDeEtapa(historial, procesosConRegistro, nombres)`: `from_stage` null se omite
  si el proceso tiene un registro; si no, "Se abrió un proceso en {etapa}". Nombre de
  etapa con `nombreEtapaHistorial(stage)`, que usa `NOMBRE_ETAPA` (`lib/crm/etapas.ts`);
  `scheduled` en el historial se lee "Coordinada" (el día no se conoce por evento). Una
  etapa desconocida se muestra cruda antes que esconder el evento.
- `eventosDeTareas(tareas, nombres)`: creación salvo `source_activity_id`; completada
  solo con `status='completed'`. Copias de coordinación: mismo título, distinto
  `assigned_to`, `created_at` a ≤60 s de la primera → una sola creación "Para la
  coordinación" (misma ventana que `colapsarCopiasDeCoordinacion`).
- `telefonoUtilizable(contacto, telefonosEquipo, compartidos)`: null si no hay 10 dígitos,
  si es del equipo o si lo comparte otro contacto.
- `eventosDeWhatsapp(mensajes, nombres)`: descarta `status` que empieza con `agent_` y
  plantillas con prefijo `consulta_portal`, `consulta_sin_enlace`, `consulta_plano`.
  Entrante → "Escribió por WhatsApp"; saliente con `sent_by` → "Se le envió un WhatsApp" +
  autor; `ai_generated` → "Le respondió el asistente por WhatsApp"; el resto → "Se le
  envió un WhatsApp automático". Detalle: `body_preview` recortado a 140 caracteres por
  palabra, con "…". `failed` → sufijo "· no se pudo enviar".
- `eventosDeVideo(filas)`: solo `playback_started`; "Vio el video de la landing de
  tasación" (`pagina` tasacion o tasacion-neta), "… de la clase" (`clase`), "Vio la clase
  completa" (`clase-completa`), "Vio un video de la landing" (clave desconocida); "· {max}
  %"; fecha `first_at`.
- `unirYCortar(listas, cursor, limite)`: ordena por `(fecha desc, id desc)`, descarta lo
  que no sea estrictamente anterior al cursor, devuelve `limite` y `hayMas`. El cursor es
  `{ fecha, id }` del último ítem mostrado.

### D4. Lecturas `lib/supabase/linea-de-tiempo.ts` y la ruta

Una función por fuente, service role, cada una con `fecha <= cursor.fecha` y `limit(51)`:
registros, historial de los procesos del contacto, tareas, WhatsApp (con el teléfono que
deja pasar `telefonoUtilizable`, por `phone_e164 like '%{10 dígitos}'`: la tabla tiene
~1.700 filas, el comodín inicial no pesa), video,
más los teléfonos del equipo (`profiles.phone`) y si el `phone_norm` del contacto lo tiene
otro. Volumen medido: mediana 1 evento, máximo 38 por contacto.

`GET /api/contacts/[id]/activities` mantiene permisos, 404 y filtros. Cambia:

- Parámetros `antes` (ISO) y `antes_id`. Sin `antes_id` se comporta como hoy.
- Filtros `todo` y `actividad` suman las fuentes del sistema; `llamadas` y `notas` no.
- `contact_activities` también pasa a `lte` + corte en memoria.
- Cada fuente del sistema corre en `Promise.allSettled`; las que fallan van a
  `fuentes_con_error: ClaseEvento[]`. Si falla `contact_activities`, 500 como hoy.
- Respuesta `{ items: ItemLinea[], hay_mas, fuentes_con_error }`. Se quita `actividades`
  en el mismo PR (único consumidor: `use-ficha.ts`, verificar con grep).
- Un solo plazo de 15 s por servicio, como la cartera.

### D5. Pantalla

- `use-ficha.ts`: `items: ItemLinea[]`, cursor `{fecha, id}` del último, dedup por id con
  prefijo de tipo, `fuentesConError`. Las altas, ediciones y anulaciones de actividades
  siguen tocando solo los ítems `tipo:'actividad'`.
- `Actividad.tsx`: aviso "Parte de la historia no se pudo cargar" con "Reintentar" arriba
  de la lista cuando `fuentesConError` no está vacío; vacíos como hoy.
- `ItemEvento.tsx` (nuevo): misma anatomía que `ItemActividad` (ícono por clase con los de
  `TIPOS_EVENTO`: `UserPlus`, `ArrowRightLeft`, `ListChecks`, `MessageCircle`,
  `CirclePlay`), sin menú "⋯", toque que alterna la fecha exacta. `fallido` → texto en
  `text-destructive-texto`.

### D6. Pruebas

`lib/crm/linea-de-tiempo.test.ts`, `lib/supabase/linea-de-tiempo.test.ts`,
`lib/supabase/deals.autor.test.ts`, tests de tareas con `completed_by`, la ruta (filtros,
cursor con empate, fuente que falla, 404 de contacto ajeno, teléfono del equipo y
compartido), `use-ficha`/`Actividad` (aviso, "Ver más" con empate) e `ItemEvento`. Se
suman al `vitest.crm.config.ts` y `tsconfig.crm.json`.

## Diferencias con lo aprobado

1. Emails: la maqueta muestra "Se le envió el email «Recibimos tu solicitud de
   tasación»". No existe en la realidad (decisión 1).
2. El anuncio se nombra por su nombre interno, no por el título que vio la persona
   (decisión 3).
3. El detalle del registro no lleva "Departamento 3 ambientes en Caballito": el proceso
   del embudo no guarda tipo ni ambientes en la mayoría de los casos.
4. Los cambios de etapa viejos se ven sin autor (decisión 2).
5. "Tasación agendada" de la maqueta se lee "Coordinada", el nombre de la etapa en la
   plataforma (cartera, D5).
6. Eventos que la maqueta no dibujaba: tareas, WhatsApp y "Se abrió un proceso en …".
7. El aviso "Parte de la historia no se pudo cargar" no está en la maqueta: sigue el
   patrón de error por bloque de `crm-sistema-diseno`.

## Risks / Trade-offs

- **Autor pegado** (D1): mitigado con el parámetro obligatorio y su test. Riesgo
  residual: un escritor fuera de esas seis funciones (GHL en cuarentena, un script) que
  cambie la etapa hereda el último autor. Se documenta en `CLAUDE.md`.
- **El asesor ve WhatsApp que en la bandeja no ve.** La bandeja es solo de operaciones; la
  ficha de un contacto suyo le muestra sus mensajes. Es la historia de su cliente y la
  spec lo pide; se le nombra al dueño al abrir el PR.
- **Teléfono mal cargado.** Si dos personas distintas comparten número, no se muestra
  WhatsApp en ninguna (decisión 5): se pierde información antes que mezclarla.
- **Rendimiento:** seis lecturas en paralelo con índice; se mide en el QA (objetivo: el
  pedido de la actividad por debajo de 1 s).

## Migration Plan

1. Aplicar la migración con el script (dos veces: idempotente) antes del deploy. El código
   viejo no nombra las columnas nuevas, así que convivir no rompe nada.
2. Deploy. 3. Verificar en producción un cambio de etapa real con autor.

Vuelta atrás: revert de los commits; las columnas pueden quedar.

## Open Questions

Ninguna bloqueante: las cinco decisiones del dueño están en `proposal.md`. Se le nombra en
el PR la exposición de WhatsApp al asesor (Risks).
