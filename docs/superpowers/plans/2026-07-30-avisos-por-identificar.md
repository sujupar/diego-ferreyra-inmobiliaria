# Avisos por identificar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que Paula (coordinadora, perfil no técnico) resuelva sola, en 3 pasos, los avisos de portales cuyas consultas llegan sin asesor ni propiedad identificada.

**Architecture:** El link del portal es la llave: el número que lo cierra es el mismo `properties.import_external_id`, así que pegarlo resuelve propiedad + asesor sin scraping. La UI trabaja por AVISO (13 pendientes) y no por consulta (43): identificar uno corrige hacia atrás todas sus consultas y deja el ruteo resuelto para las futuras. Sin migraciones — todas las columnas ya existen.

**Tech Stack:** Next.js 16 (App Router) + Supabase (service-role, tablas `portal_*` sin tipar) + shadcn/ui (`dialog`, `select`, `input`, `label`, `card`, `badge`, `button`) + sonner (toasts) + vitest.

## Global Constraints

- **Rama de trabajo: `feat/avisos-por-identificar`** (ya creada desde `origin/main`). NO commitear en `main`; el merge y el deploy los decide el usuario. Ojo: `main` está tomado por otro worktree — no hagas `git checkout main`.
- Commit author DEBE ser `Sujupar <redstyle50@gmail.com>` (ya configurado); todo commit termina con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Sin migraciones de base de datos.** Las columnas que se escriben (`portal_property_map.address/assigned_to/property_id/external_url`, `portal_inquiries.assigned_to/property_id/property_address/is_unmatched/matched_map_id`) ya existen.
- **Alcance: SOLO rutear.** Identificar un aviso NUNCA crea una ficha de propiedad.
- **La dirección es obligatoria** en el formulario. El botón de guardar queda deshabilitado sin dirección Y sin asesor.
- **Nunca mostrar un error técnico en la UI.** Los mensajes exactos están en la tabla de errores de cada task; usalos literales.
- Acceso: roles `coordinador`, `admin` y `dueno`. Asesores y abogado NO ven el ítem de menú ni pueden usar los endpoints.
- Prosa, labels y mensajes en **español (es-AR)**, tuteo rioplatense.
- **Typecheck:** `npx tsc --noEmit` arroja **4 errores PREEXISTENTES** en tests ajenos (`lib/landing/enrich.test.ts`, `lib/marketing/copy-templates.test.ts`, `lib/portals/mercadolibre/mapping.test.ts`, `lib/portals/validation.test.ts`). El gate es **"siguen siendo 4"**, no cero.
- **Tests:** SIEMPRE con `--pool=threads` (`npx vitest run <archivo> --pool=threads`); sin ese flag el runner se cuelga por el acento en la ruta del proyecto.
- Los comandos con rutas van entre comillas por el espacio/acento: `cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"`.
- Gotcha del entorno: si `git commit` falla con `index.lock ... Operation timed out`, corré `rm -f .git/index.lock` y reintentá una vez.

---

## Contexto para el implementador

Los emails de ZonaProp traen solo `CÓD:2DLPOM` + un título genérico, nunca la dirección. El cron (`app/api/cron/portal-inquiries/route.ts`) busca ese código en `portal_property_map` para resolver propiedad y asesor; si no lo encuentra, ya **auto-registra** una fila del mapa con `portal + external_code + title` y deja la consulta con `property_id = NULL` y `assigned_to = NULL`. Esta feature es la interfaz que completa esas filas.

Datos reales al momento de escribir el plan: 43 consultas sin identificar desde el 01/06, agrupadas en 13 avisos; 21 de 23 propiedades activas tienen `import_external_id` (el ID del aviso de ZonaProp).

## Archivos

**Nuevos:**
- `lib/portals/portal-link.ts` + `.test.ts` — parser puro de links de portal.
- `lib/portals/unidentified.ts` + `.test.ts` — agrupador puro de consultas → avisos pendientes.
- `app/api/portal-inquiries/unidentified/route.ts` — GET de la lista.
- `app/api/portal-inquiries/resolve-link/route.ts` — GET que resuelve un link a una propiedad.
- `app/api/portal-inquiries/identify/route.ts` — POST que identifica el aviso y corrige las consultas.
- `app/(dashboard)/avisos/page.tsx` — la pantalla (lista).
- `components/inbox/IdentifyAvisoDialog.tsx` — el formulario de 3 pasos.
- `components/inbox/UnidentifiedBanner.tsx` — el cartel del inicio.

**Modificados:**
- `app/(dashboard)/tasks/page.tsx` — montar el cartel.
- `app/(dashboard)/layout.tsx` — ítem de menú para coordinador/admin/dueño.

---

### Task 1: Parser de links de portal (TDD, lógica pura)

**Files:**
- Create: `lib/portals/portal-link.ts`
- Test: `lib/portals/portal-link.test.ts`

**Interfaces:**
- Consumes: nada (módulo puro, sin imports).
- Produces: `export interface PortalLink { portal: 'zonaprop' | 'argenprop'; externalId: string }` y `export function parsePortalLink(raw: string | null | undefined): PortalLink | null`. Las Tasks 3 y 4 la usan.

- [ ] **Step 1: Escribir el test (RED)**

