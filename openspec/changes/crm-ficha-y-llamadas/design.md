# Design

## Context

Motivo y alcance: ver `proposal.md`. Lo aprobado por el dueño está en
`../archive/2026-11-25-crm-sistema-diseno/maqueta/` (capturas en `maqueta/capturas/`, reglas en `GUIA.md`) y
manda sobre cualquier otro documento. Las decisiones de la sección 8 del diseño general
(`docs/superpowers/specs/2026-11-25-ficha-contacto-llamadas-inicio-design.md`) mandan sobre
su sección 5.

Estado del código que condiciona el diseño (verificado en el worktree):

- **La ficha actual tiene un agujero de permisos.** `GET` y `PUT /api/contacts/[id]` solo
  piden sesión: un asesor o el abogado, con el id, leen y editan cualquier contacto, y el
  `PUT` acepta `assigned_to` en el cuerpo. Todas las rutas de contactos y de tareas usan
  service role, así que **la RLS no los frena**: el permiso hay que ponerlo en cada ruta.
- **`POST /api/contacts` no guarda `created_by` ni `assigned_to`**: un contacto creado por
  un asesor queda sin dueño.
- **Los contactos del embudo nacen sin `assigned_to` ni `created_by`**
  (`lib/funnel/create-funnel-lead.ts` no los escribe) y `POST /api/deals` solo pone
  `assigned_to` cuando crea un contacto nuevo, no cuando reutiliza uno (`route.ts:128-135`).
  Y `ContactEditor` (`components/contacts/ContactEditor.tsx:91` y `:146`) lee y guarda por
  `GET`/`PUT /api/contacts/[id]` desde `/pipeline/[id]` (`page.tsx:523`) y `/appraisals/[id]`
  (`page.tsx:567`). O sea: **si el permiso nuevo mirara solo `assigned_to`/`created_by`, el
  asesor dejaría de poder editar el contacto de su propio proceso** con el botón "Editar".
  (El 422 `DATOS_DEL_CLIENTE` de `advance` abre otro componente, `CompletarDatosCliente`,
  que no usa estas rutas y no se ve afectado.) Por eso la regla de acceso incluye los
  procesos y tasaciones a su nombre (D2).
- **El trigger de etapas pone `lost_at` la primera vez y nunca lo limpia**
  (`20260520000001:24`), y `vw_funnel_daily` cuenta las perdidas por `lost_at`
  (`20260520000005:79`). `POST /api/deals/[id]/advance` no revisa de quién es el proceso
  (solo el permiso `pipeline.advance`) y exige datos del cliente para volver a ciertas etapas.
- **Hay otro creador de tareas `update_contact`:** el agente de tasación por WhatsApp
  (`lib/ai/tasacion-agent.ts:339`), con `deal_id` y títulos "Llamar para coordinar
  tasación: …", "Consulta por WhatsApp (tasación): …", "Coordinar tasación: …".
- **`contacts` y `tasks` no están en `types/database.types.ts`** y `tasks` no tiene
  `CREATE TABLE` en migraciones (se creó a mano). Se trabaja con tipos propios.
- **Tareas:** `follow_up` + `channel` + `due_date`/`due_time` ya alcanzan para la cadencia,
  sin tocar los CHECK. `createTask` no deduplica `follow_up`. No existe forma de completar
  en lote, ni columna que diga qué creó o cerró una tarea. Las fechas se calculan en UTC.
- **`createTaskForRole` crea una tarea `update_contact` por coordinador** cuando entra un
  lead (hoy hay 2 coordinadores activos).
- **No hay pantalla para coordinar una solicitud existente.** `/pipeline/new` no lee nada de
  la URL y `POST /api/deals` siempre crea un proceso nuevo: usado sobre un lead del embudo,
  deja la solicitud abierta y suma un segundo proceso.
- **Layout real:** quien scrollea es `#contenido` (no el `body`), con `p-4 md:p-6`. La barra
  inferior del celular no es fija: es hermana en flujo de `#contenido`. El menú lateral
  aparece a 768 px y ocupa 15rem. El `Toaster` global va arriba a la derecha.
- **Entorno:** nada de IA ni de procesos programados en estas rutas; cada pedido debe ser
  rápido. La vista previa de Netlify usa el Supabase de producción.

## Goals / Non-Goals

**Goals:**

- Una sola fuente por dato: lo que carga una persona va a `contact_activities`; lo demás se
  lee de sus tablas.
- Reglas (cadencia, numeración, día hábil, última llamada, permisos) en módulos puros con
  tests; las rutas solo validan, llaman y guardan.
- Que la llamada nunca se pierda: es el dato que hoy no existe. Si algo secundario falla, la
  llamada queda y la pantalla lo dice.
- Cerrar el agujero de permisos de la ficha en el mismo change que la expone más.
- Reproducir la maqueta aprobada dentro del layout real, sin tocar la barra superior, el
  menú ni la barra inferior.

**Non-Goals:**

- Regenerar `types/database.types.ts`.
- Arreglar `PUT /api/tasks/[id]` (cualquier usuario con sesión completa la tarea de otro),
  las fechas en UTC de `getMyTasks`/`AddTaskDialog` y el techo de 50: son del change
  `crm-tareas-y-campanita`. Acá se anotan como riesgo.
- Línea de tiempo con eventos del sistema (`crm-linea-de-tiempo`), campanita y página de
  tareas (`crm-tareas-y-campanita`), "Sin respuesta" del Inicio (`crm-inicio`). Mientras ese
  bloque no exista, ningún texto de la ficha lo nombra (ver D7).
- Escribir `contacts.assigned_to` al coordinar, o rellenarlo para los clientes viejos: con
  la regla de acceso de D2 ya no hace falta.
- Cambiar el título de la barra superior (hoy dice "Contactos" o "Mis contactos"): el nombre
  de la persona va en la cabecera de la ficha.
- Feriados, y cualquier configuración del horario laboral desde la interfaz.

## Decisions

### D1. Tabla `contact_activities` y dos columnas nuevas en `tasks`

La tabla `tasks` es un camino crítico (la usa toda la plataforma): lo único que se le hace
es **agregar dos columnas opcionales y cuatro índices**; no se toca ningún CHECK, ningún
índice existente ni ninguna policy.

Archivo: `supabase/migrations/20261125000001_contact_activities.sql` (el último prefijo del
directorio es `20261120000001`; no hay ningún `20261125…`). Idempotente: se puede correr
dos veces seguidas sin error, y la segunda vez vuelve a dejar los CHECK y la policy como
dice el archivo.

```sql
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
  client_token  uuid                        -- anti doble guardado
);

-- Los 8 CHECK van aparte, cada uno con DROP + ADD (como en 20260806000001): dentro de
-- un CREATE TABLE IF NOT EXISTS no se actualizarían al volver a correr el archivo.
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

CREATE UNIQUE INDEX IF NOT EXISTS uq_tasks_source_activity
  ON public.tasks (source_activity_id) WHERE source_activity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_closed_by_activity
  ON public.tasks (closed_by_activity_id) WHERE closed_by_activity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_deal_pendientes
  ON public.tasks (deal_id) WHERE status = 'pending' AND deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_contact_pendientes
  ON public.tasks (contact_id) WHERE status = 'pending' AND contact_id IS NOT NULL;
```

**RLS: solo lectura.** Toda escritura pasa por las rutas, con service role. Con sesión
propia (la clave pública está en el navegador) nadie puede insertar, cambiar ni borrar: no
hay policy de INSERT, de UPDATE ni de DELETE, igual que en `property_status_events`. Así la
base cumple lo que dice la spec: el resultado y el texto de una llamada no se modifican, y
no se puede saltear la cadencia con un insert directo.

```sql
ALTER TABLE public.contact_activities ENABLE ROW LEVEL SECURITY;

-- Por si una versión anterior de este archivo llegó a crearlas:
DROP POLICY IF EXISTS contact_activities_insert ON public.contact_activities;
DROP POLICY IF EXISTS contact_activities_update ON public.contact_activities;

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
```

La lectura copia la regla de acceso de D2, **con la misma lista explícita de roles**:
operaciones lee todo; el rol `asesor` lee si el contacto está asignado o creado por él, o
tiene un proceso o una tasación a su nombre; **cualquier otro rol (`abogado`, `agent`,
`viewer`, uno nuevo, o un usuario sin perfil) no lee nada, aunque tenga un contacto, un
proceso o una tasación a su nombre**. No alcanza con "todos menos el abogado": dejaría leer
a un rol viejo con un vínculo. `get_my_role()` ya existe (`20260429000000`, `SECURITY
DEFINER`, con permiso para `authenticated`) y devuelve el tipo `app_role`; se lo compara
como texto para que la policy no dependa de qué valores tenga ese tipo. Es defensa de
fondo: la barrera real es la ruta. Antes
de escribir la policy, el script confirma que `appraisals` tiene las columnas `contact_id`,
`assigned_to` y `user_id` (`information_schema`); si falta alguna, aborta.

Por qué así y no de otra forma:

- **Sin triggers.** La tabla no escribe en ninguna otra desde la base, así que no aplica la
  trampa del trigger `BEFORE` con FK (CLAUDE.md). Todo efecto lateral va por la ruta.
- **Las tres FK a `profiles` son `ON DELETE SET NULL`** (regla del proyecto). Por eso **no
  hay CHECK que ate `voided_at` con `voided_by`**: al borrar un usuario, `voided_by` pasa a
  NULL y ese CHECK haría fallar el borrado.
- **`occurred_at` con 5 minutos de margen:** cuando se corrige la hora, `occurred_at` lo
  calcula el servidor de la app y `created_at` lo pone la base; sin margen, un desfase de
  relojes rechazaría guardados válidos. Cuando no se corrige, la app no manda `occurred_at`
  y los dos salen del mismo `now()` de la base (D2, `resolverOcurrio`).
- **`source_activity_id` / `closed_by_activity_id` en `tasks`** en vez de guardar los ids en
  un JSON de la actividad: se consultan con un índice, permiten "deshacer" sin adivinar, dan
  el índice único que impide duplicar la tarea de la cadencia, y responden lo que hoy no se
  puede saber (qué tareas son automáticas y quién cerró una tarea ajena). Son columnas
  nuevas y opcionales: el código viejo no las nombra y sigue igual.
  Alternativa descartada: tipo de tarea nuevo `call_attempt` (obliga a tocar
  `tasks_type_check` y cada pantalla que lista tipos).
- **Alternativa descartada: una función de Postgres que guarde la llamada y las tareas en
  una transacción.** Sería atómica, pero duplicaría en SQL la lógica de `lib/supabase/tasks.ts`
  y dejaría la regla de la cadencia fuera de los tests de `lib/`. Ver D7.

**Aplicación y verificación** — `scripts/apply-contact-activities-pg.ts` (modelo:
`scripts/apply-short-links-pg.ts`), por el pooler `aws-0-us-west-2.pooler.supabase.com:5432`,
usuario `postgres.mncsnastmcjdjxrehdep`. Corre el archivo entero y **aborta con `throw`** si
algo de esto no se cumple; todo lo que inserta va dentro de una transacción que termina en
`ROLLBACK`:

1. La base es la de la app: `current_database()` y un `select` de un contacto conocido.
2. Existen la tabla, las 14 columnas, los 8 CHECK (`pg_constraint`), los 3 índices de la
   tabla y los 4 de `tasks` (`pg_indexes`), y `relrowsecurity = true` con **una sola**
   policy (la de SELECT).
3. `tasks` tiene `source_activity_id` y `closed_by_activity_id`. Antes de insertar la tarea
   y el proceso de prueba, el script lee de `information_schema.columns` las columnas
   `NOT NULL` sin valor por defecto de `tasks` **y de `deals`** (las dos tablas se crearon
   fuera de migraciones) y las completa; si aparece una que no conoce, aborta con su nombre.
   Comprueba además que **`tasks.created_at` tiene `column_default`** y que la tarea de
   prueba, insertada sin esa columna, queda con `created_at` cargado: el corte
   `creadasAntesDe` de `tareasACerrar` (D2) depende de eso. Si no se cumple, aborta.
4. Entran: una nota, una llamada `no_atendio`, una `volver_a_llamar` con `callback_at`, un
   `whatsapp_sent`.
5. Son rechazadas (23514): llamada sin resultado, nota con resultado, nota vacía,
   `kind` desconocido, resultado desconocido, `occurred_at` un día en el futuro,
   `occurred_at` de hace 8 días, texto de 2.001 caracteres, `volver_a_llamar` sin
   `callback_at`, `no_atendio` con `callback_at`, nota con `callback_at`.
6. Segundo insert con el mismo `client_token` → 23505. Dos tareas con el mismo
   `source_activity_id` → 23505.
7. RLS con sesión simulada (`SET LOCAL ROLE authenticated` +
   `set_config('request.jwt.claims', '{"sub":"<id>","role":"authenticated"}', true)`) usando
   un coordinador, un asesor y el abogado reales:
   - lectura: el coordinador lee la fila de prueba; el asesor no la lee si el contacto no es
     suyo, sí si se le asigna el contacto, y sí si solo se le asigna un proceso de ese
     contacto; el abogado lee 0 filas; **un rol fuera de la lista lee 0 filas aunque tenga
     el contacto asignado**: dentro de la misma transacción se le pone el rol `viewer` a la
     cuenta "Claude · pruebas", se le asigna el contacto de prueba y se comprueba que lee 0
     filas (el `ROLLBACK` le devuelve su rol). Antes, el script mira los valores del tipo
     `app_role` (`enum_range`): si `viewer` no existe usa `agent`, y si ninguno de los dos
     existe imprime que no hay rol fuera de la lista para probar y sigue;
   - escritura: el INSERT del coordinador, del asesor y del abogado falla (42501); el UPDATE
     del coordinador sobre `call_outcome`, `body`, `occurred_at` y `voided_at` de la llamada
     de prueba **no cambia la fila**, y su DELETE **no la borra**. Vale cualquiera de las dos
     formas de rechazo: 0 filas afectadas (hay permiso de tabla pero ninguna policy) o error
     42501 (ni siquiera hay permiso de tabla). Lo que el script comprueba al final, ya con
     `RESET ROLE`, es que la fila sigue ahí y con los mismos valores.
8. Borrar el contacto de prueba borra sus actividades (CASCADE) y deja en NULL el
   `source_activity_id` de la tarea de prueba.

Detalles del SQL de verificación, para que no dé un falso error:

- Cada caso que **debe ser rechazado** (puntos 5, 6 y 7) va entre `SAVEPOINT caso` y
  `ROLLBACK TO SAVEPOINT caso`: en Postgres un error deja la transacción abortada y el
  comando siguiente fallaría con 25P02.
- Después de cada bloque con `SET LOCAL ROLE authenticated` se hace `RESET ROLE` antes de
  seguir, y se vuelve a fijar `request.jwt.claims` para la sesión simulada siguiente.
- Las filas de prueba llevan `[TEST]` en el nombre del contacto y en el título de la tarea.
- El script cuenta **solo las filas de prueba** antes de empezar y después del `ROLLBACK`
  (contactos con nombre `[TEST] apply-contact-activities`, tareas con ese mismo título, y
  procesos y actividades de ese contacto), y aborta si quedó alguna. No compara los totales
  de `contacts`, `deals`, `tasks` ni `contact_activities`: es la base de producción y, si
  entra un lead real mientras corre, el total cambia sin que el script haya hecho nada.

Comando: `npm i --no-save pg && node --env-file=.env.local --import tsx scripts/apply-contact-activities-pg.ts`.
Como el script re-ejecuta el archivo completo, **cualquier arreglo posterior de una policy o
de un CHECK se hace también en este archivo**, no solo en una migración nueva. Por eso la
policy y los CHECK están escritos con `DROP … IF EXISTS` + crear de nuevo: así, volver a
correrlo sí aplica el arreglo. La doble ejecución se prueba al aplicar (tarea 2.3).

### D2. Módulos puros en `lib/crm/` (sin red, sin base, sin reloj propio)

Todos reciben `ahora: Date` por parámetro. Cada uno con su `.test.ts` al lado, escrito
antes que el código.

**`lib/crm/tipos.ts`** — tipos compartidos, sin lógica:

```ts
export const TIPOS_ACTIVIDAD = ['note', 'call', 'whatsapp_sent'] as const
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number]
export const RESULTADOS_LLAMADA =
  ['no_atendio', 'agendo', 'volver_a_llamar', 'no_interesa', 'numero_equivocado'] as const
export type ResultadoLlamada = (typeof RESULTADOS_LLAMADA)[number]
export interface Actividad {
  id: string; contact_id: string; deal_id: string | null
  kind: TipoActividad; call_outcome: ResultadoLlamada | null; body: string | null
  occurred_at: string; callback_at: string | null; created_at: string; updated_at: string | null
  created_by: string | null; voided_at: string | null; voided_by: string | null
}
export type Intento = Pick<Actividad, 'id' | 'deal_id' | 'kind' | 'call_outcome' | 'occurred_at' | 'created_at'>
export interface UsuarioMinimo { id: string; role: string }
```

**`lib/crm/horario-laboral.ts`**

```ts
export const ZONA_AR = 'America/Argentina/Buenos_Aires'
export const HORARIO_LABORAL = { dias: [1, 2, 3, 4, 5], inicio: '09:00', fin: '13:00' } as const
export interface FechaHoraAR { fecha: string; hora: string; diaSemana: number } // YYYY-MM-DD, HH:MM, 0=dom
export function enArgentina(instante: Date): FechaHoraAR
export function instanteDesdeAR(fecha: string, hora: string): Date
export function esDiaHabil(fecha: string): boolean
export function siguienteDiaHabil(ahora: Date): { fecha: string; hora: string }
export function diasDeCalendarioEntre(desde: Date, hasta: Date): number
```
Usa `Intl.DateTimeFormat` con `timeZone: ZONA_AR` (sin librería nueva). Tests: viernes,
sábado y domingo → lunes; miércoles → jueves; martes 22:30 AR (miércoles en UTC) → miércoles;
31 de diciembre → año siguiente; ida y vuelta `enArgentina`/`instanteDesdeAR`; 23:30 → 00:30
cuenta 1 día; fecha con formato inválido tira error.

**`lib/crm/deal-activo.ts`**

