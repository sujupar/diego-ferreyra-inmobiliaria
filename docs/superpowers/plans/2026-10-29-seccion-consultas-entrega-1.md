# Sección Consultas — Entrega 1 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sección `/consultas` con la bandeja de todas las consultas (portales + landings), filtros en la URL, detalle, agendar visita en dos toques (incluidos "sin propiedad" y "teléfono a revisar"), y el celular al 100 %. Criterios 1–12 y 14 del spec.

**Architecture:** Una vista SQL `consultas_unificadas` une `portal_inquiries` y `property_leads` (landing). La ruta `GET /api/consultas` trae TODAS las consultas del período que cumplen los filtros "de base" (≈160/mes, tope de un año), les calcula el estado en TypeScript cruzándolas con las visitas, y recién ahí filtra por estado, cuenta las tarjetas y pagina en memoria: es el mismo enfoque que el resumen de visitas. Para agendar se reusa `AgendarVisitaDialog` + `POST /api/visits`, con un "modo rápido" que arranca en día y hora.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Supabase (service role en las rutas, alcance por rol en la consulta), zod, shadcn/ui, libphonenumber-js/max, vitest + happy-dom.

**Spec:** `docs/superpowers/specs/2026-10-29-seccion-consultas-design.md` (aprobado por el dueño el 2026-10-29). Lienzo: https://claude.ai/artifact/MQgvu3ZnFcEYQQFnX3ya1T

## Global Constraints

- Todo texto visible en castellano rioplatense, sin jerga ("Sin propiedad identificada", "Teléfono a revisar", "Agendar visita", "Confirmarle por WhatsApp").
- Roles con acceso: `admin`, `dueno`, `coordinador`, `asesor`. El `abogado` no ve el ítem y la página lo redirige (`redirect('/')`).
- El asesor ve solo las consultas con `assigned_to = él` **o** de propiedades con `properties.assigned_to = él`. No ve el filtro de asesor y el `asesor=` de la URL se ignora.
- Teléfonos: regla del 549 (spec §4). Un número sin `+` que no es argentino válido queda **a revisar**: nunca se adivina extranjero. Lo guardado en la visita es `+549…`.
- Nada se manda solo: ningún WhatsApp ni email nuevo. "Confirmarle por WhatsApp" es un enlace `https://wa.me/549…?text=…`.
- No se crea una segunda forma de crear visitas: siempre `POST /api/visits`.
- Celular: ancho 390 px sin scroll horizontal; todo control tocable ≥ 44 px de alto; inputs de 16 px (iOS no hace zoom).
- Paleta y componentes: los del sistema (tokens `--brand`, shadcn). Fuente: la de la app.
- Pruebas: SIEMPRE con `vitest.consultas.config.ts` y `tsconfig.consultas.json` (Tarea 1). Nunca la config raíz (tarda 13 min en esta Mac). Los tests de componente pueden tardar en frío; esperar.
- Comandos desde el worktree, simples y separados (el guardia rechaza `&&`, heredocs y variables en comandos).
- Commits como `Sujupar <redstyle50@gmail.com>`, con el trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Nunca agregar `scripts/_qa-*` ni `scripts/_qa-tel.json` (tiene teléfonos reales).
- La migración se aplica en la base ANTES de mergear.

## Review Focus

1. **Consulta con teléfono guardado "de 10 dígitos pero inválido"** (`541103305864`): hoy `telefonoEfectivo` lo da por bueno y el teléfono corregido que manda la ventana se ignora. Hay que esperar que gane el corregido. El test va en la Tarea 2.
2. **Un "Ver más" después de que entró una consulta nueva**: con paginado por offset se repite una fila. Se espera que no haya duplicados en la lista. La Tarea 9 deduplica por `id` al agregar la página; el test va ahí.
3. **El asesor que pide `?asesor=<otro>` o `?propiedad=<ajena>`**: se espera que no vea nada ajeno. Los tests van en la Tarea 5 (ruta).
4. **"Recordar aviso" sobre una consulta de landing o sin código de aviso**: no hay aviso que recordar. Se espera que conecte solo esa consulta y no falle. El test va en la Tarea 6.
5. **Consulta de MercadoLibre sin teléfono ni nombre**: se espera "MercadoLibre no comparte el contacto", y que al agendar se pida el teléfono. Nunca un 400 mudo. El test va en la Tarea 4 (`accionDeAgendar`).

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `vitest.consultas.config.ts`, `tsconfig.consultas.json` | Configs acotadas de prueba y tipos |
| `lib/consultas/telefono.ts` (+ test) | Regla del 549: puro |
| `lib/consultas/telefono.formatos.ts` | Los 537 formatos reales ANONIMIZADOS (fixture) |
| `lib/visitas/persona.ts` | `telefonoEfectivo` usa la regla del 549 |
| `supabase/migrations/20261029000001_consultas_unificadas.sql` + `scripts/apply-consultas-unificadas-pg.ts` | Vista |
| `lib/consultas/tipos.ts` | Tipos compartidos |
| `lib/consultas/filtros.ts` (+ test) | Leer/validar los filtros de la URL |
| `lib/consultas/bandeja.ts` (+ test) | Estado, tarjetas, filtro por estado, repetidas, paginado y agrupado por día: puro |
| `lib/consultas/datos.ts` | Lecturas a Supabase (server-only) |
| `app/api/consultas/route.ts` (+ test) | `GET` de la bandeja |
| `lib/consultas/identificar.ts` (+ test) | Conectar consulta↔propiedad y "recordar aviso" (lo usan las dos rutas) |
| `app/api/consultas/[id]/propiedad/route.ts` (+ test) | `POST` conectar |
| `app/api/portal-inquiries/identify/route.ts` | Pasa a usar `identificar.ts` |
| `lib/visitas/agendar-estado.ts`, `components/visitas/agendar/AgendarVisitaDialog.tsx` (+ tests) | Modo rápido |
| `lib/consultas/confirmar.ts` (+ test) | Texto y enlace de "Confirmarle por WhatsApp" |
| `app/(dashboard)/consultas/page.tsx`, `ConsultasClient.tsx` | Página |
| `components/consultas/*` | Tarjetas, filtros, lista, fila, detalle, hojas de agendar |
| `lib/nav/sections.ts`, `lib/nav/bottom-bar.ts` (+ tests) | Menú |
| `app/(dashboard)/inbox/*`, `components/properties/PropertyInquiriesCard.tsx`, `components/metrics/PropertyInquiriesPanel.tsx` | Redirección y enlaces |

