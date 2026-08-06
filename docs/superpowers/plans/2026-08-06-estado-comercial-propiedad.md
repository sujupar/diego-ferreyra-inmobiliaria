# Estado comercial de la propiedad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que desde la ficha de una propiedad se pueda cambiar su estado comercial (disponible / reservada / vendida / dada de baja / descartada), que ese estado se guarde en la base con historial auditable, y que una venta registre precio real y fecha.

**Architecture:** Una columna nueva `properties.commercial_status`, independiente de `status` (que sigue describiendo la captación), más una tabla de eventos que solo crece. Las reglas de negocio viven en un módulo puro y testeado; la escritura va por una ruta de API propia que actualiza la propiedad y registra el evento. La interfaz es una tarjeta arriba de la pestaña Propiedad.

**Tech Stack:** Next.js 16 (App Router) · React 19 · TypeScript 5 · Supabase (Postgres) · Tailwind 4 · shadcn/ui · Vitest 4 + happy-dom + @testing-library/react · `pg` para aplicar la migración.

## Global Constraints

- **Spec de referencia:** `docs/superpowers/specs/2026-08-06-estado-comercial-propiedad-design.md`.
- **Worktree aislado:** todo el trabajo va en `/tmp/claude-501/estado-comercial`, rama `feat/estado-comercial-propiedad`. **NUNCA** trabajar en la carpeta principal del proyecto: otra sesión cambia de rama ahí y pisa el trabajo.
- **Antes de mergear:** correr `git diff --name-only origin/main HEAD` y confirmar que la lista contiene SOLO archivos de esta tarea. Si aparece algo ajeno, no resolver a mano: reconstruir la rama.
- **Los 5 valores válidos son exactamente:** `disponible`, `reservada`, `vendida`, `dada_de_baja`, `descartada`. El CHECK de la base y el catálogo de `lib/properties/commercial-status.ts` deben cambiarse **juntos**.
- **Nada se apaga solo:** cambiar de estado NO pausa avisos de portales ni campañas de Meta.
- **El abogado nunca ve ni toca esta sección** (403 en la ruta, componente oculto).
- **`status` no se toca**, salvo el espejo heredado de `descartada` descrito en la §6 del spec.
- **Prosa de interfaz en español rioplatense** (voseo: "Marcá", "Elegí", "Guardá").
- **Turbopack no arranca en esta carpeta** (bug con el acento de "Gestión"). Verificar con `npx vitest run`, `npx tsc --noEmit` y probes con `renderToStaticMarkup`. NO usar `next build`.
- **Commits:** autor `Sujupar <redstyle50@gmail.com>` o falla el deploy de Netlify. Usar `git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit`.
- **Baseline de errores de tipos:** el repo tiene errores de TS preexistentes en tests de inbox/landing/portales. La regla es **0 errores nuevos en archivos de esta tarea**, no 0 en el repo.

---

### Task 1: Migración y aplicación en la base

Es la primera tarea porque es el gate: sin las columnas, todo lo demás falla en producción.

**Files:**
- Create: `supabase/migrations/20260806000001_property_commercial_status.sql`
- Create: `scripts/apply-commercial-status-pg.ts`

**Interfaces:**
- Consumes: nada.
- Produces: en la base, `properties.commercial_status` (TEXT NOT NULL DEFAULT `'disponible'`), `properties.sold_price` (NUMERIC), `properties.sold_currency` (TEXT), `properties.sold_at` (DATE), y la tabla `property_status_events(id, property_id, from_status, to_status, reason, sold_price, sold_currency, sold_at, changed_by, created_at)`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/20260806000001_property_commercial_status.sql`:

```sql
-- =============================================================================
-- Estado comercial de la propiedad
-- =============================================================================
-- POR QUÉ UNA COLUMNA NUEVA Y NO `status`: checkAndAdvanceProperty
-- (lib/supabase/properties.ts) escribe status='approved' en CADA commit de
-- multimedia cuando hay fotos + legal aprobado. Un estado comercial guardado
-- ahí se borraría solo y re-dispararía los emails N8A/N8B de captación.
-- Además el trigger de 20260514000002 aprovisiona campaña Meta al pasar a
-- 'approved'. Ver el spec 2026-08-06-estado-comercial-propiedad-design.md §2.
--
-- OJO: si mañana se agrega un estado, hay que tocar ESTE CHECK y el catálogo de
-- lib/properties/commercial-status.ts JUNTOS, o la app escribe un valor que la
-- base rechaza con 23514.
--
-- Idempotente: se puede re-ejecutar sin efectos.
-- =============================================================================

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS commercial_status TEXT NOT NULL DEFAULT 'disponible',
  ADD COLUMN IF NOT EXISTS sold_price        NUMERIC,
  ADD COLUMN IF NOT EXISTS sold_currency     TEXT,
  ADD COLUMN IF NOT EXISTS sold_at           DATE;

ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_commercial_status_check;
ALTER TABLE public.properties ADD CONSTRAINT properties_commercial_status_check
  CHECK (commercial_status IN ('disponible','reservada','vendida','dada_de_baja','descartada'));

COMMENT ON COLUMN public.properties.commercial_status IS
  'Estado comercial (eje independiente de status, que describe la captación). Fuente de verdad.';
COMMENT ON COLUMN public.properties.sold_price IS
  'Precio REAL de la operación cerrada. NULL si la propiedad no está vendida.';
COMMENT ON COLUMN public.properties.sold_currency IS
  'Moneda de la operación: puede diferir de properties.currency (la publicada).';

-- Historial: solo crece, nunca se actualiza ni se borra.
CREATE TABLE IF NOT EXISTS public.property_status_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   UUID NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  from_status   TEXT,
  to_status     TEXT NOT NULL,
  reason        TEXT,
  sold_price    NUMERIC,
  sold_currency TEXT,
  sold_at       DATE,
  -- ON DELETE SET NULL es obligatorio en toda FK a profiles(id): con NO ACTION,
  -- borrar un usuario desde Supabase Auth falla con "Database error deleting user".
  changed_by    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_status_events_property
  ON public.property_status_events (property_id, created_at DESC);

ALTER TABLE public.property_status_events ENABLE ROW LEVEL SECURITY;

-- Lectura solo para operaciones (el abogado no ve datos comerciales).
-- La escritura va con service role desde la ruta de API: sin política de INSERT.
DROP POLICY IF EXISTS property_status_events_read ON public.property_status_events;
CREATE POLICY property_status_events_read ON public.property_status_events
  FOR SELECT TO authenticated USING (public.is_operations_user());

-- Backfill: las descartadas de hoy nacen con el estado comercial correcto.
-- No se inventan eventos históricos: no sabemos quién ni cuándo las descartó.
UPDATE public.properties
   SET commercial_status = 'descartada'
 WHERE status = 'descartada' AND commercial_status = 'disponible';

