# Ficha de contacto estilo Follow Up Boss, registro de llamadas, tareas con campanita e Inicio nuevo

**Fecha:** 2026-11-25 · **Tamaño:** grande (módulo nuevo + migraciones + permisos) · **Estado:** diseño para aprobar

## 1. Por qué

Entre la **solicitud de tasación** (`deals.stage='request'`) y la **tasación agendada**
(`stage='scheduled'`) hoy no queda registro de nada. Paula (la coordinación, rol
`coordinador`) llama a cada lead, pero lo que pasa en esas llamadas solo existe en lo que
ella cuenta. No sabemos cuánto tarda la primera llamada, cada cuánto se hace la segunda,
cuántos atienden ni en qué intento se agenda.

**Resultado esperado:** cada intento de contacto (llamada 1, llamada 2, WhatsApp) queda
registrado con hora y resultado, la siguiente llamada se agenda sola, y con eso tenemos
promedios de tiempos y tasas por intento para optimizar el paso de solicitud a agendada.

Todo se ve en una **ficha de contacto al estilo Follow Up Boss** (FUB), perfectamente usable
en el celular, con un **Inicio** que muestre lo que cada usuario tiene que hacer hoy y una
**campanita** de tareas.

## 2. Metas, no metas, anti-metas

**Metas**
1. Ficha de contacto en 3 columnas (escritorio): izquierda = datos de la persona;
   centro = nota rápida / registrar llamada + línea de tiempo; derecha = tareas,
   tasaciones agendadas, procesos (deals), archivos.
2. Registro de llamadas con resultado, y marca de "WhatsApp enviado" como tercer contacto.
3. Cadencia automática: si no atiende, la siguiente tarea de llamada se crea sola para
   **el día hábil siguiente** (decisión del dueño, 2026-11-25).
4. Línea de tiempo con TODO lo que hizo la persona y lo que le hicimos: registro, llamadas,
   notas, WhatsApp, emails recibidos/abiertos/clic (los que podamos medir), videos vistos,
   cambios de etapa, tareas, tasación.
5. Tareas con fecha y hora que avisan en una campanita; página de tareas agrupada en
   Vencidas / Hoy / Próximas.
6. Inicio rediseñado por rol, con lo que importa hoy.
7. Estadísticas de tiempos e intentos (registro → 1ª llamada → 2ª llamada → agendada).
8. Mobile primero en la ficha, el Inicio, las tareas y la campanita.

**No metas (quedan afuera)**
- Enviar WhatsApp o email desde la ficha (lo dijo el dueño: nada de "enviar mensaje").
- Llamar desde la plataforma o grabar llamadas. La llamada la hace Paula con su teléfono;
  en el celular el teléfono es un link `tel:` y después registra el resultado.
- Planes de acción / secuencias automáticas de mensajes al cliente.
- Avisos push al celular. Queda para cuando sepamos la respuesta de Paula (pregunta 8 del
  documento de reunión).
- Reordenar o arrastrar secciones de la ficha, marcar con estrella, colaboradores,
  etiquetas nuevas: FUB lo tiene, acá no suma.

**Anti-metas (si pasa esto, fracasó aunque funcione)**
- Elementos que se ven pero no hacen nada (botones de adorno, secciones vacías "próximamente").
  Si algo no tiene datos reales, no aparece.
- Que registrar una llamada tome más de 3 toques en el celular.
- Métricas que mezclan reloj con horario laboral sin decirlo, o que se muestran sin su `n`.
- Que la cadencia mande mensajes a clientes o cambie la etapa del deal sola.
- Duplicar datos que ya existen en otras tablas (decisión: enfoque A, §4).

## 3. Restricciones (del proyecto)

- **Netlify:** las funciones se cortan antes de 60 s; nada de IA en estas rutas. Cada ruta
  debe ser rápida.
- **Procesos programados:** las Scheduled Functions de Netlify no corren en este sitio y
  `pg_cron` agrega piezas que fallan en silencio. **Este desarrollo no usa ningún proceso
  programado**: la campanita se calcula al pedirla.