---

### Task 1: Regla del 549 (`lib/consultas/telefono.ts`) + configs de prueba

**Files:**
- Create: `vitest.consultas.config.ts` (copia la forma de `vitest.visitas.config.ts`; `include`: `lib/consultas/**/*.test.ts`, `app/api/consultas/**/*.test.ts`, `components/consultas/**/*.test.tsx`, `app/*/consultas/**/*.test.tsx`, `lib/visitas/persona.test.ts`, `lib/visitas/agendar-estado.test.ts`, `components/visitas/agendar/**/*.test.tsx`, `app/api/portal-inquiries/**/*.test.ts`, `lib/nav/*.test.ts`; `exclude` también `**/.claude/worktrees/**` NO va: corremos DENTRO del worktree)
- Create: `tsconfig.consultas.json` (extiende el raíz como `tsconfig.visitas.json`; include `next-env.d.ts`, `types/**/*.ts`, `lib/consultas/**/*.ts`, `lib/visitas/**/*.ts`, `lib/nav/*.ts`, `app/api/consultas/**/*.ts`, `app/api/portal-inquiries/**/*.ts`, `app/(dashboard)/consultas/**/*.tsx`, `app/(dashboard)/inbox/**/*.tsx`, `components/consultas/**/*.tsx`, `components/visitas/**/*.tsx`, `components/properties/PropertyInquiriesCard.tsx`, `components/metrics/PropertyInquiriesPanel.tsx`)
- Create: `lib/consultas/telefono.ts`, `lib/consultas/telefono.test.ts`, `lib/consultas/telefono.formatos.ts`

**Interfaces:**
- Produces:
  ```ts
  export type TelefonoLeido =
    | { ok: true; whatsapp: string /* '5491161400496', sin + */; mostrado: string /* '+54 9 11 6140-0496' */; canonico: string /* '+5491161400496' */; corregido: boolean /* el crudo no era ya E.164 */ }
    | { ok: false; motivo: MotivoRevisar; crudo: string }
  export type MotivoRevisar = 'vacio' | 'falta_caracteristica' | 'muy_corto' | 'muy_largo' | 'no_es_celular'
  export const MOTIVO_TEXTO: Record<MotivoRevisar, string>
  export function leerTelefono(crudo: string | null | undefined): TelefonoLeido
  export function armarDesdePartes(caracteristica: string, numero: string): TelefonoLeido
  ```

- [ ] **Step 1: Escribir el fixture anonimizado.** `telefono.formatos.ts` exporta `FORMATOS_REALES: ReadonlyArray<{ crudo: string; esperado: string | null }>`. Se genera desde `scripts/_qa-tel.json` (lo produjo `scripts/_qa-dump-tel.ts` y NO se commitea): cada dígito se reemplaza por otro dígito manteniendo la forma (prefijos `54`, `540`, `549`, `0`, `011`, `15`, `+`, espacios y guiones quedan iguales; la característica `11` queda `11`; los 8 dígitos del abonado se sustituyen con una tabla fija `0→3,1→7,2→5,…`). `esperado` es el `whatsapp` correcto, o `null` si va a revisar. Revisar a ojo que el archivo no tenga ningún número real (comparar 5 al azar contra `_qa-tel.json`).

- [ ] **Step 2: Tests que fallan** (`telefono.test.ts`):
  ```ts
  it.each([
    ['541161400496', '5491161400496'], ['5401162653949', '5491162653949'],
    ['540111556335717', '5491156335717'], ['1561956411', '5491161956411'],
    ['011 15 5823-4521', '5491158234521'], ['+54 9 11 6140-0496', '5491161400496'],
    ['(011) 6140-0496', '5491161400496'],
  ])('%s → %s', (crudo, wa) => expect(leerTelefono(crudo)).toMatchObject({ ok: true, whatsapp: wa }))
  it('mostrado con espacios y guion', () => expect(leerTelefono('541161400496')).toMatchObject({ mostrado: '+54 9 11 6140-0496', canonico: '+5491161400496' }))
  it('sin + y no argentino → revisar, nunca extranjero', () => {
    expect(leerTelefono('4571430985').ok).toBe(false)
    expect(leerTelefono('33652765622').ok).toBe(false)
  })
  it('+ con otro país se acepta', () => expect(leerTelefono('+598 94 123 456')).toMatchObject({ ok: true, whatsapp: '59894123456' }))
  it('8 dígitos → falta la característica', () => expect(leerTelefono('4941-0027')).toEqual({ ok: false, motivo: 'falta_caracteristica', crudo: '4941-0027' }))
  it('9 dígitos → muy corto', () => expect(leerTelefono('112611114')).toMatchObject({ ok: false, motivo: 'muy_corto' }))
  it('vacío', () => expect(leerTelefono('  ')).toMatchObject({ ok: false, motivo: 'vacio' }))
  it('partes con 0 y 15 que se limpian', () => expect(armarDesdePartes('011', '15 4941-0027')).toMatchObject({ ok: true, whatsapp: '5491149410027' }))
  it('los formatos reales', () => { for (const f of FORMATOS_REALES) expect(leerTelefono(f.crudo).ok ? (leerTelefono(f.crudo) as { whatsapp: string }).whatsapp : null).toBe(f.esperado) })
  ```

