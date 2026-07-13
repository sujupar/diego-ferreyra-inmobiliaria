# Conteo de Consultas por Propiedad — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FK real `property_id` en `portal_inquiries`/`portal_property_map` + RPCs de agregación + panel filtrable por fecha en `/metrics` + pestaña "Consultas" en la ficha de propiedad.

**Architecture:** Alinea `portal_inquiries` al patrón FK ya probado de `property_leads` (hoy el vínculo consulta→propiedad es el string `notes='property:<id>'` en 2 saltos). El conteo es query-time (`GROUP BY` sobre FK indexada, sin rollup). Spec: `docs/superpowers/specs/2026-07-11-consultas-por-propiedad-design.md`.

**Tech Stack:** Next.js 16 (App Router) + Supabase (SQL migrations + RPCs `LANGUAGE sql STABLE`) + shadcn/ui + vitest.

## Global Constraints

- Commit author DEBE ser `Sujupar <redstyle50@gmail.com>` (ya configurado en el repo) o el deploy de Netlify falla.
- Todo commit termina con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **PUSH GATE:** Netlify auto-deploya en cada push a `main`. Las Tasks 3–9 escriben/leen la columna `property_id` — si se deployan ANTES de correr las migraciones, el INSERT del cron falla y **se rompe la ingesta de consultas**. Por eso: la Task 1–2 (solo archivos SQL, no se ejecutan solos) SE PUEDE pushear; las Tasks 3–9 se commitean LOCAL sin push; el push de todo ocurre en la Task 10, DESPUÉS de que el usuario confirme que corrió las migraciones en el Dashboard de Supabase (la CLI de Supabase no conecta — el usuario corre SQL a mano).
- Las tablas `portal_*` NO están en `types/database.types.ts` → clientes "sueltos"/casts `as any`, igual que `/api/portal-inquiries` y `lib/metrics/funnel.ts` (patrón existente).
- Base temporal de TODAS las métricas: `COALESCE(received_at, created_at)::date` (definido en el spec).
- Prosa y labels de UI en español (es-AR).
- Typecheck: `npx tsc --noEmit` (no hay script npm). Tests: `npx vitest run <archivo>`; si fallara por el path con acento, agregar `--pool=threads`.
- Los comandos con rutas usan comillas por el espacio/acento del path: `cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"`.

---

### Task 1: Migración FK + índices + backfill

**Files:**
- Create: `supabase/migrations/20260711000001_portal_inquiries_property_fk.sql`

**Interfaces:**
- Consumes: tablas existentes `portal_inquiries`, `portal_property_map`, `properties` (migración `20260603000001_portal_inquiries.sql`).
- Produces: columnas `portal_property_map.property_id` y `portal_inquiries.property_id` (UUID, FK a `properties(id) ON DELETE SET NULL`), índices `idx_portal_map_property`, `idx_portal_inquiries_property`, `idx_portal_inquiries_received`. Backfill idempotente. Las Tasks 3–9 dependen de estas columnas.

Nota: no hay test automatizado de migraciones en este repo (se corren a mano en el Dashboard). La verificación va como SQL comentado al pie del archivo y se ejecuta en la Task 10.

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- =============================================================================
-- FK real consulta → propiedad (sistema de consultas de portales)
-- =============================================================================
-- Hoy el vínculo consulta→propiedad vive en la convención de texto
-- portal_property_map.notes = 'property:<id>' (2 saltos, sin FK). Esta migración
-- lo reemplaza por FKs reales, alineando portal_inquiries al patrón ya probado
-- de property_leads. `notes` NO se elimina: sigue siendo la clave de dedup
-- idempotente de syncPortalPropertyMap (delete+insert por propiedad).
-- Spec: docs/superpowers/specs/2026-07-11-consultas-por-propiedad-design.md
--
-- ON DELETE SET NULL (regla del proyecto para FKs de historiales): borrar una
-- propiedad no rompe el histórico de consultas.
-- Todo idempotente (IF NOT EXISTS / guards IS NULL): re-ejecutable sin daño.
-- =============================================================================

-- 1) FK real en el mapa (reemplaza la convención notes='property:<id>').
ALTER TABLE public.portal_property_map
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_portal_map_property
  ON public.portal_property_map (property_id);

-- 2) FK real en la consulta (el corazón del conteo por propiedad).
ALTER TABLE public.portal_inquiries
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;

-- Ficha de propiedad: "consultas de ESTA propiedad, más recientes primero".
CREATE INDEX IF NOT EXISTS idx_portal_inquiries_property
  ON public.portal_inquiries (property_id, received_at DESC);

-- Dashboard global: range-scan por fecha antes de agrupar.
CREATE INDEX IF NOT EXISTS idx_portal_inquiries_received
  ON public.portal_inquiries (received_at);

COMMENT ON COLUMN public.portal_inquiries.property_id IS
  'Propiedad captada a la que pertenece la consulta (via matcher). NULL = sin identificar.';
COMMENT ON COLUMN public.portal_property_map.property_id IS
  'FK real a properties. Reemplaza la convención notes=''property:<id>'' (que se mantiene como clave de dedup).';

-- 3) Backfill del mapa desde notes (solo UUID válido y propiedad existente).
UPDATE public.portal_property_map m
   SET property_id = substring(m.notes from 'property:([0-9a-fA-F-]{36})')::uuid
 WHERE m.property_id IS NULL
   AND m.notes ~ 'property:[0-9a-fA-F-]{36}'
   AND EXISTS (
     SELECT 1 FROM public.properties p
      WHERE p.id = substring(m.notes from 'property:([0-9a-fA-F-]{36})')::uuid
   );

-- 4) Backfill de las consultas desde matched_map_id → map.property_id.
--    Re-ejecutable: correrlo de nuevo tras el deploy cubre las consultas
--    ingresadas entre la migración y el deploy del código.
UPDATE public.portal_inquiries pi
   SET property_id = m.property_id
  FROM public.portal_property_map m
 WHERE pi.matched_map_id = m.id
   AND m.property_id IS NOT NULL
   AND pi.property_id IS NULL;

-- =============================================================================
-- Verificación (correr a mano tras aplicar):
--   SELECT COUNT(*) AS total, COUNT(property_id) AS con_fk FROM public.portal_property_map;
--   SELECT COUNT(*) AS total, COUNT(property_id) AS con_fk FROM public.portal_inquiries;
--   -- con_fk del mapa ≈ filas con notes 'property:...'; con_fk de inquiries ≈ matcheadas.
-- =============================================================================
```

- [ ] **Step 2: Commit (y push permitido — los .sql no se ejecutan solos)**

```bash
cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"
git add supabase/migrations/20260711000001_portal_inquiries_property_fk.sql
git commit -m "feat(consultas): FK property_id en portal_inquiries y portal_property_map + backfill

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Migración RPCs de agregación

**Files:**
- Create: `supabase/migrations/20260711000002_property_inquiries_rpcs.sql`