-- =============================================================================
-- Verificación:
--   SELECT commercial_status, count(*) FROM properties GROUP BY 1;
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid='public.properties'::regclass
--      AND conname='properties_commercial_status_check';
-- =============================================================================
```

- [ ] **Step 2: Escribir el script que aplica y verifica**

Crear `scripts/apply-commercial-status-pg.ts`. Sigue el patrón de `scripts/apply-ai-analysis-switch-pg.ts` (conexión por session pooler; la conexión directa `db.<ref>.supabase.co` es IPv6-only y esta red no tiene ruta IPv6). **Aborta** si algo no cuadra:

```ts
/**
 * Aplica `20260806000001_property_commercial_status.sql` y VERIFICA:
 * las 4 columnas nuevas, el CHECK con los 5 valores, la tabla de eventos con
 * su índice y su RLS, y que el backfill alcanzó exactamente a las propiedades
 * con status='descartada' — ni una más.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/apply-commercial-status-pg.ts
 */
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

const VALORES = ['disponible', 'reservada', 'vendida', 'dada_de_baja', 'descartada']

async function main() {
  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  const antes = await c.query(`
    SELECT (SELECT count(*) FROM properties)                          AS props,
           (SELECT count(*) FROM properties WHERE status='descartada') AS descartadas`)

  await c.query(readFileSync('supabase/migrations/20260806000001_property_commercial_status.sql', 'utf8'))

  const { rows: cols } = await c.query(`
    SELECT column_name, is_nullable, column_default FROM information_schema.columns
     WHERE table_schema='public' AND table_name='properties'
       AND column_name IN ('commercial_status','sold_price','sold_currency','sold_at')
     ORDER BY column_name`)
  const { rows: chk } = await c.query(`
    SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
     WHERE conrelid='public.properties'::regclass AND conname='properties_commercial_status_check'`)
  const { rows: tabla } = await c.query(`SELECT to_regclass('public.property_status_events') AS t`)
  const { rows: idx } = await c.query(`
    SELECT indexname FROM pg_indexes
     WHERE schemaname='public' AND indexname='idx_property_status_events_property'`)
  const { rows: rls } = await c.query(`
    SELECT relrowsecurity FROM pg_class WHERE oid='public.property_status_events'::regclass`)
  const despues = await c.query(`
    SELECT (SELECT count(*) FROM properties)                                    AS props,
           (SELECT count(*) FROM properties WHERE status='descartada')          AS descartadas,
           (SELECT count(*) FROM properties WHERE commercial_status='descartada') AS com_descartadas,
           (SELECT count(*) FROM properties WHERE commercial_status='disponible') AS disponibles,
           (SELECT count(*) FROM properties
             WHERE commercial_status NOT IN ('disponible','descartada'))        AS raras`)
  await c.end()

  const a = antes.rows[0], d = despues.rows[0]
  console.log(`propiedades ${a.props}→${d.props}`)
  console.log(`columnas nuevas: ${cols.map(r => r.column_name).join(', ')}`)
  console.log(`CHECK: ${chk[0]?.def ?? '(no existe)'}`)
  console.log(`tabla de eventos: ${tabla[0].t} · índice: ${idx[0]?.indexname ?? '(falta)'} · RLS: ${rls[0]?.relrowsecurity}`)
  console.log(`descartadas: status=${d.descartadas} · commercial=${d.com_descartadas} · disponibles=${d.disponibles}`)

  if (a.props !== d.props) throw new Error('¡ALERTA! cambió la cantidad de propiedades')
  if (cols.length !== 4) throw new Error(`faltan columnas: solo ${cols.length} de 4`)
  const cs = cols.find(r => r.column_name === 'commercial_status')
  if (cs?.is_nullable !== 'NO') throw new Error('commercial_status debería ser NOT NULL')
  if (!String(cs?.column_default ?? '').includes('disponible')) throw new Error("el default de commercial_status no es 'disponible'")
  for (const v of VALORES) {
    if (!chk[0]?.def?.includes(`'${v}'`)) throw new Error(`el CHECK no incluye '${v}'`)
  }
  if (!tabla[0].t) throw new Error('no se creó property_status_events')
  if (!idx[0]) throw new Error('falta el índice de property_status_events')
  if (rls[0]?.relrowsecurity !== true) throw new Error('property_status_events quedó sin RLS')
  if (Number(d.com_descartadas) !== Number(d.descartadas)) {
    throw new Error(`backfill inconsistente: ${d.descartadas} con status descartada vs ${d.com_descartadas} con commercial`)
  }
  if (Number(d.raras) !== 0) throw new Error(`${d.raras} propiedades quedaron con un estado inesperado`)

  console.log('\n✅ migración aplicada y verificada')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
```

- [ ] **Step 3: Aplicar la migración contra la base real**

Run: `node --env-file=.env.local --import tsx scripts/apply-commercial-status-pg.ts`
Expected: termina con `✅ migración aplicada y verificada`, la cantidad de propiedades no cambia, y `descartadas: status=N · commercial=N` con el mismo N.

Si falla por credenciales, **parar y avisar** — no seguir con el resto del plan: sin la migración, la ruta de la Task 3 devuelve 500 en producción.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260806000001_property_commercial_status.sql scripts/apply-commercial-status-pg.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(db): estado comercial de la propiedad + historial auditable"
```

---

### Task 2: Reglas de negocio (módulo puro)

Catálogo, validación y armado del cambio. Sin React, sin Supabase — todo testeable con vitest.

**Files:**
- Create: `lib/properties/commercial-status.ts`
- Test: `lib/properties/commercial-status.test.ts`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `type CommercialStatus = 'disponible' | 'reservada' | 'vendida' | 'dada_de_baja' | 'descartada'`
  - `COMMERCIAL_STATUSES: CommercialStatusDef[]` con `{ key, label, description, badge, dot }`
  - `commercialStatusDef(key: string): CommercialStatusDef`
  - `isCommercialStatus(v: unknown): v is CommercialStatus`
  - `validateStatusChange(i: StatusChangeInput): { ok: boolean; error?: string }`
  - `buildStatusPatch(i: StatusChangeInput): StatusChangePatch`
  - `StatusChangeInput = { from, to, reason?, soldPrice?, soldCurrency?, soldAt?, today? }`
  - `StatusChangePatch = { commercial_status, sold_price, sold_currency, sold_at, status? }`

- [ ] **Step 1: Escribir el test que falla**

Crear `lib/properties/commercial-status.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  COMMERCIAL_STATUSES, commercialStatusDef, isCommercialStatus,
  validateStatusChange, buildStatusPatch,
} from './commercial-status'

const HOY = '2026-08-06'

describe('catálogo', () => {
  it('tiene exactamente los cinco estados acordados, en orden', () => {
    expect(COMMERCIAL_STATUSES.map(s => s.key)).toEqual([
      'disponible', 'reservada', 'vendida', 'dada_de_baja', 'descartada',
    ])
  })

  it('cada estado tiene etiqueta y explicación en castellano', () => {
    for (const s of COMMERCIAL_STATUSES) {
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.description.length).toBeGreaterThan(10)
    }
  })

  it('un valor desconocido cae en disponible en vez de romper la pantalla', () => {
    expect(commercialStatusDef('cualquier-cosa').key).toBe('disponible')
    expect(commercialStatusDef('vendida').label).toBe('Vendida')
  })

  it('reconoce los valores válidos', () => {
    expect(isCommercialStatus('reservada')).toBe(true)
    expect(isCommercialStatus('alquilada')).toBe(false)
    expect(isCommercialStatus(null)).toBe(false)
  })
})

describe('validateStatusChange', () => {
  it('rechaza cambiar al mismo estado', () => {
    const r = validateStatusChange({ from: 'disponible', to: 'disponible', today: HOY })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('ya está')
  })

  it('vendida exige precio real', () => {
    const r = validateStatusChange({ from: 'disponible', to: 'vendida', soldAt: HOY, soldCurrency: 'USD', today: HOY })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('precio')
  })

  it('vendida rechaza precio cero o negativo', () => {
    for (const p of [0, -5]) {
      const r = validateStatusChange({ from: 'disponible', to: 'vendida', soldPrice: p, soldAt: HOY, soldCurrency: 'USD', today: HOY })
      expect(r.ok).toBe(false)
    }
  })

  it('vendida exige fecha de operación', () => {
    const r = validateStatusChange({ from: 'disponible', to: 'vendida', soldPrice: 180000, soldCurrency: 'USD', today: HOY })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('fecha')
  })

  it('vendida rechaza una fecha futura', () => {
    const r = validateStatusChange({ from: 'disponible', to: 'vendida', soldPrice: 180000, soldCurrency: 'USD', soldAt: '2026-12-31', today: HOY })
    expect(r.ok).toBe(false)
    expect(r.error).toContain('futuro')
  })

  it('vendida con todo cargado pasa', () => {
    const r = validateStatusChange({ from: 'disponible', to: 'vendida', soldPrice: 180000, soldCurrency: 'USD', soldAt: HOY, today: HOY })
    expect(r.ok).toBe(true)
  })

  it('salir de vendida exige motivo', () => {
    const sin = validateStatusChange({ from: 'vendida', to: 'disponible', today: HOY })
    expect(sin.ok).toBe(false)
    expect(sin.error).toContain('motivo')

    const enBlanco = validateStatusChange({ from: 'vendida', to: 'disponible', reason: '   ', today: HOY })
    expect(enBlanco.ok).toBe(false)

    const con = validateStatusChange({ from: 'vendida', to: 'disponible', reason: 'La operación se cayó', today: HOY })
    expect(con.ok).toBe(true)
  })

  it('el resto de los cambios no exige motivo', () => {
    expect(validateStatusChange({ from: 'disponible', to: 'reservada', today: HOY }).ok).toBe(true)
    expect(validateStatusChange({ from: 'reservada', to: 'dada_de_baja', today: HOY }).ok).toBe(true)
    expect(validateStatusChange({ from: 'descartada', to: 'disponible', today: HOY }).ok).toBe(true)
  })
})

describe('buildStatusPatch', () => {
  it('vendida guarda precio, moneda y fecha', () => {
    const p = buildStatusPatch({ from: 'disponible', to: 'vendida', soldPrice: 180000, soldCurrency: 'USD', soldAt: HOY, today: HOY })
    expect(p).toEqual({
      commercial_status: 'vendida', sold_price: 180000, sold_currency: 'USD', sold_at: HOY,
    })
  })

  it('salir de vendida limpia los datos de la venta', () => {
    const p = buildStatusPatch({ from: 'vendida', to: 'disponible', reason: 'Se cayó', today: HOY })
    expect(p.sold_price).toBeNull()
    expect(p.sold_currency).toBeNull()
    expect(p.sold_at).toBeNull()
  })

  it('descartada escribe también el espejo heredado en status', () => {
    const p = buildStatusPatch({ from: 'disponible', to: 'descartada', today: HOY })
    expect(p.status).toBe('descartada')
  })

  it('salir de descartada devuelve status a borrador', () => {
    const p = buildStatusPatch({ from: 'descartada', to: 'disponible', today: HOY })
    expect(p.status).toBe('draft')
  })

  it('los cambios que no involucran descartada no tocan status', () => {
    const p = buildStatusPatch({ from: 'disponible', to: 'reservada', today: HOY })
    expect(p.status).toBeUndefined()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run lib/properties/commercial-status.test.ts`
Expected: FAIL — `Failed to resolve import "./commercial-status"`.

- [ ] **Step 3: Escribir la implementación**

Crear `lib/properties/commercial-status.ts`:

```ts
/**
 * Estado comercial de una propiedad — catálogo y reglas.
 *
 * Eje INDEPENDIENTE de `properties.status` (que describe la captación).
 * Ver docs/superpowers/specs/2026-08-06-estado-comercial-propiedad-design.md
 *
 * OJO: agregar un estado acá obliga a actualizar TAMBIÉN el CHECK de
 * `properties_commercial_status_check` en la base, o la app escribe un valor
 * que Postgres rechaza con 23514.
 */

export type CommercialStatus =
  | 'disponible' | 'reservada' | 'vendida' | 'dada_de_baja' | 'descartada'

export interface CommercialStatusDef {
  key: CommercialStatus
  label: string
  /** Qué significa. Se muestra en la tarjeta: si el equipo no lo entiende igual, el dato no sirve. */
  description: string
  /** Clases del badge. */
  badge: string
  /** Clase del punto de color. */
  dot: string
}

export const COMMERCIAL_STATUSES: CommercialStatusDef[] = [
  {
    key: 'disponible', label: 'Disponible',
    description: 'En comercialización activa. Se difunde y se muestra a interesados.',
    badge: 'bg-emerald-600 text-white', dot: 'bg-emerald-500',
  },
  {
    key: 'reservada', label: 'Reservada',
    description: 'Hay seña o reserva. No se ofrece a nuevos interesados, pero puede volver a Disponible.',
    badge: 'bg-amber-500 text-white', dot: 'bg-amber-500',
  },
  {
    key: 'vendida', label: 'Vendida',
    description: 'Operación cerrada. Registra el precio real y la fecha de la operación.',
    badge: 'bg-[color:var(--brand)] text-white', dot: 'bg-[color:var(--brand)]',
  },
  {
    key: 'dada_de_baja', label: 'Dada de baja',
    description: 'El propietario la retiró o venció la exclusividad. Dejamos de comercializarla sin haberla vendido.',
    badge: 'bg-slate-600 text-white', dot: 'bg-slate-500',
  },
  {
    key: 'descartada', label: 'Descartada',
    description: 'No se llegó a trabajar o se decidió no seguirla. Queda guardada, fuera del flujo activo.',
    badge: 'bg-slate-500 text-white', dot: 'bg-slate-400',
  },
]

const BY_KEY = new Map(COMMERCIAL_STATUSES.map(s => [s.key, s]))

export function isCommercialStatus(v: unknown): v is CommercialStatus {
  return typeof v === 'string' && BY_KEY.has(v as CommercialStatus)
}

/** Definición del estado. Un valor desconocido cae en `disponible`: la ficha nunca queda en blanco. */
export function commercialStatusDef(key: string | null | undefined): CommercialStatusDef {
  return BY_KEY.get((key ?? '') as CommercialStatus) ?? COMMERCIAL_STATUSES[0]
}

export interface StatusChangeInput {
  from: CommercialStatus
  to: CommercialStatus
  reason?: string | null
  soldPrice?: number | null
  soldCurrency?: string | null
  /** 'YYYY-MM-DD' */
  soldAt?: string | null
  /** 'YYYY-MM-DD'. Inyectable para que los tests no dependan del reloj. */
  today?: string
}

export interface ValidationResult { ok: boolean; error?: string }

function hoy(): string {
  return new Date().toISOString().slice(0, 10)
}

export function validateStatusChange(i: StatusChangeInput): ValidationResult {
  if (i.from === i.to) {
    return { ok: false, error: `La propiedad ya está en estado "${commercialStatusDef(i.to).label}".` }
  }

  if (i.to === 'vendida') {
    if (i.soldPrice == null || !Number.isFinite(i.soldPrice) || i.soldPrice <= 0) {
      return { ok: false, error: 'Para marcarla como vendida necesitás cargar el precio real de la operación.' }
    }
    if (!i.soldCurrency) {
      return { ok: false, error: 'Elegí la moneda de la operación.' }
    }
    if (!i.soldAt) {
      return { ok: false, error: 'Para marcarla como vendida necesitás cargar la fecha de la operación.' }
    }
    // Las fechas 'YYYY-MM-DD' se comparan bien como texto.
    if (i.soldAt > (i.today ?? hoy())) {
      return { ok: false, error: 'La fecha de la operación no puede estar en el futuro.' }
    }
  }

  // Anular una venta registrada tiene que quedar explicado.
  if (i.from === 'vendida' && !i.reason?.trim()) {
    return { ok: false, error: 'Para sacarla del estado vendida necesitás escribir el motivo.' }
  }

  return { ok: true }
}

export interface StatusChangePatch {
  commercial_status: CommercialStatus
  sold_price: number | null
  sold_currency: string | null
  sold_at: string | null
  /** Espejo heredado: solo se setea cuando entra o sale de `descartada`. */
  status?: string
}

/**
 * Campos a escribir en `properties`. Asume que `validateStatusChange` pasó.
 *
 * El espejo en `status` existe porque cinco lugares del sistema todavía leen
 * `status === 'descartada'` (badge del listado, descarte masivo, isDiscarded,
 * nextStep y la vista vw_properties_list). Ver spec §6.
 */
export function buildStatusPatch(i: StatusChangeInput): StatusChangePatch {
  const esVenta = i.to === 'vendida'
  const patch: StatusChangePatch = {
    commercial_status: i.to,
    sold_price: esVenta ? (i.soldPrice ?? null) : null,
    sold_currency: esVenta ? (i.soldCurrency ?? null) : null,
    sold_at: esVenta ? (i.soldAt ?? null) : null,
  }
  if (i.to === 'descartada') patch.status = 'descartada'
  else if (i.from === 'descartada') patch.status = 'draft'
  return patch
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npx vitest run lib/properties/commercial-status.test.ts`
Expected: PASS — 15 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/properties/commercial-status.ts lib/properties/commercial-status.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): catálogo y reglas del estado comercial (módulo puro)"
```

---

### Task 3: Ruta de API

Lee el historial y escribe el cambio. Ruta propia: el `PUT /api/properties/[id]` genérico crea tareas y dispara emails cuando `status` pasa a `pending_review`, y mezclar eso acá volvería frágil algo que tiene que ser simple.

**Files:**
- Create: `app/api/properties/[id]/commercial-status/route.ts`

**Interfaces:**
- Consumes: `validateStatusChange`, `buildStatusPatch`, `isCommercialStatus`, `commercialStatusDef` (Task 2); `requireAuth` de `@/lib/auth/require-role`; `canAccessProperty` de `@/lib/auth/entity-access`.
- Produces:
  - `GET /api/properties/[id]/commercial-status` → `{ events: StatusEvent[] }` con `StatusEvent = { id, from_status, to_status, reason, sold_price, sold_currency, sold_at, created_at, changed_by_name }`
  - `POST /api/properties/[id]/commercial-status` body `{ status, reason?, soldPrice?, soldCurrency?, soldAt? }` → `{ ok: true, warning?: string }`

- [ ] **Step 1: Escribir la ruta**

Crear `app/api/properties/[id]/commercial-status/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { canAccessProperty } from '@/lib/auth/entity-access'
import {
  buildStatusPatch, isCommercialStatus, validateStatusChange,
  type CommercialStatus,
} from '@/lib/properties/commercial-status'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Historial de cambios de estado, del más nuevo al más viejo. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const { id } = await params
    const { data, error } = await admin()
      .from('property_status_events')
      .select('id, from_status, to_status, reason, sold_price, sold_currency, sold_at, created_at, profiles:changed_by(full_name)')
      .eq('property_id', id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error

    const events = (data ?? []).map(e => {
      const { profiles, ...rest } = e as typeof e & { profiles?: { full_name?: string } | null }
      return { ...rest, changed_by_name: profiles?.full_name ?? null }
    })
    return NextResponse.json({ events })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    // El abogado no ve ni toca datos comerciales.
    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const { id } = await params
    if (!(await canAccessProperty(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const to = body?.status
    if (!isCommercialStatus(to)) {
      return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 })
    }

    const db = admin()
    const { data: prop, error: readErr } = await db
      .from('properties')
      .select('commercial_status, currency')
      .eq('id', id)
      .maybeSingle()
    if (readErr) throw readErr
    if (!prop) return NextResponse.json({ error: 'Propiedad no encontrada.' }, { status: 404 })

    const from = (isCommercialStatus(prop.commercial_status)
      ? prop.commercial_status
      : 'disponible') as CommercialStatus

    const input = {
      from,
      to,
      reason: typeof body.reason === 'string' ? body.reason : null,
      soldPrice: typeof body.soldPrice === 'number' ? body.soldPrice : null,
      soldCurrency: typeof body.soldCurrency === 'string' ? body.soldCurrency : (to === 'vendida' ? prop.currency : null),
      soldAt: typeof body.soldAt === 'string' ? body.soldAt : null,
    }

    const check = validateStatusChange(input)
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 })
    }

    const patch = buildStatusPatch(input)
    const { error: updErr } = await db
      .from('properties')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updErr) throw updErr

    // El evento va DESPUÉS del update, con un reintento. Son dos escrituras sin
    // transacción (el cliente de Supabase no expone transacciones multi-tabla):
    // preferimos perder el registro histórico antes que dejar al usuario sin
    // poder cambiar el estado. Si esto se vuelve frecuente, mover a una RPC.
    const evento = {
      property_id: id,
      from_status: from,
      to_status: to,
      reason: input.reason,
      sold_price: patch.sold_price,
      sold_currency: patch.sold_currency,
      sold_at: patch.sold_at,
      changed_by: user.id,
    }
    let warning: string | undefined
    const primero = await db.from('property_status_events').insert(evento)
    if (primero.error) {
      const segundo = await db.from('property_status_events').insert(evento)
      if (segundo.error) {
        console.error('[commercial-status] el estado se guardó pero el evento no:', segundo.error)
        warning = 'El estado se guardó, pero no se pudo registrar en el historial.'
      }
    }

    return NextResponse.json({ ok: true, ...(warning ? { warning } : {}) })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `npx tsc --noEmit 2>&1 | grep commercial-status || echo "sin errores en la ruta"`