- **RLS por rol:** `contacts`/`deals` → dueño del registro o `is_operations_user()`
  (admin, dueño, coordinador). Lo nuevo sigue la misma regla. El abogado no ve contactos.
- **Migración antes del deploy** y verificación contra el proyecto `mncsnastmcjdjxrehdep`
  (aplicable desde acá por el pooler, ver CLAUDE.md).
- **`tasks` no tiene migración base en el repo**; `type` y `channel` tienen CHECK. Un tipo
  nuevo exige actualizar el CHECK en la misma migración (si no, 23514).
- **Datos de prueba fuera de toda métrica:** contacto Julian Parra / su email, títulos `[TEST`.
- **`whatsapp_messages` y `portal_inquiries` no tienen `contact_id`:** se vinculan por
  teléfono normalizado (`contacts.phone_norm`, últimos 10 dígitos) o email.
- **No existe hoy:** tabla de notas, registro de llamadas, campanita, avisos de apertura/clic
  de emails (no hay webhook de Resend).
- **Entorno local:** iCloud + tilde en la ruta rompen Turbopack/vitest; la verificación de
  interfaz se hace en la vista previa de Netlify con el navegador de Claude.

## 4. Enfoques considerados

**Dónde se guarda la actividad**
- **A — elegido.** Una tabla nueva `contact_activities` solo para lo que carga una persona
  (notas, llamadas, WhatsApp enviado). Los eventos que ya existen se leen de sus tablas al
  abrir la ficha y se mezclan en la línea de tiempo. Sin copias, una sola fuente por dato.
- B — copiar todo evento del sistema a una tabla única. Lectura simple, pero obliga a
  sincronizar copias que se desfasan sin que nadie lo note. Descartado por tamaño.

**Cómo se aprueba el diseño**
- **A — elegido.** Maqueta navegable (escritorio + celular) con los colores de la
  plataforma, aprobada por el dueño antes de programar. Se convierte en el sistema de diseño.
- B — programar directo y revisar en la vista previa. Más caro corregir. Descartado.

**Campanita**
- **Elegido:** calculada al pedirla (tareas con fecha/hora vencida o que vencen ahora),
  refresco cada 60 s y al volver a la pestaña. Sin tabla de notificaciones ni cron.
- Descartado: tabla de notificaciones + proceso que las genera (necesita cron).

## 5. Diseño

### 5.1 Sistema de diseño (parte 1)

Se basa en lo que ya hay: tokens de `app/globals.css` (`--brand` azul oklch(0.40 0.18 260),
`--brand-soft`, primario carbón, radio 0.75rem, Geist), shadcn new-york, íconos lucide.
No se inventa una paleta nueva.

**Maqueta navegable** (HTML estático servido por el compañero visual, no código de la app)
con estas pantallas, cada una en 1280 px y 390 px:
- Ficha de contacto (con datos reales de forma, no de personas reales).
- Registrar llamada (hoja/modal) y nota rápida.
- Campanita abierta.
- Página de tareas.
- Inicio de coordinadora, de asesor y de admin/dueño.

Lo aprobado se documenta en `openspec/specs/crm-sistema-diseno/spec.md` (reglas de layout,
breakpoints, componentes y sus estados) y se construye como componentes en
`components/crm/` que usan las partes siguientes.

**Layout de la ficha**

```
Escritorio (≥1280)                                         Tablet (768–1279)        Celular (<768)
┌──────────────┬───────────────────────────┬────────────┐  ┌────────┬───────────┐   ┌──────────────────┐
│ Persona      │ [Nota] [Registrar llamada]│ Tareas     │  │Persona │ Composer  │   │ Nombre · etapa   │
│ nombre       │ ┌───────────────────────┐ │ Tasaciones │  │Detalles│ Timeline  │   │ 📞  ✉  días s/c │
│ tel · email  │ │ composer              │ │ Procesos   │  │Tareas* │           │   │ [Actividad|Datos│
│ días sin     │ └───────────────────────┘ │ Archivos   │  │        │           │   │  |Tareas]       │
│ contacto     │ Filtros: Todo·Llamadas·   │            │  └────────┴───────────┘   │ timeline…        │
│ Detalles     │ Notas·Actividad           │            │  *derecha baja a la      │            ( + ) │
│ Background   │ ── línea de tiempo ──     │            │   columna izquierda      └──────────────────┘
└──────────────┴───────────────────────────┴────────────┘                             + = Nota / Llamada
```