**Interfaces:**
- Consumes: columnas creadas en Task 1.
- Produces: `get_property_inquiry_counts(p_from DATE, p_to DATE)` → filas `(property_id uuid, address text, neighborhood text, assigned_to uuid, total bigint, mercadolibre bigint, argenprop bigint, zonaprop bigint, last_inquiry_at timestamptz)`; `get_inquiries_summary(p_from DATE, p_to DATE)` → filas `(metric text, value bigint)` con metrics `total|matched|unidentified|mercadolibre|argenprop|zonaprop`. La Task 7 las invoca con `.rpc(...)`.

- [ ] **Step 1: Crear el archivo de migración**

```sql
-- =============================================================================
-- RPCs de métricas de consultas por propiedad
-- =============================================================================
-- Patrón idéntico a 20260518000004_metrics_rpcs.sql: get_*(p_from, p_to),
-- LANGUAGE sql STABLE, GRANT a authenticated (la RLS de las tablas subyacentes
-- filtra a nivel de fila; el gate de negocio es requirePermission('metrics.view')
-- en la ruta API). Conteo query-time sobre la FK indexada — sin rollup (decisión
-- del spec: exacto, sin sincronización; el rollup se agrega detrás de la MISMA
-- RPC si el volumen algún día lo exige).
-- Base temporal: COALESCE(received_at, created_at)::date (received_at = cuándo
-- consultó el lead; created_at = fallback si el parseo no trajo fecha).
-- =============================================================================

-- Regla del proyecto: DROP previo por si cambia el return type en el futuro.
DROP FUNCTION IF EXISTS get_property_inquiry_counts(DATE, DATE);

CREATE FUNCTION get_property_inquiry_counts(p_from DATE, p_to DATE)
RETURNS TABLE (
  property_id     uuid,
  address         text,
  neighborhood    text,
  assigned_to     uuid,
  total           bigint,
  mercadolibre    bigint,
  argenprop       bigint,
  zonaprop        bigint,
  last_inquiry_at timestamptz
)
LANGUAGE sql
STABLE
AS $$
  SELECT pi.property_id,
         p.address,
         p.neighborhood,
         p.assigned_to,
         COUNT(*)::bigint                                            AS total,
         COUNT(*) FILTER (WHERE pi.portal = 'mercadolibre')::bigint  AS mercadolibre,
         COUNT(*) FILTER (WHERE pi.portal = 'argenprop')::bigint     AS argenprop,
         COUNT(*) FILTER (WHERE pi.portal = 'zonaprop')::bigint      AS zonaprop,
         MAX(COALESCE(pi.received_at, pi.created_at))                AS last_inquiry_at
    FROM public.portal_inquiries pi
    JOIN public.properties p ON p.id = pi.property_id
   WHERE pi.property_id IS NOT NULL
     AND COALESCE(pi.received_at, pi.created_at)::date BETWEEN p_from AND p_to
   GROUP BY pi.property_id, p.address, p.neighborhood, p.assigned_to
   ORDER BY total DESC;
$$;

COMMENT ON FUNCTION get_property_inquiry_counts(DATE, DATE) IS
  'Consultas de portales por propiedad en el rango (una fila por propiedad con >=1 consulta), con desglose por portal.';

DROP FUNCTION IF EXISTS get_inquiries_summary(DATE, DATE);

CREATE FUNCTION get_inquiries_summary(p_from DATE, p_to DATE)
RETURNS TABLE (metric text, value bigint)
LANGUAGE sql
STABLE
AS $$
  WITH base AS (
    SELECT portal, property_id
      FROM public.portal_inquiries
     WHERE COALESCE(received_at, created_at)::date BETWEEN p_from AND p_to
  )
  SELECT 'total'::text,        COUNT(*)::bigint                                        FROM base
  UNION ALL
  SELECT 'matched',            COUNT(*) FILTER (WHERE property_id IS NOT NULL)::bigint FROM base
  UNION ALL
  SELECT 'unidentified',       COUNT(*) FILTER (WHERE property_id IS NULL)::bigint     FROM base
  UNION ALL
  SELECT 'mercadolibre',       COUNT(*) FILTER (WHERE portal = 'mercadolibre')::bigint FROM base
  UNION ALL
  SELECT 'argenprop',          COUNT(*) FILTER (WHERE portal = 'argenprop')::bigint    FROM base
  UNION ALL
  SELECT 'zonaprop',           COUNT(*) FILTER (WHERE portal = 'zonaprop')::bigint     FROM base;
$$;

COMMENT ON FUNCTION get_inquiries_summary(DATE, DATE) IS
  'Escalares del período para las tarjetas resumen: total, identificadas (property_id NOT NULL), sin identificar, y por portal.';

-- Permisos: usuarios autenticados pueden ejecutar (la RLS de las tablas
-- subyacentes filtra a nivel de fila).
GRANT EXECUTE ON FUNCTION get_property_inquiry_counts(DATE, DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION get_inquiries_summary(DATE, DATE)       TO authenticated;

-- =============================================================================
-- Verificación (correr a mano tras aplicar):
--   SELECT * FROM get_inquiries_summary('2026-06-01', '2026-07-31');
--   SELECT * FROM get_property_inquiry_counts('2026-06-01', '2026-07-31') LIMIT 10;
-- =============================================================================
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria"
git add supabase/migrations/20260711000002_property_inquiries_rpcs.sql
git commit -m "feat(consultas): RPCs get_property_inquiry_counts + get_inquiries_summary

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main   # solo hay archivos SQL en estos 2 commits — deploy inocuo
```

---

### Task 3: `match.ts` propaga `propertyId` (TDD)

**Files:**
- Modify: `lib/integrations/portal-inquiries/match.ts`
- Test: `lib/integrations/portal-inquiries/match.test.ts`

**Interfaces:**
- Consumes: columna `portal_property_map.property_id` (Task 1).
- Produces: `PortalMapRow` gana `property_id: string | null` (campo requerido); `MatchResult` gana `propertyId: string | null`. `matchProperty` y `pickBestMatch` lo devuelven poblado. Las Tasks 5 y el rematch dependen de `match.propertyId`.

- [ ] **Step 1: Actualizar el test (RED)**

En `lib/integrations/portal-inquiries/match.test.ts`:

(a) Reemplazar el fixture `rows` completo (líneas ~8-13) por:

```typescript
const rows: PortalMapRow[] = [
  { id: 'm1', portal: 'mercadolibre', external_code: 'MLA1234567890', external_url: 'https://articulo.mercadolibre.com.ar/MLA-1234567890', address: 'Av. Cabildo 2000', title: 'Depto Belgrano', assigned_to: LUCAS, active: true, property_id: 'prop-m1' },
  { id: 'm2', portal: 'zonaprop', external_code: null, external_url: 'https://www.zonaprop.com.ar/propiedades/depto-palermo-49012345.html', address: 'Honduras 5000', title: 'Departamento 3 ambientes en Palermo', assigned_to: DIEGO, active: true, property_id: 'prop-m2' },
  { id: 'm3', portal: 'argenprop', external_code: '7654321', external_url: null, address: null, title: 'Casa en Nueva Córdoba', assigned_to: DIEGO, active: true, property_id: null },
  { id: 'm4', portal: 'zonaprop', external_code: null, external_url: 'https://www.zonaprop.com.ar/x-999.html', address: 'Inactiva 1', title: 'Inactiva', assigned_to: LUCAS, active: false, property_id: null },
]
```