```ts
export const ETAPAS_CERRADAS = ['captured', 'lost', 'comprador'] as const
export function elegirDealActivo<T extends { id: string; stage: string; created_at: string }>(deals: T[]): T | null
export type SituacionProceso = 'solicitud' | 'clase_gratuita' | 'coordinada_o_posterior' | 'sin_proceso'
export function situacionProceso(deal: { stage: string; scheduled_date: string | null; origin: string | null } | null): SituacionProceso
export function puedeConvertirSolicitud(u: { id: string; puedeVerTodos: boolean; puedeCoordinar: boolean },
                                        deal: { stage: string; scheduled_date: string | null; origin: string | null; assigned_to: string | null }): boolean
export type MotivoNoConvertir = 'sin_permiso' | 'clase_gratuita' | 'ya_cambio_de_etapa'
export function motivoNoConvertir(u: { id: string; puedeVerTodos: boolean; puedeCoordinar: boolean },
                                  deal: { stage: string; scheduled_date: string | null; origin: string | null; assigned_to: string | null }): MotivoNoConvertir | null
export function puedeCerrarProceso(u: { id: string; role: string; puedeAvanzar: boolean },
                                   deal: { assigned_to: string | null }): boolean
export function esProcesoPropio(u: { id: string; role: string }, deal: { assigned_to: string | null }): boolean
```
`situacionProceso`: `request`, o `scheduled` sin `scheduled_date` → `solicitud` (el mismo
criterio de `deriveCRMStage`); etapa `clase_gratuita` → `clase_gratuita`; cualquier otra
etapa abierta → `coordinada_o_posterior`; sin proceso → `sin_proceso`. **Excepción:** un
proceso con `origin = 'clase_gratuita'` que esté en `request` o en `scheduled` sin día
cuenta como `clase_gratuita`, no como `solicitud`: no se convierte, se le abre un proceso
nuevo (D9). Hoy la interfaz no deja un proceso de la clase en ese estado; la regla existe
para que la ficha nunca ofrezca una conversión que la ruta va a rechazar.
`puedeConvertirSolicitud`: situación `solicitud`, permiso `pipeline.schedule`, y además
`pipeline.view_all` **o** `deal.assigned_to` = él.
`motivoNoConvertir` son esas mismas condiciones, **en orden y con nombre**, y
`puedeConvertirSolicitud(u, deal)` es `motivoNoConvertir(u, deal) === null` (una sola
definición). El orden: (1) sin `pipeline.schedule`, o sin `pipeline.view_all` y con el
proceso no asignado a él → `sin_permiso`; (2) `origin` o etapa `clase_gratuita` →
`clase_gratuita`; (3) etapa que no es `request` ni `scheduled` sin día →
`ya_cambio_de_etapa`; si no, `null`. (En la ruta, quien no tiene `pipeline.schedule` no
llega a esta función: la corta antes `requirePermission`; ver D9, paso 2.) La ficha usa
el booleano; la ruta de conversión usa
el motivo para decidir entre 404 y 409 (D9, paso 2): con el booleano solo, los 409 que
pide la spec no se alcanzarían nunca. Se evalúa **por proceso**, no solo sobre
el activo: la ruta `ficha` la calcula para cada proceso que lista (D4), y de ahí sale el
botón fijo "Coordinar tasación" del bloque "Procesos" (D5).
**Contacto con dos procesos abiertos.** El embudo reutiliza el contacto y crea un proceso
nuevo en cada registro (`lib/funnel/create-funnel-lead.ts`), así que una persona puede
tener dos solicitudes abiertas, o una solicitud y un proceso de clase más nuevo. La regla
no cambia: **el activo es el más reciente**, y a él se ligan las llamadas, el número de
intento y la cadencia. El otro proceso abierto no se toca: sigue en "Procesos", con sus
tareas pendientes, y si es una solicitud se convierte desde su propio botón. No se cambia
la regla para preferir la solicitud sobre la clase: es una decisión de negocio, confirmada por el
dueño el 2026-11-25 (el activo sigue siendo el más reciente), y cambiar el activo movería el número de intento de llamadas ya cargadas.
`esProcesoPropio` usa una **lista explícita de roles y falla cerrado**: admin, dueño y
coordinador → siempre verdadero; asesor → solo si `deal.assigned_to` = él (un proceso **sin
asesor no es suyo**); cualquier otro rol (`abogado`, `agent`, `viewer`, uno nuevo) → falso.
Es la misma idea que `canAccessDeal`, pero `canAccessDeal` deja pasar a todo rol que no sea
asesor (`entity-access.ts:34`) y el rol viejo `agent` tiene `pipeline.advance`
(`roles.ts:58-59`): por eso acá no se lo reutiliza.
`puedeCerrarProceso`: permiso `pipeline.advance` **y** `esProcesoPropio`. Con eso, `agent`
no cierra ni deshace nada.
Tests: sin procesos; todos cerrados; el más nuevo cerrado y uno viejo abierto; dos abiertos
(gana el más reciente); etapa desconocida cuenta como abierta; cada etapa en
`situacionProceso` (incluida `scheduled` con y sin día, y `request` con origen
`clase_gratuita` → `clase_gratuita`); asesor con solicitud propia, ajena y sin asesor;
coordinadora; coordinadora con un proceso de origen `clase_gratuita` en `request` (no puede
convertir); asesor que cierra proceso propio y ajeno; `esProcesoPropio` y
`puedeCerrarProceso` con cada rol (admin, dueño, coordinador, asesor dueño, asesor ajeno,
asesor con proceso sin asesor, abogado, `agent`, `viewer` y uno inventado → los seis
últimos, falso).

**`lib/crm/actividades.ts`**

```ts
export const MAX_MINUTOS_ATRAS = 7 * 24 * 60
export const MAX_LARGO_TEXTO = 2000
export const esquemaNuevaActividad: z.ZodType<NuevaActividad>       // ver D4
export const esquemaCambioActividad: z.ZodType<CambioActividad>     // ver D4
export function resolverOcurrio(ahora: Date, haceMinutos?: number): Date | null   // null = no mandar `occurred_at`
export function validarVolverEl(volverEl: { fecha: string; hora: string } | undefined, ahora: Date): { ok: true } | { ok: false; error: string }
export function numerarLlamadas(intentos: Intento[]): Map<string, number>
export function tituloActividad(a: Pick<Actividad, 'kind' | 'call_outcome'>, intento: number | null): string
export function puedeEditarNota(a: Actividad, u: UsuarioMinimo): boolean
export function puedeAnular(a: Actividad, u: UsuarioMinimo): boolean
export function esUltimoIntento(a: Intento, intentosDelProceso: Intento[]): boolean
export function intentosHasta(a: Intento, intentosDelProceso: Intento[]): Intento[]
```
`resolverOcurrio` devuelve `null` cuando `haceMinutos` falta o es 0: en ese caso la ruta
**no incluye `occurred_at` en el insert** y la base pone `occurred_at` y `created_at` con
su mismo valor por defecto (`now()`, que dentro de una misma sentencia da el mismo
instante). Así "Por defecto es ahora" se cumple exacto, sin depender de dos relojes. Con
`haceMinutos` mayor que 0 devuelve `ahora − haceMinutos`.
`numerarLlamadas` ordena por `occurred_at` y desempata por `created_at`; numera por proceso
(las llamadas sin proceso se numeran entre sí, como un grupo aparte). `esUltimoIntento` usa
el mismo orden: es verdadero si no hay otro intento no anulado posterior del mismo proceso.
`intentosHasta` devuelve los intentos no anulados del proceso que ocurrieron hasta `a`
inclusive. Tests: los escenarios de "El número de intento se calcula" (incluido el de
llamadas sin proceso) y de permisos de la spec `crm-registro-actividad`; texto solo con
espacios; texto en NFD; 2.000 y 2.001 caracteres; `hace_minutos` 0, 10.080, 10.081, −1 y
decimal; `resolverOcurrio` sin minutos y con 0 → `null`, con 30 → 30 minutos antes; `volver_el` un minuto en el pasado; rol desconocido no puede nada; dos intentos con
el mismo `occurred_at` (desempata `created_at`).

**`lib/crm/cadencia.ts`**

```ts
export interface EstadoCadencia { noAtendioSeguidas: number; whatsappEnLaRacha: boolean }
export function estadoCadencia(intentosHastaElEvaluado: Intento[]): EstadoCadencia
export interface EntradaCadencia {
  evaluado: Intento                    // el intento sobre el que se decide (nuevo o reintentado)
  intentosDelProceso: Intento[]        // no anulados, incluye `evaluado`
  numeroDeIntento: number | null       // null si es WhatsApp
  nombreContacto: string
  situacion: SituacionProceso
  puedeConvertir: boolean              // de quien HACE EL PEDIDO (solo para `ofrecer`)
  puedeCerrar: boolean                 // de quien HACE EL PEDIDO (solo para `ofrecer`)
  puedeAbrir: boolean                  // `esProcesoPropio` de quien HACE EL PEDIDO (solo para `ofrecer`)
  procesoPropio: boolean               // `esProcesoPropio` de quien REGISTRÓ (para las tareas); sin proceso, true
                                       // (sin proceso no hay "proceso ajeno"; lo que un asesor cierra ahí lo limita `soloPropias`)
  hayTareaWhatsappDeCadenciaPendiente: boolean   // de OTRO intento: nunca la que creó `evaluado` (ver abajo)
  volverEl: { fecha: string; hora: string } | null   // sale de `callback_at` de la actividad
  cargadoEn: Date                      // `created_at` de la actividad: el "ahora" de la decisión
}
export interface TareaACrear { title: string; channel: 'call' | 'message'; due_date: string; due_time: string }
export type MotivoSinTarea =
  | 'whatsapp_ya_enviado' | 'whatsapp_ya_pendiente' | 'sin_proceso' | 'secuencia_terminada'
  | 'fuera_de_orden' | 'proceso_ajeno' | 'no_corresponde'
export type Ofrecer =
  | 'coordinar_solicitud' | 'coordinar_nuevo' | 'abrir_proceso' | 'pedir_coordinacion'
  | 'cerrar_proceso' | 'pedir_cierre' | 'nada_que_cerrar' | 'proceso_ya_coordinado' | null
export interface DecisionCadencia {
  aplica: boolean                      // false = intento fuera de orden: no se crea ni se cierra nada
  tarea: TareaACrear | null
  motivoSinTarea: MotivoSinTarea | null
  cerrarWhatsapp: boolean              // WhatsApp marcado, o llamada atendida
  ofrecer: Ofrecer
}
export function decidirCadencia(e: EntradaCadencia): DecisionCadencia
export interface TareaPendiente {
  id: string; title: string; type: string; channel: string | null
  assigned_to: string | null; assigned_role: string | null; created_at: string
  deal_id: string | null; contact_id: string | null; appraisal_id: string | null; source_activity_id: string | null
}
export function tareasACerrar(pendientes: TareaPendiente[], c: {
  dealId: string | null; contactId: string; registranteId: string
  incluirWhatsapp: boolean; creadasAntesDe: string
  soloPropias: boolean                 // true cuando el proceso no es de quien registró, o cuando un asesor registra sin proceso
}): TareaPendiente[]
```
Reglas de `decidirCadencia` (las de la spec `crm-cadencia-llamadas`):

- **Primero, el orden.** Si `evaluado` no es el último intento del proceso
  (`esUltimoIntento`), devuelve `aplica: false`, sin tarea, `motivoSinTarea:
  'fuera_de_orden'`, y el mismo `ofrecer` que le correspondería. Vale para cualquier
  resultado, incluido "volver a llamar".
- **La racha se calcula siempre con `intentosHasta(evaluado)`**, nunca con el historial
  entero: da lo mismo en el guardado y en el reintento.
- **Orden de precedencia para "No atendió"** (se corta en el primero que se cumple; es el
  mismo orden que citan los requisitos de la spec):
  1. intento fuera de orden → nada (`fuera_de_orden`);
  2. sin proceso activo → nada (`sin_proceso`);
  3. el proceso activo no es de quien registró (`procesoPropio` falso) → nada
     (`proceso_ajeno`; ver "Asesor sobre un proceso que no es suyo", más abajo);
  4. hay un WhatsApp marcado en la racha → nada (`whatsapp_ya_enviado`);
  5. racha ≥ 2 y ya hay pendiente una tarea de WhatsApp **de la cadencia**, de otro intento
     **y de este mismo proceso** → nada (`whatsapp_ya_pendiente`; una tarea de mensaje
     creada a mano, o la de la cadencia de otro proceso, no frena);
  6. racha ≥ 2 → "Enviar WhatsApp a {nombre}" (`message`);
  7. racha 1 → "Llamada N+1 a {nombre}" (`call`).

  Las dos tareas, para `siguienteDiaHabil(cargadoEn)` a las `HORARIO_LABORAL.inicio`.

  **Caso que queda escrito: la tarea "Enviar WhatsApp" completada a mano con el tilde, sin
  tocar "Marcar WhatsApp enviado".** No hay WhatsApp marcado en la racha (punto 4) ni tarea
  pendiente (punto 5), así que la próxima "No atendió" cae en el punto 6 y crea **otra**
  "Enviar WhatsApp". Es a propósito: el tilde no deja ningún registro de que el mensaje
  salió, y lo único que termina la secuencia es marcar el WhatsApp o que la persona
  atienda. Mientras nadie lo marque, cada "No atendió" vuelve a pedirlo.
- `volver_a_llamar` → "Llamar a {nombre}" en `volverEl`, con o sin proceso, y también
  sobre un proceso ajeno (es un pedido explícito de la persona, y la tarea queda a nombre de
  quien registró). Solo la frena el intento fuera de orden.
- **Asesor sobre un proceso que no es suyo** (`procesoPropio` falso: el proceso activo es
  de otro asesor o no tiene asesor; opción conservadora, confirmada por el dueño el
  2026-11-25). La
  llamada o el WhatsApp se guardan igual, ligados a ese proceso y con su número, porque el
  dato no se pierde y la "última llamada" tiene que ser verdad para todos. Pero **no se
  mueve la cola de quien lleva el proceso**: "No atendió" y el WhatsApp marcado no agendan
  nada (`proceso_ajeno`), y el cierre de tareas se limita a las que están asignadas a quien
  registró (`soloPropias`). No se cierran las tareas de entrada de la coordinación, ni las
  de su cadencia, ni las de otro asesor. Efecto que se acepta y se dice: ese intento **sí
  cuenta en la racha** del proceso (la persona de verdad no atendió, o de verdad recibió un
  WhatsApp), así que la próxima "No atendió" de la coordinación puede pedir el WhatsApp
  antes, o no agendar nada si el asesor ya lo marcó.
- **`hayTareaWhatsappDeCadenciaPendiente` nunca cuenta la tarea del propio intento.** Quien
  arma la entrada (`aplicarCadencia`, D4) la calcula sobre las tareas pendientes de tipo
  mensaje con `source_activity_id` no vacío **y distinto del id de `evaluado`**, **con
  `deal_id` igual al del intento evaluado** (o, sin proceso, `deal_id` vacío y el mismo
  `contact_id`), y creadas antes que `evaluado` (el mismo corte `creadasAntesDe` de
  `tareasACerrar`). El filtro por proceso importa porque las tareas de la cadencia de un
  proceso cerrado quedan pendientes (Risks): sin él, a una persona que vuelve a entrar por
  el embudo con la tarea "Enviar WhatsApp" vieja sin completar no se le crearía la del
  proceso nuevo, y el aviso diría "ya hay una pendiente". Sin excluir la propia, el
  pedido repetido o el reintento de la segunda "No atendió" encontraría pendiente la tarea
  "Enviar WhatsApp" que creó él mismo y contestaría "ya hay una pendiente".
- **Cuándo se devuelve cada `motivoSinTarea`** (siempre con `tarea: null`; si hay tarea, el
  motivo es `null`):
  - `fuera_de_orden`: `evaluado` no es el último intento del proceso (cualquier resultado).
  - `secuencia_terminada`: `evaluado` es un WhatsApp marcado. Marcarlo termina la secuencia.
  - `whatsapp_ya_enviado`: "No atendió" con un WhatsApp marcado en la racha.
  - `whatsapp_ya_pendiente`: "No atendió" con racha ≥ 2 y una tarea de WhatsApp de la
    cadencia, de otro intento, todavía pendiente.
  - `sin_proceso`: "No atendió" sin proceso activo.
  - `proceso_ajeno`: "No atendió" o WhatsApp marcado sobre un proceso activo que no es de
    quien registró. Para el WhatsApp gana sobre `secuencia_terminada`. Texto del aviso:
    "Quedó anotada. Este proceso lo lleva otra persona: no se agenda la siguiente ni se
    cierran las tareas de esa persona." (Se dice "de esa persona" y no "suya": cuando al
    asesor sí se le cierra su propia "Llamar a…", el aviso lo dice en otro renglón, y
    "suya" se podía leer como "tuya". La maqueta no tenía este texto.)
  - `no_corresponde`: el resultado nunca agenda nada (`agendo`, `no_interesa`,
    `numero_equivocado`). El aviso no dice nada sobre tareas; solo muestra `ofrecer`.
- `ofrecer` sale de esta tabla, que es la misma de los escenarios de la spec (el texto y
  los botones los dibuja `AvisoGuardado` a partir del valor):

| Resultado | Situación | Texto del aviso | Botones | `ofrecer` |
| --- | --- | --- | --- | --- |
| Agendó | Proceso activo en Solicitud y quien registra puede coordinarlo | "Falta coordinar día, hora y asesor de la tasación." | "Coordinar tasación" (convierte esa solicitud) | `coordinar_solicitud` |
| Agendó | Proceso activo en Clase gratuita, o sin proceso activo | "Falta coordinar día, hora y asesor de la tasación. Se abre como un proceso nuevo." | "Coordinar tasación" (persona ya cargada; crea un proceso nuevo, como hoy) | `coordinar_nuevo` |
| Agendó | Proceso activo en Coordinada o en una etapa posterior, y quien lo ve puede abrirlo (`puedeAbrir`) | "El proceso ya está en {etapa}: no hace falta coordinar de nuevo." | "Abrir el proceso" | `abrir_proceso` |
| Agendó | Proceso activo en Coordinada o en una etapa posterior, y quien lo ve **no** puede abrirlo | el mismo texto | ninguno (el enlace le daría 403) | `proceso_ya_coordinado` |
| Agendó | Proceso activo en Solicitud que quien registra no puede coordinar | "Falta coordinar día, hora y asesor de la tasación. Pedíselo a la coordinación." | ninguno | `pedir_coordinacion` |
| No le interesa / Número equivocado | Hay proceso activo y quien registra puede cerrarlo | "El proceso sigue abierto. Si no hay nada más que hacer, podés cerrarlo." | "Marcar proceso como perdido" y "Dejarlo abierto" | `cerrar_proceso` |
| No le interesa / Número equivocado | Hay proceso activo y quien registra no puede cerrarlo | "El proceso sigue abierto. Si hay que cerrarlo, avisale a la coordinación." | ninguno | `pedir_cierre` |
| No le interesa / Número equivocado | Sin proceso activo | "No tiene ningún proceso abierto: no hay nada que cerrar." | ninguno | `nada_que_cerrar` |

  "Solicitud" incluye `scheduled` sin día (`situacionProceso`). "Puede coordinarlo" es
  `puedeConvertirSolicitud`; "puede cerrarlo" es `puedeCerrarProceso`; "puede abrirlo" es
  `esProcesoPropio`. **Las tres se calculan con quien hace el pedido** (`puedeConvertir`,
  `puedeCerrar`, `puedeAbrir`), que en el guardado es quien registra y en "Reintentar"
  puede ser otra persona: los botones son para quien los ve. Las tareas, en cambio, salen
  siempre de quien registró (`procesoPropio`, `registranteId`). Así ningún botón del aviso
  lleva a una pantalla que a esa persona le respondería 403 o 404.
- `cerrarWhatsapp` es verdadero si el intento es un WhatsApp marcado **o** una llamada
  atendida (cualquier resultado distinto de `no_atendio`).