- [ ] **Step 3: Correr y ver que falla.** `npx vitest run -c vitest.consultas.config.ts lib/consultas/telefono.test.ts` → FAIL (módulo inexistente).

- [ ] **Step 4: Implementar.** Algoritmo (no lo determinan los tests por sí solos):
  1. `trim`; vacío → `vacio`.
  2. Si empieza con `+` y lo que sigue NO empieza con `54` → `normalizeWhatsappPhone(crudo)` tal cual (es el único camino a un extranjero); `null` → `no_es_celular`.
  3. Si no: dígitos solos; sacar el prefijo `54` y, después, un `0` inicial (cubre `540…`, `0…`, `011…`). Si queda con `9` adelante y 11 dígitos, sacar el `9`. Contar: 8 → `falta_caracteristica`; < 10 sin el 15 → `muy_corto`; si tiene 15 tras la característica (2–4 dígitos) dejar que lo saque `normalizeWhatsappPhone`.
  4. Llamar `normalizeWhatsappPhone('+54' + resto)`, SIEMPRE con `+54` adelante (así nunca cae en otro país). Además: `/^15\d{8}$/` → área 11 (misma heurística de `expandirQuinceLocal`). `null` → `muy_largo` si sobran dígitos, si no → `no_es_celular`.
  5. `mostrado`: `+54 9 <área> <abonado con guion antes de los últimos 4>`. El área sale de `parsePhoneNumberFromString('+'+wa).nationalNumber` menos el 9 inicial; la largura del área sale de la metadata (`formatNational` de libphonenumber) y no de una tabla propia.
  `MOTIVO_TEXTO`: `falta_caracteristica` → `'Tiene 8 números: le falta la característica.'`, `muy_corto` → `'Tiene pocos números para ser un celular.'`, `muy_largo` → `'Tiene números de más.'`, `no_es_celular` → `'No es un celular argentino válido.'`, `vacio` → `'No dejó teléfono.'`.

- [ ] **Step 5: Correr y ver que pasa.** El mismo comando → PASS. `npx tsc --noEmit -p tsconfig.consultas.json` → sin errores.

- [ ] **Step 6: Commit.** `git add vitest.consultas.config.ts tsconfig.consultas.json lib/consultas/telefono.ts lib/consultas/telefono.test.ts lib/consultas/telefono.formatos.ts` → `feat(consultas): regla del 549 para teléfonos`.

### Task 2: Que gane el teléfono corregido al agendar

**Files:** Modify: `lib/visitas/persona.ts` (`telefonoEfectivo`, `telefonoCanonico`). Test: `lib/visitas/persona.test.ts`.

**Interfaces:**
- Consumes: `leerTelefono` (Tarea 1).
- Produces: firmas sin cambios. Cambia la semántica: `telefonoEfectivo(guardado, enviado)` devuelve `guardado` solo si `leerTelefono(guardado).ok`; si no, devuelve `enviado` (recortado) cuando no está vacío. `telefonoCanonico(tel)` devuelve `leerTelefono(tel).canonico` cuando el número es válido. Si no, mantiene el comportamiento actual (`normalizeWhatsappPhone` → `+…`, y si no, el texto crudo).

- [ ] **Step 1: Tests que fallan:**
  ```ts
  it('guardado de 12 dígitos inválido pierde contra el corregido', () =>
    expect(telefonoEfectivo('541103305864', '+5491149410027')).toBe('+5491149410027'))
  it('guardado válido sigue ganando', () =>
    expect(telefonoEfectivo('541161400496', '+5491100000000')).toBe('541161400496'))
  it('canónico de un número con 540', () => expect(telefonoCanonico('5401162653949')).toBe('+5491162653949'))
  it('canónico no inventa extranjero', () => expect(telefonoCanonico('4571430985')).toBe('4571430985'))
  ```
- [ ] **Step 2:** `npx vitest run -c vitest.consultas.config.ts lib/visitas/persona.test.ts` → FAIL en los dos primeros. **Ojo:** el cuarto test hoy pasa por casualidad o falla. Anotar cuál de las dos.
- [ ] **Step 3:** Implementar. Los tests viejos de `persona.test.ts` tienen que seguir verdes; si alguno fija el comportamiento viejo (por ejemplo, un guardado de 10 dígitos inválido que gana), cambiarlo y explicar en el commit por qué.
- [ ] **Step 4:** Correr `persona.test.ts` y `app/api/visits/route.test.ts`: `npx vitest run -c vitest.visitas.config.ts lib/visitas/persona.test.ts app/api/visits/route.test.ts` → PASS.
- [ ] **Step 5: Commit** `fix(visitas): el teléfono corregido gana si el guardado no sirve para WhatsApp`.

### Task 3: Vista `consultas_unificadas`

**Files:** Create: `supabase/migrations/20261029000001_consultas_unificadas.sql`, `scripts/apply-consultas-unificadas-pg.ts` (patrón de `scripts/apply-whatsapp-origen-pg.ts`: conecta por el pooler, corre el archivo y verifica).

**Interfaces — Produces:** vista `public.consultas_unificadas` con estas columnas exactas:
`id uuid, tipo text ('portal'|'landing'), numero int (seq; null en landing), recibida_at timestamptz (COALESCE(received_at, created_at) / created_at), canal text ('whatsapp'|'mail'|'landing'), portal text ('zonaprop'|'argenprop'|'mercadolibre'|'landing'), nombre text, telefono text, email text, mensaje text, property_id uuid, assigned_to uuid, asesor_propiedad uuid (properties.assigned_to), aviso_codigo text, aviso_url text, aviso_direccion text, aviso_titulo text (raw_subject), utm jsonb (null en portal)`.
Landing = `property_leads WHERE source = 'landing' AND deleted_at IS NULL AND suspected_bot IS NOT TRUE`. `WITH (security_invoker = true)`. `GRANT SELECT` a `authenticated` y `service_role`.