Crear `lib/portals/portal-link.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parsePortalLink } from './portal-link'

describe('parsePortalLink', () => {
  it('extrae el id de un link real de ZonaProp', () => {
    expect(parsePortalLink('https://www.zonaprop.com.ar/propiedades/clasificado/veclphin-venta-ph-4-ambientes-al-frente-con-patio-terraza-y-59439609.html'))
      .toEqual({ portal: 'zonaprop', externalId: '59439609' })
  })

  it('tolera parámetros de tracking al final del link de ZonaProp', () => {
    expect(parsePortalLink('https://www.zonaprop.com.ar/propiedades/clasificado/veclapin-depto-2-amb-58990213.html?n_src=Listado&n_pos=17'))
      .toEqual({ portal: 'zonaprop', externalId: '58990213' })
  })

  it('extrae el id de un link real de Argenprop', () => {
    expect(parsePortalLink('https://www.argenprop.com/departamento-en-venta-en-palermo--18191220'))
      .toEqual({ portal: 'argenprop', externalId: '18191220' })
  })

  it('tolera espacios alrededor (pegado desde el navegador)', () => {
    expect(parsePortalLink('  https://www.zonaprop.com.ar/propiedades/clasificado/x-59072999.html  '))
      .toEqual({ portal: 'zonaprop', externalId: '59072999' })
  })

  it('acepta el link sin https:// (algunos navegadores lo ocultan al copiar)', () => {
    expect(parsePortalLink('www.zonaprop.com.ar/propiedades/clasificado/x-59341760.html'))
      .toEqual({ portal: 'zonaprop', externalId: '59341760' })
  })

  it('devuelve null para un link de otro sitio', () => {
    expect(parsePortalLink('https://www.mercadolibre.com.ar/MLA-1234567890')).toBeNull()
  })

  it('devuelve null si el link del portal no tiene id numérico', () => {
    expect(parsePortalLink('https://www.zonaprop.com.ar/inmobiliarias/diego-ferreyra.html')).toBeNull()
  })

  it('devuelve null para texto suelto, vacío o nulo', () => {
    expect(parsePortalLink('el aviso de la casa de belgrano')).toBeNull()
    expect(parsePortalLink('')).toBeNull()
    expect(parsePortalLink(null)).toBeNull()
    expect(parsePortalLink(undefined)).toBeNull()
  })

  it('ignora números cortos que no son ids de aviso', () => {
    expect(parsePortalLink('https://www.zonaprop.com.ar/propiedades/clasificado/casa-2-ambientes-123.html')).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test — debe FALLAR**

Run: `cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria" && npx vitest run lib/portals/portal-link.test.ts --pool=threads`
Expected: FAIL — `Cannot find module './portal-link'`.

- [ ] **Step 3: Implementar (GREEN)**

Crear `lib/portals/portal-link.ts`:

```ts
/**
 * Parser del link público de un aviso de portal → { portal, externalId }.
 *
 * Para qué sirve: `properties.import_external_id` guarda ese mismo id, así que
 * con el link pegado se encuentra la propiedad en el CRM sin scrapear nada
 * (verificado 2026-07-30: 21 de 23 propiedades activas lo tienen).
 *
 * Es deliberadamente TOLERANTE con lo que pega una persona: espacios alrededor,
 * link sin esquema, parámetros de tracking. Y deliberadamente ESTRICTO con lo
 * que devuelve: si no reconoce el portal o no encuentra un id de aviso creíble,
 * devuelve null y la UI muestra el mensaje de ayuda (nunca un error técnico).
 */

export interface PortalLink {
  portal: 'zonaprop' | 'argenprop'
  externalId: string
}

/** Los ids de aviso son largos (8 dígitos ZonaProp, 8 Argenprop). Este piso
 *  evita confundir un "2-ambientes-123" con un id real. */
const MIN_ID_DIGITS = 6

export function parsePortalLink(raw: string | null | undefined): PortalLink | null {
  const url = (raw ?? '').trim()
  if (!url) return null

  const portal: PortalLink['portal'] | null =
    /(^|\.|\/\/)zonaprop\.com\.ar/i.test(url) ? 'zonaprop'
    : /(^|\.|\/\/)argenprop\.com/i.test(url) ? 'argenprop'
    : null
  if (!portal) return null

  // Cortar querystring y hash: el id vive en el path.
  const path = url.split(/[?#]/)[0]
  // El id es el ÚLTIMO grupo largo de dígitos del path (ambos portales lo ponen
  // al final: "...-59439609.html" y "...--18191220").
  const matches = path.match(new RegExp(`\\d{${MIN_ID_DIGITS},}`, 'g'))
  if (!matches || matches.length === 0) return null

  return { portal, externalId: matches[matches.length - 1] }
}
```

- [ ] **Step 4: Correr el test — debe PASAR**

Run: `npx vitest run lib/portals/portal-link.test.ts --pool=threads`
Expected: PASS (9 tests).

- [ ] **Step 5: Typecheck y commit**

```bash
cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"
npx tsc --noEmit 2>&1 | grep -c "error TS"   # esperado: 4
git add lib/portals/portal-link.ts lib/portals/portal-link.test.ts
git commit -m "feat(avisos): parser del link de portal → id del aviso

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Lista de avisos pendientes (agrupador puro + endpoint)

**Files:**
- Create: `lib/portals/unidentified.ts`
- Test: `lib/portals/unidentified.test.ts`
- Create: `app/api/portal-inquiries/unidentified/route.ts`

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces:
  - `export interface UnidentifiedInquiryRow { portal: string; property_external_code: string | null; raw_subject: string | null; lead_name: string | null; created_at: string; received_at: string | null }`
  - `export interface UnidentifiedAviso { portal: string; externalCode: string; title: string | null; inquiryCount: number; lastInquiryAt: string; lastLeadName: string | null }`
  - `export function groupUnidentified(rows: UnidentifiedInquiryRow[]): UnidentifiedAviso[]` (orden: más consultas primero; a igual cantidad, más reciente primero).
  - `GET /api/portal-inquiries/unidentified` → `{ data: UnidentifiedAviso[] }`. Lo consumen las Tasks 4 y 5.

- [ ] **Step 1: Escribir el test del agrupador (RED)**

Crear `lib/portals/unidentified.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { groupUnidentified, type UnidentifiedInquiryRow } from './unidentified'