Reglas de `tareasACerrar`: entra una tarea si fue creada antes que la actividad
(`created_at` < `creadasAntesDe`), es del proceso (`deal_id` igual) o está ligada solo al
contacto (`deal_id` vacío y `contact_id` igual), y además es:

- (a) `update_contact` sin `appraisal_id` — la de entrada del lead y las del agente de
  tasación; la que se crea al armar una tasación lleva `appraisal_id` y queda afuera; o
- (b) `follow_up` con canal `call` y (`source_activity_id` no vacío **o** `assigned_to` =
  quien registra **o** `assigned_role` = `coordinador`); o
- (c) —solo con `incluirWhatsapp`— `follow_up` con canal `message` y `source_activity_id`
  no vacío.

Con `soloPropias` se aplica un filtro más sobre ese resultado: **queda solo lo que tiene
`assigned_to` = quien registra**. En la práctica, sus propias tareas de llamada; nunca una
`update_contact` de la coordinación. `soloPropias` es verdadero en dos casos:

- el proceso de la actividad no es de quien registró (`procesoPropio` falso); o
- **quien registró es un asesor y la actividad no tiene proceso** (`deal_id` vacío). Sin
  esta segunda parte, un asesor que llama a una persona sin proceso abierto cerraría las
  tareas ligadas solo al contacto de la coordinación (una `update_contact`, o una llamada
  que la coordinadora se agendó a mano): justo lo contrario de "no mueve la cola de otros".
  Para admin, dueño y coordinador no cambia nada: sin proceso siguen cerrando las tareas
  ligadas solo al contacto. Opción conservadora, confirmada por el dueño el 2026-11-25.

El filtro por `created_at` es lo que impide que un reintento tardío cierre una tarea que
creó una llamada posterior.

`registranteId` es **siempre `created_by` de la actividad**, en el guardado, en el guardado
repetido y en el reintento, aunque el reintento lo toque otra persona (igual que la
asignación de la tarea nueva, D7). Si ese usuario ya no existe (`created_by` vacío), es
quien hace el pedido, **y con esa misma persona se calcula `procesoPropio`** (D4, paso 3b):
las tres cosas —quién registra, de quién es el proceso y a quién va la tarea— salen
siempre del mismo usuario.

**La tarea "Llamar a {nombre}" de un asesor sobre un proceso ajeno entra en (b).** Nace de
un "volver a llamar", así que lleva `source_activity_id`; la próxima llamada de quien
lleva el proceso (o de la coordinación) la cierra, y el aviso la nombra. Es la regla
aprobada en la maqueta —toda llamada completa las llamadas pendientes de la cadencia— y
vale igual entre dos coordinadoras. La llamada que el asesor se agendó **a mano** no lleva
`source_activity_id` y no se toca. Confirmado por el dueño el 2026-11-25.

Tests: una tabla con cada escenario de la spec (racha 1, 2 y 3; WhatsApp antes y después de
"atendió"; anuladas; sin proceso; viernes; las ocho filas de la tabla de "ofrecer";
tarea de WhatsApp de la cadencia pendiente y tarea de mensaje manual; **tarea de WhatsApp
de la cadencia pendiente en otro proceso → no frena** (se crea la del proceso evaluado);
**`ofrecer` con quien pide distinto de quien registró** (llamada "Agendó" de la
coordinadora reintentada por un asesor que no puede convertir → `pedir_coordinacion`, y las
tareas siguen a nombre de la coordinadora); **segunda "No
atendió" evaluada dos veces** (la segunda vez ya existe su propia tarea de WhatsApp: la
entrada llega con `hayTareaWhatsappDeCadenciaPendiente` en falso y la decisión es la misma
que la primera vez); un caso por cada `motivoSinTarea`; **intento
fuera de orden** con `no_atendio`, con `volver_a_llamar` y con WhatsApp; hora corregida que
igual queda última; tarea manual de un asesor, de otra coordinadora y propia; tarea
`update_contact` con `appraisal_id` y la del agente de tasación; tarea de otro proceso;
tarea creada después de la actividad; llamada atendida con tarea de WhatsApp pendiente;
**WhatsApp marcado sin llamadas previas y después "No atendió"** → nada; **"volver a
llamar", WhatsApp marcado, "No atendió"** → nada; **proceso ajeno**: "No atendió" y
WhatsApp → `proceso_ajeno` sin tarea, "volver a llamar" → crea su tarea, "Agendó" en
Coordinada → `proceso_ya_coordinado`, y `tareasACerrar` con `soloPropias` deja afuera la
tarea de entrada de la coordinación y la de la cadencia de otro, y deja adentro la llamada
propia; **asesor sin proceso** (`dealId` vacío, `soloPropias` verdadero): cierra su propia
llamada ligada al contacto y deja pendientes la `update_contact` y la llamada manual de la
coordinación; **coordinadora sin proceso**: cierra las tres (en ese ejemplo la llamada del
asesor es la que nació de su "volver a llamar", o sea con `source_activity_id`); **caso
espejo: la llamada que un asesor se creó a mano, ligada solo al contacto, queda pendiente
cuando llama la coordinadora** (regla (b): no tiene `source_activity_id`, no está a nombre
de quien registra ni del rol coordinador); **la tarea "Llamar a {nombre}" que un asesor creó con "volver a llamar" sobre un
proceso ajeno, cuando después llama la coordinación → se cierra; la que ese asesor se
agendó a mano → no**; y la precedencia entera, con un caso que cumple dos condiciones a la vez por cada
par de reglas vecinas).

**`lib/crm/ultima-llamada.ts`**

```ts
export interface UltimaLlamada { texto: string; dias: number | null; alerta: boolean }
export function ultimaLlamada(ultimaEn: string | null, ahora: Date, etapaCRM: string | null): UltimaLlamada
```
Tests: los escenarios de "Estado de la última llamada" y de "Alerta solo cuando la solicitud
está sin atender" (nunca, hoy, ayer, 2 días, 3 días, cruce de medianoche, cada etapa).
`ultimaEn` no lo calcula este módulo: lo arma la ruta `ficha` (D4) y es de la **persona**,
no del proceso activo.

**`lib/crm/deshacer-perdido.ts`**

```ts
export const MINUTOS_PARA_DESHACER = 10
export function puedeDeshacerPerdido(
  deal: { stage: string; lost_at: string | null },
  ultimoCambio: { from_stage: string | null; to_stage: string; changed_at: string } | null,
  ahora: Date,
): { ok: true; volverA: string; limpiarLostAt: boolean } | { ok: false; motivo: string }
```
Vale solo si el proceso está en `lost`, la última fila de su historial es el paso a `lost`,
tiene `from_stage` y ocurrió hace `MINUTOS_PARA_DESHACER` o menos. `limpiarLostAt` es
verdadero si `lost_at` es de ese mismo momento (±1 minuto): un `lost_at` más viejo es de una
vez anterior y no se toca. **No distingue por dónde se descartó:** "Descartar" de
`/pipeline/[id]` usa el mismo `advance` y deja la misma fila en el historial, así que un
proceso descartado desde ahí hace menos de 10 minutos también se puede deshacer (la spec
lo dice en un escenario). Lo que sí frena es que el proceso haya vuelto a cambiar de etapa
después. **El plazo se
puede usar entero en pantalla:** el toast dura 6 segundos, pero el ítem del proceso
descartado en "Procesos" lleva un botón "Deshacer" mientras esta función diga que vale
(D5, "Deshacer del perdido"). Tests: recién descartado; hace 11 minutos; la última fila no es a
`lost`; sin `from_stage`; `lost_at` viejo; proceso que no está en `lost`.

**`lib/auth/contact-access.ts`** (puro) y `canAccessContact` en `lib/auth/entity-access.ts`:

```ts
export type AlcanceContactos = 'todos' | 'propios' | 'ninguno'
export function alcanceContactos(role: string): AlcanceContactos    // admin/dueno/coordinador → todos; asesor → propios; el resto → ninguno
export interface VinculosContacto {
  assigned_to: string | null; created_by: string | null
  asesoresDeProcesos: (string | null)[]      // deals.assigned_to de sus procesos
  asesoresDeTasaciones: (string | null)[]    // appraisals.assigned_to y appraisals.user_id
}
export function puedeVerContacto(u: UsuarioMinimo, c: VinculosContacto): boolean
export function puedeReasignarContacto(role: string): boolean       // solo 'todos'
// entity-access.ts
export async function canAccessContact(user: UserWithProfile, id: string): Promise<boolean>
```
Para el asesor, el contacto es suyo si `assigned_to` o `created_by` es él, **o si tiene un
proceso o una tasación de ese contacto a su nombre**. Sin esa segunda parte el change rompe
`ContactEditor` en `/pipeline/[id]` y `/appraisals/[id]` (ver Context). `canAccessContact`
hace hasta tres lecturas cortas con service role (contacto; `deals` por `contact_id` y
`assigned_to`; `appraisals` por `contact_id`) y corta en la primera que da acceso; un error
de lectura devuelve `false`.
La lista de roles es explícita y **falla cerrado** (un rol nuevo o `agent`/`viewer` no ve
nada), igual que `appraisal-access.ts`. Tests: cada rol; contacto sin dueño; asignado;
creado por él; **contacto sin dueño con un proceso asignado al asesor → puede**; con una
tasación suya → puede; con un proceso de otro asesor → no puede; id inexistente.