- [ ] **Step 1:** Antes de escribir el SQL, confirmar las columnas reales con `select column_name from information_schema.columns where table_name in ('portal_inquiries','property_leads')`. El script lo imprime en modo `--columnas`.
- [ ] **Step 2:** Escribir la migración (con `CREATE OR REPLACE VIEW`; aditiva). Mirar `ls supabase/migrations | tail` antes: el prefijo `20261029000001` no tiene que existir.
- [ ] **Step 3:** Aplicar: `node --env-file=../../../.env.local --import tsx scripts/apply-consultas-unificadas-pg.ts`. El script **aborta** si `count(*)` de la vista ≠ `count(portal_inquiries)` + `count(landing válidas)`. También aborta si `security_invoker` no quedó en `pg_class.reloptions`.
- [ ] **Step 4:** Verificar contra la API (regla de CLAUDE.md): `select id from consultas_unificadas limit 1` con el cliente service role → 1 fila.
- [ ] **Step 5: Commit** `feat(consultas): vista consultas_unificadas`.

### Task 4: Bandeja pura (`filtros.ts` + `bandeja.ts`)

**Files:** Create: `lib/consultas/tipos.ts`, `lib/consultas/filtros.ts` (+ test), `lib/consultas/bandeja.ts` (+ test).

**Interfaces — Produces:**
```ts
// tipos.ts
export interface ConsultaFila { id: string; tipo: 'portal' | 'landing'; numero: number | null; recibida_at: string; canal: 'whatsapp' | 'mail' | 'landing'; portal: string; nombre: string | null; telefono: string | null; email: string | null; mensaje: string | null; property_id: string | null; assigned_to: string | null; asesor_propiedad: string | null; aviso_codigo: string | null; aviso_url: string | null; aviso_direccion: string | null; aviso_titulo: string | null; utm: unknown }
export interface VisitaDeConsulta { id: string; property_id: string; portal_inquiry_id: string | null; client_phone: string | null; status: EstadoVisita; scheduled_at: string }
export type EstadoConsulta = { tipo: 'sin_visita' } | { tipo: 'con_visita' | 'visito'; visitaId: string; scheduled_at: string }
export type AccionAgendar = 'agendar' | 'elegir_propiedad' | 'revisar_telefono' | 'pedir_telefono'
export interface ConsultaEnBandeja extends ConsultaFila { estado: EstadoConsulta; tel: TelefonoLeido; repetidas: number; accion: AccionAgendar; propiedad: { address: string; neighborhood: string | null } | null; asesor_nombre: string | null }
export interface TarjetasBandeja { sinVisita: number; sinPropiedad: number; telefonoRevisar: number }
export interface ConteoOpcion { valor: string; etiqueta: string; n: number }
export interface RespuestaBandeja { filas: ConsultaEnBandeja[]; total: number; pagina: number; porPagina: 25; tarjetas: TarjetasBandeja; porPortal: ConteoOpcion[]; porPropiedad: ConteoOpcion[]; periodo: { desde: string; hasta: string; etiqueta: string } }

// filtros.ts
export const PERIODOS_CONSULTAS = ['hoy', '7d', '30d', 'mes', 'personalizado'] as const   // defecto '7d'
export const FILTROS_DEFECTO_CONSULTAS = { periodo: '7d', from: '', to: '', portal: '', propiedad: '', estado: '', asesor: '', telefono: '', q: '' }
export const PORTALES_FILTRO = ['zonaprop', 'argenprop', 'mercadolibre', 'landing'] as const
export const ESTADOS_FILTRO = ['sin_visita', 'con_visita', 'visito'] as const
export interface FiltrosConsultas { desde: string; hasta: string; etiqueta: string; portal: string | null; propiedad: string | 'sin' | null; estado: typeof ESTADOS_FILTRO[number] | null; asesor: string | 'sin' | null; telefonoRevisar: boolean; q: string; pagina: number }
export function leerFiltrosConsultas(sp: URLSearchParams, hoy: string): { ok: true; valor: FiltrosConsultas } | { ok: false; error: string }

// bandeja.ts
export function estadoDeConsulta(c: ConsultaFila, visitas: readonly VisitaDeConsulta[]): EstadoConsulta
export function accionDeAgendar(c: ConsultaFila, tel: TelefonoLeido): AccionAgendar
export function contarRepetidas(filas: readonly ConsultaFila[]): Map<string, number>   // id → cuántas consultas tiene esa persona en TODO lo traído
export function armarBandeja(filas: readonly ConsultaEnBandeja[], f: Pick<FiltrosConsultas, 'estado' | 'telefonoRevisar' | 'pagina'>): Pick<RespuestaBandeja, 'filas' | 'total' | 'tarjetas'>
export function agruparPorDia(filas: readonly ConsultaEnBandeja[]): Array<{ dia: string /* AAAA-MM-DD Argentina */; etiqueta: string /* 'Hoy' | 'Ayer' | 'mié 28 oct' */; filas: ConsultaEnBandeja[] }>
```
Reglas que fijan los tests:
- `estadoDeConsulta`: se ignoran las visitas `cancelled`. Hay match si `v.portal_inquiry_id === c.id`, **o** si `v.property_id === c.property_id` (no nulo) y `leerTelefono(v.client_phone).whatsapp === leerTelefono(c.telefono).whatsapp` (ambos ok). Entre varias, gana la más reciente. Es `visito` si el estado es `completed`; si no, `con_visita`.
- `accionDeAgendar`: sin `property_id` → `elegir_propiedad` (va primero). Después: teléfono vacío → `pedir_telefono`, inválido → `revisar_telefono`, válido → `agendar`.
- `armarBandeja`: las tarjetas se cuentan ANTES de aplicar `estado`/`telefonoRevisar`. Orden `recibida_at` desc y, a igualdad, `id` desc. Página de 25.
- `leerFiltrosConsultas`: el período reusa `resolverPeriodo` de `lib/visitas/periodo.ts` para `7d|30d|mes|personalizado`; `hoy` → desde=hasta=hoy. El defecto es `7d` (no el `30d` de visitas). `propiedad` y `asesor` aceptan uuid o `'sin'`; otro valor → `null`. `q` se normaliza con `normalizarBusqueda`. `pagina` ≥ 1, entero.