Expected: `sin errores en la ruta`.

- [ ] **Step 3: Commit**

```bash
git add "app/api/properties/[id]/commercial-status/route.ts"
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(api): ruta para cambiar el estado comercial con registro de evento"
```

---

### Task 4: Tarjeta "Estado de la propiedad"

**Files:**
- Create: `components/properties/detail/PropertyCommercialStatusCard.tsx`
- Test: `components/properties/detail/PropertyCommercialStatusCard.test.tsx`

**Interfaces:**
- Consumes: `COMMERCIAL_STATUSES`, `commercialStatusDef`, `validateStatusChange`, tipo `CommercialStatus` (Task 2); la ruta de la Task 3.
- Produces: `<PropertyCommercialStatusCard propertyId={string} current={CommercialStatus} currency={string} soldPrice={number|null} soldCurrency={string|null} soldAt={string|null} onChanged={() => void} />`

- [ ] **Step 1: Escribir el test que falla**

Crear `components/properties/detail/PropertyCommercialStatusCard.test.tsx`:

```tsx
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PropertyCommercialStatusCard } from './PropertyCommercialStatusCard'

const base = {
  propertyId: 'p1', currency: 'USD',
  soldPrice: null as number | null, soldCurrency: null as string | null, soldAt: null as string | null,
  onChanged: () => {},
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) }))
})

describe('PropertyCommercialStatusCard', () => {
  it('muestra el estado actual y su explicación', () => {
    render(<PropertyCommercialStatusCard {...base} current="disponible" />)
    expect(screen.getByText('Disponible')).toBeInTheDocument()
    expect(screen.getByText(/comercialización activa/i)).toBeInTheDocument()
  })

  it('ofrece los otros cuatro estados, no el actual', () => {
    render(<PropertyCommercialStatusCard {...base} current="disponible" />)
    expect(screen.getByRole('button', { name: /^reservada$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^vendida$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^dada de baja$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^descartada$/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^disponible$/i })).not.toBeInTheDocument()
  })

  it('al elegir vendida pide precio real y fecha', async () => {
    const user = userEvent.setup()
    render(<PropertyCommercialStatusCard {...base} current="disponible" />)
    await user.click(screen.getByRole('button', { name: /^vendida$/i }))
    expect(screen.getByLabelText(/precio real/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/fecha de la operación/i)).toBeInTheDocument()
  })

  // OJO: el texto que se busca es el del ERROR, no el de la etiqueta del campo.
  // "precio real" y "motivo" ya están en pantalla como labels: buscarlos no
  // probaría nada.
  it('no deja confirmar una venta sin precio y explica por qué', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<PropertyCommercialStatusCard {...base} current="disponible" />)
    await user.click(screen.getByRole('button', { name: /^vendida$/i }))
    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    expect(await screen.findByText(/necesitás cargar el precio real/i)).toBeInTheDocument()
    // Y no llegó a llamar a la ruta: solo se pidió el historial al montar.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('salir de vendida sin motivo no guarda y explica por qué', async () => {
    const user = userEvent.setup()
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ events: [] }) })
    vi.stubGlobal('fetch', fetchMock)

    render(<PropertyCommercialStatusCard {...base} current="vendida" soldPrice={180000} soldCurrency="USD" soldAt="2026-08-01" />)
    await user.click(screen.getByRole('button', { name: /^disponible$/i }))
    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    expect(await screen.findByText(/necesitás escribir el motivo/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('un cambio válido llama a la ruta y avisa al padre', async () => {
    const onChanged = vi.fn()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ events: [] }) })   // historial inicial
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })      // POST
      .mockResolvedValue({ ok: true, json: async () => ({ events: [] }) })        // historial recargado
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<PropertyCommercialStatusCard {...base} current="disponible" onChanged={onChanged} />)
    await user.click(screen.getByRole('button', { name: /^reservada$/i }))
    await user.click(screen.getByRole('button', { name: /confirmar/i }))

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/properties/p1/commercial-status',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(onChanged).toHaveBeenCalled()
  })

  it('cuando está vendida muestra el precio real cargado', () => {
    render(<PropertyCommercialStatusCard {...base} current="vendida" soldPrice={180000} soldCurrency="USD" soldAt="2026-08-01" />)
    expect(screen.getByText(/180\.000/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npx vitest run components/properties/detail/PropertyCommercialStatusCard.test.tsx`