(b) Reemplazar el `toEqual` del test "matchea por código exacto (normalizado)" por:

```typescript
    expect(r).toEqual({ mapId: 'm1', assignedTo: LUCAS, method: 'code', address: 'Av. Cabildo 2000', title: 'Depto Belgrano', external_url: 'https://articulo.mercadolibre.com.ar/MLA-1234567890', propertyId: 'prop-m1' })
```

(c) Reemplazar el `toEqual` del test "devuelve none si no hay match" por:

```typescript
    expect(r).toEqual({ mapId: null, assignedTo: null, method: 'none', address: null, title: null, external_url: null, propertyId: null })
```

(d) Agregar estos dos tests dentro del `describe('pickBestMatch', ...)` (después de "ignora filas inactivas"):

```typescript
  it('propaga propertyId del mapa cuando la fila tiene FK', () => {
    const r = pickBestMatch(inquiry({ portal: 'zonaprop', propertyAddress: 'Honduras 5000' }), rows)
    expect(r.propertyId).toBe('prop-m2')
  })

  it('propertyId null cuando la fila del mapa no tiene FK (fila legacy)', () => {
    const r = pickBestMatch(inquiry({ portal: 'argenprop', propertyCode: '7654321' }), rows)
    expect(r.assignedTo).toBe(DIEGO)
    expect(r.propertyId).toBeNull()
  })
```

(e) En el `describe('pickBestMatch — dirección por calle (Argenprop)')`, reemplazar el fixture `map` completo por (mismas 8 filas + `property_id: null`):

```typescript
  const map: PortalMapRow[] = [
    { id: 'd1', portal: 'argenprop', external_code: null, external_url: null, address: 'Agüero 950', title: null, assigned_to: DIEGO, active: true, property_id: null },
    { id: 'd2', portal: 'argenprop', external_code: null, external_url: null, address: 'Entre Ríos 2333', title: null, assigned_to: DIEGO, active: true, property_id: null },
    { id: 'd3', portal: 'argenprop', external_code: null, external_url: null, address: 'Gabriela Mistral 2750', title: null, assigned_to: DIEGO, active: true, property_id: null },
    { id: 'd4', portal: 'argenprop', external_code: null, external_url: null, address: 'Avenida Ángel Gallardo 200', title: null, assigned_to: DIEGO, active: true, property_id: null },
    { id: 'l1', portal: 'argenprop', external_code: null, external_url: null, address: 'Coronel Ramón Lorenzo Falcón 2500', title: null, assigned_to: LUCAS, active: true, property_id: null },
    { id: 'l2', portal: 'argenprop', external_code: null, external_url: null, address: 'Santo Tomé 2600', title: null, assigned_to: LUCAS, active: true, property_id: null },
    { id: 'l3', portal: 'argenprop', external_code: null, external_url: null, address: 'Juan B. Ambrosetti 95', title: null, assigned_to: LUCAS, active: true, property_id: null },
    { id: 'l4', portal: 'argenprop', external_code: null, external_url: null, address: 'Lares de Canning', title: null, assigned_to: LUCAS, active: true, property_id: null },
  ]
```

- [ ] **Step 2: Correr el test — debe FALLAR**

Run: `cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria" && npx vitest run lib/integrations/portal-inquiries/match.test.ts`
Expected: FAIL — los dos `toEqual` esperan la key `propertyId` que el resultado actual no tiene, y los 2 tests nuevos fallan (`undefined` en vez de `'prop-m2'`/`null` estricto).

- [ ] **Step 3: Implementar en `match.ts` (GREEN)**

Cuatro ediciones exactas:

(a) `PortalMapRow` — agregar el campo (después de `assigned_to`):

```typescript
export interface PortalMapRow {
  id: string
  portal: string
  external_code: string | null
  external_url: string | null
  address: string | null
  title: string | null
  assigned_to: string | null
  property_id: string | null
  active: boolean
}
```

(b) `MatchResult` — agregar `propertyId`:

```typescript
export interface MatchResult {
  mapId: string | null
  assignedTo: string | null
  propertyId: string | null
  method: MatchMethod
  address: string | null
  title: string | null
  external_url: string | null
}
```

(c) La constante `NONE` y la arrow `hit()` (dentro de `pickBestMatch`):

```typescript
const NONE: MatchResult = { mapId: null, assignedTo: null, propertyId: null, method: 'none', address: null, title: null, external_url: null }
```

```typescript
  const hit = (r: PortalMapRow, method: MatchMethod): MatchResult => ({ mapId: r.id, assignedTo: r.assigned_to, propertyId: r.property_id, method, address: r.address, title: r.title, external_url: r.external_url })
```

(d) El `.select(...)` de `matchProperty`:

```typescript
    .select('id, portal, external_code, external_url, address, title, assigned_to, property_id, active')
```

- [ ] **Step 4: Correr el test — debe PASAR**

Run: `npx vitest run lib/integrations/portal-inquiries/match.test.ts`
Expected: PASS (21 tests: los 19 previos ajustados + 2 nuevos).

- [ ] **Step 5: Commit (LOCAL, sin push — ver PUSH GATE)**

```bash
git add lib/integrations/portal-inquiries/match.ts lib/integrations/portal-inquiries/match.test.ts
git commit -m "feat(consultas): matcher propaga property_id del mapa (MatchResult.propertyId)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Write-path del mapa — los 4 writers setean `property_id`

**Files:**
- Modify: `app/api/properties/[id]/ml-publish/route.ts` (función `syncPortalPropertyMap`, ~L55-66)
- Modify: `app/api/properties/[id]/ap-publish/route.ts` (función `syncPortalPropertyMap`, ~L28-41)
- Modify: `lib/portals/refresh-zonaprop-map.ts` (objeto `record`, ~L121-124)
- Modify: `scripts/backfill-map-from-properties.ts` (objeto `rec`, ~L132)

**Interfaces:**
- Consumes: columna `portal_property_map.property_id` (Task 1). En los 4 sitios el id de la propiedad ya está a mano (`property.id` / `ref.id` / `p.id`).
- Produces: toda fila NUEVA del mapa nace con FK → el matcher (Task 3) la propaga a las consultas.

- [ ] **Step 1: `ml-publish` — agregar `property_id` al insert**

En `syncPortalPropertyMap`, el `.insert({...})` queda:

```typescript
  await db.from('portal_property_map').insert({
    portal: 'mercadolibre',
    external_code: externalId,
    external_url: externalUrl,
    address: property.address,
    neighborhood: property.neighborhood,
    title: property.title ?? property.address,
    assigned_to: property.assigned_to,
    property_id: property.id,
    active: true,
    notes: noteKey,
  })
```

- [ ] **Step 2: `ap-publish` — idéntico (espejo argenprop)**

```typescript
  await db.from('portal_property_map').insert({
    portal: 'argenprop', external_code: externalId, external_url: externalUrl,
    address: property.address, neighborhood: property.neighborhood,
    title: property.title ?? property.address, assigned_to: property.assigned_to,
    property_id: property.id, active: true, notes: noteKey,
  })