- **Columna izquierda:** nombre, etapa del deal activo, teléfono (link `tel:`), email,
  "**días sin contacto**" (desde la última llamada atendida/no atendida, nota no cuenta),
  **Detalles** (origen, fuente/campaña, asesor asignado, barrio, tipo de propiedad,
  ambientes — lo que ya existe en `deals`/`contacts`), **Background** (= `contacts.notes`,
  editable en el lugar).
- **Centro:** composer con dos pestañas, **Nota** y **Registrar llamada**; debajo la
  línea de tiempo con filtros Todo / Llamadas / Notas / Actividad.
- **Derecha:** Tareas (pendientes del contacto, con "+ Tarea"), Tasaciones agendadas,
  Procesos (deals, link al proceso), Archivos (tasaciones PDF y propiedades vinculadas, solo
  si existen). Secciones sin datos: no se muestran.
- **Celular:** cabecera fija con nombre, etapa, botón llamar y "días sin contacto";
  pestañas **Actividad | Datos | Tareas**; botón flotante **+** que abre una hoja con Nota /
  Registrar llamada. Objetivo: llamar → registrar en ≤3 toques.

La ficha vive en la ruta existente `app/(dashboard)/contacts/[id]` (se reemplaza su
contenido). Desde el CRM (`/crm`) y desde las tareas, el nombre del contacto lleva ahí.

### 5.2 Registro de llamadas, notas y WhatsApp (parte 2)

**Tabla nueva `contact_activities`** (append-only para llamadas y WhatsApp):

| columna | tipo | nota |
| --- | --- | --- |
| id | uuid pk | |
| contact_id | uuid not null → contacts on delete cascade | |
| deal_id | uuid null → deals on delete set null | el deal activo al registrar |
| kind | text check in ('note','call','whatsapp_sent') | |
| call_outcome | text null, check en la lista de abajo | obligatorio si kind='call' |
| body | text null | nota / comentario de la llamada |
| occurred_at | timestamptz not null default now() | se puede corregir hacia atrás (máx 7 días), nunca a futuro |
| created_by | uuid → profiles on delete set null | |
| created_at | timestamptz default now() | hora real de carga (para auditar `occurred_at`) |
| voided_at / voided_by | null | anular en vez de borrar (llamadas y WhatsApp) |

**Resultados de llamada** (lista inicial, se ajusta tras la reunión con Paula):
`agendo` (atendió y agendó), `volver_a_llamar` (atendió, pide que lo llamen), `no_interesa`
(atendió, no le interesa), `no_atendio`, `numero_equivocado`.

**Número de intento:** no se guarda; se calcula como el orden de las llamadas no anuladas
del contacto dentro del deal (llamada 1, 2, 3…). Así anular una no deja huecos falsos.

**WhatsApp enviado:** botón "Marqué WhatsApp enviado" dentro de Registrar llamada
(tercer contacto). No envía nada; solo registra. Si además hay un mensaje saliente en
`whatsapp_messages` para ese teléfono, la línea de tiempo muestra ambos.

**Notas:** editables y borrables por su autor; anulables por operaciones.

**Permisos (RLS):** ver/insertar si podés ver el contacto (dueño `assigned_to` o
`is_operations_user()`); `created_by = auth.uid()` forzado. Abogado: nada.

**Rutas:** `POST /api/contacts/[id]/activities` (Zod), `PATCH /api/contacts/[id]/activities/[activityId]`
(editar nota / anular). Lógica en `lib/crm/actividades.ts` (puro, con tests).

### 5.3 Cadencia automática (parte 2)

Módulo puro `lib/crm/cadencia.ts` decide, a partir del resultado y del número de intento,
qué tarea crear. Se ejecuta en la misma ruta que guarda la llamada (sin cron).