- [ ] **Step 1: Tests que fallan.** Un `it` por regla de arriba, con estos casos mínimos:
  - visita cancelada no cuenta;
  - match por teléfono con formatos distintos (`'011 15 6140-0496'` vs `'+5491161400496'`);
  - `completed` → `visito`;
  - MercadoLibre sin teléfono → `pedir_telefono` (Review Focus 5);
  - sin propiedad y con teléfono malo → `elegir_propiedad`;
  - las tarjetas no cambian al filtrar por estado;
  - página 2 de 30 filas → 5 filas y `total` 30;
  - `agruparPorDia` con una consulta de las 23:30 UTC-3 cae en el día argentino correcto;
  - `?propiedad=sin` → `'sin'`; `?propiedad=xx` → `null`; sin período → 7 días.
- [ ] **Step 2:** `npx vitest run -c vitest.consultas.config.ts lib/consultas` → FAIL.
- [ ] **Step 3:** Implementar los dos módulos (puros, sin `server-only`, seguros para el navegador).
- [ ] **Step 4:** El mismo comando → PASS; `tsc -p tsconfig.consultas.json` limpio.
- [ ] **Step 5: Commit** `feat(consultas): reglas de la bandeja`.

### Task 5: Datos + `GET /api/consultas`

**Files:** Create: `lib/consultas/datos.ts`, `app/api/consultas/route.ts`, `app/api/consultas/route.test.ts`.

**Interfaces:**
- Consumes: Tareas 3–4; `alcanceDeVisitas`, `puedeGestionarVisitas`, `puedeVerTodasLasVisitas` (`lib/visitas/acceso.ts`); `inicioDelDiaArgentina`/`finDelDiaArgentina` (`lib/filters/rango-fechas.ts`); `clausulasBusqueda` (`lib/filters/busqueda-texto.ts`).
- Produces:
  ```ts
  // datos.ts ('server-only', cliente service role como lib/visitas/datos.ts)
  export async function consultasDelPeriodo(f: { alcance: Alcance; desde: string; hasta: string; portal: string | null; propiedad: string | 'sin' | null; asesor: string | 'sin' | null; q: string }): Promise<{ filas: ConsultaFila[]; truncado: boolean }>
  export async function visitasParaConsultas(propertyIds: string[], inquiryIds: string[]): Promise<VisitaDeConsulta[]>
  export async function propiedadesYAsesores(propertyIds: string[], asesorIds: string[]): Promise<{ propiedades: Map<string, { address: string; neighborhood: string | null }>; asesores: Map<string, string> }>
  ```
  `GET /api/consultas?<filtros>&pagina=N` → `200 RespuestaBandeja`, `401`, `403` (abogado o rol desconocido), `400 { error }` (filtros).
- Alcance `propio`: `.or('assigned_to.eq.<id>,asesor_propiedad.eq.<id>')`. Validar el uuid antes, como `exigirUuid`. El `asesor` de la URL se ignora para el asesor (Review Focus 3).
- Lectura de a 1000 con orden fijo (`recibida_at` desc, `id` desc), tope de 20 páginas (patrón `todasLasVisitas`).
- `porPortal`/`porPropiedad` se cuentan sobre lo traído SIN el filtro de portal o de propiedad. Para eso se hace una segunda lectura sin ese filtro, y solo si el filtro está puesto. Esos conteos son los números que muestran los selectores.
- `visitasParaConsultas` va en dos consultas: `portal_inquiry_id in (...)` y `property_id in (...)`, en lotes de 200 ids, sin `cancelled`.

- [ ] **Step 1: Tests que fallan** (mockear `lib/consultas/datos` y `getUser`, como `app/api/visits/route.test.ts`):
  - abogado → 403;
  - asesor con `?asesor=<otro>` → `consultasDelPeriodo` recibe `alcance:{tipo:'propio'}` y `asesor:null`;
  - asesor con `?propiedad=<ajena>` → igual con alcance propio (la ajena no aparece porque la base filtra);
  - `?periodo=zzz` → período por defecto, no 400;
  - `?from=2026-10-05&to=2026-10-01` → 400;
  - la respuesta trae `porPagina: 25`, las tarjetas y los conteos.
- [ ] **Step 2:** `npx vitest run -c vitest.consultas.config.ts app/api/consultas` → FAIL.
- [ ] **Step 3:** Implementar `datos.ts` y la ruta (`export const dynamic = 'force-dynamic'`).
- [ ] **Step 4:** PASS. Prueba contra la base real con un script `scripts/_qa-consultas-api.ts`, sin commitear: llamar `consultasDelPeriodo` para los últimos 90 días con alcance `todo` y comparar el largo contra `select count(*) from consultas_unificadas where recibida_at >= …`. Tienen que ser iguales.
- [ ] **Step 5: Commit** `feat(consultas): GET /api/consultas`.