```

- [ ] **Step 3: `refresh-zonaprop-map.ts` — el `record` del upsert**

```typescript
    const record = {
      portal: 'zonaprop', external_code: p.postingCode, external_url: p.url || null,
      address: p.address || null, title: p.title || null, assigned_to: ref.assigned_to,
      property_id: ref.id, active: true,
    }
```

(Como el `record` se usa también en el `.update(record)`, las filas EXISTENTES del mapa zonaprop ganan la FK en la próxima corrida del cron — backfill gratis.)

- [ ] **Step 4: `scripts/backfill-map-from-properties.ts` — el `rec`**

```typescript
      const rec = { portal: PORTAL, address: p.address, neighborhood: p.neighborhood, title: p.address, assigned_to: p.assigned_to, active: true, notes: `property:${p.id}`, property_id: p.id }
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0 (los writers usan `LooseQuery`/`Record<string, unknown>` — el campo nuevo no rompe tipos).

- [ ] **Step 6: Commit (LOCAL, sin push)**

```bash
git add "app/api/properties/[id]/ml-publish/route.ts" "app/api/properties/[id]/ap-publish/route.ts" lib/portals/refresh-zonaprop-map.ts scripts/backfill-map-from-properties.ts
git commit -m "feat(consultas): writers del mapa setean property_id (ml/ap-publish, scrape zonaprop, backfill)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Ingesta — el cron y el rematch escriben `portal_inquiries.property_id`

**Files:**
- Modify: `app/api/cron/portal-inquiries/route.ts` (el `.insert({...})`, ~L124-143)
- Modify: `scripts/portal-inquiries-rematch.ts` (select, skip-condition y update, L33-58)

**Interfaces:**
- Consumes: `match.propertyId` (Task 3) y columna `portal_inquiries.property_id` (Task 1).
- Produces: toda consulta NUEVA nace con FK; el rematch deriva la FK para consultas viejas re-matcheadas. Las RPCs (Task 2) y la API (Tasks 6-7) leen esta columna.

- [ ] **Step 1: Cron — agregar `property_id` al insert**

En `app/api/cron/portal-inquiries/route.ts`, dentro del `.insert({...})`, agregar UNA línea inmediatamente después de `matched_map_id: match.mapId,`:

```typescript
            matched_map_id: match.mapId,
            property_id: match.propertyId, // FK real a properties (null = sin identificar)
            assigned_to: match.assignedTo, // null si unmatched → notify usa al dueño
```

- [ ] **Step 2: Rematch — select + skip + update**

En `scripts/portal-inquiries-rematch.ts`, tres ediciones:

(a) El `.select(...)` (L35) queda:

```typescript
    .select('id, seq, portal, property_external_code, property_url, property_address, assigned_to, matched_map_id, property_id, is_unmatched')
```

(b) La condición de skip (L52) queda:

```typescript
    if (newAssigned === r.assigned_to && newUnmatched === r.is_unmatched && match.mapId === r.matched_map_id && match.propertyId === r.property_id) continue
```

(c) El `.update({...})` (L56-58) queda:

```typescript
      await supabase.from('portal_inquiries').update({
        assigned_to: newAssigned, matched_map_id: match.mapId, is_unmatched: newUnmatched, property_id: match.propertyId,
      }).eq('id', r.id)
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit (LOCAL, sin push)**

```bash
git add app/api/cron/portal-inquiries/route.ts scripts/portal-inquiries-rematch.ts
git commit -m "feat(consultas): cron y rematch persisten property_id en portal_inquiries

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: API — `/api/portal-inquiries` acepta `propertyId` + `from`/`to`

**Files:**
- Modify: `app/api/portal-inquiries/route.ts`

**Interfaces:**
- Consumes: columna `portal_inquiries.property_id` (Task 1).
- Produces: `GET /api/portal-inquiries?propertyId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD` (ambos filtros opcionales; `days` sigue funcionando como fallback). El response incluye `property_id` en cada fila. La Task 9 (ficha) consume `?propertyId=`.

- [ ] **Step 1: Reemplazar el handler GET completo**

El archivo entero queda así (cambios: `DATE_RE`, params `propertyId`/`from`/`to`, `property_id` en el select, filtro por rango que reemplaza a `days` cuando viene, filtro `.eq('property_id', ...)`):

```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'

// Cliente service-role sin tipar: las tablas portal_* no están en database.types
// todavía. Replicamos el filtro por rol acá (igual que /api/leads).
function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/portal-inquiries?portal=X&days=N&unmatched=1&limit=200&propertyId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD
 * Lista las consultas de portales (inbox + ficha de propiedad).
 * `from`/`to` (rango de fechas sobre created_at) reemplaza a `days` si viene válido.
 * Asesor ve solo lo asignado a él; operations ve todo.
 */