| Registro | Tarea que se crea sola (asignada a quien registró) |
| --- | --- |
| Llamada N `no_atendio`, N < 2 | "Llamada N+1 a {nombre}", canal `call`, **día hábil siguiente** a la hora de inicio del horario laboral |
| Llamada 2 `no_atendio` | "Enviar WhatsApp a {nombre}", canal `message`, día hábil siguiente |
| WhatsApp enviado | ninguna (la secuencia termina; queda en el Inicio como "sin respuesta" para decidir) |
| `volver_a_llamar` | pide fecha y hora en el mismo formulario (obligatorio) → tarea de llamada a esa hora |
| `agendo` | ninguna; muestra el botón existente "Coordinar tasación" del flujo de `/api/deals` |
| `no_interesa`, `numero_equivocado` | ninguna; ofrece (no hace) "Marcar proceso como perdido" |

- Registrar una llamada **completa sola** la tarea de llamada pendiente de ese contacto, si
  existe (y la tarea `update_contact` que crea el embudo al entrar el lead).
- **Horario laboral**: constante en `lib/crm/horario-laboral.ts`, por defecto lunes a viernes
  9:00–13:00 hora Argentina (supuesto; se corrige con la respuesta de Paula, pregunta 11).
  Feriados: fuera de alcance en esta versión.
- Nunca se cambia la etapa del deal ni se manda nada al cliente desde la cadencia.
- Requiere `tasks.type` nuevo **`call_attempt`**, o reusar `follow_up` + `channel='call'`.
  **Decisión:** reusar `follow_up` (ya admite varias pendientes por entidad, sin tocar el CHECK)
  y marcar el origen en `description`/campo, para que el reporte distinga las automáticas.

### 5.4 Línea de tiempo (parte 3)

`GET /api/contacts/[id]/timeline` devuelve eventos normalizados
`{ id, at, kind, title, detail?, actor?, source }` ordenados por fecha desc, paginado de a 50.
La mezcla y el formato viven en `lib/crm/timeline.ts` (puro, con tests); la ruta solo lee.

| Evento | Fuente | Vínculo |
| --- | --- | --- |
| Se registró (landing, campaña, anuncio) | `deals` (created_at, origin, meta_*) | contact_id |
| Llamadas, notas, WhatsApp marcado | `contact_activities` | contact_id |
| Cambio de etapa (solicitud → agendada → …) | `deal_stage_history` | deal_id de sus deals |
| Tarea creada / completada | `tasks` | contact_id o deal_id |
| WhatsApp enviado/recibido (sistema y bandeja) | `whatsapp_messages` | phone_norm |
| Vio el video de la landing (% visto) | `video_view_state` | contact_id |
| Consulta de portal | `portal_inquiries` | teléfono/email |
| Tasación creada / enviada | `appraisals`, `scheduled_appraisals` | contact_id |
| Email recibido / abierto / clic | ver abajo | email |

**Emails al contacto:** hoy no se mide apertura ni clic. Esta parte (a) hace el inventario de
qué emails le llegan al lead (Resend: `emails/*Client*`, Mailchimp del embudo) y (b) conecta
los avisos de entrega/apertura/clic de Resend (webhook firmado) en una tabla
`email_events`, y los de Mailchimp si el webhook existente los trae. Lo que no se pueda medir
no aparece (no hay evento falso de "abrió").

### 5.5 Tareas y campanita (parte 4)

- **Crear tarea** desde la ficha, la página de tareas y el Inicio: título, tipo (canal),
  fecha, hora opcional ("todo el día"), asignada a (por defecto yo; operaciones puede
  asignar a otros). Reusa `AddTaskDialog` y `POST /api/tasks`.
- **Campanita** en el `Topbar` (a la derecha), número rojo = tareas mías pendientes con
  fecha/hora ≤ ahora. Al abrir: lista Vencidas / Ahora, cada una con contacto, botón
  Completar y Posponer (1 h, mañana, elegir). Refresco cada 60 s y al volver a la pestaña.
  Endpoint `GET /api/tasks/due` con conteo exacto.
- **Página de tareas** reorganizada en Vencidas / Hoy / Próximas (sin fecha al final), con
  filtro por tipo y, para operaciones, por persona. Se elimina el techo silencioso de 50:
  la ruta devuelve total exacto y pagina.