### Task 6: Conectar consulta ↔ propiedad

**Files:** Create: `lib/consultas/identificar.ts` (+ test), `app/api/consultas/[id]/propiedad/route.ts` (+ test). Modify: `app/api/portal-inquiries/identify/route.ts` (usa `identificarAviso`; misma respuesta `{ updatedInquiries }`).

**Interfaces — Produces:**
```ts
export async function identificarAviso(sb: SupabaseClient, d: { portal: string; externalCode: string; address: string; assignedTo: string; propertyId: string | null; externalUrl: string | null }): Promise<{ mapId: string; actualizadas: number }>   // el cuerpo actual de la ruta identify, movido tal cual
export async function conectarConsulta(sb: SupabaseClient, d: { consultaId: string; propertyId: string; recordar: boolean }): Promise<{ actualizadas: number; recordado: boolean }>
```
`POST /api/consultas/[id]/propiedad` body `{ propertyId: uuid, recordar: boolean }` → `200 { actualizadas, recordado }` | `403` (no operaciones: admin/dueño/coordinador) | `404` (consulta o propiedad inexistente) | `400`.
`conectarConsulta`: lee la consulta y la propiedad (`address`, `assigned_to`). Si `recordar` es verdadero y la consulta es de portal con `property_external_code` → `identificarAviso` con el `assigned_to` de la propiedad (y con `aviso_url`). Si no (es landing, no tiene código o `recordar` es falso) → actualiza solo esa consulta: `property_id`, `assigned_to`, `property_address`, `is_unmatched=false`, y `recordado:false`. Las landings ya tienen propiedad siempre; si llega una, se responde 400 `'Esta consulta ya tiene propiedad'`.

- [ ] **Step 1: Tests que fallan** (Supabase falso en memoria con las dos tablas):
  - con recordar → todas las consultas del mismo `portal`+código quedan con la propiedad, y se crea la fila del mapa;
  - sin recordar → solo esa;
  - consulta sin código y recordar → solo esa, `recordado:false` (Review Focus 4);
  - asesor → 403.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. Los tests existentes de `identify`, si los hay, siguen verdes. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat(consultas): conectar una consulta con su propiedad`.

### Task 7: Modo rápido de la ventana de agendar

**Files:** Modify: `lib/visitas/agendar-estado.ts` (+ test), `components/visitas/agendar/AgendarVisitaDialog.tsx`, `components/visitas/agendar/PasoCuando.tsx` (+ tests).

**Interfaces:**
- Produces:
  ```ts
  export interface InicioRapido { origen: OrigenVisita; origenDetalle?: string; persona: PersonaElegida; telefono?: string /* va a telefonoFaltante */ }
  export function estadoInicial(o: { propiedad?: PropiedadElegida | null; asesorPropio?: string | null; rapido?: InicioRapido | null }): EstadoAgendar
  // EstadoAgendar suma `rapido: boolean`. Con rapido y propiedad: paso='cuando', origen/persona/telefonoFaltante puestos.
  // pasosVisibles con rapido: ['cuando'] (+ 'asesor' si se navegó a él con "Cambiar") — 'confirmar' solo aparece si hay un 409 de duplicado.
  ```
  `AgendarVisitaDialog` suma la prop `rapido?: InicioRapido` y `onAgendada?: (visitaId: string, cuando: { fecha: string; hora: string }) => void`. El segundo argumento es nuevo; los llamadores viejos no se rompen.
- En modo rápido, el paso "cuándo" muestra arriba una tarjeta con quién (nombre + `leerTelefono(...).mostrado`), qué propiedad y el asesor (con "Cambiar" solo si `puedeElegirAsesor`, que lleva al paso asesor). Abajo, la casilla **"Ya la confirmé con la persona"** (marcada) y el botón principal **`Agendar ${dia} · ${hora}`** (por ejemplo, "Agendar jueves 30 · 17:00"), que llama a `enviar(false)`. Ante un 409 `VISITA_DUPLICADA`: `irA confirmar`, que ya muestra el duplicado.
- Persona `registro` (landing): `origen` = `origenDesdeLead({ source:'landing', utm }).origen`.

- [ ] **Step 1: Tests que fallan** (`agendar-estado.test.ts`):
  - `estadoInicial({ propiedad, rapido })` → `paso:'cuando'`, `pasosVisibles` = `['cuando']`;
  - `armarPedido` sobre ese estado + fecha/hora → `persona:{tipo:'consulta',id,telefono:'+549…'}`, `origen:'portal'`;
  - sin `rapido`, todo igual que antes (los tests viejos siguen pasando).

  Test de componente (`AgendarVisitaDialog.test.tsx`, patrón de los existentes con `fetch` mockeado): con `rapido` abre en "Día y hora"; tocar un día y una hora y "Agendar …" hace UN `POST /api/visits` con `portal_inquiry_id` implícito (`persona.tipo='consulta'`), y `onAgendada` recibe `(id, {fecha, hora})`.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** `npx vitest run -c vitest.consultas.config.ts lib/visitas/agendar-estado.test.ts components/visitas/agendar` → PASS (en frío puede tardar; esperar).
- [ ] **Step 5: Commit** `feat(visitas): ventana de agendar en modo rápido desde una consulta`.

### Task 8: "Confirmarle por WhatsApp"

**Files:** Create: `lib/consultas/confirmar.ts` (+ test).

**Interfaces — Produces:** `export function enlaceConfirmacion(d: { whatsapp: string; nombre: string | null; direccion: string; fecha: string; hora: string }): string`. Devuelve `https://wa.me/<whatsapp>?text=<encodeURIComponent(texto)>`. El texto es exacto: `Hola ${primerNombre || ''}! Te confirmo la visita a ${direccion} el ${formatearFechaLarga(instante)} a las ${hora}. Cualquier cosa me escribís por acá.` Usar `primerNombre` = primera palabra de `nombre` con mayúscula inicial; sin nombre, `Hola!`.