export async function GET(req: Request) {
  try {
    const user = await requireAuth()
    const role = user.profile.role
    if (!['admin', 'dueno', 'coordinador', 'asesor'].includes(role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const url = new URL(req.url)
    const portal = url.searchParams.get('portal')
    const days = parseInt(url.searchParams.get('days') ?? '30', 10)
    const unmatched = url.searchParams.get('unmatched') === '1'
    const propertyId = url.searchParams.get('propertyId')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '200', 10), 500)

    const supabase = getAdmin()
    let query = supabase
      .from('portal_inquiries')
      .select(
        'id, seq, portal, inquiry_type, received_at, lead_name, lead_email, lead_phone, lead_message, property_external_code, property_url, property_address, matched_map_id, property_id, assigned_to, is_unmatched, raw_subject, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(limit)

    // Rango explícito (dashboard/ficha) gana sobre el days relativo (inbox).
    // Filtra por created_at (ingesta ≈ recepción, minutos de diferencia); las
    // MÉTRICAS usan COALESCE(received_at, created_at) en las RPCs — tolerancia
    // documentada en el spec.
    if (from && to && DATE_RE.test(from) && DATE_RE.test(to)) {
      query = query.gte('created_at', `${from}T00:00:00Z`).lte('created_at', `${to}T23:59:59.999Z`)
    } else {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()
      query = query.gte('created_at', since)
    }

    if (portal) query = query.eq('portal', portal)
    if (unmatched) query = query.eq('is_unmatched', true)
    if (propertyId) query = query.eq('property_id', propertyId)
    if (role === 'asesor') query = query.eq('assigned_to', user.id)

    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Hidratar el nombre del asesor asignado.
    const assignedIds = Array.from(
      new Set((data ?? []).map((d: { assigned_to: string | null }) => d.assigned_to).filter(Boolean) as string[]),
    )
    let nameMap = new Map<string, string | null>()
    if (assignedIds.length > 0) {
      const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', assignedIds)
      nameMap = new Map((profs ?? []).map((p: { id: string; full_name: string | null }) => [p.id, p.full_name]))
    }

    const enriched = (data ?? []).map((d: { assigned_to: string | null }) => ({
      ...d,
      assigned_name: d.assigned_to ? nameMap.get(d.assigned_to) ?? null : null,
    }))

    return NextResponse.json({ data: enriched })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 3: Commit (LOCAL, sin push)**

```bash
git add app/api/portal-inquiries/route.ts
git commit -m "feat(consultas): /api/portal-inquiries filtra por propertyId y rango from/to

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Capa de datos `lib/metrics/property-inquiries.ts` + ruta API (TDD del mapper)

**Files:**
- Create: `lib/metrics/property-inquiries.ts`
- Create: `app/api/metrics/property-inquiries/route.ts`
- Test: `lib/metrics/property-inquiries.test.ts`

**Interfaces:**
- Consumes: RPCs de Task 2 vía `.rpc('get_property_inquiry_counts'|'get_inquiries_summary', { p_from, p_to })`; `RangeFilter` de `lib/metrics/types.ts` (`{ from: string; to: string }`); `requirePermission('metrics.view')` de `@/lib/auth/require-role` (hace `redirect()`, patrón de `/api/metrics/funnel`).
- Produces: `GET /api/metrics/property-inquiries?from&to` → JSON `{ properties: PropertyInquiryCountRow[], summary: InquiriesSummary, unidentified: UnidentifiedInquiry[] }`. Tipos exactos abajo. La Task 8 (panel) consume este shape.

- [ ] **Step 1: Escribir el test del mapper puro (RED)**

`lib/metrics/property-inquiries.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'

// `property-inquiries.ts` importa `server-only` (no resuelve bajo vitest);
// mismo patrón que lib/funnel/create-funnel-lead.test.ts.
vi.mock('server-only', () => ({}))

import { rowsToSummary } from './property-inquiries'

describe('rowsToSummary', () => {
  it('mapea filas de la RPC al objeto summary (acepta value numérico o string)', () => {
    const rows = [
      { metric: 'total', value: 12 },
      { metric: 'matched', value: '9' },
      { metric: 'unidentified', value: 3 },
      { metric: 'mercadolibre', value: 5 },
      { metric: 'argenprop', value: 4 },
      { metric: 'zonaprop', value: 3 },
    ]
    expect(rowsToSummary(rows)).toEqual({ total: 12, matched: 9, unidentified: 3, mercadolibre: 5, argenprop: 4, zonaprop: 3 })
  })

  it('tolera null y métricas faltantes (todo en 0)', () => {
    expect(rowsToSummary(null)).toEqual({ total: 0, matched: 0, unidentified: 0, mercadolibre: 0, argenprop: 0, zonaprop: 0 })
    expect(rowsToSummary([{ metric: 'total', value: 7 }])).toEqual({ total: 7, matched: 0, unidentified: 0, mercadolibre: 0, argenprop: 0, zonaprop: 0 })
  })
})
```

- [ ] **Step 2: Correr el test — debe FALLAR**

Run: `npx vitest run lib/metrics/property-inquiries.test.ts`
Expected: FAIL — "Cannot find module './property-inquiries'" (el archivo no existe aún).

- [ ] **Step 3: Implementar `lib/metrics/property-inquiries.ts` (GREEN)**

```typescript
import 'server-only'
import type { RangeFilter } from './types'

/**
 * Capa de datos del panel "Consultas por propiedad" (/metrics) — espejo del
 * patrón lib/metrics/funnel.ts: RPCs get_*(p_from, p_to) + mapper puro testeable.
 *
 * Cliente Supabase autenticado por cookies (RLS aplica al usuario de la sesión;
 * el gate de negocio es requirePermission('metrics.view') en la ruta). Los
 * imports de next/headers y del server-client van DIFERIDOS para que el módulo
 * sea importable bajo vitest mockeando solo `server-only`.
 */
async function getSupabase() {
  const { cookies } = await import('next/headers')
  const { createClient } = await import('@/lib/supabase/server')
  const cookieStore = await cookies()
  return createClient(cookieStore)
}

export interface PropertyInquiryCountRow {
  property_id: string
  address: string | null
  neighborhood: string | null
  assigned_to: string | null
  assigned_name: string | null
  total: number
  mercadolibre: number
  argenprop: number
  zonaprop: number
  last_inquiry_at: string | null
}

export interface InquiriesSummary {
  total: number
  matched: number
  unidentified: number
  mercadolibre: number
  argenprop: number
  zonaprop: number
}

export interface UnidentifiedInquiry {
  id: string
  seq: number
  portal: string
  received_at: string | null
  created_at: string
  lead_name: string | null
  property_external_code: string | null
  property_url: string | null
  property_address: string | null
  raw_subject: string | null
}

interface MetricRow { metric: string; value: number | string }

const SUMMARY_KEYS = ['total', 'matched', 'unidentified', 'mercadolibre', 'argenprop', 'zonaprop'] as const

/** Mapper puro (testeable sin DB): filas (metric, value) de la RPC → objeto summary. */
export function rowsToSummary(rows: MetricRow[] | null): InquiriesSummary {
  const map = Object.fromEntries((rows ?? []).map(r => [r.metric, Number(r.value)]))
  const out = { total: 0, matched: 0, unidentified: 0, mercadolibre: 0, argenprop: 0, zonaprop: 0 }
  for (const k of SUMMARY_KEYS) {
    if (Number.isFinite(map[k])) out[k] = map[k]
  }
  return out
}

/** Una fila por propiedad con >=1 consulta en el rango, con nombre del asesor hidratado. */
export async function getPropertyInquiryCounts(range: RangeFilter): Promise<PropertyInquiryCountRow[]> {
  const supabase = await getSupabase()
  const { data, error } = await (supabase as any).rpc('get_property_inquiry_counts', {
    p_from: range.from,
    p_to: range.to,
  })
  if (error) throw new Error(`get_property_inquiry_counts: ${error.message}`)

  const rows = (data ?? []) as Array<Omit<PropertyInquiryCountRow, 'assigned_name'>>

  // Hidratar el nombre del asesor (mismo patrón que /api/portal-inquiries).
  const advisorIds = Array.from(new Set(rows.map(r => r.assigned_to).filter(Boolean))) as string[]
  let nameMap = new Map<string, string | null>()
  if (advisorIds.length > 0) {
    const { data: profs } = await (supabase as any).from('profiles').select('id, full_name').in('id', advisorIds)
    nameMap = new Map(((profs ?? []) as Array<{ id: string; full_name: string | null }>).map(p => [p.id, p.full_name]))
  }

  return rows.map(r => ({
    ...r,
    total: Number(r.total),
    mercadolibre: Number(r.mercadolibre),
    argenprop: Number(r.argenprop),
    zonaprop: Number(r.zonaprop),
    assigned_name: r.assigned_to ? nameMap.get(r.assigned_to) ?? null : null,
  }))
}

/** Escalares del período para las tarjetas resumen. */
export async function getInquiriesSummary(range: RangeFilter): Promise<InquiriesSummary> {
  const supabase = await getSupabase()
  const { data, error } = await (supabase as any).rpc('get_inquiries_summary', {
    p_from: range.from,
    p_to: range.to,
  })
  if (error) throw new Error(`get_inquiries_summary: ${error.message}`)
  return rowsToSummary(data as MetricRow[] | null)
}

/**
 * Consultas SIN propiedad identificada en el rango (grupo visible del panel —
 * decisión del spec: nada se descarta en silencio; sirven para cazar avisos sin
 * mapear). Filtra por created_at (ingesta ≈ recepción); el count del summary usa
 * COALESCE(received_at, created_at) — tolerancia documentada en el spec.
 */
export async function getUnidentifiedInquiries(range: RangeFilter, limit = 50): Promise<UnidentifiedInquiry[]> {
  const supabase = await getSupabase()
  const { data, error } = await (supabase as any)
    .from('portal_inquiries')
    .select('id, seq, portal, received_at, created_at, lead_name, property_external_code, property_url, property_address, raw_subject')
    .is('property_id', null)
    .gte('created_at', `${range.from}T00:00:00Z`)
    .lte('created_at', `${range.to}T23:59:59.999Z`)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`unidentified inquiries: ${error.message}`)
  return (data ?? []) as UnidentifiedInquiry[]
}
```

- [ ] **Step 4: Correr el test — debe PASAR**

Run: `npx vitest run lib/metrics/property-inquiries.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Crear la ruta API**

`app/api/metrics/property-inquiries/route.ts` (calco del patrón `/api/metrics/funnel`):

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/auth/require-role'
import {
  getPropertyInquiryCounts,
  getInquiriesSummary,
  getUnidentifiedInquiries,
} from '@/lib/metrics/property-inquiries'

export const dynamic = 'force-dynamic'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * GET /api/metrics/property-inquiries?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Panel "Consultas por propiedad" de /metrics: ranking por propiedad con
 * desglose por portal + summary + grupo "Sin identificar".
 */
export async function GET(req: NextRequest) {
  await requirePermission('metrics.view')
  const sp = req.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')

  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ error: 'from/to required as YYYY-MM-DD' }, { status: 400 })
  }
  if (from > to) {
    return NextResponse.json({ error: 'from must be <= to' }, { status: 400 })
  }

  try {
    const range = { from, to }
    const [properties, summary, unidentified] = await Promise.all([
      getPropertyInquiryCounts(range),
      getInquiriesSummary(range),
      getUnidentifiedInquiries(range),
    ])
    return NextResponse.json({ properties, summary, unidentified })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal error'
    console.error('[api/metrics/property-inquiries]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

- [ ] **Step 6: Typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run lib/metrics/property-inquiries.test.ts`
Expected: tsc exit 0; 2 tests PASS.

- [ ] **Step 7: Commit (LOCAL, sin push)**

```bash
git add lib/metrics/property-inquiries.ts lib/metrics/property-inquiries.test.ts app/api/metrics/property-inquiries/route.ts
git commit -m "feat(consultas): capa de datos + API /api/metrics/property-inquiries

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Panel "Consultas por propiedad" en `/metrics`

**Files:**
- Create: `components/metrics/PropertyInquiriesPanel.tsx`
- Modify: `app/(dashboard)/metrics/page.tsx` (1 import + 1 línea de montaje)

**Interfaces:**
- Consumes: `GET /api/metrics/property-inquiries?from&to` (shape de Task 7); `DateRange` de `@/components/metrics/DateRangePicker` (`{ from: string; to: string }`); `DataTable`/`Column<T>` de `@/components/ui/DataTable`.
- Produces: `<PropertyInquiriesPanel range={range} />` — componente autocontenido (fetchea solo, re-fetchea cuando cambia el rango del picker de la página).

- [ ] **Step 1: Crear el componente**

`components/metrics/PropertyInquiriesPanel.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { DataTable, type Column } from '@/components/ui/DataTable'
import type { DateRange } from './DateRangePicker'

/** Shapes espejo del response de /api/metrics/property-inquiries (Task 7). */
interface CountRow {
  property_id: string
  address: string | null
  neighborhood: string | null
  assigned_to: string | null
  assigned_name: string | null
  total: number
  mercadolibre: number
  argenprop: number
  zonaprop: number
  last_inquiry_at: string | null
}

interface Summary {
  total: number
  matched: number
  unidentified: number
  mercadolibre: number
  argenprop: number
  zonaprop: number
}

interface UnidentifiedRow {
  id: string
  seq: number
  portal: string
  received_at: string | null
  created_at: string
  lead_name: string | null
  property_external_code: string | null
  property_url: string | null
  property_address: string | null
  raw_subject: string | null
}

interface PanelData {
  properties: CountRow[]
  summary: Summary
  unidentified: UnidentifiedRow[]
}

const PORTAL_LABELS: Record<string, string> = {
  mercadolibre: 'MercadoLibre',
  zonaprop: 'ZonaProp',
  argenprop: 'Argenprop',
}

function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('es-AR') : '—'
}

const COLUMNS: Column<CountRow>[] = [
  {
    key: 'address',
    label: 'Propiedad',
    sortable: true,
    render: r => (
      <Link href={`/properties/${r.property_id}`} className="underline hover:text-[color:var(--brand)]">
        {r.address ?? '(sin dirección)'}
      </Link>
    ),
  },
  { key: 'neighborhood', label: 'Barrio', render: r => r.neighborhood ?? '—' },
  { key: 'assigned_name', label: 'Asesor', render: r => r.assigned_name ?? '—' },
  {
    key: 'total', label: 'Total', sortable: true, className: 'text-right',
    render: r => <span className="font-semibold tabular-nums">{r.total}</span>,
  },
  { key: 'mercadolibre', label: 'ML', sortable: true, className: 'text-right', render: r => <span className="tabular-nums">{r.mercadolibre}</span> },
  { key: 'zonaprop', label: 'ZP', sortable: true, className: 'text-right', render: r => <span className="tabular-nums">{r.zonaprop}</span> },
  { key: 'argenprop', label: 'AP', sortable: true, className: 'text-right', render: r => <span className="tabular-nums">{r.argenprop}</span> },
  { key: 'last_inquiry_at', label: 'Última', sortable: true, render: r => fmtDate(r.last_inquiry_at) },
]

function SummaryChip({ label, value, highlight = false }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight && value > 0 ? 'border-amber-400/60 bg-amber-50 dark:bg-amber-950/20' : ''}`}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  )
}