Expected: FAIL — no se resuelve `./PropertyCommercialStatusCard`.

- [ ] **Step 3: Escribir la implementación**

Crear `components/properties/detail/PropertyCommercialStatusCard.tsx`:

```tsx
'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { ChevronDown, Loader2 } from 'lucide-react'
import {
  COMMERCIAL_STATUSES, commercialStatusDef, validateStatusChange,
  type CommercialStatus,
} from '@/lib/properties/commercial-status'
import { formatMoney } from '@/lib/properties/detail-view'

interface StatusEvent {
  id: string
  from_status: string | null
  to_status: string
  reason: string | null
  sold_price: number | null
  sold_currency: string | null
  sold_at: string | null
  created_at: string
  changed_by_name: string | null
}

interface Props {
  propertyId: string
  current: CommercialStatus
  /** Moneda de publicación: es el default de la operación. */
  currency: string
  soldPrice: number | null
  soldCurrency: string | null
  soldAt: string | null
  onChanged: () => void
}

export function PropertyCommercialStatusCard({
  propertyId, current, currency, soldPrice, soldCurrency, soldAt, onChanged,
}: Props) {
  const def = commercialStatusDef(current)
  const [target, setTarget] = useState<CommercialStatus | null>(null)
  const [reason, setReason] = useState('')
  const [price, setPrice] = useState('')
  const [saleCurrency, setSaleCurrency] = useState(currency)
  const [saleDate, setSaleDate] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [events, setEvents] = useState<StatusEvent[]>([])

  const loadEvents = useCallback(async () => {
    try {
      const res = await fetch(`/api/properties/${propertyId}/commercial-status`)
      if (!res.ok) return
      const { events } = await res.json()
      setEvents(Array.isArray(events) ? events : [])
    } catch { /* el historial es secundario: si falla, la tarjeta sigue usable */ }
  }, [propertyId])

  useEffect(() => { loadEvents() }, [loadEvents])

  function pick(next: CommercialStatus) {
    setTarget(next)
    setError(null)
    setReason('')
    setPrice('')
    setSaleCurrency(currency)
    setSaleDate('')
  }

  function cancel() {
    setTarget(null)
    setError(null)
  }

  async function confirm() {
    if (!target) return
    const parsedPrice = price.trim() === '' ? null : Number(price)
    const input = {
      from: current,
      to: target,
      reason: reason.trim() || null,
      soldPrice: parsedPrice,
      soldCurrency: target === 'vendida' ? saleCurrency : null,
      soldAt: saleDate || null,
    }
    const check = validateStatusChange(input)
    if (!check.ok) {
      setError(check.error ?? 'Revisá los datos.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/properties/${propertyId}/commercial-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: target,
          reason: input.reason,
          soldPrice: input.soldPrice,
          soldCurrency: input.soldCurrency,
          soldAt: input.soldAt,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error || 'No se pudo guardar el estado.'); return }
      if (data?.warning) toast.warning(data.warning)
      else toast.success(`Marcada como ${commercialStatusDef(target).label.toLowerCase()}`)
      setTarget(null)
      await loadEvents()
      onChanged()
    } catch {
      setError('No se pudo guardar el estado. Revisá la conexión y volvé a intentar.')
    } finally {
      setSaving(false)
    }
  }

  const others = COMMERCIAL_STATUSES.filter(s => s.key !== current)

  return (
    <Card className="border-2">
      <CardContent className="py-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">Estado de la propiedad</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${def.dot}`} />
              <span className="display text-xl">{def.label}</span>
            </div>
            <p className="text-sm text-muted-foreground mt-1">{def.description}</p>
            {current === 'vendida' && soldPrice != null && (
              <p className="text-sm mt-2">
                <span className="text-muted-foreground">Vendida en </span>
                <strong className="tabular-n">{formatMoney(soldPrice, soldCurrency || currency)}</strong>
                {soldAt && <span className="text-muted-foreground"> · {soldAt}</span>}
              </p>
            )}
          </div>
        </div>

        {!target && (
          <div className="flex flex-wrap gap-2">
            {others.map(s => (
              <Button key={s.key} variant="outline" size="sm" onClick={() => pick(s.key)}>
                {s.label}
              </Button>
            ))}
          </div>
        )}

        {target && (
          <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
            <p className="text-sm">
              <span className="text-muted-foreground">Cambiar de </span>
              <strong>{def.label}</strong>
              <span className="text-muted-foreground"> a </span>
              <strong>{commercialStatusDef(target).label}</strong>
            </p>

            {target === 'vendida' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="text-sm">
                  <span className="eyebrow block mb-1">Precio real</span>
                  <input
                    aria-label="Precio real de la operación"
                    type="number" min="0" step="1000" value={price}
                    onChange={e => setPrice(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>
                <label className="text-sm">
                  <span className="eyebrow block mb-1">Moneda</span>
                  <select
                    aria-label="Moneda de la operación"
                    value={saleCurrency} onChange={e => setSaleCurrency(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm bg-background"
                  >
                    <option value="USD">USD</option>
                    <option value="ARS">ARS</option>
                  </select>
                </label>
                <label className="text-sm">
                  <span className="eyebrow block mb-1">Fecha de la operación</span>
                  <input
                    aria-label="Fecha de la operación"
                    type="date" value={saleDate}
                    onChange={e => setSaleDate(e.target.value)}
                    className="w-full rounded-md border px-3 py-2 text-sm"
                  />
                </label>
              </div>
            )}

            <label className="text-sm block">
              <span className="eyebrow block mb-1">
                Motivo {current === 'vendida' ? '(obligatorio)' : '(opcional)'}
              </span>
              <input
                aria-label="Motivo del cambio"
                value={reason} onChange={e => setReason(e.target.value)}
                placeholder={current === 'vendida' ? 'Ej: la operación se cayó' : 'Ej: el propietario retiró la propiedad'}
                className="w-full rounded-md border px-3 py-2 text-sm"
              />
            </label>

            {error && <p className="text-sm text-[color:var(--destructive)]">{error}</p>}

            <div className="flex gap-2">
              <Button onClick={confirm} disabled={saving}>
                {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
                Confirmar cambio
              </Button>
              <Button variant="ghost" onClick={cancel} disabled={saving}>Cancelar</Button>
            </div>
          </div>
        )}

        {events.length > 0 && (
          <Collapsible className="border-t pt-3">
            <CollapsibleTrigger asChild>
              <button className="group w-full flex items-center justify-between text-left">
                <span className="eyebrow">Historial de estados ({events.length})</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-3 space-y-2">
              {events.map(e => (
                <div key={e.id} className="text-sm flex flex-wrap items-baseline gap-x-2">
                  <span className="tabular-n text-muted-foreground text-xs">
                    {new Date(e.created_at).toLocaleDateString('es-AR')}
                  </span>
                  <span>
                    {e.from_status ? `${commercialStatusDef(e.from_status).label} → ` : ''}
                    <strong>{commercialStatusDef(e.to_status).label}</strong>
                  </span>
                  {e.changed_by_name && <span className="text-muted-foreground text-xs">· {e.changed_by_name}</span>}
                  {e.sold_price != null && (
                    <span className="text-muted-foreground text-xs tabular-n">
                      · {formatMoney(e.sold_price, e.sold_currency || currency)}
                    </span>
                  )}
                  {e.reason && <span className="text-muted-foreground text-xs w-full">{e.reason}</span>}
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npx vitest run components/properties/detail/PropertyCommercialStatusCard.test.tsx`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add components/properties/detail/PropertyCommercialStatusCard.tsx components/properties/detail/PropertyCommercialStatusCard.test.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): tarjeta para cambiar el estado comercial con historial"
```

---

### Task 5: Integración en la ficha

Conectar la tarjeta, mostrar el badge en la cabecera y sacar los botones que quedaron duplicados.

**Files:**
- Modify: `components/properties/detail/tabs/OverviewTab.tsx`
- Modify: `components/properties/detail/PropertyIdentityBar.tsx`
- Modify: `components/properties/detail/PropertyArchiveFooter.tsx`
- Modify: `app/(dashboard)/properties/[id]/page.tsx`

**Interfaces:**
- Consumes: `PropertyCommercialStatusCard` (Task 4); `commercialStatusDef`, tipo `CommercialStatus` (Task 2).
- Produces: `OverviewProperty` gana `id`, `commercial_status`, `sold_price`, `sold_currency`, `sold_at`; `OverviewTab` gana la prop `onChanged: () => void`; `PropertyIdentityBar` gana `commercialStatus?: string`; `PropertyArchiveFooter` pierde `isDiscarded`, `onDiscard` y `onRestore`.

- [ ] **Step 1: Agregar el badge a `PropertyIdentityBar`**

En `components/properties/detail/PropertyIdentityBar.tsx`, agregar el import y la prop:

```tsx
import { commercialStatusDef } from '@/lib/properties/commercial-status'
```

En la interfaz `Props`, después de `statusColor`:

```tsx
  /** Estado comercial. El badge solo se muestra cuando NO es 'disponible', para no sumar ruido al caso normal. */
  commercialStatus?: string | null
```

Agregarla al destructuring de parámetros y, dentro del bloque de la derecha, reemplazar:

```tsx
        <Badge className={`text-white text-xs mt-2 ${statusColor}`}>{statusLabel}</Badge>
```

por:

```tsx
        <div className="flex flex-wrap gap-1.5 mt-2 sm:justify-end">
          <Badge className={`text-white text-xs ${statusColor}`}>{statusLabel}</Badge>
          {commercialStatus && commercialStatus !== 'disponible' && (
            <Badge className={`text-xs ${commercialStatusDef(commercialStatus).badge}`}>
              {commercialStatusDef(commercialStatus).label}
            </Badge>
          )}
        </div>
```

- [ ] **Step 2: Poner la tarjeta arriba de la pestaña Propiedad**

En `components/properties/detail/tabs/OverviewTab.tsx`:

**2a.** Agregar el import:

```tsx
import { PropertyCommercialStatusCard } from '../PropertyCommercialStatusCard'
import { commercialStatusDef } from '@/lib/properties/commercial-status'
```

**2b.** En `OverviewProperty`, agregar:

```tsx
  id: string
  commercial_status?: string | null
  sold_price?: number | null
  sold_currency?: string | null
  sold_at?: string | null
```

**2c.** Cambiar la firma para recibir `onChanged`:

```tsx
export function OverviewTab({ property, isAbogado, onChanged }: { property: OverviewProperty; isAbogado: boolean; onChanged: () => void }) {
```

**2d.** Justo después de `<div className="space-y-8">`, antes del `<div className="grid ...">`, insertar:

```tsx
      {/* El abogado no ve ni toca datos comerciales. */}
      {!isAbogado && (
        <PropertyCommercialStatusCard
          propertyId={property.id}
          current={commercialStatusDef(property.commercial_status).key}
          currency={property.currency}
          soldPrice={property.sold_price ?? null}
          soldCurrency={property.sold_currency ?? null}
          soldAt={property.sold_at ?? null}
          onChanged={onChanged}
        />
      )}
```

- [ ] **Step 3: Sacar Descartar y Restaurar del pie**

Reemplazar el contenido completo de `components/properties/detail/PropertyArchiveFooter.tsx` por:

```tsx
'use client'

import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface Props {
  createdAt: string
  canHardDelete: boolean
  submitting: boolean
  onDelete: () => void
}

/**
 * Franja discreta al pie. Descartar y restaurar dejaron de vivir acá: ahora son
 * estados de la tarjeta "Estado de la propiedad" (2026-08-06). Eliminar se queda
 * porque es otra cosa: borra la propiedad de la base, no cambia su estado.
 */
export function PropertyArchiveFooter({ createdAt, canHardDelete, submitting, onDelete }: Props) {
  return (
    <div className="border-t pt-4 mt-10 flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
      <span>Creada el {new Date(createdAt).toLocaleDateString('es-AR')}</span>
      {canHardDelete && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={submitting}
          className="text-[color:var(--destructive)] hover:text-[color:var(--destructive)]"
        >
          <Trash2 className="h-3.5 w-3.5 mr-1" />
          Eliminar definitivamente
        </Button>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Conectar todo en la página**

En `app/(dashboard)/properties/[id]/page.tsx`:

**4a.** En la interfaz `PropertyData`, después de `status: string`, agregar:

```tsx
  commercial_status: string | null
  sold_price: number | null
  sold_currency: string | null
  sold_at: string | null
```

**4b.** En el JSX de `PropertyIdentityBar`, agregar la prop antes de `showPrice`:

```tsx
        commercialStatus={property.commercial_status}
```

**4c.** En el render de `OverviewTab`, agregar `onChanged`:

```tsx
        {tab === 'propiedad' && <OverviewTab property={property} isAbogado={!!isAbogado} onChanged={fetchProperty} />}
```

**4d.** En el render de `PropertyArchiveFooter`, dejar solo las props que quedaron:

```tsx
      {!isAbogado && (
        <PropertyArchiveFooter
          createdAt={property.created_at}
          canHardDelete={canHardDelete}
          submitting={submitting}
          onDelete={handleDelete}
        />
      )}
```

**4e.** Borrar las funciones `handleDiscard` y `handleRestore`, que ya no las usa nadie.

- [ ] **Step 5: Verificar que compila y que la suite sigue verde**

Run: `npx tsc --noEmit 2>&1 | grep -E "properties/detail|properties/\[id\]" || echo "sin errores en mis archivos"`
Expected: `sin errores en mis archivos`.

Run: `npx vitest run`
Expected: toda la suite en verde. Hoy ningún test cubre `PropertyArchiveFooter`, así que sacarle los botones no debería romper nada. Si aun así algún test falla porque esperaba "Descartar", **actualizarlo**: el botón se movió a propósito y el test viejo está midiendo algo que ya no es cierto.

- [ ] **Step 6: Commit**

```bash
git add components/properties/detail "app/(dashboard)/properties/[id]/page.tsx"
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): estado comercial integrado en la ficha (tarjeta, badge y pie)"
```

---

### Task 6: Verificación de punta a punta

**Files:**
- Create: `scripts/verify-commercial-status.ts`
- Create: `scripts/property-commercial-status.probe.tsx`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: dos scripts ejecutables que fallan ruidosamente.

- [ ] **Step 1: Escribir el probe de render**

Crear `scripts/property-commercial-status.probe.tsx`:

```tsx
/**
 * Probe de render de la tarjeta de estado comercial, en los cinco estados.
 * Correr: npx tsx scripts/property-commercial-status.probe.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { PropertyCommercialStatusCard } from '@/components/properties/detail/PropertyCommercialStatusCard'
import { COMMERCIAL_STATUSES } from '@/lib/properties/commercial-status'

for (const s of COMMERCIAL_STATUSES) {
  const html = renderToStaticMarkup(
    <PropertyCommercialStatusCard
      propertyId="p1" current={s.key} currency="USD"
      soldPrice={s.key === 'vendida' ? 180000 : null}
      soldCurrency={s.key === 'vendida' ? 'USD' : null}
      soldAt={s.key === 'vendida' ? '2026-08-01' : null}
      onChanged={() => {}}
    />,
  )
  if (!html.includes(s.label)) throw new Error(`[${s.key}] no muestra su etiqueta`)
  if (!html.includes('Estado de la propiedad')) throw new Error(`[${s.key}] falta el encabezado`)
  for (const otro of COMMERCIAL_STATUSES) {
    if (otro.key === s.key) continue
    if (!html.includes(otro.label)) throw new Error(`[${s.key}] no ofrece cambiar a ${otro.label}`)
  }
  if (s.key === 'vendida' && !html.includes('180.000')) {
    throw new Error('[vendida] no muestra el precio real cargado')
  }
  console.log(`✓ ${s.label}`)
}

// El abogado NO debe ver la tarjeta: la puerta está en OverviewTab, no en la
// tarjeta misma, así que se verifica ahí.
const propiedad = {
  id: 'p1', address: 'Av. Rivadavia 4820', neighborhood: 'Caballito', city: 'CABA',
  property_type: 'departamento', operation_type: 'venta', asking_price: 185000,
  currency: 'USD', commission_percentage: 3, commercial_status: 'reservada',
  latitude: null, longitude: null,
}
const htmlAbogado = renderToStaticMarkup(
  <OverviewTab property={propiedad} isAbogado onChanged={() => {}} />)
if (htmlAbogado.includes('Estado de la propiedad')) {
  throw new Error('[abogado] no debería ver la tarjeta de estado comercial')
}
const htmlAsesor = renderToStaticMarkup(
  <OverviewTab property={propiedad} isAbogado={false} onChanged={() => {}} />)
if (!htmlAsesor.includes('Estado de la propiedad')) {
  throw new Error('[asesor] debería ver la tarjeta de estado comercial')
}
console.log('✓ la tarjeta se le oculta al abogado')

console.log('\nLa tarjeta renderiza en los cinco estados.')
```

El probe necesita también este import arriba:

```tsx
import { OverviewTab } from '@/components/properties/detail/tabs/OverviewTab'
```

- [ ] **Step 2: Correr el probe**

Run: `npx tsx scripts/property-commercial-status.probe.tsx`
Expected: cinco `✓` y `La tarjeta renderiza en los cinco estados.`

- [ ] **Step 3: Escribir la verificación contra la base real**

Crear `scripts/verify-commercial-status.ts`. Recibe el id de una propiedad, hace el ciclo completo y **revierte**. Se niega a tocar una propiedad que no esté en `disponible`, para no pisar nunca una venta real:

```ts
/**
 * Verifica de punta a punta el estado comercial contra la base REAL:
 * cambia el estado de una propiedad, confirma que quedaron la columna y el
 * evento, y revierte todo.
 *
 * Correr: node --env-file=.env.local --import tsx scripts/verify-commercial-status.ts <propertyId>
 */
import { Client } from 'pg'
import { buildStatusPatch } from '../lib/properties/commercial-status'

async function main() {
  const id = process.argv[2]
  if (!id) throw new Error('Falta el id de la propiedad: ... verify-commercial-status.ts <propertyId>')

  const c = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com', port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep', password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres', ssl: { rejectUnauthorized: false },
  })
  await c.connect()

  const { rows: [prop] } = await c.query(
    'SELECT id, address, commercial_status, status FROM properties WHERE id = $1', [id])
  if (!prop) throw new Error('No existe esa propiedad')
  if (prop.commercial_status !== 'disponible') {
    throw new Error(`La propiedad está en "${prop.commercial_status}". Elegí una en "disponible" para no pisar datos reales.`)
  }
  console.log(`propiedad: ${prop.address} (${prop.commercial_status})`)

  const patch = buildStatusPatch({ from: 'disponible', to: 'reservada' })
  await c.query(
    'UPDATE properties SET commercial_status = $1, sold_price = $2, sold_currency = $3, sold_at = $4 WHERE id = $5',
    [patch.commercial_status, patch.sold_price, patch.sold_currency, patch.sold_at, id])
  const { rows: [ev] } = await c.query(
    `INSERT INTO property_status_events (property_id, from_status, to_status, reason)
     VALUES ($1,'disponible','reservada','verificación automática') RETURNING id`, [id])

  const { rows: [despues] } = await c.query(
    'SELECT commercial_status FROM properties WHERE id = $1', [id])
  const { rows: [cuenta] } = await c.query(
    'SELECT count(*)::int AS n FROM property_status_events WHERE property_id = $1', [id])
  console.log(`estado tras el cambio: ${despues.commercial_status} · eventos: ${cuenta.n}`)

  // Revertir SIEMPRE, incluso si algo falla más arriba.
  await c.query("UPDATE properties SET commercial_status = 'disponible' WHERE id = $1", [id])
  await c.query('DELETE FROM property_status_events WHERE id = $1', [ev.id])
  const { rows: [final] } = await c.query(
    'SELECT commercial_status FROM properties WHERE id = $1', [id])
  await c.end()

  if (despues.commercial_status !== 'reservada') throw new Error('el estado no se guardó')
  if (cuenta.n < 1) throw new Error('el evento no se registró')
  if (final.commercial_status !== 'disponible') throw new Error('¡no se pudo revertir! revisar a mano')

  console.log('\n✅ ciclo completo verificado y revertido')
}

main().catch(e => { console.error('❌', e.message); process.exit(1) })
```

- [ ] **Step 4: Correr la verificación**

Elegir el id de una propiedad en `disponible`:

```bash
node --env-file=.env.local --import tsx -e "
import {Client} from 'pg';
const c=new Client({host:'aws-0-us-west-2.pooler.supabase.com',port:5432,user:'postgres.mncsnastmcjdjxrehdep',password:process.env.SUPABASE_DB_PASSWORD,database:'postgres',ssl:{rejectUnauthorized:false}});
await c.connect();
const {rows}=await c.query(\"SELECT id,address FROM properties WHERE commercial_status='disponible' LIMIT 1\");
console.log(rows[0]); await c.end();"
```

Luego: `node --env-file=.env.local --import tsx scripts/verify-commercial-status.ts <id>`
Expected: `✅ ciclo completo verificado y revertido`.

- [ ] **Step 5: Verificación completa**

Run: `npx vitest run && npx tsc --noEmit 2>&1 | grep -cE "error TS"`
Expected: suite en verde; la cuenta de errores de tipos igual a la del baseline (no debe subir).

Run: `git diff --name-only origin/main HEAD`
Expected: SOLO archivos de esta tarea (migración, script, `lib/properties/commercial-status*`, `components/properties/detail/*`, la ruta de API, `page.tsx`, los dos scripts y los dos documentos). **Si aparece cualquier archivo ajeno, parar**: se contaminó la rama y hay que reconstruirla desde `origin/main`.

- [ ] **Step 6: Commit**

```bash
git add scripts/verify-commercial-status.ts scripts/property-commercial-status.probe.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "test(properties): probe de la tarjeta y verificación del estado comercial contra la base"
```

- [ ] **Step 7: Revisión visual del usuario**

Levantar el servidor desde el worktree (ruta sin acentos, pero Turbopack rechaza el `node_modules` enlazado, así que va webpack):

```bash
cd /tmp/claude-501/estado-comercial && npx next dev --webpack --port 3200
```

Pedirle al usuario que confirme en el navegador:

1. La tarjeta "Estado de la propiedad" aparece arriba de todo en la pestaña Propiedad.
2. Al elegir "Vendida" pide precio real, moneda y fecha; sin precio no deja confirmar.
3. Después de guardar, el badge del estado aparece en la cabecera, junto al de captación.
4. El historial de abajo muestra el cambio con la fecha y quién lo hizo.
5. El pie ya no tiene "Descartar" — descartar ahora es una opción de la tarjeta.
6. Con el usuario abogado, la tarjeta no aparece.

---

## Notas de implementación

- **Orden:** 1 → 6 en secuencia. La Task 1 es un gate duro: si la migración no se aplica, nada de lo que sigue funciona en producción.
- **Qué NO tocar:** `lib/supabase/properties.ts` (`checkAndAdvanceProperty`), el `PUT /api/properties/[id]`, el listado de propiedades, la vista `vw_properties_list` y cualquier archivo de `components/inbox/` o `app/(dashboard)/inbox/` (otra sesión trabaja ahí).
- **Al terminar**, actualizar `CLAUDE.md` con una entrada corta: qué es `commercial_status`, por qué está separado de `status`, y que el espejo de `descartada` en `status` es deuda documentada a eliminar cuando se migren los cinco lectores.