- [ ] **Step 1:** Tests:
  - sin nombre → empieza `Hola! Te confirmo`;
  - nombre `'MARÍA pérez'` → `Hola María!`;
  - la URL empieza `https://wa.me/5491161400496?text=`;
  - un salto de línea o un `&` en la dirección queda codificado.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(consultas): enlace para confirmar la visita por WhatsApp`.

### Task 9: Página `/consultas` (bandeja, filtros, lista, detalle)

**Files:** Create: `app/(dashboard)/consultas/page.tsx` (server: `requireAuth`, `redirect('/')` si el rol no está en los cuatro; `<Suspense>` + `ConsultasClient`), `app/(dashboard)/consultas/ConsultasClient.tsx`, `components/consultas/TarjetasAtender.tsx`, `FiltrosConsultas.tsx`, `ListaConsultas.tsx`, `FilaConsulta.tsx`, `DetalleConsulta.tsx`, y los tests `app/(dashboard)/consultas/page.test.tsx` y `page.movil.test.tsx`.

**Interfaces:**
- Consumes: `GET /api/consultas` (Tarea 5), `useFiltrosUrl` + `usePedidosVersionados` (como `app/(dashboard)/visits/page.tsx`), `FILTROS_DEFECTO_CONSULTAS` y los permitidos (Tarea 4), `agruparPorDia`, `leerRespuesta`.
- Produces: `ConsultasClient` arma `abrirAgendar(c: ConsultaEnBandeja)`, que despacha según `c.accion` hacia las hojas de la Tarea 10.

Comportamiento (copiar el lienzo, pantallas "Compu · Bandeja" y "Celular · 1"):
- Encabezado "Consultas" + pestañas **Bandeja** | **Estadísticas**. Estadísticas queda deshabilitada, con el texto "Próximamente" (Entrega 2).
- Las 3 tarjetas: tocar una aplica `estado=sin_visita` / `propiedad=sin` / `telefono=revisar`. La activa queda marcada.
- Los filtros son selects con conteo (`porPortal`, `porPropiedad`). "⚠ Sin propiedad identificada" es la PRIMERA opción después de "Todas". El asesor (solo si `puedeVerTodasLasVisitas`) incluye "Sin asesor". La búsqueda usa `BusquedaTexto`. En el celular, los filtros van en una hoja inferior ("Filtros · N") y las tarjetas en una fila con scroll horizontal propio. Esto NO genera scroll horizontal en la página.
- La lista va agrupada por día. Cada fila muestra lo que pide el spec §3.2. Teléfono: `tel.ok ? tel.mostrado : 'Teléfono a revisar'`. Para MercadoLibre sin datos: "MercadoLibre no comparte el contacto". Con `repetidas > 1`, la etiqueta "`N consultas`". Botón "Agendar visita" (min-h 44 px). Si tiene visita: "Visita jue 30 · 17:00", con enlace a `/visits/<id>`.
- "Ver más" pide `pagina+1` y agrega, **deduplicando por `id`** (Review Focus 2). Debajo va "Mostrando X de `total`".
- El detalle se abre al tocar la fila: `Sheet` lateral en la compu y pantalla completa en el celular. Muestra:
  - el teléfono mostrado y "Lo dejó como «crudo»" si `corregido`;
  - los botones *Abrir WhatsApp* (`https://wa.me/<whatsapp>`) y *Llamar* (`tel:+<whatsapp>`);
  - la propiedad, el enlace al aviso y el mensaje;
  - "Otras consultas de esta persona" (las filas traídas con el mismo `tel.whatsapp`);
  - el botón "Agendar visita".

- [ ] **Step 1: Tests que fallan** (`page.test.tsx`, `fetch` mockeado):
  - pinta los grupos por día en orden;
  - tocar "Sin propiedad identificada" pone `propiedad=sin` en la URL (mock de `useRouter`, como el test de visits);
  - "Ver más" con una fila repetida no la duplica;
  - el asesor no ve el select de asesor.

  `page.movil.test.tsx` (patrón de `app/(dashboard)/visits/page.movil.test.tsx`): todos los `button` y `a` interactivos tienen la clase `min-h-11` o `h-11` o más.
- [ ] **Step 2:** FAIL. **Step 3:** implementar. **Step 4:** PASS + `tsc -p tsconfig.consultas.json`.
- [ ] **Step 5: Commit** `feat(consultas): bandeja de consultas`.

### Task 10: Hojas de agendar (sin propiedad, teléfono, listo)

**Files:** Create: `components/consultas/HojaElegirPropiedad.tsx`, `HojaRevisarTelefono.tsx`, `HojaVisitaAgendada.tsx`, `AgendarDesdeConsulta.tsx` (+ `AgendarDesdeConsulta.test.tsx`).

**Interfaces:**
- Consumes: Tareas 1, 6, 7 y 8; `GET /api/visits/propiedades?q=` (ya existe; el asesor ve solo las suyas).
- Produces: `<AgendarDesdeConsulta consulta={c} puedeIdentificar={boolean} onTerminado={(visita: {id, fecha, hora}) => void} onCerrar={() => void} />`. Es una máquina chica: `elegir_propiedad` → (`revisar_telefono` | `pedir_telefono`) → `AgendarVisitaDialog` en modo rápido → `HojaVisitaAgendada`.