export function PropertyInquiriesPanel({ range }: { range: DateRange }) {
  const [data, setData] = useState<PanelData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showUnidentified, setShowUnidentified] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch(`/api/metrics/property-inquiries?from=${range.from}&to=${range.to}`)
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Error cargando consultas') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [range.from, range.to])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Consultas por propiedad</CardTitle>
        <p className="text-xs text-muted-foreground">
          Consultas de portales (MercadoLibre / ZonaProp / Argenprop) recibidas en el rango, agrupadas por propiedad captada.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>
        )}
        {loading && !data && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        {data && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              <SummaryChip label="Total" value={data.summary.total} />
              <SummaryChip label="Identificadas" value={data.summary.matched} />
              <SummaryChip label="Sin identificar" value={data.summary.unidentified} highlight />
              <SummaryChip label="MercadoLibre" value={data.summary.mercadolibre} />
              <SummaryChip label="ZonaProp" value={data.summary.zonaprop} />
              <SummaryChip label="Argenprop" value={data.summary.argenprop} />
            </div>

            <DataTable
              data={data.properties}
              columns={COLUMNS}
              getRowKey={r => r.property_id}
              emptyMessage="Sin consultas de portales en este período."
            />

            {data.summary.unidentified > 0 && (
              <div className="rounded-lg border border-amber-400/50">
                <button
                  type="button"
                  onClick={() => setShowUnidentified(v => !v)}
                  className="flex w-full items-center gap-2 p-3 text-sm font-medium text-left"
                >
                  {showUnidentified ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Sin propiedad identificada ({data.summary.unidentified})
                  <span className="ml-auto text-xs font-normal text-muted-foreground">
                    consultas que no matchearon con ninguna propiedad — revisar el mapeo
                  </span>
                </button>
                {showUnidentified && (
                  <ul className="divide-y border-t">
                    {data.unidentified.map(u => (
                      <li key={u.id} className="flex flex-wrap items-center gap-2 p-3 text-sm">
                        <span className="font-mono text-xs text-muted-foreground">#{u.seq}</span>
                        <Badge variant="outline" className="text-xs">{PORTAL_LABELS[u.portal] ?? u.portal}</Badge>
                        <span>{u.lead_name ?? '(sin nombre)'}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-md">
                          {u.property_address ?? u.property_url ?? (u.property_external_code ? `CÓD ${u.property_external_code}` : u.raw_subject) ?? ''}
                        </span>
                        <span className="ml-auto text-xs text-muted-foreground whitespace-nowrap">{fmtDate(u.received_at ?? u.created_at)}</span>
                        <Link href="/inbox" className="text-xs underline text-[color:var(--brand)]">Ver en inbox</Link>
                      </li>
                    ))}
                    {data.unidentified.length < data.summary.unidentified && (
                      <li className="p-3 text-xs text-muted-foreground">
                        Mostrando las {data.unidentified.length} más recientes de {data.summary.unidentified}.
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Montar en `/metrics`**

En `app/(dashboard)/metrics/page.tsx`, dos ediciones:

(a) Import (junto a los otros imports de `@/components/metrics/`):

```tsx
import { PropertyInquiriesPanel } from '@/components/metrics/PropertyInquiriesPanel'
```

(b) Montaje: entre la Card "Rendimiento publicitario (Meta Ads)" y `<SendTestReport />`:

```tsx
      <PropertyInquiriesPanel range={range} />

      <SendTestReport />
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit (LOCAL, sin push)**

```bash
git add components/metrics/PropertyInquiriesPanel.tsx "app/(dashboard)/metrics/page.tsx"
git commit -m "feat(consultas): panel Consultas por propiedad en /metrics

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Pestaña "Consultas" en la ficha de propiedad

**Files:**
- Create: `components/properties/PropertyInquiriesCard.tsx`
- Modify: `components/properties/MarketingTabs.tsx`

**Interfaces:**
- Consumes: `GET /api/portal-inquiries?propertyId=&days=365&limit=100` (Task 6; response `{ data: [...] }` con `assigned_name` hidratado).
- Produces: `<PropertyInquiriesCard propertyId={id} />`; nueva tab `consultas` en `MarketingTabs`.

- [ ] **Step 1: Crear la card**

`components/properties/PropertyInquiriesCard.tsx` (estética calcada de `PropertyLeadsCard`; helpers de presentación calcados de `PortalInquiriesClient`):

```tsx
'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Mail, Phone, MessageSquare } from 'lucide-react'

interface InquiryRow {
  id: string
  seq: number
  portal: string
  inquiry_type: string | null
  received_at: string | null
  created_at: string
  lead_name: string | null
  lead_email: string | null
  lead_phone: string | null
  lead_message: string | null
}

const PORTAL_LABELS: Record<string, string> = {
  mercadolibre: 'MercadoLibre',
  zonaprop: 'ZonaProp',
  argenprop: 'Argenprop',
}

const TYPE_LABELS: Record<string, string> = {
  mail: 'Mail',
  whatsapp: 'WhatsApp',
  phone: 'Teléfono',
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'recién'
  if (m < 60) return `hace ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.floor(h / 24)
  if (d < 30) return `hace ${d} día${d > 1 ? 's' : ''}`
  return new Date(iso).toLocaleDateString('es-AR')
}

function normalizePhone(raw: string | null): string | null {
  if (!raw) return null
  let d = raw.replace(/[^\d+]/g, '').replace(/^\+/, '')
  if (!d.startsWith('54') && d.length >= 10 && d.length <= 11) d = `54${d}`
  return d.length >= 10 ? d : null
}

/**
 * Pestaña "Consultas" de Marketing: las consultas de portales de ESTA propiedad
 * (vía portal_inquiries.property_id). Distinto de PropertyLeadsCard, que muestra
 * property_leads (landing/Meta) — son dos sistemas separados por diseño.
 */
export function PropertyInquiriesCard({ propertyId }: { propertyId: string }) {
  const [rows, setRows] = useState<InquiryRow[] | null>(null)

  useEffect(() => {
    fetch(`/api/portal-inquiries?propertyId=${propertyId}&days=365&limit=100`)
      .then(r => (r.ok ? r.json() : { data: [] }))
      .then(({ data }) => setRows(data ?? []))
      .catch(() => setRows([]))
  }, [propertyId])

  if (!rows) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="display text-base">
            Consultas de portales
            {rows.length > 0 && (
              <span className="ml-2 text-sm text-muted-foreground tabular-nums">
                ({rows.length}{rows.length >= 100 ? '+' : ''})
              </span>
            )}
          </CardTitle>
          {rows.length > 0 && (
            <Link href="/inbox" className="text-xs text-[color:var(--brand)] underline">
              Ver inbox →
            </Link>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Últimos 12 meses.</p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Aún no llegaron consultas de portales para esta propiedad.
          </p>
        ) : (
          <ul className="divide-y">
            {rows.map(r => {
              const phone = normalizePhone(r.lead_phone)
              return (
                <li key={r.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">#{r.seq}</span>
                        <span className="font-medium text-sm">{r.lead_name || '(sin nombre)'}</span>
                        <Badge variant="outline" className="text-[10px]">{PORTAL_LABELS[r.portal] ?? r.portal}</Badge>
                        {r.inquiry_type && (
                          <Badge variant="outline" className="text-[10px]">{TYPE_LABELS[r.inquiry_type] ?? r.inquiry_type}</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-3 mt-1 text-xs text-muted-foreground">
                        {r.lead_email && (
                          <a href={`mailto:${r.lead_email}`} className="flex items-center gap-1 hover:text-foreground">
                            <Mail className="h-3 w-3" />
                            {r.lead_email}
                          </a>
                        )}
                        {r.lead_phone && (
                          <a href={`tel:${r.lead_phone}`} className="flex items-center gap-1 hover:text-foreground">
                            <Phone className="h-3 w-3" />
                            {r.lead_phone}
                          </a>
                        )}
                        {phone && (
                          <a
                            href={`https://wa.me/${phone}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 hover:text-emerald-700"
                          >
                            <MessageSquare className="h-3 w-3" />
                            WhatsApp
                          </a>
                        )}
                      </div>
                      {r.lead_message && (
                        <p className="text-xs text-foreground/80 mt-1.5 line-clamp-2">{r.lead_message}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {relativeTime(r.received_at ?? r.created_at)}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: Agregar la tab en `MarketingTabs.tsx`**

Tres ediciones:

(a) Imports:

```tsx
import { Megaphone, Building2, BarChart3, Mail, MessageSquare } from 'lucide-react'
```

y debajo de los imports de componentes:

```tsx
import { PropertyInquiriesCard } from './PropertyInquiriesCard'
```

(b) El array `TABS` queda:

```tsx
const TABS = [
  { key: 'overview', label: 'Resumen', icon: Megaphone },
  { key: 'portales', label: 'Portales', icon: Building2 },
  { key: 'meta', label: 'Meta Ads', icon: BarChart3 },
  { key: 'leads', label: 'Leads', icon: Mail },
  { key: 'consultas', label: 'Consultas', icon: MessageSquare },
] as const
```

(c) El render de la tab, después de la línea `{active === 'leads' && <PropertyLeadsCard propertyId={propertyId} />}`:

```tsx
      {active === 'consultas' && <PropertyInquiriesCard propertyId={propertyId} />}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 4: Commit (LOCAL, sin push)**

```bash
git add components/properties/PropertyInquiriesCard.tsx components/properties/MarketingTabs.tsx
git commit -m "feat(consultas): pestaña Consultas en Marketing de la ficha de propiedad

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Gate de migraciones + push + verificación end-to-end

**Files:**
- Modify: `CLAUDE.md` (sección corta de documentación del sistema)

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: feature deployado y verificado.

- [ ] **Step 1: Suite completa + typecheck**

Run: `cd "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria" && npx tsc --noEmit && npx vitest run`
Expected: tsc exit 0; TODOS los tests del repo PASS (si vitest fallara por el path con acento: `npx vitest run --pool=threads`).

- [ ] **Step 2: ⛔ CHECKPOINT — el usuario corre las migraciones (BLOQUEANTE)**

Pedir al usuario que corra en el Supabase Dashboard → SQL Editor, **en este orden**:
1. `supabase/migrations/20260711000001_portal_inquiries_property_fk.sql`
2. `supabase/migrations/20260711000002_property_inquiries_rpcs.sql`

Y que verifique con:

```sql
SELECT COUNT(*) AS total, COUNT(property_id) AS con_fk FROM public.portal_property_map;
SELECT COUNT(*) AS total, COUNT(property_id) AS con_fk FROM public.portal_inquiries;
SELECT * FROM get_inquiries_summary('2026-06-01', '2026-07-31');
SELECT * FROM get_property_inquiry_counts('2026-06-01', '2026-07-31') LIMIT 10;
```

Esperado: `con_fk > 0` en ambas tablas (mapa: las filas con `notes='property:...'`; inquiries: las matcheadas); el summary devuelve 6 filas con `total = matched + unidentified`. **NO pushear el código hasta que el usuario confirme.**

- [ ] **Step 3: Documentar en CLAUDE.md**

Agregar al final de la sección "Publicación en portales" (o junto al bridge de consultas) este bloque:

```markdown
### Consultas por propiedad: FK real, no la convención notes

- Desde la migración `20260711000001`, `portal_inquiries.property_id` y
  `portal_property_map.property_id` son FKs reales a `properties(id)` (ON DELETE
  SET NULL). La convención `notes='property:<id>'` SIGUE VIVA solo como clave de
  dedup de `syncPortalPropertyMap` — NO usarla para joins nuevos; usar la FK.
- Métricas: RPCs `get_property_inquiry_counts` / `get_inquiries_summary`
  (`20260711000002`), base temporal `COALESCE(received_at, created_at)::date`.
  Panel en `/metrics` + pestaña Consultas en la ficha. Conteo query-time; si el
  volumen algún día lo exige, agregar rollup DETRÁS de la misma RPC.
- Gate de deploy: esas 2 migraciones deben correrse ANTES de deployar código que
  escribe `property_id` (el INSERT del cron falla sin la columna → se rompe la
  ingesta de consultas).
- Tras el deploy, re-correr el UPDATE #4 de la migración `20260711000001`
  (idempotente) para cubrir consultas ingresadas entre migración y deploy.
```

```bash
git add CLAUDE.md
git commit -m "docs: sistema de consultas por propiedad (FK + RPCs + gate de deploy)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

- [ ] **Step 4: Push (dispara el deploy de Netlify)**

```bash
git push origin main
```

Esperar el deploy (~2-3 min).

- [ ] **Step 5: Cerrar el gap migración→deploy**

Pedir al usuario que re-corra en el SQL Editor SOLO el UPDATE #4 de la migración `20260711000001` (idempotente — cubre consultas ingresadas entre la migración y el deploy):

```sql
UPDATE public.portal_inquiries pi
   SET property_id = m.property_id
  FROM public.portal_property_map m
 WHERE pi.matched_map_id = m.id
   AND m.property_id IS NOT NULL
   AND pi.property_id IS NULL;
```

- [ ] **Step 6: Verificación end-to-end en producción**

1. **API**: con sesión admin/dueno, abrir `/api/metrics/property-inquiries?from=2026-06-01&to=2026-07-31` → JSON con `properties`, `summary`, `unidentified`.
2. **Panel**: abrir `/metrics` → card "Consultas por propiedad" con chips + tabla + (si hay) bloque ámbar "Sin propiedad identificada". Cambiar el preset de fecha → la tabla se refresca.
3. **Ficha**: abrir una propiedad publicada con consultas (ej. la de ALMAFUERTE 2532) → Marketing → pestaña "Consultas" → lista con lead/portal/fecha.
4. **Cron en vivo**: tras la próxima consulta real, verificar en SQL que nace con FK:
   ```sql
   SELECT seq, portal, property_id, is_unmatched, created_at
     FROM portal_inquiries ORDER BY created_at DESC LIMIT 5;
   ```
5. **Cross-check de conteos** (lección "métricas infladas" del proyecto):
   ```sql
   -- El total del summary DEBE igualar el conteo directo:
   SELECT COUNT(*) FROM portal_inquiries
    WHERE COALESCE(received_at, created_at)::date BETWEEN '2026-06-01' AND '2026-07-31';
   -- Y la suma de get_property_inquiry_counts.total DEBE igualar 'matched'.
   ```

---

## Self-review (hecho al escribir el plan)

- **Cobertura del spec:** Capa 1 → Task 1; Capa 2 → Tasks 3-5; Capa 3 → Task 2; Capa 4 → Tasks 6-7; Capa 5 → Tasks 8-9; Capa 6 (permisos) → Tasks 6-7 (requireAuth/requirePermission); Capa 7 (testing) → Tasks 3, 7, 10; Gate de deploy → PUSH GATE + Task 10. Fuera de alcance respetado (sin columna en listado, sin rollup).
- **Desvío consciente del spec:** la ficha usa `days=365` (patrón de `PropertyLeadsCard`) en vez de `from/to` — la API soporta ambos; el filtrado por fecha fino vive en el panel de /metrics, que es donde se pidió.
- **Consistencia de tipos:** `MatchResult.propertyId` (Task 3) = lo que consume Task 5; shape del response de Task 7 = interfaces del panel en Task 8; `Column<T>`/`DataTable` según firma real extraída; `RangeFilter = { from, to }` verificado en lib/metrics/types.