- En el celular la campanita está en la barra superior y la página de tareas es una lista
  de una columna con acciones al deslizar o con botones visibles (lo que apruebe la maqueta).

### 5.6 Inicio nuevo (parte 5)

Reemplaza `app/(dashboard)/inicio/page.tsx`. Bloques por rol (solo con datos reales):

- **Coordinadora:** "Para llamar ahora" (leads con tarea de llamada vencida o sin primer
  contacto, ordenados por antigüedad, con botón llamar + registrar), "Sin respuesta tras
  WhatsApp", tareas de hoy, tasaciones agendadas de hoy y mañana, y 3 números del día:
  solicitudes nuevas, llamadas hechas, agendadas.
- **Asesor:** mis tareas de hoy/vencidas, mis visitas y tasaciones de hoy, mis procesos que
  esperan algo de mí.
- **Admin / dueño:** lo de la coordinadora en modo lectura + leads sin primer contacto con
  su antigüedad, y el tiempo medio a la primera llamada de la semana (con `n`).
- Abogado: sigue yendo a `/properties/review` (sin cambio).

### 5.7 Estadísticas de llamadas (parte 6)

Nueva sección en `/metrics` (debajo del estado de resultados del embudo), por **cohorte**
de solicitudes creadas en el período (`origin='embudo'`, sin datos de prueba):

- Tiempo registro → 1ª llamada: mediana y promedio, **en horas de reloj y en horas hábiles**.
- Tiempo 1ª → 2ª llamada (hábiles).
- Intentos promedio hasta el primer "atendió".
- % contactados, % agendados, y en qué intento se agendó (1, 2, WhatsApp).
- Distribución de resultados de llamada.
- Solicitudes sin ningún intento registrado (alerta).
Cada número con su `n`; aviso si n < 20. Cálculo en `lib/crm/metricas-llamadas.ts` (puro)
alimentado por una RPC de lectura.

## 6. Método de trabajo (OpenSpec + auditoría doble)

- Se crea `openspec/` en el repo con la estructura de OpenSpec: `openspec/project.md`
  (contexto), `openspec/specs/<capacidad>/spec.md` (lo vigente) y
  `openspec/changes/<cambio>/{proposal.md, design.md, tasks.md, specs/<capacidad>/spec.md}`
  con requisitos `SHALL` y escenarios `WHEN/THEN`. Al terminar un cambio, sus specs se
  archivan en `openspec/specs/`.
- **Seis cambios, en orden, cada uno con su PR:**
  1. `crm-sistema-diseno` — maqueta aprobada + componentes base.
  2. `crm-ficha-y-llamadas` — ficha (layout + datos), notas, llamadas, WhatsApp, cadencia.
  3. `crm-linea-de-tiempo` — eventos existentes + emails (inventario y webhook).
  4. `crm-tareas-y-campanita`.
  5. `crm-inicio`.
  6. `crm-estadisticas-llamadas`.
- **Auditoría por cambio:** al cerrar cada cambio, un auditor (agente nuevo, sin mi
  contexto) revisa proposal/spec/código contra los escenarios; un segundo auditor revisa el
  cambio Y la auditoría del primero. Se corrige y se repite hasta que ambos queden sin
  hallazgos de peso. Queda registrado en `openspec/changes/<cambio>/auditoria.md`.
- Cada cambio sigue el protocolo de 6 etapas del CLAUDE.md (QA en la vista previa con el
  navegador de Claude, migración aplicada y verificada antes del deploy, merge por mí).

## 7. Criterios de aceptación (globales; cada cambio los detalla en escenarios)

1. Desde un lead en `/crm`, abro la ficha y veo las 3 columnas en escritorio y las
   pestañas + botón + en el celular.
2. En el celular, desde la ficha: llamar → volver → "+" → Registrar llamada → "No atendió"
   → Guardar = 3 toques después de volver; queda en la línea de tiempo como "Llamada 1 · No
   atendió" con hora.
3. Tras ese registro existe una tarea "Llamada 2" para el día hábil siguiente a las 9:00,
   asignada a quien registró, y la tarea de llamada anterior quedó completada.