**Cambia la decisión 8.8 del diseño general** (que decía "`assigned_to` o `created_by`, u
operaciones"): se amplía para el asesor. Motivo: no romper lo que hoy funciona. El dueño
lo confirmó el 2026-11-25.

### D3. Tareas: se reutiliza `lib/supabase/tasks.ts` y se le suman cinco funciones

`CreateTaskInput` gana `source_activity_id?: string | null`. La tarea de la cadencia se crea
con `createTask({ type: 'follow_up', channel, title, description: 'Creada sola por la
cadencia de llamadas.', assigned_to: <quien registró>, created_by: <quien registró>,
deal_id, contact_id, due_date, due_time, all_day: false, source_activity_id })`. No se usa
`createTaskForRole` (deduplica `follow_up` y reparte entre coordinadores).

Funciones nuevas, todas con service role como el resto del archivo:

```ts
export async function getPendingTasksForContact(contactId: string, dealIds: string[]): Promise<TareaDeFicha[]>
export async function createCadenceTask(input: CreateTaskInput & { source_activity_id: string }): Promise<{ id: string; yaExistia: boolean }>
export async function closeTasksByActivity(ids: string[], activityId: string): Promise<string[]>   // devuelve los ids que cerró
export async function undoTasksOfActivity(activityId: string): Promise<{ descartadas: number; reabiertas: number }>
```
- `getPendingTasksForContact`: pendientes con `contact_id` = contacto **o** `deal_id` en sus
  procesos, de cualquier usuario, con el nombre y el rol del asignado. Sin el filtro de
  fecha de `getMyTasks` (que esconde las futuras) y devolviendo el total real. **El nombre y
  el rol se traen con una segunda consulta** a `profiles` (`select id, full_name, role …
  in (ids)`), como hace `GET /api/deals` (`route.ts:41-54`): `tasks` se creó a mano y no hay
  constancia de una FK `tasks.assigned_to → profiles`, así que un embed de PostgREST podría
  fallar.
- `createCadenceTask`: si el insert choca con `uq_tasks_source_activity` (23505), devuelve la
  tarea existente con `yaExistia: true`. Eso hace seguro el reintento.
- `closeTasksByActivity`: `update … set status='completed', completed_at=now,
  closed_by_activity_id=<actividad> where id in (…) and status='pending'`. La elección de
  cuáles la hace `tareasACerrar` (puro) sobre la lista que devuelve `getPendingTasksForContact`.
- `undoTasksOfActivity`: la tarea con `source_activity_id` = actividad y `status='pending'`
  pasa a `dismissed` (no se borra nada); las tareas con `closed_by_activity_id` = actividad
  y `status='completed'` vuelven a `pending` de a una, salteando la que choque con un índice
  único de pendientes (23505). **Al reabrir se escribe `status='pending'`,
  `completed_at = null` y `closed_by_activity_id = null`** en el mismo `update`: una tarea
  pendiente no puede quedar diciendo que una llamada la cerró. La función **se puede correr
  dos veces**: la segunda encuentra solo lo que la primera no llegó a hacer (ver D8).

**Qué tareas se listan en la ficha** lo decide una función pura,
`lib/crm/tareas-ficha.ts` (+ test):

```ts
export function tareasVisiblesEnFicha<T extends { type: string; deal_id: string | null; assigned_to: string | null }>(
  tareas: T[],
  c: { dealsConTasacionAgendada: string[]; dealsOcultos: string[]; usuarioId: string; soloPropiasSinProceso: boolean },
): T[]
```
Saca (a) las `new_assignment` cuyo `deal_id` está en `dealsConTasacionAgendada` (esa
tasación ya se ve en su tarjeta: no se repite), (b) las tareas cuyo `deal_id` está en
`dealsOcultos` y (c), cuando `soloPropiasSinProceso` es verdadero, **las tareas sin
`deal_id` (ligadas solo al contacto) que no están asignadas a quien mira**. En (b) y en
(c) vale la misma salvedad: **una tarea asignada a quien mira (`assigned_to` =
`usuarioId`) nunca se oculta**, aunque su proceso no sea suyo. Es el
caso del asesor que registró "volver a llamar" sobre un proceso de otro: su tarea "Llamar a
{nombre}" tiene que aparecer en su ficha.
`dealsOcultos` es, para un asesor, **todo proceso del contacto que no está asignado a él:
los de otros asesores y también los que no tienen asesor**; para operaciones, lista vacía
(ver "Lo que ve un asesor" en D4). `soloPropiasSinProceso` es verdadero para el alcance
`propios` (asesor) y falso para operaciones. Motivo de (c): toda tarea creada con
"+ Tarea" desde la ficha queda ligada solo al contacto (`AddTaskDialog` manda
`contact_id`, y una tarea se liga a una sola entidad), así que sin (c) un asesor vería —y
podría completar— las tareas que la coordinación u otro asesor se anotaron sobre esa
persona. El dueño confirmó que en Tareas el asesor ve solo lo que está a su nombre. La aplica `GET …/tasks` y nadie más: **el cierre
de tareas de la cadencia trabaja sobre la lista completa** de `getPendingTasksForContact`,
sin este filtro. El número de "Tareas · N" y el de la pestaña del celular es el largo de la
lista ya filtrada: **cuenta lo que se lista**.

Y una función de lectura para armar siempre la misma respuesta:

```ts
export async function getTasksOfActivity(activityId: string): Promise<{
  creada: { id: string; title: string; due_date: string; due_time: string; channel: string } | null
  cerradas: { id: string; title: string }[]
}>
```
Lee `tasks` por `source_activity_id` (sin las `dismissed`) y por `closed_by_activity_id`
**con `status='completed'`** (una tarea reabierta ya no figura como cerrada; además, al
reabrirla se le vació esa columna).
La respuesta de la ruta se arma **leyendo de acá**, no con lo que devolvió cada escritura
(ver D4, doble pedido).

### D4. Rutas

Todas: `requireAuth()` fuera del `try`; después el permiso con `alcanceContactos` /
`canAccessContact`; **403** si el alcance del rol es `ninguno` (abogado), **404**
`{ error: 'No encontramos este contacto' }` si el contacto no existe o no es del asesor (la
misma respuesta para los dos casos, para no confirmar que existe); **400** con el primer
mensaje de Zod en castellano; **500** `{ error: 'No se pudo guardar. Probá de nuevo.' }` con
el detalle solo en el log. Sin sesión, el middleware ya responde 401. `params` es `Promise`.

**Todo corre con service role, así que la ruta es la única barrera.** Dos reglas que valen
para todas:

- **La actividad tiene que ser de ese contacto.** Toda lectura o escritura por `activityId`
  filtra además por `contact_id` = el id de la URL; si no coincide, **404**, igual que si no
  existiera. Sin esto, un asesor con acceso a su contacto X podría anular o reintentar la
  cadencia de una llamada de otro contacto.
- **El `client_token` repetido solo devuelve lo propio.** Ante 23505 por `client_token`, se
  lee la fila existente: si su `contact_id` es el de la URL y su `created_by` es el usuario,
  se sigue con esa fila; si no, **409** `{ error: 'No se pudo guardar. Probá de nuevo.' }`
  sin devolver ningún dato de la otra.

| Método y ruta | Qué hace |
| --- | --- |
| `GET /api/contacts/[id]/ficha` | Persona, proceso activo y su situación, detalles, asesor, última llamada (`ultimaEn` = el `occurred_at` más nuevo de las filas de `contact_activities` de ese contacto con `kind = 'call'` y `voided_at` vacío, **sin filtrar por `deal_id`**: cuenta la llamada de cualquier proceso, abierto o cerrado, y la que no tiene proceso), procesos (cada uno con `puede_convertir` = `puedeConvertirSolicitud` de quien mira sobre ese proceso, y con `deshacer_hasta` = el instante hasta el que quien mira puede deshacer su "perdido", o `null`: sale de `puedeDeshacerPerdido` + `puedeCerrarProceso`, y la última fila de `deal_stage_history` se lee solo para los procesos en `lost` cuyo `stage_changed_at` es de los últimos 10 minutos), tasaciones agendadas y archivos, calculados en el servidor con las funciones de D2. No devuelve permisos sueltos que ninguna pieza use: "Coordinar como proceso nuevo", "Abrir el proceso" y "Marcar proceso como perdido" existen solo en el aviso y salen de `cadencia.ofrecer`. |
| `GET /api/contacts/[id]/activities?filtro=todo\|llamadas\|notas\|actividad&antes=<iso>` | 50 registros no anulados + `hay_mas`, cada uno con `intento`, autor, tarea que creó y `puede_editar`/`puede_anular`. `llamadas` = solo `call`; `actividad` = lo que no es llamada ni nota (acá, `whatsapp_sent`). |
| `POST /api/contacts/[id]/activities` | Guarda nota, llamada o WhatsApp y corre la cadencia. |
| `PATCH /api/contacts/[id]/activities/[activityId]` | Edita una nota o anula un registro. |
| `POST /api/contacts/[id]/activities/[activityId]/cadencia` | Sin cuerpo. Reintenta, sin duplicar, lo que la cadencia debía hacer. |
| `GET /api/contacts/[id]/tasks` | Tareas pendientes del contacto y sus procesos, pasadas por `tareasVisiblesEnFicha` (D3). Devuelve la lista y `total` = su largo. |
| `GET` y `PUT /api/contacts/[id]` (existentes) | Se les agrega el permiso (`canAccessContact`, con la regla de D2); el `PUT` pasa a validar con Zod una lista cerrada de campos (`full_name`, `phone`, `email`, `origin`, `notes`, y `assigned_to` solo si `puedeReasignarContacto`). **`phone`, `email`, `origin` y `notes` aceptan `null` y texto vacío** (los dos se guardan como `null`): `ContactEditor` los manda en `null` cuando están vacíos (`ContactEditor.tsx:135-141`) y con un esquema que solo aceptara texto el botón "Editar" de hoy empezaría a dar 400. El Background se guarda con este `PUT` (`{ notes }`), así que **el esquema es parcial**: todos los campos son opcionales, se exige al menos uno de la lista (si no, 400) y `full_name`, cuando viene, no puede quedar vacío. **Un `assigned_to` o `created_by` mandado por quien no puede reasignar se descarta en silencio** (no da error): el resto de la edición se guarda, como dice la spec. Si después de descartar no queda ningún campo, 400. **El esquema no valida el formato de `email` ni de `phone`**: los recorta y les pone un tope de largo (nombre, teléfono y email 200 caracteres; `notes` 10.000; la tarea 5.1 mide el largo máximo que hay hoy en la base y, si algún contacto lo supera, se sube el tope antes de codear). Motivo: `ContactEditor` manda siempre los cinco campos, y si se rechazara un email viejo mal cargado, "Editar" daría 400 para ese contacto aunque solo se le cambie el teléfono. **`origin`** acepta vacío o uno de los cuatro valores del CHECK de la base (`embudo`, `referido`, `historico`, `clase_gratuita`); otro valor responde 400 "Origen no válido" (hoy ya falla, con un 500 de Postgres: no se rompe nada que funcione). **`assigned_to`** de quien sí puede reasignar tiene que ser el id de un perfil que existe: si no tiene forma de id o no existe, **400** "Ese usuario no existe" (hoy es un 500 por la clave foránea); vacío o `null` deja el contacto sin asesor. |
| `GET /api/contacts` (existente, la lista) | Se le agrega el corte por rol: **403** cuando `alcanceContactos(role)` es `ninguno` (hoy el abogado recibe 200 con la lista vacía). Para los demás no cambia: el asesor sigue recibiendo solo los asignados a él (`resolverAlcanceAsignado`). El menú del abogado no tiene "Contactos", así que ninguna pantalla suya la pide. |
| `POST /api/contacts` (existente) | **403** cuando `alcanceContactos(role)` es `ninguno`. Deja de pasar el cuerpo crudo a `createContact`: arma el insert con una **lista cerrada** (`full_name`, `phone`, `email`, `origin`, `notes`). `created_by` lo pone **siempre el servidor** (= usuario). `assigned_to`: si quien crea es asesor, el servidor pone su id y descarta lo que venga; si es de operaciones, se acepta el que mande (o vacío). |
| `DELETE /api/contacts/[id]` (existente) | Pasa a `requireAuth()` + chequeo explícito del rol: quien no es admin ni dueño recibe **403** en JSON (`{ error }`) y no se borra nada. **No se usa `requireRole`:** no devuelve un error, hace `redirect('/')` (`lib/auth/require-role.ts`). Adentro del `try`, como hoy, eso termina en un 500; afuera del `try` sería una redirección que el `fetch` sigue hasta un 200, y la lista `/contacts` —que decide por `r.value.ok` (`contacts/page.tsx:234-236`)— sacaría de la pantalla un contacto que no se borró. |
| `POST /api/deals` (existente) | Acepta `from_deal_id` o `contact_id` (D9). Sin ninguno de los dos, no cambia nada. |
| `POST /api/deals/[id]/undo-lost` (nueva) | Deshace un "perdido" recién marcado (D9). |

**Lo que ve un asesor dentro de la ficha (opción conservadora, confirmada por el dueño el
2026-11-25).**
Poder abrir la ficha no es poder ver todo lo que cuelga del contacto. Cuando quien mira
tiene alcance `propios`:

- "Procesos", "Tasaciones agendadas" y "Archivos" listan **solo lo que está a su nombre**
  (`deals.assigned_to`, `appraisals.assigned_to`/`user_id`, `properties.assigned_to` = él).
  Lo de otros asesores no se lista ni se cuenta, y así ningún enlace de la ficha le da 403.
- "A su nombre" es literal: un proceso **sin asesor** tampoco se le lista (es de la
  coordinación; `/pipeline/<id>` le respondería 403 y el CRM ya le oculta esas etapas).
- "Tareas" no lista las tareas ligadas a un proceso que no es suyo (`dealsOcultos`, D3) ni
  las ligadas solo al contacto que están a nombre de otra persona
  (`soloPropiasSinProceso`, D3). **Las que están asignadas a él las ve siempre.**
- Si registra una llamada y el proceso activo no es suyo, la llamada se guarda pero no
  mueve tareas de otros (regla "Asesor sobre un proceso que no es suyo", D2), y ningún
  botón del aviso lo lleva a ese proceso.
- La cabecera y el renglón Etapa muestran la etapa del proceso activo aunque sea de otro
  asesor (es una sola palabra y el proceso activo tiene que ser el mismo para todos, porque
  de él dependen el número de intento y la cadencia). Los demás datos de ese proceso
  (propiedad, origen, campaña, conjunto, anuncio y el asesor que lo lleva) **la ruta
  `ficha` no los devuelve —van en `null`— cuando el proceso activo no es de quien mira**:
  es un filtro del servidor, no de la pantalla, así que tampoco se ven en la respuesta de
  red. En ese caso Detalles muestra la Etapa, el origen del contacto y, en el renglón
  Asesor, el asesor del contacto si lo tiene; si no lo tiene, el renglón no se dibuja
  (decir "Sin asignar todavía" sería falso, y el nombre de quien lleva el proceso ajeno no
  viaja).
- **La regla vale para "el proceso del que salen los Detalles", no solo para el activo.**
  Ese proceso es uno solo y el mismo para todos: el activo o, si no hay ninguno abierto, el
  más reciente (`elegirDealActivo`; si da `null`, el de `created_at` más nuevo). La ruta
  `ficha` decide con `esProcesoPropio` de quien mira sobre **ese** proceso:
  - es suyo (o quien mira es de operaciones) → viajan todos sus datos, esté abierto o cerrado;
  - no es suyo y está **abierto** → viaja solo la etapa (el caso de arriba);
  - no es suyo y está **cerrado** (captado, descartado, comprador) → **no viaja nada de ese
    proceso, tampoco la etapa**: todo en `null`. El motivo para mostrar la etapa de un
    proceso ajeno era que el activo tiene que ser el mismo para todos por la cadencia; con
    el proceso cerrado ese motivo no existe, y "Descartado" es un dato de un proceso que
    el mismo diseño no le lista en "Procesos". Detalles muestra solo el origen y el asesor
    del contacto, si los tiene; **si el contacto no tiene asesor, el renglón Asesor no se
    dibuja**. La cabecera, como siempre que no hay proceso abierto, no muestra etapa.

  **El renglón Asesor, en limpio** (los tres casos no se parecen):
  - contacto **sin ningún proceso** y sin asesor → "Asesor: Sin asignar todavía" (es
    verdad: nadie lo lleva);
  - proceso de Detalles **propio** (o quien mira es de operaciones), sin asesor en el
    proceso ni en el contacto → "Sin asignar todavía";
  - proceso de Detalles **ajeno**, abierto o cerrado, y contacto sin asesor → el renglón
    **no se dibuja** (alguien lo lleva, pero ese nombre no viaja).

  No se busca "el proceso propio más reciente" para rellenar Detalles: el proceso de
  Detalles no cambia según quién mira; lo que cambia es cuánto se ve. Opción conservadora,
  confirmada por el dueño el 2026-11-25.
- La **actividad** (notas, llamadas, WhatsApp marcado) se ve completa: es la historia de la
  persona, y sin ella el asesor no sabe si ya la llamaron.

**De dónde sale cada bloque de la ruta `ficha`.** "Procesos": `deals` del contacto.
"Tasaciones agendadas": **los procesos del contacto con `stage = 'scheduled'` y
`scheduled_date` cargado** (lo que el CRM llama Coordinada); no la tabla vieja
`scheduled_appraisals`. Cada ítem lleva a `/pipeline/<id>` de ese proceso (la maqueta
decía "abre la tasación agendada, como hoy"; como ahora sale de un proceso, esa es su
pantalla). Para un asesor se filtra por `deals.assigned_to`. Al marcar un
proceso como perdido deja de listarse porque cambió la etapa; **la fecha no se borra**
(`advance` a `lost` no toca `scheduled_date`, `deals.ts:211-222`), y por eso el "Deshacer"
la devuelve tal cual. El texto " Se quitó la tasación agendada." habla de la lista, no de
la fecha. "Archivos": `appraisals` y `properties` del contacto.

Las mismas reglas valen para `GET /api/contacts/[id]` (existente): para un asesor, sus
listas `deals`, `appraisals`, `properties` y `scheduled` vienen filtradas igual (ahí
`scheduled` sí es la tabla vieja `scheduled_appraisals`, como hoy, y se filtra por su
columna `assigned_to`). Para operaciones no cambia nada. El caso es raro (un contacto con procesos de dos asesores),
pero son datos de otros usuarios y queda decidido acá, no implícito.

Cuerpo de `POST …/activities` (Zod, claves desconocidas se descartan):

```ts
z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('note'), body: texto.min(1), client_token: z.uuid() }),
  z.object({ kind: z.literal('call'), call_outcome: z.enum(RESULTADOS_LLAMADA),
             body: texto.optional(), hace_minutos: minutos.optional(),
             volver_el: z.object({ fecha: fechaISO, hora: horaHHMM }).optional(),
             client_token: z.uuid() }),
  z.object({ kind: z.literal('whatsapp_sent'), body: texto.optional(),
             hace_minutos: minutos.optional(), client_token: z.uuid() }),
])
// texto = string normalizado a NFC, recortado, máx. 2000 · minutos = entero 0..10080
```
`volver_el` es obligatorio y futuro cuando `call_outcome` es `volver_a_llamar`
(`validarVolverEl`), y se guarda en `callback_at` (`instanteDesdeAR`). Con otro resultado se
ignora. **La hora no la manda el navegador: manda "hace cuántos minutos"** y el servidor
calcula `occurred_at` (sin `hace_minutos`, o con 0, no lo calcula nadie: lo pone la base
igual a `created_at`). Así una hora futura es imposible por construcción y no depende del
reloj del teléfono. Alternativa descartada: recibir `occurred_at` en ISO.

Respuesta `201` (o `200` si el `client_token` ya existía, **con el mismo cuerpo**):

```ts
{ actividad: ActividadDeFicha,                     // con `intento`
  cadencia: { aplica: boolean,
              tareaCreada: { id, title, due_date, due_time, channel } | null,
              motivoSinTarea: MotivoSinTarea | null,
              tareasCerradas: { id: string; title: string }[],
              ofrecer: Ofrecer,
              dealId: string | null },             // para armar el botón
  pendiente: boolean }                             // true = faltó crear o cerrar tareas (ver D7)
```

Cuerpo de `PATCH`: `{ accion: 'editar', body }` (solo notas y solo el autor: si no, 400 o
403) o `{ accion: 'anular' }` (autor u operaciones). Anular responde
`{ ok: true, tareas: { descartadas, reabiertas } }`. Anular algo ya anulado responde 200 sin
volver a tocar el registro (`voided_at` y `voided_by` quedan como estaban); solo repite lo
que haya quedado a medias de las tareas (D8).

**Orden de `POST` para una llamada o un WhatsApp.** La segunda mitad es una sola función,
`aplicarCadencia(actividad)`, que usan por igual el guardado nuevo, el guardado repetido y
la ruta de reintento. **Vive en `lib/supabase/cadencia.ts`** (junto a `tasks.ts`, con
service role), no dentro de `route.ts`: así la importan las dos rutas y también el script
de prueba contra la base (tarea 6.6), que no tiene sesión. Recibe la actividad y el usuario
que hace el pedido (`{ id, role }`) y devuelve el bloque `cadencia` de la respuesta.
**Qué sale de quién:** las tareas (a quién se asigna la nueva, cuáles se cierran,
`procesoPropio`) salen de **quien registró** (`created_by` de la actividad); los botones
(`ofrecer`: `puedeConvertir`, `puedeCerrar`, `puedeAbrir`) se calculan siempre con **quien
hace el pedido**. En el guardado normal son la misma persona; en "Reintentar" pueden no
serlo. **Y el proceso es siempre el de la actividad** (`actividad.deal_id`), nunca el
activo del momento (D7):

1. Leer el contacto, sus procesos y elegir el activo.
2. Insertar la actividad. Con 23505 por `client_token`: aplicar la regla de arriba y **seguir
   con la fila existente desde el paso 3** (no se corta acá). **Excepción: si la fila
   existente está anulada (`voided_at` cargado)** —se guardó, se tocó "Deshacer" y recién
   después llega un reintento de red del guardado original— se responde **200** con esa
   fila tal cual está (anulada), `cadencia` vacía (`aplica: false`, sin tarea, sin motivo,
   sin tareas cerradas, `ofrecer: null`) y `pendiente: false`, **sin correr
   `aplicarCadencia`**: si corriera, volvería a cerrar las tareas que el deshacer reabrió.
   La pantalla no dibuja un registro que llega anulado.
3. `aplicarCadencia(actividad)`:
   a. leer el proceso de la actividad (`actividad.deal_id`; vacío = sin proceso), sus
      intentos no anulados y las tareas pendientes. La situación se calcula sobre **ese**
      proceso con su etapa de ahora: si ya está cerrado (captado, descartado, comprador)
      cuenta como `sin_proceso`, pero el `deal_id` para elegir las tareas a cerrar y para
      la tarea nueva sigue siendo el de la actividad;
   b. `decidirCadencia`, con `cargadoEn` = `created_at` de la actividad, `volverEl` = su
      `callback_at`, `hayTareaWhatsappDeCadenciaPendiente` calculado **sin contar la tarea
      de esta misma actividad** (D2) y `procesoPropio` = `esProcesoPropio` de **quien
      registró** (`created_by` de la actividad, con su rol leído de `profiles`; si ese
      usuario ya no existe, se calcula con **quien hace el pedido**, igual que
      `registranteId` en D2 y que la asignación del paso d: si no, una "No atendió"
      de un autor borrado daría `proceso_ajeno` para siempre, aunque la reintente una
      coordinadora); si `aplica` es falso, saltar a (e);
   c. `tareasACerrar` (con `creadasAntesDe` = `created_at` de la actividad, `registranteId`
      = su `created_by` y `soloPropias` = no `procesoPropio`, **o** quien registró es
      asesor y la actividad no tiene `deal_id`; D2) + `closeTasksByActivity`;
   d. `createCadenceTask`, asignada a `created_by` de la actividad (si ese usuario ya no
      existe, a quien hace el pedido);
   e. **armar la respuesta leyendo** `getTasksOfActivity(actividad.id)`: `tareaCreada` y
      `tareasCerradas` salen de esa lectura. **`motivoSinTarea` va en `null` siempre que esa
      lectura traiga una tarea creada**; solo cuando no hay tarea creada se usa el motivo de
      la decisión. `ofrecer` sale de la decisión, que con los mismos datos y la misma
      persona pidiendo da siempre lo mismo. **`aplica` va en verdadero siempre que esa lectura traiga una tarea creada o
      alguna tarea cerrada por esta actividad**, aunque la decisión de ahora diga "fuera de
      orden": es el caso del reintento de red que llega tarde, cuando ya hay un intento
      posterior. Esa llamada en su momento sí agendó, y la pantalla no puede decir "quedó
      anotada antes de otra más nueva" sobre algo que funcionó. Solo sin tarea creada ni
      cerrada se usa el `aplica` de la decisión.
4. Responder.

Por qué el doble pedido da siempre lo mismo: cerrar es idempotente (solo toca pendientes y
marca `closed_by_activity_id`), crear está protegido por `uq_tasks_source_activity`, las
tareas de la respuesta salen de leer la base y no de lo que escribió cada pedido, y la
decisión no se deja confundir por lo que ella misma creó (la tarea del propio intento no
cuenta como "ya pendiente", y si hay tarea creada el motivo va vacío). Si dos pedidos con el
mismo token corren a la vez, cualquiera de las dos respuestas trae la misma llamada, la
misma tarea creada, las mismas tareas cerradas y el mismo motivo. Si el segundo llega cuando
el primero todavía no terminó el paso 3, lo completa él.

El caso que lo prueba es la **segunda "No atendió" seguida**: el primer pedido crea "Enviar
WhatsApp"; el segundo (repetido, o "Reintentar") vuelve a decidir, no cuenta esa tarea como
ajena, intenta crearla, choca con el índice y devuelve la misma: `tareaCreada` con la tarea
y `motivoSinTarea: null`, igual que la primera respuesta.

Son lecturas y escrituras cortas a Supabase, sin llamadas a terceros.

### D5. Componentes (`components/crm/`) y su correspondencia con la maqueta

```
app/(dashboard)/contacts/[id]/page.tsx      servidor: requireAuth + permiso → <FichaContacto contactoId rol usuarioId abrirEditor /> | <SinAcceso> | <ContactoNoEncontrado>
components/crm/ficha/
  FichaContacto.tsx        cliente; pide ficha, actividad y tareas por separado; estado de pestaña, filtro, aviso y hoja
  use-ficha.ts             los tres pedidos, cada uno con cargando / error / reintentar
  FichaCabecera.tsx        .ficha-cab: avatar, nombre, ChipEtapa, EstadoUltimaLlamada, "Llamar · …" (tel:)
  FichaPestanas.tsx        Actividad | Datos | Tareas (con número)
  FichaDatos.tsx           tarjeta Contacto (solo celular), Detalles, Background (editar en el lugar), "Editar contacto" → ContactEditor
  Composer.tsx             pestañas "Nota | Registrar llamada" (components/ui/tabs)
  FormNota.tsx
  FormLlamada.tsx          5 OpcionGrande, bloque "¿Cuándo hay que volver a llamar?", comentario, "Corregir la hora", "Marcar WhatsApp enviado" (manda el comentario y la hora corregida del formulario)
  HojaAgregar.tsx          Sheet side="bottom": menú "Agregar" → Registrar llamada / Nota, con "Volver"
  BotonMas.tsx             el "+" (aria-label "Agregar nota o registrar llamada")
  AvisoGuardado.tsx        .ficha-aviso: título, renglones, acciones, X; variante "pendiente" con Reintentar
  Actividad.tsx            filtros en pastilla + lista + "Ver más" + vacíos
  ItemActividad.tsx        .evento: ícono, título (hasta dos renglones, sin "…"), autor, fecha relativa/exacta (en táctil cambia al tocar cualquier parte del renglón), tarea agendada sola, menú ⋯ (Editar, Borrar, Anular)
  LateralTareas.tsx        cabecera "Tareas · N" + AddTaskDialog (entity contact, onCreated → recargar) + ItemTarea con completar
  BloqueLista.tsx          Tasaciones agendadas, Procesos, Archivos (se oculta sin ítems); cada ítem acepta una acción al lado del enlace: en Procesos, "Coordinar tasación" si `puede_convertir` y "Deshacer" si `deshacer_hasta` todavía no pasó
components/crm/ui/
  ChipEtapa.tsx  ChipResultado.tsx  OpcionGrande.tsx  FiltroPastilla.tsx  EstadoBloque.tsx  FechaRelativa.tsx
lib/crm/leer-json.ts       lee la respuesta tolerando un cuerpo que no es JSON (504 de Netlify)
```

- **Frontera servidor → cliente:** `page.tsx` le pasa a `FichaContacto` **solo datos
  planos**: el id del contacto, el rol y el id del usuario (tres textos) y un booleano,
  `abrirEditor` (ver "Editar contacto", más abajo). Ningún ícono de
  lucide, componente ni función cruza como prop: los íconos se eligen adentro de los
  componentes de cliente. CLAUDE.md documenta que pasar un ícono desde el servidor deja la
  pantalla en blanco y que ningún test lo detecta; se verifica abriendo la ficha en la vista
  previa con la consola a la vista (tarea 12.2).
- Se usan `Card`, `Button`, `Tabs`, `Sheet`, `DropdownMenu` y `sonner` existentes. Lo que no
  existe (chip de resultado con 5 estilos, opción grande de 52 px, filtro en pastilla, ítem
  de evento, aviso azul) se crea en `components/crm/ui/` copiando medidas y estados de
  `maqueta/base.css`.
- Se agregan a `app/globals.css` los tokens `--destructive-suave` y `--destructive-texto`,
  **mezclados en `srgb`** (en `oklch` el rojo se corre al magenta; GUIA §9).
- Textos: los de la maqueta, palabra por palabra (botones, vacíos, errores, toasts).
- **Cuándo nace el `client_token`** (`FormLlamada`, `FormNota` y la marca de WhatsApp): se
  genera **al abrir o limpiar el formulario**, no dentro del manejador del toque. Se
  reutiliza en todo reintento de ese mismo guardado (doble toque, red cortada) y se renueva
  recién **después de un guardado exitoso**. Mientras el pedido está en curso, el botón
  queda deshabilitado. Si naciera en el toque, un doble toque en "No atendió" mandaría dos
  identificadores distintos: dos llamadas, y la segunda saltaría directo a "Enviar WhatsApp".
- Lo que la maqueta no tiene y la propuesta pide (editar y borrar nota, anular un registro
  viejo) va en un menú "⋯" de cada ítem. Borrar y anular piden confirmación; el "Deshacer"
  del toast usa el mismo `PATCH { accion: 'anular' }`. Como la maqueta no los dibuja, se fija acá:
  - **Editar una nota es en el lugar:** el texto del ítem se cambia por un campo de varios
    renglones con la nota cargada (16 px de letra en táctil), y debajo "Guardar" y
    "Cancelar" (44 px de alto en táctil). No abre ventana ni hoja, así que a 390 px ocupa
    el ancho del ítem. "Cancelar" deja el texto anterior. Vacía muestra "Escribí algo para
    guardar la nota"; con más de 2.000 caracteres avisa el límite; en los dos casos, y ante
    un error del servidor, se conserva lo escrito. Al guardar, el ítem muestra "editada".
  - **La confirmación de borrar y de anular** usa el `Dialog` que ya tiene la plataforma
    (`components/ui/dialog.tsx`, con su piso de celular resuelto), con dos botones: la
    acción ("Borrar nota" / "Anular") y "Cancelar". **No** se usa
    `useConfirmarEliminacion`: pide escribir "ELIMINAR", pensado para borrados sin vuelta
    atrás; acá lo borrado queda en la base y el toast ofrece "Deshacer". Cancelar no
    cambia nada.
- **Renglón de un registro (anatomía de evento de la spec vigente `crm-sistema-diseno`).**
  El título puede ocupar dos renglones y no se corta con "…" (sin `truncate`). La fecha
  exacta se ve al pasar el cursor y al tocar la fecha; **en pantallas táctiles, al tocar
  cualquier parte del renglón** (menos el menú "⋯" y los botones de edición), y un segundo
  toque vuelve a la relativa.
- **Los cuatro filtros de la maqueta se mantienen** (Todo, Llamadas, Notas, Actividad) con
  su misma lógica (`ficha.js:103-108`): "Llamadas" muestra solo llamadas y "Actividad" lo
  que no es llamada ni nota. En este change eso es el WhatsApp marcado; los demás eventos
  llegan con `crm-linea-de-tiempo`, sin tocar los filtros.
- "Editar contacto" abre el `ContactEditor` de hoy; al guardar, la ficha vuelve a pedir
  sus datos. **`?edit=1` sigue funcionando, y lo lee el servidor:** `page.tsx` lee
  `searchParams.edit` (una `Promise` en Next 16) y le pasa a `FichaContacto` el booleano
  `abrirEditor` (`edit === '1'`); la ficha arranca con el editor abierto solo esa primera
  vez. **No se usa `useSearchParams`** en la ficha, por el mismo motivo que en
  `/pipeline/new` (D9): obliga a un `<Suspense>` y el fallo se vería recién en el build de
  Netlify. Efecto que se anota: `/tasks` manda las tareas `update_contact` que están
  ligadas **solo a un contacto** (sin proceso ni tasación) a `/contacts/<id>?edit=1`
  (`tasks/page.tsx:110`), así que desde ahí la ficha nueva abre con el editor encima. Ese
  enlace no se toca en este change; que deje de llevar `?edit=1` queda anotado
  para `crm-tareas-y-campanita` (tarea 13.1).
  **La tarea de entrada del lead tampoco cambia, y se dice:** es una `update_contact` con
  proceso, así que desde `/tasks` sigue abriendo `/pipeline/<deal_id>?editContact=1`
  (`tasks/page.tsx:107-108`): el proceso con el editor de contacto encima, no la ficha. El
  diseño general (5.1) dice que desde las tareas se llega a la ficha; este change lo
  cumple solo para las tareas de la cadencia (punto siguiente). La Llamada 1 de un lead
  nuevo se registra entrando a la ficha por el nombre de la persona (desde ese proceso o
  desde el CRM). Queda anotado para `crm-tareas-y-campanita` (tarea 13.1) y se le avisa al
  dueño en el reporte final (tarea 13.5).
- **A dónde lleva una tarea de la cadencia desde `/tasks`** (el único cambio de este change
  en esa página). Hoy `getTaskLink` manda toda tarea con proceso a `/pipeline/<deal_id>`
  (`tasks/page.tsx:116`, antes de mirar `contact_id`). Para la cadencia eso está mal por
  dos lados: la coordinadora que toca "Llamada 2 a…" cae en el proceso, donde la llamada
  no se registra; y el asesor que se agendó "Llamar a {nombre}" sobre un proceso ajeno
  (decisión confirmada) cae en un proceso al que la API le responde 403
  (`app/api/deals/[id]/route.ts:15-17`), y esa pantalla solo hace `console.error` y queda
  sin datos (`pipeline/[id]/page.tsx:109`). Cambio: función pura
  `enlaceTareaCadencia(task): string | null` en `lib/crm/tareas-ficha.ts` — una tarea
  `follow_up` con `source_activity_id` y `contact_id` devuelve `/contacts/<contact_id>`;
  cualquier otra, `null`. `getTaskLink` la consulta **primero** y, si da `null`, sigue
  exactamente como hoy. Quien tiene una tarea de la cadencia siempre puede abrir esa
  ficha: registró una actividad sobre ese contacto, o es de la coordinación.
- Después de guardar, en escritorio el cuadro vuelve a la pestaña "Nota" (como
  `despuesDeGuardar` de la maqueta); en celular, a la pestaña "Actividad".
- **Comportamientos de la maqueta que no son texto ni medida** (GUIA.md, secciones 10 y
  11; la maqueta manda, y estos no se ven en una captura, así que se escriben acá y se
  prueban en 9.4):
  - **Foco después de guardar, en escritorio:** va al aviso de lo que pasó
    (`AvisoGuardado`) y, si no hay aviso (una nota), al registro nuevo de la lista. Quien
    usa teclado o lector de pantalla se entera de lo que pasó sin buscarlo.
  - **"Volver a llamar" deja el rojo al completarse:** si "Guardar llamada" marcó en rojo
    Día y Hora por faltantes, al elegir un atajo o completar los dos campos dejan de
    verse en rojo y el mensaje de error se va, sin esperar a otro "Guardar".
  - **"Volver a llamar" en escritorio acomoda la página:** al elegir ese resultado se abre
    el bloque "¿Cuándo hay que volver a llamar?" y la página se desplaza lo justo para que
    "Guardar llamada" quede entero a la vista. En la hoja del celular pasa lo equivalente
    (D6).
- **"Marcar WhatsApp enviado" toma del formulario el comentario y la hora corregida**
  ("Hace 30 min" → `hace_minutos: 30`) y los manda con `kind: 'whatsapp_sent'`; no manda
  el resultado marcado ni el día y la hora de "volver a llamar". La maqueta tomaba solo el
  comentario (`ficha.js:300-302`); la spec pide que la hora del WhatsApp también se pueda
  corregir, y este es el único lugar donde se puede elegir.
- **"Coordinar tasación" tiene un lugar fijo, además del aviso.** `AvisoGuardado` es estado
  de la pantalla: se pierde con la X, al recargar o al abrir la ficha en otro dispositivo, y
  la coordinadora no siempre tiene día, hora y asesor en el momento de la llamada. Sin un
  lugar fijo le quedarían dos salidas malas: cargar otra llamada "Agendó" (ensucia el dato
  que se quiere medir) o usar "Coordinar tasación" del menú (crea un segundo proceso y deja
  la solicitud abierta; verificado: `/pipeline/[id]` en `request` solo ofrece "Descartar").
  Por eso, en el bloque "Procesos", cada ítem con `puede_convertir` verdadero lleva al lado
  del enlace un botón "Coordinar tasación" → `/pipeline/new?deal=<id>`. El botón es hermano
  del enlace, no va adentro (un botón dentro de un enlace no es válido), y mide 44 px en
  táctil. Para coordinar como **proceso nuevo** (clase gratuita, sin proceso) no hay botón
  fijo: ahí el camino del menú no duplica nada —crea el proceso nuevo que hace falta y
  reutiliza el contacto por email o teléfono— y lo único que se pierde es la precarga.
- El botón del aviso depende de `cadencia.ofrecer`: `coordinar_solicitud` →
  `/pipeline/new?deal=<dealId>`; `coordinar_nuevo` → `/pipeline/new?contact=<contactId>`;
  `abrir_proceso` → `/pipeline/<dealId>`; `cerrar_proceso` → los dos botones de la maqueta;
  los demás valores (incluido `proceso_ya_coordinado`), solo el texto de la tabla de D2.
- La línea "Tarea creada sola · …" de la maqueta se muestra dentro del ítem de la llamada
  que la originó (se lee de `tasks.source_activity_id`), no como un evento aparte.
- Toasts: se deja el `Toaster` global (arriba a la derecha). Arriba no tapa el "+" ni la
  barra inferior, y moverlo afectaría a toda la plataforma. **Todo toast con "Deshacer"
  (llamada, WhatsApp, nota, proceso perdido) dura 6 segundos** (`duration: 6000` en ese
  toast, como en la maqueta); los demás usan la duración de siempre. Pasado ese tiempo, lo
  guardado se anula desde el menú "⋯" del registro, y el perdido se deshace desde el botón
  "Deshacer" del ítem de ese proceso en "Procesos" (punto siguiente). `/pipeline/<id>` no
  sirve para eso: no dibuja ninguna acción en un proceso descartado (`page.tsx:601`). **El
  botón de acción del toast lleva alto mínimo de 44 px en táctil** (una clase propia en
  esos toasts; el `Toaster` global no se toca). **El toast del perdido dice dónde queda
  el botón:** "Proceso marcado como perdido." y, como descripción, "Se puede deshacer
  durante 10 minutos desde «Procesos» (en el celular, pestaña Tareas)." (la variante con
  tasación agendada suma su frase después de la primera). En celular el bloque
  "Procesos" vive dentro de la pestaña Tareas (D6) y quien está en Actividad no tendría
  otra pista de dónde quedó el "Deshacer". Diferencia 24.