Comportamiento (lienzo, pantallas 2b, 2c y 3):
- **Elegir propiedad**:
  - Arriba, lo que sabemos del aviso: portal, código, título y enlace.
  - Buscador; primero van las propiedades del mismo barrio. El barrio sale de `aviso_direccion`: si contiene el `neighborhood` de alguna propiedad, esas van primero.
  - Casilla "Recordar que este aviso es <dirección>", marcada. Se ve solo si `puedeIdentificar` y hay `aviso_codigo`.
  - Botón "Seguir" → `POST /api/consultas/[id]/propiedad`. Si el que agenda es asesor (`puedeIdentificar` falso), la hoja dice "Pedile a un coordinador que identifique este aviso" y no deja seguir. **Decisión del plan:** el spec dice que solo operaciones identifica avisos, y `POST /api/visits` exige que la consulta tenga la propiedad.
- **Revisar teléfono**:
  - Lo que dejó, más `MOTIVO_TEXTO`.
  - Campo partido `+54 9` (fijo) | característica (`inputMode="numeric"`) | número, con `armarDesdePartes` en vivo.
  - Vista previa "Así queda guardado: `mostrado`" y el enlace "Probar: abrir este chat en WhatsApp".
  - El desplegable "Es un número de otro país" lleva a un campo libre que exige `+`.
  - "Usar este número" queda deshabilitado mientras no sea `ok`. El canónico pasa como `rapido.telefono`.
  - En `pedir_telefono`, el mismo campo sin el aviso del crudo, y nombre opcional.
- **Listo**:
  - Título "Visita agendada · jueves 30 · 17:00".
  - Botón principal **"Confirmarle por WhatsApp"** (`enlaceConfirmacion`, `target="_blank"`).
  - Además, "Ver la visita" (`/visits/<id>`) y "Volver a consultas", que cierra y re-pide la bandeja.

- [ ] **Step 1: Tests que fallan:**
  - consulta sin propiedad y coordinador: elegir una propiedad con "Recordar" hace `POST …/propiedad {recordar:true}` ANTES del `POST /api/visits`;
  - teléfono `4941-0027`: el botón queda deshabilitado; al escribir la característica `11` pasa a habilitado y el `POST /api/visits` lleva `persona.telefono:'+5491149410027'` (criterio 8);
  - asesor + sin propiedad: no hay botón Seguir;
  - Listo: el enlace empieza `https://wa.me/549`.
- [ ] **Step 2–4:** FAIL → implementar → PASS.
- [ ] **Step 5: Commit** `feat(consultas): agendar desde una consulta (sin propiedad, teléfono, listo)`.

### Task 11: Menú, barra del celular, redirección y enlaces

**Files:** Modify: `lib/nav/sections.ts` (+ `sections.test.ts`), `lib/nav/bottom-bar.ts` (+ test, si existe), `app/(dashboard)/inbox/InboxTabs.tsx`, `app/(dashboard)/inbox/page.tsx`, `components/properties/PropertyInquiriesCard.tsx`, `components/metrics/PropertyInquiriesPanel.tsx`. Delete: `app/(dashboard)/inbox/PortalInquiriesClient.tsx` (antes, `grep -rn PortalInquiriesClient` → único uso en `InboxTabs`).

**Interfaces — Produces:** `const CONSULTAS: NavItem = { href: '/consultas', label: 'Consultas', icon: MessageSquareText }`.
- Asesor: "Mi día" = `[INBOX, CONSULTAS, CRM, VISITAS, Mis contactos]`.
- Coordinador, admin y dueño: "Comercial" = `[INBOX, CONSULTAS, AVISOS, CRM, CONTACTOS, VISITAS]`.
- Abogado: sin cambios.
- `PREFERENCIA_DE_DESTINOS`: `'/consultas'` va inmediatamente después de `'/inbox'`.
- `inbox/page.tsx`: si `searchParams.tab === 'consultas'` → `redirect('/consultas')`. Se saca la pestaña de `PESTANAS`/`Tab` en `InboxTabs` (un `?tab=consultas` que llegue igual cae en la inicial).
- Ficha: `href={`/consultas?propiedad=${propertyId}&periodo=30d`}`. Panel de métricas: `/consultas`.

- [ ] **Step 1: Tests que fallan:**
  - `sections.test.ts` fija los arreglos nuevos por rol, y que el abogado no tiene `/consultas`;
  - la barra del celular del asesor incluye `/consultas`;
  - el test del Inbox (si fija tres pestañas) pasa a dos.
- [ ] **Step 2–4:** FAIL → implementar → PASS (`npx vitest run -c vitest.consultas.config.ts lib/nav`).
- [ ] **Step 5: Commit** `feat(consultas): entrada en el menú y redirección desde el Inbox`.

### Task 12: Revisión, QA en la vista previa y despliegue

- [ ] **Step 1:** Correr todas las pruebas: `npx vitest run -c vitest.consultas.config.ts` y `npx vitest run -c vitest.visitas.config.ts` → todo verde. `tsc -p tsconfig.consultas.json` y `-p tsconfig.visitas.json` limpios.
- [ ] **Step 2:** Revisión adversarial de toda la rama (un revisor nuevo, el modelo más capaz) contra el spec y este Review Focus. Corregir lo confirmado.
- [ ] **Step 3:** Push y PR (`gh pr create`, cuerpo en castellano con los criterios y el cierre de la atribución).
- [ ] **Step 4:** QA en la vista previa de Netlify con el navegador de Claude (`scripts/navegador-claude.sh abrir`, usuario "Claude · pruebas"):
  - criterios 1–12 y 14 uno por uno;
  - 390×844 con emulación táctil para el 12;
  - la visita de prueba sobre una consulta de una propiedad `[TEST]`, sin email (no sale nada al cliente);
  - borrar después la visita y el comprador de prueba.
- [ ] **Step 5:** Merge (`gh pr merge`), esperar el deploy de producción y abrir `/consultas` en producción. Actualizar CLAUDE.md con una sección corta de gotchas (regla del 549, el estado derivado, la vista) y la memoria.
