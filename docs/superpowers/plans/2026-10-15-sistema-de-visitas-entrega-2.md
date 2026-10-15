# Sistema de visitas — Entrega 2 (sección Visitas, estadísticas, pestaña de la ficha y recordatorio) — Plan de implementación

> **Para agentes:** SUB-SKILL OBLIGATORIA: usar superpowers:subagent-driven-development
> (recomendado; es el método que eligió el dueño para la Entrega 1: "agentes de auditoría que
> auditan lo que hacen los otros") o superpowers:executing-plans. Los pasos usan casillas
> (`- [ ]`) para el seguimiento.

**Objetivo:** que la sección `/visits` muestre, para el período elegido, cuántas visitas hubo, cuántas
se hicieron, cuántas no y por qué, cuánto tarda cada paso, de qué origen y de qué asesor vienen, qué
hay que resolver hoy y la agenda de los próximos días; que la ficha de la propiedad tenga su pestaña
Visitas; y que el asesor reciba UNA vez por visita el aviso "¿se realizó?" cuando pasó sin resultado.

**Arquitectura:** todas las cuentas viven en módulos puros de `lib/visitas/` (`periodo`, `metricas`,
`filtros`, `resumen`, `presentacion`, `recordatorio`), testeados en entorno node. Las rutas
`GET /api/visits` y `GET /api/visits/resumen` son finas (sesión → permisos → parámetros → datos con
clave de servicio → módulo puro → JSON) y aplican el alcance por rol ANTES de leer. La lectura de
muchas filas se pagina de a 1000 con orden fijo (tope de PostgREST). La UI en
`components/visitas/seccion/` compone; las páginas no calculan. El recordatorio corre por `pg_cron`
→ `POST /api/cron/visit-reminders` (la scheduled function de Netlify se borra).

**Stack:** Next.js 16.0.10, React 19.2, TypeScript estricto, Supabase (Postgres + RLS + pg_cron +
pg_net), zod 4, shadcn/ui (`radix-ui`), lucide-react, sonner, Resend (`sendEmail`), vitest 4
(+ happy-dom + Testing Library + `@testing-library/user-event` para componentes).

**Spec:** `docs/superpowers/specs/2026-10-10-sistema-de-visitas-design.md` — en especial §3.4,
§3.5, §4.4, §4.5, §4.6, §4.7, §6 (criterios 12 a 17), §7 y §8. Diseño visual: lienzo
<https://claude.ai/artifact/4rfWaJomtQgBCDadkLUAUe>, pantalla `Main` (diseño A — Claridad). Leer
ambos antes de empezar. Plan anterior (estilo y piezas que se reutilizan):
`docs/superpowers/plans/2026-10-10-sistema-de-visitas-entrega-1.md`.

**Fuera de esta entrega (decidido):** todo lo que depende de la encuesta (Entrega 3). No se lee
`visit_questionnaires` en ningún lado (su esquema cambia en la Entrega 3). Los lugares de la
encuesta se muestran con el texto fijo **"Sin datos — llega con la encuesta"** para que la
estructura aprobada del diseño A quede armada y la Entrega 3 solo los llene:
- tarjeta "Encuestas respondidas" → visible, valor "Sin datos", contexto "Llega con la encuesta";
- embudo → pasos "Respondieron la encuesta" y "Dijeron cuánto ofertarían" visibles y en gris con
  ese texto (no entran en el cálculo del salto más grande);
- bloque "Qué opinan los que visitaron" (en `/visits` y en la pestaña de la ficha) → visible con
  ese texto;
- "Encuestas sin responder hace más de 48 h" dentro de "Requieren tu acción" → **no se muestra**
  (una lista vacía con título no dice nada; aparece en la Entrega 3).
Tampoco hay migraciones de tablas: solo la del job de `pg_cron`. No se agrega ningún índice:
`property_visits` ya tiene `idx_property_visits_scheduled_at`, `(advisor_id, scheduled_at)` y
`(property_id, scheduled_at)`, y hoy tiene ~14 filas — un EXPLAIN no puede justificar nada a ese
volumen; la Tarea 16 lo mide igual y solo si una consulta principal hace Seq Scan con >5.000 filas
se abre una tarea aparte.

## Global Constraints

- Todo el texto que ve una persona, en castellano rioplatense, sin jerga.
- Nombres de funciones, variables y tests en castellano; columnas de la base respetan la
  convención inglesa de `property_visits`.
- Zona horaria única: `America/Argentina/Buenos_Aires`, desfase fijo `-03:00`. Nunca
  `toLocaleString`/`toLocaleDateString`/`toLocaleTimeString` sin `timeZone`; para mostrar se usan
  `formatearFechaHora`, `formatearFechaLarga`, `horaEnArgentina` y `fechaEnArgentina` de
  `lib/visitas/horario.ts`; para convertir un día AAAA-MM-DD en instantes, `inicioDelDiaArgentina`
  y `finDelDiaArgentina` de `lib/filters/rango-fechas.ts`.
- Estados de visita, EXACTOS y sin cambios: `pending_confirmation`, `scheduled`, `completed`,
  `no_show`, `cancelled`.
- Orígenes válidos, EXACTOS: `portal`, `publicidad_meta`, `publicidad_paga`, `cartel`, `otro`
  (+ `null` en las visitas anteriores al 2026-10-10, que se muestran como "Sin origen").
- Motivos, EXACTOS: `no_vino`, `cancelo_persona`, `cancelo_propietario`, `cancelamos_nosotros`,
  `no_disponible`, `otro` (+ `null` en las viejas: "Sin motivo").
- **Regla del tablero:** toda cifra viaja con su base (`Cifra = { valor, base, orientativo }`);
  base 0 ⇒ `valor: null` ⇒ la pantalla dice **"Sin datos"**, nunca 0; porcentajes y medianas con
  base < 20 ⇒ "orientativo". Los conteos no llevan "orientativo" (un conteo no es una estimación).
- **Alcance por rol:** quien tiene `pipeline.view_all` (admin, dueño, coordinador) ve todo y puede
  filtrar por asesor; el asesor ve SOLO las visitas donde `advisor_id = él` **o** `created_by = él`
  (la misma regla que `puedeVerVisita` y que la política `property_visits_select_scoped`) y el
  parámetro `asesor` se ignora; el abogado recibe 403. El alcance se aplica en la RUTA sobre la
  consulta con clave de servicio (la RLS no corre con service role).
- **Tope de 1000 filas de PostgREST:** toda lectura que pueda pasar de 1000 filas se pagina de a
  1000 con orden fijo y único (`scheduled_at`, `id`) y avisa `truncado` si llega al techo de 20
  páginas (CLAUDE.md § "Video de A y B mezclado… tope de 1000 filas").
- **pg_cron:** el job se programa DESPUÉS del deploy, con script que verifica `?ping=1`; secreto
  inline (nunca leído de Vault en el job), `timeout_milliseconds := 30000`, auth doble en la ruta
  (`CRON_SECRET` o `cron_config`); verificación en 3 capas (`cron.job` / `net._http_response` con
  el CONTENIDO de la respuesta / `email_notifications_log`). Un cron nunca hace `return` mudo: la
  respuesta y el `console.log` dicen qué revisó, qué mandó, qué salteó y por qué.
- **Email:** `sendEmail` NUNCA lanza: siempre mirar `{ ok, sent, failed }`. El modo prueba de email
  (`notification_settings.test_mode_enabled`) lo aplica `sendEmail` solo; no hay que reimplementarlo.
- **Celular primero:** todo se diseña para 360 y 390 px; botones y filas tocables ≥ 44 px
  (`min-h-11`); nada superpuesto ni cortado (`break-words`, `min-w-0`, `flex-wrap`); diálogos con
  lista larga = `flex flex-col overflow-hidden` + cuerpo `min-h-0 overflow-y-auto` (lección de la
  Entrega 1); la X de cerrar de los diálogos no se toca.
- **Frontera servidor→cliente:** ningún componente, ícono ni función viaja como prop de un Server
  Component a un Client Component. Todas las páginas de esta entrega son `'use client'`.
- Sin dependencias nuevas en `package.json`.
- zod 4 / UUID de los tests válidos RFC (ej. `11111111-1111-4111-8111-111111111111`).
- Nada de `any`, ni `as` para callar errores, ni `!` sin comentario del porqué. (Excepción ya
  vigente en el repo: el mapeo de filas del cliente Supabase sin tipar en `lib/visitas/datos.ts`,
  que se hace campo por campo con guardas.)
- Commits: autor `Sujupar <redstyle50@gmail.com>`, mensaje en castellano, trailer
  `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. En este worktree el
  guardián rechaza comandos compuestos: `git add <archivos>` y `git commit` en llamadas separadas;
  el mensaje va con `git -c user.name=Sujupar -c user.email=redstyle50@gmail.com commit -F - <<'EOF' … EOF`.
- Pruebas: `npx vitest run --config vitest.visitas.config.ts` (acotada; la raíz tarda minutos por
  iCloud). Tipos: `npx tsc --noEmit -p tsconfig.visitas.json`. Lint: `npx eslint <archivos>`.
  Componentes con `@vitest-environment happy-dom`, `userEvent` SIN temporizadores simulados (solo se
  puede simular `Date`: `vi.useFakeTimers({ toFake: ['Date'] })`). La primera corrida de happy-dom
  en frío puede tardar >60 s o fallar el worker: reintentar una vez, no cambiar código por eso.

## Review Focus

1. **Una visita a las 23:30 de Argentina** (02:30 UTC del día siguiente) cuenta en el día y el
   período correctos: entra en "Este mes" de octubre si es el 31/10 a las 23:30, aparece en la
   agenda bajo su día y no bajo el siguiente. → tests en Tarea 1 (`resolverPeriodo` con `hoy`
   calculado a las 23:30), Tarea 5 (`armarAgenda`) y Tarea 6 (instantes `-03:00` en la consulta).
2. **Un asesor con una visita que él creó pero que está asignada a otro asesor** la ve en su
   agenda, en su lista y en sus números (alcance `advisor_id OR created_by`), y pedir
   `?asesor=<otro>` no le amplía nada. → tests en Tarea 6 (`.or(...)`), Tarea 7 y Tarea 8.
3. **Base chica o vacía:** un período sin visitas muestra "Sin datos" en todas las tarjetas (nunca
   "0 %" ni "0"), un período con 5 agendadas y ningún resultado dice "Sin datos" en "Se realizaron"
   pero "5" en "Agendadas", y con base 1–19 los porcentajes dicen "orientativo". → tests en
   Tarea 2 y Tarea 9.
4. **Las 12 visitas viejas** (sin origen, sin motivo, alguna sin asesor) no rompen nada: caen en
   "Sin origen", "Sin motivo" y "Sin asesor" y suman igual en los totales. → tests en Tarea 2 y
   Tarea 3.
5. **Medianas que mienten:** una visita cargada hoy para documentar una de la semana pasada no da
   anticipación negativa; un registro de comprador creado en el mismo segundo que la visita
   (cartel, carga a mano) no cuenta como "de la consulta a la visita" (si no, la mediana sería
   ~0 min); una visita que nació confirmada no entra en "tiempo de confirmación". → tests en Tarea 3.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `vitest.visitas.config.ts`, `tsconfig.visitas.json` | Config acotada (se amplía). |
| `test/visitas/visita-de-prueba.ts` | Constructor de filas `VisitaListado` para las pruebas. |
| `lib/visitas/periodo.ts` (+test) | Período (7 días / 30 días / este mes / personalizado) en días argentinos. |
| `lib/visitas/metricas.ts` (+test) | Todas las definiciones de §4.5 que no dependen de la encuesta. |
| `lib/visitas/filtros.ts` (+test) | Lectura y validación de los parámetros de las dos rutas GET (con alias viejos). |
| `lib/visitas/resumen.ts` (+test) | Agenda por día, "requieren tu acción", armado del resumen, próximas/pasadas. |
| `lib/visitas/presentacion.ts` (+test) | Textos de cifras, porcentajes, duraciones, origen y resumen del día. Seguro para el navegador. |
| `lib/visitas/recordatorio.ts` (+test) | Ventana y decisión del recordatorio "¿se realizó?". |
| `lib/visitas/acceso.ts` (+test) | Suma `Alcance`, `alcanceDeVisitas` y exporta `esRol`. |
| `lib/visitas/tipos.ts` | Suma `VisitaListado` y `VisitaParaRecordar`. |
| `lib/visitas/datos.ts` (+`datos-listado.test.ts`, `datos-recordatorio.test.ts`) | `listarVisitas`, `todasLasVisitas`, `visitasParaRecordar`, `reservarRecordatorio`, `liberarRecordatorio`. |
| `app/api/visits/route.ts` (+test) | `GET` reescrito (filtros, alcance, paginado). El `POST` no se toca. |
| `app/api/visits/resumen/route.ts` (+test) | `GET` del resumen de la sección. |
| `components/visitas/EstadoVisitaBadge.tsx` | Insignia de estado (una sola, para todas las listas). |
| `components/visitas/seccion/FilaVisita.tsx` | Fila tocable de una visita (agenda, pendientes, pestaña). |
| `components/visitas/seccion/TarjetasVisitas.tsx` (+test) | Las cinco tarjetas. |
| `components/visitas/seccion/AgendaVisitas.tsx` (+test) | Agenda Hoy / Mañana / próximos. |
| `components/visitas/seccion/RequierenAccion.tsx` (+test) | Pendientes con Se realizó / No se realizó / Reprogramar / Confirmar ahí mismo. |
| `components/visitas/seccion/ComoVienen.tsx` (+test) | Embudo, por origen, tiempos, por asesor, motivos y "Qué opinan" (vacío). |
| `components/visitas/seccion/EncabezadoVisitas.tsx` | Período, filtros y botón Agendar visita. |
| `components/visitas/ficha/AccionVisitaDialog.tsx` (+test) | Acepta una fila del listado (`VisitaParaDialogo`), no solo la ficha. |
| `components/visitas/BotonAgendarVisita.tsx` | `propiedadId` pasa a ser opcional. |
| `app/(dashboard)/visits/page.tsx` (+tests) | La sección nueva (se reescribe). |
| `app/(dashboard)/visits/todas/page.tsx` (+test) | "Ver todas": lista con filtros y paginación. |
| `app/(dashboard)/visits/_components/VisitsTable.tsx` (+test) | Tabla sobre `VisitaListado`, con hora argentina. |
| `components/properties/detail/tabs/VisitasTab.tsx` (+test) | Pestaña Visitas de la ficha de propiedad. |
| `lib/properties/detail-view.ts` (+test) | Pestaña `visitas` en `visibleTabs`. |
| `app/(dashboard)/properties/[id]/page.tsx`, `components/properties/detail/tabs/HistoryTab.tsx` | Pestaña nueva; sale "Feedback de visitas". |
| `app/(dashboard)/inicio/page.tsx` (+test), `app/(dashboard)/tasks/page.tsx` | Consumidores de `GET /api/visits`: leen `total` / `direccion`. |
| `lib/email/notifications/visit-reminder-advisor.ts` (+test), `emails/VisitReminderAdvisorEmail.tsx` | Email "¿Se realizó la visita?" sin base, con hora argentina. |
| `app/api/cron/visit-reminders/route.ts` (+test) | Cron con service role, POST, auth doble, ping, presupuesto de tiempo, log. |
| `supabase/migrations/20261015000001_cron_visit_reminders.sql` | Job de pg_cron cada hora (marcadores). |
| `scripts/apply-cron-visit-reminders-pg.ts` | Programa el job DESPUÉS del deploy y lo verifica. |

Se borran (con grep de consumidores en su tarea): `lib/supabase/visits.ts` (`listVisits`),
`app/api/properties/[id]/feedback/route.ts`, `netlify/functions/visit-reminders.ts`.

---

### Tarea 0: Configuración acotada de pruebas y tipos

**Files:**
- Modify: `vitest.visitas.config.ts`
- Modify: `tsconfig.visitas.json`
- Create: `test/visitas/visita-de-prueba.ts`

**Interfaces:**
- Produces: `visitaDePrueba(cambios?: Partial<VisitaListado>): VisitaListado` (lo usan las pruebas de
  las Tareas 2, 3, 5, 9, 10, 11, 12 y 13). `VisitaListado` se crea en la Tarea 2 (`lib/visitas/tipos.ts`);
  este archivo se crea acá pero recién compila cuando la Tarea 2 suma el tipo (las pruebas lo
  importan desde la Tarea 2 en adelante).

- [ ] **Paso 1: Ampliar `vitest.visitas.config.ts`** — reemplazar SOLO el arreglo `include` por
  (se conservan las 11 entradas de la Entrega 1, se suman 9):

```ts
    include: [
      'lib/visitas/**/*.test.ts',
      'lib/portals/fichas-fusionadas.test.ts',
      'lib/leads/visit-scheduling.test.ts',
      'lib/leads/responder-consulta.test.ts',
      'lib/leads/resolve-crm-visit-lead.test.ts',
      'lib/email/notifications/visit-scheduled-client.test.ts',
      'app/api/visits/**/*.test.ts',
      'app/api/properties/*/interesados/*.test.ts',
      'components/visitas/**/*.test.tsx',
      'app/*/visits/**/*.test.tsx',
      'app/*/properties/_components/PropertyDetailModal.test.tsx',
      // Entrega 2
      'app/api/cron/visit-reminders/*.test.ts',
      'lib/email/notifications/visit-reminder-advisor.test.ts',
      'lib/properties/detail-view.test.ts',
      'components/properties/detail/tabs/VisitasTab.test.tsx',
      'components/properties/detail/PropertyTabsNav.test.tsx',
      'app/*/properties/*/page.test.tsx',
      'app/*/properties/*/page.legal.test.tsx',
      'app/*/inicio/page.test.tsx',
      'app/*/tasks/page.test.tsx',
    ],
```

  (`*` sí matchea `[id]` y `(dashboard)` como texto de UN segmento; lo que no funciona es
  escribirlos literalmente en el glob, por eso la config ya los evita.)

- [ ] **Paso 2: Ampliar `tsconfig.visitas.json`** — reemplazar el arreglo `include` por:

```json
  "include": [
    "next-env.d.ts",
    "types/**/*.ts",
    "lib/visitas/**/*.ts",
    "lib/portals/fichas-fusionadas.ts",
    "lib/leads/visit-scheduling.ts",
    "lib/leads/responder-consulta.ts",
    "lib/leads/resolve-crm-visit-lead.ts",
    "lib/ai/reset-prueba.ts",
    "lib/ai/scheduling-agent.ts",
    "lib/email/notifications/visit-scheduled-client.ts",
    "lib/email/notifications/visit-reminder-advisor.ts",
    "emails/VisitReminderAdvisorEmail.tsx",
    "lib/properties/detail-view.ts",
    "app/api/visits/**/*.ts",
    "app/api/cron/visit-reminders/route.ts",
    "app/api/properties/[id]/interesados/route.ts",
    "app/api/v/[token]/schedule/route.ts",
    "components/visitas/**/*.tsx",
    "components/properties/detail/tabs/*.tsx",
    "components/dashboard/Topbar.tsx",
    "app/(dashboard)/layout.tsx",
    "app/(dashboard)/visits/**/*.tsx",
    "app/(dashboard)/properties/[id]/page.tsx",
    "app/(dashboard)/properties/page.tsx",
    "app/(dashboard)/properties/_components/PropertyDetailModal.tsx",
    "app/(dashboard)/inbox/InboxClient.tsx",
    "app/(dashboard)/inbox/LeadDetailSheet.tsx",
    "app/(dashboard)/inicio/page.tsx",
    "app/(dashboard)/tasks/page.tsx",
    "scripts/apply-cron-visit-reminders-pg.ts"
  ],
```

  (Una entrada que todavía no existe —el script de la Tarea 15— no rompe `tsc`: las entradas de
  `include` son patrones.)

- [ ] **Paso 3: Crear `test/visitas/visita-de-prueba.ts`**

```ts
/**
 * Constructor de filas `VisitaListado` para las pruebas de la sección Visitas.
 * Valores por defecto = una visita confirmada, por cartel, de Doblas 248, con su
 * registro de comprador creado UN segundo antes (como lo crea POST /api/visits).
 * Cada llamada genera un id distinto (UUID válido RFC: zod 4 rechaza los inventados).
 */
import type { VisitaListado } from '@/lib/visitas/tipos'

let contador = 0

export const PROP_DOBLAS = '33333333-3333-4333-8333-333333333333'
export const ASESOR_LUCAS = '22222222-2222-4222-8222-222222222222'

export function visitaDePrueba(cambios: Partial<VisitaListado> = {}): VisitaListado {
  contador += 1
  return {
    id: `00000000-0000-4000-8000-${String(contador).padStart(12, '0')}`,
    property_id: PROP_DOBLAS,
    direccion: 'Doblas 248',
    barrio: 'Caballito',
    advisor_id: ASESOR_LUCAS,
    asesor_nombre: 'Lucas Pérez',
    created_by: ASESOR_LUCAS,
    client_name: 'Sofía Benítez',
    client_phone: '+5491158234521',
    status: 'scheduled',
    origin: 'cartel',
    origin_detail: null,
    outcome_reason: null,
    scheduled_at: '2026-10-14T13:30:00.000Z',
    created_at: '2026-10-10T15:00:00.000Z',
    updated_at: '2026-10-10T15:00:00.000000+00:00',
    confirmed_at: '2026-10-10T15:00:00.000Z',
    outcome_at: null,
    consulta_recibida_at: null,
    registro_creado_at: '2026-10-10T14:59:59.000Z',
    ...cambios,
  }
}
```

- [ ] **Paso 4: Correr las pruebas existentes** — `npx vitest run --config vitest.visitas.config.ts`.
  Esperado: PASS de todo lo de la Entrega 1 (351 pruebas) más los archivos sumados (`detail-view`,
  páginas de propiedad, inicio y tareas) tal como están hoy. Si alguno de los sumados falla ANTES
  de tocar código, anotarlo y avisar (no es nuestro; ver "Antes de culpar a un cambio propio" en
  CLAUDE.md § iCloud).

- [ ] **Paso 5: Commit** — `git add vitest.visitas.config.ts tsconfig.visitas.json test/visitas/visita-de-prueba.ts`
  y commit `chore(visitas): config acotada de la Entrega 2`.

---

### Tarea 1: Período en días argentinos

**Files:**
- Create: `lib/visitas/periodo.ts`
- Test: `lib/visitas/periodo.test.ts`

**Interfaces:**
- Consumes: `construirInstante`, `sumarDias`, `fechaEnArgentina` de `lib/visitas/horario.ts`.
- Produces:
  - `PERIODOS = ['7d','30d','mes','personalizado'] as const`, `type ClavePeriodo`,
    `PERIODO_POR_DEFECTO: ClavePeriodo = '30d'`, `PERIODO_ETIQUETA: Record<ClavePeriodo,string>`,
    `MAX_DIAS_PERIODO = 366`.
  - `esClavePeriodo(v: unknown): v is ClavePeriodo`
  - `esFechaValida(v: string | null | undefined): v is string`
  - `interface Periodo { clave: ClavePeriodo; desde: string; hasta: string; etiqueta: string }`
  - `resolverPeriodo(entrada: { periodo?: string | null; from?: string | null; to?: string | null }, hoy: string): { ok: true; periodo: Periodo } | { ok: false; error: string }`
  - `validarRango(desde: string, hasta: string): string | null` (mensaje de error o `null`).

- [ ] **Paso 1: Escribir el test**

```ts
import { describe, it, expect } from 'vitest'
import { resolverPeriodo, validarRango, esFechaValida, esClavePeriodo } from './periodo'
import { fechaEnArgentina } from './horario'

const HOY = '2026-10-15'

function periodo(entrada: Parameters<typeof resolverPeriodo>[0], hoy = HOY) {
  const r = resolverPeriodo(entrada, hoy)
  if (!r.ok) throw new Error(r.error)
  return r.periodo
}

describe('resolverPeriodo', () => {
  it('sin nada: últimos 30 días contando hoy', () => {
    expect(periodo({})).toEqual({ clave: '30d', desde: '2026-09-16', hasta: '2026-10-15', etiqueta: 'Últimos 30 días' })
  })
  it('7 días: de hoy-6 a hoy', () => {
    expect(periodo({ periodo: '7d' })).toMatchObject({ clave: '7d', desde: '2026-10-09', hasta: '2026-10-15', etiqueta: 'Últimos 7 días' })
  })
  it('este mes: del 1 al ÚLTIMO día del mes (incluye los días que vienen)', () => {
    expect(periodo({ periodo: 'mes' })).toMatchObject({ clave: 'mes', desde: '2026-10-01', hasta: '2026-10-31', etiqueta: 'Este mes' })
    expect(periodo({ periodo: 'mes' }, '2028-02-10')).toMatchObject({ desde: '2028-02-01', hasta: '2028-02-29' })
    expect(periodo({ periodo: 'mes' }, '2026-12-31')).toMatchObject({ desde: '2026-12-01', hasta: '2026-12-31' })
  })
  it('un período desconocido o "personalizado" sin fechas cae en 30 días', () => {
    expect(periodo({ periodo: 'inventado' }).clave).toBe('30d')
    expect(periodo({ periodo: 'personalizado' }).clave).toBe('30d')
  })
  it('con from y to manda el rango (así llega el link de Inicio: ?from=hoy&to=hoy)', () => {
    expect(periodo({ periodo: '7d', from: HOY, to: HOY })).toEqual({ clave: 'personalizado', desde: HOY, hasta: HOY, etiqueta: 'Hoy' })
    expect(periodo({ from: '2026-10-01', to: '2026-10-10' }).etiqueta).toBe('Del 01/10 al 10/10')
    expect(periodo({ from: '2026-10-03', to: '2026-10-03' }).etiqueta).toBe('El 03/10')
  })
  it('rango inválido: mensaje claro', () => {
    expect(resolverPeriodo({ from: '2026-10-10', to: '2026-10-01' }, HOY)).toEqual({ ok: false, error: 'La fecha "desde" es posterior a "hasta"' })
    expect(resolverPeriodo({ from: '2026-02-31', to: '2026-03-01' }, HOY)).toEqual({ ok: false, error: 'Elegí las dos fechas del período' })
    expect(resolverPeriodo({ from: '2026-10-01' }, HOY)).toEqual({ ok: false, error: 'Elegí las dos fechas del período' })
    expect(resolverPeriodo({ from: '2024-01-01', to: '2026-10-01' }, HOY)).toEqual({ ok: false, error: 'Elegí un período de hasta un año' })
  })
  it('a las 23:30 de Argentina "hoy" sigue siendo el mismo día (en UTC ya es mañana)', () => {
    const hoy = fechaEnArgentina(new Date('2026-11-01T02:30:00Z'))
    expect(hoy).toBe('2026-10-31')
    expect(periodo({ periodo: 'mes' }, hoy)).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-31' })
  })
})

describe('validaciones sueltas', () => {
  it('esFechaValida rechaza fechas que no existen y formatos raros', () => {
    expect(esFechaValida('2026-10-15')).toBe(true)
    expect(esFechaValida('2026-02-29')).toBe(false)
    expect(esFechaValida('15/10/2026')).toBe(false)
    expect(esFechaValida('')).toBe(false)
    expect(esFechaValida(null)).toBe(false)
  })
  it('validarRango: 366 días entran, 367 no', () => {
    expect(validarRango('2025-10-15', '2026-10-15')).toBeNull()
    expect(validarRango('2025-10-14', '2026-10-15')).toBe('Elegí un período de hasta un año')
  })
  it('esClavePeriodo', () => {
    expect(esClavePeriodo('mes')).toBe(true)
    expect(esClavePeriodo('año')).toBe(false)
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR** — `npx vitest run --config vitest.visitas.config.ts lib/visitas/periodo.test.ts`.
  Esperado: FAIL "Cannot find module './periodo'".

- [ ] **Paso 3: Implementar `lib/visitas/periodo.ts`**

```ts
/**
 * Período de la sección Visitas (spec §3.4 y §4.5): 7 días, 30 días, este mes o
 * personalizado. Las puntas son DÍAS DE ARGENTINA (AAAA-MM-DD). Quién convierte un
 * día en instantes es el servidor (`inicioDelDiaArgentina` / `finDelDiaArgentina`),
 * así la misma URL muestra lo mismo en cualquier máquina.
 *
 * Con `from` y `to` manda el rango aunque venga otro `periodo`: así llega el link de
 * la tarjeta "Visitas de hoy" de /inicio (`/visits?from=<hoy>&to=<hoy>`), que no se
 * puede romper. Módulo puro y seguro para el navegador.
 */
import { construirInstante, sumarDias } from './horario'

export const PERIODOS = ['7d', '30d', 'mes', 'personalizado'] as const
export type ClavePeriodo = (typeof PERIODOS)[number]
export const PERIODO_POR_DEFECTO: ClavePeriodo = '30d'
/** Un año (con bisiesto). Más que eso no es un tablero, es un informe, y la ruta lo paga en filas. */
export const MAX_DIAS_PERIODO = 366

export const PERIODO_ETIQUETA: Record<ClavePeriodo, string> = {
  '7d': '7 días',
  '30d': '30 días',
  mes: 'Este mes',
  personalizado: 'Personalizado',
}

export interface Periodo {
  clave: ClavePeriodo
  desde: string
  hasta: string
  etiqueta: string
}

const MS_DIA = 86_400_000

export function esClavePeriodo(v: unknown): v is ClavePeriodo {
  return typeof v === 'string' && (PERIODOS as readonly string[]).includes(v)
}

/** AAAA-MM-DD que existe en el calendario (`2026-02-29` no). */
export function esFechaValida(v: string | null | undefined): v is string {
  return typeof v === 'string' && construirInstante(v, '12:00') !== null
}

/** Días entre dos fechas de calendario (anclado al mediodía UTC: nunca cruza de día). */
function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / MS_DIA)
}

function ultimoDiaDelMes(fecha: string): string {
  const anio = Number(fecha.slice(0, 4))
  const mes = Number(fecha.slice(5, 7)) // 1–12: como índice 0–11 de Date.UTC es el mes SIGUIENTE
  const primeroDelSiguiente = new Date(Date.UTC(anio, mes, 1, 12)).toISOString().slice(0, 10)
  return sumarDias(primeroDelSiguiente, -1)
}

function ddmm(fecha: string): string {
  return `${fecha.slice(8, 10)}/${fecha.slice(5, 7)}`
}

function etiquetaDeRango(desde: string, hasta: string, hoy: string): string {
  if (desde === hasta) return desde === hoy ? 'Hoy' : `El ${ddmm(desde)}`
  return `Del ${ddmm(desde)} al ${ddmm(hasta)}`
}

/** Mensaje de error del rango, o `null` si está bien. Lo usan esta función y las rutas. */
export function validarRango(desde: string, hasta: string): string | null {
  if (!esFechaValida(desde) || !esFechaValida(hasta)) return 'Elegí las dos fechas del período'
  if (desde > hasta) return 'La fecha "desde" es posterior a "hasta"'
  if (diasEntre(desde, hasta) + 1 > MAX_DIAS_PERIODO) return 'Elegí un período de hasta un año'
  return null
}

export function resolverPeriodo(
  entrada: { periodo?: string | null; from?: string | null; to?: string | null },
  hoy: string,
): { ok: true; periodo: Periodo } | { ok: false; error: string } {
  const from = entrada.from?.trim() ?? ''
  const to = entrada.to?.trim() ?? ''
  if (from || to) {
    const error = validarRango(from, to)
    if (error) return { ok: false, error }
    return { ok: true, periodo: { clave: 'personalizado', desde: from, hasta: to, etiqueta: etiquetaDeRango(from, to, hoy) } }
  }
  const clave = esClavePeriodo(entrada.periodo) ? entrada.periodo : PERIODO_POR_DEFECTO
  if (clave === '7d') return { ok: true, periodo: { clave, desde: sumarDias(hoy, -6), hasta: hoy, etiqueta: 'Últimos 7 días' } }
  if (clave === 'mes') return { ok: true, periodo: { clave, desde: `${hoy.slice(0, 8)}01`, hasta: ultimoDiaDelMes(hoy), etiqueta: 'Este mes' } }
  // '30d', y también 'personalizado' sin fechas (todavía no eligió el rango).
  return { ok: true, periodo: { clave: '30d', desde: sumarDias(hoy, -29), hasta: hoy, etiqueta: 'Últimos 30 días' } }
}
```

- [ ] **Paso 4: Correr y ver PASAR.**
- [ ] **Paso 5: Commit** — `git add lib/visitas/periodo.ts lib/visitas/periodo.test.ts` y commit
  `feat(visitas): período de la sección en días argentinos`.

---

### Tarea 2: Métricas — conteos, motivos y embudo

**Files:**
- Modify: `lib/visitas/tipos.ts` (suma `VisitaListado`)
- Create: `lib/visitas/metricas.ts`
- Test: `lib/visitas/metricas.test.ts`

**Interfaces:**
- Consumes: `ESTADOS_ACTIVOS`, `MOTIVO_ETIQUETA`, `MOTIVOS_NO_REALIZADA`, `type MotivoNoRealizada`
  de `transiciones.ts`.
- Produces (lo usan las Tareas 3, 5, 8, 9, 10):
  - `interface VisitaListado` (en `tipos.ts`, campos exactos abajo).
  - `BASE_ORIENTATIVA = 20`; `interface Cifra { valor: number | null; base: number; orientativo: boolean }`.
  - `cifra(valor: number, base: number): Cifra`, `conteo(n: number): Cifra`,
    `porcentaje(parte: number, base: number): Cifra`, `mediana(valores: readonly number[]): Cifra`.
  - `interface MotivoContado { clave: MotivoNoRealizada | 'sin_motivo'; etiqueta: string; cantidad: number }`
  - `interface ConteosVisitas { agendadas: Cifra; realizadas: Cifra; conteos: { realizadas: number; noRealizadas: number; canceladas: number; conResultado: number }; sinMarcar: number; noSeHicieron: { total: Cifra; porMotivo: MotivoContado[] } }`
  - `contarVisitas(visitas: readonly VisitaListado[], ahora: Date): ConteosVisitas`
  - `interface PasoEmbudo { clave: 'agendadas' | 'confirmadas' | 'realizadas'; etiqueta: string; cantidad: number; saltoMasGrande: boolean }`
  - `armarEmbudo(visitas: readonly VisitaListado[]): PasoEmbudo[]`

**Decisiones de definición (escritas en el código y en esta tarea; vienen de §4.5):**
- **Se realizaron %** = realizadas ÷ (realizadas + no realizadas + canceladas). La base son las
  visitas del período CON resultado (estado final). Una cancelada antes de su fecha también tiene
  resultado y entra (si no, "No se hicieron" y el % contarían conjuntos distintos de canceladas y
  no cerrarían entre sí). Las activas cuya hora ya pasó son "sin marcar" y NO entran en la base.
- **No se hicieron** = no realizadas + canceladas, con base = agendadas del período (así "0" con
  10 agendadas es un 0 de verdad, y sin agendadas dice "Sin datos").
- **Embudo "Confirmadas"** = tuvieron `confirmed_at` **o** se realizaron. Una visita marcada
  "Se realizó" sin pasar por "Confirmar" igual ocurrió; contándola, el embudo nunca sube
  (Agendadas ≥ Confirmadas ≥ Se realizaron). Es una precisión sobre §4.5, que se lista en el
  reporte al dueño.

- [ ] **Paso 1: Sumar el tipo a `lib/visitas/tipos.ts`** (al final del archivo; los imports de
  `EstadoVisita`, `MotivoNoRealizada` y `OrigenVisita` ya están arriba):

```ts
/**
 * Una visita tal como la leen la sección Visitas, su lista, la pestaña de la ficha y
 * las métricas (lib/visitas/datos.ts → `listarVisitas` / `todasLasVisitas`). Plana a
 * propósito: los joins de PostgREST se aplanan en `datos.ts` y nada más los ve.
 */
export interface VisitaListado {
  id: string
  property_id: string
  direccion: string | null
  barrio: string | null
  advisor_id: string | null
  asesor_nombre: string | null
  created_by: string | null
  client_name: string
  client_phone: string | null
  status: EstadoVisita
  origin: OrigenVisita | null
  origin_detail: string | null
  outcome_reason: MotivoNoRealizada | null
  scheduled_at: string
  created_at: string
  /** Versión para la concurrencia optimista de POST /api/visits/[id]/estado (texto EXACTO). */
  updated_at: string
  confirmed_at: string | null
  outcome_at: string | null
  /** De la consulta de portal vinculada: `received_at`, o su `created_at` si el portal no trajo fecha. */
  consulta_recibida_at: string | null
  /** `created_at` del registro de comprador vinculado (`property_leads`). */
  registro_creado_at: string | null
}
```

- [ ] **Paso 2: Escribir el test**

```ts
import { describe, it, expect } from 'vitest'
import { cifra, conteo, porcentaje, mediana, contarVisitas, armarEmbudo } from './metricas'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

const AHORA = new Date('2026-10-15T15:00:00Z')
const PASADA = '2026-10-14T13:30:00.000Z'
const FUTURA = '2026-10-20T13:30:00.000Z'

describe('Cifra: la regla del tablero', () => {
  it('base 0 ⇒ sin datos (valor null), nunca 0', () => {
    expect(cifra(0, 0)).toEqual({ valor: null, base: 0, orientativo: false })
    expect(porcentaje(0, 0)).toEqual({ valor: null, base: 0, orientativo: false })
    expect(mediana([])).toEqual({ valor: null, base: 0, orientativo: false })
    expect(conteo(0)).toEqual({ valor: null, base: 0, orientativo: false })
  })
  it('base menor a 20 ⇒ orientativo; 20 o más ⇒ no', () => {
    expect(porcentaje(1, 3)).toEqual({ valor: 33, base: 3, orientativo: true })
    expect(porcentaje(10, 20)).toEqual({ valor: 50, base: 20, orientativo: false })
  })
  it('un conteo nunca es "orientativo"', () => {
    expect(conteo(3)).toEqual({ valor: 3, base: 3, orientativo: false })
  })
  it('mediana par e impar', () => {
    expect(mediana([5, 1, 3]).valor).toBe(3)
    expect(mediana([4, 1, 3, 2]).valor).toBe(2.5)
  })
})

describe('contarVisitas', () => {
  it('período vacío: todo sin datos', () => {
    const c = contarVisitas([], AHORA)
    expect(c.agendadas.valor).toBeNull()
    expect(c.realizadas.valor).toBeNull()
    expect(c.noSeHicieron.total.valor).toBeNull()
    expect(c.sinMarcar).toBe(0)
  })
  it('5 agendadas sin ningún resultado: agendadas 5, se realizaron SIN DATOS, no se hicieron 0', () => {
    const c = contarVisitas(Array.from({ length: 5 }, () => v({ scheduled_at: FUTURA })), AHORA)
    expect(c.agendadas.valor).toBe(5)
    expect(c.realizadas.valor).toBeNull()
    expect(c.noSeHicieron.total).toEqual({ valor: 0, base: 5, orientativo: true })
  })
  it('% realizado = realizadas / (realizadas + no realizadas + canceladas); las sin marcar van aparte', () => {
    const visitas = [
      v({ status: 'completed', scheduled_at: PASADA }),
      v({ status: 'completed', scheduled_at: PASADA }),
      v({ status: 'no_show', outcome_reason: 'no_vino', scheduled_at: PASADA }),
      v({ status: 'cancelled', outcome_reason: 'cancelo_persona', scheduled_at: FUTURA }),
      v({ status: 'scheduled', scheduled_at: PASADA }),              // sin marcar
      v({ status: 'pending_confirmation', scheduled_at: PASADA }),   // sin marcar
      v({ status: 'scheduled', scheduled_at: FUTURA }),              // todavía no
    ]
    const c = contarVisitas(visitas, AHORA)
    expect(c.agendadas.valor).toBe(7)
    expect(c.conteos).toEqual({ realizadas: 2, noRealizadas: 1, canceladas: 1, conResultado: 4 })
    expect(c.realizadas).toEqual({ valor: 50, base: 4, orientativo: true })
    expect(c.sinMarcar).toBe(2)
    expect(c.noSeHicieron.total).toEqual({ valor: 2, base: 7, orientativo: true })
  })
  it('desglose por motivo; las viejas sin motivo caen en "Sin motivo"', () => {
    const c = contarVisitas([
      v({ status: 'no_show', outcome_reason: 'no_vino' }),
      v({ status: 'no_show', outcome_reason: 'no_vino' }),
      v({ status: 'cancelled', outcome_reason: null }),
    ], AHORA)
    expect(c.noSeHicieron.porMotivo).toEqual([
      { clave: 'no_vino', etiqueta: 'No vino', cantidad: 2 },
      { clave: 'sin_motivo', etiqueta: 'Sin motivo', cantidad: 1 },
    ])
  })
  it('un segundo después del horario ya cuenta como sin marcar', () => {
    const c = contarVisitas([v({ status: 'scheduled', scheduled_at: '2026-10-15T14:59:59.000Z' })], AHORA)
    expect(c.sinMarcar).toBe(1)
  })
})

describe('armarEmbudo', () => {
  it('sin visitas: tres pasos en 0 y ningún salto resaltado', () => {
    const e = armarEmbudo([])
    expect(e.map(p => p.cantidad)).toEqual([0, 0, 0])
    expect(e.some(p => p.saltoMasGrande)).toBe(false)
  })
  it('resalta SOLO el salto relativo más grande', () => {
    const visitas = [
      ...Array.from({ length: 10 }, () => v({ confirmed_at: null, status: 'pending_confirmation' })),
      ...Array.from({ length: 6 }, () => v({ status: 'scheduled' })),
      ...Array.from({ length: 4 }, () => v({ status: 'completed' })),
    ]
    const e = armarEmbudo(visitas)
    expect(e.map(p => [p.clave, p.cantidad])).toEqual([['agendadas', 20], ['confirmadas', 10], ['realizadas', 4]])
    // 20→10 pierde 50 %; 10→4 pierde 60 %: el salto más grande es el de "Se realizaron".
    expect(e.filter(p => p.saltoMasGrande).map(p => p.clave)).toEqual(['realizadas'])
  })
  it('una realizada sin haber pasado por "Confirmar" igual cuenta como confirmada (el embudo nunca sube)', () => {
    const e = armarEmbudo([v({ confirmed_at: null, status: 'completed' }), v({ confirmed_at: null, status: 'pending_confirmation' })])
    expect(e.map(p => p.cantidad)).toEqual([2, 1, 1])
  })
})
```

- [ ] **Paso 3: Correr y ver FALLAR** ("Cannot find module './metricas'").

- [ ] **Paso 4: Implementar `lib/visitas/metricas.ts` (primera parte)**

```ts
/**
 * Métricas de la sección Visitas — definiciones EXACTAS de la spec §4.5 (las que no
 * dependen de la encuesta; esas llegan en la Entrega 3). Módulo puro: recibe filas ya
 * filtradas por período/alcance (lib/visitas/datos.ts) y devuelve números con su base.
 *
 * Regla del tablero (CLAUDE.md § Tablero): toda cifra viaja con su base; base 0 ⇒
 * `valor: null` ⇒ "Sin datos", nunca 0; porcentajes y medianas con base < 20 ⇒
 * "orientativo". Un conteo no es una estimación: nunca es orientativo.
 */
import type { VisitaListado } from './tipos'
import { ESTADOS_ACTIVOS, MOTIVO_ETIQUETA, type MotivoNoRealizada } from './transiciones'

export const BASE_ORIENTATIVA = 20

export interface Cifra {
  valor: number | null
  base: number
  orientativo: boolean
}

export function cifra(valor: number, base: number): Cifra {
  if (base <= 0) return { valor: null, base: 0, orientativo: false }
  return { valor, base, orientativo: base < BASE_ORIENTATIVA }
}

export function conteo(n: number): Cifra {
  return n > 0 ? { valor: n, base: n, orientativo: false } : { valor: null, base: 0, orientativo: false }
}

export function porcentaje(parte: number, base: number): Cifra {
  return base > 0 ? cifra(Math.round((parte / base) * 100), base) : cifra(0, 0)
}

export function mediana(valores: readonly number[]): Cifra {
  if (valores.length === 0) return cifra(0, 0)
  const ordenados = [...valores].sort((a, b) => a - b)
  const medio = Math.floor(ordenados.length / 2)
  const valor = ordenados.length % 2 === 1 ? ordenados[medio] : (ordenados[medio - 1] + ordenados[medio]) / 2
  return cifra(valor, ordenados.length)
}

export interface MotivoContado {
  clave: MotivoNoRealizada | 'sin_motivo'
  etiqueta: string
  cantidad: number
}

export interface ConteosVisitas {
  agendadas: Cifra
  /** % sobre las visitas CON resultado (estado final). */
  realizadas: Cifra
  conteos: { realizadas: number; noRealizadas: number; canceladas: number; conResultado: number }
  /** Activas cuya hora ya pasó: no entran en la base del %. Se muestran aparte. */
  sinMarcar: number
  noSeHicieron: { total: Cifra; porMotivo: MotivoContado[] }
}

function esActiva(v: VisitaListado): boolean {
  return ESTADOS_ACTIVOS.includes(v.status)
}

export function contarVisitas(visitas: readonly VisitaListado[], ahora: Date): ConteosVisitas {
  const t = ahora.getTime()
  let realizadas = 0
  let noRealizadas = 0
  let canceladas = 0
  let sinMarcar = 0
  const motivos = new Map<MotivoNoRealizada | 'sin_motivo', number>()
  for (const v of visitas) {
    if (v.status === 'completed') realizadas++
    else if (v.status === 'no_show' || v.status === 'cancelled') {
      if (v.status === 'no_show') noRealizadas++
      else canceladas++
      const clave = v.outcome_reason ?? 'sin_motivo'
      motivos.set(clave, (motivos.get(clave) ?? 0) + 1)
    } else if (esActiva(v) && Date.parse(v.scheduled_at) < t) sinMarcar++
  }
  const agendadas = visitas.length
  const conResultado = realizadas + noRealizadas + canceladas
  const porMotivo: MotivoContado[] = [...motivos.entries()]
    .map(([clave, cantidad]) => ({ clave, etiqueta: clave === 'sin_motivo' ? 'Sin motivo' : MOTIVO_ETIQUETA[clave], cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta, 'es'))
  return {
    agendadas: conteo(agendadas),
    realizadas: porcentaje(realizadas, conResultado),
    conteos: { realizadas, noRealizadas, canceladas, conResultado },
    sinMarcar,
    noSeHicieron: { total: cifra(noRealizadas + canceladas, agendadas), porMotivo },
  }
}

export interface PasoEmbudo {
  clave: 'agendadas' | 'confirmadas' | 'realizadas'
  etiqueta: string
  cantidad: number
  saltoMasGrande: boolean
}

/**
 * Agendadas → Confirmadas → Se realizaron (los dos pasos de la encuesta llegan en la
 * Entrega 3). "Confirmadas" = tuvieron `confirmed_at` O se realizaron: una visita
 * marcada "Se realizó" sin pasar por "Confirmar" igual ocurrió, y así el embudo nunca
 * sube. Se resalta SOLO el paso con la mayor caída relativa (patrón "emphasis" de
 * CLAUDE.md § Tablero): el resto va en gris.
 */
export function armarEmbudo(visitas: readonly VisitaListado[]): PasoEmbudo[] {
  let confirmadas = 0
  let realizadas = 0
  for (const v of visitas) {
    if (v.status === 'completed') { realizadas++; confirmadas++ }
    else if (v.confirmed_at) confirmadas++
  }
  const pasos: Omit<PasoEmbudo, 'saltoMasGrande'>[] = [
    { clave: 'agendadas', etiqueta: 'Agendadas', cantidad: visitas.length },
    { clave: 'confirmadas', etiqueta: 'Confirmadas', cantidad: confirmadas },
    { clave: 'realizadas', etiqueta: 'Se realizaron', cantidad: realizadas },
  ]
  let indiceSalto = -1
  let mayorCaida = 0
  for (let i = 1; i < pasos.length; i++) {
    const anterior = pasos[i - 1].cantidad
    if (anterior <= 0) continue
    const caida = (anterior - pasos[i].cantidad) / anterior
    if (caida > mayorCaida) { mayorCaida = caida; indiceSalto = i }
  }
  return pasos.map((p, i) => ({ ...p, saltoMasGrande: i === indiceSalto }))
}
```

- [ ] **Paso 5: Correr y ver PASAR.** Correr también `npx tsc --noEmit -p tsconfig.visitas.json`
  (ahora `test/visitas/visita-de-prueba.ts` compila contra el tipo nuevo; los tests no entran en tsc
  pero vitest sí resuelve el import).
- [ ] **Paso 6: Commit** — `git add lib/visitas/tipos.ts lib/visitas/metricas.ts lib/visitas/metricas.test.ts`
  y commit `feat(visitas): métricas de la sección — conteos, motivos y embudo`.

---

### Tarea 3: Métricas — tiempos, agrupaciones y rendimiento

**Files:**
- Modify: `lib/visitas/metricas.ts` (suma al final)
- Test: `lib/visitas/metricas-tiempos.test.ts`

**Interfaces:**
- Consumes: Tarea 2; `ORIGEN_INFO` de `origen.ts`.
- Produces:
  - `MARGEN_REGISTRO_CON_LA_VISITA_MS = 120_000`
  - `interface TiemposVisitas { anticipacion: Cifra; confirmacion: Cifra; marcarResultado: Cifra; consultaAVisita: Cifra }` (valores en milisegundos)
  - `tiemposDeVisitas(visitas: readonly VisitaListado[]): TiemposVisitas`
  - `interface FilaGrupo { clave: string; etiqueta: string; cantidad: number; realizado: Cifra }`
  - `porOrigen(visitas): FilaGrupo[]`, `porAsesor(visitas): FilaGrupo[]`, `porPropiedad(visitas): FilaGrupo[]`
  - `interface Metricas extends ConteosVisitas { tiempos: TiemposVisitas; embudo: PasoEmbudo[]; porOrigen: FilaGrupo[]; porAsesor: FilaGrupo[]; porPropiedad: FilaGrupo[] }`
  - `calcularMetricas(visitas: readonly VisitaListado[], ahora: Date): Metricas`

**Definiciones de los tiempos (§4.5, con las guardas que evitan medianas mentirosas):**
- **Anticipación** = `scheduled_at − created_at`, solo si ≥ 0 (una visita documentada después de
  ocurrida no tiene anticipación).
- **Confirmación** = `confirmed_at − created_at`, solo si > 0. Una visita que nace confirmada tiene
  `confirmed_at = created_at` EXACTO (los dos los pone `now()` en la misma transacción: el DEFAULT
  de `created_at` y el trigger BEFORE INSERT), así que "> 0" es exactamente "nació a confirmar".
- **Marcar resultado** = `outcome_at − scheduled_at` de las realizadas y no realizadas (las
  canceladas no se "marcan": se cancelan antes); si se marcó dentro de la hora previa (permitido),
  cuenta 0.
- **De la consulta a la visita** = `created_at` de la visita − `consulta_recibida_at` si hay
  consulta de portal; si no, − `registro_creado_at`, **solo si el registro existía al menos 2 min
  antes** de la visita (un registro creado por la misma alta —cartel, carga a mano— no es una
  consulta previa y llevaría la mediana a ~0). Negativos no cuentan.

- [ ] **Paso 1: Escribir el test**

```ts
import { describe, it, expect } from 'vitest'
import { tiemposDeVisitas, porOrigen, porAsesor, porPropiedad, calcularMetricas } from './metricas'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

const H = 3_600_000
const AHORA = new Date('2026-10-15T15:00:00Z')

describe('tiemposDeVisitas', () => {
  it('anticipación: mediana de scheduled − created; una visita documentada después no cuenta', () => {
    const t = tiemposDeVisitas([
      v({ created_at: '2026-10-10T10:00:00Z', scheduled_at: '2026-10-10T12:00:00Z' }), // 2 h
      v({ created_at: '2026-10-10T10:00:00Z', scheduled_at: '2026-10-10T14:00:00Z' }), // 4 h
      v({ created_at: '2026-10-12T10:00:00Z', scheduled_at: '2026-10-05T14:00:00Z' }), // cargada después
    ])
    expect(t.anticipacion).toEqual({ valor: 3 * H, base: 2, orientativo: true })
  })
  it('confirmación: solo las que nacieron a confirmar (confirmed_at > created_at)', () => {
    const t = tiemposDeVisitas([
      v({ created_at: '2026-10-10T10:00:00.000Z', confirmed_at: '2026-10-10T10:00:00.000Z' }), // nació confirmada
      v({ created_at: '2026-10-10T10:00:00.000Z', confirmed_at: '2026-10-10T16:00:00.000Z' }), // 6 h
      v({ created_at: '2026-10-10T10:00:00.000Z', confirmed_at: null, status: 'pending_confirmation' }),
    ])
    expect(t.confirmacion).toEqual({ valor: 6 * H, base: 1, orientativo: true })
  })
  it('marcar resultado: realizadas y no realizadas; marcada antes del horario cuenta 0; canceladas no', () => {
    const t = tiemposDeVisitas([
      v({ status: 'completed', scheduled_at: '2026-10-10T12:00:00Z', outcome_at: '2026-10-10T20:00:00Z' }), // 8 h
      v({ status: 'no_show', scheduled_at: '2026-10-10T12:00:00Z', outcome_at: '2026-10-10T11:30:00Z' }),  // 0
      v({ status: 'cancelled', scheduled_at: '2026-10-10T12:00:00Z', outcome_at: '2026-10-08T12:00:00Z' }),
    ])
    expect(t.marcarResultado).toEqual({ valor: 4 * H, base: 2, orientativo: true })
  })
  it('de la consulta a la visita: consulta de portal; registro previo; registro nacido con la visita NO', () => {
    const t = tiemposDeVisitas([
      v({ created_at: '2026-10-10T12:00:00Z', consulta_recibida_at: '2026-10-09T12:00:00Z', registro_creado_at: '2026-10-10T11:59:59Z' }), // 24 h (manda la consulta)
      v({ created_at: '2026-10-10T12:00:00Z', registro_creado_at: '2026-10-08T12:00:00Z' }),  // 48 h
      v({ created_at: '2026-10-10T12:00:00Z', registro_creado_at: '2026-10-10T11:59:30Z' }),  // nació con la visita
      v({ created_at: '2026-10-10T12:00:00Z', registro_creado_at: null }),                     // sin persona vinculada
    ])
    expect(t.consultaAVisita).toEqual({ valor: 36 * H, base: 2, orientativo: true })
  })
  it('sin visitas: los cuatro tiempos sin datos', () => {
    const t = tiemposDeVisitas([])
    expect([t.anticipacion, t.confirmacion, t.marcarResultado, t.consultaAVisita].every(c => c.valor === null)).toBe(true)
  })
})

describe('agrupaciones', () => {
  const visitas = [
    v({ origin: 'portal', status: 'completed', advisor_id: null, asesor_nombre: null }),
    v({ origin: 'portal', status: 'no_show', outcome_reason: 'no_vino' }),
    v({ origin: 'portal', status: 'scheduled' }),
    v({ origin: null, status: 'cancelled', property_id: '44444444-4444-4444-8444-444444444444', direccion: null }),
  ]
  it('por origen: cantidad y % realizado con su base; las viejas en "Sin origen"', () => {
    expect(porOrigen(visitas)).toEqual([
      { clave: 'portal', etiqueta: 'Consulta de portal', cantidad: 3, realizado: { valor: 50, base: 2, orientativo: true } },
      { clave: 'sin_origen', etiqueta: 'Sin origen', cantidad: 1, realizado: { valor: 0, base: 1, orientativo: true } },
    ])
  })
  it('por asesor: sin asesor no rompe', () => {
    expect(porAsesor(visitas).map(f => [f.etiqueta, f.cantidad])).toEqual([['Lucas Pérez', 3], ['Sin asesor', 1]])
  })
  it('por propiedad: sin dirección no rompe', () => {
    expect(porPropiedad(visitas).map(f => [f.etiqueta, f.cantidad])).toEqual([['Doblas 248', 3], ['Propiedad sin dirección', 1]])
  })
  it('un grupo sin ningún resultado dice sin datos en el %', () => {
    expect(porOrigen([v({ origin: 'cartel', status: 'scheduled' })])[0].realizado.valor).toBeNull()
  })
})

describe('calcularMetricas', () => {
  it('junta conteos, tiempos, embudo y grupos', () => {
    const m = calcularMetricas([v({ status: 'completed', scheduled_at: '2026-10-14T13:30:00Z' })], AHORA)
    expect(m.agendadas.valor).toBe(1)
    expect(m.realizadas.valor).toBe(100)
    expect(m.embudo).toHaveLength(3)
    expect(m.porOrigen[0].clave).toBe('cartel')
    expect(m.tiempos.anticipacion.base).toBe(1)
  })
  it('rendimiento: 20.000 visitas en menos de 150 ms (spec §8)', () => {
    const estados = ['pending_confirmation', 'scheduled', 'completed', 'no_show', 'cancelled'] as const
    const origenes = ['portal', 'publicidad_meta', 'publicidad_paga', 'cartel', 'otro', null] as const
    const base = Date.parse('2026-01-01T12:00:00Z')
    const muchas = Array.from({ length: 20_000 }, (_, i) => v({
      status: estados[i % 5],
      origin: origenes[i % 6],
      advisor_id: `22222222-2222-4222-8222-${String(i % 12).padStart(12, '0')}`,
      asesor_nombre: `Asesor ${i % 12}`,
      property_id: `33333333-3333-4333-8333-${String(i % 300).padStart(12, '0')}`,
      direccion: `Calle ${i % 300}`,
      created_at: new Date(base + i * 60_000).toISOString(),
      scheduled_at: new Date(base + i * 60_000 + 86_400_000).toISOString(),
      confirmed_at: i % 3 ? new Date(base + i * 60_000 + 3_600_000).toISOString() : null,
      outcome_at: new Date(base + i * 60_000 + 90_000_000).toISOString(),
      outcome_reason: i % 5 === 3 ? 'no_vino' : null,
      consulta_recibida_at: i % 2 ? new Date(base + i * 60_000 - 86_400_000).toISOString() : null,
    }))
    calcularMetricas(muchas, AHORA) // calienta el JIT
    let mejor = Infinity
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now()
      calcularMetricas(muchas, AHORA)
      mejor = Math.min(mejor, performance.now() - t0)
    }
    expect(mejor).toBeLessThan(150)
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR** ("tiemposDeVisitas is not a function").

- [ ] **Paso 3: Sumar al final de `lib/visitas/metricas.ts`** (y agregar arriba el import
  `import { ORIGEN_INFO } from './origen'`):

```ts
/** Un registro de comprador creado a menos de esto de la visita nació CON ella (cartel, a mano). */
export const MARGEN_REGISTRO_CON_LA_VISITA_MS = 2 * 60_000

export interface TiemposVisitas {
  anticipacion: Cifra
  confirmacion: Cifra
  marcarResultado: Cifra
  consultaAVisita: Cifra
}

/** Medianas en MILISEGUNDOS. Las guardas de cada una están explicadas en el plan de la Entrega 2 (Tarea 3). */
export function tiemposDeVisitas(visitas: readonly VisitaListado[]): TiemposVisitas {
  const anticipacion: number[] = []
  const confirmacion: number[] = []
  const marcar: number[] = []
  const consulta: number[] = []
  for (const v of visitas) {
    const creada = Date.parse(v.created_at)
    const cuando = Date.parse(v.scheduled_at)
    if (cuando - creada >= 0) anticipacion.push(cuando - creada)
    if (v.confirmed_at) {
      const d = Date.parse(v.confirmed_at) - creada
      if (d > 0) confirmacion.push(d)
    }
    if ((v.status === 'completed' || v.status === 'no_show') && v.outcome_at) {
      marcar.push(Math.max(0, Date.parse(v.outcome_at) - cuando))
    }
    if (v.consulta_recibida_at) {
      const d = creada - Date.parse(v.consulta_recibida_at)
      if (d >= 0) consulta.push(d)
    } else if (v.registro_creado_at) {
      const d = creada - Date.parse(v.registro_creado_at)
      if (d >= MARGEN_REGISTRO_CON_LA_VISITA_MS) consulta.push(d)
    }
  }
  return {
    anticipacion: mediana(anticipacion),
    confirmacion: mediana(confirmacion),
    marcarResultado: mediana(marcar),
    consultaAVisita: mediana(consulta),
  }
}

export interface FilaGrupo {
  clave: string
  etiqueta: string
  cantidad: number
  /** % realizado sobre las visitas del grupo con resultado. */
  realizado: Cifra
}

interface Acumulado { etiqueta: string; cantidad: number; realizadas: number; conResultado: number }

function agrupar(visitas: readonly VisitaListado[], claveDe: (v: VisitaListado) => { clave: string; etiqueta: string }): FilaGrupo[] {
  const grupos = new Map<string, Acumulado>()
  for (const v of visitas) {
    const { clave, etiqueta } = claveDe(v)
    const g = grupos.get(clave) ?? { etiqueta, cantidad: 0, realizadas: 0, conResultado: 0 }
    g.cantidad++
    if (v.status === 'completed') { g.realizadas++; g.conResultado++ }
    else if (v.status === 'no_show' || v.status === 'cancelled') g.conResultado++
    grupos.set(clave, g)
  }
  return [...grupos.entries()]
    .map(([clave, g]) => ({ clave, etiqueta: g.etiqueta, cantidad: g.cantidad, realizado: porcentaje(g.realizadas, g.conResultado) }))
    .sort((a, b) => b.cantidad - a.cantidad || a.etiqueta.localeCompare(b.etiqueta, 'es'))
}

export function porOrigen(visitas: readonly VisitaListado[]): FilaGrupo[] {
  return agrupar(visitas, v => v.origin
    ? { clave: v.origin, etiqueta: ORIGEN_INFO[v.origin].etiqueta }
    : { clave: 'sin_origen', etiqueta: 'Sin origen' })
}

export function porAsesor(visitas: readonly VisitaListado[]): FilaGrupo[] {
  return agrupar(visitas, v => v.advisor_id
    ? { clave: v.advisor_id, etiqueta: v.asesor_nombre?.trim() || 'Asesor sin nombre' }
    : { clave: 'sin_asesor', etiqueta: 'Sin asesor' })
}

export function porPropiedad(visitas: readonly VisitaListado[]): FilaGrupo[] {
  return agrupar(visitas, v => ({ clave: v.property_id, etiqueta: v.direccion?.trim() || 'Propiedad sin dirección' }))
}

export interface Metricas extends ConteosVisitas {
  tiempos: TiemposVisitas
  embudo: PasoEmbudo[]
  porOrigen: FilaGrupo[]
  porAsesor: FilaGrupo[]
  porPropiedad: FilaGrupo[]
}

export function calcularMetricas(visitas: readonly VisitaListado[], ahora: Date): Metricas {
  return {
    ...contarVisitas(visitas, ahora),
    tiempos: tiemposDeVisitas(visitas),
    embudo: armarEmbudo(visitas),
    porOrigen: porOrigen(visitas),
    porAsesor: porAsesor(visitas),
    porPropiedad: porPropiedad(visitas),
  }
}
```

- [ ] **Paso 4: Correr y ver PASAR** (las dos suites de métricas). Si la prueba de rendimiento
  falla, NO subir el presupuesto: perfilar (`node --cpu-prof`) y sacar trabajo del bucle.
- [ ] **Paso 5: Commit** — `git add lib/visitas/metricas.ts lib/visitas/metricas-tiempos.test.ts`
  y commit `feat(visitas): tiempos, agrupaciones y presupuesto de rendimiento de las métricas`.

---
### Tarea 4: Parámetros de las rutas GET (con los nombres viejos)

**Files:**
- Create: `lib/visitas/filtros.ts`
- Test: `lib/visitas/filtros.test.ts`

**Interfaces:**
- Consumes: `validarRango` (Tarea 1); `ESTADOS_VISITA`, `ESTADOS_ACTIVOS`, `esEstadoVisita` de
  `transiciones.ts`; `ORIGENES_VISITA` de `origen.ts`; `esFechaDeCalendario`,
  `inicioDelDiaArgentina`, `finDelDiaArgentina` de `lib/filters/rango-fechas.ts`.
- Produces (Tareas 6, 7, 8, 11, 12):
  - `FILTROS_ORIGEN` (`[...ORIGENES_VISITA, 'sin_origen']`), `type FiltroOrigen`, `esFiltroOrigen(v: string): v is FiltroOrigen`
  - `ESTADOS_FILTRO` (`[...ESTADOS_VISITA, 'activas', 'sin_resultado']`), `type EstadoFiltro`
  - `POR_PAGINA_DEFECTO = 50`, `POR_PAGINA_MAX = 200`
  - `interface FiltrosComunes { asesorId: string | null; propiedadId: string | null; origen: FiltroOrigen | null }`
  - `interface FiltrosResumen extends FiltrosComunes { desde: string; hasta: string }` (días AAAA-MM-DD)
  - `interface FiltrosLista extends FiltrosComunes { desdeInstante: string | null; hastaInstante: string | null; estados: EstadoVisita[] | null; pagina: number; porPagina: number }`
  - `leerFiltrosResumen(sp: URLSearchParams): { ok: true; valor: FiltrosResumen } | { ok: false; error: string }`
  - `leerFiltrosLista(sp: URLSearchParams, ahora: Date): { ok: true; valor: FiltrosLista } | { ok: false; error: string }`

**Parámetros (nuevos → alias viejo):** `desde`→`from`, `hasta`→`to`, `asesor`→`advisor_id`,
`propiedad`→`property_id`, `estado`→`status`, más `origen`, `pagina`, `porPagina`. `desde`/`hasta`
aceptan un día AAAA-MM-DD (se convierte a instante argentino) o un instante ISO completo (lo que
manda /inicio y /tasks; pasa normalizado). `estado` acepta un estado, `activas` o `sin_resultado`
(= activas con horario ya pasado: el "hasta" se recorta a `ahora`).

- [ ] **Paso 1: Escribir el test**

```ts
import { describe, it, expect } from 'vitest'
import { leerFiltrosLista, leerFiltrosResumen } from './filtros'

const AHORA = new Date('2026-10-15T15:00:00.000Z')
const ASESOR = '22222222-2222-4222-8222-222222222222'
const PROP = '33333333-3333-4333-8333-333333333333'
const sp = (q: string) => new URLSearchParams(q)

function lista(q: string) {
  const r = leerFiltrosLista(sp(q), AHORA)
  if (!r.ok) throw new Error(r.error)
  return r.valor
}

describe('leerFiltrosLista', () => {
  it('sin parámetros: todo abierto, página 1 de 50', () => {
    expect(lista('')).toEqual({ asesorId: null, propiedadId: null, origen: null, desdeInstante: null, hastaInstante: null, estados: null, pagina: 1, porPagina: 50 })
  })
  it('un día se convierte en el día ARGENTINO completo', () => {
    expect(lista('desde=2026-10-01&hasta=2026-10-31')).toMatchObject({
      desdeInstante: '2026-10-01T00:00:00.000-03:00', hastaInstante: '2026-10-31T23:59:59.999999-03:00',
    })
  })
  it('alias viejos de /inicio y /tasks: from/to con instante, advisor_id, property_id, status', () => {
    expect(lista(`from=2026-10-15T03:00:00.000Z&to=2026-10-16T02:59:59.999Z&advisor_id=${ASESOR}&property_id=${PROP}&status=scheduled`)).toMatchObject({
      desdeInstante: '2026-10-15T03:00:00.000Z', hastaInstante: '2026-10-16T02:59:59.999Z',
      asesorId: ASESOR, propiedadId: PROP, estados: ['scheduled'],
    })
  })
  it('los nombres nuevos ganan sobre los viejos', () => {
    expect(lista(`asesor=${ASESOR}&advisor_id=11111111-1111-4111-8111-111111111111`).asesorId).toBe(ASESOR)
  })
  it('activas y sin_resultado; sin_resultado recorta el "hasta" a ahora', () => {
    expect(lista('estado=activas').estados).toEqual(['pending_confirmation', 'scheduled'])
    expect(lista('estado=sin_resultado')).toMatchObject({ estados: ['pending_confirmation', 'scheduled'], hastaInstante: '2026-10-15T15:00:00.000Z' })
    expect(lista('estado=sin_resultado&hasta=2026-10-01').hastaInstante).toBe('2026-10-01T23:59:59.999999-03:00')
  })
  it('origen del catálogo o sin_origen', () => {
    expect(lista('origen=portal').origen).toBe('portal')
    expect(lista('origen=sin_origen').origen).toBe('sin_origen')
  })
  it('paginado con límites', () => {
    expect(lista('pagina=3&porPagina=25')).toMatchObject({ pagina: 3, porPagina: 25 })
  })
  it('errores en castellano, sin llegar a la base', () => {
    const error = (q: string) => { const r = leerFiltrosLista(sp(q), AHORA); return r.ok ? null : r.error }
    expect(error('asesor=abc')).toBe('El asesor no es válido')
    expect(error('propiedad=1,2')).toBe('La propiedad no es válida')
    expect(error('origen=google')).toBe('El origen no es válido')
    expect(error('estado=borrada')).toBe('El estado no es válido')
    expect(error('desde=2026-02-31')).toBe('La fecha "desde" no es válida')
    expect(error('hasta=mañana')).toBe('La fecha "hasta" no es válida')
    expect(error('pagina=0')).toBe('La página no es válida')
    expect(error('porPagina=500')).toBe('La cantidad por página no es válida')
    expect(error('pagina=1.5')).toBe('La página no es válida')
  })
})

describe('leerFiltrosResumen', () => {
  it('exige el período en días', () => {
    const r = leerFiltrosResumen(sp(`desde=2026-09-16&hasta=2026-10-15&origen=cartel&asesor=${ASESOR}`))
    expect(r).toEqual({ ok: true, valor: { desde: '2026-09-16', hasta: '2026-10-15', origen: 'cartel', asesorId: ASESOR, propiedadId: null } })
  })
  it('sin período, invertido o de más de un año: error', () => {
    expect(leerFiltrosResumen(sp(''))).toEqual({ ok: false, error: 'Elegí las dos fechas del período' })
    expect(leerFiltrosResumen(sp('desde=2026-10-10&hasta=2026-10-01'))).toEqual({ ok: false, error: 'La fecha "desde" es posterior a "hasta"' })
    expect(leerFiltrosResumen(sp('desde=2024-01-01&hasta=2026-10-01'))).toEqual({ ok: false, error: 'Elegí un período de hasta un año' })
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR.**

- [ ] **Paso 3: Implementar `lib/visitas/filtros.ts`**

```ts
/**
 * Parámetros de GET /api/visits y GET /api/visits/resumen, validados en el SERVIDOR
 * (spec §4.4). Puro. Todo lo que no cuadra es un 400 con mensaje en castellano, antes
 * de tocar la base.
 *
 * Acepta también los nombres VIEJOS de GET /api/visits (`from`, `to`, `advisor_id`,
 * `property_id`, `status`): los usan /inicio ("Visitas de hoy") y /tasks ("Visitas
 * pendientes de marcar"), y una pestaña abierta con el código anterior al deploy
 * también. Si dos nombres traen valor, gana el nuevo.
 */
import { ESTADOS_VISITA, ESTADOS_ACTIVOS, esEstadoVisita, type EstadoVisita } from './transiciones'
import { ORIGENES_VISITA } from './origen'
import { validarRango } from './periodo'
import { esFechaDeCalendario, inicioDelDiaArgentina, finDelDiaArgentina } from '@/lib/filters/rango-fechas'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const INSTANTE_RE = /^\d{4}-\d{2}-\d{2}T/

export const FILTROS_ORIGEN = [...ORIGENES_VISITA, 'sin_origen'] as const
export type FiltroOrigen = (typeof FILTROS_ORIGEN)[number]
export const ESTADOS_FILTRO = [...ESTADOS_VISITA, 'activas', 'sin_resultado'] as const
export type EstadoFiltro = (typeof ESTADOS_FILTRO)[number]
export const POR_PAGINA_DEFECTO = 50
export const POR_PAGINA_MAX = 200

export interface FiltrosComunes {
  asesorId: string | null
  propiedadId: string | null
  origen: FiltroOrigen | null
}
export interface FiltrosResumen extends FiltrosComunes {
  desde: string
  hasta: string
}
export interface FiltrosLista extends FiltrosComunes {
  desdeInstante: string | null
  hastaInstante: string | null
  estados: EstadoVisita[] | null
  pagina: number
  porPagina: number
}

type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string }

export function esFiltroOrigen(v: string): v is FiltroOrigen {
  return (FILTROS_ORIGEN as readonly string[]).includes(v)
}

function esEstadoFiltro(v: string): v is EstadoFiltro {
  return (ESTADOS_FILTRO as readonly string[]).includes(v)
}

function primero(sp: URLSearchParams, ...claves: string[]): string | null {
  for (const clave of claves) {
    const v = sp.get(clave)?.trim()
    if (v) return v
  }
  return null
}

/** Milisegundos de un instante, tolerando los microsegundos de `finDelDiaArgentina`. */
function ms(instante: string): number {
  return Date.parse(instante.replace(/(\.\d{3})\d+/, '$1'))
}

/** Un día AAAA-MM-DD (se pasa al día argentino) o un instante ISO (se normaliza). `null` si no sirve. */
function aInstante(valor: string, punta: 'inicio' | 'fin'): string | null {
  if (esFechaDeCalendario(valor)) {
    if (validarRango(valor, valor)) return null // fecha que no existe (2026-02-31)
    return punta === 'inicio' ? inicioDelDiaArgentina(valor) : finDelDiaArgentina(valor)
  }
  if (!INSTANTE_RE.test(valor)) return null
  const t = Date.parse(valor)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

function entero(v: string | null, defecto: number, min: number, max: number): number | null {
  if (v === null || v.trim() === '') return defecto
  if (!/^\d+$/.test(v.trim())) return null
  const n = Number(v)
  return n >= min && n <= max ? n : null
}

function leerComunes(sp: URLSearchParams): Resultado<FiltrosComunes> {
  const asesorId = primero(sp, 'asesor', 'advisor_id')
  if (asesorId && !UUID_RE.test(asesorId)) return { ok: false, error: 'El asesor no es válido' }
  const propiedadId = primero(sp, 'propiedad', 'property_id')
  if (propiedadId && !UUID_RE.test(propiedadId)) return { ok: false, error: 'La propiedad no es válida' }
  const origen = primero(sp, 'origen')
  if (origen && !esFiltroOrigen(origen)) return { ok: false, error: 'El origen no es válido' }
  return { ok: true, valor: { asesorId, propiedadId, origen: origen && esFiltroOrigen(origen) ? origen : null } }
}

export function leerFiltrosResumen(sp: URLSearchParams): Resultado<FiltrosResumen> {
  const comunes = leerComunes(sp)
  if (!comunes.ok) return comunes
  const desde = sp.get('desde')?.trim() ?? ''
  const hasta = sp.get('hasta')?.trim() ?? ''
  const error = validarRango(desde, hasta)
  if (error) return { ok: false, error }
  return { ok: true, valor: { ...comunes.valor, desde, hasta } }
}

export function leerFiltrosLista(sp: URLSearchParams, ahora: Date): Resultado<FiltrosLista> {
  const comunes = leerComunes(sp)
  if (!comunes.ok) return comunes

  const desdeCrudo = primero(sp, 'desde', 'from')
  const desdeInstante = desdeCrudo ? aInstante(desdeCrudo, 'inicio') : null
  if (desdeCrudo && !desdeInstante) return { ok: false, error: 'La fecha "desde" no es válida' }
  const hastaCrudo = primero(sp, 'hasta', 'to')
  let hastaInstante = hastaCrudo ? aInstante(hastaCrudo, 'fin') : null
  if (hastaCrudo && !hastaInstante) return { ok: false, error: 'La fecha "hasta" no es válida' }

  const estado = primero(sp, 'estado', 'status')
  if (estado && !esEstadoFiltro(estado)) return { ok: false, error: 'El estado no es válido' }
  let estados: EstadoVisita[] | null = null
  if (estado === 'activas' || estado === 'sin_resultado') estados = [...ESTADOS_ACTIVOS]
  else if (estado && esEstadoVisita(estado)) estados = [estado]
  // "Sin resultado" = activas cuyo horario YA pasó: el tope es ahora (o antes, si lo pidieron).
  if (estado === 'sin_resultado' && (!hastaInstante || ms(hastaInstante) > ahora.getTime())) {
    hastaInstante = ahora.toISOString()
  }

  const pagina = entero(sp.get('pagina'), 1, 1, 10_000)
  if (pagina === null) return { ok: false, error: 'La página no es válida' }
  const porPagina = entero(sp.get('porPagina'), POR_PAGINA_DEFECTO, 1, POR_PAGINA_MAX)
  if (porPagina === null) return { ok: false, error: 'La cantidad por página no es válida' }

  return { ok: true, valor: { ...comunes.valor, desdeInstante, hastaInstante, estados, pagina, porPagina } }
}
```

- [ ] **Paso 4: Correr y ver PASAR.**
- [ ] **Paso 5: Commit** — `git add lib/visitas/filtros.ts lib/visitas/filtros.test.ts` y commit
  `feat(visitas): parámetros de las rutas de la sección (con los nombres viejos)`.

---

### Tarea 5: Agenda, "requieren tu acción" y armado del resumen

**Files:**
- Create: `lib/visitas/resumen.ts`
- Test: `lib/visitas/resumen.test.ts`

**Interfaces:**
- Consumes: `calcularMetricas`, `type Metricas` (Tareas 2–3); `fechaEnArgentina`, `diasParaElegir`
  de `horario.ts`; `ESTADOS_ACTIVOS`.
- Produces (Tareas 8, 9, 10, 11, 13):
  - `DIAS_DE_AGENDA = 7`, `MAX_POR_LISTA = 50`
  - `interface DiaDeAgenda { fecha: string; etiqueta: string; visitas: VisitaListado[] }`
  - `interface RequierenAccion { sinResultado: VisitaListado[]; aConfirmar: VisitaListado[]; total: number }`
  - `interface ResumenVisitas { periodo: { desde: string; hasta: string }; hoy: string; visitasHoy: number; metricas: Metricas; agenda: DiaDeAgenda[]; requieren: RequierenAccion; propiedades: Array<{ id: string; direccion: string }>; truncado: boolean }`
  - `armarAgenda(visitas: readonly VisitaListado[], hoy: string): DiaDeAgenda[]`
  - `requierenAccion(abiertas: readonly VisitaListado[], ahora: Date): RequierenAccion`
  - `interface EntradaResumen { periodo: { desde: string; hasta: string }; delPeriodo: readonly VisitaListado[]; abiertas: readonly VisitaListado[]; proximas: readonly VisitaListado[]; ahora: Date; truncado: boolean; verTodo: boolean }`
  - `armarResumen(e: EntradaResumen): ResumenVisitas`

**Decisiones:** "Requieren tu acción" NO depende del período (una visita sin marcar de hace 40 días
sigue pendiente): son todas las activas del alcance cuyo horario pasó + las "a confirmar" futuras.
La agenda son los próximos 7 días (Hoy siempre aparece, aunque esté vacío; los demás días solo si
tienen visitas) con todos los estados. "N visitas hoy" no cuenta las canceladas. `porAsesor` va
vacío para quien no ve todo (el asesor ve solo sus números). La lista de propiedades del filtro se
arma con las propiedades presentes en lo que se leyó.

- [ ] **Paso 1: Escribir el test**

```ts
import { describe, it, expect } from 'vitest'
import { armarAgenda, requierenAccion, armarResumen } from './resumen'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

const HOY = '2026-10-15'
const AHORA = new Date('2026-10-15T15:00:00Z') // 12:00 en Argentina

describe('armarAgenda', () => {
  it('agrupa por día ARGENTINO: las 23:30 del 15 (02:30 UTC del 16) van al 15', () => {
    const agenda = armarAgenda([
      v({ scheduled_at: '2026-10-16T02:30:00Z', client_name: 'Noche' }),
      v({ scheduled_at: '2026-10-15T13:00:00Z', client_name: 'Mañana temprano' }),
    ], HOY)
    expect(agenda).toHaveLength(1)
    expect(agenda[0]).toMatchObject({ fecha: HOY, etiqueta: 'Hoy' })
    expect(agenda[0].visitas.map(x => x.client_name)).toEqual(['Mañana temprano', 'Noche'])
  })
  it('Hoy aparece aunque esté vacío; los demás días solo si tienen visitas, con su nombre', () => {
    const agenda = armarAgenda([
      v({ scheduled_at: '2026-10-16T13:00:00Z' }),
      v({ scheduled_at: '2026-10-18T13:00:00Z' }),
    ], HOY)
    expect(agenda.map(d => [d.fecha, d.etiqueta, d.visitas.length])).toEqual([
      ['2026-10-15', 'Hoy', 0], ['2026-10-16', 'Mañana', 1], ['2026-10-18', 'Dom 18', 1],
    ])
  })
  it('lo que cae fuera de los 7 días no aparece', () => {
    expect(armarAgenda([v({ scheduled_at: '2026-10-25T13:00:00Z' })], HOY)).toEqual([{ fecha: HOY, etiqueta: 'Hoy', visitas: [] }])
  })
})

describe('requierenAccion', () => {
  it('pasaron sin resultado (más recientes primero) y a confirmar futuras (más próximas primero)', () => {
    const r = requierenAccion([
      v({ status: 'scheduled', scheduled_at: '2026-10-10T13:00:00Z', client_name: 'Vieja' }),
      v({ status: 'pending_confirmation', scheduled_at: '2026-10-14T13:00:00Z', client_name: 'Pendiente pasada' }),
      v({ status: 'pending_confirmation', scheduled_at: '2026-10-20T13:00:00Z', client_name: 'A confirmar lejos' }),
      v({ status: 'pending_confirmation', scheduled_at: '2026-10-16T13:00:00Z', client_name: 'A confirmar cerca' }),
      v({ status: 'scheduled', scheduled_at: '2026-10-20T13:00:00Z', client_name: 'Confirmada futura' }),
    ], AHORA)
    expect(r.sinResultado.map(x => x.client_name)).toEqual(['Pendiente pasada', 'Vieja'])
    expect(r.aConfirmar.map(x => x.client_name)).toEqual(['A confirmar cerca', 'A confirmar lejos'])
    expect(r.total).toBe(4)
  })
  it('una visita cerrada nunca requiere acción', () => {
    expect(requierenAccion([v({ status: 'completed', scheduled_at: '2026-10-10T13:00:00Z' })], AHORA).total).toBe(0)
  })
  it('cada lista se corta en 50 pero el total dice la verdad', () => {
    const muchas = Array.from({ length: 60 }, () => v({ status: 'scheduled', scheduled_at: '2026-10-01T13:00:00Z' }))
    const r = requierenAccion(muchas, AHORA)
    expect(r.sinResultado).toHaveLength(50)
    expect(r.total).toBe(60)
  })
})

describe('armarResumen', () => {
  const base = {
    periodo: { desde: '2026-09-16', hasta: HOY }, ahora: AHORA, truncado: false,
    delPeriodo: [v({ status: 'completed', scheduled_at: '2026-10-14T13:00:00Z' })],
    abiertas: [v({ status: 'scheduled', scheduled_at: '2026-10-10T13:00:00Z' })],
    proximas: [
      v({ status: 'scheduled', scheduled_at: '2026-10-15T18:00:00Z' }),
      v({ status: 'cancelled', scheduled_at: '2026-10-15T19:00:00Z' }),
    ],
  }
  it('arma todo y "visitas hoy" no cuenta las canceladas', () => {
    const r = armarResumen({ ...base, verTodo: true })
    expect(r.hoy).toBe(HOY)
    expect(r.visitasHoy).toBe(1)
    expect(r.metricas.agendadas.valor).toBe(1)
    expect(r.requieren.total).toBe(1)
    expect(r.metricas.porAsesor).toHaveLength(1)
    expect(r.propiedades).toEqual([{ id: '33333333-3333-4333-8333-333333333333', direccion: 'Doblas 248' }])
  })
  it('para quien no ve todo, "por asesor" va vacío', () => {
    expect(armarResumen({ ...base, verTodo: false }).metricas.porAsesor).toEqual([])
  })
  it('propaga el aviso de datos truncados', () => {
    expect(armarResumen({ ...base, verTodo: true, truncado: true }).truncado).toBe(true)
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR.**

- [ ] **Paso 3: Implementar `lib/visitas/resumen.ts`**

```ts
/**
 * Lo que muestra la sección Visitas (spec §3.4), armado a partir de las filas que leyó
 * la ruta: agenda de los próximos días, "requieren tu acción" y métricas del período.
 * Puro; las decisiones de alcance (qué filas entran) ya las tomó la ruta.
 */
import type { VisitaListado } from './tipos'
import { calcularMetricas, type Metricas } from './metricas'
import { ESTADOS_ACTIVOS } from './transiciones'
import { fechaEnArgentina, diasParaElegir } from './horario'

export const DIAS_DE_AGENDA = 7
export const MAX_POR_LISTA = 50

export interface DiaDeAgenda {
  fecha: string
  etiqueta: string
  visitas: VisitaListado[]
}

export interface RequierenAccion {
  sinResultado: VisitaListado[]
  aConfirmar: VisitaListado[]
  /** Total REAL (las listas se cortan en MAX_POR_LISTA). */
  total: number
}

export interface ResumenVisitas {
  periodo: { desde: string; hasta: string }
  hoy: string
  visitasHoy: number
  metricas: Metricas
  agenda: DiaDeAgenda[]
  requieren: RequierenAccion
  propiedades: Array<{ id: string; direccion: string }>
  /** Se llegó al techo de filas leídas: los números pueden estar incompletos y la pantalla lo dice. */
  truncado: boolean
}

function porHorario(a: VisitaListado, b: VisitaListado): number {
  return Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at) || a.id.localeCompare(b.id)
}

export function armarAgenda(visitas: readonly VisitaListado[], hoy: string): DiaDeAgenda[] {
  const porDia = new Map<string, VisitaListado[]>()
  for (const v of visitas) {
    const dia = fechaEnArgentina(new Date(v.scheduled_at))
    const lista = porDia.get(dia) ?? []
    lista.push(v)
    porDia.set(dia, lista)
  }
  return diasParaElegir(hoy, DIAS_DE_AGENDA)
    .map((d, i) => ({
      fecha: d.fecha,
      etiqueta: i < 2 ? d.etiqueta : `${d.etiqueta} ${d.numero}`,
      visitas: (porDia.get(d.fecha) ?? []).sort(porHorario),
    }))
    .filter((d, i) => i === 0 || d.visitas.length > 0)
}

export function requierenAccion(abiertas: readonly VisitaListado[], ahora: Date): RequierenAccion {
  const t = ahora.getTime()
  const activas = abiertas.filter(v => ESTADOS_ACTIVOS.includes(v.status))
  const sinResultado = activas.filter(v => Date.parse(v.scheduled_at) < t).sort((a, b) => porHorario(b, a))
  const aConfirmar = activas
    .filter(v => v.status === 'pending_confirmation' && Date.parse(v.scheduled_at) >= t)
    .sort(porHorario)
  return {
    sinResultado: sinResultado.slice(0, MAX_POR_LISTA),
    aConfirmar: aConfirmar.slice(0, MAX_POR_LISTA),
    total: sinResultado.length + aConfirmar.length,
  }
}

export interface EntradaResumen {
  periodo: { desde: string; hasta: string }
  delPeriodo: readonly VisitaListado[]
  abiertas: readonly VisitaListado[]
  proximas: readonly VisitaListado[]
  ahora: Date
  truncado: boolean
  verTodo: boolean
}

export function armarResumen(e: EntradaResumen): ResumenVisitas {
  const hoy = fechaEnArgentina(e.ahora)
  const metricas = calcularMetricas(e.delPeriodo, e.ahora)
  const agenda = armarAgenda(e.proximas, hoy)
  const propiedades = new Map<string, string>()
  for (const v of [...e.delPeriodo, ...e.abiertas, ...e.proximas]) {
    if (!propiedades.has(v.property_id)) propiedades.set(v.property_id, v.direccion?.trim() || 'Propiedad sin dirección')
  }
  return {
    periodo: e.periodo,
    hoy,
    visitasHoy: agenda[0].visitas.filter(v => v.status !== 'cancelled').length,
    metricas: e.verTodo ? metricas : { ...metricas, porAsesor: [] },
    agenda,
    requieren: requierenAccion(e.abiertas, e.ahora),
    propiedades: [...propiedades.entries()]
      .map(([id, direccion]) => ({ id, direccion }))
      .sort((a, b) => a.direccion.localeCompare(b.direccion, 'es')),
    truncado: e.truncado,
  }
}
```

  (`agenda[0]` existe siempre: `armarAgenda` conserva el día de hoy aunque esté vacío.)

- [ ] **Paso 4: Correr y ver PASAR.**
- [ ] **Paso 5: Commit** — `git add lib/visitas/resumen.ts lib/visitas/resumen.test.ts` y commit
  `feat(visitas): agenda, pendientes y armado del resumen de la sección`.

---

### Tarea 6: Lectura de visitas con alcance y paginación de a 1000

**Files:**
- Modify: `lib/visitas/acceso.ts` (suma `Alcance`, `alcanceDeVisitas`; exporta `esRol`)
- Modify: `lib/visitas/acceso.test.ts`
- Modify: `lib/visitas/datos.ts` (suma `listarVisitas`, `todasLasVisitas`)
- Test: `lib/visitas/datos-listado.test.ts`

**Interfaces:**
- Consumes: `VisitaListado` (Tarea 2), `FiltroOrigen` (Tarea 4).
- Produces (Tareas 7, 8, 11):
  - `type Alcance = { tipo: 'todo' } | { tipo: 'propio'; usuarioId: string }` (en `acceso.ts`)
  - `alcanceDeVisitas(role: Role, userId: string): Alcance`
  - `esRol(v: string | null | undefined): v is Role` (pasa a exportarse)
  - `interface FiltroConsultaVisitas { alcance: Alcance; asesorId?: string | null; propiedadId?: string | null; origen?: FiltroOrigen | null; estados?: readonly EstadoVisita[] | null; desde?: string | null; hasta?: string | null }`
  - `TAMANO_PAGINA_BASE = 1000`, `MAX_PAGINAS_BASE = 20`
  - `listarVisitas(f: FiltroConsultaVisitas, rango: { desde: number; hasta: number }, orden: 'asc' | 'desc'): Promise<{ filas: VisitaListado[]; total: number }>`
  - `todasLasVisitas(f: FiltroConsultaVisitas, orden?: 'asc' | 'desc'): Promise<{ filas: VisitaListado[]; truncado: boolean }>`

**Por qué así:** la ruta lee con clave de servicio (la RLS no corre), así que el alcance del asesor
tiene que ir en la consulta: `advisor_id = él OR created_by = él`, la misma regla que
`puedeVerVisita` y que la política `property_visits_select_scoped`. Si la lista usara solo
`advisor_id`, una visita que el asesor agendó para otro desaparecería de su agenda aunque la ficha
le abra. El id va crudo dentro de un `or()` de PostgREST: se valida que sea UUID antes de armarlo.

- [ ] **Paso 1: Test de `acceso`** — sumar al final de `lib/visitas/acceso.test.ts` (y agregar
  `alcanceDeVisitas, esRol` al import de `./acceso`):

```ts
describe('alcanceDeVisitas', () => {
  it('operaciones ve todo; el asesor, lo propio; un rol desconocido cae en lo propio', () => {
    expect(alcanceDeVisitas('coordinador', YO)).toEqual({ tipo: 'todo' })
    expect(alcanceDeVisitas('dueno', YO)).toEqual({ tipo: 'todo' })
    expect(alcanceDeVisitas('asesor', YO)).toEqual({ tipo: 'propio', usuarioId: YO })
    expect(alcanceDeVisitas('inventado' as never, YO)).toEqual({ tipo: 'propio', usuarioId: YO })
  })
  it('esRol solo acepta roles del catálogo', () => {
    expect(esRol('asesor')).toBe(true)
    expect(esRol('jefe')).toBe(false)
    expect(esRol(null)).toBe(false)
  })
})
```

- [ ] **Paso 2: Test de `datos`** — crear `lib/visitas/datos-listado.test.ts` (mismo cliente falso
  que graba las cadenas que usa `datos.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

interface Paso { metodo: string; args: unknown[] }
interface Llamada { tabla: string; pasos: Paso[] }
interface Respuesta { data: unknown; error: { message: string } | null; count?: number | null }

const { registro } = vi.hoisted(() => {
  const registro: { llamadas: Llamada[]; responder: (l: Llamada) => Respuesta } = {
    llamadas: [],
    responder: () => ({ data: [], error: null }),
  }
  return { registro }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from(tabla: string) {
      const llamada: Llamada = { tabla, pasos: [] }
      registro.llamadas.push(llamada)
      const cadena: object = new Proxy({}, {
        get(_o, prop) {
          if (prop === 'then') {
            return (resolver: (r: Respuesta) => unknown, rechazar: (e: unknown) => unknown) =>
              Promise.resolve().then(() => registro.responder(llamada)).then(resolver, rechazar)
          }
          return (...args: unknown[]) => { llamada.pasos.push({ metodo: String(prop), args }); return cadena }
        },
      })
      return cadena
    },
  }),
}))

import { listarVisitas, todasLasVisitas, TAMANO_PAGINA_BASE } from './datos'

const YO = '22222222-2222-4222-8222-222222222222'
const fila = (i: number) => ({
  id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`, property_id: 'p1', advisor_id: YO, created_by: YO,
  client_name: 'Sofía', client_phone: null, status: 'scheduled', origin: 'portal', origin_detail: 'zonaprop',
  outcome_reason: null, scheduled_at: '2026-10-14T13:30:00+00:00', created_at: '2026-10-10T15:00:00+00:00',
  updated_at: '2026-10-10T15:00:00.123456+00:00', confirmed_at: null, outcome_at: null,
  property: { address: 'Doblas 248', neighborhood: 'Caballito' }, advisor: { full_name: 'Lucas' },
  lead: { created_at: '2026-10-09T15:00:00+00:00' }, consulta: { received_at: null, created_at: '2026-10-08T15:00:00+00:00' },
})
const pasos = (l: Llamada, metodo: string) => l.pasos.filter(p => p.metodo === metodo).map(p => p.args)

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://falso.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-falsa')
  registro.llamadas = []
  registro.responder = () => ({ data: [fila(1)], error: null, count: 1 })
})

describe('listarVisitas', () => {
  it('asesor: lo asignado O lo que creó, con todos los filtros, orden estable y rango', async () => {
    const r = await listarVisitas({
      alcance: { tipo: 'propio', usuarioId: YO }, propiedadId: 'p1', origen: 'portal',
      estados: ['scheduled'], desde: '2026-10-01T00:00:00.000-03:00', hasta: '2026-10-31T23:59:59.999999-03:00',
    }, { desde: 50, hasta: 99 }, 'desc')
    const l = registro.llamadas[0]
    expect(l.tabla).toBe('property_visits')
    expect(pasos(l, 'or')).toEqual([[`advisor_id.eq.${YO},created_by.eq.${YO}`]])
    expect(pasos(l, 'eq')).toEqual([['property_id', 'p1'], ['origin', 'portal']])
    expect(pasos(l, 'in')).toEqual([['status', ['scheduled']]])
    expect(pasos(l, 'gte')).toEqual([['scheduled_at', '2026-10-01T00:00:00.000-03:00']])
    expect(pasos(l, 'lte')).toEqual([['scheduled_at', '2026-10-31T23:59:59.999999-03:00']])
    expect(pasos(l, 'order')).toEqual([['scheduled_at', { ascending: false }], ['id', { ascending: false }]])
    expect(pasos(l, 'range')).toEqual([[50, 99]])
    expect(pasos(l, 'select')[0][1]).toEqual({ count: 'exact' })
    expect(r.total).toBe(1)
  })
  it('aplana la fila: dirección, asesor, registro y consulta (sin fecha del portal usa la de alta)', async () => {
    const r = await listarVisitas({ alcance: { tipo: 'todo' } }, { desde: 0, hasta: 49 }, 'desc')
    expect(r.filas[0]).toMatchObject({
      direccion: 'Doblas 248', barrio: 'Caballito', asesor_nombre: 'Lucas', origin: 'portal',
      registro_creado_at: '2026-10-09T15:00:00+00:00', consulta_recibida_at: '2026-10-08T15:00:00+00:00',
      updated_at: '2026-10-10T15:00:00.123456+00:00',
    })
  })
  it('"sin origen" filtra por NULL; operaciones filtra por asesor con eq', async () => {
    await listarVisitas({ alcance: { tipo: 'todo' }, asesorId: YO, origen: 'sin_origen' }, { desde: 0, hasta: 49 }, 'asc')
    const l = registro.llamadas[0]
    expect(pasos(l, 'or')).toEqual([])
    expect(pasos(l, 'eq')).toEqual([['advisor_id', YO]])
    expect(pasos(l, 'is')).toEqual([['origin', null]])
  })
  it('un usuario que no es UUID no llega a armar el or()', async () => {
    await expect(listarVisitas({ alcance: { tipo: 'propio', usuarioId: 'x,created_by.neq.null' } }, { desde: 0, hasta: 9 }, 'asc'))
      .rejects.toThrow('usuarioId no es un UUID válido')
  })
  it('un error de la base se propaga con contexto', async () => {
    registro.responder = () => ({ data: null, error: { message: 'boom' } })
    await expect(listarVisitas({ alcance: { tipo: 'todo' } }, { desde: 0, hasta: 9 }, 'asc')).rejects.toThrow('listar visitas: boom')
  })
})

describe('todasLasVisitas: pagina de a 1000 (tope de PostgREST)', () => {
  it('pide páginas hasta que una viene incompleta', async () => {
    let n = 0
    registro.responder = () => {
      n += 1
      const largo = n === 1 ? TAMANO_PAGINA_BASE : 3
      return { data: Array.from({ length: largo }, (_, i) => fila(n * 10_000 + i)), error: null }
    }
    const r = await todasLasVisitas({ alcance: { tipo: 'todo' } })
    expect(r.filas).toHaveLength(1003)
    expect(r.truncado).toBe(false)
    expect(registro.llamadas.map(l => pasos(l, 'range')[0])).toEqual([[0, 999], [1000, 1999]])
    expect(pasos(registro.llamadas[0], 'order')).toEqual([['scheduled_at', { ascending: true }], ['id', { ascending: true }]])
  })
  it('si llega al techo de 20 páginas lo avisa', async () => {
    registro.responder = () => ({ data: Array.from({ length: TAMANO_PAGINA_BASE }, (_, i) => fila(i)), error: null })
    const r = await todasLasVisitas({ alcance: { tipo: 'todo' } })
    expect(r.truncado).toBe(true)
    expect(registro.llamadas).toHaveLength(20)
  })
})
```

- [ ] **Paso 3: Correr y ver FALLAR** (`alcanceDeVisitas` / `listarVisitas` no existen).

- [ ] **Paso 4: Implementar en `lib/visitas/acceso.ts`** — cambiar `function esRol(` por
  `export function esRol(` (sin tocar su cuerpo) y sumar al final:

```ts
/**
 * Qué visitas puede LEER alguien en los listados y la sección (spec §3.4): quien ve
 * todo, todo; el resto, solo lo propio (`advisor_id` o `created_by`, la misma regla que
 * `puedeVerVisita` y que la política `property_visits_select_scoped`). Un rol
 * desconocido cae en lo propio: fail-closed, nunca en "todo".
 */
export type Alcance = { tipo: 'todo' } | { tipo: 'propio'; usuarioId: string }

export function alcanceDeVisitas(role: Role, userId: string): Alcance {
  return puedeVerTodasLasVisitas(role) ? { tipo: 'todo' } : { tipo: 'propio', usuarioId: userId }
}
```

- [ ] **Paso 5: Implementar en `lib/visitas/datos.ts`** — sumar a los imports de arriba:

```ts
import type { Alcance } from './acceso'
import type { FiltroOrigen } from './filtros'
import { esOrigenVisita } from './origen'
import { esEstadoVisita, MOTIVOS_NO_REALIZADA } from './transiciones'
```

  (`esOrigenVisita` y `esEstadoVisita` se suman a los imports existentes de `./origen` y
  `./transiciones`; `VisitaListado` se suma al import de `./tipos`.) Y al final del archivo:

```ts
// ───────────────────────── Listado de la sección Visitas (Entrega 2) ─────────────────────────

export interface FiltroConsultaVisitas {
  alcance: Alcance
  asesorId?: string | null
  propiedadId?: string | null
  origen?: FiltroOrigen | null
  estados?: readonly EstadoVisita[] | null
  /** Instantes ISO inclusivos sobre `scheduled_at`. */
  desde?: string | null
  hasta?: string | null
}

/** PostgREST corta TODA respuesta en 1000 filas sin avisar (CLAUDE.md § tope de 1000 filas). */
export const TAMANO_PAGINA_BASE = 1000
/** 20.000 visitas: muy por encima de cualquier período de un año de esta inmobiliaria. */
export const MAX_PAGINAS_BASE = 20

const SELECT_LISTADO = `
  id, property_id, advisor_id, created_by, client_name, client_phone, status, origin, origin_detail,
  outcome_reason, scheduled_at, created_at, updated_at, confirmed_at, outcome_at,
  property:properties(address, neighborhood),
  advisor:profiles!property_visits_advisor_id_fkey(full_name),
  lead:property_leads!property_visits_lead_id_fkey(created_at),
  consulta:portal_inquiries!property_visits_portal_inquiry_id_fkey(received_at, created_at)`

function textoONulo(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null
}

function motivoONulo(v: unknown): VisitaListado['outcome_reason'] {
  return typeof v === 'string' && (MOTIVOS_NO_REALIZADA as readonly string[]).includes(v)
    ? MOTIVOS_NO_REALIZADA.find(m => m === v) ?? null
    : null
}

/** Campo por campo: la fila cruda de PostgREST (con sus joins anidados) no sale de acá. */
function aListado(r: Record<string, unknown>): VisitaListado {
  const p = uno(r.property as Record<string, unknown> | null)
  const a = uno(r.advisor as { full_name?: unknown } | null)
  const l = uno(r.lead as { created_at?: unknown } | null)
  const c = uno(r.consulta as { received_at?: unknown; created_at?: unknown } | null)
  if (!esEstadoVisita(r.status)) throw new Error(`listar visitas: estado desconocido "${String(r.status)}"`)
  return {
    id: String(r.id),
    property_id: String(r.property_id),
    direccion: textoONulo(p?.address),
    barrio: textoONulo(p?.neighborhood),
    advisor_id: textoONulo(r.advisor_id),
    asesor_nombre: textoONulo(a?.full_name),
    created_by: textoONulo(r.created_by),
    client_name: String(r.client_name ?? ''),
    client_phone: textoONulo(r.client_phone),
    status: r.status,
    origin: esOrigenVisita(r.origin) ? r.origin : null,
    origin_detail: textoONulo(r.origin_detail),
    outcome_reason: motivoONulo(r.outcome_reason),
    scheduled_at: String(r.scheduled_at),
    created_at: String(r.created_at),
    updated_at: String(r.updated_at),
    confirmed_at: textoONulo(r.confirmed_at),
    outcome_at: textoONulo(r.outcome_at),
    consulta_recibida_at: textoONulo(c?.received_at) ?? textoONulo(c?.created_at),
    registro_creado_at: textoONulo(l?.created_at),
  }
}

function consultaDeVisitas(f: FiltroConsultaVisitas, conConteo: boolean) {
  let q = sb().from('property_visits').select(SELECT_LISTADO, conConteo ? { count: 'exact' } : undefined)
  if (f.alcance.tipo === 'propio') {
    // El id va CRUDO dentro del or(): validar la forma ANTES (ver exigirUuid).
    exigirUuid(f.alcance.usuarioId, 'usuarioId')
    q = q.or(`advisor_id.eq.${f.alcance.usuarioId},created_by.eq.${f.alcance.usuarioId}`)
  }
  if (f.asesorId) q = q.eq('advisor_id', f.asesorId)
  if (f.propiedadId) q = q.eq('property_id', f.propiedadId)
  if (f.origen === 'sin_origen') q = q.is('origin', null)
  else if (f.origen) q = q.eq('origin', f.origen)
  if (f.estados && f.estados.length > 0) q = q.in('status', [...f.estados])
  if (f.desde) q = q.gte('scheduled_at', f.desde)
  if (f.hasta) q = q.lte('scheduled_at', f.hasta)
  return q
}

/** Una página de la lista "Ver todas" (y de la pestaña de la ficha), con el total exacto. */
export async function listarVisitas(
  f: FiltroConsultaVisitas,
  rango: { desde: number; hasta: number },
  orden: 'asc' | 'desc',
): Promise<{ filas: VisitaListado[]; total: number }> {
  const ascending = orden === 'asc'
  const { data, error, count } = await consultaDeVisitas(f, true)
    .order('scheduled_at', { ascending }).order('id', { ascending })
    .range(rango.desde, rango.hasta)
  if (error) fallo('listar visitas', error)
  return { filas: ((data ?? []) as Record<string, unknown>[]).map(aListado), total: count ?? 0 }
}

/**
 * TODAS las filas del filtro, de a 1000, con orden fijo y único (`scheduled_at`, `id`):
 * paginar sin orden repite o saltea filas. Para el resumen de un período largo.
 */
export async function todasLasVisitas(
  f: FiltroConsultaVisitas,
  orden: 'asc' | 'desc' = 'asc',
): Promise<{ filas: VisitaListado[]; truncado: boolean }> {
  const ascending = orden === 'asc'
  const filas: VisitaListado[] = []
  for (let pagina = 0; pagina < MAX_PAGINAS_BASE; pagina++) {
    const desde = pagina * TAMANO_PAGINA_BASE
    const { data, error } = await consultaDeVisitas(f, false)
      .order('scheduled_at', { ascending }).order('id', { ascending })
      .range(desde, desde + TAMANO_PAGINA_BASE - 1)
    if (error) fallo('listar visitas', error)
    const lote = (data ?? []) as Record<string, unknown>[]
    filas.push(...lote.map(aListado))
    if (lote.length < TAMANO_PAGINA_BASE) return { filas, truncado: false }
  }
  return { filas, truncado: true }
}
```

  Nota para el implementador: si `tsc` se queja del tipo del builder al reasignar `q` (el
  `.or/.eq/.is/.in` devuelven el mismo `PostgrestFilterBuilder`), NO usar `as`: declarar
  `let q = …select(…)` exactamente como está (TS infiere el builder) — es el mismo patrón que ya
  usa `buscarPropiedadesParaVisita` en este archivo.

- [ ] **Paso 6: Correr y ver PASAR** — `npx vitest run --config vitest.visitas.config.ts lib/visitas`
  (incluye `datos.test.ts` de la Entrega 1, que no tiene que cambiar) y
  `npx tsc --noEmit -p tsconfig.visitas.json`.
- [ ] **Paso 7: Commit** — `git add lib/visitas/acceso.ts lib/visitas/acceso.test.ts lib/visitas/datos.ts lib/visitas/datos-listado.test.ts`
  y commit `feat(visitas): lectura de visitas con alcance por rol y paginación de a 1000`.

---

### Tarea 7: `GET /api/visits` reescrito y sus consumidores (Inicio y Tareas)

**Files:**
- Modify: `app/api/visits/route.ts` (solo el `GET` y los imports; el `POST` no se toca)
- Modify: `app/api/visits/route.test.ts` (mocks + bloque `describe('GET /api/visits')`)
- Delete: `lib/supabase/visits.ts`
- Modify: `app/(dashboard)/inicio/page.tsx` (lee `total`), `app/(dashboard)/inicio/page.test.tsx`
- Modify: `app/(dashboard)/tasks/page.tsx` (lee `direccion`, hora argentina)

**Interfaces:**
- Consumes: `leerFiltrosLista` (Tarea 4), `alcanceDeVisitas`, `puedeVerTodasLasVisitas` (Tarea 6),
  `datos.listarVisitas` (Tarea 6).
- Produces: `GET /api/visits?desde&hasta&asesor&propiedad&estado&origen&pagina&porPagina`
  (+ alias `from`, `to`, `advisor_id`, `property_id`, `status`) →
  `200 { data: VisitaListado[], total: number, pagina: number, porPagina: number }` ·
  `400 { error }` · `401` · `403` · `500 { error: 'No pudimos cargar las visitas' }`.
  Orden: `scheduled_at` desc, `id` desc.

**Consumidores (grep `api/visits` hecho al escribir el plan):** `app/(dashboard)/inicio/page.tsx`
(cuenta "Visitas de hoy" con `data.length` → pasa a `total`, porque la lista ahora viene paginada),
`app/(dashboard)/tasks/page.tsx` (lista "Visitas pendientes de marcar": leía `v.property?.address`,
que ya no viene → `v.direccion`; y formateaba sin zona horaria → `formatearFechaHora`),
`app/(dashboard)/visits/page.tsx` (se reescribe en la Tarea 11). `lib/supabase/visits.ts` solo
exportaba `listVisits` y su único consumidor era esta ruta → se borra.

- [ ] **Paso 1: Actualizar el test** — en `app/api/visits/route.test.ts`:
  1. En el `vi.hoisted`, sacar `listVisitsMock` y sumar `listarVisitas: vi.fn()` a `datosMock`.
  2. Borrar la línea `vi.mock('@/lib/supabase/visits', …)`.
  3. En `beforeEach`, cambiar `listVisitsMock.mockReset(); listVisitsMock.mockResolvedValue([])` por
     `datosMock.listarVisitas.mockResolvedValue({ filas: [], total: 0 })` (el `forEach` de
     `mockReset` ya lo limpia).
  4. Reemplazar el bloque `describe('GET /api/visits', …)` entero por:

```ts
describe('GET /api/visits', () => {
  const llamada = () => datosMock.listarVisitas.mock.calls[0]
  it('sin sesión 401; abogado 403', async () => {
    estado.logueado = false
    expect((await pedirLista()).status).toBe(401)
    estado.logueado = true; estado.role = 'abogado'
    expect((await pedirLista()).status).toBe(403)
    expect(datosMock.listarVisitas).not.toHaveBeenCalled()
  })
  it('un asesor ve lo propio (asignado o creado por él) y su ?asesor= no amplía nada', async () => {
    estado.role = 'asesor'; estado.id = ASESOR
    await pedirLista(`asesor=${'77777777-7777-4777-8777-777777777777'}`)
    expect(llamada()[0]).toMatchObject({ alcance: { tipo: 'propio', usuarioId: ASESOR }, asesorId: null })
  })
  it('un coordinador ve todo y puede filtrar por asesor', async () => {
    await pedirLista(`asesor=${ASESOR}`)
    expect(llamada()[0]).toMatchObject({ alcance: { tipo: 'todo' }, asesorId: ASESOR })
  })
  it('alias viejo de /tasks: advisor_id + status + to', async () => {
    await pedirLista(`advisor_id=${ASESOR}&status=scheduled&to=${encodeURIComponent('2099-01-10T15:00:00.000Z')}`)
    expect(llamada()[0]).toMatchObject({ asesorId: ASESOR, estados: ['scheduled'], hasta: '2099-01-10T15:00:00.000Z' })
  })
  it('pagina y ordena de más reciente a más vieja', async () => {
    datosMock.listarVisitas.mockResolvedValue({ filas: [{ id: 'v1' }], total: 120 })
    const res = await pedirLista('pagina=3&porPagina=25')
    expect(llamada()[1]).toEqual({ desde: 50, hasta: 74 })
    expect(llamada()[2]).toBe('desc')
    expect(await res.json()).toEqual({ data: [{ id: 'v1' }], total: 120, pagina: 3, porPagina: 25 })
  })
  it('un parámetro inválido es 400 y no toca la base', async () => {
    const res = await pedirLista('estado=borrada')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('El estado no es válido')
    expect(datosMock.listarVisitas).not.toHaveBeenCalled()
  })
  it('un fallo de la base: 500 en castellano', async () => {
    datosMock.listarVisitas.mockRejectedValue(new Error('listar visitas: boom'))
    const res = await pedirLista()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('No pudimos cargar las visitas')
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR** (el GET todavía llama a `listVisits`).

- [ ] **Paso 3: Reescribir el GET** — en `app/api/visits/route.ts`: borrar los imports de
  `resolverAlcanceAsignado` y `listVisits`; sumar `import { leerFiltrosLista } from '@/lib/visitas/filtros'`
  y `alcanceDeVisitas` al import existente de `@/lib/visitas/acceso`; reemplazar la función `GET`
  (con su comentario) por:

```ts
/**
 * Lista de visitas con filtros, alcance por rol y paginado (spec §4.4). La lee con clave
 * de servicio: el alcance va EN LA CONSULTA (`alcanceDeVisitas`), no en la RLS. El asesor
 * ve lo propio y su `asesor=` se ignora (no puede ampliar). Acepta los nombres viejos de
 * los parámetros (ver lib/visitas/filtros.ts): /inicio y /tasks los usan.
 */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return error(401, 'Iniciá sesión de nuevo')
  const role = user.profile.role as Role
  if (!puedeGestionarVisitas(role)) return error(403, 'No tenés permiso para ver visitas')
  const filtros = leerFiltrosLista(req.nextUrl.searchParams, new Date())
  if (!filtros.ok) return error(400, filtros.error)
  const f = filtros.valor
  try {
    const { filas, total } = await datos.listarVisitas({
      alcance: alcanceDeVisitas(role, user.id),
      asesorId: puedeVerTodasLasVisitas(role) ? f.asesorId : null,
      propiedadId: f.propiedadId,
      origen: f.origen,
      estados: f.estados,
      desde: f.desdeInstante,
      hasta: f.hastaInstante,
    }, { desde: (f.pagina - 1) * f.porPagina, hasta: f.pagina * f.porPagina - 1 }, 'desc')
    return NextResponse.json({ data: filas, total, pagina: f.pagina, porPagina: f.porPagina })
  } catch (e) {
    console.error('[GET /api/visits]', e)
    return error(500, 'No pudimos cargar las visitas')
  }
}
```

  (`role as Role` es el patrón existente de este archivo para el rol del perfil; no es nuevo.)

- [ ] **Paso 4: Borrar `lib/supabase/visits.ts`** — antes:
  `grep -rn "lib/supabase/visits'" app components lib scripts --include='*.ts' --include='*.tsx'`
  tiene que listar SOLO `app/api/visits/route.ts` (ya sin el import) y nada más. Después
  `git rm lib/supabase/visits.ts`.

- [ ] **Paso 5: Correr y ver PASAR** — `npx vitest run --config vitest.visitas.config.ts app/api/visits`.

- [ ] **Paso 6: Inicio cuenta con `total`** — test primero. En `app/(dashboard)/inicio/page.test.tsx`,
  dentro de `describe('InicioPage — la tarjeta lleva al recorte que contó (D37)')`, sumar:

```ts
  it('"Visitas de hoy" usa el TOTAL de la base, no el largo de la página (la lista viene paginada)', async () => {
    render(<InicioPage />)
    authDeferred.resolve({ ok: true, body: { id: 'u1', role: 'admin' } })
    await waitFor(() => expect(calls.some(c => c.startsWith('/api/visits'))).toBe(true))
    tasksDeferred.resolve({ ok: true, body: { data: [] } })
    leadsDeferred.resolve({ ok: true, body: { new: 0 } })
    propertiesDeferred.resolve({ ok: true, body: { total: 0 } })
    avisosDeferred.resolve({ ok: true, body: { data: [] } })
    visitsDeferred.resolve({ ok: true, body: { data: [{ id: 'v1' }], total: 75 } })
    await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument())
    const tarjeta = screen.getByText('Visitas de hoy').closest('a')
    expect(tarjeta).not.toBeNull()
    expect(within(tarjeta as HTMLElement).getByText('75')).toBeInTheDocument()
  })
```

  (Si `within` no está importado en ese archivo, sumarlo al import de `@testing-library/react`.)
  Correr y ver FALLAR (muestra 1). Después, en `app/(dashboard)/inicio/page.tsx`, reemplazar el
  extractor del pedido de visitas:

```ts
        pedirNumero(`/api/visits?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${scope}`, j => {
          // El total lo cuenta la base: desde la Entrega 2 la lista viene paginada (50 por
          // página) y su largo dejaría de ser el número del día en un día cargado.
          const total = (j as { total?: unknown })?.total
          if (typeof total === 'number') return total
          const arr = (j as { data?: unknown })?.data
          return Array.isArray(arr) ? arr.length : NaN
        }).then(n => { if (!cancelado) setNumeros(prev => ({ ...prev, visitasHoy: n })) })
```

  Correr y ver PASAR (también el test D37 de al lado, que sigue resolviendo sin `total`).

- [ ] **Paso 7: Tareas lee `direccion`** — en `app/(dashboard)/tasks/page.tsx`:
  - import: cambiar `import type { PropertyVisitWithRelations } from '@/types/visits.types'` por
    `import type { VisitaListado } from '@/lib/visitas/tipos'` y sumar
    `import { formatearFechaHora } from '@/lib/visitas/horario'`;
  - `useState<PropertyVisitWithRelations[]>([])` → `useState<VisitaListado[]>([])`;
  - `{v.property?.address ?? '-'}` → `{v.direccion ?? '-'}`;
  - `{fechaHoraCorta(v.scheduled_at)}` → `{formatearFechaHora(v.scheduled_at)}` y borrar la
    función `fechaHoraCorta` (era la hora sin zona: en el servidor salía corrida 3 h; spec §4.6).
    Antes de borrarla: `grep -n "fechaHoraCorta" "app/(dashboard)/tasks/page.tsx"` → solo esa línea.
  La URL del pedido (`advisor_id=…&status=scheduled&to=…`) NO cambia: la ruta acepta esos alias.

- [ ] **Paso 8: Verificar** — `npx vitest run --config vitest.visitas.config.ts app/api/visits "app/(dashboard)/inicio" "app/(dashboard)/tasks"`
  (si el filtro por ruta no matchea por los paréntesis, correr la suite completa) y
  `npx tsc --noEmit -p tsconfig.visitas.json`. `app/(dashboard)/visits/page.tsx` todavía importa
  `PropertyVisitWithRelations` y lee `data` como antes: compila (el tipo sigue existiendo en
  `types/visits.types.ts`) y se reescribe en la Tarea 11.
- [ ] **Paso 9: Commit** — `git add app/api/visits/route.ts app/api/visits/route.test.ts "app/(dashboard)/inicio/page.tsx" "app/(dashboard)/inicio/page.test.tsx" "app/(dashboard)/tasks/page.tsx"`
  (el borrado ya quedó en el índice con `git rm`) y commit
  `feat(visitas): GET /api/visits con filtros, alcance por rol y paginado`.

---

### Tarea 8: `GET /api/visits/resumen`

**Files:**
- Create: `app/api/visits/resumen/route.ts`
- Test: `app/api/visits/resumen/route.test.ts`

**Interfaces:**
- Consumes: `leerFiltrosResumen` (Tarea 4), `armarResumen`, `DIAS_DE_AGENDA` (Tarea 5),
  `datos.todasLasVisitas`, `alcanceDeVisitas` (Tarea 6).
- Produces: `GET /api/visits/resumen?desde=AAAA-MM-DD&hasta=AAAA-MM-DD[&asesor][&propiedad][&origen]`
  → `200 { data: ResumenVisitas }` · `400 { error }` · `401` · `403` ·
  `500 { error: 'No pudimos cargar el resumen de visitas' }`.

**Qué lee (tres consultas en paralelo, cada una paginada de a 1000, con el mismo alcance y
filtros):** (1) las visitas del período (`scheduled_at` entre el inicio del día `desde` y el fin del
día `hasta`, argentinos); (2) TODAS las activas (para "requieren tu acción", sin período); (3) las de
hoy a hoy+6 (agenda). `truncado` = alguna de las tres llegó al techo.

- [ ] **Paso 1: Escribir el test**

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const { estado, todasMock } = vi.hoisted(() => ({
  estado: { role: 'coordinador', id: '11111111-1111-4111-8111-111111111111', activo: true, logueado: true },
  todasMock: vi.fn(),
}))

vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => estado.logueado
    ? { id: estado.id, email: 'x@y.com', profile: { id: estado.id, role: estado.role, is_active: estado.activo } }
    : null),
}))
vi.mock('@/lib/visitas/datos', () => ({ todasLasVisitas: todasMock }))

import { GET } from './route'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

const ASESOR = '22222222-2222-4222-8222-222222222222'
const pedir = (qs: string) => GET(new NextRequest(`http://local/api/visits/resumen?${qs}`))
const PERIODO = 'desde=2026-09-16&hasta=2026-10-15'

beforeEach(() => {
  todasMock.mockReset()
  todasMock.mockResolvedValue({ filas: [], truncado: false })
  estado.role = 'coordinador'; estado.id = '11111111-1111-4111-8111-111111111111'; estado.logueado = true; estado.activo = true
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-15T15:00:00Z'))
})
afterEach(() => { vi.useRealTimers() })

describe('GET /api/visits/resumen', () => {
  it('sin sesión 401; abogado 403; ninguno toca la base', async () => {
    estado.logueado = false
    expect((await pedir(PERIODO)).status).toBe(401)
    estado.logueado = true; estado.role = 'abogado'
    expect((await pedir(PERIODO)).status).toBe(403)
    expect(todasMock).not.toHaveBeenCalled()
  })
  it('sin período: 400 en castellano', async () => {
    const res = await pedir('')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Elegí las dos fechas del período')
  })
  it('lee el período en días argentinos, las activas y los próximos 7 días, con el mismo alcance', async () => {
    await pedir(`${PERIODO}&origen=portal&asesor=${ASESOR}`)
    const [periodo, abiertas, proximas] = todasMock.mock.calls.map(c => c[0])
    expect(periodo).toMatchObject({ alcance: { tipo: 'todo' }, asesorId: ASESOR, origen: 'portal',
      desde: '2026-09-16T00:00:00.000-03:00', hasta: '2026-10-15T23:59:59.999999-03:00' })
    expect(abiertas).toMatchObject({ estados: ['pending_confirmation', 'scheduled'], asesorId: ASESOR })
    expect(abiertas.desde).toBeUndefined()
    expect(proximas).toMatchObject({ desde: '2026-10-15T00:00:00.000-03:00', hasta: '2026-10-21T23:59:59.999999-03:00' })
  })
  it('asesor: alcance propio, su ?asesor= no cuenta, y "por asesor" vacío', async () => {
    estado.role = 'asesor'; estado.id = ASESOR
    todasMock.mockResolvedValue({ filas: [v({ status: 'completed', scheduled_at: '2026-10-14T13:00:00Z' })], truncado: false })
    const res = await pedir(`${PERIODO}&asesor=77777777-7777-4777-8777-777777777777`)
    expect(todasMock.mock.calls[0][0]).toMatchObject({ alcance: { tipo: 'propio', usuarioId: ASESOR }, asesorId: null })
    const { data } = await res.json()
    expect(data.metricas.porAsesor).toEqual([])
    expect(data.metricas.agendadas.valor).toBe(1)
  })
  it('período sin visitas: las cifras dicen sin datos (valor null), no 0', async () => {
    const { data } = await (await pedir(PERIODO)).json()
    expect(data.metricas.agendadas).toEqual({ valor: null, base: 0, orientativo: false })
    expect(data.metricas.realizadas.valor).toBeNull()
    expect(data.agenda).toEqual([{ fecha: '2026-10-15', etiqueta: 'Hoy', visitas: [] }])
  })
  it('si alguna lectura llegó al techo, avisa truncado', async () => {
    todasMock.mockResolvedValueOnce({ filas: [], truncado: true })
    const { data } = await (await pedir(PERIODO)).json()
    expect(data.truncado).toBe(true)
  })
  it('un fallo de la base: 500 en castellano', async () => {
    todasMock.mockRejectedValue(new Error('listar visitas: boom'))
    const res = await pedir(PERIODO)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('No pudimos cargar el resumen de visitas')
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR.**

- [ ] **Paso 3: Implementar `app/api/visits/resumen/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import * as datos from '@/lib/visitas/datos'
import { leerFiltrosResumen } from '@/lib/visitas/filtros'
import { armarResumen, DIAS_DE_AGENDA } from '@/lib/visitas/resumen'
import { puedeGestionarVisitas, puedeVerTodasLasVisitas, alcanceDeVisitas } from '@/lib/visitas/acceso'
import { ESTADOS_ACTIVOS } from '@/lib/visitas/transiciones'
import { fechaEnArgentina, sumarDias } from '@/lib/visitas/horario'
import { inicioDelDiaArgentina, finDelDiaArgentina } from '@/lib/filters/rango-fechas'
import type { Role } from '@/types/auth.types'

export const dynamic = 'force-dynamic'

/**
 * Resumen de la sección Visitas (spec §3.4 y §4.4): tarjetas, agenda, "requieren tu
 * acción" y estadísticas del período. Las cuentas están en lib/visitas/metricas.ts y
 * lib/visitas/resumen.ts; acá solo permisos, parámetros y las tres lecturas.
 */
export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return NextResponse.json({ error: 'Iniciá sesión de nuevo' }, { status: 401 })
  const role = user.profile.role as Role
  if (!puedeGestionarVisitas(role)) return NextResponse.json({ error: 'No tenés permiso para ver visitas' }, { status: 403 })
  const filtros = leerFiltrosResumen(req.nextUrl.searchParams)
  if (!filtros.ok) return NextResponse.json({ error: filtros.error }, { status: 400 })

  const f = filtros.valor
  const verTodo = puedeVerTodasLasVisitas(role)
  const ahora = new Date()
  const hoy = fechaEnArgentina(ahora)
  const base: datos.FiltroConsultaVisitas = {
    alcance: alcanceDeVisitas(role, user.id),
    asesorId: verTodo ? f.asesorId : null,
    propiedadId: f.propiedadId,
    origen: f.origen,
  }
  try {
    const [delPeriodo, abiertas, proximas] = await Promise.all([
      datos.todasLasVisitas({ ...base, desde: inicioDelDiaArgentina(f.desde), hasta: finDelDiaArgentina(f.hasta) }),
      datos.todasLasVisitas({ ...base, estados: ESTADOS_ACTIVOS }),
      datos.todasLasVisitas({ ...base, desde: inicioDelDiaArgentina(hoy), hasta: finDelDiaArgentina(sumarDias(hoy, DIAS_DE_AGENDA - 1)) }),
    ])
    const resumen = armarResumen({
      periodo: { desde: f.desde, hasta: f.hasta },
      delPeriodo: delPeriodo.filas,
      abiertas: abiertas.filas,
      proximas: proximas.filas,
      ahora,
      truncado: delPeriodo.truncado || abiertas.truncado || proximas.truncado,
      verTodo,
    })
    return NextResponse.json({ data: resumen })
  } catch (e) {
    console.error('[GET /api/visits/resumen]', e)
    return NextResponse.json({ error: 'No pudimos cargar el resumen de visitas' }, { status: 500 })
  }
}
```

  OJO: `vi.mock('@/lib/visitas/datos', () => ({ todasLasVisitas }))` reemplaza el módulo entero;
  el `datos.FiltroConsultaVisitas` es solo un TIPO (se borra al compilar), así que el mock alcanza.

- [ ] **Paso 4: Correr y ver PASAR** + `npx tsc --noEmit -p tsconfig.visitas.json`.
- [ ] **Paso 5: Commit** — `git add app/api/visits/resumen` y commit
  `feat(visitas): GET /api/visits/resumen con tarjetas, agenda, pendientes y estadísticas`.

---
### Tarea 9: Textos de cifras, filas de visita, tarjetas y agenda

**Files:**
- Create: `lib/visitas/presentacion.ts`, Test: `lib/visitas/presentacion.test.ts`
- Create: `components/visitas/EstadoVisitaBadge.tsx`
- Create: `components/visitas/seccion/FilaVisita.tsx`
- Create: `components/visitas/seccion/TarjetasVisitas.tsx`, Test: `components/visitas/seccion/TarjetasVisitas.test.tsx`
- Create: `components/visitas/seccion/AgendaVisitas.tsx`, Test: `components/visitas/seccion/AgendaVisitas.test.tsx`
- Modify: `components/visitas/ficha/AccionVisitaDialog.tsx` (tipo de la prop `visita`)
- Test: `components/visitas/ficha/AccionVisitaDialog.fila.test.tsx`
- Modify: `components/visitas/BotonAgendarVisita.tsx` (`propiedadId` opcional)

**Interfaces:**
- Consumes: `Cifra`, `Metricas` (Tareas 2–3), `DiaDeAgenda` (Tarea 5), `VisitaListado`.
- Produces (Tareas 10–13):
  - `TEXTO_SIN_DATOS = 'Sin datos'`, `TEXTO_LLEGA_CON_LA_ENCUESTA = 'Sin datos — llega con la encuesta'`
  - `textoPorcentaje(c: Cifra): string | null` ("62 %")
  - `textoDuracion(ms: number): string` ("menos de 1 min" · "45 min" · "6 h" · "3 días")
  - `textoDeTiempo(c: Cifra): string | null`
  - `textoDeBase(c: Cifra, sustantivo: { uno: string; varios: string }): string` ("de 34 visitas · orientativo")
  - `etiquetaDeOrigen(origen: OrigenVisita | null, detalle: string | null): string`
  - `resumenDelDia(visitasHoy: number, porResolver: number): string`
  - `formatearFechaCorta(v: string | Date): string` ("01/08/26, 12:00" en hora argentina)
  - `<EstadoVisitaBadge estado={EstadoVisita} />`
  - `<FilaVisita visita={VisitaListado} cuando?: 'hora' | 'fecha' mostrarAsesor={boolean} mostrarPropiedad?: boolean>{acciones?}</FilaVisita>` (renderiza un `<li>`)
  - `<TarjetasVisitas metricas={Metricas} etiquetaPeriodo={string} />`
  - `<AgendaVisitas agenda={DiaDeAgenda[]} mostrarAsesor={boolean} hrefTodas={string} />`
  - `type VisitaParaDialogo = Pick<VisitaDetalle, 'id' | 'updated_at' | 'advisor_id'>` exportado por `AccionVisitaDialog.tsx`; la prop `visita` pasa a ser de ese tipo.
  - `BotonAgendarVisita({ propiedadId?: string; onAgendada?: (id: string) => void })`

- [ ] **Paso 1: Test de `presentacion`**

```ts
import { describe, it, expect } from 'vitest'
import { textoPorcentaje, textoDuracion, textoDeTiempo, textoDeBase, etiquetaDeOrigen, resumenDelDia, formatearFechaCorta } from './presentacion'
import { cifra, porcentaje } from './metricas'

const VISITAS = { uno: 'visita', varios: 'visitas' }

describe('presentación de cifras', () => {
  it('sin datos ⇒ null (la tarjeta dice "Sin datos"), nunca "0 %"', () => {
    expect(textoPorcentaje(porcentaje(0, 0))).toBeNull()
    expect(textoDeTiempo(cifra(0, 0))).toBeNull()
    expect(textoDeBase(cifra(0, 0), VISITAS)).toBe('sin visitas para calcularlo')
  })
  it('porcentaje y base con "orientativo"', () => {
    expect(textoPorcentaje(porcentaje(1, 2))).toBe('50 %')
    expect(textoDeBase(porcentaje(1, 1), VISITAS)).toBe('de 1 visita · orientativo')
    expect(textoDeBase(porcentaje(10, 40), VISITAS)).toBe('de 40 visitas')
  })
  it('duraciones legibles', () => {
    expect(textoDuracion(20_000)).toBe('menos de 1 min')
    expect(textoDuracion(45 * 60_000)).toBe('45 min')
    expect(textoDuracion(59.6 * 60_000)).toBe('1 h')
    expect(textoDuracion(6 * 3_600_000)).toBe('6 h')
    expect(textoDuracion(3 * 86_400_000)).toBe('3 días')
  })
  it('origen con su detalle', () => {
    expect(etiquetaDeOrigen('portal', 'zonaprop')).toBe('Consulta de portal · Zonaprop')
    expect(etiquetaDeOrigen('otro', 'Recomendación')).toBe('Otro · Recomendación')
    expect(etiquetaDeOrigen('cartel', null)).toBe('Cartel en la propiedad')
    expect(etiquetaDeOrigen(null, null)).toBe('Sin origen')
  })
  it('resumen del día en singular y plural', () => {
    expect(resumenDelDia(0, 0)).toBe('Sin visitas hoy · nada para resolver')
    expect(resumenDelDia(1, 1)).toBe('1 visita hoy · 1 cosa para resolver')
    expect(resumenDelDia(3, 5)).toBe('3 visitas hoy · 5 cosas para resolver')
  })
  it('fecha corta en hora ARGENTINA, con año y reloj de 24 h', () => {
    expect(formatearFechaCorta('2026-08-01T15:00:00Z')).toBe('01/08/26, 12:00')
    expect(formatearFechaCorta('2026-11-01T02:30:00Z')).toBe('31/10/26, 23:30')
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR.**

- [ ] **Paso 3: Implementar `lib/visitas/presentacion.ts`**

```ts
/**
 * Cómo se DICE cada número de la sección Visitas. Puro y seguro para el navegador.
 * Regla del tablero: sin base ⇒ "Sin datos" (lo pinta StatTile con `value={null}`),
 * nunca "0 %"; base chica ⇒ "orientativo".
 */
import type { Cifra } from './metricas'
import { ORIGEN_INFO, PORTAL_ETIQUETA, type OrigenVisita } from './origen'
import { fechaEnArgentina, horaEnArgentina } from './horario'

export const TEXTO_SIN_DATOS = 'Sin datos'
export const TEXTO_LLEGA_CON_LA_ENCUESTA = 'Sin datos — llega con la encuesta'

export function textoPorcentaje(c: Cifra): string | null {
  return c.valor === null ? null : `${c.valor} %`
}

export function textoDuracion(ms: number): string {
  const minutos = Math.round(ms / 60_000)
  if (minutos < 1) return 'menos de 1 min'
  if (minutos < 60) return `${minutos} min`
  const horas = Math.round(ms / 3_600_000)
  if (horas < 48) return `${horas} h`
  return `${Math.round(ms / 86_400_000)} días`
}

export function textoDeTiempo(c: Cifra): string | null {
  return c.valor === null ? null : textoDuracion(c.valor)
}

export function textoDeBase(c: Cifra, sustantivo: { uno: string; varios: string }): string {
  if (c.valor === null) return `sin ${sustantivo.varios} para calcularlo`
  return `de ${c.base} ${c.base === 1 ? sustantivo.uno : sustantivo.varios}${c.orientativo ? ' · orientativo' : ''}`
}

export function etiquetaDeOrigen(origen: OrigenVisita | null, detalle: string | null): string {
  if (!origen) return 'Sin origen'
  const base = ORIGEN_INFO[origen].etiqueta
  if (!detalle) return base
  if (origen === 'portal') return `${base} · ${PORTAL_ETIQUETA[detalle] ?? detalle}`
  if (origen === 'otro' || origen === 'publicidad_paga') return `${base} · ${detalle}`
  return base
}

export function resumenDelDia(visitasHoy: number, porResolver: number): string {
  const hoy = visitasHoy === 0 ? 'Sin visitas hoy' : `${visitasHoy} visita${visitasHoy === 1 ? '' : 's'} hoy`
  const resolver = porResolver === 0 ? 'nada para resolver' : `${porResolver} cosa${porResolver === 1 ? '' : 's'} para resolver`
  return `${hoy} · ${resolver}`
}

/** "01/08/26, 12:00" — con año (el coordinador mira rangos viejos) y en hora argentina. */
export function formatearFechaCorta(v: string | Date): string {
  const d = typeof v === 'string' ? new Date(v) : v
  const [anio, mes, dia] = fechaEnArgentina(d).split('-')
  return `${dia}/${mes}/${anio.slice(2)}, ${horaEnArgentina(d)}`
}
```

- [ ] **Paso 4: Correr y ver PASAR.**

- [ ] **Paso 5: Componentes base** — crear `components/visitas/EstadoVisitaBadge.tsx`:

```tsx
import { Badge } from '@/components/ui/badge'
import { ESTADO_ETIQUETA, type EstadoVisita } from '@/lib/visitas/transiciones'

/** Insignia de estado de una visita. Una sola para todas las listas: el color no es el único canal (dice el estado). */
const COLOR: Record<EstadoVisita, string> = {
  pending_confirmation: 'bg-amber-100 text-amber-900',
  scheduled: 'bg-blue-100 text-blue-900',
  completed: 'bg-green-100 text-green-900',
  no_show: 'bg-orange-100 text-orange-900',
  cancelled: 'bg-muted text-muted-foreground',
}

export function EstadoVisitaBadge({ estado }: { estado: EstadoVisita }) {
  return (
    <Badge variant="outline" className={`shrink-0 border-transparent ${COLOR[estado]}`}>
      {ESTADO_ETIQUETA[estado]}
    </Badge>
  )
}
```

  y `components/visitas/seccion/FilaVisita.tsx`:

```tsx
import Link from 'next/link'
import { EstadoVisitaBadge } from '@/components/visitas/EstadoVisitaBadge'
import { formatearFechaHora, horaEnArgentina } from '@/lib/visitas/horario'
import { etiquetaDeOrigen } from '@/lib/visitas/presentacion'
import type { VisitaListado } from '@/lib/visitas/tipos'

/**
 * Una visita como fila tocable (agenda, "requieren tu acción", pestaña de la ficha).
 * Toda la fila lleva a la ficha de la visita y mide ≥ 44 px; las acciones (si hay) van
 * DEBAJO, fuera del link, para que tocarlas no navegue.
 */
export function FilaVisita({ visita, cuando = 'fecha', mostrarAsesor, mostrarPropiedad = true, children }: {
  visita: VisitaListado
  cuando?: 'hora' | 'fecha'
  mostrarAsesor: boolean
  mostrarPropiedad?: boolean
  children?: React.ReactNode
}) {
  const momento = cuando === 'hora' ? horaEnArgentina(new Date(visita.scheduled_at)) : formatearFechaHora(visita.scheduled_at)
  const datos = [
    visita.client_name || 'Sin nombre',
    etiquetaDeOrigen(visita.origin, visita.origin_detail),
    mostrarAsesor ? (visita.asesor_nombre ?? 'Sin asesor') : null,
  ].filter((t): t is string => t !== null).join(' · ')
  return (
    <li className="rounded-lg border bg-card p-3">
      <Link
        href={`/visits/${visita.id}`}
        className="flex min-h-11 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
      >
        <span className="min-w-0">
          <span className="font-medium tabular-nums">{momento}</span>
          {mostrarPropiedad && <span className="block break-words">{visita.direccion ?? 'Propiedad sin dirección'}</span>}
          <span className="block break-words text-sm text-muted-foreground">{datos}</span>
        </span>
        <EstadoVisitaBadge estado={visita.status} />
      </Link>
      {children && <div className="mt-3 flex flex-wrap gap-2">{children}</div>}
    </li>
  )
}
```

- [ ] **Paso 6: Tests de tarjetas y agenda** — `components/visitas/seccion/TarjetasVisitas.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import { TarjetasVisitas } from './TarjetasVisitas'
import { calcularMetricas } from '@/lib/visitas/metricas'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

const AHORA = new Date('2026-10-15T15:00:00Z')
const tarjeta = (nombre: string) => screen.getByText(nombre).parentElement as HTMLElement

describe('TarjetasVisitas', () => {
  it('período vacío: las cinco tarjetas dicen "Sin datos", ninguna 0', () => {
    render(<TarjetasVisitas metricas={calcularMetricas([], AHORA)} etiquetaPeriodo="Últimos 30 días" />)
    expect(screen.getAllByText('Sin datos')).toHaveLength(5)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.queryByText('0 %')).not.toBeInTheDocument()
  })
  it('con datos: cantidad, % con su base, orientativo y las sin marcar', () => {
    const metricas = calcularMetricas([
      v({ status: 'completed', scheduled_at: '2026-10-14T13:00:00Z' }),
      v({ status: 'no_show', outcome_reason: 'no_vino', scheduled_at: '2026-10-14T13:00:00Z' }),
      v({ status: 'scheduled', scheduled_at: '2026-10-14T13:00:00Z' }),
    ], AHORA)
    render(<TarjetasVisitas metricas={metricas} etiquetaPeriodo="Últimos 30 días" />)
    expect(within(tarjeta('Agendadas')).getByText('3')).toBeInTheDocument()
    expect(within(tarjeta('Se realizaron')).getByText('50 %')).toBeInTheDocument()
    expect(within(tarjeta('Se realizaron')).getByText('de 2 con resultado · orientativo · 1 sin marcar')).toBeInTheDocument()
    expect(within(tarjeta('No se hicieron')).getByText('1 no se realizó · 0 canceladas')).toBeInTheDocument()
    expect(within(tarjeta('Encuestas respondidas')).getByText('Llega con la encuesta')).toBeInTheDocument()
  })
})
```

  y `components/visitas/seccion/AgendaVisitas.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { AgendaVisitas } from './AgendaVisitas'
import { armarAgenda } from '@/lib/visitas/resumen'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

describe('AgendaVisitas', () => {
  it('sin visitas: lo dice para hoy y para los próximos días', () => {
    render(<AgendaVisitas agenda={armarAgenda([], '2026-10-15')} mostrarAsesor hrefTodas="/visits/todas" />)
    expect(screen.getByText('No hay visitas hoy.')).toBeInTheDocument()
    expect(screen.getByText('Tampoco hay visitas en los próximos 7 días.')).toBeInTheDocument()
  })
  it('hora argentina, persona, origen, asesor, estado y link a la ficha', () => {
    const visita = v({ scheduled_at: '2026-10-15T13:30:00Z', client_name: 'Mariana López', origin: 'portal', origin_detail: 'zonaprop' })
    render(<AgendaVisitas agenda={armarAgenda([visita], '2026-10-15')} mostrarAsesor hrefTodas="/visits/todas?from=x" />)
    expect(screen.getByText('10:30')).toBeInTheDocument()
    expect(screen.getByText('Mariana López · Consulta de portal · Zonaprop · Lucas Pérez')).toBeInTheDocument()
    expect(screen.getByText('Confirmada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Doblas 248/ })).toHaveAttribute('href', `/visits/${visita.id}`)
    expect(screen.getByRole('link', { name: 'Ver todas' })).toHaveAttribute('href', '/visits/todas?from=x')
  })
  it('el asesor no ve su propio nombre en cada fila', () => {
    render(<AgendaVisitas agenda={armarAgenda([v({ scheduled_at: '2026-10-15T13:30:00Z' })], '2026-10-15')} mostrarAsesor={false} hrefTodas="/visits/todas" />)
    expect(screen.queryByText(/Lucas Pérez/)).not.toBeInTheDocument()
  })
})
```

- [ ] **Paso 7: Correr y ver FALLAR.**

- [ ] **Paso 8: Implementar `components/visitas/seccion/TarjetasVisitas.tsx`**

```tsx
import { StatTile } from '@/components/ui/StatTile'
import type { Metricas } from '@/lib/visitas/metricas'
import { textoPorcentaje, textoDeTiempo, textoDeBase } from '@/lib/visitas/presentacion'

const VISITAS = { uno: 'visita', varios: 'visitas' }
const CON_RESULTADO = { uno: 'con resultado', varios: 'con resultado' }

/** Las cinco tarjetas de la sección (spec §3.4). Cada número con su base (regla del tablero). */
export function TarjetasVisitas({ metricas: m, etiquetaPeriodo }: { metricas: Metricas; etiquetaPeriodo: string }) {
  const sinMarcar = m.sinMarcar > 0 ? ` · ${m.sinMarcar} sin marcar` : ''
  const { noRealizadas, canceladas } = m.conteos
  return (
    <div data-testid="tarjetas-visitas" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <StatTile
        label="Agendadas"
        value={m.agendadas.valor}
        context={m.agendadas.valor === null ? 'sin visitas en el período' : etiquetaPeriodo.toLowerCase()}
      />
      <StatTile
        label="Se realizaron"
        value={textoPorcentaje(m.realizadas)}
        context={m.realizadas.valor === null
          ? `ninguna con resultado todavía${sinMarcar}`
          : `${textoDeBase(m.realizadas, CON_RESULTADO)}${sinMarcar}`}
      />
      <StatTile
        label="No se hicieron"
        value={m.noSeHicieron.total.valor}
        context={m.noSeHicieron.total.valor === null
          ? 'sin visitas en el período'
          : `${noRealizadas} no se ${noRealizadas === 1 ? 'realizó' : 'realizaron'} · ${canceladas} ${canceladas === 1 ? 'cancelada' : 'canceladas'}`}
      />
      {/* Entrega 3: se llena con las encuestas completas ÷ realizadas del período. */}
      <StatTile label="Encuestas respondidas" value={null} context="Llega con la encuesta" />
      <StatTile
        label="De la consulta a la visita"
        value={textoDeTiempo(m.tiempos.consultaAVisita)}
        context={m.tiempos.consultaAVisita.valor === null
          ? 'sin consultas previas vinculadas'
          : `mediana ${textoDeBase(m.tiempos.consultaAVisita, VISITAS)}`}
      />
    </div>
  )
}
```

  y `components/visitas/seccion/AgendaVisitas.tsx`:

```tsx
import Link from 'next/link'
import { FilaVisita } from './FilaVisita'
import type { DiaDeAgenda } from '@/lib/visitas/resumen'

/** Agenda Hoy / Mañana / próximos días (spec §3.4), con todos los estados. */
export function AgendaVisitas({ agenda, mostrarAsesor, hrefTodas }: { agenda: DiaDeAgenda[]; mostrarAsesor: boolean; hrefTodas: string }) {
  const nadaMasAdelante = agenda.length === 1
  return (
    <section aria-labelledby="agenda-titulo" className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="agenda-titulo" className="text-lg font-semibold">Agenda</h2>
        <Link href={hrefTodas} className="inline-flex min-h-11 items-center text-sm text-primary underline">Ver todas</Link>
      </div>
      {agenda.map(dia => (
        <div key={dia.fecha} className="space-y-2">
          <h3 className="eyebrow">{dia.etiqueta}</h3>
          {dia.visitas.length === 0
            ? <p className="text-sm text-muted-foreground">No hay visitas hoy.</p>
            : (
              <ul className="space-y-2">
                {dia.visitas.map(v => <FilaVisita key={v.id} visita={v} cuando="hora" mostrarAsesor={mostrarAsesor} />)}
              </ul>
            )}
        </div>
      ))}
      {nadaMasAdelante && <p className="text-sm text-muted-foreground">Tampoco hay visitas en los próximos 7 días.</p>}
    </section>
  )
}
```

  (Solo el día de hoy puede llegar vacío: `armarAgenda` descarta los demás días sin visitas.)

- [ ] **Paso 9: Correr y ver PASAR** (tarjetas y agenda). Si el texto "No se hicieron" del test
  ("1 no se realizó · 0 canceladas") no coincide, revisar la regla de singular/plural del componente,
  no el test.

- [ ] **Paso 10: `AccionVisitaDialog` acepta una fila del listado** — test primero:
  `components/visitas/ficha/AccionVisitaDialog.fila.test.tsx`

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { AccionVisitaDialog } from './AccionVisitaDialog'
import { visitaDePrueba } from '@/test/visitas/visita-de-prueba'

describe('AccionVisitaDialog desde la sección Visitas', () => {
  it('acepta una fila del listado y manda su versión EXACTA', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ data: null }), { status: 200, headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', fetchMock)
    const fila = visitaDePrueba({ status: 'pending_confirmation' })
    const onRecargar = vi.fn()
    render(<AccionVisitaDialog visita={fila} accion="confirmar" onClose={() => {}} onHecho={() => {}} onRecargar={onRecargar} />)
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onRecargar).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`/api/visits/${fila.id}/estado`)
    expect(JSON.parse(String(init?.body))).toEqual({ tipo: 'confirmar', version: fila.updated_at })
  })
})
```

  Correr: pasa en ejecución pero `tsc` falla al compilar el uso en la Tarea 10 si no se cambia el
  tipo. Implementar en `components/visitas/ficha/AccionVisitaDialog.tsx`: debajo de
  `export type VisitaConHistorial = …` sumar

```ts
/**
 * Lo mínimo que la ventana usa de la visita: el id (ruta), la versión (concurrencia) y el
 * asesor actual (para no ofrecerlo en "Cambiar asesor"). Así la abre la ficha
 * (`VisitaConHistorial`) y también una fila de la sección Visitas (`VisitaListado`).
 */
export type VisitaParaDialogo = Pick<VisitaDetalle, 'id' | 'updated_at' | 'advisor_id'>
```

  y en la firma del componente cambiar `visita: VisitaConHistorial` por `visita: VisitaParaDialogo`.
  Verificar con `grep -n "visita\." components/visitas/ficha/AccionVisitaDialog.tsx` que solo se
  usan `visita.id`, `visita.updated_at` y `visita.advisor_id` (si aparece otro campo, sumarlo al
  `Pick`). La ficha (`app/(dashboard)/visits/[id]/page.tsx`) sigue pasando un `VisitaConHistorial`,
  que cumple el `Pick`: no se toca.

- [ ] **Paso 11: `BotonAgendarVisita` sin propiedad** — en `components/visitas/BotonAgendarVisita.tsx`
  cambiar la firma a `{ propiedadId?: string; onAgendada?: (id: string) => void }` y el comentario
  a `/** "Agendar visita". Con propiedadId, la propiedad ya viene elegida (ficha); sin él, el paso 1 la pide (sección Visitas). */`.
  `AgendarVisitaDialog` ya acepta `propiedadId?: string`.

- [ ] **Paso 12: Correr la suite completa y tipos** — `npx vitest run --config vitest.visitas.config.ts`
  (incluye las pruebas de la ficha de visita de la Entrega 1, que no tienen que cambiar) y
  `npx tsc --noEmit -p tsconfig.visitas.json`.
- [ ] **Paso 13: Commit** — `git add lib/visitas/presentacion.ts lib/visitas/presentacion.test.ts components/visitas/EstadoVisitaBadge.tsx components/visitas/seccion components/visitas/ficha/AccionVisitaDialog.tsx components/visitas/ficha/AccionVisitaDialog.fila.test.tsx components/visitas/BotonAgendarVisita.tsx`
  y commit `feat(visitas): tarjetas, agenda y textos de la sección Visitas`.

---

### Tarea 10: "Requieren tu acción" y "Cómo vienen las visitas"

**Files:**
- Create: `components/visitas/seccion/RequierenAccion.tsx`, Test: `components/visitas/seccion/RequierenAccion.test.tsx`
- Create: `components/visitas/seccion/ComoVienen.tsx`, Test: `components/visitas/seccion/ComoVienen.test.tsx`

**Interfaces:**
- Consumes: `RequierenAccion` (tipo, Tarea 5), `Metricas`, `FilaGrupo`, `PasoEmbudo` (Tareas 2–3),
  `AccionVisitaDialog` + `VisitaParaDialogo` (Tarea 9), `FilaVisita`, textos de `presentacion`.
- Produces (Tarea 11):
  - `<RequierenAccion requieren={RequierenAccion} mostrarAsesor={boolean} onCambio={() => void} />`
  - `<ComoVienen metricas={Metricas} mostrarAsesor={boolean} />`

- [ ] **Paso 1: Escribir los tests** — `RequierenAccion.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { RequierenAccion } from './RequierenAccion'
import { requierenAccion } from '@/lib/visitas/resumen'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

const AHORA = new Date('2026-10-15T15:00:00Z')
let cuerpos: unknown[] = []

beforeEach(() => {
  cuerpos = []
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    cuerpos.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify({ data: null }), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
})

describe('RequierenAccion', () => {
  it('sin pendientes lo dice', () => {
    render(<RequierenAccion requieren={requierenAccion([], AHORA)} mostrarAsesor onCambio={() => {}} />)
    expect(screen.getByText('No hay nada para resolver.')).toBeInTheDocument()
  })
  it('una visita que pasó sin resultado ofrece Se realizó / No se realizó / Reprogramar; una a confirmar, Confirmar', () => {
    const r = requierenAccion([
      v({ status: 'scheduled', scheduled_at: '2026-10-14T13:00:00Z', client_name: 'Pasada' }),
      v({ status: 'pending_confirmation', scheduled_at: '2026-10-20T13:00:00Z', client_name: 'Futura' }),
    ], AHORA)
    render(<RequierenAccion requieren={r} mostrarAsesor onCambio={() => {}} />)
    expect(screen.getByRole('heading', { name: 'Requieren tu acción (2)' })).toBeInTheDocument()
    const pasada = screen.getByText(/Pasada/).closest('li') as HTMLElement
    expect(within(pasada).getAllByRole('button').map(b => b.textContent)).toEqual(['Se realizó', 'No se realizó', 'Reprogramar'])
    const futura = screen.getByText(/Futura/).closest('li') as HTMLElement
    expect(within(futura).getAllByRole('button').map(b => b.textContent)).toEqual(['Confirmar'])
    for (const b of screen.getAllByRole('button')) expect(b.className).toContain('min-h-11')
  })
  it('"Se realizó" ahí mismo: pide el interés, manda la acción con la versión y avisa para recargar', async () => {
    const pasada = v({ status: 'scheduled', scheduled_at: '2026-10-14T13:00:00Z' })
    const onCambio = vi.fn()
    render(<RequierenAccion requieren={requierenAccion([pasada], AHORA)} mostrarAsesor onCambio={onCambio} />)
    await userEvent.click(screen.getByRole('button', { name: 'Se realizó' }))
    await userEvent.click(await screen.findByRole('radio', { name: 'Alto' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(onCambio).toHaveBeenCalled())
    expect(cuerpos[0]).toEqual({ tipo: 'realizada', interes: 'alto', notas: '', version: pasada.updated_at })
  })
})
```

  `ComoVienen.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { ComoVienen } from './ComoVienen'
import { calcularMetricas } from '@/lib/visitas/metricas'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

const AHORA = new Date('2026-10-15T15:00:00Z')
const conDatos = () => calcularMetricas([
  ...Array.from({ length: 10 }, () => v({ status: 'pending_confirmation', confirmed_at: null })),
  ...Array.from({ length: 6 }, () => v({ status: 'scheduled' })),
  ...Array.from({ length: 4 }, () => v({ status: 'completed', origin: 'portal', origin_detail: 'zonaprop' })),
], AHORA)

describe('ComoVienen', () => {
  it('el embudo resalta UN solo salto y deja los pasos de la encuesta en gris', () => {
    const { container } = render(<ComoVienen metricas={conDatos()} mostrarAsesor />)
    expect(container.querySelectorAll('[data-salto="true"]')).toHaveLength(1)
    expect(container.querySelector('[data-salto="true"]')).toHaveTextContent('Se realizaron')
    expect(screen.getByText('Respondieron la encuesta')).toBeInTheDocument()
    expect(screen.getByText('Dijeron cuánto ofertarían')).toBeInTheDocument()
  })
  it('por origen con el % realizado y su base', () => {
    render(<ComoVienen metricas={conDatos()} mostrarAsesor />)
    expect(screen.getByText('Consulta de portal')).toBeInTheDocument()
    expect(screen.getByText('4 visitas · 100 % se realizó (de 4 · orientativo)')).toBeInTheDocument()
  })
  it('sin visitas: sin datos en todo, y "Qué opinan" espera a la encuesta', () => {
    render(<ComoVienen metricas={calcularMetricas([], AHORA)} mostrarAsesor />)
    expect(screen.getByText('Todavía no hay visitas en este período.')).toBeInTheDocument()
    expect(screen.getAllByText('Sin datos — llega con la encuesta').length).toBeGreaterThanOrEqual(1)
  })
  it('el asesor no ve "Por asesor"', () => {
    render(<ComoVienen metricas={conDatos()} mostrarAsesor={false} />)
    expect(screen.queryByRole('heading', { name: 'Por asesor' })).not.toBeInTheDocument()
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR.**

- [ ] **Paso 3: Implementar `components/visitas/seccion/RequierenAccion.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AccionVisitaDialog } from '@/components/visitas/ficha/AccionVisitaDialog'
import { FilaVisita } from './FilaVisita'
import type { RequierenAccion as Pendientes } from '@/lib/visitas/resumen'
import type { VisitaListado } from '@/lib/visitas/tipos'
import type { TipoAccion } from '@/lib/visitas/transiciones'

const DE_UNA_PASADA: ReadonlyArray<{ accion: TipoAccion; texto: string; principal: boolean }> = [
  { accion: 'realizada', texto: 'Se realizó', principal: true },
  { accion: 'no_realizada', texto: 'No se realizó', principal: false },
  { accion: 'reprogramar', texto: 'Reprogramar', principal: false },
]
const DE_UNA_A_CONFIRMAR: ReadonlyArray<{ accion: TipoAccion; texto: string; principal: boolean }> = [
  { accion: 'confirmar', texto: 'Confirmar', principal: true },
]

/**
 * Lo que hay que resolver (spec §3.4): visitas que pasaron sin resultado y visitas a
 * confirmar, con la acción AHÍ MISMO (la misma ventana que la ficha; el servidor valida
 * la transición y la versión). Al terminar, `onCambio` hace que la pantalla vuelva a
 * pedir el resumen: así la visita sale de la lista y suma donde corresponde (criterio 14).
 * "Encuestas sin responder hace más de 48 h" llega con la Entrega 3.
 */
export function RequierenAccion({ requieren, mostrarAsesor, onCambio }: { requieren: Pendientes; mostrarAsesor: boolean; onCambio: () => void }) {
  const [abierta, setAbierta] = useState<{ visita: VisitaListado; accion: TipoAccion } | null>(null)
  const mostradas = requieren.sinResultado.length + requieren.aConfirmar.length

  function botones(visita: VisitaListado, lista: typeof DE_UNA_PASADA) {
    return lista.map(b => (
      <Button
        key={b.accion}
        type="button"
        variant={b.principal ? 'default' : 'outline'}
        className={`min-h-11 ${b.principal ? 'bg-brand text-brand-foreground hover:bg-brand/90' : ''}`}
        onClick={() => setAbierta({ visita, accion: b.accion })}
      >
        {b.texto}
      </Button>
    ))
  }

  return (
    <section aria-labelledby="requieren-titulo" className="min-w-0 space-y-3 rounded-xl border bg-card p-4">
      <h2 id="requieren-titulo" className="text-lg font-semibold">
        Requieren tu acción{requieren.total > 0 ? ` (${requieren.total})` : ''}
      </h2>
      {requieren.total === 0 && <p className="text-sm text-muted-foreground">No hay nada para resolver.</p>}
      {requieren.sinResultado.length > 0 && (
        <div className="space-y-2">
          <h3 className="eyebrow">Pasaron sin resultado</h3>
          <ul className="space-y-2">
            {requieren.sinResultado.map(v => (
              <FilaVisita key={v.id} visita={v} mostrarAsesor={mostrarAsesor}>{botones(v, DE_UNA_PASADA)}</FilaVisita>
            ))}
          </ul>
        </div>
      )}
      {requieren.aConfirmar.length > 0 && (
        <div className="space-y-2">
          <h3 className="eyebrow">A confirmar</h3>
          <ul className="space-y-2">
            {requieren.aConfirmar.map(v => (
              <FilaVisita key={v.id} visita={v} mostrarAsesor={mostrarAsesor}>{botones(v, DE_UNA_A_CONFIRMAR)}</FilaVisita>
            ))}
          </ul>
        </div>
      )}
      {requieren.total > mostradas && (
        <p className="text-sm text-muted-foreground">Se muestran las primeras {mostradas} de {requieren.total}. Las demás están en “Ver todas”.</p>
      )}
      {abierta && (
        <AccionVisitaDialog
          visita={abierta.visita}
          accion={abierta.accion}
          onClose={() => setAbierta(null)}
          onHecho={() => onCambio()}
          onRecargar={onCambio}
        />
      )}
    </section>
  )
}
```

- [ ] **Paso 4: Implementar `components/visitas/seccion/ComoVienen.tsx`**

```tsx
import type { Metricas, FilaGrupo, Cifra } from '@/lib/visitas/metricas'
import { textoPorcentaje, textoDeTiempo, textoDeBase, TEXTO_LLEGA_CON_LA_ENCUESTA, TEXTO_SIN_DATOS } from '@/lib/visitas/presentacion'

const VISITAS = { uno: 'visita', varios: 'visitas' }

function textoRealizado(c: Cifra): string {
  const p = textoPorcentaje(c)
  return p ? `${p} se realizó (de ${c.base}${c.orientativo ? ' · orientativo' : ''})` : 'sin resultados todavía'
}

function Grupo({ titulo, filas }: { titulo: string; filas: FilaGrupo[] }) {
  // Un id con espacios rompe aria-labelledby (el espacio separa referencias).
  const id = `grupo-${titulo.toLowerCase().replace(/\s+/g, '-')}`
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-2">
      <h3 id={id} className="text-sm font-semibold">{titulo}</h3>
      {filas.length === 0
        ? <p className="text-sm text-muted-foreground">{TEXTO_SIN_DATOS}</p>
        : (
          <ul className="divide-y rounded-lg border">
            {filas.map(f => (
              <li key={f.clave} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 p-3 text-sm">
                <span className="min-w-0 break-words font-medium">{f.etiqueta}</span>
                <span className="tabular-nums text-muted-foreground">
                  {`${f.cantidad} visita${f.cantidad === 1 ? '' : 's'} · ${textoRealizado(f.realizado)}`}
                </span>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}

const TIEMPOS: ReadonlyArray<{ clave: keyof Metricas['tiempos']; etiqueta: string }> = [
  { clave: 'consultaAVisita', etiqueta: 'De la consulta a la visita' },
  { clave: 'anticipacion', etiqueta: 'Anticipación (de agendar a la visita)' },
  { clave: 'confirmacion', etiqueta: 'Confirmación (de agendar a confirmada)' },
  { clave: 'marcarResultado', etiqueta: 'Marcar el resultado (después de la visita)' },
]

/** "Cómo vienen las visitas" + "Qué opinan los que visitaron" (spec §3.4). */
export function ComoVienen({ metricas: m, mostrarAsesor }: { metricas: Metricas; mostrarAsesor: boolean }) {
  const base = m.embudo[0]?.cantidad ?? 0
  return (
    <>
      <section aria-labelledby="como-vienen-titulo" className="space-y-5 rounded-xl border bg-card p-4">
        <h2 id="como-vienen-titulo" className="text-lg font-semibold">Cómo vienen las visitas</h2>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Embudo</h3>
          {base === 0
            ? <p className="text-sm text-muted-foreground">Todavía no hay visitas en este período.</p>
            : (
              <ol className="space-y-3">
                {m.embudo.map(p => (
                  <li key={p.clave} data-salto={p.saltoMasGrande ? 'true' : undefined} className="space-y-1">
                    <div className="flex justify-between gap-2 text-sm">
                      <span className={p.saltoMasGrande ? 'font-semibold' : ''}>{p.etiqueta}</span>
                      <span className="tabular-nums">{p.cantidad}</span>
                    </div>
                    <div className="h-3 rounded-full bg-muted" aria-hidden="true">
                      <div
                        className={`h-3 rounded-full ${p.saltoMasGrande ? 'bg-brand' : 'bg-muted-foreground/40'}`}
                        style={{ width: `${Math.max(2, Math.round((p.cantidad / base) * 100))}%` }}
                      />
                    </div>
                    {p.saltoMasGrande && <p className="text-xs font-medium text-brand">Acá se pierde la mayor parte</p>}
                  </li>
                ))}
                {['Respondieron la encuesta', 'Dijeron cuánto ofertarían'].map(paso => (
                  <li key={paso} className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
                    <span>{paso}</span><span>{TEXTO_LLEGA_CON_LA_ENCUESTA}</span>
                  </li>
                ))}
              </ol>
            )}
        </div>

        <Grupo titulo="Por origen" filas={m.porOrigen} />

        <section aria-labelledby="tiempos-titulo" className="space-y-2">
          <h3 id="tiempos-titulo" className="text-sm font-semibold">Tiempos (medianas)</h3>
          <ul className="divide-y rounded-lg border">
            {TIEMPOS.map(t => {
              const c = m.tiempos[t.clave]
              return (
                <li key={t.clave} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 p-3 text-sm">
                  <span className="min-w-0 break-words">{t.etiqueta}</span>
                  <span className="tabular-nums text-muted-foreground">
                    {textoDeTiempo(c) ? `${textoDeTiempo(c)} · ${textoDeBase(c, VISITAS)}` : TEXTO_SIN_DATOS}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>

        <section aria-labelledby="motivos-titulo" className="space-y-2">
          <h3 id="motivos-titulo" className="text-sm font-semibold">Por qué no se hicieron</h3>
          {m.noSeHicieron.porMotivo.length === 0
            ? <p className="text-sm text-muted-foreground">{TEXTO_SIN_DATOS}</p>
            : (
              <ul className="divide-y rounded-lg border">
                {m.noSeHicieron.porMotivo.map(x => (
                  <li key={x.clave} className="flex justify-between gap-3 p-3 text-sm">
                    <span className="min-w-0 break-words">{x.etiqueta}</span><span className="tabular-nums">{x.cantidad}</span>
                  </li>
                ))}
              </ul>
            )}
        </section>

        {mostrarAsesor && <Grupo titulo="Por asesor" filas={m.porAsesor} />}
      </section>

      <section aria-labelledby="opinan-titulo" className="space-y-2 rounded-xl border bg-card p-4">
        <h2 id="opinan-titulo" className="text-lg font-semibold">Qué opinan los que visitaron</h2>
        <p className="text-sm text-muted-foreground">{TEXTO_LLEGA_CON_LA_ENCUESTA}</p>
      </section>
    </>
  )
}
```

  (El test busca `'4 visitas · 100 % se realizó (de 4 · orientativo)'`: es exactamente lo que arma
  `Grupo` para el origen portal del fixture.)

- [ ] **Paso 5: Correr y ver PASAR.** El test del diálogo dentro de `RequierenAccion` es el de
  arranque en frío de happy-dom: si el worker falla la primera vez, reintentar una vez.
- [ ] **Paso 6: Commit** — `git add components/visitas/seccion/RequierenAccion.tsx components/visitas/seccion/RequierenAccion.test.tsx components/visitas/seccion/ComoVienen.tsx components/visitas/seccion/ComoVienen.test.tsx`
  y commit `feat(visitas): pendientes con acción ahí mismo y "Cómo vienen las visitas"`.

---

### Tarea 11: La pantalla `/visits` nueva

**Files:**
- Create: `components/visitas/seccion/EncabezadoVisitas.tsx`
- Modify (reemplazo completo): `app/(dashboard)/visits/page.tsx`
- Modify (reemplazo completo): `app/(dashboard)/visits/page.test.tsx`, `app/(dashboard)/visits/page.movil.test.tsx`

**Interfaces:**
- Consumes: Tareas 1, 4, 5, 9, 10; `useFiltrosUrl`, `usePedidosVersionados` (`lib/filters`),
  `leerRespuesta`, `BotonAgendarVisita`, `FilterBar`, `esRol`, `puedeVerTodasLasVisitas`.
- Produces: la pantalla. URL: `periodo` (`7d|30d|mes|personalizado`), `from`, `to` (AAAA-MM-DD),
  `asesor`, `propiedad`, `origen`, `onlyMine` (heredado: `true` = "a mi nombre").
  `<EncabezadoVisitas …/>` con las props de abajo.

**Compatibilidad (criterio del pedido):** el link de /inicio `/visits?from=<hoy>&to=<hoy>[&onlyMine=true]`
abre el período "Hoy" (personalizado); `onlyMine=true` filtra por el asesor que mira (para un asesor
ya es su alcance). Los links a `/visits` pelado (Tareas, menú) abren "Últimos 30 días".

- [ ] **Paso 1: Escribir los tests** — reemplazar `app/(dashboard)/visits/page.test.tsx` por:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { armarResumen, type ResumenVisitas } from '@/lib/visitas/resumen'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

let busqueda = ''
const escrituras: string[] = []
vi.mock('next/navigation', () => ({
  usePathname: () => '/visits',
  useSearchParams: () => new URLSearchParams(busqueda),
  useRouter: () => ({ replace: (href: string) => { escrituras.push(href) }, push: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// La ventana de agendar tiene sus propias pruebas (Entrega 1); acá solo importa que el botón esté.
vi.mock('@/components/visitas/BotonAgendarVisita', () => ({
  BotonAgendarVisita: () => <button type="button" className="min-h-11">Agendar visita</button>,
}))

import VisitsPage from './page'

const YO = '11111111-1111-4111-8111-111111111111'
const AHORA = new Date('2026-10-15T15:00:00Z')
let rol = 'admin'
let respuestas: Array<{ status: number; body: unknown }> = []
let pedidosResumen: string[] = []

function resumen(cambios: Partial<Parameters<typeof armarResumen>[0]> = {}): ResumenVisitas {
  return armarResumen({
    periodo: { desde: '2026-09-16', hasta: '2026-10-15' }, delPeriodo: [], abiertas: [], proximas: [],
    ahora: AHORA, truncado: false, verTodo: rol !== 'asesor', ...cambios,
  })
}

beforeEach(() => {
  busqueda = ''; escrituras.length = 0; rol = 'admin'; pedidosResumen = []
  respuestas = [{ status: 200, body: { data: resumen() } }]
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AHORA)
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (url.startsWith('/api/auth/me')) return json(200, { id: YO, role: rol })
    if (url.startsWith('/api/users/advisors')) return json(200, { data: [{ id: '22222222-2222-4222-8222-222222222222', full_name: 'Lucas Pérez' }] })
    if (url.startsWith('/api/visits/resumen')) {
      pedidosResumen.push(url)
      const r = respuestas.length > 1 ? respuestas.shift() : respuestas[0]
      return json(r?.status ?? 500, r?.body ?? {})
    }
    if (url.includes('/estado') && init?.method === 'POST') return json(200, { data: null })
    throw new Error(`fetch inesperado: ${url}`)
  }))
})
afterEach(() => { vi.useRealTimers() })

describe('/visits', () => {
  it('pide el resumen de los últimos 30 días argentinos', async () => {
    render(<VisitsPage />)
    await waitFor(() => expect(pedidosResumen).toHaveLength(1))
    const qs = new URL(pedidosResumen[0], 'http://x').searchParams
    expect(qs.get('desde')).toBe('2026-09-16')
    expect(qs.get('hasta')).toBe('2026-10-15')
  })
  it('el link de Inicio (?from=hoy&to=hoy&onlyMine=true) pide HOY a nombre de quien mira', async () => {
    busqueda = 'from=2026-10-15&to=2026-10-15&onlyMine=true'
    render(<VisitsPage />)
    await waitFor(() => expect(pedidosResumen).toHaveLength(1))
    const qs = new URL(pedidosResumen[0], 'http://x').searchParams
    expect([qs.get('desde'), qs.get('hasta'), qs.get('asesor')]).toEqual(['2026-10-15', '2026-10-15', YO])
  })
  it('un período sin visitas: "Sin datos" en las tarjetas y el resumen del día', async () => {
    render(<VisitsPage />)
    expect(await screen.findByText('Sin visitas hoy · nada para resolver')).toBeInTheDocument()
    expect(screen.getAllByText('Sin datos').length).toBeGreaterThanOrEqual(5)
  })
  it('el asesor no ve el filtro de asesor ni "Por asesor", y no pide la lista de asesores', async () => {
    rol = 'asesor'
    respuestas = [{ status: 200, body: { data: resumen({ delPeriodo: [v({ status: 'completed', scheduled_at: '2026-10-14T13:00:00Z' })] }) } }]
    render(<VisitsPage />)
    await screen.findByText('Cómo vienen las visitas')
    expect(screen.queryByRole('combobox', { name: 'Asesor' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Por asesor' })).not.toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).startsWith('/api/users/advisors'))).toBe(false)
  })
  it('elegir "7 días" escribe el período en la dirección', async () => {
    render(<VisitsPage />)
    await screen.findByText('Sin visitas hoy · nada para resolver')
    await userEvent.click(screen.getByRole('button', { name: '7 días' }))
    expect(escrituras.some(h => h.includes('periodo=7d'))).toBe(true)
  })
  it('criterio 14: "Se realizó" desde "Requieren tu acción" vuelve a pedir el resumen y la visita sale de la lista', async () => {
    const pasada = v({ status: 'scheduled', scheduled_at: '2026-10-14T13:00:00Z', client_name: 'Pasada' })
    respuestas = [
      { status: 200, body: { data: resumen({ abiertas: [pasada] }) } },
      { status: 200, body: { data: resumen({ delPeriodo: [{ ...pasada, status: 'completed' }] }) } },
    ]
    render(<VisitsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Se realizó' }))
    await userEvent.click(await screen.findByRole('radio', { name: 'Alto' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(pedidosResumen).toHaveLength(2))
    expect(await screen.findByText('No hay nada para resolver.')).toBeInTheDocument()
    expect(screen.getByText('100 %')).toBeInTheDocument()
  })
  it('si el servidor falla: el mensaje real y "Reintentar"', async () => {
    respuestas = [
      { status: 500, body: { error: 'No pudimos cargar el resumen de visitas' } },
      { status: 200, body: { data: resumen() } },
    ]
    render(<VisitsPage />)
    expect(await screen.findByText('No pudimos cargar el resumen de visitas')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Sin visitas hoy · nada para resolver')).toBeInTheDocument()
  })
})
```

  y `app/(dashboard)/visits/page.movil.test.tsx` por:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { armarResumen } from '@/lib/visitas/resumen'

/**
 * Piso móvil de la sección: mismo marco que el resto de las pantallas (el layout ya pone
 * `p-4 md:p-6`; nada de `container mx-auto py-6`), y todo lo tocable de ≥ 44 px.
 */
vi.mock('next/navigation', () => ({
  usePathname: () => '/visits',
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/components/visitas/BotonAgendarVisita', () => ({
  BotonAgendarVisita: () => <button type="button" className="min-h-11">Agendar visita</button>,
}))

import VisitsPage from './page'

beforeEach(() => {
  const data = armarResumen({ periodo: { desde: '2026-09-16', hasta: '2026-10-15' }, delPeriodo: [], abiertas: [], proximas: [],
    ahora: new Date(), truncado: false, verTodo: true })
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const body = url.startsWith('/api/auth/me') ? { id: '11111111-1111-4111-8111-111111111111', role: 'admin' }
      : url.startsWith('/api/users/advisors') ? { data: [] } : { data }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
})

describe('/visits en el celular', () => {
  it('no vuelve a envolver el contenido en `container mx-auto py-6`', async () => {
    const { container } = render(<VisitsPage />)
    await screen.findByText('Cómo vienen las visitas')
    const raiz = container.firstElementChild as HTMLElement
    expect(raiz.className).toContain('space-y-4')
    expect(raiz.className).not.toContain('container')
    expect(raiz.className).not.toContain('py-6')
  })
  it('los botones del período miden al menos 44 px y dicen si están elegidos', async () => {
    render(<VisitsPage />)
    await screen.findByText('Cómo vienen las visitas')
    for (const nombre of ['7 días', '30 días', 'Este mes', 'Personalizado']) {
      const b = screen.getByRole('button', { name: nombre })
      expect(b.className).toContain('min-h-11')
      expect(b).toHaveAttribute('aria-pressed')
    }
    expect(screen.getByRole('button', { name: '30 días' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('el botón Agendar visita está en el encabezado', async () => {
    render(<VisitsPage />)
    expect(await screen.findByRole('button', { name: 'Agendar visita' })).toBeInTheDocument()
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR** (la pantalla vieja pide `/api/visits`).

- [ ] **Paso 3: Implementar `components/visitas/seccion/EncabezadoVisitas.tsx`**

```tsx
'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FilterBar, type FilterOption } from '@/components/filters/FilterBar'
import { BotonAgendarVisita } from '@/components/visitas/BotonAgendarVisita'
import { PERIODO_ETIQUETA, PERIODO_POR_DEFECTO, type ClavePeriodo } from '@/lib/visitas/periodo'

export interface ValoresFiltro { asesor: string; propiedad: string; origen: string }

const CHIPS: ReadonlyArray<Exclude<ClavePeriodo, 'personalizado'>> = ['7d', '30d', 'mes']

/**
 * Período (7 días / 30 días / Este mes / Personalizado), filtros y "Agendar visita"
 * (spec §3.4). Solo muestra y avisa: la pantalla decide qué se escribe en la URL.
 */
export function EncabezadoVisitas({
  clave, desde, hasta, valores, opcionesAsesor, opcionesPropiedad, opcionesOrigen,
  onPeriodo, onRango, onFiltro, onLimpiar, onAgendada,
}: {
  clave: ClavePeriodo
  desde: string
  hasta: string
  valores: ValoresFiltro
  /** `null` = quien mira no elige asesor (asesor: ve lo suyo). */
  opcionesAsesor: FilterOption[] | null
  opcionesPropiedad: FilterOption[]
  opcionesOrigen: FilterOption[]
  onPeriodo: (clave: Exclude<ClavePeriodo, 'personalizado'>) => void
  onRango: (desde: string, hasta: string) => void
  onFiltro: (clave: keyof ValoresFiltro, valor: string) => void
  onLimpiar: () => void
  onAgendada: () => void
}) {
  const [personalizadoAbierto, setPersonalizadoAbierto] = useState(clave === 'personalizado')
  const [borradorDesde, setBorradorDesde] = useState(desde)
  const [borradorHasta, setBorradorHasta] = useState(hasta)
  const chip = (activo: boolean) =>
    `min-h-11 rounded-full px-4 ${activo ? 'bg-brand text-brand-foreground hover:bg-brand/90' : ''}`

  const selects = [
    { key: 'origen', label: 'Origen', options: opcionesOrigen },
    { key: 'propiedad', label: 'Propiedad', options: opcionesPropiedad },
    ...(opcionesAsesor ? [{ key: 'asesor', label: 'Asesor', options: opcionesAsesor }] : []),
  ]

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="Período" className="flex flex-wrap gap-2">
          {CHIPS.map(c => (
            <Button key={c} type="button" variant={clave === c ? 'default' : 'outline'} aria-pressed={clave === c}
              className={chip(clave === c)} onClick={() => { setPersonalizadoAbierto(false); onPeriodo(c) }}>
              {PERIODO_ETIQUETA[c]}
            </Button>
          ))}
          <Button type="button" variant={clave === 'personalizado' ? 'default' : 'outline'} aria-pressed={clave === 'personalizado'}
            className={chip(clave === 'personalizado')}
            onClick={() => { setBorradorDesde(desde); setBorradorHasta(hasta); setPersonalizadoAbierto(a => !a) }}>
            {PERIODO_ETIQUETA.personalizado}
          </Button>
        </div>
        <BotonAgendarVisita onAgendada={onAgendada} />
      </div>

      {personalizadoAbierto && (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={e => { e.preventDefault(); onRango(borradorDesde, borradorHasta) }}
        >
          <label className="space-y-1 text-sm"><span className="block">Desde</span>
            <input type="date" value={borradorDesde} onChange={e => setBorradorDesde(e.target.value)}
              className="h-11 rounded-md border bg-background px-3 text-base" />
          </label>
          <label className="space-y-1 text-sm"><span className="block">Hasta</span>
            <input type="date" value={borradorHasta} onChange={e => setBorradorHasta(e.target.value)}
              className="h-11 rounded-md border bg-background px-3 text-base" />
          </label>
          <Button type="submit" className="min-h-11">Aplicar</Button>
        </form>
      )}

      <FilterBar
        selects={selects}
        values={{ ...valores }}
        onChange={(k, valor) => { if (k === 'asesor' || k === 'propiedad' || k === 'origen') onFiltro(k, valor) }}
        onClear={onLimpiar}
        extraActivo={clave !== PERIODO_POR_DEFECTO}
      />
    </div>
  )
}
```

  (El `if` del `onChange` evita un `as keyof ValoresFiltro`: `FilterBar` devuelve la clave como
  `string`.)

- [ ] **Paso 4: Reescribir `app/(dashboard)/visits/page.tsx`**

```tsx
'use client'

/**
 * Sección Visitas (spec §3.4, diseño A — Claridad): resumen del día, período y filtros,
 * tarjetas, agenda, "requieren tu acción" y "cómo vienen las visitas". Las cuentas las
 * hace el servidor (GET /api/visits/resumen → lib/visitas/resumen.ts); esta pantalla
 * solo pide y compone.
 *
 * Filtros en la URL (lib/filters/use-filtros-url). Compatibilidad: el link de /inicio
 * llega como `?from=<hoy>&to=<hoy>[&onlyMine=true]` y abre el período "Hoy".
 */
import { Suspense, useEffect, useMemo, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useFiltrosUrl } from '@/lib/filters/use-filtros-url'
import { usePedidosVersionados } from '@/lib/filters/use-pedidos-versionados'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { EncabezadoVisitas } from '@/components/visitas/seccion/EncabezadoVisitas'
import { TarjetasVisitas } from '@/components/visitas/seccion/TarjetasVisitas'
import { AgendaVisitas } from '@/components/visitas/seccion/AgendaVisitas'
import { RequierenAccion } from '@/components/visitas/seccion/RequierenAccion'
import { ComoVienen } from '@/components/visitas/seccion/ComoVienen'
import { PERIODOS, resolverPeriodo, esFechaValida } from '@/lib/visitas/periodo'
import { FILTROS_ORIGEN } from '@/lib/visitas/filtros'
import { ORIGEN_INFO, esOrigenVisita } from '@/lib/visitas/origen'
import { fechaEnArgentina } from '@/lib/visitas/horario'
import { resumenDelDia } from '@/lib/visitas/presentacion'
import { esRol, puedeVerTodasLasVisitas } from '@/lib/visitas/acceso'
import type { ResumenVisitas } from '@/lib/visitas/resumen'

// Constantes de MÓDULO: dentro del componente cambiarían de identidad en cada render y
// el hook de filtros re-pediría sin parar.
const FILTROS_DEFECTO = { periodo: '30d', from: '', to: '', asesor: '', propiedad: '', origen: '', onlyMine: '' }
type Filtros = typeof FILTROS_DEFECTO
const PERMITIDOS = { periodo: [...PERIODOS], origen: ['', ...FILTROS_ORIGEN], onlyMine: ['', 'true'] }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizar(f: Filtros): Filtros {
  return {
    ...f,
    from: esFechaValida(f.from) ? f.from : '',
    to: esFechaValida(f.to) ? f.to : '',
    // "A mi nombre" (onlyMine) y un asesor elegido son excluyentes: gana onlyMine.
    asesor: f.onlyMine === 'true' || !UUID_RE.test(f.asesor) ? '' : f.asesor,
    propiedad: UUID_RE.test(f.propiedad) ? f.propiedad : '',
  }
}

const OPCIONES_ORIGEN = [
  { value: '', label: 'Todos los orígenes' },
  ...FILTROS_ORIGEN.map(o => ({ value: o, label: esOrigenVisita(o) ? ORIGEN_INFO[o].etiqueta : 'Sin origen' })),
]

type Identidad = { id: string; rol: string } | null

function leerIdentidad(d: unknown): Identidad {
  if (!d || typeof d !== 'object') return null
  const id = 'id' in d && typeof d.id === 'string' ? d.id : null
  const rol = 'role' in d && typeof d.role === 'string' ? d.role : null
  return id && rol ? { id, rol } : null
}

export default function VisitsPage() {
  return (
    <Suspense fallback={<Esqueleto />}>
      <VisitasClient />
    </Suspense>
  )
}

function Esqueleto() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Visitas</h1>
        <p className="text-muted-foreground">Cargando…</p>
      </div>
      <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
    </div>
  )
}

function VisitasClient() {
  const { filtros: mostrado, aplicados: filtros, aplicar, limpiar } = useFiltrosUrl({
    defectos: FILTROS_DEFECTO, permitidos: PERMITIDOS, normalizar,
  })
  const [identidad, setIdentidad] = useState<Identidad | 'cargando'>('cargando')
  const [asesores, setAsesores] = useState<Array<{ id: string; full_name: string }>>([])
  const [datos, setDatos] = useState<{ clave: string; resumen: ResumenVisitas } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [recarga, setRecarga] = useState(0)
  const pedidos = usePedidosVersionados()
  const hoy = useMemo(() => fechaEnArgentina(new Date()), [])

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => (r.ok ? r.json() : null))
      .then((d: unknown) => setIdentidad(leerIdentidad(d)))
      .catch(() => setIdentidad(null))
  }, [])

  const yo = identidad === 'cargando' ? null : identidad
  const verTodo = !!yo && esRol(yo.rol) && puedeVerTodasLasVisitas(yo.rol)

  useEffect(() => {
    if (!verTodo) return
    fetch('/api/users/advisors')
      .then(r => leerRespuesta<Array<{ id: string; full_name: string }>>(r))
      .then(r => { if (r.ok) setAsesores(r.data ?? []) })
      .catch(() => {})
  }, [verTodo])

  const periodo = resolverPeriodo(filtros, hoy)
  const asesorPedido = verTodo ? (filtros.onlyMine === 'true' && yo ? yo.id : filtros.asesor) : ''
  const clave = periodo.ok
    ? [periodo.periodo.desde, periodo.periodo.hasta, asesorPedido, filtros.propiedad, filtros.origen].join('|')
    : ''

  useEffect(() => {
    if (identidad === 'cargando' || !periodo.ok) return
    const { gen, signal } = pedidos.abrir()
    const qs = new URLSearchParams({ desde: periodo.periodo.desde, hasta: periodo.periodo.hasta })
    if (asesorPedido) qs.set('asesor', asesorPedido)
    if (filtros.propiedad) qs.set('propiedad', filtros.propiedad)
    if (filtros.origen) qs.set('origen', filtros.origen)
    setCargando(true)
    fetch(`/api/visits/resumen?${qs}`, { signal })
      .then(r => leerRespuesta<ResumenVisitas>(r))
      .then(r => {
        if (!pedidos.vigente(gen)) return
        if (r.ok) { setDatos({ clave, resumen: r.data }); setError(null) }
        else setError(r.error)
      })
      .catch(() => { if (pedidos.vigente(gen)) setError('No hay conexión. Probá de nuevo.') })
      .finally(() => pedidos.siVigente(gen, () => setCargando(false)))
    // `clave` resume período + filtros; `recarga` fuerza un pedido nuevo tras una acción.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, identidad, recarga])

  const recargar = () => setRecarga(n => n + 1)
  // Regla del tablero: un resumen de OTRO período/filtro no se muestra como si fuera este.
  const resumen = datos && datos.clave === clave ? datos.resumen : null

  const hrefTodas = (() => {
    if (!periodo.ok) return '/visits/todas'
    const qs = new URLSearchParams({ from: periodo.periodo.desde, to: periodo.periodo.hasta })
    if (asesorPedido) qs.set('asesor', asesorPedido)
    if (filtros.propiedad) qs.set('propiedad', filtros.propiedad)
    if (filtros.origen) qs.set('origen', filtros.origen)
    return `/visits/todas?${qs}`
  })()

  const opcionesPropiedad = [
    { value: '', label: 'Todas las propiedades' },
    ...(resumen?.propiedades ?? []).map(p => ({ value: p.id, label: p.direccion })),
  ]

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Visitas</h1>
        <p className="text-muted-foreground">
          {resumen ? resumenDelDia(resumen.visitasHoy, resumen.requieren.total) : 'Cargando…'}
        </p>
      </div>

      <EncabezadoVisitas
        clave={periodo.ok ? periodo.periodo.clave : 'personalizado'}
        desde={periodo.ok ? periodo.periodo.desde : mostrado.from}
        hasta={periodo.ok ? periodo.periodo.hasta : mostrado.to}
        valores={{ asesor: mostrado.onlyMine === 'true' && yo ? yo.id : mostrado.asesor, propiedad: mostrado.propiedad, origen: mostrado.origen }}
        opcionesAsesor={verTodo ? [{ value: '', label: 'Todos los asesores' }, ...asesores.map(a => ({ value: a.id, label: a.full_name }))] : null}
        opcionesPropiedad={opcionesPropiedad}
        opcionesOrigen={OPCIONES_ORIGEN}
        onPeriodo={c => aplicar({ periodo: c, from: '', to: '' })}
        onRango={(desde, hasta) => aplicar({ periodo: 'personalizado', from: desde, to: hasta })}
        onFiltro={(k, valor) => aplicar(k === 'asesor' ? { asesor: valor, onlyMine: '' } : { [k]: valor })}
        onLimpiar={() => limpiar()}
        onAgendada={recargar}
      />

      {!periodo.ok && <p role="alert" className="text-sm text-destructive">{periodo.error}</p>}
      <p role="status" aria-live="polite" className="sr-only">{cargando ? 'Actualizando las visitas' : ''}</p>

      {error && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 p-4 text-sm">
          <span>{error}</span>
          <Button type="button" variant="outline" className="min-h-11" onClick={recargar}>Reintentar</Button>
        </div>
      )}

      {!resumen && !error && periodo.ok && (
        <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>
      )}

      {resumen && (
        <>
          {resumen.truncado && (
            <p className="rounded-xl border p-3 text-sm">
              Hay más visitas de las que se pudieron leer de una vez: los números pueden estar incompletos. Elegí un período más corto.
            </p>
          )}
          <TarjetasVisitas metricas={resumen.metricas} etiquetaPeriodo={periodo.ok ? periodo.periodo.etiqueta : ''} />
          <div className="grid gap-4 lg:grid-cols-2">
            <AgendaVisitas agenda={resumen.agenda} mostrarAsesor={verTodo} hrefTodas={hrefTodas} />
            <RequierenAccion requieren={resumen.requieren} mostrarAsesor={verTodo} onCambio={recargar} />
          </div>
          <ComoVienen metricas={resumen.metricas} mostrarAsesor={verTodo} />
        </>
      )}
    </div>
  )
}
```

  Notas para el implementador:
  - `aplicar({ [k]: valor })` con `k` de tipo `'propiedad' | 'origen'` tipa como
    `Partial<Filtros>`; si TS lo ensancha a `{ [x: string]: string }`, escribir las dos ramas
    explícitas (`k === 'propiedad' ? { propiedad: valor } : { origen: valor }`). Nada de `as`.
  - `PERMITIDOS.periodo` y `.origen` son arreglos de `string`: cumplen `readonly string[]`.
  - Si `useFiltrosUrl` rechaza un valor (p. ej. `periodo=año`), devuelve `rechazadas`; esta
    pantalla no lo muestra porque el período cae solo a 30 días (`resolverPeriodo`).

- [ ] **Paso 5: Correr y ver PASAR** — `npx vitest run --config vitest.visitas.config.ts "app/(dashboard)/visits"`
  (o la suite completa). Reintentar una vez si el worker de happy-dom falla en frío.
- [ ] **Paso 6: Tipos y lint** — `npx tsc --noEmit -p tsconfig.visitas.json` y
  `npx eslint "app/(dashboard)/visits/page.tsx" components/visitas/seccion`.
- [ ] **Paso 7: Commit** — `git add "app/(dashboard)/visits/page.tsx" "app/(dashboard)/visits/page.test.tsx" "app/(dashboard)/visits/page.movil.test.tsx" components/visitas/seccion/EncabezadoVisitas.tsx`
  y commit `feat(visitas): la sección Visitas con resumen, agenda, pendientes y estadísticas`.

---

### Tarea 12: "Ver todas" — lista con filtros y paginación

**Files:**
- Create: `app/(dashboard)/visits/todas/page.tsx`, Test: `app/(dashboard)/visits/todas/page.test.tsx`
- Modify (reemplazo completo): `app/(dashboard)/visits/_components/VisitsTable.tsx`,
  `app/(dashboard)/visits/_components/VisitsTable.test.tsx`

**Interfaces:**
- Consumes: `GET /api/visits` (Tarea 7), `formatearFechaCorta`, `etiquetaDeOrigen` (Tarea 9),
  `EstadoVisitaBadge`, `FILTROS_ORIGEN`, `ESTADOS_FILTRO` (Tarea 4).
- Produces: `/visits/todas?from&to&asesor&propiedad&origen&estado&pagina`;
  `<VisitsTable visits={VisitaListado[]} mostrarAsesor={boolean} />`.
  `POR_PAGINA_LISTA = 25`.

(La ruta estática `/visits/todas` gana sobre `/visits/[id]` en el App Router: no hay choque.)

- [ ] **Paso 1: Escribir los tests** — reemplazar `VisitsTable.test.tsx` por:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VisitsTable } from './VisitsTable'
import { visitaDePrueba } from '@/test/visitas/visita-de-prueba'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }))

const visita = (id: string) => visitaDePrueba({ id, client_name: `Cliente ${id}`, scheduled_at: '2026-08-01T15:00:00Z' })

beforeEach(() => { push.mockClear() })

describe('VisitsTable', () => {
  it('clickear la fila navega a /visits/[id]', async () => {
    render(<VisitsTable visits={[visita('a')]} mostrarAsesor />)
    await userEvent.click(screen.getByText('Cliente a'))
    expect(push).toHaveBeenCalledWith('/visits/a')
  })
  it('el botón "Ver" no dispara también el click de la fila', async () => {
    render(<VisitsTable visits={[visita('a')]} mostrarAsesor />)
    await userEvent.click(screen.getByRole('link', { name: 'Ver' }))
    expect(push).not.toHaveBeenCalled()
  })
  it('la fecha va en hora ARGENTINA, corta, con año y reloj de 24 h', () => {
    render(<VisitsTable visits={[visita('a')]} mostrarAsesor />)
    expect(document.querySelector('[data-celda="titulo"]')?.textContent).toBe('01/08/26, 12:00')
  })
  it('en la ficha del teléfono: fecha identidad, estado insignia; asesor y "Ver" ocultos', () => {
    render(<VisitsTable visits={[visita('a')]} mostrarAsesor />)
    // DataTable suma al final celdas sin datos (chevron / salto de renglón): se miran las 7 de las columnas.
    const roles = Array.from(document.querySelectorAll('tbody tr:first-child td')).map(td => td.getAttribute('data-celda'))
    expect(roles.slice(0, 7)).toEqual(['titulo', 'dato', 'dato', 'dato', 'oculto', 'insignia', 'oculto'])
  })
  it('sin la columna de asesor para quien ve solo lo suyo', () => {
    render(<VisitsTable visits={[visita('a')]} mostrarAsesor={false} />)
    expect(screen.queryByRole('columnheader', { name: 'Asesor' })).not.toBeInTheDocument()
  })
})
```

  y crear `app/(dashboard)/visits/todas/page.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { visitaDePrueba } from '@/test/visitas/visita-de-prueba'

let busqueda = ''
const escrituras: string[] = []
vi.mock('next/navigation', () => ({
  usePathname: () => '/visits/todas',
  useSearchParams: () => new URLSearchParams(busqueda),
  useRouter: () => ({ replace: (h: string) => { escrituras.push(h) }, push: vi.fn() }),
}))

import TodasLasVisitasPage from './page'

let rol = 'admin'
let respuesta: { status: number; body: unknown } = { status: 200, body: { data: [], total: 0, pagina: 1, porPagina: 25 } }
const pedidos: string[] = []

beforeEach(() => {
  busqueda = ''; escrituras.length = 0; pedidos.length = 0; rol = 'admin'
  respuesta = { status: 200, body: { data: [visitaDePrueba()], total: 60, pagina: 1, porPagina: 25 } }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (url.startsWith('/api/auth/me')) return json(200, { id: '11111111-1111-4111-8111-111111111111', role: rol })
    if (url.startsWith('/api/users/advisors')) return json(200, { data: [] })
    if (url.startsWith('/api/visits?')) { pedidos.push(url); return json(respuesta.status, respuesta.body) }
    throw new Error(`fetch inesperado: ${url}`)
  }))
})

describe('/visits/todas', () => {
  it('pide la página con los filtros de la dirección (los que manda "Ver todas")', async () => {
    busqueda = 'from=2026-10-01&to=2026-10-31&origen=portal&estado=completed'
    render(<TodasLasVisitasPage />)
    await waitFor(() => expect(pedidos).toHaveLength(1))
    const qs = new URL(pedidos[0], 'http://x').searchParams
    expect(Object.fromEntries(qs)).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-31', origen: 'portal', estado: 'completed', pagina: '1', porPagina: '25' })
  })
  it('muestra el total, la página y avanza con "Siguiente"', async () => {
    render(<TodasLasVisitasPage />)
    expect(await screen.findByText('Página 1 de 3 · 60 visitas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(escrituras.some(h => h.includes('pagina=2'))).toBe(true)
  })
  it('un asesor no ve el filtro de asesor', async () => {
    rol = 'asesor'
    render(<TodasLasVisitasPage />)
    await screen.findByText('Página 1 de 3 · 60 visitas')
    expect(screen.queryByRole('combobox', { name: 'Asesor' })).not.toBeInTheDocument()
  })
  it('si el servidor falla: el mensaje real', async () => {
    respuesta = { status: 400, body: { error: 'El estado no es válido' } }
    render(<TodasLasVisitasPage />)
    expect(await screen.findByText('El estado no es válido')).toBeInTheDocument()
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR.**

- [ ] **Paso 3: Reescribir `VisitsTable.tsx`**

```tsx
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { EstadoVisitaBadge } from '@/components/visitas/EstadoVisitaBadge'
import { formatearFechaCorta, etiquetaDeOrigen } from '@/lib/visitas/presentacion'
import type { VisitaListado } from '@/lib/visitas/tipos'

/**
 * Lista de "Ver todas". En el teléfono `DataTable` la apila como fichas: la fecha es el
 * título, el estado la insignia; el asesor y "Ver" se esconden (la ficha entera navega).
 * La fecha va en hora ARGENTINA (antes salía sin zona: en el servidor, corrida 3 h).
 */
export function VisitsTable({ visits, mostrarAsesor }: { visits: VisitaListado[]; mostrarAsesor: boolean }) {
  const router = useRouter()
  const columns: Column<VisitaListado>[] = [
    { key: 'scheduled_at', label: 'Fecha/Hora', card: 'title', render: v => <span className="whitespace-nowrap">{formatearFechaCorta(v.scheduled_at)}</span> },
    { key: 'direccion', label: 'Propiedad', wrap: true, card: 'meta', render: v => <span>{v.direccion ?? '-'}</span> },
    { key: 'client_name', label: 'Persona', card: 'meta', render: v => <span>{v.client_name}</span> },
    { key: 'origin', label: 'Origen', wrap: true, card: 'meta', render: v => <span>{etiquetaDeOrigen(v.origin, v.origin_detail)}</span> },
    ...(mostrarAsesor
      ? [{ key: 'asesor', label: 'Asesor', card: 'none', render: (v: VisitaListado) => <span>{v.asesor_nombre ?? 'Sin asesor'}</span> } satisfies Column<VisitaListado>]
      : []),
    { key: 'status', label: 'Estado', card: 'badge', render: v => <EstadoVisitaBadge estado={v.status} /> },
    {
      key: 'acciones', label: '', className: 'text-right', card: 'none',
      // La fila entera navega: sin stopPropagation el botón dispararía DOS navegaciones.
      render: v => (
        <div onClick={e => e.stopPropagation()}>
          <Button variant="outline" size="sm" asChild><Link href={`/visits/${v.id}`}>Ver</Link></Button>
        </div>
      ),
    },
  ]
  return (
    <DataTable data={visits} columns={columns} getRowKey={v => v.id} onRowClick={v => router.push(`/visits/${v.id}`)} emptyMessage="No hay visitas con estos filtros" />
  )
}
```

  (El orden lo decide el servidor —más reciente primero, estable—: sin `sortable`, para que la
  tabla no reordene solo la página visible y mienta sobre el conjunto.)

- [ ] **Paso 4: Crear `app/(dashboard)/visits/todas/page.tsx`**

```tsx
'use client'

/**
 * "Ver todas" (spec §3.4): todas las visitas del alcance con filtros y paginación. El
 * servidor filtra, ordena (más reciente primero) y cuenta (GET /api/visits).
 */
import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FilterBar } from '@/components/filters/FilterBar'
import { DateRangeFilter } from '@/components/filters/DateRangeFilter'
import { useFiltrosUrl } from '@/lib/filters/use-filtros-url'
import { usePedidosVersionados } from '@/lib/filters/use-pedidos-versionados'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { VisitsTable } from '../_components/VisitsTable'
import { FILTROS_ORIGEN, ESTADOS_FILTRO } from '@/lib/visitas/filtros'
import { ORIGEN_INFO, esOrigenVisita } from '@/lib/visitas/origen'
import { ESTADO_ETIQUETA, esEstadoVisita } from '@/lib/visitas/transiciones'
import { esFechaValida } from '@/lib/visitas/periodo'
import { esRol, puedeVerTodasLasVisitas } from '@/lib/visitas/acceso'
import type { VisitaListado } from '@/lib/visitas/tipos'

export const POR_PAGINA_LISTA = 25
const FILTROS_DEFECTO = { from: '', to: '', asesor: '', propiedad: '', origen: '', estado: '', pagina: '' }
type Filtros = typeof FILTROS_DEFECTO
const PERMITIDOS = { origen: ['', ...FILTROS_ORIGEN], estado: ['', ...ESTADOS_FILTRO] }
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function normalizar(f: Filtros): Filtros {
  return {
    ...f,
    from: esFechaValida(f.from) ? f.from : '',
    to: esFechaValida(f.to) ? f.to : '',
    asesor: UUID_RE.test(f.asesor) ? f.asesor : '',
    propiedad: UUID_RE.test(f.propiedad) ? f.propiedad : '',
    pagina: /^[1-9]\d*$/.test(f.pagina) ? f.pagina : '',
  }
}

const ETIQUETA_ESTADO_FILTRO = (e: string): string =>
  e === 'activas' ? 'Activas' : e === 'sin_resultado' ? 'Pasaron sin resultado' : esEstadoVisita(e) ? ESTADO_ETIQUETA[e] : e
const OPCIONES_ESTADO = [{ value: '', label: 'Todos los estados' }, ...ESTADOS_FILTRO.map(e => ({ value: e, label: ETIQUETA_ESTADO_FILTRO(e) }))]
const OPCIONES_ORIGEN = [{ value: '', label: 'Todos los orígenes' },
  ...FILTROS_ORIGEN.map(o => ({ value: o, label: esOrigenVisita(o) ? ORIGEN_INFO[o].etiqueta : 'Sin origen' }))]

export default function TodasLasVisitasPage() {
  return <Suspense fallback={<div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>}><Lista /></Suspense>
}

function Lista() {
  const { filtros: mostrado, aplicados: filtros, aplicar, limpiar } = useFiltrosUrl({ defectos: FILTROS_DEFECTO, permitidos: PERMITIDOS, normalizar })
  const [rol, setRol] = useState<string | null | 'cargando'>('cargando')
  const [asesores, setAsesores] = useState<Array<{ id: string; full_name: string }>>([])
  const [pagina, setPagina] = useState<{ filas: VisitaListado[]; total: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pedidos = usePedidosVersionados()

  useEffect(() => {
    fetch('/api/auth/me').then(r => (r.ok ? r.json() : null))
      .then((d: unknown) => setRol(d && typeof d === 'object' && 'role' in d && typeof d.role === 'string' ? d.role : null))
      .catch(() => setRol(null))
  }, [])
  const verTodo = rol !== 'cargando' && esRol(rol) && puedeVerTodasLasVisitas(rol)
  useEffect(() => {
    if (!verTodo) return
    fetch('/api/users/advisors').then(r => leerRespuesta<Array<{ id: string; full_name: string }>>(r))
      .then(r => { if (r.ok) setAsesores(r.data ?? []) }).catch(() => {})
  }, [verTodo])

  const numeroDePagina = Number(filtros.pagina || '1')

  useEffect(() => {
    if (rol === 'cargando') return
    const { gen, signal } = pedidos.abrir()
    const qs = new URLSearchParams({ pagina: String(numeroDePagina), porPagina: String(POR_PAGINA_LISTA) })
    if (filtros.from) qs.set('desde', filtros.from)
    if (filtros.to) qs.set('hasta', filtros.to)
    if (verTodo && filtros.asesor) qs.set('asesor', filtros.asesor)
    if (filtros.propiedad) qs.set('propiedad', filtros.propiedad)
    if (filtros.origen) qs.set('origen', filtros.origen)
    if (filtros.estado) qs.set('estado', filtros.estado)
    setError(null)
    fetch(`/api/visits?${qs}`, { signal })
      .then(async r => {
        const lectura = await leerRespuesta<VisitaListado[]>(r.clone())
        const cuerpo: unknown = await r.json().catch(() => null)
        const total = cuerpo && typeof cuerpo === 'object' && 'total' in cuerpo && typeof cuerpo.total === 'number' ? cuerpo.total : null
        if (!pedidos.vigente(gen)) return
        if (!lectura.ok) { setError(lectura.error); setPagina(null); return }
        setPagina({ filas: lectura.data ?? [], total: total ?? (lectura.data ?? []).length })
      })
      .catch(() => { if (pedidos.vigente(gen)) setError('No hay conexión. Probá de nuevo.') })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtros, rol])

  const paginas = pagina ? Math.max(1, Math.ceil(pagina.total / POR_PAGINA_LISTA)) : 1
  const opcionesPropiedad = [{ value: '', label: 'Todas las propiedades' },
    ...[...new Map((pagina?.filas ?? []).map(v => [v.property_id, v.direccion ?? 'Propiedad sin dirección'])).entries()]
      .map(([value, label]) => ({ value, label }))]

  return (
    <div className="space-y-4">
      <div>
        <Link href="/visits" className="inline-flex min-h-11 items-center text-sm text-primary underline">← Visitas</Link>
        <h1 className="text-2xl font-semibold">Todas las visitas</h1>
      </div>
      <FilterBar
        selects={[
          { key: 'estado', label: 'Estado', options: OPCIONES_ESTADO },
          { key: 'origen', label: 'Origen', options: OPCIONES_ORIGEN },
          { key: 'propiedad', label: 'Propiedad', options: opcionesPropiedad },
          ...(verTodo ? [{ key: 'asesor', label: 'Asesor', options: [{ value: '', label: 'Todos los asesores' }, ...asesores.map(a => ({ value: a.id, label: a.full_name }))] }] : []),
        ]}
        values={mostrado}
        onChange={(k, valor) => aplicar({ [k]: valor, pagina: '' })}
        onClear={() => limpiar()}
        extraActivo={!!mostrado.from || !!mostrado.to}
      >
        <DateRangeFilter value={{ from: mostrado.from, to: mostrado.to }} onChange={r => aplicar({ from: r.from, to: r.to, pagina: '' })} />
      </FilterBar>

      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {!pagina && !error && <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}
      {pagina && (
        <>
          <VisitsTable visits={pagina.filas} mostrarAsesor={verTodo} />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Página {numeroDePagina} de {paginas} · {pagina.total} visita{pagina.total === 1 ? '' : 's'}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" className="min-h-11" disabled={numeroDePagina <= 1}
                onClick={() => aplicar({ pagina: numeroDePagina - 1 <= 1 ? '' : String(numeroDePagina - 1) })}>Anterior</Button>
              <Button type="button" variant="outline" className="min-h-11" disabled={numeroDePagina >= paginas}
                onClick={() => aplicar({ pagina: String(numeroDePagina + 1) })}>Siguiente</Button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
```

  Notas: `aplicar({ [k]: valor, pagina: '' })` con `k: string` puede no tipar como `Partial<Filtros>`;
  si TS se queja, armar el parche con un `switch (k)` sobre las cuatro claves (sin `as`). Si
  `leerRespuesta` + `r.clone()` resulta incómodo, leer el cuerpo UNA vez con `r.json().catch(() => null)`
  y validar `data`/`total`/`error` a mano con guardas (`Array.isArray`, `typeof`) — lo que importa es
  no romperse con un 504 en HTML (mensaje "El servidor tardó demasiado. Probá de nuevo.").

- [ ] **Paso 5: Correr y ver PASAR** + tipos + lint de los archivos tocados.
- [ ] **Paso 6: Commit** — `git add "app/(dashboard)/visits/todas" "app/(dashboard)/visits/_components"`
  y commit `feat(visitas): "Ver todas" con filtros, paginación y hora argentina`.

---

### Tarea 13: Pestaña "Visitas" en la ficha de la propiedad

**Files:**
- Modify: `lib/properties/detail-view.ts`, `lib/properties/detail-view.test.ts`
- Modify: `lib/visitas/resumen.ts`, `lib/visitas/resumen.test.ts` (suma `separarProximasYPasadas`)
- Create: `components/properties/detail/tabs/VisitasTab.tsx`, Test: `components/properties/detail/tabs/VisitasTab.test.tsx`
- Modify: `app/(dashboard)/properties/[id]/page.tsx`
- Modify: `components/properties/detail/tabs/HistoryTab.tsx`
- Modify: `app/(dashboard)/properties/[id]/page.test.tsx`, `app/(dashboard)/properties/[id]/page.legal.test.tsx` (sacar el mock de `/feedback`)
- Modify: `scripts/property-detail-tabs.probe.tsx`
- Delete: `app/api/properties/[id]/feedback/route.ts`

**Interfaces:**
- Consumes: `GET /api/visits?propiedad=<id>&porPagina=200` (Tarea 7), `FilaVisita` (Tarea 9),
  `TEXTO_LLEGA_CON_LA_ENCUESTA`.
- Produces: `TabKey` suma `'visitas'` (etiqueta "Visitas"), visible si no es abogado y la propiedad
  está captada (`status === 'approved'`), entre Difusión e Historial;
  `separarProximasYPasadas(visitas: readonly VisitaListado[], ahora: Date): { proximas: VisitaListado[]; pasadas: VisitaListado[] }`;
  `<VisitasTab propertyId={string} mostrarAsesor={boolean} />`; `MAX_VISITAS_PESTANA = 200`.

**Consumidores de lo que se borra (grep hecho al escribir el plan):**
`/api/properties/[id]/feedback` → solo `app/(dashboard)/properties/[id]/page.tsx` (fetch) y dos mocks
de prueba (`page.test.tsx:91`, `page.legal.test.tsx:91`). `VisitFeedback`/prop `feedback` de
`HistoryTab` → `page.tsx` y `scripts/property-detail-tabs.probe.tsx:65`. Esa ruta leía
`visit_questionnaires` (0 filas) con la sesión; "Qué opinan" vuelve en la Entrega 3 dentro de la
pestaña nueva, con su esquema nuevo.

- [ ] **Paso 1: Tests** — en `lib/properties/detail-view.test.ts`, reemplazar los dos casos de
  `visibleTabs` que fijan el arreglo:

```ts
  it('el asesor con propiedad captada ve las seis, con Visitas antes de Historial', () => {
    expect(visibleTabs({ role: 'asesor', status: 'approved' }))
      .toEqual(['propiedad', 'multimedia', 'documentacion', 'difusion', 'visitas', 'historial'])
  })
  it('sin captar todavía, no hay Difusión ni Visitas', () => {
    const tabs = visibleTabs({ role: 'asesor', status: 'pending_docs' })
    expect(tabs).not.toContain('difusion')
    expect(tabs).not.toContain('visitas')
  })
  it('el abogado no ve Multimedia, Difusión ni Visitas', () => {
    expect(visibleTabs({ role: 'abogado', status: 'approved' }))
      .toEqual(['propiedad', 'documentacion', 'historial'])
  })
```

  en `lib/visitas/resumen.test.ts` sumar (y `separarProximasYPasadas` al import):

```ts
describe('separarProximasYPasadas', () => {
  it('próximas por horario (más cerca primero) y pasadas de la más reciente a la más vieja', () => {
    const r = separarProximasYPasadas([
      v({ scheduled_at: '2026-10-20T13:00:00Z', client_name: 'Lejos' }),
      v({ scheduled_at: '2026-10-16T13:00:00Z', client_name: 'Cerca', status: 'cancelled' }),
      v({ scheduled_at: '2026-10-01T13:00:00Z', client_name: 'Vieja', status: 'completed' }),
      v({ scheduled_at: '2026-10-14T13:00:00Z', client_name: 'Ayer' }),
    ], AHORA)
    expect(r.proximas.map(x => x.client_name)).toEqual(['Cerca', 'Lejos'])
    expect(r.pasadas.map(x => x.client_name)).toEqual(['Ayer', 'Vieja'])
  })
})
```

  y crear `components/properties/detail/tabs/VisitasTab.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { VisitasTab } from './VisitasTab'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

const PROP = '33333333-3333-4333-8333-333333333333'
let respuestas: Array<{ status: number; body: unknown }> = []
const urls: string[] = []

beforeEach(() => {
  urls.length = 0
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-15T15:00:00Z'))
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    urls.push(url)
    const r = respuestas.length > 1 ? respuestas.shift() : respuestas[0]
    return new Response(JSON.stringify(r?.body ?? {}), { status: r?.status ?? 500, headers: { 'content-type': 'application/json' } })
  }))
})
afterEach(() => { vi.useRealTimers() })

describe('VisitasTab', () => {
  it('pide las visitas de ESTA propiedad y las separa en próximas y pasadas, con link a cada ficha', async () => {
    const futura = v({ scheduled_at: '2026-10-20T13:00:00Z', client_name: 'Futura' })
    const pasada = v({ scheduled_at: '2026-10-01T13:00:00Z', client_name: 'Pasada', status: 'completed' })
    respuestas = [{ status: 200, body: { data: [futura, pasada], total: 2 } }]
    render(<VisitasTab propertyId={PROP} mostrarAsesor />)
    expect(await screen.findByRole('heading', { name: 'Próximas (1)' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Pasadas (1)' })).toBeInTheDocument()
    expect(screen.getByText('Realizada')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Futura/ })).toHaveAttribute('href', `/visits/${futura.id}`)
    expect(urls[0]).toBe(`/api/visits?propiedad=${PROP}&porPagina=200`)
  })
  it('sin visitas lo dice; "Qué opinan" espera a la encuesta', async () => {
    respuestas = [{ status: 200, body: { data: [], total: 0 } }]
    render(<VisitasTab propertyId={PROP} mostrarAsesor />)
    expect(await screen.findByText('Todavía no hay visitas en esta propiedad.')).toBeInTheDocument()
    expect(screen.getByText('Sin datos — llega con la encuesta')).toBeInTheDocument()
  })
  it('si falla: el mensaje real y "Reintentar"', async () => {
    respuestas = [{ status: 500, body: { error: 'No pudimos cargar las visitas' } }, { status: 200, body: { data: [], total: 0 } }]
    render(<VisitasTab propertyId={PROP} mostrarAsesor />)
    expect(await screen.findByText('No pudimos cargar las visitas')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(screen.getByText('Todavía no hay visitas en esta propiedad.')).toBeInTheDocument())
  })
})
```

- [ ] **Paso 2: Correr y ver FALLAR.**

- [ ] **Paso 3: Implementar.** En `lib/properties/detail-view.ts`:

```ts
export type TabKey = 'propiedad' | 'multimedia' | 'documentacion' | 'difusion' | 'visitas' | 'historial'

export const TAB_LABELS: Record<TabKey, string> = {
  propiedad: 'Propiedad',
  multimedia: 'Multimedia',
  documentacion: 'Documentación',
  difusion: 'Difusión',
  visitas: 'Visitas',
  historial: 'Historial',
}
```

  y en `visibleTabs`, después de la línea de `difusion`:

```ts
  // Visitas (spec §3.5): solo propiedades captadas y nunca el abogado (no ve visitas).
  if (!isAbogado && input.status === 'approved') tabs.push('visitas')
```

  En `lib/visitas/resumen.ts`, al final:

```ts
/** Pestaña de la ficha (spec §3.5): próximas (de hoy en adelante) y pasadas, cada una con su estado. */
export function separarProximasYPasadas(
  visitas: readonly VisitaListado[],
  ahora: Date,
): { proximas: VisitaListado[]; pasadas: VisitaListado[] } {
  const t = ahora.getTime()
  return {
    proximas: visitas.filter(v => Date.parse(v.scheduled_at) >= t).sort(porHorario),
    pasadas: visitas.filter(v => Date.parse(v.scheduled_at) < t).sort((a, b) => porHorario(b, a)),
  }
}
```

  Crear `components/properties/detail/tabs/VisitasTab.tsx`:

```tsx
'use client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { FilaVisita } from '@/components/visitas/seccion/FilaVisita'
import { leerRespuesta } from '@/components/visitas/agendar/leer-respuesta'
import { separarProximasYPasadas } from '@/lib/visitas/resumen'
import { TEXTO_LLEGA_CON_LA_ENCUESTA } from '@/lib/visitas/presentacion'
import type { VisitaListado } from '@/lib/visitas/tipos'

export const MAX_VISITAS_PESTANA = 200

type Estado = { tipo: 'cargando' } | { tipo: 'error'; mensaje: string } | { tipo: 'listo'; visitas: VisitaListado[] }

/**
 * Pestaña "Visitas" de la ficha de la propiedad (spec §3.5). Lee GET /api/visits con el
 * filtro de la propiedad: el alcance por rol lo aplica la ruta (un asesor ve las suyas).
 * "Qué opinan los que visitaron" llega con la encuesta (Entrega 3).
 */
export function VisitasTab({ propertyId, mostrarAsesor }: { propertyId: string; mostrarAsesor: boolean }) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'cargando' })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vigente = true
    setEstado({ tipo: 'cargando' })
    fetch(`/api/visits?propiedad=${encodeURIComponent(propertyId)}&porPagina=${MAX_VISITAS_PESTANA}`)
      .then(r => leerRespuesta<VisitaListado[]>(r))
      .then(r => {
        if (!vigente) return
        setEstado(r.ok ? { tipo: 'listo', visitas: r.data ?? [] } : { tipo: 'error', mensaje: r.error })
      })
      .catch(() => { if (vigente) setEstado({ tipo: 'error', mensaje: 'No hay conexión. Probá de nuevo.' }) })
    return () => { vigente = false }
  }, [propertyId, intento])

  return (
    <div className="space-y-6">
      <div>
        <p className="eyebrow">Compradores</p>
        <h2 className="display mt-1 text-xl">Visitas</h2>
      </div>

      {estado.tipo === 'cargando' && <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}
      {estado.tipo === 'error' && (
        <div role="alert" className="flex flex-wrap items-center gap-3 text-sm">
          <span>{estado.mensaje}</span>
          <Button type="button" variant="outline" className="min-h-11" onClick={() => setIntento(n => n + 1)}>Reintentar</Button>
        </div>
      )}
      {estado.tipo === 'listo' && <Listas visitas={estado.visitas} mostrarAsesor={mostrarAsesor} />}

      <section aria-labelledby="opinan-propiedad" className="space-y-2 rounded-xl border bg-card p-4">
        <h3 id="opinan-propiedad" className="text-base font-semibold">Qué opinan los que visitaron</h3>
        <p className="text-sm text-muted-foreground">{TEXTO_LLEGA_CON_LA_ENCUESTA}</p>
      </section>
    </div>
  )
}

function Listas({ visitas, mostrarAsesor }: { visitas: VisitaListado[]; mostrarAsesor: boolean }) {
  if (visitas.length === 0) return <p className="text-sm text-muted-foreground">Todavía no hay visitas en esta propiedad.</p>
  const { proximas, pasadas } = separarProximasYPasadas(visitas, new Date())
  return (
    <>
      {[{ titulo: 'Próximas', lista: proximas }, { titulo: 'Pasadas', lista: pasadas }].map(({ titulo, lista }) => (
        <section key={titulo} aria-labelledby={`visitas-${titulo}`} className="space-y-2">
          <h3 id={`visitas-${titulo}`} className="text-base font-semibold">{titulo} ({lista.length})</h3>
          {lista.length === 0
            ? <p className="text-sm text-muted-foreground">Ninguna.</p>
            : <ul className="space-y-2">{lista.map(v => <FilaVisita key={v.id} visita={v} mostrarAsesor={mostrarAsesor} mostrarPropiedad={false} />)}</ul>}
        </section>
      ))}
      {visitas.length >= MAX_VISITAS_PESTANA && (
        <p className="text-sm text-muted-foreground">Se muestran las {MAX_VISITAS_PESTANA} más recientes. Las demás están en Visitas → Ver todas.</p>
      )}
    </>
  )
}
```

  (`Listas` es un componente de MÓDULO, no declarado dentro de `VisitasTab`: ver CLAUDE.md
  § "NUNCA declarar un componente dentro de otro".)

  En `app/(dashboard)/properties/[id]/page.tsx`:
  - import: `import { VisitasTab } from '@/components/properties/detail/tabs/VisitasTab'`; cambiar
    `import { HistoryTab, type VisitFeedback } from …` por `import { HistoryTab } from …`; sumar
    `puedeVerTodasLasVisitas` al import existente de `@/lib/visitas/acceso`.
  - borrar `const [feedback, setFeedback] = useState<VisitFeedback[]>([])` y el `useEffect` que
    pide `/api/properties/${id}/feedback`.
  - sumar `const [recargaVisitas, setRecargaVisitas] = useState(0)` junto a los otros `useState`.
  - `{puedeAgendarVisita && <BotonAgendarVisita propiedadId={property.id} />}` →
    `{puedeAgendarVisita && <BotonAgendarVisita propiedadId={property.id} onAgendada={() => setRecargaVisitas(n => n + 1)} />}`
  - antes del bloque `{tab === 'historial' && …}` sumar:

```tsx
        {tab === 'visitas' && (
          <VisitasTab
            key={recargaVisitas}
            propertyId={property.id}
            mostrarAsesor={!!userInfo && puedeVerTodasLasVisitas(userInfo.role)}
          />
        )}
```

  - `<HistoryTab propertyId={property.id} flowHistory={flowHistory} feedback={feedback} />` →
    `<HistoryTab propertyId={property.id} flowHistory={flowHistory} />`

  En `components/properties/detail/tabs/HistoryTab.tsx`: borrar la interfaz `VisitFeedback`, la prop
  `feedback`, el bloque `{feedback.length > 0 && (…)}` y los imports que queden sin uso (`Card…`,
  `Badge`). Comentario arriba del componente: `// "Feedback de visitas" se mudó a la pestaña Visitas (spec §3.5).`

  En `scripts/property-detail-tabs.probe.tsx:65`: `<HistoryTab propertyId="p1" flowHistory={null} />`.

  En `page.test.tsx` y `page.legal.test.tsx` (ficha de propiedad): borrar la línea
  `if (url.startsWith('/api/properties/prop-1/feedback')) return json({ data: [] })` de cada uno.

  Borrar la ruta: `grep -rn "/feedback" app components lib scripts --include='*.ts' --include='*.tsx'`
  no tiene que listar nada más que lo ya editado; después `git rm "app/api/properties/[id]/feedback/route.ts"`.

- [ ] **Paso 4: Correr y ver PASAR** — suite completa (incluye `detail-view`, las dos pruebas de la
  ficha de propiedad y `VisitasTab`), `npx tsc --noEmit -p tsconfig.visitas.json`, y la sonda:
  `node --import tsx scripts/property-detail-tabs.probe.tsx` (tiene que terminar sin error).
- [ ] **Paso 5: Commit** — `git add lib/properties/detail-view.ts lib/properties/detail-view.test.ts lib/visitas/resumen.ts lib/visitas/resumen.test.ts components/properties/detail/tabs/VisitasTab.tsx components/properties/detail/tabs/VisitasTab.test.tsx components/properties/detail/tabs/HistoryTab.tsx "app/(dashboard)/properties/[id]/page.tsx" "app/(dashboard)/properties/[id]/page.test.tsx" "app/(dashboard)/properties/[id]/page.legal.test.tsx" scripts/property-detail-tabs.probe.tsx`
  y commit `feat(visitas): pestaña Visitas en la ficha de la propiedad (reemplaza "Feedback de visitas")`.

---
### Tarea 14: Recordatorio "¿se realizó?" — regla, datos y email

**Files:**
- Modify: `lib/visitas/tipos.ts` (suma `VisitaParaRecordar`)
- Create: `lib/visitas/recordatorio.ts`, Test: `lib/visitas/recordatorio.test.ts`
- Modify: `lib/visitas/datos.ts` (suma `visitasParaRecordar`, `reservarRecordatorio`, `liberarRecordatorio`)
- Test: `lib/visitas/datos-recordatorio.test.ts`
- Modify (reemplazo completo): `lib/email/notifications/visit-reminder-advisor.ts`
- Test: `lib/email/notifications/visit-reminder-advisor.test.ts`
- Modify: `emails/VisitReminderAdvisorEmail.tsx` (textos)

**Interfaces:**
- Produces (Tarea 15):
  - `interface VisitaParaRecordar { id: string; scheduled_at: string; status: EstadoVisita; reminder_sent_at: string | null; client_name: string; direccion: string | null; asesor: { nombre: string; email: string | null } | null }`
  - `RECORDATORIO_GRACIA_MS = 3_600_000`, `RECORDATORIO_VENTANA_MS = 172_800_000`
  - `ventanaDeRecordatorio(ahora: Date): { desde: string; hasta: string }`
  - `type MotivoSinRecordatorio = 'ya_enviado' | 'no_esta_confirmada' | 'fuera_de_ventana' | 'sin_asesor' | 'asesor_sin_email'`
  - `decidirRecordatorio(v: VisitaParaRecordar, ahora: Date): { enviar: true; destino: { nombre: string; email: string } } | { enviar: false; motivo: MotivoSinRecordatorio }`
  - `datos.visitasParaRecordar(ventana: { desde: string; hasta: string }): Promise<VisitaParaRecordar[]>`
  - `datos.reservarRecordatorio(id: string, ahora: Date): Promise<string | null>` (la marca escrita, o `null` si otra corrida ya la tomó)
  - `datos.liberarRecordatorio(id: string, marca: string): Promise<void>`
  - `enviarRecordatorioDeVisita(d: { visitaId: string; scheduledAt: string; cliente: string; direccion: string | null; asesor: { nombre: string; email: string } }): Promise<SendEmailResult>`

**Qué hace hoy y por qué se rehace (leído al escribir el plan):** `sendReminderForVisit` leía con la
sesión del usuario (en un cron no hay sesión: la RLS devuelve vacío y no manda nada), formateaba la
hora con `toLocaleString('es-AR')` SIN zona (en el servidor sale corrida 3 h), linkeaba a
`https://app.inmodf.com.ar` por defecto (el dominio de la plataforma es `inmodf.com.ar`), mandaba
con `idempotent: true` por visita (si la visita se reprograma, el trigger vuelve `reminder_sent_at`
a NULL pero Resend la saltearía igual) e ignoraba el resultado de `sendEmail` (que nunca lanza).

**La regla (decisión de esta entrega, escrita en el código):** se avisa por una visita
**confirmada** (`scheduled`) que **pasó hace entre 1 h y 48 h**, sin resultado y sin aviso previo, a
su asesor si tiene email.
- **1 h de gracia:** el asesor suele marcarla él mismo al salir de la visita; avisar en el minuto 0
  es ruido.
- **48 h de ventana — y la PRIMERA corrida:** en la base hay visitas viejas pasadas sin resultado.
  Sin techo, la primera corrida le mandaría a cada asesor una ráfaga de avisos de visitas de hace
  semanas. Con la ventana, la primera corrida solo avisa las de los dos últimos días; las más viejas
  ya están en "Requieren tu acción" de `/visits` y de `/tasks`. 48 h (y no 24) cubren un fin de
  semana largo y una corrida caída.
- **Solo `scheduled`:** una `pending_confirmation` la propuso el cliente y nadie la confirmó;
  preguntar "¿se realizó?" por una cita que no existe confunde. Igual aparece en "Requieren tu acción".
- **Una sola vez:** la ruta RESERVA la visita (`UPDATE … SET reminder_sent_at = <marca> WHERE id = …
  AND reminder_sent_at IS NULL AND status = 'scheduled'`, atómico) y recién después manda. Si el
  email falla, la LIBERA (vuelve a NULL solo si sigue teniendo SU marca) y la próxima hora reintenta.
  Si la visita se reprograma, el trigger BEFORE (`20261010000002`) ya vuelve `reminder_sent_at` a
  NULL: el aviso aplica a la fecha nueva.
- **Efecto lateral conocido:** escribir `reminder_sent_at` cambia `updated_at` (la versión). Si el
  asesor tenía la ficha de esa visita abierta justo cuando corrió el cron, su próxima acción da 409
  "La visita cambió mientras la editabas" con el botón "Recargar". Aceptado: pasa como mucho una vez
  por visita y la pantalla ya lo resuelve.

- [ ] **Paso 1: Tipo** — sumar al final de `lib/visitas/tipos.ts`:

```ts
/** Lo que necesita el recordatorio "¿se realizó?" (lib/visitas/recordatorio.ts + cron). */
export interface VisitaParaRecordar {
  id: string
  scheduled_at: string
  status: EstadoVisita
  reminder_sent_at: string | null
  client_name: string
  direccion: string | null
  asesor: { nombre: string; email: string | null } | null
}
```

- [ ] **Paso 2: Tests** — `lib/visitas/recordatorio.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ventanaDeRecordatorio, decidirRecordatorio } from './recordatorio'
import type { VisitaParaRecordar } from './tipos'

const AHORA = new Date('2026-10-15T15:00:00.000Z')
const visita = (cambios: Partial<VisitaParaRecordar> = {}): VisitaParaRecordar => ({
  id: '66666666-6666-4666-8666-666666666666', scheduled_at: '2026-10-15T12:00:00.000Z', status: 'scheduled',
  reminder_sent_at: null, client_name: 'Sofía', direccion: 'Doblas 248',
  asesor: { nombre: 'Lucas', email: 'lucas@inmodf.com.ar' }, ...cambios,
})

describe('ventanaDeRecordatorio', () => {
  it('de hace 48 h a hace 1 h', () => {
    expect(ventanaDeRecordatorio(AHORA)).toEqual({ desde: '2026-10-13T15:00:00.000Z', hasta: '2026-10-15T14:00:00.000Z' })
  })
})

describe('decidirRecordatorio', () => {
  it('confirmada, pasó hace 3 h, sin aviso y con asesor con email: se avisa', () => {
    expect(decidirRecordatorio(visita(), AHORA)).toEqual({ enviar: true, destino: { nombre: 'Lucas', email: 'lucas@inmodf.com.ar' } })
  })
  it('PRIMERA CORRIDA: una visita de hace 5 días no dispara nada (fuera de la ventana)', () => {
    expect(decidirRecordatorio(visita({ scheduled_at: '2026-10-10T12:00:00.000Z' }), AHORA)).toEqual({ enviar: false, motivo: 'fuera_de_ventana' })
  })
  it('dentro de la hora de gracia todavía no', () => {
    expect(decidirRecordatorio(visita({ scheduled_at: '2026-10-15T14:30:00.000Z' }), AHORA)).toEqual({ enviar: false, motivo: 'fuera_de_ventana' })
  })
  it('ya avisada, no confirmada, sin asesor o sin email: no se manda, con el motivo', () => {
    expect(decidirRecordatorio(visita({ reminder_sent_at: '2026-10-15T13:05:00Z' }), AHORA)).toEqual({ enviar: false, motivo: 'ya_enviado' })
    expect(decidirRecordatorio(visita({ status: 'pending_confirmation' }), AHORA)).toEqual({ enviar: false, motivo: 'no_esta_confirmada' })
    expect(decidirRecordatorio(visita({ status: 'completed' }), AHORA)).toEqual({ enviar: false, motivo: 'no_esta_confirmada' })
    expect(decidirRecordatorio(visita({ asesor: null }), AHORA)).toEqual({ enviar: false, motivo: 'sin_asesor' })
    expect(decidirRecordatorio(visita({ asesor: { nombre: 'Lucas', email: '  ' } }), AHORA)).toEqual({ enviar: false, motivo: 'asesor_sin_email' })
  })
  it('un asesor sin nombre recibe igual el aviso', () => {
    const d = decidirRecordatorio(visita({ asesor: { nombre: '', email: 'x@inmodf.com.ar' } }), AHORA)
    expect(d).toEqual({ enviar: true, destino: { nombre: 'equipo', email: 'x@inmodf.com.ar' } })
  })
})
```

  `lib/visitas/datos-recordatorio.test.ts` (mismo cliente falso que graba cadenas de
  `datos-listado.test.ts`; copiar el bloque `vi.hoisted` + `vi.mock('@supabase/supabase-js', …)` +
  `beforeEach` con `vi.stubEnv` de ese archivo, y después):

```ts
import { visitasParaRecordar, reservarRecordatorio, liberarRecordatorio } from './datos'

const ID = '66666666-6666-4666-8666-666666666666'
const pasos = (l: Llamada, metodo: string) => l.pasos.filter(p => p.metodo === metodo).map(p => p.args)

describe('datos del recordatorio', () => {
  it('lee solo confirmadas, sin aviso, dentro de la ventana, y aplana asesor y dirección', async () => {
    registro.responder = () => ({ data: [{ id: ID, scheduled_at: '2026-10-15T12:00:00+00:00', status: 'scheduled', reminder_sent_at: null,
      client_name: 'Sofía', property: { address: 'Doblas 248' }, advisor: { full_name: 'Lucas', email: 'lucas@inmodf.com.ar' } }], error: null })
    const r = await visitasParaRecordar({ desde: 'D', hasta: 'H' })
    const l = registro.llamadas[0]
    expect(pasos(l, 'eq')).toEqual([['status', 'scheduled']])
    expect(pasos(l, 'is')).toEqual([['reminder_sent_at', null]])
    expect(pasos(l, 'gte')).toEqual([['scheduled_at', 'D']])
    expect(pasos(l, 'lte')).toEqual([['scheduled_at', 'H']])
    expect(r).toEqual([{ id: ID, scheduled_at: '2026-10-15T12:00:00+00:00', status: 'scheduled', reminder_sent_at: null,
      client_name: 'Sofía', direccion: 'Doblas 248', asesor: { nombre: 'Lucas', email: 'lucas@inmodf.com.ar' } }])
  })
  it('reservar es atómico: solo si sigue sin aviso y confirmada; devuelve la marca o null', async () => {
    registro.responder = () => ({ data: { id: ID }, error: null })
    const marca = await reservarRecordatorio(ID, new Date('2026-10-15T15:00:00.000Z'))
    expect(marca).toBe('2026-10-15T15:00:00.000Z')
    const l = registro.llamadas[0]
    expect(pasos(l, 'update')).toEqual([[{ reminder_sent_at: '2026-10-15T15:00:00.000Z' }]])
    expect(pasos(l, 'eq')).toEqual([['id', ID], ['status', 'scheduled']])
    expect(pasos(l, 'is')).toEqual([['reminder_sent_at', null]])
    registro.responder = () => ({ data: null, error: null })
    expect(await reservarRecordatorio(ID, new Date())).toBeNull()
  })
  it('liberar solo borra SU marca (otra corrida pudo haber escrito otra)', async () => {
    await liberarRecordatorio(ID, '2026-10-15T15:00:00.000Z')
    const l = registro.llamadas[0]
    expect(pasos(l, 'update')).toEqual([[{ reminder_sent_at: null }]])
    expect(pasos(l, 'eq')).toEqual([['id', ID], ['reminder_sent_at', '2026-10-15T15:00:00.000Z']])
  })
})
```

  `lib/email/notifications/visit-reminder-advisor.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { enviados, resultado } = vi.hoisted(() => ({
  enviados: [] as Array<Record<string, unknown>>,
  resultado: { ok: true, sent: 1, skipped: 0, failed: 0, errors: [] as string[] },
}))
vi.mock('@/lib/email/resend-client', () => ({
  sendEmail: vi.fn(async (input: Record<string, unknown>) => { enviados.push(input); return resultado }),
}))
// El componente del email devuelve sus props: así la prueba ve exactamente qué se le pasó.
vi.mock('@/emails/VisitReminderAdvisorEmail', () => ({ default: (p: unknown) => p }))
vi.mock('@/lib/email/render', () => ({ renderEmail: vi.fn(async (p: unknown) => JSON.stringify(p)) }))

import { enviarRecordatorioDeVisita } from './visit-reminder-advisor'

const datos = {
  visitaId: '66666666-6666-4666-8666-666666666666', scheduledAt: '2099-01-12T14:00:00Z', cliente: 'Sofía Benítez',
  direccion: 'Doblas 248', asesor: { nombre: 'Lucas', email: 'lucas@inmodf.com.ar' },
}

beforeEach(() => { enviados.length = 0; vi.unstubAllEnvs() })

describe('enviarRecordatorioDeVisita', () => {
  it('hora ARGENTINA, link a la ficha en inmodf.com.ar, asunto con la dirección', async () => {
    const r = await enviarRecordatorioDeVisita(datos)
    expect(r).toEqual(resultado)
    const e = enviados[0]
    expect(e).toMatchObject({ notificationType: 'visit_reminder_advisor', entityId: datos.visitaId, to: 'lucas@inmodf.com.ar',
      subject: '¿Se realizó la visita? Doblas 248', idempotent: false })
    const props = JSON.parse(String(e.html))
    expect(props).toEqual({ advisorName: 'Lucas', propertyAddress: 'Doblas 248', clientName: 'Sofía Benítez',
      scheduledAt: 'lunes 12 de enero, 11:00', visitUrl: `https://inmodf.com.ar/visits/${datos.visitaId}` })
  })
  it('respeta NEXT_PUBLIC_APP_URL (sin barra final)', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://deploy-preview-50--inmobiliariadiegoferreyra.netlify.app/')
    await enviarRecordatorioDeVisita(datos)
    expect(JSON.parse(String(enviados[0].html)).visitUrl).toBe(`https://deploy-preview-50--inmobiliariadiegoferreyra.netlify.app/visits/${datos.visitaId}`)
  })
  it('sin dirección no queda un asunto cortado', async () => {
    await enviarRecordatorioDeVisita({ ...datos, direccion: null })
    expect(enviados[0].subject).toBe('¿Se realizó la visita? la propiedad')
  })
})
```

- [ ] **Paso 3: Correr y ver FALLAR.**

- [ ] **Paso 4: Implementar `lib/visitas/recordatorio.ts`**

```ts
/**
 * Recordatorio "¿se realizó?" al asesor (spec §4.7). Puro: decide; la ruta del cron
 * reserva, manda y registra. La regla y el porqué de cada número están en el plan de la
 * Entrega 2 (Tarea 14); lo esencial:
 *  - 1 h de gracia después del horario (el asesor suele marcarla él);
 *  - 48 h de ventana: la PRIMERA corrida no le manda a nadie una ráfaga de avisos de
 *    visitas viejas (esas ya están en "Requieren tu acción");
 *  - solo visitas confirmadas (`scheduled`): una propuesta sin confirmar no es una cita.
 */
import type { VisitaParaRecordar } from './tipos'

export const RECORDATORIO_GRACIA_MS = 60 * 60 * 1000
export const RECORDATORIO_VENTANA_MS = 48 * 60 * 60 * 1000

export function ventanaDeRecordatorio(ahora: Date): { desde: string; hasta: string } {
  return {
    desde: new Date(ahora.getTime() - RECORDATORIO_VENTANA_MS).toISOString(),
    hasta: new Date(ahora.getTime() - RECORDATORIO_GRACIA_MS).toISOString(),
  }
}

export type MotivoSinRecordatorio = 'ya_enviado' | 'no_esta_confirmada' | 'fuera_de_ventana' | 'sin_asesor' | 'asesor_sin_email'

export type DecisionRecordatorio =
  | { enviar: true; destino: { nombre: string; email: string } }
  | { enviar: false; motivo: MotivoSinRecordatorio }

export function decidirRecordatorio(v: VisitaParaRecordar, ahora: Date): DecisionRecordatorio {
  if (v.reminder_sent_at) return { enviar: false, motivo: 'ya_enviado' }
  if (v.status !== 'scheduled') return { enviar: false, motivo: 'no_esta_confirmada' }
  const cuando = Date.parse(v.scheduled_at)
  const { desde, hasta } = ventanaDeRecordatorio(ahora)
  if (cuando < Date.parse(desde) || cuando > Date.parse(hasta)) return { enviar: false, motivo: 'fuera_de_ventana' }
  if (!v.asesor) return { enviar: false, motivo: 'sin_asesor' }
  const email = v.asesor.email?.trim()
  if (!email) return { enviar: false, motivo: 'asesor_sin_email' }
  return { enviar: true, destino: { nombre: v.asesor.nombre.trim() || 'equipo', email } }
}
```

- [ ] **Paso 5: Implementar en `lib/visitas/datos.ts`** (sumar `VisitaParaRecordar` al import de
  `./tipos`) — al final:

```ts
// ───────────────────────── Recordatorio "¿se realizó?" (Entrega 2) ─────────────────────────

/** Confirmadas, sin aviso, con horario dentro de la ventana. 200 por corrida alcanza y sobra (cada hora). */
export async function visitasParaRecordar(ventana: { desde: string; hasta: string }): Promise<VisitaParaRecordar[]> {
  const { data, error } = await sb().from('property_visits')
    .select(`id, scheduled_at, status, reminder_sent_at, client_name,
      property:properties(address),
      advisor:profiles!property_visits_advisor_id_fkey(full_name, email)`)
    .eq('status', 'scheduled')
    .is('reminder_sent_at', null)
    .gte('scheduled_at', ventana.desde)
    .lte('scheduled_at', ventana.hasta)
    .order('scheduled_at', { ascending: true })
    .limit(200)
  if (error) fallo('visitas para recordar', error)
  return ((data ?? []) as Record<string, unknown>[]).map(r => {
    if (!esEstadoVisita(r.status)) throw new Error(`visitas para recordar: estado desconocido "${String(r.status)}"`)
    const p = uno(r.property as { address?: unknown } | null)
    const a = uno(r.advisor as { full_name?: unknown; email?: unknown } | null)
    return {
      id: String(r.id),
      scheduled_at: String(r.scheduled_at),
      status: r.status,
      reminder_sent_at: textoONulo(r.reminder_sent_at),
      client_name: String(r.client_name ?? ''),
      direccion: textoONulo(p?.address),
      asesor: a ? { nombre: textoONulo(a.full_name) ?? '', email: textoONulo(a.email) } : null,
    }
  })
}

/**
 * Reserva ATÓMICA: escribe la marca solo si nadie la escribió antes y la visita sigue
 * confirmada. Devuelve la marca (para poder liberarla) o `null` si otra corrida ganó.
 * No toca status/scheduled_at/advisor_id: no deja evento en el historial.
 */
export async function reservarRecordatorio(id: string, ahora: Date): Promise<string | null> {
  const marca = ahora.toISOString()
  const { data, error } = await sb().from('property_visits')
    .update({ reminder_sent_at: marca })
    .eq('id', id).is('reminder_sent_at', null).eq('status', 'scheduled')
    .select('id').maybeSingle()
  if (error) fallo('reservar recordatorio', error)
  return data ? marca : null
}

/** El email no salió: se devuelve la visita a "sin aviso" para que la próxima hora reintente. Solo si sigue con SU marca. */
export async function liberarRecordatorio(id: string, marca: string): Promise<void> {
  const { error } = await sb().from('property_visits')
    .update({ reminder_sent_at: null })
    .eq('id', id).eq('reminder_sent_at', marca)
  if (error) fallo('liberar recordatorio', error)
}
```

  (`textoONulo`, `uno` y `esEstadoVisita` ya están en el archivo desde la Tarea 6.)

- [ ] **Paso 6: Reescribir `lib/email/notifications/visit-reminder-advisor.ts`**

```ts
import 'server-only'
import { sendEmail, type SendEmailResult } from '@/lib/email/resend-client'
import { renderEmail } from '@/lib/email/render'
import { formatearFechaLarga } from '@/lib/visitas/horario'
import VisitReminderAdvisorEmail from '@/emails/VisitReminderAdvisorEmail'

/**
 * Email "¿Se realizó la visita?" al asesor (spec §4.7). No lee la base: los datos los trae
 * la ruta del cron (con clave de servicio). Devuelve el resultado de `sendEmail`, que
 * NUNCA lanza: quien llama tiene que mirar `ok`/`failed`/`sent` (CLAUDE.md § cola durable:
 * un `ok:false` con `failed:0` es "falta RESEND_API_KEY" y también es un fallo).
 *
 * `idempotent: false` a propósito: si la visita se reprograma, el trigger vuelve
 * `reminder_sent_at` a NULL y el aviso tiene que poder salir de nuevo por la MISMA visita.
 * El "una sola vez" lo garantiza la reserva atómica de `reminder_sent_at` en la ruta.
 * `entityType: 'property'` es el que ya usaba este aviso (el log no tiene tipo "visita").
 */
function urlDeLaApp(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar').replace(/\/+$/, '')
}

export interface DatosRecordatorio {
  visitaId: string
  scheduledAt: string
  cliente: string
  direccion: string | null
  asesor: { nombre: string; email: string }
}

export async function enviarRecordatorioDeVisita(d: DatosRecordatorio): Promise<SendEmailResult> {
  const direccion = d.direccion?.trim() || 'la propiedad'
  const html = await renderEmail(VisitReminderAdvisorEmail({
    advisorName: d.asesor.nombre,
    propertyAddress: direccion,
    clientName: d.cliente.trim() || 'la persona',
    scheduledAt: formatearFechaLarga(d.scheduledAt),
    visitUrl: `${urlDeLaApp()}/visits/${d.visitaId}`,
  }))
  return sendEmail({
    notificationType: 'visit_reminder_advisor',
    entityType: 'property',
    entityId: d.visitaId,
    to: d.asesor.email,
    subject: `¿Se realizó la visita? ${direccion}`,
    html,
    idempotent: false,
  })
}
```

  Antes de reemplazar: `grep -rn "sendReminderForVisit" app lib netlify scripts` → solo
  `app/api/cron/visit-reminders/route.ts` (se reescribe en la Tarea 15). Hasta esa tarea la ruta
  vieja no compila: hacer la Tarea 15 enseguida (o, si se commitea en el medio, dejar la Tarea 14 y
  la 15 en el mismo commit; ver Paso 9).

- [ ] **Paso 7: Textos del email** — en `emails/VisitReminderAdvisorEmail.tsx` reemplazar el
  contenido del `<Container>` entre `<Heading>` y la `<Section>` del botón por:

```tsx
          <Heading style={{ fontSize: 20 }}>¿Se realizó la visita?</Heading>
          <Text>Hola {p.advisorName},</Text>
          <Text>
            La visita de {p.clientName} a {p.propertyAddress} era el {p.scheduledAt} y todavía no tiene resultado.
            Contanos cómo salió: tocá el botón y elegí “Se realizó” o “No se realizó”.
          </Text>
          <Section style={{ backgroundColor: '#f0f4f8', padding: 16, borderRadius: 6 }}>
            <Text style={{ margin: 0, fontWeight: 600 }}>{p.propertyAddress}</Text>
            <Text style={{ margin: '4px 0 0' }}>Persona: {p.clientName}</Text>
            <Text style={{ margin: '4px 0 0' }}>Fecha: {p.scheduledAt}</Text>
          </Section>
```

  y el texto final (debajo del `<Hr />`) por
  `<Text style={{ color: '#888', fontSize: 12 }}>Si la visita se movió, reprogramala desde la misma ficha. Diego Ferreyra Inmobiliaria</Text>`.
  El `<Preview>` pasa a `¿Se realizó la visita de {p.clientName} en {p.propertyAddress}?`.
  Verificación del render (no de la lógica): `node --import tsx -e "import('./emails/VisitReminderAdvisorEmail.tsx').then(async m => { const { renderToStaticMarkup } = await import('react-dom/server'); console.log(renderToStaticMarkup(m.default({ advisorName: 'Lucas', propertyAddress: 'Doblas 248', clientName: '[TEST] Sofía', scheduledAt: 'lunes 12 de enero, 11:00', visitUrl: 'https://inmodf.com.ar/visits/x' })).includes('¿Se realizó la visita?')) })"` → `true`.

- [ ] **Paso 8: Correr y ver PASAR** — las tres pruebas nuevas.
- [ ] **Paso 9: Commit** — se commitea JUNTO con la Tarea 15 (la ruta vieja importa
  `sendReminderForVisit`, que deja de existir): no commitear todavía; seguir con la Tarea 15.

---

### Tarea 15: Ruta del cron, migración de pg_cron, script y adiós a la función de Netlify

**Files:**
- Modify (reemplazo completo): `app/api/cron/visit-reminders/route.ts`
- Test: `app/api/cron/visit-reminders/route.test.ts`
- Create: `supabase/migrations/20261015000001_cron_visit_reminders.sql`
- Create: `scripts/apply-cron-visit-reminders-pg.ts`
- Delete: `netlify/functions/visit-reminders.ts`

**Interfaces:**
- Consumes: Tarea 14.
- Produces: `POST|GET /api/cron/visit-reminders` (`x-cron-secret` = env `CRON_SECRET` o
  `cron_config('visit_reminders')`; `?ping=1` sin auth) →
  `200 { ok: true, ventana, revisadas, enviadas, fallidas, salteadas: [{ id, motivo }], pendientesPorTiempo, motivo?, firedAt }`
  · `403 { error: 'forbidden' }` · `500 { ok: false, error, … }`. `PRESUPUESTO_MS = 15_000`.
  Job `visit-reminders` en pg_cron, `'5 * * * *'` (cada hora, al minuto 5).

**Numeración de la migración:** el último prefijo del directorio es `20261010000003`; no existe
ningún `20261015…` (mirado al escribir el plan; volver a mirar antes de crear: ya hubo un prefijo
duplicado por sesiones en paralelo).

- [ ] **Paso 1: Escribir el test** — `app/api/cron/visit-reminders/route.test.ts`:

```ts
/**
 * Puerta y comportamiento del recordatorio "¿se realizó?": auth DUAL (validar contra un
 * solo secreto deja el job en 403 en silencio para siempre), una sola vez por visita,
 * un fallo de email libera la reserva, y la corrida SIEMPRE dice qué hizo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { VisitaParaRecordar } from '@/lib/visitas/tipos'

const estado = vi.hoisted(() => ({
  secretoEnLaBase: 'secreto-de-la-base' as string | null,
  visitas: [] as VisitaParaRecordar[],
  reservas: new Map<string, string | null>(),
  resultadoEmail: { ok: true, sent: 1, skipped: 0, failed: 0, errors: [] as string[] },
  enviados: [] as string[],
  liberadas: [] as Array<[string, string]>,
  falla: null as Error | null,
}))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({
      maybeSingle: async () => (estado.secretoEnLaBase === null ? { data: null, error: null } : { data: { value: estado.secretoEnLaBase }, error: null }),
    }) }) }),
  }),
}))
vi.mock('@/lib/visitas/datos', () => ({
  visitasParaRecordar: async () => { if (estado.falla) throw estado.falla; return estado.visitas },
  reservarRecordatorio: async (id: string, ahora: Date) => (estado.reservas.has(id) ? estado.reservas.get(id) ?? null : ahora.toISOString()),
  liberarRecordatorio: async (id: string, marca: string) => { estado.liberadas.push([id, marca]) },
}))
vi.mock('@/lib/email/notifications/visit-reminder-advisor', () => ({
  enviarRecordatorioDeVisita: async (d: { visitaId: string }) => { estado.enviados.push(d.visitaId); return estado.resultadoEmail },
}))

import { POST, GET } from './route'

const AHORA = new Date('2026-10-15T15:00:00.000Z')
const visita = (id: string, cambios: Partial<VisitaParaRecordar> = {}): VisitaParaRecordar => ({
  id, scheduled_at: '2026-10-15T12:00:00.000Z', status: 'scheduled', reminder_sent_at: null, client_name: 'Sofía',
  direccion: 'Doblas 248', asesor: { nombre: 'Lucas', email: 'lucas@inmodf.com.ar' }, ...cambios,
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pedido = (secreto?: string, url = 'https://app.test/api/cron/visit-reminders') => new Request(url, { method: 'POST', headers: secreto ? { 'x-cron-secret': secreto } : {} }) as any

beforeEach(() => {
  estado.secretoEnLaBase = 'secreto-de-la-base'
  estado.visitas = []; estado.reservas = new Map(); estado.enviados = []; estado.liberadas = []; estado.falla = null
  estado.resultadoEmail = { ok: true, sent: 1, skipped: 0, failed: 0, errors: [] }
  delete process.env.CRON_SECRET
  // Sin estas dos, `autorizado` ni intenta leer cron_config (la ruta no adivina credenciales).
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://falso.supabase.co')
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'clave-falsa')
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AHORA)
})
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs() })

describe('cron del recordatorio "¿se realizó?"', () => {
  it('ping responde sin auth y sin leer nada', async () => {
    const r = await GET(pedido(undefined, 'https://app.test/api/cron/visit-reminders?ping=1'))
    expect(await r.json()).toEqual({ ok: true, route: 'visit-reminders', auth: 'db+env' })
  })
  it('sin secreto, o con el marcador del repo: 403', async () => {
    expect((await POST(pedido())).status).toBe(403)
    estado.secretoEnLaBase = '__SECRETO__'
    expect((await POST(pedido('__SECRETO__'))).status).toBe(403)
  })
  it('acepta el de la variable de entorno y el de cron_config', async () => {
    process.env.CRON_SECRET = 'secreto-de-netlify'
    expect((await POST(pedido('secreto-de-netlify'))).status).toBe(200)
    expect((await POST(pedido('secreto-de-la-base'))).status).toBe(200)
  })
  it('manda a las que corresponden, saltea las demás con su motivo, y lo dice', async () => {
    estado.visitas = [visita('a'), visita('b', { asesor: null })]
    const r = await POST(pedido('secreto-de-la-base'))
    const cuerpo = await r.json()
    expect(estado.enviados).toEqual(['a'])
    expect(cuerpo).toMatchObject({ ok: true, revisadas: 2, enviadas: 1, fallidas: 0, salteadas: [{ id: 'b', motivo: 'sin_asesor' }], pendientesPorTiempo: 0 })
    expect(cuerpo.ventana).toEqual({ desde: '2026-10-13T15:00:00.000Z', hasta: '2026-10-15T14:00:00.000Z' })
  })
  it('si otra corrida ya la reservó, no manda (una sola vez)', async () => {
    estado.visitas = [visita('a')]
    estado.reservas.set('a', null)
    const cuerpo = await (await POST(pedido('secreto-de-la-base'))).json()
    expect(estado.enviados).toEqual([])
    expect(cuerpo.salteadas).toEqual([{ id: 'a', motivo: 'reservada_por_otra_corrida' }])
  })
  it('si el email falla, libera la reserva para reintentar la próxima hora', async () => {
    estado.visitas = [visita('a')]
    estado.resultadoEmail = { ok: false, sent: 0, skipped: 0, failed: 1, errors: ['Tiempo de espera agotado'] }
    const cuerpo = await (await POST(pedido('secreto-de-la-base'))).json()
    expect(cuerpo).toMatchObject({ enviadas: 0, fallidas: 1 })
    expect(estado.liberadas).toEqual([['a', AHORA.toISOString()]])
  })
  it('ok:false con failed:0 (falta RESEND_API_KEY) también es un fallo', async () => {
    estado.visitas = [visita('a')]
    estado.resultadoEmail = { ok: false, sent: 0, skipped: 0, failed: 0, errors: ['RESEND_API_KEY not set'] }
    const cuerpo = await (await POST(pedido('secreto-de-la-base'))).json()
    expect(cuerpo.fallidas).toBe(1)
    expect(estado.liberadas).toHaveLength(1)
  })
  it('si se acaba el presupuesto de tiempo, deja el resto para la próxima corrida y lo cuenta', async () => {
    estado.visitas = [visita('a'), visita('b')]
    vi.spyOn(Date, 'now').mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(20_000)
    const cuerpo = await (await POST(pedido('secreto-de-la-base'))).json()
    expect(estado.enviados).toEqual(['a'])
    expect(cuerpo.pendientesPorTiempo).toBe(1)
  })
  it('sin nada para avisar, deja el motivo escrito (nunca un return mudo)', async () => {
    const cuerpo = await (await POST(pedido('secreto-de-la-base'))).json()
    expect(cuerpo).toMatchObject({ ok: true, revisadas: 0, enviadas: 0 })
    expect(cuerpo.motivo).toBe('No hay visitas confirmadas de las últimas 48 h que hayan pasado sin resultado ni aviso.')
  })
  it('si la base falla, 500 con ok:false', async () => {
    estado.falla = new Error('visitas para recordar: boom')
    const r = await POST(pedido('secreto-de-la-base'))
    expect(r.status).toBe(500)
    expect(await r.json()).toMatchObject({ ok: false, error: 'visitas para recordar: boom' })
  })
})
```

  (Con `toFake: ['Date']`, `Date.now` también es falso; el `vi.spyOn(Date, 'now')` de la prueba del
  presupuesto lo pisa solo en esa prueba y `restoreAllMocks` lo devuelve.)

- [ ] **Paso 2: Correr y ver FALLAR.**

- [ ] **Paso 3: Reescribir `app/api/cron/visit-reminders/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import * as datos from '@/lib/visitas/datos'
import { ventanaDeRecordatorio, decidirRecordatorio, type MotivoSinRecordatorio } from '@/lib/visitas/recordatorio'
import { enviarRecordatorioDeVisita } from '@/lib/email/notifications/visit-reminder-advisor'
import type { SendEmailResult } from '@/lib/email/resend-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Netlify corta la función a los ~26 s (y `maxDuration` no sirve acá). Cada email tiene
 * techo de 8 s (`sendEmail`): con 15 s de presupuesto el último envío entra con margen.
 * Lo que no entra queda para la corrida siguiente (cada hora) y se cuenta.
 */
export const PRESUPUESTO_MS = 15_000

/**
 * POST/GET /api/cron/visit-reminders — recordatorio "¿se realizó?" al asesor (spec §4.7).
 * La dispara pg_cron cada hora (migración 20261015000001). Antes dependía de una
 * scheduled function de Netlify (no se disparan en este sitio) y leía con la sesión
 * anónima (la RLS devolvía vacío): nunca corrió.
 *
 * Auth DUAL: env CRON_SECRET o cron_config('visit_reminders'). Mismo patrón que
 * app/api/cron/mapa-lugares.
 */
async function autorizado(provisto: string | null): Promise<boolean> {
  if (!provisto) return false
  if (process.env.CRON_SECRET && provisto === process.env.CRON_SECRET) return true
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) return false
  try {
    const { data } = await createClient(url, clave).from('cron_config').select('value').eq('key', 'visit_reminders').maybeSingle()
    const secretoDb = (data as { value?: string } | null)?.value
    // Un marcador sin reemplazar ('__SECRETO__', público en el repo) nunca es un secreto.
    return !!secretoDb && !secretoDb.startsWith('__') && provisto === secretoDb
  } catch {
    return false
  }
}

interface Corrida {
  ok: boolean
  ventana: { desde: string; hasta: string }
  revisadas: number
  enviadas: number
  fallidas: number
  salteadas: Array<{ id: string; motivo: MotivoSinRecordatorio | 'reservada_por_otra_corrida' }>
  pendientesPorTiempo: number
  motivo?: string
  firedAt: string
}

function salio(r: SendEmailResult | null): boolean {
  return !!r && r.ok && r.failed === 0 && r.sent > 0
}

async function handle(req: NextRequest): Promise<Response> {
  if (new URL(req.url).searchParams.get('ping') === '1') {
    return NextResponse.json({ ok: true, route: 'visit-reminders', auth: 'db+env' })
  }
  if (!(await autorizado(req.headers.get('x-cron-secret')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const inicio = Date.now()
  const ahora = new Date()
  const corrida: Corrida = {
    ok: true, ventana: ventanaDeRecordatorio(ahora), revisadas: 0, enviadas: 0, fallidas: 0,
    salteadas: [], pendientesPorTiempo: 0, firedAt: ahora.toISOString(),
  }
  try {
    const visitas = await datos.visitasParaRecordar(corrida.ventana)
    corrida.revisadas = visitas.length
    for (const v of visitas) {
      if (Date.now() - inicio > PRESUPUESTO_MS) { corrida.pendientesPorTiempo++; continue }
      const decision = decidirRecordatorio(v, ahora)
      if (!decision.enviar) { corrida.salteadas.push({ id: v.id, motivo: decision.motivo }); continue }
      const marca = await datos.reservarRecordatorio(v.id, ahora)
      if (!marca) { corrida.salteadas.push({ id: v.id, motivo: 'reservada_por_otra_corrida' }); continue }
      let resultado: SendEmailResult | null = null
      try {
        resultado = await enviarRecordatorioDeVisita({
          visitaId: v.id, scheduledAt: v.scheduled_at, cliente: v.client_name, direccion: v.direccion, asesor: decision.destino,
        })
      } catch (e) {
        console.error('[cron/visit-reminders] no se pudo armar el email', v.id, e)
      }
      if (salio(resultado)) { corrida.enviadas++; continue }
      corrida.fallidas++
      console.error('[cron/visit-reminders] el aviso no salió; se libera para reintentar', v.id, resultado?.errors ?? [])
      try {
        await datos.liberarRecordatorio(v.id, marca)
      } catch (e) {
        // Queda marcada como avisada sin haberlo sido: no se reintenta sola. Va al log con el id.
        console.error('[cron/visit-reminders] no se pudo liberar la reserva; esta visita NO se va a reintentar', v.id, e)
      }
    }
    if (visitas.length === 0) {
      corrida.motivo = 'No hay visitas confirmadas de las últimas 48 h que hayan pasado sin resultado ni aviso.'
    }
    console.log('[cron/visit-reminders]', JSON.stringify(corrida))
    return NextResponse.json(corrida)
  } catch (e) {
    console.error('[cron/visit-reminders] la corrida falló entera:', e)
    return NextResponse.json({ ...corrida, ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<Response> { return handle(req) }
export async function GET(req: NextRequest): Promise<Response> { return handle(req) }
```

- [ ] **Paso 4: Correr y ver PASAR** — las pruebas de la ruta y las de la Tarea 14.

- [ ] **Paso 5: Migración** — crear `supabase/migrations/20261015000001_cron_visit_reminders.sql`:

```sql
-- =============================================================================
-- Recordatorio "¿se realizó?" al asesor — se programa DESPUÉS del deploy
-- =============================================================================
-- Le pega a /api/cron/visit-reminders (POST, auth dual), que en su versión nueva no
-- existe hasta que el deploy termine. El script scripts/apply-cron-visit-reminders-pg.ts
-- verifica el deploy (?ping=1) antes de programar nada.
--
-- CADA HORA, al minuto 5. Cada corrida avisa las visitas CONFIRMADAS que pasaron hace
-- entre 1 h y 48 h, sin resultado y sin aviso (lib/visitas/recordatorio.ts). La ventana
-- de 48 h hace que la PRIMERA corrida no mande una ráfaga por visitas viejas.
--
-- OJO con pg_net: net.http_post es fire-and-forget. Que cron.job_run_details diga
-- 'succeeded' NO prueba que el endpoint haya respondido 200. Verificar SIEMPRE contra
-- net._http_response (retiene ~6h, mirar el CONTENIDO: varios jobs devuelven 200) y
-- contra email_notifications_log (notification_type='visit_reminder_advisor').
--
-- Los marcadores __SECRETO__ y __SITIO__ los reemplaza el script.
-- =============================================================================

-- Candado: pegada a mano en el SQL Editor, el secreto quedaría en el literal
-- '__SECRETO__' (que está en el repo) y cualquiera podría disparar la ruta.
DO $$ BEGIN
  IF '__SECRETO__' = '__' || 'SECRETO__' OR '__SITIO__' = '__' || 'SITIO__' THEN
    RAISE EXCEPTION 'Esta migración se aplica con scripts/apply-cron-visit-reminders-pg.ts (reemplaza el secreto y el dominio).';
  END IF;
END $$;

INSERT INTO public.cron_config (key, value)
VALUES ('visit_reminders', '__SECRETO__')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

SELECT cron.unschedule('visit-reminders') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'visit-reminders');

SELECT cron.schedule('visit-reminders', '5 * * * *', $job$
  SELECT net.http_post(
    url := 'https://__SITIO__/api/cron/visit-reminders',
    headers := jsonb_build_object('x-cron-secret', '__SECRETO__'),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
$job$);

-- =============================================================================
-- Verificación (3 capas, en orden):
--   1. SELECT jobname, schedule, active FROM cron.job WHERE jobname='visit-reminders';
--   2. SELECT status_code, left(content, 200), created FROM net._http_response
--        WHERE content LIKE '%"ventana"%' ORDER BY created DESC LIMIT 5;
--   3. SELECT status, recipient_email, created_at FROM email_notifications_log
--        WHERE notification_type='visit_reminder_advisor' ORDER BY created_at DESC LIMIT 10;
-- =============================================================================
```

- [ ] **Paso 6: Script** — crear `scripts/apply-cron-visit-reminders-pg.ts`:

```ts
/**
 * Programa en pg_cron el recordatorio "¿se realizó?" (cada hora, minuto 5).
 *
 * REQUISITO: el código tiene que estar DEPLOYADO. Este script lo verifica solo (`?ping=1`)
 * y no programa nada si la ruta nueva no responde.
 *
 * El secreto NO se pasa ni se imprime: se reusa el de `cron_config('send_report')`, el
 * mismo de los reportes, meta-sync y mapa-lugares. El dominio sale del job `meta-sync`.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/apply-cron-visit-reminders-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const MIGRACION = 'supabase/migrations/20261015000001_cron_visit_reminders.sql'

async function main() {
  if (!process.env.SUPABASE_DB_PASSWORD) throw new Error('falta SUPABASE_DB_PASSWORD (está en .env.local)')
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()
  try {
    const { rows: [cfg] } = await c.query(`SELECT value FROM cron_config WHERE key = 'send_report'`)
    const { rows: [job] } = await c.query(`SELECT substring(command from 'https://([^/'']+)') AS sitio FROM cron.job WHERE jobname = 'meta-sync'`)
    const secreto: string | undefined = cfg?.value
    const sitio: string | undefined = job?.sitio
    if (!secreto) throw new Error('no está cron_config(send_report)')
    if (!sitio) throw new Error('no pude leer el dominio del job meta-sync')

    const ping = await fetch(`https://${sitio}/api/cron/visit-reminders?ping=1`)
      .then(r => r.json()).catch(() => null) as { ok?: boolean; route?: string } | null
    if (ping?.ok !== true || ping.route !== 'visit-reminders') {
      throw new Error(`https://${sitio}/api/cron/visit-reminders?ping=1 no responde con la ruta nueva: el código no está deployado. No se programa nada.`)
    }
    console.log(`deploy verificado en ${sitio}`)

    const sql = readFileSync(MIGRACION, 'utf8').replaceAll('__SECRETO__', secreto).replaceAll('__SITIO__', sitio)
    await c.query(sql)

    const { rows: [nuevo] } = await c.query(`SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'visit-reminders'`)
    const { rows: [clave] } = await c.query(`SELECT (value = $1) AS igual FROM cron_config WHERE key = 'visit_reminders'`, [secreto])
    console.log('job:', JSON.stringify(nuevo ?? null))
    if (!nuevo || nuevo.active !== true || nuevo.schedule !== '5 * * * *') throw new Error('el job visit-reminders no quedó activo con su horario')
    if (clave?.igual !== true) throw new Error('no quedó bien la fila cron_config(visit_reminders)')
  } finally {
    await c.end()
  }
  console.log('\n✅ job programado. Después del próximo minuto 5, verificar net._http_response (contenido con "ventana") y email_notifications_log.')
}

main().catch(e => { console.error('❌', e instanceof Error ? e.message : e); process.exit(1) })
```

  (`pg` se instala con `npm i --no-save pg` si falta, como los demás `apply-*-pg.ts`.)

- [ ] **Paso 7: Borrar la scheduled function de Netlify** — `grep -rn "visit-reminders" netlify netlify.toml`
  → solo `netlify/functions/visit-reminders.ts`. Se BORRA (no alcanza con sacarle `config.schedule`:
  sin horario quedaría como función pública en `/.netlify/functions/visit-reminders` que dispara la
  ruta con el `CRON_SECRET` de Netlify a pedido de cualquiera). `git rm netlify/functions/visit-reminders.ts`.
  El comentario de `lib/supabase/middleware.ts:167` que la nombra como ejemplo de ruta `/api/cron/*`
  pública sigue siendo cierto (la ruta existe); no se toca.

- [ ] **Paso 8: Verificar** — suite completa, `npx tsc --noEmit -p tsconfig.visitas.json`,
  `npx eslint app/api/cron/visit-reminders lib/visitas/recordatorio.ts lib/email/notifications/visit-reminder-advisor.ts emails/VisitReminderAdvisorEmail.tsx scripts/apply-cron-visit-reminders-pg.ts`.
  **NO correr el script todavía** (va en la Tarea 17, después del deploy).

- [ ] **Paso 9: Commit (Tareas 14 y 15 juntas)** — `git add lib/visitas/tipos.ts lib/visitas/recordatorio.ts lib/visitas/recordatorio.test.ts lib/visitas/datos.ts lib/visitas/datos-recordatorio.test.ts lib/email/notifications/visit-reminder-advisor.ts lib/email/notifications/visit-reminder-advisor.test.ts emails/VisitReminderAdvisorEmail.tsx app/api/cron/visit-reminders supabase/migrations/20261015000001_cron_visit_reminders.sql scripts/apply-cron-visit-reminders-pg.ts`
  (el borrado de la función ya está en el índice) y commit
  `feat(visitas): recordatorio "¿se realizó?" por pg_cron, una vez por visita y sin ráfaga inicial`.

---

### Tarea 16: Verificación, auditoría y QA en la vista previa (Etapa 5 del protocolo)

**Files:** ninguno nuevo commiteado. Scripts de QA sin commitear con prefijo `_` (como en la
Entrega 1: `scripts/_qa-*.ts`, `scripts/_perf-*.ts`).

- [ ] **Paso 1: Suite completa, tipos y lint** — `npx vitest run --config vitest.visitas.config.ts`,
  `npx vitest run --config vitest.agente-prueba.config.ts` (el agente lee estados de visita),
  `npx tsc --noEmit -p tsconfig.visitas.json`,
  `npx eslint lib/visitas components/visitas components/properties/detail/tabs app/api/visits app/api/cron/visit-reminders "app/(dashboard)/visits" "app/(dashboard)/inicio/page.tsx" "app/(dashboard)/tasks/page.tsx" "app/(dashboard)/properties/[id]/page.tsx" lib/properties/detail-view.ts`.
  Pegar el resumen de cada salida en el reporte. Si iCloud cuelga algo, seguir CLAUDE.md § iCloud
  (copiar a disco local) — no cambiar código por eso.

- [ ] **Paso 2: Revisión adversarial** — subagente `feature-dev:code-reviewer` sobre
  `git diff origin/main...HEAD`, pidiendo explícitamente: alcance del asesor en las dos rutas GET y
  en la pestaña; consumidores olvidados de `GET /api/visits` (forma nueva de la respuesta) y de
  `lib/supabase/visits.ts`, `/feedback`, `sendReminderForVisit`, la función de Netlify; definiciones
  de §4.5 contra `metricas.ts`; zona horaria en todo lo que muestra fechas; paginación (orden único,
  techo, `truncado`); el cron (auth dual, reserva/liberación, presupuesto, primera corrida). Más
  `/security-review` (rutas con datos personales, `or()` con id, secreto del cron). Verificar cada
  hallazgo antes de aplicarlo; lo aplicado vuelve a su tarea (con su prueba).

- [ ] **Paso 3: Rendimiento en la base** — `scripts/_perf-visitas-e2.ts` (sin commitear) con `pg`:
  `EXPLAIN (ANALYZE, BUFFERS)` de las tres consultas del resumen (período de 30 días, activas,
  próximos 7 días) y de la lista con `or(advisor_id, created_by)`. Anotar plan y tiempo. Con ~14
  filas va a ser Seq Scan y está bien; solo si alguna tabla pasa de 5.000 filas y hace Seq Scan se
  propone un índice en tarea aparte (con su EXPLAIN antes/después).

- [ ] **Paso 4: PR** — `gh api user -q .login` tiene que ser `sujupar` (si no, `gh auth switch --user sujupar`);
  `git push -u origin feat/visitas-estadisticas`; `gh pr create --base main` con resumen, criterios
  12–17 y decisiones (lugares de la encuesta, regla del recordatorio, embudo "confirmadas o
  realizadas", base del % realizado). Esperar la vista previa
  (`https://deploy-preview-<N>--inmobiliariadiegoferreyra.netlify.app`, `gh pr checks <N>`).

- [ ] **Paso 5: QA con el navegador de Claude** — `scripts/navegador-claude.sh abrir <preview>` +
  `node --env-file=.env.local --import tsx scripts/navegador-claude-login.ts` (ajustado a la URL de
  la vista previa si hace falta). En cada página, quitar el "Netlify Drawer"
  (`document.querySelectorAll('iframe[title="Netlify Drawer"]').forEach(e => e.remove())`). Prender
  el modo prueba de email (`notification_settings.test_mode_enabled = true`) ANTES y apagarlo al
  terminar. Datos de prueba con `[TEST]` en el nombre de la persona, creados con
  `scripts/_qa-visitas-e2.ts` (sin commitear; inserta con clave de servicio y `changed_by` del
  usuario de pruebas) sobre una propiedad captada cualquiera, y borrados al final:
  - 3 visitas `[TEST]` de este mes: una `completed`, una `no_show` (`no_vino`), una `scheduled`
    pasada hace 3 h asignada al usuario de pruebas (para el recordatorio);
  - 1 visita `[TEST]` `pending_confirmation` para mañana creada por el usuario de pruebas pero
    asignada a otro asesor (Review Focus 2).

  Tabla criterio → cómo se probó → resultado (con captura por fila):
  | # | Criterio | Cómo |
  |---|---|---|
  | 12 | Tarjetas, agenda, "requieren tu acción" y estadísticas con su base; período sin visitas dice "Sin datos" | `/visits` en "Este mes"; después personalizado de un mes sin visitas (ej. 2025-01-01 a 2025-01-31). |
  | 13 | Las cifras coinciden con la base | `select status, outcome_reason, count(*) from property_visits where scheduled_at between '<desde>T00:00:00-03:00' and '<hasta>T23:59:59.999999-03:00' group by 1,2;` contra las tarjetas y "Por qué no se hicieron" del mismo período, rol admin. |
  | 14 | "Se realizó" desde "Requieren tu acción" la saca y suma | Sobre la `[TEST]` pasada sin resultado: Se realizó → Alto → Guardar; sale de la lista y "Se realizaron" sube; `select status, outcome_at from property_visits where id=…`. |
  | 15 | El asesor ve solo lo suyo | `UPDATE profiles SET role='asesor' WHERE email='claude.qa@inmodf.com.ar'`; `/visits`, `/visits/todas` y la pestaña de la propiedad: solo visitas con `advisor_id` o `created_by` = él (incluida la `[TEST]` asignada a otro); sin filtro de asesor ni "Por asesor"; `fetch('/api/visits?asesor=<otro>')` desde la consola devuelve solo lo propio. Rol abogado: `/api/visits` y `/api/visits/resumen` → 403, sin pestaña Visitas. Dejar el rol en `admin`. |
  | 16 | Pestaña Visitas en la ficha | Ficha de la propiedad de prueba → Visitas: próximas/pasadas con estado y link; "Qué opinan" dice "Sin datos — llega con la encuesta"; Historial ya no tiene "Feedback de visitas". |
  | 17 | Recordatorio una sola vez | En la vista previa: crear `cron_config('visit_reminders')` con el valor de `send_report` (lo hace `scripts/_qa-visitas-e2.ts --cron`, sin imprimirlo) y llamar dos veces `POST <preview>/api/cron/visit-reminders` con ese secreto: la 1.ª responde `enviadas: 1` (la `[TEST]` de hace 3 h), la 2.ª `revisadas: 0`; en `email_notifications_log` hay UNA fila `visit_reminder_advisor` para esa visita (redirigida por el modo prueba). La verificación con `cron.job_run_details` → `net._http_response` va en la Tarea 17 (el job se programa después del deploy). |

  Además:
  - Link de Inicio: tarjeta "Visitas de hoy" → abre `/visits` con el período "Hoy" y el número coincide.
  - `/tasks` con una visita pasada sin marcar: el cartel "Visitas pendientes de marcar" muestra la
    dirección y la hora argentina.
  - Celular: `emulate` con `mobile,touch` (no solo achicar) a 360×740 y 390×844: `/visits`,
    `/visits/todas`, la pestaña, y la ventana de "Se realizó" abierta desde "Requieren tu acción" —
    nada superpuesto ni cortado, botones ≥ 44 px, la X del diálogo arriba a la derecha. Menú
    colapsado (modo ícono) con `/visits` abierta.
  - Ficha de propiedad a 360 px: la barra de pestañas ahora tiene seis; se desplaza de costado y
    "Visitas" se puede tocar sin que nada se corte.
  - Consola sin errores (`list_console_messages`) y red sin 4xx/5xx inesperados (`list_network_requests`).
  - **Rendimiento (spec §8):** desde la consola del navegador ya logueado, 30 llamadas en caliente
    a `/api/visits/resumen?desde=<-29d>&hasta=<hoy>` y a `/api/visits?porPagina=50`, midiendo con
    `performance.now()`; p95 < 1,5 s en las dos. Anotar p50/p95.
  - Borrar todo lo `[TEST]` (visitas → sus eventos caen en cascada) y la fila
    `cron_config('visit_reminders')` creada para el QA NO se borra (el script de la Tarea 17 la
    reescribe con el mismo valor); apagar el modo prueba de email.

  Un criterio en rojo vuelve a la Tarea dueña.

---

### Tarea 17: Despliegue y cierre (Etapa 6 del protocolo)

- [ ] **Paso 1: Puertas, en orden:**
  1. Migraciones de tablas: ninguna en esta entrega (la de pg_cron va en el paso 4).
  2. Variables de entorno nuevas: ninguna (`CRON_SECRET`, `RESEND_API_KEY`,
     `NEXT_PUBLIC_APP_URL` ya existen; avisar al dueño que no tiene que cargar nada).
  3. `git fetch origin` y `git diff --name-only origin/main feat/visitas-estadisticas` → SOLO
     archivos de esta entrega (los del Mapa de archivos + los borrados). Si aparece algo ajeno,
     reconstruir la rama limpia. Merge con `gh pr merge <N> --merge` (lo hace Claude, nunca el dueño).
  4. Esperar el deploy (2–5 min; `curl -s https://inmodf.com.ar/api/cron/visit-reminders?ping=1`
     tiene que devolver `{"ok":true,"route":"visit-reminders","auth":"db+env"}`) y EN ESA MISMA
     VENTANA correr `node --env-file=.env.local --import tsx scripts/apply-cron-visit-reminders-pg.ts`.
     El script vuelve a verificar el ping y aborta si la ruta nueva no responde.
- [ ] **Paso 2: Verificación en 3 capas** (después del primer minuto 5 posterior al script):
  `SELECT jobname, schedule, active FROM cron.job WHERE jobname='visit-reminders';` →
  `SELECT status_code, left(content,200), created FROM net._http_response WHERE content LIKE '%"ventana"%' ORDER BY created DESC LIMIT 3;`
  (200 y un cuerpo con `revisadas`/`enviadas`; si `enviadas > 0`, mirar a quién) →
  `SELECT status, recipient_email, created_at FROM email_notifications_log WHERE notification_type='visit_reminder_advisor' ORDER BY created_at DESC LIMIT 10;`.
  La primera corrida en producción SOLO puede avisar visitas confirmadas de las últimas 48 h: si
  `enviadas` es mayor que lo que da
  `SELECT count(*) FROM property_visits WHERE status='scheduled' AND reminder_sent_at IS NULL AND scheduled_at BETWEEN now()-interval '48 hours' AND now()-interval '1 hour';`
  (consultado justo antes), algo está mal: `SELECT cron.unschedule('visit-reminders');` y revisar.
- [ ] **Paso 3: Humo en producción** con el navegador de Claude: `https://inmodf.com.ar/visits`
  (tarjetas, agenda, pendientes; consola limpia), "Ver todas", la pestaña Visitas de una propiedad
  captada, la tarjeta "Visitas de hoy" de `/inicio` y `/tasks`. Sin crear datos.
- [ ] **Paso 4: Si algo salió mal:** `SELECT cron.unschedule('visit-reminders');` y
  `git revert -m 1 <merge>` + push. Netlify vuelve solo. No se parchea a mano.
- [ ] **Paso 5: Cerrar el navegador** — `scripts/navegador-claude.sh cerrar`.
- [ ] **Paso 6: Cerrar el ciclo** — en `CLAUDE.md`, sección nueva "Sistema de visitas — Entrega 2"
  (debajo de la de la Entrega 1): qué hay (sección `/visits`, "Ver todas", pestaña, recordatorio);
  las definiciones que se decidieron (base del % realizado = visitas con resultado; embudo
  "confirmadas o realizadas"; guardas de las medianas; "orientativo" solo en % y medianas); alcance
  del asesor (`advisor_id` o `created_by`) aplicado en la ruta; `GET /api/visits` paginado (lee
  `total`, acepta los nombres viejos); paginación de a 1000 en el resumen; el recordatorio (ventana
  1–48 h, solo `scheduled`, reserva atómica + liberación, `idempotent:false`, job `visit-reminders`
  al minuto 5, verificación en 3 capas, efecto lateral del 409); lo que espera a la Entrega 3
  ("Sin datos — llega con la encuesta"); qué se borró (`lib/supabase/visits.ts`, `/feedback`, la
  función de Netlify). Memoria `sistema_visitas.md` actualizada (Entrega 2 en producción; pendiente:
  Entrega 3). Si la Entrega 3 no sigue en este worktree, `git worktree remove`.
- [ ] **Paso 7: Reporte al dueño**, en castellano simple: qué se hizo, la tabla de criterios 12–17
  con cómo se probó, qué quedó para la Entrega 3, y que no tiene que hacer nada.

---

## Autorrevisión (hecha al escribir el plan)

- **Cobertura del spec:** §3.4 → Tareas 9–12 (tarjetas, agenda, requieren, cómo vienen, Ver todas,
  período y filtros); §3.5 pestaña → Tarea 13 (el botón "Agendar visita" de la ficha ya existe desde
  la Entrega 1 y ahora refresca la pestaña); §4.4 rutas GET → Tareas 7–8; §4.5 → Tareas 2–3 (salvo
  encuesta y opiniones, Entrega 3); §4.6 zona horaria → `formatearFechaCorta`, `/tasks`, email del
  recordatorio, `VisitsTable`; §4.7 → Tareas 14–15 y 17; §6 criterios 12–17 → Tarea 16; §7 riesgo 9
  (pg_cron después del deploy) → Tarea 17; §8 rendimiento → Tarea 3 (20.000 en < 150 ms) y Tarea 16
  (p95 < 1,5 s, EXPLAIN).
- **Sin placeholders:** cada paso de código trae el código; los pasos de QA traen el comando o la
  consulta.
- **Tipos consistentes:** `VisitaListado`, `Cifra`, `Metricas`, `ResumenVisitas`, `FiltroConsultaVisitas`,
  `Alcance`, `VisitaParaDialogo`, `VisitaParaRecordar` se definen una vez y se usan con el mismo nombre.
- **Review Focus:** los cinco casos tienen su prueba en la tarea dueña (Tareas 1, 2, 3, 5, 6, 7, 8, 9).