const row = (over: Partial<UnidentifiedInquiryRow>): UnidentifiedInquiryRow => ({
  portal: 'zonaprop',
  property_external_code: '2DLPOM',
  raw_subject: '📩 ¡Recibiste una nueva consulta por el aviso Departamento 2 Ambientes en Excelente Estado! CÓD:2DLPOM - REF:#308621506#',
  lead_name: 'Marcelo',
  created_at: '2026-07-29T17:55:00Z',
  received_at: '2026-07-29T17:50:00Z',
  ...over,
})

describe('groupUnidentified', () => {
  it('agrupa varias consultas del mismo aviso en un solo ítem', () => {
    const out = groupUnidentified([
      row({ lead_name: 'Marcelo', created_at: '2026-07-29T17:55:00Z' }),
      row({ lead_name: 'Ana', created_at: '2026-07-28T10:00:00Z' }),
      row({ lead_name: 'Luis', created_at: '2026-07-27T09:00:00Z' }),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].externalCode).toBe('2DLPOM')
    expect(out[0].inquiryCount).toBe(3)
  })

  it('usa la consulta más reciente para la fecha y el nombre mostrados', () => {
    const out = groupUnidentified([
      row({ lead_name: 'Ana', created_at: '2026-07-28T10:00:00Z' }),
      row({ lead_name: 'Marcelo', created_at: '2026-07-29T17:55:00Z' }),
    ])
    expect(out[0].lastLeadName).toBe('Marcelo')
    expect(out[0].lastInquiryAt).toBe('2026-07-29T17:55:00Z')
  })

  it('saca el título legible del asunto del email', () => {
    const out = groupUnidentified([row({})])
    expect(out[0].title).toBe('Departamento 2 Ambientes en Excelente Estado')
  })

  it('deja el título en null si el asunto no tiene el formato conocido', () => {
    const out = groupUnidentified([row({ raw_subject: 'Guido te ha enviado un mensaje' })])
    expect(out[0].title).toBeNull()
  })

  it('separa avisos distintos y ordena por cantidad de consultas', () => {
    const out = groupUnidentified([
      row({ property_external_code: 'AAA1', created_at: '2026-07-20T10:00:00Z' }),
      row({ property_external_code: 'BBB2', created_at: '2026-07-21T10:00:00Z' }),
      row({ property_external_code: 'BBB2', created_at: '2026-07-22T10:00:00Z' }),
    ])
    expect(out.map(a => a.externalCode)).toEqual(['BBB2', 'AAA1'])
  })

  it('a igual cantidad de consultas, primero el aviso con actividad más reciente', () => {
    const out = groupUnidentified([
      row({ property_external_code: 'VIEJO', created_at: '2026-07-01T10:00:00Z' }),
      row({ property_external_code: 'NUEVO', created_at: '2026-07-29T10:00:00Z' }),
    ])
    expect(out.map(a => a.externalCode)).toEqual(['NUEVO', 'VIEJO'])
  })

  it('descarta las consultas sin código (no hay aviso que identificar)', () => {
    const out = groupUnidentified([row({ property_external_code: null })])
    expect(out).toEqual([])
  })

  it('trata el mismo código en portales distintos como avisos distintos', () => {
    const out = groupUnidentified([
      row({ portal: 'zonaprop', property_external_code: 'X123456' }),
      row({ portal: 'argenprop', property_external_code: 'X123456' }),
    ])
    expect(out).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Correr el test — debe FALLAR**

Run: `cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria" && npx vitest run lib/portals/unidentified.test.ts --pool=threads`
Expected: FAIL — `Cannot find module './unidentified'`.

- [ ] **Step 3: Implementar el agrupador (GREEN)**

Crear `lib/portals/unidentified.ts`:

```ts
/**
 * Agrupa las consultas SIN identificar por aviso.
 *
 * El punto de la feature: 43 consultas pendientes vienen de 13 avisos. La
 * coordinadora trabaja por AVISO (identificar uno arregla todas sus consultas,
 * pasadas y futuras), así que la UI muestra avisos, no consultas.
 *
 * Puro y testeable: la ruta le pasa las filas y muestra lo que devuelve.
 */

export interface UnidentifiedInquiryRow {
  portal: string
  property_external_code: string | null
  raw_subject: string | null
  lead_name: string | null
  created_at: string
  received_at: string | null
}

export interface UnidentifiedAviso {
  portal: string
  externalCode: string
  title: string | null
  inquiryCount: number
  lastInquiryAt: string
  lastLeadName: string | null
}

/**
 * Título legible desde el asunto de ZonaProp:
 *   "📩 ¡Recibiste una nueva consulta por el aviso <TÍTULO>! CÓD:XXXX - REF:#N#"
 * Argenprop no lo trae con ese formato → null (la UI muestra solo el código).
 */
export function titleFromSubject(subject: string | null | undefined): string | null {
  if (!subject) return null
  const m = subject.match(/aviso\s+(.+?)\s*\.{0,3}!?\s*C[ÓO]D:/i)
  const title = m?.[1]?.trim().replace(/[.\u2026\s]+$/, '')
  return title ? title : null
}

export function groupUnidentified(rows: UnidentifiedInquiryRow[]): UnidentifiedAviso[] {
  const byAviso = new Map<string, UnidentifiedAviso>()

  for (const r of rows) {
    const code = r.property_external_code?.trim()
    if (!code) continue // sin código no hay aviso que identificar
    const key = `${r.portal}::${code}`
    const existing = byAviso.get(key)
    const isNewer = !existing || r.created_at > existing.lastInquiryAt

    if (!existing) {
      byAviso.set(key, {
        portal: r.portal,
        externalCode: code,
        title: titleFromSubject(r.raw_subject),
        inquiryCount: 1,
        lastInquiryAt: r.created_at,
        lastLeadName: r.lead_name,
      })
      continue
    }

    existing.inquiryCount++
    if (isNewer) {
      existing.lastInquiryAt = r.created_at
      existing.lastLeadName = r.lead_name
    }
    // El título puede faltar en algunos asuntos; nos quedamos con el primero que aparezca.
    if (!existing.title) existing.title = titleFromSubject(r.raw_subject)
  }

  return [...byAviso.values()].sort(
    (a, b) => b.inquiryCount - a.inquiryCount || b.lastInquiryAt.localeCompare(a.lastInquiryAt),
  )
}
```

- [ ] **Step 4: Correr el test — debe PASAR**

Run: `npx vitest run lib/portals/unidentified.test.ts --pool=threads`
Expected: PASS (8 tests).

- [ ] **Step 5: Crear el endpoint**

Crear `app/api/portal-inquiries/unidentified/route.ts`:

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { groupUnidentified, type UnidentifiedInquiryRow } from '@/lib/portals/unidentified'

export const dynamic = 'force-dynamic'

// Cliente service-role sin tipar: las tablas portal_* no están en
// database.types (misma convención que app/api/portal-inquiries/route.ts).
function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED_ROLES = ['admin', 'dueno', 'coordinador']

/**
 * GET /api/portal-inquiries/unidentified
 *
 * Los avisos cuyas consultas llegaron sin propiedad identificada, agrupados
 * (un ítem por aviso, no por consulta). Alimenta la pantalla "Avisos por
 * identificar" y el cartel del inicio.
 */
export async function GET() {
  try {
    const user = await requireAuth()
    if (!ALLOWED_ROLES.includes(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const supabase = getAdmin()
    const { data, error } = await supabase
      .from('portal_inquiries')
      .select('portal, property_external_code, raw_subject, lead_name, created_at, received_at')
      .is('property_id', null)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data: groupUnidentified((data ?? []) as UnidentifiedInquiryRow[]) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
```

- [ ] **Step 6: Typecheck y commit**

```bash
cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"
npx tsc --noEmit 2>&1 | grep -c "error TS"   # esperado: 4
git add lib/portals/unidentified.ts lib/portals/unidentified.test.ts app/api/portal-inquiries/unidentified/route.ts
git commit -m "feat(avisos): lista de avisos pendientes agrupada por aviso

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Endpoints de resolución e identificación

**Files:**
- Create: `app/api/portal-inquiries/resolve-link/route.ts`
- Create: `app/api/portal-inquiries/identify/route.ts`

**Interfaces:**
- Consumes: `parsePortalLink(raw): PortalLink | null` de `@/lib/portals/portal-link` (Task 1).
- Produces:
  - `GET /api/portal-inquiries/resolve-link?url=<link>` → 200 `{ portal, externalId, property: { id, address, assignedTo, assignedName } | null }` · 400 `{ error: 'link_invalido' }`.
  - `POST /api/portal-inquiries/identify` body `{ portal, externalCode, address, assignedTo, propertyId?, externalUrl? }` → 200 `{ updatedInquiries: number }`.
  - La Task 4 consume ambos.

- [ ] **Step 1: Crear el endpoint que resuelve el link**

Crear `app/api/portal-inquiries/resolve-link/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { parsePortalLink } from '@/lib/portals/portal-link'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED_ROLES = ['admin', 'dueno', 'coordinador']

/**
 * GET /api/portal-inquiries/resolve-link?url=<link del aviso>
 *
 * Traduce el link pegado a la propiedad del CRM: del link sale el id del aviso,
 * y ese id es `properties.import_external_id`. Si aparece, devolvemos su
 * dirección y su asesor para autocompletar el formulario; si no, `property:null`
 * (no es un error: la propiedad puede no estar cargada, que es el caso que esta
 * feature vino a resolver). NO scrapea el portal.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    if (!ALLOWED_ROLES.includes(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const link = parsePortalLink(req.nextUrl.searchParams.get('url'))
    if (!link) return NextResponse.json({ error: 'link_invalido' }, { status: 400 })

    const supabase = getAdmin()
    const { data: prop } = await supabase
      .from('properties')
      .select('id, address, assigned_to')
      .eq('import_external_id', link.externalId)
      .neq('status', 'descartada')
      .limit(1)
      .maybeSingle()

    let assignedName: string | null = null
    if (prop?.assigned_to) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', prop.assigned_to)
        .maybeSingle()
      assignedName = (profile as { full_name?: string | null } | null)?.full_name ?? null
    }

    return NextResponse.json({
      portal: link.portal,
      externalId: link.externalId,
      property: prop
        ? { id: prop.id, address: prop.address, assignedTo: prop.assigned_to, assignedName }
        : null,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Crear el endpoint que identifica el aviso**

Crear `app/api/portal-inquiries/identify/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/require-role'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED_ROLES = ['admin', 'dueno', 'coordinador']

const Schema = z.object({
  portal: z.string().trim().min(1).max(40),
  externalCode: z.string().trim().min(1).max(60),
  address: z.string().trim().min(3).max(200), // obligatoria por decisión de producto
  assignedTo: z.string().uuid(),
  propertyId: z.string().uuid().nullable().optional(),
  externalUrl: z.string().trim().max(500).nullable().optional(),
})

/**
 * POST /api/portal-inquiries/identify
 *
 * Identifica un aviso: completa su fila en portal_property_map y corrige HACIA
 * ATRÁS todas las consultas de ese código (asesor, propiedad, dirección). Las
 * consultas futuras del mismo aviso rutean solas por código.
 *
 * Idempotente: volver a identificar el mismo aviso pisa los valores anteriores
 * (así se corrige una identificación equivocada).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    if (!ALLOWED_ROLES.includes(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
    }
    const d = parsed.data
    const supabase = getAdmin()

    // 1) Completar (o crear) la fila del mapa de ese aviso.
    const record = {
      portal: d.portal,
      external_code: d.externalCode,
      address: d.address,
      assigned_to: d.assignedTo,
      property_id: d.propertyId ?? null,
      external_url: d.externalUrl || null,
      active: true,
    }
    const { data: existing } = await supabase
      .from('portal_property_map')
      .select('id')
      .eq('portal', d.portal)
      .eq('external_code', d.externalCode)
      .maybeSingle()

    let mapId: string | null = (existing as { id?: string } | null)?.id ?? null
    if (mapId) {
      const { error } = await supabase.from('portal_property_map').update(record).eq('id', mapId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { data: created, error } = await supabase
        .from('portal_property_map')
        .insert(record)
        .select('id')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      mapId = (created as { id: string }).id
    }

    // 2) Corregir hacia atrás las consultas de ese aviso.
    const { data: updated, error: updErr } = await supabase
      .from('portal_inquiries')
      .update({
        assigned_to: d.assignedTo,
        property_id: d.propertyId ?? null,
        property_address: d.address,
        matched_map_id: mapId,
        is_unmatched: false,
      })
      .eq('portal', d.portal)
      .eq('property_external_code', d.externalCode)
      .select('id')
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    return NextResponse.json({ updatedInquiries: (updated ?? []).length })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria" && npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `4`.

- [ ] **Step 4: Commit**

```bash
cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"
git add app/api/portal-inquiries/resolve-link/route.ts app/api/portal-inquiries/identify/route.ts
git commit -m "feat(avisos): endpoints para resolver el link e identificar el aviso

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: La pantalla — lista de avisos + formulario de 3 pasos

**Files:**
- Create: `components/inbox/IdentifyAvisoDialog.tsx`
- Create: `app/(dashboard)/avisos/page.tsx`

**Interfaces:**
- Consumes: `GET /api/portal-inquiries/unidentified` (Task 2); `GET /api/portal-inquiries/resolve-link?url=` y `POST /api/portal-inquiries/identify` (Task 3); `GET /api/users/advisors` → `{ data: [{ id, full_name }] }` (ya existe); `GET /api/properties?limit=…` → `{ data: [{ id, address, assigned_to }] }` (ya existe).
- Produces: la ruta `/avisos` y el componente `<IdentifyAvisoDialog aviso={...} advisors={...} onDone={...} />`. La Task 5 enlaza a `/avisos`.

No hay tests de componentes de dashboard en este repo (el único test de UI es de un modal del funnel); la verificación es tsc + la prueba manual de la Task 5.

- [ ] **Step 1: Crear el formulario de 3 pasos**

Crear `components/inbox/IdentifyAvisoDialog.tsx`:

```tsx
'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, CheckCircle2, Info, ChevronDown } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'

export interface AvisoPendiente {
  portal: string
  externalCode: string
  title: string | null
  inquiryCount: number
  lastInquiryAt: string
  lastLeadName: string | null
}

interface Advisor { id: string; full_name: string | null }
interface PropertyOption { id: string; address: string; assigned_to: string | null }

/** Lo que el sistema dedujo del link (o de la propiedad elegida a mano). */
interface Resolved {
  propertyId: string | null
  address: string
  assignedTo: string
  assignedName: string | null
}

export function IdentifyAvisoDialog({
  aviso, advisors, properties, onDone,
}: {
  aviso: AvisoPendiente
  advisors: Advisor[]
  properties: PropertyOption[]
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [link, setLink] = useState('')
  const [checking, setChecking] = useState(false)
  const [hint, setHint] = useState<{ kind: 'ok' | 'info' | 'error'; text: string } | null>(null)
  const [address, setAddress] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState(false)

  const apply = (r: Resolved) => {
    setPropertyId(r.propertyId)
    setAddress(r.address)
    setAssignedTo(r.assignedTo)
  }

  async function resolveLink(value: string) {
    setLink(value)
    const trimmed = value.trim()
    if (!trimmed) { setHint(null); return }
    setChecking(true)
    setHint(null)
    try {
      const res = await fetch(`/api/portal-inquiries/resolve-link?url=${encodeURIComponent(trimmed)}`)
      if (res.status === 400) {
        setHint({ kind: 'error', text: 'Ese link no parece de ZonaProp ni de Argenprop. Copialo desde la barra de direcciones del navegador.' })
        return
      }
      if (!res.ok) throw new Error(String(res.status))
      const data = await res.json() as {
        property: { id: string; address: string; assignedTo: string | null; assignedName: string | null } | null
      }
      if (data.property && data.property.assignedTo) {
        apply({
          propertyId: data.property.id,
          address: data.property.address ?? '',
          assignedTo: data.property.assignedTo,
          assignedName: data.property.assignedName,
        })
        setHint({ kind: 'ok', text: `Es ${data.property.address} — la muestra ${data.property.assignedName ?? 'el asesor asignado'}.` })
      } else {
        setPropertyId(data.property?.id ?? null)
        if (data.property?.address) setAddress(data.property.address)
        setHint({ kind: 'info', text: 'Esta propiedad no está cargada en el sistema. Completá los datos de abajo.' })
      }
    } catch {
      setHint({ kind: 'info', text: 'No pudimos verificarlo ahora. Igual podés completar los datos a mano.' })
    } finally {
      setChecking(false)
    }
  }

  function pickProperty(id: string) {
    const p = properties.find(x => x.id === id)
    if (!p) return
    apply({ propertyId: p.id, address: p.address, assignedTo: p.assigned_to ?? '', assignedName: null })
    setHint({ kind: 'ok', text: `Elegiste ${p.address}.` })
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch('/api/portal-inquiries/identify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portal: aviso.portal,
          externalCode: aviso.externalCode,
          address: address.trim(),
          assignedTo,
          propertyId,
          externalUrl: link.trim() || null,
        }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const { updatedInquiries } = await res.json() as { updatedInquiries: number }
      const asesor = advisors.find(a => a.id === assignedTo)?.full_name ?? 'el asesor'
      toast.success(`Listo. ${updatedInquiries} consulta${updatedInquiries === 1 ? '' : 's'} quedaron asignadas a ${asesor}.`)
      setOpen(false)
      onDone()
    } catch {
      toast.error('No se pudo guardar. Probá de nuevo.')
    } finally {
      setSaving(false)
    }
  }

  const canSave = address.trim().length >= 3 && !!assignedTo && !saving

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">Identificar</Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{aviso.title ?? `Aviso ${aviso.externalCode}`}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            {aviso.portal === 'zonaprop' ? 'ZonaProp' : aviso.portal === 'argenprop' ? 'Argenprop' : aviso.portal}
            {' · '}CÓD {aviso.externalCode}
          </p>
        </DialogHeader>

        <div className="space-y-5">
          {/* Paso 1 */}
          <div className="space-y-2">
            <Label htmlFor="aviso-link">Paso 1 — Pegá el link del aviso</Label>
            <Input
              id="aviso-link"
              value={link}
              onChange={e => resolveLink(e.target.value)}
              placeholder="https://www.zonaprop.com.ar/propiedades/clasificado/..."
            />
            <p className="text-xs text-muted-foreground">
              Buscá el aviso en el portal, copiá el link de la barra del navegador y pegalo acá.
            </p>
            {checking && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Buscando…
              </p>
            )}
            {hint && !checking && (
              <p className={`text-xs flex items-start gap-1.5 ${
                hint.kind === 'ok' ? 'text-emerald-700' : hint.kind === 'error' ? 'text-rose-700' : 'text-amber-700'
              }`}>
                {hint.kind === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                <span>{hint.text}</span>
              </p>
            )}

            <button
              type="button"
              onClick={() => setShowPicker(v => !v)}
              className="text-xs underline text-[color:var(--brand)] inline-flex items-center gap-1"
            >
              <ChevronDown className={`h-3 w-3 transition ${showPicker ? 'rotate-180' : ''}`} />
              ¿Ya sabés cuál es? Elegila de la lista
            </button>
            {showPicker && (
              <Select
                options={properties.map(p => ({ value: p.id, label: p.address }))}
                placeholder="Elegí la propiedad"
                value={propertyId ?? ''}
                onChange={e => pickProperty(e.target.value)}
              />
            )}
          </div>

          {/* Paso 2 */}
          <div className="space-y-2">
            <Label htmlFor="aviso-address">Paso 2 — ¿Cuál es la dirección?</Label>
            <Input
              id="aviso-address"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="Ej: Av. Rivadavia 5400"
            />
          </div>

          {/* Paso 3 */}
          <div className="space-y-2">
            <Label htmlFor="aviso-advisor">Paso 3 — ¿Quién la muestra?</Label>
            <Select
              id="aviso-advisor"
              options={advisors.map(a => ({ value: a.id, label: a.full_name ?? 'Sin nombre' }))}
              placeholder="Elegí el asesor"
              value={assignedTo}
              onChange={e => setAssignedTo(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={!canSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Crear la pantalla con la lista**

Crear `app/(dashboard)/avisos/page.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, CheckCircle2 } from 'lucide-react'
import { IdentifyAvisoDialog, type AvisoPendiente } from '@/components/inbox/IdentifyAvisoDialog'

const PORTAL_LABEL: Record<string, string> = {
  zonaprop: 'ZonaProp',
  argenprop: 'Argenprop',
  mercadolibre: 'MercadoLibre',
}

function relativeDay(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
  if (days <= 0) return 'hoy'
  if (days === 1) return 'ayer'
  if (days < 30) return `hace ${days} días`
  return new Date(iso).toLocaleDateString('es-AR')
}

export default function AvisosPage() {
  const [avisos, setAvisos] = useState<AvisoPendiente[] | null>(null)
  const [advisors, setAdvisors] = useState<{ id: string; full_name: string | null }[]>([])
  const [properties, setProperties] = useState<{ id: string; address: string; assigned_to: string | null }[]>([])

  const load = useCallback(async () => {
    const [aRes, advRes, pRes] = await Promise.all([
      fetch('/api/portal-inquiries/unidentified'),
      fetch('/api/users/advisors'),
      fetch('/api/properties?limit=200'),
    ])
    const a = aRes.ok ? await aRes.json() : { data: [] }
    const adv = advRes.ok ? await advRes.json() : { data: [] }
    const p = pRes.ok ? await pRes.json() : { data: [] }
    setAvisos(a.data ?? [])
    setAdvisors(adv.data ?? [])
    setProperties(p.data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-6 p-6 max-w-3xl mx-auto">
      <header>
        <h1 className="text-2xl font-bold">Avisos por identificar</h1>
        <p className="text-sm text-muted-foreground">
          Estos avisos recibieron consultas, pero el sistema no sabe de qué propiedad son ni quién la muestra.
          Identificá cada uno y sus consultas — las de antes y las que lleguen — se asignan solas.
        </p>
      </header>

      {avisos === null && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}

      {avisos !== null && avisos.length === 0 && (
        <Card>
          <CardContent className="py-10 text-center">
            <CheckCircle2 className="h-8 w-8 text-emerald-600 mx-auto mb-2" />
            <p className="font-medium">No hay avisos pendientes</p>
            <p className="text-sm text-muted-foreground">Todas las consultas están identificadas.</p>
          </CardContent>
        </Card>
      )}

      {avisos?.map(aviso => (
        <Card key={`${aviso.portal}-${aviso.externalCode}`}>
          <CardContent className="py-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-medium">{aviso.title ?? `Aviso ${aviso.externalCode}`}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {PORTAL_LABEL[aviso.portal] ?? aviso.portal} · CÓD {aviso.externalCode}
              </p>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge className="bg-amber-500 text-white text-xs">
                  {aviso.inquiryCount} consulta{aviso.inquiryCount === 1 ? '' : 's'} esperando
                </Badge>
                <span className="text-xs text-muted-foreground">
                  la última, {relativeDay(aviso.lastInquiryAt)}
                  {aviso.lastLeadName ? ` (${aviso.lastLeadName})` : ''}
                </span>
              </div>
            </div>
            <IdentifyAvisoDialog aviso={aviso} advisors={advisors} properties={properties} onDone={load} />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Typecheck**

Run: `cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria" && npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `4`. Si aparecen errores nuevos en estos archivos, revisá que `Select` reciba `options`/`placeholder` (su firma está en `components/ui/select.tsx`) y que `/api/properties` devuelva `{ data: [...] }` con `address` y `assigned_to` (mirá `app/api/properties/route.ts`); adaptá el mapeo si difiere, sin cambiar el diseño.

- [ ] **Step 4: Commit**

```bash
cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"
git add components/inbox/IdentifyAvisoDialog.tsx "app/(dashboard)/avisos/page.tsx"
git commit -m "feat(avisos): pantalla de avisos pendientes con el formulario de 3 pasos

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Cartel de aviso, ítem de menú y verificación con datos reales

**Files:**
- Create: `components/inbox/UnidentifiedBanner.tsx`
- Modify: `app/(dashboard)/tasks/page.tsx`
- Modify: `app/(dashboard)/layout.tsx`

**Interfaces:**
- Consumes: `GET /api/portal-inquiries/unidentified` (Task 2) y la ruta `/avisos` (Task 4).
- Produces: `<UnidentifiedBanner />`, montado en la pantalla de inicio; el ítem "Avisos por identificar" en el menú de coordinador, admin y dueño.

- [ ] **Step 1: Crear el cartel**

Crear `components/inbox/UnidentifiedBanner.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ChevronRight } from 'lucide-react'

/**
 * Cartel del inicio: aparece SOLO si hay avisos sin identificar. Es la única
 * vía por la que la coordinadora se entera de que hay trabajo pendiente
 * (decisión del usuario: nada de WhatsApp ni emails nuevos).
 */
export function UnidentifiedBanner() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    fetch('/api/portal-inquiries/unidentified')
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(({ data }) => { if (!cancelled) setCount((data ?? []).length) })
      .catch(() => { /* silencioso: el cartel es informativo, no puede romper el inicio */ })
    return () => { cancelled = true }
  }, [])

  if (count === 0) return null

  return (
    <Link
      href="/avisos"
      className="flex items-center gap-3 rounded-lg border border-amber-400/60 bg-amber-50 dark:bg-amber-950/20 p-3 hover:bg-amber-100 dark:hover:bg-amber-950/40 transition"
    >
      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          {count} aviso{count === 1 ? '' : 's'} sin identificar
        </p>
        <p className="text-xs text-muted-foreground">
          Hay consultas que no sabemos de qué propiedad son. Identificalas para que lleguen al asesor correcto.
        </p>
      </div>
      <span className="text-sm font-medium text-[color:var(--brand)] inline-flex items-center whitespace-nowrap">
        Resolver <ChevronRight className="h-4 w-4" />
      </span>
    </Link>
  )
}
```

- [ ] **Step 2: Montar el cartel en la pantalla de inicio**

`app/(dashboard)/tasks/page.tsx` es la pantalla a la que entra el equipo al iniciar sesión (lo enruta `app/page.tsx`). Dos ediciones:

(a) Agregar el import junto a los otros imports de componentes:

```tsx
import { UnidentifiedBanner } from '@/components/inbox/UnidentifiedBanner'
```

(b) Renderizarlo como PRIMER elemento dentro del contenedor raíz del `return` del componente de página, antes del encabezado existente:

```tsx
      <UnidentifiedBanner />
```

Si el contenedor raíz no usa `space-y-*`, envolvé el cartel en `<div className="mb-4"><UnidentifiedBanner /></div>` para que no quede pegado al contenido.

- [ ] **Step 3: Agregar el ítem de menú**

En `app/(dashboard)/layout.tsx`, dentro de `getNavSections`, agregar el ítem en DOS lugares (la función tiene un `switch` por rol):

(a) En `case 'coordinador':`, inmediatamente después de la línea `{ label: 'Inbox', href: '/inbox' },`:

```tsx
                { label: 'Avisos por identificar', href: '/avisos' },
```

(b) En el `default:` (admin y dueño), inmediatamente después de su línea `{ label: 'Inbox', href: '/inbox' },`:

```tsx
                { label: 'Avisos por identificar', href: '/avisos' },
```

NO agregarlo en `case 'asesor':` ni en `case 'abogado':`.

- [ ] **Step 4: Typecheck y suite**

```bash
cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"
npx tsc --noEmit 2>&1 | grep -c "error TS"    # esperado: 4
npx vitest run --pool=threads 2>&1 | tail -5  # esperado: todo verde
```

- [ ] **Step 5: Commit**

```bash
cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"
git add components/inbox/UnidentifiedBanner.tsx "app/(dashboard)/tasks/page.tsx" "app/(dashboard)/layout.tsx"
git commit -m "feat(avisos): cartel en el inicio e ítem de menú para la coordinadora

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 6: Verificar los endpoints contra los datos reales**

Los datos de producción ya tienen 13 avisos pendientes, así que se puede verificar la lógica sin UI. Crear `scripts/tmp-verify-avisos.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { groupUnidentified, type UnidentifiedInquiryRow } from '../lib/portals/unidentified'
import { parsePortalLink } from '../lib/portals/portal-link'

function loadEnvLocal() {
  const p = path.resolve(process.cwd(), '.env.local')
  for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m || process.env[m[1]] !== undefined) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}
loadEnvLocal()

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const h = { apikey: key, Authorization: `Bearer ${key}` }

  const res = await fetch(
    `${url}/rest/v1/portal_inquiries?select=portal,property_external_code,raw_subject,lead_name,created_at,received_at&property_id=is.null&order=created_at.desc&limit=500`,
    { headers: h },
  )
  const rows = (await res.json()) as UnidentifiedInquiryRow[]
  const avisos = groupUnidentified(rows)
  console.log(`consultas sin identificar: ${rows.length} → avisos: ${avisos.length}\n`)
  for (const a of avisos) {
    console.log(`  ${a.portal.padEnd(10)} CÓD ${a.externalCode.padEnd(12)} ${String(a.inquiryCount).padStart(2)} consulta(s) · ${a.title ?? '(sin título)'}`)
  }

  // El parser contra las URLs reales guardadas en el mapa.
  const mapRes = await fetch(`${url}/rest/v1/portal_property_map?select=external_url&external_url=not.is.null&limit=10`, { headers: h })
  const urls = (await mapRes.json()) as { external_url: string }[]
  console.log('\nparser sobre URLs reales del mapa:')
  for (const u of urls) {
    console.log(`  ${JSON.stringify(parsePortalLink(u.external_url))}  ←  ${u.external_url.slice(0, 70)}`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
```

Run: `npx tsx scripts/tmp-verify-avisos.ts`
Expected: imprime ~13 avisos agrupados con sus conteos y títulos legibles, y el parser devuelve `{portal, externalId}` (no `null`) para las URLs reales del mapa. Si algún título sale `(sin título)` para un asunto de ZonaProp con el formato conocido, revisar `titleFromSubject`.

Después: `rm -f scripts/tmp-verify-avisos.ts`

- [ ] **Step 7: Push de la rama**

```bash
cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"
git push -u origin feat/avisos-por-identificar
```

(No mergear a `main`: el merge y el deploy los decide el usuario.)

- [ ] **Step 8: ⛔ CHECKPOINT — prueba en el navegador**

Solo se puede completar tras el merge y el deploy (el `next dev` local está roto por el acento de la ruta del proyecto). Avisar al usuario e indicarle:

1. Entrar al CRM: debe aparecer el cartel *"13 avisos sin identificar · Resolver"*.
2. Abrir **Avisos por identificar** desde el menú y elegir uno.
3. Pegar el link del aviso desde el portal → debe responder con la propiedad y el asesor, o avisar que no está cargada.
4. Completar y guardar → debe aparecer *"Listo. N consultas quedaron asignadas a …"* y el aviso desaparece de la lista.
5. Verificar en el SQL Editor que las consultas quedaron corregidas:
   ```sql
   SELECT seq, property_address, assigned_to, property_id, is_unmatched
     FROM portal_inquiries
    WHERE property_external_code = '<el CÓD identificado>'
    ORDER BY created_at DESC;
   ```
   Esperado: todas con dirección, asesor y `is_unmatched = false`.

---

## Self-review (hecho al escribir el plan)

- **Cobertura del spec:** parser → Task 1; lista agrupada por aviso → Task 2; endpoints resolve/identify (incluida la corrección hacia atrás) → Task 3; pantalla, formulario de 3 pasos, selector de propiedades y mensajes de error literales → Task 4; cartel, menú y verificación → Task 5. Las 4 decisiones del usuario (solo rutear · cartel · enfoque C · dirección obligatoria) están cada una en un task.
- **Sin placeholders:** cada paso trae el código o el comando literal con su salida esperada, incluido el `4` de errores preexistentes de tsc.
- **Consistencia de tipos:** `PortalLink`/`parsePortalLink` (Task 1) es lo que consume la Task 3; `UnidentifiedAviso` (Task 2) es el tipo que la Task 4 importa como `AvisoPendiente` desde el dialog y que la ruta devuelve; el body de `identify` que arma la Task 4 coincide campo a campo con el `Schema` de Zod de la Task 3.
- **Riesgo asumido y mitigado:** la Task 4 depende de la forma exacta de `/api/properties`; el Step 3 dice explícitamente qué revisar y adaptar si difiere, sin cambiar el diseño.