- **"Deshacer" del perdido tiene un lugar que dura los 10 minutos.** El dueño confirmó 10
  minutos para deshacer, y un toast de 6 segundos solo no los da. Por eso, en el bloque
  "Procesos", el ítem de un proceso descartado lleva al lado del enlace un botón "Deshacer"
  mientras `deshacer_hasta` (ruta `ficha`, D4) no haya pasado. Es hermano del enlace, como
  "Coordinar tasación", y mide 44 px en táctil. Llama al mismo `undo-lost` que el toast.
  La ficha lo saca sola cuando llega la hora (un temporizador hasta `deshacer_hasta`, sin
  recargar). Si el servidor responde 409, la pantalla dice "Ya no se puede deshacer:
  pasaron más de 10 minutos o el proceso cambió de etapa." y el botón desaparece. Al
  marcar perdido y al deshacer, la ficha vuelve a pedir sus datos: así el botón aparece
  junto con el toast y se va al deshacer. Vale también para un proceso descartado desde
  `/pipeline/<id>` hace menos de 10 minutos (misma regla, D2). Un asesor lo ve solo en
  sus procesos (`puedeCerrarProceso`).
- "Ver en Tareas" del aviso (celular) cambia a la pestaña Tareas de la ficha.
- **Cuándo una tarea del bloque Tareas está vencida, y hace cuánto.** `due_date` y
  `due_time` se leen **siempre como hora de Argentina** (decisión 8.4 del diseño general),
  con `enArgentina` y `diasDeCalendarioEntre` de `horario-laboral.ts`; nunca con
  `new Date().toISOString()`, que es lo que hace hoy `getMyTasks` (`tasks.ts:132`) y por
  eso se corre de noche. Regla, en una función pura `vencimientoDeTarea(tarea, ahora)` de
  `lib/crm/tareas-ficha.ts`: con fecha y hora, está vencida si ese momento de Argentina ya
  pasó; con fecha sola, si la fecha es anterior al día de hoy en Argentina; sin fecha,
  nunca. "Vencida hace N días" cuenta días de calendario de Argentina entre la fecha de la
  tarea y hoy. Caso que la prueba fija: a las 22:00 de Argentina (ya es mañana en UTC),
  una tarea para mañana a las 9:00 **no** está vencida, y una de anteayer dice "Vencida
  hace 2 días", no 3.
- `AddTaskDialog` se usa tal cual (incluye el tipo "Email" que la maqueta no muestra);
  unificarlo es del change de tareas.

### D6. El celular dentro del layout real

- **Un solo árbol, sin elegir por JavaScript.** La ficha dibuja siempre las tres zonas
  (Datos, Actividad, Lateral) y decide con *container queries* sobre su propio contenedor:
  menos de 40rem → una columna con pestañas (solo se ve la zona activa) y el "+"; de 40rem a
  60rem → dos columnas (Datos + Lateral a la izquierda, Actividad a la derecha); 60rem o
  más → tres columnas. No se usa `useIsMobile` para armar la estructura: evita el
  desajuste de hidratación y resuelve el menú lateral, que la maqueta no tenía. Cuentas:
  a 1280 con el menú abierto quedan 992 px (tres columnas); a 1024, 736 px (dos); a 390, una.
  Con el menú **colapsado** (3rem) quedan 960 px libres desde unos 1056 px de ventana: ahí
  ya hay tres columnas, antes de los 1280 que pedía la spec aprobada (otra diferencia
  confirmada por el dueño).
  A 768 con el menú abierto quedan 480 px (pestañas); a 768 con el menú colapsado, 672 px
  (dos). **Debajo de 768 px no hay menú lateral** (está la barra inferior del celular) y
  `#contenido` tiene 16 px de relleno por lado: la ficha tiene la ventana menos 32 px. Por
  eso desde unos 672 px de ventana ya hay dos columnas y no hay "+": a **744 px** (un iPad
  mini parado) quedan 712 px → dos columnas, con el cuadro de nota/llamada a la vista y la
  barra inferior del celular. Es lo que pide el requisito modificado (640 a 959 px libres);
  se mira en la tarea 10.1. Entre 768 y ~930 px de ventana con el menú abierto queda la vista de pestañas: dos
  columnas ahí no entran (la columna de datos mide 17,5rem fijos). **Esto cambia la
  spec vigente `crm-sistema-diseno`** ("dos columnas entre 768 y 1279 px"): el dueño lo
  confirmó el 2026-11-25 y el requisito modificado está en `specs/crm-sistema-diseno/spec.md`
  de este change.
- **Cabecera fija:** `sticky top-0 z-20 -mx-4 -mt-4 px-4 md:-mx-6 md:-mt-6 md:px-6` con
  fondo opaco, dentro de `#contenido` (el que scrollea), igual que `PropertyTabsNav`. Los
  márgenes negativos siguen al relleno real de `#contenido` (`p-4 md:p-6`,
  `layout.tsx:147`): con `-mx-4` solo, entre 768 y ~930 px quedaría una franja de 8 px por
  donde se vería pasar el contenido. Queda debajo de la barra superior (z 40) y de las
  hojas (z 50).
- **El "+":** el contenedor de la ficha es `flex flex-1 flex-col` dentro de `#contenido`
  (que ya es una columna flex, `layout.tsx:147`). Se usa `flex-1` y no `min-h-full`: un
  alto en porcentaje sobre un hijo de un contenedor flex depende de que el navegador tome
  ese alto como definido, y Safari de iPhone no siempre lo hace. El "+" va último, con `mt-auto sticky bottom-4`, alineado a la derecha, z 30. El
  `mt-auto` lo empuja al fondo aunque la ficha tenga pocos registros (con `sticky` solo,
  quedaría flotando debajo del último ítem, a mitad de pantalla). No es `fixed`: la barra
  inferior no es fija y no hay variable con su alto, así que un `fixed` tendría que
  adivinarlo. La lista deja `6rem` de aire abajo para que el "+" no tape el último registro.
  Se oculta por CSS cuando hay dos o tres columnas.
- **Hoja "+":** `Sheet side="bottom"`, que ya respeta `--app-vh` (teclado) y `--safe-b`.
  "Guardar llamada" va pegado al pie de la hoja. Al guardar: se limpia, se cierra, pestaña
  Actividad, filtro "Todo", scroll de `#contenido` arriba y el registro nuevo resaltado.
- **Foco dentro de la hoja "+"** (GUIA.md, sección 11; el punto de "Nota" se le avisó al
  dueño en `aprobacion.md`). Al pasar del menú a "Registrar llamada", el foco va a "No
  atendió". Al pasar a "Nota", el foco va al campo, **dentro del mismo toque** (en el
  manejador del toque, no en un efecto ni con un temporizador): es lo único que abre el
  teclado en iPhone. Por eso las dos vistas están siempre en el árbol de la hoja y se
  muestran u ocultan; si el campo se montara recién después del toque, no habría a qué
  darle foco a tiempo.
- **"Volver a llamar" en pantallas bajas.** En la hoja, al elegir "Atendió · volver a
  llamar" el cuerpo de la hoja se desplaza lo justo para que Día y Hora no queden detrás
  de "Guardar llamada" (que va pegado al pie). Se mira a 390 px de ancho y poco alto
  (tarea 10.3).