4. Tras "Llamada 2 · No atendió" aparece la tarea "Enviar WhatsApp"; al marcar WhatsApp
   enviado no se crea ninguna tarea más.
5. A la hora de una tarea, la campanita muestra el número sin recargar (≤60 s) y desde ahí
   la completo o pospongo.
6. La línea de tiempo del lead muestra su registro, sus llamadas, sus cambios de etapa, los
   WhatsApp del sistema y el video visto, en orden.
7. El Inicio de Paula muestra "Para llamar ahora" con los leads que corresponden.
8. En `/metrics` veo el tiempo a la primera llamada en horas de reloj y hábiles, con su n.
9. Un asesor no ve contactos que no son suyos; el abogado no ve nada de esto.
10. Nada de lo anterior envía mensajes a clientes ni cambia etapas solo.

## 8. Decisiones tomadas tras la revisión del diseño (llamadas mías, corregibles)

Verificado en la base el 2026-11-25: hay **2 coordinadores activos** (Paula Pandolfo y
"Julian Coordinador", cuenta de pruebas) y **635 tareas pendientes, 625 sin fecha** y 9 vencidas.

1. **Cola compartida.** Cada lead nuevo genera una tarea `update_contact` por coordinador
   (`createTaskForRole`). Registrar una llamada **completa todas** las tareas de llamada y
   `update_contact` pendientes de ese deal, de cualquier coordinador: el lead ya fue atendido.
   "Para llamar ahora" es una sola cola para la coordinación. La tarea siguiente de la cadencia
   va a quien registró la llamada.
2. **Regla de intentos.** La cadencia cuenta las llamadas `no_atendio` **seguidas** desde el
   último contacto. 1 seguida → tarea Llamada siguiente; 2 seguidas → tarea Enviar WhatsApp;
   después del WhatsApp marcado, otra `no_atendio` no crea tarea (queda en "Sin respuesta" del
   Inicio). `volver_a_llamar` corta la racha y siempre crea la tarea con la fecha pedida. El
   número que se muestra ("Llamada 3") es el orden total de llamadas, no la racha.
3. **Deal activo** = el deal más reciente del contacto cuya etapa no sea `captured`, `lost`
   ni `comprador`. Si no hay, la actividad se guarda sin `deal_id` y no corre la cadencia.
   La etapa de la cabecera es la de ese deal.
4. **Zona horaria.** `tasks.due_date`/`due_time` se interpretan siempre como hora de
   Argentina (America/Argentina/Buenos_Aires), en la cadencia, la campanita y la página de tareas.
5. **Campanita.** Cuenta tareas mías pendientes con `due_date` ≤ hoy y, si tienen hora,
   `due_time` ≤ ahora; las de "todo el día" suenan desde el inicio del horario laboral. **No
   cuenta tareas sin fecha** ni las vencidas antes del deploy (corte = fecha del deploy), para
   que no abra con un número que nadie puede bajar. En la página de tareas, las 625 sin fecha
   van en un grupo "Sin fecha" plegado; limpiarlas es otro pedido, con OK del dueño.
6. **Métricas desde el deploy.** La cohorte de llamadas arranca el día del deploy del cambio 2;
   las solicitudes anteriores no cuentan como "sin intento" (se aclara en pantalla).
7. **Webhooks de email.** El cambio 3 no se bloquea: si el webhook de Resend (se intenta dar de
   alta por API con `RESEND_API_KEY`) o el de Mailchimp no se puede configurar, se publica sin
   eventos de email y se deja documentado qué falta; nunca se muestra un evento que no se midió.
8. **Permisos.** `contact_activities` copia la regla real de `contacts`: lo ve quien es
   `assigned_to` **o `created_by`** del contacto, u operaciones. Las tareas se buscan por
   `deal_id` y por `contact_id`.

## 9. Lo que decide quien construye

- Nombres de componentes y archivos dentro de las carpetas indicadas.
- Paginación y orden fino de la línea de tiempo.
- Si el composer en celular es hoja inferior (`Sheet`) o pantalla completa (lo define la maqueta).
- Índices de base de datos necesarios para las lecturas por `contact_id`/`phone_norm`.
- Textos menores, siguiendo el tono de la plataforma (castellano rioplatense, simple).