- Campos con letra de 16 px; todo lo tocable de 44 px o más; `tel:` en el botón de llamar.
  **Vale para toda pantalla táctil, no solo para la vista de una columna:** las medidas
  chicas (36 px y 14 px) se aplican solo con `@media (hover: hover) and (pointer: fine)`,
  o sea con mouse; una tablet táctil a 1024 px ve dos columnas con controles de 44 px, como
  pide la spec `crm-sistema-diseno`.

### D7. Dos escrituras sin transacción: qué pasa si falla la tarea

La llamada se guarda **primero** y nunca se revierte por un fallo posterior: es el dato que
hoy se pierde. Cerrar tareas y crear la tarea siguiente se intentan después, cada paso con
**un reintento**. Si alguno igual falla:

- la ruta responde `201` con `pendiente: true` y lo que sí logró;
- queda `console.error` con el id de la actividad;
- la ficha muestra la llamada y el aviso en su variante de advertencia: "La llamada quedó
  guardada, pero no se pudo agendar la siguiente." + **Reintentar**;
- "Reintentar" llama a `POST …/activities/[activityId]/cadencia`, que corre el mismo
  `aplicarCadencia(actividad)` de D4.

**Reglas del reintento** (por eso no necesita cuerpo):

- Todo sale de la fila guardada: el resultado, el día y la hora pedidos (`callback_at`), el
  "ahora" de la decisión (`created_at`: el día hábil siguiente se cuenta desde el día en que
  se cargó la llamada, no desde el día del reintento), a quién se asigna la tarea y quién
  cuenta como "quien registra" para elegir las tareas a cerrar (`registranteId`): las dos
  cosas son `created_by` de la actividad, aunque reintente otra persona.
- **El proceso también sale de la fila guardada.** La situación (`sin_proceso`,
  `solicitud`…), `procesoPropio` y el `deal_id` de la tarea se calculan siempre con el
  `deal_id` de la actividad, en el guardado repetido y en el reintento; nunca con el
  proceso activo de ese momento. Si entre el guardado y el reintento entró una solicitud
  nueva, la tarea igual queda en el proceso de la llamada. Si ese proceso se cerró
  mientras tanto, una "No atendió" responde `sin_proceso` (no hay secuencia sobre un
  proceso cerrado) y "volver a llamar" crea igual su tarea, ligada a ese proceso.
- **Lo único que sale de quien reintenta son los botones** (`ofrecer`, D4).
- **Solo corre si la actividad sigue siendo el último intento no anulado de su proceso.** Si
  ya hay un intento posterior, `decidirCadencia` devuelve `aplica: false` y no se toca nada.
- **Solo cierra tareas creadas antes que la actividad** (`creadasAntesDe`), así nunca cierra
  una tarea que nació de una llamada posterior.
- No duplica: el cierre solo toca tareas todavía pendientes y la creación está protegida por
  `uq_tasks_source_activity`.
- Una actividad anulada no se reintenta (404).

Lo que se acepta: si la persona cierra la pantalla sin reintentar, esa llamada queda sin su
tarea siguiente. No hay proceso programado que la repare (decisión del proyecto).
Alternativa descartada: función de Postgres transaccional (ver D1).

**Qué pasa con el lead que queda sin tarea, hasta que exista el Inicio nuevo.** Hay dos
casos: la secuencia terminó (WhatsApp marcado) o falló la tarea y nadie reintentó. El bloque
"Sin respuesta" que los juntaría es del change `crm-inicio`, que sale después. Hasta
entonces:

- **Los avisos no nombran ese bloque.** En vez de los textos de la maqueta ("…queda en «Sin
  respuesta» del Inicio…") se usan textos que son verdad hoy: "Si no contesta y querés
  seguirla, agendá una con «+ Tarea»." y "Ya se le mandó WhatsApp: no se crea otra tarea. Si
  querés seguirla, agendá una con «+ Tarea»." Los textos de la maqueta se activan en
  `crm-inicio`, y queda anotado en su propuesta.
- **El lead no desaparece:** su proceso sigue en Solicitud y sigue en la columna Solicitud
  de `/crm`, y la cabecera de su ficha dice hace cuántos días fue la última llamada.
- Lo que no hay hasta `crm-inicio` es una lista que junte "solicitudes sin ninguna tarea
  pendiente". Es un hueco real y conocido; el dueño lo aceptó el 2026-11-25.

### D8. Anular

`PATCH { accion: 'anular' }` pone `voided_at`/`voided_by`. Después, **solo si el registro
era el último intento no anulado de su proceso** (`esUltimoIntento`), corre
`undoTasksOfActivity`. Si hay intentos posteriores, no toca tareas: reabrir tareas viejas o
descartar una tarea que ya motivó otra llamada dejaría la lista peor que antes. Anular nunca
recalcula ni crea tareas. Para las notas, "borrar" es la misma anulación.

**Anular se puede repetir (falla parcial).** Son dos escrituras sin transacción: primero
`voided_at`, después las tareas. Si la segunda falla, la ruta responde **500** y la pantalla
ofrece reintentar. El reintento encuentra el registro ya anulado y **no corta ahí**: si no
hay ningún intento no anulado posterior a él en su proceso, vuelve a correr
`undoTasksOfActivity`, que es segura de repetir porque cada tarea reabierta pierde su
`closed_by_activity_id` (D3) y la tarea creada ya está en `dismissed`: la segunda pasada
solo toca lo que quedó pendiente de la primera. Si ya hay un intento posterior, responde 200
sin tocar tareas. `voided_at` y `voided_by` no se reescriben en la repetición.
Alternativa descartada: borrar la fila (se pierde el rastro) y recalcular toda la secuencia
(efectos difíciles de explicar en pantalla).

### D9. Coordinar desde la ficha sin duplicar el proceso, y cerrar con vuelta atrás

`POST /api/deals` es un camino crítico (coordina todas las tasaciones). La regla del cambio:
**sin `from_deal_id` y sin `contact_id` en el cuerpo, la ruta hace exactamente lo que hace
hoy**, y los tests que ya existen tienen que seguir pasando sin tocarlos.

**Convertir una solicitud (`from_deal_id`).**

- `/pipeline/new` pasa a leer `?deal=<id>`: trae el proceso con `GET /api/deals/[id]`
  (existente; para un asesor exige que el proceso sea suyo) y precarga persona y propiedad.
  **El campo "Notas" arranca vacío**, no se precarga con las notas del proceso: lo que se
  escriba ahí se agrega a las que ya tiene (paso 4).
  **Al guardar envía `from_deal_id`** con ese id. Sin el parámetro, todo igual que hoy.
- **Cómo lee los parámetros la página.** `/pipeline/new` es hoy un componente de cliente
  que no usa `useSearchParams`, y en Next 16 ese hook obliga a un límite de `Suspense` (el
  repo ya lo anotó en `app/(dashboard)/contacts/page.tsx:87` y en `layout.tsx`). Como el
  build local no se puede correr (Turbopack y la tilde de la carpeta), un fallo aparecería
  recién en Netlify. Por eso `page.tsx` pasa a ser un componente de **servidor** que lee
  `searchParams` (una `Promise` en Next 16) y le pasa al formulario, que queda como
  componente de cliente aparte, dos textos: `dealId` y `contactId`. No se usa
  `useSearchParams`.
- **A dónde vuelve al guardar.** Hoy va a `/pipeline` (`page.tsx:76`). Si la página se
  abrió con `?deal=` o `?contact=`, vuelve a `/contacts/<id>` de esa persona (con `?deal=`,
  el id sale del `contact_id` del proceso que precargó). Sin parámetros, a `/pipeline`
  como hoy.
- **El campo "Origen \*" del formulario** (`page.tsx:117`, obligatorio hoy).
  - Con `?deal=`: se muestra **fijo, sin poder cambiarse**, con el origen de esa solicitud
    y la etiqueta de siempre ("Embudo", "Referido"…); si la solicitud no tiene origen dice
    "Sin origen". No es obligatorio y **no se envía**: la conversión no toca
    `deals.origin` (paso 4), y si el cuerpo trae `origin` junto con `from_deal_id` la ruta
    lo ignora. Así la coordinadora no elige un dato que después no se guarda.
  - Con `?contact=`: queda **como hoy**, vacío y obligatorio, y la coordinadora lo elige:
    es un proceso nuevo y ese es su origen. **No se precarga con el origen del contacto**:
    puede ser `clase_gratuita`, y un proceso coordinado con ese origen rompe el email de
    "Tasación agendada" (paso 2).
  - Sin parámetros, igual que hoy.
- Con `from_deal_id`, `POST /api/deals`:
  1. valida los mismos campos que hoy; si el cuerpo trae `from_deal_id` **y** `contact_id`
     a la vez, **400** ("Mandá el proceso o el contacto, no los dos"). **Con `from_deal_id`,
     `scheduled_date` es obligatorio y con formato `YYYY-MM-DD`** (400 "Elegí el día de la
     tasación" si falta o está mal). Hoy el servidor no lo exige (`route.ts:139`,
     `scheduled_date || null`; solo lo pide el formulario), y una conversión sin día
     dejaría el proceso en `scheduled` sin fecha: el CRM lo seguiría mostrando como
     Solicitud, saldría el email "Tasación agendada" con la fecha vacía y, como el filtro
     del `update` seguiría coincidiendo, el pedido se podría repetir y mandar el email otra
     vez. Sin `from_deal_id` la validación de hoy no cambia;
  2. lee el proceso (también `notes`, para el paso 4) y decide con `motivoNoConvertir`
     (D2), **primero el permiso y después la etapa, en este orden**:
     - el proceso no existe, o `sin_permiso` (quien pide no tiene `pipeline.schedule`, o
       no tiene `pipeline.view_all` y el proceso no está asignado a él) → **404**, igual
       que si no existiera. Sin esto, un asesor con el id de cualquier solicitud podría
       quedársela, porque la ruta le fuerza `assigned_to` = él.
       **En la práctica ese 404 es para el asesor con una solicitud ajena o sin asesor.**
       Quien no tiene `pipeline.schedule` (hoy, el abogado) no llega a este paso: la ruta
       empieza con `requirePermission('pipeline.schedule')` dentro del `try`
       (`route.ts:62-64`), que redirige y termina en la respuesta de hoy (500, sin
       escribir nada ni mandar email). Eso **no se cambia en este change**: es el
       comportamiento de `POST /api/deals` para cualquier pedido, con o sin
       `from_deal_id`, y pasarlo a `requireAuth` + `hasPermission` con 403 (como se hace
       en `undo-lost`, que es una ruta nueva) tocaría el camino de coordinar de siempre.
       La rama "sin `pipeline.schedule`" de `motivoNoConvertir` queda para la ficha, que
       así no dibuja el botón;
     - `clase_gratuita` → **409** ("Este proceso viene de la clase gratuita: se coordina
       como un proceso nuevo"), sin cambiar nada: ese caso va por `contact_id`;
     - sin contacto (`contact_id` vacío) → **409** (texto y motivo, más abajo);
     - `ya_cambio_de_etapa` (el proceso ya no está en `request` ni en `scheduled` sin
       día) → **409** ("El proceso ya cambió de etapa"), sin tocar nada.

     No se resuelve con el booleano `puedeConvertirSolicitud` y un 404 para todo lo que dé
     falso: esa función ya da falso para un proceso de la clase y para uno que cambió de
     etapa, y entonces los 409 de la spec —y el aviso "El proceso ya cambió de etapa" de
     la pantalla— no se alcanzarían salvo en la carrera justa entre la lectura y el
     `update`. El filtro de etapa del `update` (paso 4) queda como red para esa carrera.
     Sobre el 409 de la clase gratuita, motivo verificado: `notifyDealCreated` tira error
     con ese origen
     (`lib/email/notifications/deal-created.ts:29`) y el error termina en un email de
     "falló la notificación" a los admins. La ficha tampoco ofrece esa conversión (D2).
     Si el proceso **no tiene contacto** (`contact_id` vacío: pasa cuando se borró el
     contacto), **409** ("Este proceso no tiene una persona vinculada: vinculala desde el
     proceso antes de coordinar"), sin escribir nada y sin email. Sin esto quedaría un
     proceso coordinado sin persona, un email "Tasación agendada" sin datos y una vuelta
     a `/contacts/` sin id. La ruta `ficha` no llega a ofrecerlo (la ficha es de un
     contacto), así que es solo una barrera por la red;
  3. **el contacto es siempre `deals.contact_id` de ese proceso: se saltea la búsqueda por
     email y por teléfono**, y no se crea ningún contacto. Sin esto, cambiar el email en el
     formulario precargado podía encontrar otro contacto o crear uno nuevo;
  4. **primero el proceso:** en vez de insertar hace un `update` de `deals` con día, hora,
     asesor, propiedad, las notas según la regla de abajo, `stage: 'scheduled'`, **`stage_changed_at` y `updated_at`
     con la hora actual** (lo mismo que escribe `updateDealStage`, `deals.ts:211-222`; sin
     eso la columna "Actualizado" del CRM seguiría mostrando la fecha de entrada del lead)
     y `created_by`, **sin tocar `contact_id` ni `origin`**. Con supabase-js no hay
     `coalesce` en un `update`, así que se escribe así:
     - **`notes` nunca se pisa.** Una solicitud llega con notas que otros leen: el mensaje
       que dejó la persona (`lib/funnel/create-funnel-lead.ts:170`), lo que anota el
       agente de WhatsApp (`lib/ai/tasacion-agent.ts:219-221`, que ya concatena para no
       pisar) y el texto "Importado de GHL… Stage GHL" que usa el Panel de negocio
       (`lib/metrics/panel/personas.ts:116`). El formulario de hoy manda
       `notes: form.notes || null` (`pipeline/new/page.tsx:61`): escrito tal cual en el
       `update` borraría todo eso. Regla, calculada en la ruta con la fila leída en el
       paso 2: si el campo llega vacío (o solo espacios), `notes` **no se incluye** en el
       `update`; si trae texto y el proceso no tenía notas, se guarda ese texto; si trae
       texto y ya había notas, se guarda `<notas anteriores>` + un renglón en blanco +
       `<texto nuevo>`. Sin `from_deal_id` (proceso nuevo) el campo se guarda como hoy;
     - `created_by` **se calcula en la ruta** con la fila leída en el paso 2: si venía
       vacío, quien coordina; si tenía valor, no se incluye en el `update`;
     - el filtro de etapa va en el propio `update`:
       `.eq('id', id).or('stage.eq.request,and(stage.eq.scheduled,scheduled_date.is.null)')`
       (el mismo texto de `applyCRMStageFilter`);
     - las filas cambiadas se cuentan con `.select('id')`.

     Si no actualizó ninguna fila responde **409** ("El proceso ya cambió de etapa") y **no
     se tocó nada, tampoco el contacto**.
     **Efecto conocido cuando el proceso ya estaba en `scheduled` sin día:** la etapa no
     cambia, así que el trigger de etapas no hace nada (sus dos funciones actúan solo si
     `NEW.stage IS DISTINCT FROM OLD.stage`): no suma fila a `deal_stage_history` y
     `scheduled_at` queda con la fecha de cuando se creó sin día, no con la de esta
     coordinación. No se corrige acá (Risks); se prueba en 8.4;
  5. **después el contacto, solo si el paso 4 actualizó una fila:** si en el formulario se
     corrigió el nombre, el teléfono o el email, se actualizan en ese mismo contacto con los
     valores ya validados. Si esta escritura falla (con un reintento), la coordinación queda
     hecha y la respuesta lleva `warning` ("La tasación quedó coordinada, pero no se
     pudieron guardar los datos corregidos de la persona"). **Si el email o el teléfono
     nuevo ya lo tiene otro contacto** (misma búsqueda de hoy: email tal cual y en
     minúsculas, y `phone_norm`, excluyendo este contacto), se guarda igual y la respuesta
     lleva otro `warning` ("Ya hay otro contacto con ese email o teléfono: revisá si es la
     misma persona"); no se bloquea ni se unifica nada (Risks). Vale igual para `contact_id`;
  6. corre los mismos efectos de hoy (tarea `new_assignment` y `notifyDealCreated`) y,
     además, **la sincronización de Mailchimp que hoy hace todo cambio de etapa**
     (`syncMailchimpBestEffort`, `deals.ts:9-16`, hoy privada del archivo: **se exporta y
     la llama la ruta**). Se llama **una vez, solo si el paso 4 actualizó una fila, y
     siempre después del paso 5** (la escritura del contacto), haya salido bien o con
     `warning`. El orden importa: la sincronización busca a la persona en Mailchimp por el
     email del contacto (`sync-deal.ts`); si corriera antes de guardar el email corregido,
     la etiqueta de "agendada" quedaría en el email viejo. Por eso **no se llama desde
     adentro de la función que hace el `update`** del proceso: si en `lib/supabase/deals.ts`
     se suma una función `convertirSolicitud` para ese `update`, esa función no toca
     Mailchimp. Un fallo de la sincronización no corta la respuesta (ya atrapa sus errores).
     **Orden de los tres efectos, fijo:** primero la tarea `new_assignment`, después
     `notifyDealCreated` y **Mailchimp al final**. Lo que le sirve al equipo (la tarea y
     el email al asesor) sale primero; si la función se corta en el medio, lo que se
     pierde es la etiqueta de Mailchimp, y el reintento del formulario recibe 409 sin
     repetir nada (Risks). Motivo verificado: el lead del embudo entra
     a Mailchimp con la etiqueta de "solicitó"; si al coordinar nadie sincroniza, la
     persona sigue recibiendo los emails de "solicitaste una tasación" con la tasación ya
     agendada.
- **Por qué se completa `created_by` cuando está vacío.** `notifyDealCreated` toma a la
  coordinadora de `deals.created_by` (`lib/email/recipients.ts:81`), y los procesos del
  embudo nacen con ese campo vacío. Sin completarlo, el email diría "Coordinador" sin
  nombre y quien coordinó no recibiría la confirmación: no sería "igual que hoy". Solo se
  completa si está vacío; un `created_by` que ya tiene valor no se pisa. `origin` no cambia,
  así que el proceso sigue contando como del embudo.
- **No se escribe `contacts.assigned_to`.** El asesor de la tasación ve la ficha porque el
  proceso queda a su nombre (regla de D2). Así el camino de coordinar desde el menú queda
  idéntico al de hoy.

**Coordinar a una persona sin solicitud (`contact_id`).** Para el lead de la clase gratuita
y para el contacto sin proceso activo, el botón lleva a `/pipeline/new?contact=<id>`: trae
la persona con `GET /api/contacts/[id]`, precarga nombre, teléfono y email, deja la
propiedad vacía y al guardar envía `contact_id`. Con `contact_id`, la ruta exige
`canAccessContact` (404 si no), usa ese contacto sin buscar otro, y **crea un proceso nuevo
como hoy**. Igual que en la conversión, **después de crear el proceso** actualiza ese
contacto con el nombre, el teléfono y el email validados del formulario (mismo `warning` si
esa escritura falla): si al lead de la clase le faltaba el email y la coordinadora lo
tipeó, tiene que quedar guardado en la persona, o después `advance` respondería 422 por
datos faltantes. `from_deal_id` y `contact_id` juntos → 400 (paso 1 de arriba).
El proceso de la clase gratuita no se toca. Convertir un lead de la clase en vez de abrirle
un proceso nuevo es una decisión de negocio: el dueño confirmó el 2026-11-25 que se le
abre un proceso nuevo, como hoy.

**Marcar proceso como perdido** usa lo que ya existe: `POST /api/deals/[id]/advance` con
`{ stage: 'lost' }` (permiso `pipeline.advance`). El botón se dibuja solo con
`puedeCerrarProceso` (D2). Si la ruta responde con error, la ficha lo dice y deja el aviso
como estaba (hoy `handleLost` de `/pipeline/[id]` falla en silencio; acá no). La etiqueta de
la etapa sigue siendo "Descartado", como en el resto de la plataforma; "perdido" es solo el
texto del botón aprobado en la maqueta.

**"Deshacer" el perdido** no puede usar `advance`, por dos motivos verificados: (1) el
trigger deja `lost_at` cargado y `vw_funnel_daily` cuenta las perdidas por `lost_at`, así que
el proceso deshecho seguiría contando como perdido ese día; (2) `advance` exige datos del
cliente para volver a ciertas etapas y puede responder 422. Por eso hay una ruta chica y
propia, `POST /api/deals/[id]/undo-lost`, que llaman dos botones de la ficha (el "Deshacer"
del toast, 6 segundos, y el del ítem del proceso en "Procesos", los 10 minutos; D5):

- `requireAuth()` + chequeo explícito del permiso `pipeline.advance` con `hasPermission`:
  sin él, **403** en JSON (`{ error }`). **No se usa `requirePermission`:** no devuelve un
  error, hace `redirect('/')`; dentro del `try` eso es el 500 con `NEXT_REDIRECT` que da
  hoy `advance`, y fuera sería una redirección que el `fetch` sigue hasta un 200 y la
  ficha tomaría el "Deshacer" como hecho. Después, `puedeCerrarProceso` (D2), con su **lista explícita de roles**: admin, dueño,
  coordinador, o asesor dueño del proceso; si no, **404**. No alcanza con `canAccessDeal`,
  que deja pasar al rol viejo `agent`;
- lee el proceso y la última fila de `deal_stage_history` (con service role: la RLS de esa
  tabla no deja leer al asesor) y decide con `puedeDeshacerPerdido` (D2); si no vale, **409**;
- `update` de `deals` con `stage: <from_stage>`, `lost_at: null` (si corresponde),
  **`stage_changed_at` y `updated_at` con la hora actual**, filtrando
  `.eq('id', id).eq('stage', 'lost')` y contando con `.select('id')`; si no actualizó
  ninguna fila, 409;
- después de actualizar una fila llama **una vez** a la misma sincronización de Mailchimp
  (sin que un fallo corte la respuesta): marcar perdido por `advance` saca a la persona de
  la secuencia de emails, y el deshacer tiene que volver a ponerla donde estaba.
  **Efecto que se acepta y se dice:** para Mailchimp eso es apagar una etiqueta y volver a
  prenderla; según cómo esté armada la automatización, la persona puede volver a recibir
  la secuencia **desde el primer email**. Desde el código no se puede saber ni evitar: el
  dueño lo aceptó el 2026-11-25 y queda en Risks;
- no manda emails ni WhatsApp, ni crea tareas. El historial suma una fila
  `lost → <etapa>`: es lo que pasó de verdad y no se borra. **Esa fila sí pesa en una
  métrica** cuando la etapa a la que se vuelve es Tasación Entregada o Captada: el costo
  por tasación y por captación de `/metrics` cuenta filas del historial, no `lost_at`
  (Risks).

Por qué entra en este change: sin la conversión, "Atendió y agendó" termina creando un
segundo proceso y la solicitud original queda abierta para siempre; el paso "solicitud →
agendada" que este módulo quiere medir quedaría mal contado desde el primer día.
Alternativas descartadas: abrir el formulario de hoy sin cambios (duplica); un formulario
propio en la ficha con `PUT` + `advance` (no avisa al asesor ni le crea la tarea); deshacer
con `advance` (deja una perdida falsa en las métricas).

### D10. Pruebas

- **Módulos puros:** vitest, test primero. Se amplía `vitest.crm.config.ts` y
  `tsconfig.crm.json`. El `include` suma todo lo que este change prueba, para que un solo
  comando lo corra: `lib/crm/**`, `lib/auth/**/*.test.ts`, `lib/supabase/tasks*.test.ts`,
  `lib/supabase/cadencia*.test.ts` (`aplicarCadencia` es código de `lib/` y lleva su test
  primero; `lib/supabase/deals*.test.ts`, donde va el test de la función de conversión, ya
  está en el `include`),
  `app/api/contacts/**`, `app/api/tasks/**/*.test.ts` (ya existe `route.test.ts`),
  `components/crm/**`, `components/contacts/**`, y las pantallas que se tocan:
  `app/(dashboard)/contacts/**`, `app/(dashboard)/crm/**` (ya existe `page.test.tsx`) y
  `app/(dashboard)/pipeline/**`; más el alias de `server-only`. No se corre la
  configuración raíz (tarda minutos por iCloud).
- **Rutas:** tests con las funciones de base simuladas, como los de `app/api/deals/`:
  permisos por rol (coordinador, asesor dueño, asesor con solo un proceso del contacto,
  asesor ajeno, abogado), cuerpo inválido, `client_token` repetido (mismo autor y contacto →
  misma respuesta; otro autor u otro contacto → 409), dos pedidos a la vez con el mismo
  token, `activityId` de otro contacto (404), fallo al crear la tarea (`pendiente: true`),
  reintento (volver a llamar, de otra persona, tardío, con intento posterior).
- **Componentes** (`.test.tsx`, happy-dom, sin temporizadores simulados): `FormLlamada`
  ("No atendió" guarda con un toque; "volver a llamar" sin fecha muestra el error),
  `ItemActividad` (qué ofrece el menú según quién mira), `Actividad` (vacíos por filtro).
  **Única excepción a "sin temporizadores simulados":** el test de 9.3 que comprueba que
  el "Deshacer" de "Procesos" desaparece solo al llegar la hora. Ese test usa reloj
  simulado y por eso **no usa `userEvent`** (se cuelga con el reloj simulado): no hace
  ningún clic, solo dibuja, adelanta el reloj y mira. Los clics de ese botón van en
  otros tests, con reloj real y un `deshacer_hasta` fijo.
  Los tests de foco (9.4 y 10.3) miran `document.activeElement` después de cada paso.
  Si el worker no arranca a los 60 s, se reintenta una vez (CLAUDE.md).
- **Base:** el script de D1.
- **`eslint`:** `npx eslint <archivos tocados>` en cada tarea que toca código, además de
  `tsc` y vitest.
- **Interfaz:** solo en la vista previa de Netlify con el navegador de Claude, a 390 y
  1280 px, comparando contra `maqueta/capturas/`.

## Diferencias con lo aprobado

Todo lo que este change hace distinto de la maqueta aprobada, de la spec `crm-sistema-diseno`
o de la sección 8 del diseño general. **Las veinte quedaron confirmadas por el dueño el
2026-11-25 ("Ok a todo", tarea 1.6), antes de construir.**

Con la maqueta y la spec `crm-sistema-diseno`:

1. **Cortes de ancho.** La ficha mira el ancho que le queda después del menú lateral, no el
   de la ventana. Entre 768 y ~930 px con el menú abierto usa pestañas, no dos columnas
   (D6). Motivo: la maqueta no tenía el menú lateral real.
2. **Avisos que nombraban «Sin respuesta» del Inicio.** Se cambian por textos que son verdad
   hoy, hasta que salga `crm-inicio` (D7).
3. **Una llamada atendida cierra también la tarea "Enviar WhatsApp"** de la cadencia. En la
   maqueta quedaba pendiente. Motivo: ya se habló con la persona.
4. **Toasts arriba a la derecha**, no abajo. Es el lugar de toda la plataforma; moverlo
   afecta a todas las pantallas.
5. **La barra superior sigue diciendo "Contactos"** (o "Mis contactos"); el nombre de la
   persona va en la cabecera de la ficha.
6. **Menú "⋯" en cada registro** (Editar, Borrar, Anular): la maqueta no lo tenía y la
   propuesta lo pide.
7. **"+ Tarea" muestra el tipo "Email"**, que la maqueta no tiene: se usa el formulario de
   tareas de hoy sin tocarlo.
8. **"Coordinar tasación" y "Abrir el proceso" según la situación** (tabla de D2): la maqueta solo mostraba el caso de una solicitud abierta.
9. **El número de la llamada se cuenta por proceso**, no por contacto. En la maqueta era
   por contacto (`base.js`, `llamadasDe(c.id)`). Motivo: una persona que vuelve con otra
   propiedad meses después arranca de "Llamada 1", y la secuencia es de esa solicitud.
10. **La tercera "No atendió" con la tarea "Enviar WhatsApp" todavía pendiente no crea
    otra.** La maqueta crearía una segunda tarea igual. El aviso dice "Ya hay una tarea
    pendiente de enviarle WhatsApp: no se crea otra."
11. **"Tarea creada sola · …" va dentro del registro de la llamada**, no como un renglón
    aparte de la lista (D5).
12. **Nombres de las etapas.** La maqueta dice "Solicitud de tasación", "Tasación agendada"
    y "Perdida" (`base.js:98-101`); la ficha real usa los que ya usa el CRM: "Solicitud",
    "Coordinada" y "Descartado". Motivo: que la misma etapa no tenga dos nombres en la
    plataforma. "Perdido" queda solo en el botón "Marcar proceso como perdido" y en su aviso.
13. **Tres columnas antes de 1280 px cuando el menú está colapsado.** Desde unos 1056 px de
    ventana ya quedan 960 px libres (D6). La spec aprobada decía tres columnas desde 1280.
14. **"Coordinar tasación" fijo en el bloque "Procesos"**, en cada solicitud que quien mira
    puede convertir. La maqueta lo tenía solo en el aviso de la llamada. Motivo: el aviso
    se pierde al cerrarlo o recargar, y sin el botón fijo el camino que queda duplica el
    proceso (D5).
15. **"Marcar WhatsApp enviado" guarda también la hora corregida** elegida en el
    formulario, no solo el comentario (D5).
16. **Marcar un proceso como perdido no suma un renglón a la actividad.** En la maqueta
    aparecía "Pasó de X a Perdida". Acá la actividad muestra solo notas, llamadas y WhatsApp
    marcado; los cambios de etapa llegan con `crm-linea-de-tiempo`. El cambio sí se ve en el
    toast, en la cabecera y en "Procesos".
17. **El aviso con "Deshacer" dura 6 segundos, igual que en la maqueta, pero se puede
    cerrar antes con su X** (el `Toaster` de la plataforma trae botón de cerrar; el de la
    maqueta no). Cerrarlo no deshace nada.

Con la sección 8 del diseño general:

18. **Cambia 8.8 (permisos).** El asesor ve también el contacto de un proceso o una tasación
   a su nombre, no solo los asignados o creados por él. Motivo: si no, se rompe el editor de
   contacto en `/pipeline/[id]` y `/appraisals/[id]` (D2).
19. **Interpreta 8.3 (sin proceso activo).** 8.3 dice "no corre la cadencia" y 8.2 dice que
    "volver a llamar" "siempre crea la tarea". Se tomó: sin proceso no hay secuencia (una
    "No atendió" no agenda nada), pero "volver a llamar" igual crea su tarea ligada al
    contacto, y una llamada cierra las tareas de llamada ligadas solo al contacto. Motivo:
    el formulario ya pidió día y hora; tirarlos sería peor.
20. **8.1 se aplica tal cual:** una llamada completa las tareas de entrada y las de llamada
    de cualquier coordinador. Dos precisiones que 8.1 no decía: no toca la tarea de llamada
    que un **asesor** se agendó a mano, y sí cierra las `update_contact` que crea el agente
    de tasación por WhatsApp (son del mismo tipo y del mismo proceso).

**Precisiones agregadas en la verificación final (2026-11-25).** No estaban entre las
veinte que cubrió el "Ok a todo": no cambian ninguna decisión confirmada, pero **se le
nombran al dueño al abrir el PR, antes de construir (tarea 1.5), y su respuesta se copia
ahí**; se repiten en el reporte final (tarea 13.5). Dos cambian algo que se ve: la 21
("volver a llamar" cargado fuera de orden no crea tarea) y la 25 (se toca un enlace de la
página de tareas, que estaba afuera).

21. **Un intento cargado fuera de orden no crea ni cierra tareas, tampoco con "volver a
    llamar".** 8.2 dice que "volver a llamar" "siempre crea la tarea" (diferencia 19). Si
    la llamada se carga con la hora corregida y queda antes de otro intento más nuevo, se
    guarda pero no mueve nada: el aviso dice que quedó anotada antes de otra más nueva.
22. **Cada ítem de "Tasaciones agendadas" abre `/pipeline/<id>` de ese proceso.** La
    maqueta decía "abre la tasación agendada, como hoy"; como el bloque sale de los
    procesos en Coordinada, esa es su pantalla (D4).
23. **Botón "Deshacer" en el ítem de un proceso descartado, en "Procesos", durante los 10
    minutos.** La maqueta tenía el "Deshacer" solo en el toast (6 segundos). Motivo: el
    dueño confirmó 10 minutos, y pasado el toast no quedaba ningún botón para usarlos (D5).

**Precisiones agregadas en la verificación final, ronda 2 (2026-11-25).** Tampoco cambian
ninguna decisión confirmada, y también se le nombran al dueño al abrir el PR (tarea 1.5) y
en el reporte final.

24. **El toast del perdido suma un renglón:** "Se puede deshacer durante 10 minutos desde
    «Procesos» (en el celular, pestaña Tareas)." En la maqueta decía solo "Proceso marcado
    como perdido." Motivo: el botón de los 10 minutos (diferencia 23) queda en "Procesos",
    que en celular está dentro de la pestaña Tareas (D5).
25. **Una tarea de la cadencia abierta desde `/tasks` abre la ficha y no el proceso.** La
    página de tareas quedaba afuera de este change; se toca solo ese enlace, porque sin
    eso la tarea "Llamar a {nombre}" de un asesor sobre un proceso ajeno lo llevaba a una
    pantalla sin datos (D5). Las demás tareas abren lo mismo que hoy.

## Risks / Trade-offs

- [La vista previa usa la base de producción] → el QA trabaja solo sobre los datos de la
  receta de prueba (tarea 2.5): contacto `[TEST] Ficha QA`, proceso con `origin` vacío,
  tareas asignadas solo a cuentas de prueba, creados y borrados en la misma sesión.
- [Coordinar dispara un email real y una tarea a un asesor real] → `notifyDealCreated` le
  escribe a coordinación, admins, dueños y al asesor. El "modo prueba" de emails
  (`notification_settings.test_mode_enabled`, `lib/email/test-mode.ts`) **es un ajuste
  global de la base de producción**: prenderlo desviaría todos los emails reales del
  negocio, así que no se usa. La conversión **no se ejecuta de punta a punta en el QA**: se
  cubre con el test de la ruta, con una prueba del `update` y del trigger dentro de una
  transacción con `ROLLBACK` (tarea 8.4), y en pantalla se verifica solo la precarga, sin
  tocar "Guardar". Queda dicho como límite de la verificación.
- [Cerrar el acceso de `GET`/`PUT /api/contacts/[id]`] → un asesor deja de poder leer o
  editar, con el id, un contacto con el que no tiene ningún vínculo; y el abogado, cualquier
  contacto. Quien tiene vínculo (asignado, creado, proceso o tasación a su nombre) sigue
  igual. Antes de codear se listan las pantallas que usan esas rutas y se cuenta en la base
  cuántos contactos quedarían fuera del alcance de su asesor (tarea 5.1).
- [La lista `/contacts` del asesor sigue mostrando solo los asignados a él] → no cambia en
  este change: un contacto del embudo con proceso suyo se abre desde el CRM o desde el
  proceso, pero no figura en "Mis contactos". Se anota para `crm-inicio`.
- [`PUT /api/tasks/[id]` no controla de quién es la tarea] → existe desde antes; la ficha lo
  usa para completar. Se corrige en `crm-tareas-y-campanita` y queda anotado en su propuesta.
- [Las dos columnas nuevas de `tasks` se pueden escribir con sesión propia] → las políticas
  de `tasks` que ya existen dejan insertar a cualquier usuario con sesión (`WITH CHECK
  (true)`) y editar las propias. Un usuario interno podría, por la API de la base, crear
  una tarea con el `source_activity_id` de una llamada ajena, y `createCadenceTask` la
  daría por buena ante el 23505. No es alcanzable desde ninguna pantalla y solo afecta a
  qué tarea figura como "creada" por esa llamada. Hueco conocido: cerrar la escritura
  directa de `tasks` es de `crm-tareas-y-campanita` y queda anotado en su propuesta
  (tarea 13.1).
- [Las notas del proceso se leen y se escriben en dos pasos al convertir] → si el agente
  de WhatsApp agrega su nota justo entre la lectura y el `update` de la conversión, esa
  nota se pierde. La ventana es de milisegundos y hoy el agente de tasación está apagado;
  no se agrega una función de base para esto. Cuando el campo "Notas" llega vacío no hay
  riesgo: la columna no se escribe.
- [`POST /api/deals/[id]/advance` no revisa de quién es el proceso] → existe desde antes. La
  ficha solo dibuja "Marcar proceso como perdido" con `puedeCerrarProceso`, y la ruta nueva
  de deshacer sí lo revisa.
- [Fechas de tareas: este change empieza a producir tareas con fecha todos los días] → las
  tareas de la cadencia se guardan con fecha y hora de Argentina, pero `getMyTasks` compara
  contra "hoy" en UTC (`lib/supabase/tasks.ts:132`). **Síntoma concreto:** entre las 21:00 y
  las 24:00 de Argentina, la "Llamada 2" de mañana ya aparece en `/tasks` como de hoy. No es
  una falla nueva de este change; se corrige en `crm-tareas-y-campanita`. Se muestra en el QA
  (tarea 12.3) y se le avisa al dueño.
- [Leads que quedan sin tarea hasta `crm-inicio`] → ver D7: siguen en la columna Solicitud
  del CRM, pero no hay lista que los junte.
- [Dos personas registran la misma llamada a la vez] → quedan dos llamadas y, a lo sumo, dos
  tareas siguientes. No se bloquea: cualquiera de las dos puede anular la suya.
- [Cerrar tareas de otros] → son las de entrada del lead, las del agente de tasación, las de
  la cadencia y las de llamada de coordinación; el aviso nombra cada tarea cerrada y
  "Deshacer" las reabre. Queda marcado en la base qué intento las cerró.
- [Deshacer un "perdido" suma dos filas al historial de etapas] → `→ lost` y `lost → etapa`.
  Es lo que pasó. `lost_at` se limpia, así que `vw_funnel_daily` no lo cuenta como
  perdido; se verifica con un `select` en el QA (tareas 8.5 y 9.7). **Lo que sí se
  ensucia, con su alcance real:** el costo por tasación y por captación de `/metrics`
  (`get_funnel_costs`, migración `20260806000004`) cuenta filas de `deal_stage_history`
  con `to_stage = 'appraisal_sent'` o `'captured'`. Si se marca perdido y se deshace un
  proceso que estaba en **Tasación Entregada o en Captada**, la fila nueva `lost → etapa`
  cuenta como otra llegada a esa etapa. En las demás etapas no cambia ningún número. No
  es nuevo de este change: hoy pasa igual con cualquier vuelta atrás de etapa. No se
  corrige acá; se le avisa al dueño en el reporte final.
- [Convertir un proceso que ya estaba en "agendada" sin día no deja rastro del momento]
  → la etapa no cambia, el trigger no suma fila al historial y `scheduled_at` queda con
  la fecha vieja (D9, paso 4). Para esos procesos, el momento de "agendada" que lee
  cualquier métrica es el de antes, no el de la coordinación real. Son pocos (el CRM los
  muestra como Solicitud) y no se toca el trigger en este change.
- [Borrar un contacto borra para siempre sus llamadas y notas] → `contact_activities`
  cuelga del contacto con `ON DELETE CASCADE` (D1). Admin y dueño pueden borrar un
  contacto, también en lote desde `/contacts`: sus procesos siguen vivos sin persona
  (`contact_id` vacío, como hoy), pero **el historial de llamadas, notas y WhatsApp
  marcados se va con el contacto y no se recupera**, y las tareas de la cadencia de esa
  persona quedan pendientes y sueltas (sin contacto y sin el registro que las creó). Se
  acepta: un registro sin persona no se puede mostrar en ninguna ficha. Se le avisa al
  dueño en el reporte final (tarea 13.5); que el diálogo de borrado de `/contacts` lo
  diga queda anotado para `crm-tareas-y-campanita` (tarea 13.1), porque esa pantalla no
  se toca acá.
- [El abogado todavía puede leer la persona por la ruta de procesos] → este change le
  cierra la ficha, la lista y las rutas de contactos. Pero `GET /api/deals/[id]`
  (`canAccessDeal` deja pasar a todo rol que no sea asesor) devuelve el proceso con su
  contacto completo, y no se toca. Con el id de un proceso, el abogado sigue leyendo
  nombre, teléfono y email. Existe desde antes; queda anotado para el change que revise
  los permisos de procesos (tarea 13.1) y el reporte al dueño lo dice así: "deja de ver
  la ficha y la lista de contactos", no "deja de ver contactos".
- [La tarea de entrada del lead puede nacer después de la primera llamada] → la crea la
  cola del embudo, que corre cada minuto y reintenta (`side-effect-handlers.ts`). Si la
  coordinadora registra la llamada antes de que esa tarea exista, la tarea nace después,
  el corte `creadasAntesDe` la deja afuera y queda pendiente aunque ya se llamó. Es raro
  (hay que llamar dentro del primer minuto, o con la cola atrasada). Se completa a mano
  o la cierra la llamada siguiente. La regla no cambia: sin ese corte, un reintento
  tardío cerraría tareas de una llamada posterior.
- [La tarea de entrada del lead abre el proceso, no la ficha] → desde `/tasks`, la
  `update_contact` de un lead nuevo sigue llevando a `/pipeline/<id>?editContact=1` (D5).
  La Llamada 1 se registra entrando a la ficha por el nombre. Se anota para
  `crm-tareas-y-campanita` y se le avisa al dueño.
- [Completar con el tilde la tarea "Enviar WhatsApp" no termina la secuencia] → si nadie
  toca "Marcar WhatsApp enviado", la próxima "No atendió" crea otra tarea "Enviar
  WhatsApp" (D2). Es a propósito y está en un escenario de la spec.
- [Convertir una solicitud completa `created_by` si estaba vacío] → cambia un dato del
  proceso que antes quedaba vacío para siempre. Se usa para el email de confirmación y como
  dueño secundario en `PATCH /api/deals/[id]/contact`; no entra en ninguna métrica del
  embudo (esas miran `origin`). Quien coordina ya podía ver y editar ese proceso.
- [Un asesor no ve en la ficha los procesos de otro asesor sobre el mismo contacto] → puede
  no enterarse de que la persona ya tiene otra tasación en curso; sí ve la etapa del proceso
  activo y toda la actividad. Es la opción que muestra menos; confirmada por el dueño el 2026-11-25.
- [Endurecer `PUT /api/contacts/[id]` rompe a quien mandaba campos de más] → el único
  cliente es `ContactEditor`, que manda campos de la lista permitida; se cubre con un test
  que envía **exactamente el cuerpo que arma `ContactEditor`, con `phone`, `email`, `origin`
  y `notes` en `null`**, y espera 200.
- [Convertir y deshacer llaman a Mailchimp dentro del pedido] → es una llamada a un
  tercero, igual que hoy en `advance` (`updateDealStage`). Atrapa sus errores y no corta la
  respuesta, pero suma su tiempo al pedido. **En la conversión el peor caso suma más que
  hoy:** en un mismo pedido van los emails de `notifyDealCreated` (como en toda
  coordinación) y además la llamada a Mailchimp. Es la misma suma de terceros que dio el
  504 de `/api/funnel/submit` (CLAUDE.md). Por eso el orden es fijo (tarea → emails →
  Mailchimp al final, D9): si la función se corta, se pierde lo menos importante. El
  reintento recibe 409 y lo que no salió no se repite. No se agrega ningún barrido que lo
  repare después: si falla, queda el `console.warn` de hoy.
- [Deshacer un "perdido" puede reiniciar la secuencia de emails de un cliente real] →
  marcar perdido apaga la etiqueta de su secuencia (`seq-solicita` o `seq-agendada`) y
  deshacer la vuelve a prender. Si la automatización de Mailchimp permite reingreso, la
  persona recibe otra vez el primer email. El plazo corto del "Deshacer" (10 minutos) lo
  acota a errores recién cometidos, pero no lo evita. El dueño lo aceptó el 2026-11-25:
  `undo-lost` sincroniza con Mailchimp aunque la persona pueda recibir la secuencia otra
  vez desde el primer email.
- [Los procesos `[TEST]` coordinados o posteriores son candidatos a Mailchimp] → la
  etiqueta de secuencia no mira el origen para `scheduled` con día ni para `visited`, y
  `syncDealToMailchimp` crea el email en la audiencia si no existe. Lo dispara `undo-lost`
  y también, sin que nadie toque nada, el barrido `reconcileMailchimp`. Por eso la receta
  **suprime los dos emails de prueba en `mailchimp_suppressions` antes de crear cualquier
  proceso** (el del contacto y el segundo, que es el único al que se puede cambiar el
  email en el QA; ese cambio se hace solo sobre la situación `solicitud`, que no lleva
  etiqueta de secuencia), y la limpieza controla que no haya ningún renglón `synced` (tareas 2.5, 12.7
  y 13.4). Lo que no se pudo confirmar desde acá: si la sincronización está prendida en
  las vistas previas (`MAILCHIMP_SYNC_ENABLED`) y si el barrido está programado; la receta
  no depende de ninguna de las dos cosas. Límite que queda: `isSuppressed` responde "no
  suprimido" si su consulta falla; por eso `verificar` mira el log y, si aparece un
  `synced`, se frena el QA y se le avisa al dueño.
- [Tareas de la cadencia que quedan pendientes cuando el proceso se cierra por otro lado]
  → si alguien descarta o capta el proceso desde `/pipeline/[id]` (o lo marca perdido desde
  la ficha), sus tareas "Llamada N" o "Enviar WhatsApp" **quedan pendientes**: nada las
  cierra solo, y una llamada sobre un proceso nuevo no toca tareas de otro proceso. La
  ficha las sigue listando y se completan a mano. Limpiarlas al cerrar un proceso es
  trabajo de `crm-tareas-y-campanita` y queda anotado en su propuesta (tarea 13.1).
- [Un asesor registra sobre un proceso que no es suyo] → la llamada queda y cuenta en la
  racha, pero no agenda ni cierra tareas de otros (D2). Es la opción que menos toca lo
  ajeno; confirmada por el dueño el 2026-11-25.
- [Un asesor registra sobre una persona sin proceso abierto] → cierra solo las tareas
  ligadas al contacto que están a su nombre; las de la coordinación (una `update_contact`,
  una llamada agendada a mano) quedan pendientes aunque el asesor ya haya hablado con la
  persona, y las completa a mano quien las tiene. Misma idea que el punto anterior;
  confirmada por el dueño el 2026-11-25.
- [Coordinar desde el botón fijo o desde el menú sin registrar antes una llamada] → las
  tareas de entrada del lead (una `update_contact` por coordinador) **quedan pendientes**:
  lo que las cierra es registrar una llamada, no coordinar. Es igual que hoy cuando se
  coordina desde el menú. Se completan a mano o con la próxima llamada; cerrarlas al
  coordinar queda anotado para `crm-tareas-y-campanita` (tarea 13.1).
- [Contacto con dos procesos abiertos] → pasa de verdad: quien manda dos veces el
  formulario de tasación queda con dos solicitudes, cada una con su tarea de entrada por
  coordinador; quien pide tasación y después se anota a la clase queda con una solicitud y
  un proceso de clase más nuevo. El activo es siempre el más reciente. Efectos que se
  aceptan y están en los escenarios: la llamada cierra las tareas de entrada de **una sola**
  solicitud (las de la otra quedan pendientes y esa solicitud sigue abierta, a la vista en
  "Procesos" con su botón "Coordinar tasación" y su enlace para descartarla); y con
  solicitud + clase más nueva, "Agendó" ofrece abrir un proceso nuevo, aunque la solicitud
  se puede convertir desde "Procesos". Si la coordinadora usa el aviso en vez del botón de
  la solicitud, queda un proceso de más. El dueño confirmó el 2026-11-25 que en ese caso el activo
  sigue siendo el más reciente (la clase).
- [Convertir puede dejar dos contactos con el mismo email o teléfono] → al convertir (y al
  coordinar con `contact_id`) se escribe en el contacto del proceso el email o el teléfono
  tipeado, sin mirar si ya lo tiene otro contacto. La búsqueda de `POST /api/deals` de hoy
  (`.in('email', …).limit(1)`) tomaría cualquiera de los dos la próxima vez. No se bloquea
  (frenar una coordinación por un duplicado sería peor), pero **la respuesta lleva un
  `warning`** cuando el email o el `phone_norm` nuevo ya existe en otro contacto ("Ya hay
  otro contacto con ese email o teléfono: revisá si es la misma persona"), y la pantalla
  lo muestra. Unificar contactos duplicados queda fuera de este change.
- [El botón fijo "Coordinar tasación" no estaba en la maqueta] → es un botón más en el
  bloque "Procesos"; el dueño lo confirmó el 2026-11-25 (diferencia 14 de la lista
  de arriba). Sin ese botón, con el aviso cerrado una solicitud solo se podría coordinar
  cargando otra llamada "Agendó".
- [Anular en dos escrituras] → si falla la parte de las tareas, la pantalla ofrece
  reintentar y la repetición completa lo que faltó (D8).
- [El horario laboral (lunes a viernes, 9:00) es un supuesto] → es una constante en un solo
  archivo; cambiarla no toca la base.
- [Contactos con muchas actividades] → la lista pagina de a 50 por `occurred_at` con índice;
  la numeración lee solo `id, deal_id, occurred_at, created_at` de las llamadas.
- [El worktree vive en iCloud y en una ruta con tilde] → `tsc`, `vitest` y `git` se pueden
  colgar. Se usan las configuraciones acotadas; si una corrida se cuelga se reintenta una
  vez y, si sigue, se copia el worktree a disco local para correr las pruebas.

## Migration Plan

1. **Antes del código:** aplicar `20261125000001_contact_activities.sql` con
   `scripts/apply-contact-activities-pg.ts` y guardar su salida en el PR. Es aditiva (tabla
   nueva, dos columnas opcionales, índices): el código que está hoy en producción no la
   nombra y sigue funcionando.
2. **Variables de entorno:** ninguna nueva.
3. **Rama:** antes que nada se commitea lo que hoy está sin commitear en el worktree (la
   maqueta aprobada, `aprobacion.md` y los artefactos de este change; tarea 1.1). Después
   los documentos del módulo (OpenSpec, maqueta, skills) viajan a `main` en su propio PR
   (dispara un deploy sin cambios de código). **No se corta una rama nueva ni se cambia
   de rama:** se sigue en la rama local que ya existe en este worktree,
   `feat/crm-ficha-contacto`, puesta al día con `origin/main`, y se sube a la rama remota
   `feat/crm-ficha-y-llamadas` con `git push origin HEAD:feat/crm-ficha-y-llamadas`, sin
   forzar (tarea 1.3). Así
   `git diff --name-only origin/main <rama>` lista solo archivos de este change, **más los
   documentos de `openspec/` que la rama lleva de más** (el archivado de
   `crm-sistema-diseno` con su spec vigente en `openspec/specs/`, y las respuestas del
   dueño) y lo que toca la tarea 13.1 (`CLAUDE.md` y las propuestas de
   `crm-tareas-y-campanita` y `crm-inicio`).
4. **Código:** PR en borrador desde el principio (da la vista previa); QA; auditoría doble
   cerrada; merge con `--rebase` (squash no despliega).
5. **Procesos programados:** ninguno.
6. **Humo en `https://inmodf.com.ar`:** crear el contacto `[TEST]` con el script de la
   receta, abrir su ficha, registrar y deshacer una llamada, un `select` que confirme la
   fila anulada, y borrar todo lo de prueba.
7. **Vuelta atrás.** El merge es con `--rebase` y el PR tiene un commit por tarea: en
   `main` **no queda un commit de merge**, quedan decenas de commits sueltos, así que
   "`git revert` del merge" no existe y `git revert -m 1` tampoco aplica. Revertir solo el
   último dejaría el permiso nuevo de contactos a medias. La receta, que se deja lista
   **antes** del merge (tarea 13.2):
   - anotar en el PR dos SHA: `ANTES` = `origin/main` justo antes del merge, y `ULTIMO` =
     el último commit de este PR ya en `main` (después del merge);
   - rama nueva desde `origin/main` actualizado; `git revert --no-commit ANTES..ULTIMO`
     (el rango es solo lo de este PR: si otra sesión mergeó algo después, no se toca); un
     solo commit, con autor `Sujupar <redstyle50@gmail.com>` (si no, Netlify no despliega);
   - PR y `gh pr merge --rebase` (el push directo a `main` está bloqueado);
   - verificar que Netlify desplegó, que `https://inmodf.com.ar` abre y que desde
     `/pipeline/<id>` se puede editar un contacto y guardar.
   La tabla y las columnas quedan (no molestan al código viejo) y no se borra nada de lo
   registrado. Los datos `[TEST]` del humo se borran igual con la receta
   (`_qa-ficha-datos.ts borrar`), que no depende del código revertido.

## Open Questions

Las preguntas están separadas en dos grupos, porque no pesan igual.

**A. Resueltas por el dueño el 2026-11-25.** Eran las decisiones que cambian las specs o
las tareas. Se le presentaron junto con los artefactos y contestó "Ok a todo": quedó
confirmada, en cada una, la opción prudente que ya estaba escrita en specs, diseño y
tareas. No cambió ningún comportamiento. La tarea 1.6 queda cumplida.

- **Las veinte diferencias de "Diferencias con lo aprobado".**
  → Confirmadas las veinte.
- **Permisos de contactos.**
  → Coordinador, admin y dueño ven todos. El asesor, solo los suyos: los asignados a él,
  los que creó, y los de un proceso o una tasación a su nombre. El abogado, ninguno.
- **Qué ve un asesor en "Detalles" cuando la persona no tiene proceso abierto y su último
  proceso, ya cerrado, es de otro asesor o no tiene asesor** (D4).
  → No ve nada de ese proceso, tampoco la etapa ("Descartado"); solo el origen y el asesor
  del contacto.
- **Asesor que llama a una persona sin proceso abierto** (D2).
  → Cierra solo las tareas que están a su nombre; las de la coordinación sobre esa persona
  quedan pendientes.
- **Solicitud abierta y un proceso de clase gratuita más nuevo** (D2).
  → El proceso activo sigue siendo el más reciente, o sea el de la clase. "Agendó" ofrece
  abrir un proceso nuevo, y la solicitud se puede convertir desde "Procesos".
- **Qué ve un asesor en "Detalles" cuando el proceso activo (abierto) es de otro** (D4).
  → Solo la etapa; ni la propiedad, ni la campaña, ni el nombre del otro asesor.
- **Asesor que registra una llamada sobre un proceso que no es suyo** (D2).
  → La llamada queda guardada, pero no agenda la siguiente ni cierra tareas de la
  coordinación o de otro asesor. "Volver a llamar" sí le agenda su propia tarea.
- **La tarea "Llamar a {nombre}" que un asesor se agendó con "volver a llamar" sobre un
  proceso que no es suyo** (D2).
  → La próxima llamada de la coordinación la cierra, como a cualquier tarea de llamada
  pendiente de ese proceso, y el aviso la nombra. (La llamada que un asesor se creó a mano
  con "+ Tarea" sigue sin tocarse: diferencia 20.)
- **Botón fijo "Coordinar tasación" en el bloque "Procesos"** (D5, diferencia 14).
  → Va.
- **Deshacer un "perdido" y los emails de Mailchimp** (D9).
  → Se acepta que, al deshacer, Mailchimp pueda reenviar la secuencia desde el primer email.
- **Un proceso sin asesor, ¿lo ve un asesor en la ficha?** (D4).
  → No.
- **Plazo del "Deshacer" de "Marcar proceso como perdido".**
  → 10 minutos (`MINUTOS_PARA_DESHACER`).
- **Qué ve un asesor en la ficha de un contacto que también atiende otro asesor** (D4).
  → Ve la persona, la etapa del proceso activo y toda la actividad (notas y llamadas); en
  Procesos, Tasaciones, Archivos y Tareas, solo lo que está a su nombre.
- **Lead de la clase gratuita que acepta una tasación.**
  → Se le abre un proceso nuevo, como hoy (queda el de la clase y el de la tasación).
- **Leads sin tarea hasta que salga el Inicio nuevo** (D7).
  → Se acepta ese hueco hasta que salga `crm-inicio`; este change no lo espera.

**B. Siguen abiertas; no frenan.** No cambian specs ni tareas. Al dueño todavía no se le
preguntaron: se trabaja con la opción por defecto de cada una y se le avisa en el reporte
final.

- **Horario laboral real de la coordinación.** Por defecto: lunes a viernes desde las 9:00.
  Es una constante en un archivo; se ajusta cuando la coordinadora lo confirme.
- **Primera coordinación real desde la ficha.** Por defecto: no se prueba de punta a punta
  en el QA, porque manda un email real; alcanza con las pruebas automáticas y con mirar
  juntos la primera.
- **Cuenta "Julian Coordinador" (@passmail.com) para las pruebas.** Por defecto: se usa;
  recibe tareas `[TEST]` durante el QA, que se borran al terminar.

Ya no es una pregunta: los documentos del módulo entraron a `main` el 2026-11-25 con el
PR #91 (tarea 1.2), solo documentos y la maqueta aprobada.
