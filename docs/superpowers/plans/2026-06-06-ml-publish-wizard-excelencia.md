# Wizard de publicación en MercadoLibre "de excelencia" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rehacer el flujo de publicación en MercadoLibre en un wizard de 6 pasos (imágenes → video/tour → campos ML dinámicos → descripción IA → resumen → confirmar) que maximice el score de calidad de ML, más la migración del worker roto a pg_cron.

**Architecture:** UI descompuesta en shell + steps (framer-motion). Atributos de ML traídos en vivo de `/categories/{id}/attributes` (caché 24h en `ml_category_attributes`). `mapping.ts` pasa a aceptar overrides/medios/listing_type y filtra contra el schema. Geocoding server-side (Google) + mapa Leaflet. Worker migrado a `lib/portals/worker.ts` + ruta `/api/cron/publish-listings` (pg_cron).

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase (service role), MercadoLibre API, vitest, framer-motion, leaflet/react-leaflet, zod.

**Convenciones del repo (obligatorias):**
- Commits con autor `Sujupar <redstyle50@gmail.com>` (sino falla el deploy de Netlify). Cada commit: `git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "..."` y firmar con `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- Tests: `npm test -- <path>` (vitest). Typecheck: `npx tsc --noEmit`. Lint: `npm run lint`. Build: `npm run build`.
- Migraciones SQL: el usuario las corre a mano en Supabase Dashboard. El archivo va en `supabase/migrations/`.
- Netlify scheduled functions NO disparan en este sitio → usar pg_cron (ver CLAUDE.md).

---

## File Structure

**Crear:**
- `lib/portals/mercadolibre/media.ts` — `extractYouTubeId`.
- `lib/portals/mercadolibre/media.test.ts`
- `lib/portals/mercadolibre/category-attributes.ts` — fetch+caché+clasificación de atributos.
- `lib/portals/mercadolibre/category-attributes.test.ts`
- `lib/portals/worker.ts` — orquestación del worker (extraída del .mts), importable por la ruta.
- `app/api/properties/[id]/ml-attributes/route.ts` — schema dinámico + prefill.
- `app/api/geocode/route.ts` — geocoding server-side.
- `app/api/cron/publish-listings/route.ts` — trigger del worker vía pg_cron.
- `components/properties/wizards/ml/MercadoLibreWizard.tsx` — shell nuevo.
- `components/properties/wizards/ml/useMlPublishDraft.ts` — hook de estado.
- `components/properties/wizards/ml/GeoPinMap.tsx` — mapa client-only.
- `components/properties/wizards/ml/steps/StepImages.tsx`
- `components/properties/wizards/ml/steps/StepMedia.tsx`
- `components/properties/wizards/ml/steps/StepFields.tsx`
- `components/properties/wizards/ml/steps/StepDescription.tsx`
- `components/properties/wizards/ml/steps/StepReview.tsx`
- `components/properties/wizards/ml/steps/StepConfirm.tsx`
- `components/properties/wizards/ml/ManageListingPanel.tsx`
- `components/properties/wizards/ml/types.ts` — tipos compartidos del wizard.
- `supabase/migrations/20260606000001_ml_category_attributes_cache.sql`
- `scripts/qa-publish-ml-test.ts` — script de QA (publicar→verificar→cerrar).

**Modificar:**
- `lib/portals/mercadolibre/mapping.ts` — opts (overrides/media/listingType), filtro por schema, video_id, listing types.
- `lib/portals/mercadolibre/mapping.test.ts` — cubrir nuevas opts.
- `app/api/properties/[id]/ml-preview/route.ts` — PATCH extendido.
- `app/api/properties/[id]/ml-publish/route.ts` — POST publica con draft (opts).
- `components/properties/wizards/MercadoLibreWizard.tsx` — reemplazado por re-export del nuevo shell (o eliminado y actualizado el import).
- `app/(dashboard)/properties/[id]/marketing/mercadolibre/page.tsx` — import del nuevo wizard.
- `netlify/functions/publish-listings.mts` — quitar `export const config.schedule` (evitar doble envío) y delegar a `lib/portals/worker.ts`.
- `package.json` — deps framer-motion, leaflet, react-leaflet, @types/leaflet.
- `.env.example` — documentar `GOOGLE_GEOCODING_API_KEY` (geocode) ya presente; `CRON_SECRET` (ya presente).

---

## FASE A — Foundations (deps, DB, helpers de lógica)

### Task 1: Instalar dependencias

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Instalar**

Run:
```bash
npm install framer-motion leaflet react-leaflet
npm install -D @types/leaflet
```

- [ ] **Step 2: Verificar que el build sigue OK**

Run: `npx tsc --noEmit`
Expected: sin errores nuevos.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "chore(deps): framer-motion + leaflet para el wizard de ML

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Migración — tabla de caché `ml_category_attributes`

**Files:**
- Create: `supabase/migrations/20260606000001_ml_category_attributes_cache.sql`

- [ ] **Step 1: Escribir la migración**

```sql
-- Caché de atributos de categoría de MercadoLibre.
-- Se llena on-demand desde GET /categories/{id}/attributes con TTL de 24h
-- (la lógica de TTL vive en lib/portals/mercadolibre/category-attributes.ts).
CREATE TABLE IF NOT EXISTS ml_category_attributes (
  category_id text PRIMARY KEY,
  attributes  jsonb NOT NULL,
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ml_category_attributes ENABLE ROW LEVEL SECURITY;

-- Lectura para usuarios autenticados (el wizard la consulta indirectamente vía
-- service_role, pero dejamos SELECT por si se inspecciona desde el dashboard).
DROP POLICY IF EXISTS ml_cat_attrs_select ON ml_category_attributes;
CREATE POLICY ml_cat_attrs_select ON ml_category_attributes
  FOR SELECT TO authenticated USING (true);

-- Escritura solo service_role (la hace el server con SUPABASE_SERVICE_ROLE_KEY,
-- que bypassa RLS; no se otorga a authenticated).
```

- [ ] **Step 2: Agregar el tipo a `types/database.types.ts`**

Buscar el bloque de `Tables` y agregar la entrada (mismo estilo que las otras tablas):

```ts
ml_category_attributes: {
  Row: { category_id: string; attributes: Json; fetched_at: string }
  Insert: { category_id: string; attributes: Json; fetched_at?: string }
  Update: { category_id?: string; attributes?: Json; fetched_at?: string }
  Relationships: []
}
```

- [ ] **Step 3: Verificar typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit (el usuario corre el SQL en Supabase)**

```bash
git add supabase/migrations/20260606000001_ml_category_attributes_cache.sql types/database.types.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(db): tabla de caché ml_category_attributes

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

Nota: avisar al usuario que pegue la migración en Supabase SQL Editor antes del QA.

---

### Task 3: Helper `extractYouTubeId` (TDD)

**Files:**
- Create: `lib/portals/mercadolibre/media.ts`
- Test: `lib/portals/mercadolibre/media.test.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, it, expect } from 'vitest'
import { extractYouTubeId } from './media'

describe('extractYouTubeId', () => {
  it('extrae de youtu.be', () => {
    expect(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
  it('extrae de watch?v= con params extra', () => {
    expect(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s')).toBe('dQw4w9WgXcQ')
  })
  it('extrae de /embed/', () => {
    expect(extractYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
  it('extrae de /shorts/', () => {
    expect(extractYouTubeId('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })
  it('devuelve null para Matterport', () => {
    expect(extractYouTubeId('https://my.matterport.com/show/?m=abc123')).toBeNull()
  })
  it('devuelve null para vacío/null', () => {
    expect(extractYouTubeId(null)).toBeNull()
    expect(extractYouTubeId('')).toBeNull()
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- lib/portals/mercadolibre/media.test.ts`
Expected: FAIL ("extractYouTubeId is not a function" / módulo no existe).

- [ ] **Step 3: Implementar**

```ts
// lib/portals/mercadolibre/media.ts
const YT_PATTERNS: RegExp[] = [
  /youtu\.be\/([A-Za-z0-9_-]{11})/,
  /youtube\.com\/watch\?[^#]*\bv=([A-Za-z0-9_-]{11})/,
  /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
]

/** Extrae el ID de un video de YouTube de cualquier formato de URL. null si no es YouTube. */
export function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  for (const re of YT_PATTERNS) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- lib/portals/mercadolibre/media.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/portals/mercadolibre/media.ts lib/portals/mercadolibre/media.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(ml): extractYouTubeId para mapear video_url -> video_id

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Atributos de categoría — fetch + caché + clasificación (TDD)

**Files:**
- Create: `lib/portals/mercadolibre/category-attributes.ts`
- Test: `lib/portals/mercadolibre/category-attributes.test.ts`

- [ ] **Step 1: Escribir el test que falla (sobre la función pura `classifyAttributes`)**

```ts
import { describe, it, expect } from 'vitest'
import { classifyAttributes, type MlRawAttribute } from './category-attributes'

const RAW: MlRawAttribute[] = [
  { id: 'ROOMS', name: 'Ambientes', value_type: 'number', tags: { required: true } },
  { id: 'ORIENTATION', name: 'Orientación', value_type: 'list',
    values: [{ id: '1', name: 'Norte' }, { id: '2', name: 'Sur' }] },
  { id: 'COVERED_AREA', name: 'Sup. cubierta', value_type: 'number_unit',
    allowed_units: [{ id: 'm2', name: 'm²' }] },
  { id: 'INTERNAL_ID', name: 'ID interno', value_type: 'string', tags: { hidden: true } },
  { id: 'CALC', name: 'Calculado', value_type: 'string', tags: { read_only: true } },
  { id: 'COLOR', name: 'Color', value_type: 'string', tags: { variation_attribute: true } },
]

describe('classifyAttributes', () => {
  it('separa required de recommended', () => {
    const { required, recommended } = classifyAttributes(RAW)
    expect(required.map(a => a.id)).toEqual(['ROOMS'])
    expect(recommended.map(a => a.id)).toEqual(['ORIENTATION', 'COVERED_AREA'])
  })
  it('excluye hidden / read_only / variation_attribute', () => {
    const { required, recommended } = classifyAttributes(RAW)
    const all = [...required, ...recommended].map(a => a.id)
    expect(all).not.toContain('INTERNAL_ID')
    expect(all).not.toContain('CALC')
    expect(all).not.toContain('COLOR')
  })
  it('normaliza valueType y allowedValues/allowedUnits', () => {
    const { recommended } = classifyAttributes(RAW)
    const orient = recommended.find(a => a.id === 'ORIENTATION')!
    expect(orient.valueType).toBe('list')
    expect(orient.allowedValues).toEqual([{ id: '1', name: 'Norte' }, { id: '2', name: 'Sur' }])
    const area = recommended.find(a => a.id === 'COVERED_AREA')!
    expect(area.valueType).toBe('number_unit')
    expect(area.allowedUnits).toEqual(['m²'])
  })
})
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `npm test -- lib/portals/mercadolibre/category-attributes.test.ts`
Expected: FAIL (módulo no existe).

- [ ] **Step 3: Implementar**

```ts
// lib/portals/mercadolibre/category-attributes.ts
import { createClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database.types'
import { mlFetch } from './client'

export type MlValueType = 'string' | 'number' | 'number_unit' | 'boolean' | 'list'

export interface MlRawAttribute {
  id: string
  name: string
  value_type: string
  tags?: Record<string, boolean>
  values?: { id: string; name: string }[]
  allowed_units?: { id: string; name: string }[]
  hint?: string
}

export interface CategoryAttribute {
  id: string
  name: string
  valueType: MlValueType
  required: boolean
  allowedValues?: { id: string; name: string }[]
  allowedUnits?: string[]
  hint?: string
}

export interface CategoryAttributesResult {
  required: CategoryAttribute[]
  recommended: CategoryAttribute[]
}

const TTL_MS = 24 * 60 * 60 * 1000

function isUsable(a: MlRawAttribute): boolean {
  const t = a.tags ?? {}
  return !t.hidden && !t.read_only && !t.variation_attribute
}

function normalize(a: MlRawAttribute): CategoryAttribute {
  const valid: MlValueType[] = ['string', 'number', 'number_unit', 'boolean', 'list']
  const valueType = (valid.includes(a.value_type as MlValueType) ? a.value_type : 'string') as MlValueType
  return {
    id: a.id,
    name: a.name,
    valueType,
    required: Boolean(a.tags?.required),
    allowedValues: a.values?.map(v => ({ id: v.id, name: v.name })),
    allowedUnits: a.allowed_units?.map(u => u.name),
    hint: a.hint,
  }
}

/** Pura: clasifica una lista cruda de atributos de ML en required/recommended. */
export function classifyAttributes(raw: MlRawAttribute[]): CategoryAttributesResult {
  const usable = raw.filter(isUsable).map(normalize)
  return {
    required: usable.filter(a => a.required),
    recommended: usable.filter(a => !a.required),
  }
}

function getSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Trae los atributos crudos de la categoría con caché de 24h en DB. */
export async function getRawAttributes(categoryId: string): Promise<MlRawAttribute[]> {
  const supabase = getSupabase()
  const { data: cached } = await supabase
    .from('ml_category_attributes')
    .select('attributes, fetched_at')
    .eq('category_id', categoryId)
    .maybeSingle()

  if (
    cached?.attributes &&
    cached.fetched_at &&
    Date.now() - new Date(cached.fetched_at).getTime() < TTL_MS
  ) {
    return cached.attributes as unknown as MlRawAttribute[]
  }

  const fresh = await mlFetch<MlRawAttribute[]>(`/categories/${categoryId}/attributes`)
  await supabase.from('ml_category_attributes').upsert(
    {
      category_id: categoryId,
      attributes: fresh as unknown as Json,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'category_id' },
  )
  return fresh
}

/** Trae y clasifica los atributos de la categoría (con caché). */
export async function fetchCategoryAttributes(categoryId: string): Promise<CategoryAttributesResult> {
  return classifyAttributes(await getRawAttributes(categoryId))
}
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `npm test -- lib/portals/mercadolibre/category-attributes.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/portals/mercadolibre/category-attributes.ts lib/portals/mercadolibre/category-attributes.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(ml): fetch dinámico + caché 24h de atributos de categoría

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `mapping.ts` — opts (overrides/media/listingType) + filtro por schema (TDD)

**Files:**
- Modify: `lib/portals/mercadolibre/mapping.ts`
- Test: `lib/portals/mercadolibre/mapping.test.ts`

- [ ] **Step 1: Escribir tests nuevos (agregar al archivo existente)**

```ts
// agregar estos tests a mapping.test.ts (importar lo que falte arriba)
import { propertyToMlPayload, resolveCategory, ML_LISTING_TYPES } from './mapping'

const baseProperty = {
  id: 'p1', address: 'Calle 1', neighborhood: 'Palermo', city: 'CABA',
  property_type: 'departamento', operation_type: 'venta',
  rooms: 3, bedrooms: 2, bathrooms: 1, garages: null,
  covered_area: 68, total_area: 70, floor: 4, age: 8, expensas: 95000,
  asking_price: 200000, currency: 'USD', photos: ['https://x/a.jpg'],
  description: 'x'.repeat(120), latitude: -34.5, longitude: -58.4,
  video_url: 'https://youtu.be/dQw4w9WgXcQ', tour_3d_url: null,
  amenities: [], title: 'Depto lindo', postal_code: null,
} as unknown as import('../types').Property

describe('propertyToMlPayload con opts', () => {
  it('default listing_type_id = gold_premium', () => {
    const p = propertyToMlPayload(baseProperty)
    expect(p.listing_type_id).toBe('gold_premium')
  })
  it('aplica attributeOverrides (value_id para list)', () => {
    const p = propertyToMlPayload(baseProperty, {
      attributeOverrides: { ORIENTATION: { value_id: '1' } },
    })
    expect(p.attributes).toContainEqual({ id: 'ORIENTATION', value_id: '1' })
  })
  it('filtra atributos no permitidos por la categoría', () => {
    const p = propertyToMlPayload(baseProperty, {
      allowedAttributeIds: new Set(['ROOMS', 'BEDROOMS']),
    })
    const ids = p.attributes.map(a => a.id)
    expect(ids).toEqual(expect.arrayContaining(['ROOMS', 'BEDROOMS']))
    expect(ids).not.toContain('FLOORS')
  })
  it('mediaChoice=video setea video_id desde video_url', () => {
    const p = propertyToMlPayload(baseProperty, { mediaChoice: 'video' })
    expect(p.video_id).toBe('dQw4w9WgXcQ')
  })
  it('mediaChoice=tour NO setea video_id', () => {
    const p = propertyToMlPayload(baseProperty, { mediaChoice: 'tour' })
    expect(p.video_id).toBeUndefined()
  })
})

describe('resolveCategory', () => {
  it('depto venta -> MLA1473', () => {
    expect(resolveCategory(baseProperty)).toBe('MLA1473')
  })
})
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npm test -- lib/portals/mercadolibre/mapping.test.ts`
Expected: FAIL (resolveCategory/ML_LISTING_TYPES no exportados; opts no soportadas; default era 'silver').

- [ ] **Step 3: Modificar `mapping.ts`**

Reemplazar el bloque de tipos + `buildAttributes` + `propertyToMlPayload` y exportar `resolveCategory`/`ML_LISTING_TYPES`:

```ts
import type { Property } from '../types'
import { extractYouTubeId } from './media'

export interface MlAttribute { id: string; value_name?: string; value_id?: string }

export interface MlPayload {
  title: string
  category_id: string
  price: number
  currency_id: string
  available_quantity: number
  buying_mode: 'classified'
  listing_type_id: string
  condition: 'new'
  pictures: { source: string }[]
  description: { plain_text: string }
  attributes: MlAttribute[]
  location: {
    latitude: number
    longitude: number
    address_line: string
    country: { name: string }
    state: { name: string }
    city: { name: string }
    neighborhood?: { name: string }
  }
  video_id?: string
}

export interface AttributeOverride { value_name?: string; value_id?: string }

export interface MlPayloadOptions {
  attributeOverrides?: Record<string, AttributeOverride>
  mediaChoice?: 'video' | 'tour' | 'none'
  listingType?: string
  /** Si se pasa, se descartan los atributos cuyo id no esté en el set (los que la categoría no acepta). */
  allowedAttributeIds?: Set<string>
}

/** Listing types de inmuebles MLA, de mayor a menor exposición. Default gold_premium. */
export const ML_LISTING_TYPES: { id: string; label: string }[] = [
  { id: 'gold_premium', label: 'Premium (máxima exposición)' },
  { id: 'gold_special', label: 'Destacada' },
  { id: 'silver', label: 'Clásica' },
  { id: 'free', label: 'Gratuita' },
]

const CATEGORY_MAP: Record<string, Record<string, string>> = {
  venta: { departamento: 'MLA1473', casa: 'MLA1472', ph: 'MLA1471', terreno: 'MLA1493', local: 'MLA1494', oficina: 'MLA1495' },
  alquiler: { departamento: 'MLA1463', casa: 'MLA1462' },
  temporario: { departamento: 'MLA50547', casa: 'MLA50548' },
}
const FALLBACK_CATEGORY = 'MLA1459'

export function resolveCategory(property: Property): string {
  const operation = property.operation_type || 'venta'
  const type = (property.property_type || 'departamento').toLowerCase()
  return CATEGORY_MAP[operation]?.[type] ?? FALLBACK_CATEGORY
}

function buildTitle(property: Property): string {
  if (property.title) return property.title.slice(0, 60)
  const type = property.property_type || 'departamento'
  const typeCap = type.charAt(0).toUpperCase() + type.slice(1)
  const rooms = property.rooms ? `${property.rooms} amb` : ''
  return [typeCap, rooms, property.neighborhood].filter(Boolean).join(' ').slice(0, 60)
}

function derivedAttributes(property: Property): MlAttribute[] {
  const attrs: MlAttribute[] = []
  if (property.rooms) attrs.push({ id: 'ROOMS', value_name: String(property.rooms) })
  if (property.bedrooms) attrs.push({ id: 'BEDROOMS', value_name: String(property.bedrooms) })
  if (property.bathrooms) attrs.push({ id: 'FULL_BATHROOMS', value_name: String(property.bathrooms) })
  if (property.garages) attrs.push({ id: 'PARKING_LOTS', value_name: String(property.garages) })
  if (property.covered_area) attrs.push({ id: 'COVERED_AREA', value_name: `${property.covered_area} m²` })
  if (property.total_area) attrs.push({ id: 'TOTAL_AREA', value_name: `${property.total_area} m²` })
  if (property.expensas) attrs.push({ id: 'MAINTENANCE_FEE', value_name: `${property.expensas} ARS` })
  if (property.age != null) attrs.push({ id: 'PROPERTY_AGE', value_name: property.age === 0 ? 'A estrenar' : `${property.age} años` })
  if (property.floor != null) attrs.push({ id: 'FLOORS', value_name: String(property.floor) })
  return attrs
}

function buildAttributes(property: Property, opts: MlPayloadOptions): MlAttribute[] {
  const map = new Map<string, MlAttribute>()
  for (const a of derivedAttributes(property)) map.set(a.id, a)
  for (const [id, ov] of Object.entries(opts.attributeOverrides ?? {})) {
    if (ov.value_id) map.set(id, { id, value_id: ov.value_id })
    else if (ov.value_name != null && ov.value_name !== '') map.set(id, { id, value_name: ov.value_name })
    else map.delete(id) // override vacío = limpiar
  }
  let result = [...map.values()]
  if (opts.allowedAttributeIds) result = result.filter(a => opts.allowedAttributeIds!.has(a.id))
  return result
}

function buildLocation(property: Property) {
  const cityRaw = (property.city ?? '').trim()
  const isCaba = !cityRaw || /^caba$/i.test(cityRaw) || /capital federal/i.test(cityRaw) || /ciudad aut[oó]noma/i.test(cityRaw)
  const stateName = isCaba ? 'Capital Federal' : 'Buenos Aires'
  const cityName = isCaba ? property.neighborhood : cityRaw
  return {
    latitude: property.latitude!,
    longitude: property.longitude!,
    address_line: `${property.address}, ${property.neighborhood}, ${cityRaw || 'CABA'}`,
    country: { name: 'Argentina' },
    state: { name: stateName },
    city: { name: cityName },
    neighborhood: { name: property.neighborhood },
  }
}

export function propertyToMlPayload(property: Property, opts: MlPayloadOptions = {}): MlPayload {
  if (property.latitude == null || property.longitude == null) {
    throw new Error('propertyToMlPayload: lat/lng requeridos (corré validate antes)')
  }
  const payload: MlPayload = {
    title: buildTitle(property),
    category_id: resolveCategory(property),
    price: property.asking_price,
    currency_id: property.currency || 'USD',
    available_quantity: 1,
    buying_mode: 'classified',
    listing_type_id: opts.listingType || 'gold_premium',
    condition: 'new',
    pictures: (property.photos ?? []).slice(0, 12).map(source => ({ source })),
    description: { plain_text: property.description || buildTitle(property) },
    attributes: buildAttributes(property, opts),
    location: buildLocation(property),
  }
  if (opts.mediaChoice === 'video') {
    const ytId = extractYouTubeId(property.video_url)
    if (ytId) payload.video_id = ytId
  }
  return payload
}
```

- [ ] **Step 4: Correr todos los tests de mapping**

Run: `npm test -- lib/portals/mercadolibre/mapping.test.ts`
Expected: PASS (incluyendo los viejos; si alguno asumía `listing_type_id:'silver'`, actualizarlo a `'gold_premium'`).

- [ ] **Step 5: Verificar consumidores de propertyToMlPayload**

Run: `grep -rn "propertyToMlPayload" --include="*.ts" --include="*.mts" .`
Confirmar que `adapter.ts`, `ml-preview/route.ts`, `ml-publish/route.ts` compilan (la firma con `opts` opcional es backward-compatible). 
Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/portals/mercadolibre/mapping.ts lib/portals/mercadolibre/mapping.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(ml): mapping con overrides, media y filtro por schema; default gold_premium

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## FASE B — API

### Task 6: `GET /api/properties/[id]/ml-attributes`

**Files:**
- Create: `app/api/properties/[id]/ml-attributes/route.ts`

- [ ] **Step 1: Implementar la ruta**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { resolveCategory, ML_LISTING_TYPES } from '@/lib/portals/mercadolibre/mapping'
import { fetchCategoryAttributes, type AttributeOverride } from '@/lib/portals/mercadolibre/category-attributes'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Devuelve el schema dinámico de atributos de ML + valores prellenos del draft/propiedad. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    if (user.profile.role === 'abogado') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const { id } = await params
    const supabase = getAdmin()

    const { data: property } = await supabase.from('properties').select('*').eq('id', id).maybeSingle()
    if (!property) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    if (user.profile.role === 'asesor' && property.assigned_to !== user.id) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const categoryId = resolveCategory(property)
    const { required, recommended } = await fetchCategoryAttributes(categoryId)

    // Prefill: derivado de la propiedad + overrides guardados en el draft (listing.metadata.ml_attributes)
    const { data: listing } = await supabase
      .from('property_listings')
      .select('metadata')
      .eq('property_id', id).eq('portal', 'mercadolibre').maybeSingle()
    const meta = (listing?.metadata ?? {}) as Record<string, unknown>
    const saved = (meta.ml_attributes ?? {}) as Record<string, AttributeOverride>

    const prefill: Record<string, AttributeOverride> = {
      ...derivedPrefill(property),
      ...saved, // lo guardado pisa lo derivado
    }

    return NextResponse.json({
      categoryId,
      required,
      recommended,
      prefill,
      listingTypes: ML_LISTING_TYPES,
      listingTypeSelected: (meta.listing_type as string) ?? 'gold_premium',
      mediaChoice: (meta.media_choice as string) ?? 'none',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

function derivedPrefill(property: Database['public']['Tables']['properties']['Row']): Record<string, AttributeOverride> {
  const out: Record<string, AttributeOverride> = {}
  if (property.rooms) out.ROOMS = { value_name: String(property.rooms) }
  if (property.bedrooms) out.BEDROOMS = { value_name: String(property.bedrooms) }
  if (property.bathrooms) out.FULL_BATHROOMS = { value_name: String(property.bathrooms) }
  if (property.garages) out.PARKING_LOTS = { value_name: String(property.garages) }
  if (property.covered_area) out.COVERED_AREA = { value_name: String(property.covered_area) }
  if (property.total_area) out.TOTAL_AREA = { value_name: String(property.total_area) }
  if (property.expensas) out.MAINTENANCE_FEE = { value_name: String(property.expensas) }
  if (property.age != null) out.PROPERTY_AGE = { value_name: property.age === 0 ? 'A estrenar' : String(property.age) }
  if (property.floor != null) out.FLOORS = { value_name: String(property.floor) }
  return out
}
```

Nota: re-exportar `AttributeOverride` desde `category-attributes.ts` (o importarlo de `mapping.ts`). Para evitar import circular, definir `AttributeOverride` en `category-attributes.ts` y que `mapping.ts` lo importe desde ahí. Ajustar Task 5 si hace falta: `import type { AttributeOverride } from './category-attributes'` en mapping y quitar la definición duplicada.

- [ ] **Step 2: Resolver el tipo `AttributeOverride` en un solo lugar**

En `category-attributes.ts` agregar `export interface AttributeOverride { value_name?: string; value_id?: string }`. En `mapping.ts` reemplazar la definición local por `import type { AttributeOverride } from './category-attributes'`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/api/properties/[id]/ml-attributes/route.ts lib/portals/mercadolibre/category-attributes.ts lib/portals/mercadolibre/mapping.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(api): GET ml-attributes (schema dinámico + prefill)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `PATCH /api/properties/[id]/ml-preview` extendido

**Files:**
- Modify: `app/api/properties/[id]/ml-preview/route.ts`

- [ ] **Step 1: Extender el body del PATCH**

Reemplazar el handler `PATCH` para aceptar los campos nuevos. El `GET` queda igual salvo que también devuelve el draft (metadata) — agregarlo:

```ts
// dentro de GET, después de obtener `listing`, exponer el draft:
// return NextResponse.json({ property, payload, validation, listing: listing ?? null, draft: (listing?.metadata ?? {}) })

// NUEVO PATCH:
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const body = (await req.json()) as {
      title?: string; description?: string; photos?: string[]; asking_price?: number
      videoUrl?: string | null; tour3dUrl?: string | null
      latitude?: number; longitude?: number
      mlAttributes?: Record<string, { value_name?: string; value_id?: string }>
      mediaChoice?: 'video' | 'tour' | 'none'; listingType?: string
    }

    const supabase = getAdmin()

    // 1) Campos de la propiedad
    const update: Record<string, unknown> = {}
    if (typeof body.title === 'string') update.title = body.title.slice(0, 60)
    if (typeof body.description === 'string') update.description = body.description.slice(0, 5000)
    if (Array.isArray(body.photos)) {
      update.photos = body.photos
        .filter((p): p is string => typeof p === 'string' && p.length > 0 && p.length < 2000)
        .filter(p => /^https?:\/\//i.test(p))
        .slice(0, 12)
    }
    if (typeof body.asking_price === 'number' && body.asking_price > 0) {
      update.asking_price = Math.min(body.asking_price, 100_000_000)
    }
    if (body.videoUrl !== undefined) update.video_url = body.videoUrl
    if (body.tour3dUrl !== undefined) update.tour_3d_url = body.tour3dUrl
    if (typeof body.latitude === 'number') update.latitude = body.latitude
    if (typeof body.longitude === 'number') update.longitude = body.longitude

    let property = null
    if (Object.keys(update).length > 0) {
      const { data, error } = await supabase.from('properties').update(update).eq('id', id).select().single()
      if (error || !data) return NextResponse.json({ error: error?.message ?? 'update failed' }, { status: 500 })
      property = data
    } else {
      const { data } = await supabase.from('properties').select('*').eq('id', id).single()
      property = data
    }
    if (!property) return NextResponse.json({ error: 'property not found' }, { status: 404 })

    // 2) Draft de publicación en property_listings.metadata
    const draftPatch: Record<string, unknown> = {}
    if (body.mlAttributes) draftPatch.ml_attributes = body.mlAttributes
    if (body.mediaChoice) draftPatch.media_choice = body.mediaChoice
    if (body.listingType) draftPatch.listing_type = body.listingType
    if (Object.keys(draftPatch).length > 0) {
      const { data: existing } = await supabase
        .from('property_listings').select('metadata')
        .eq('property_id', id).eq('portal', 'mercadolibre').maybeSingle()
      const mergedMeta = { ...((existing?.metadata as Record<string, unknown>) ?? {}), ...draftPatch }
      await supabase.from('property_listings').upsert(
        { property_id: id, portal: 'mercadolibre', status: existing ? undefined : 'pending', metadata: mergedMeta as never },
        { onConflict: 'property_id,portal' },
      )
    }

    // 3) Recalcular payload + validation con el draft completo
    const { payload, validation } = await buildPayloadAndValidation(supabase, id, property)
    return NextResponse.json({ property, payload, validation })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Agregar helper `buildPayloadAndValidation` (usado por GET y PATCH)**

```ts
import { resolveCategory } from '@/lib/portals/mercadolibre/mapping'
import { fetchCategoryAttributes } from '@/lib/portals/mercadolibre/category-attributes'

async function buildPayloadAndValidation(
  supabase: ReturnType<typeof getAdmin>,
  propertyId: string,
  property: Database['public']['Tables']['properties']['Row'],
) {
  if (property.latitude == null || property.longitude == null) {
    return { payload: null, validation: { ok: false, errors: ['Falta geolocalización (lat/lng) — confirmá el pin en el mapa'], warnings: [] } }
  }
  const { data: listing } = await supabase
    .from('property_listings').select('metadata')
    .eq('property_id', propertyId).eq('portal', 'mercadolibre').maybeSingle()
  const meta = (listing?.metadata ?? {}) as Record<string, unknown>

  let allowedAttributeIds: Set<string> | undefined
  try {
    const cat = resolveCategory(property)
    const { required, recommended } = await fetchCategoryAttributes(cat)
    allowedAttributeIds = new Set([...required, ...recommended].map(a => a.id))
  } catch {
    allowedAttributeIds = undefined // si ML falla, no filtramos
  }

  const payload = propertyToMlPayload(property, {
    attributeOverrides: (meta.ml_attributes ?? {}) as Record<string, { value_name?: string; value_id?: string }>,
    mediaChoice: (meta.media_choice as 'video' | 'tour' | 'none') ?? 'none',
    listingType: (meta.listing_type as string) ?? 'gold_premium',
    allowedAttributeIds,
  })
  const validation = validateCommon(property)
  if (!property.description || property.description.length < 100) {
    validation.errors.push('ML requiere descripción ≥ 100 caracteres')
    validation.ok = false
  }
  return { payload, validation }
}
```

Y reemplazar en `GET` el cálculo inline de `payload`/`validation` por `await buildPayloadAndValidation(supabase, id, property)`.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/api/properties/[id]/ml-preview/route.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(api): ml-preview PATCH persiste draft (attrs/media/listingType/geo)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `POST /api/geocode`

**Files:**
- Create: `app/api/geocode/route.ts`

- [ ] **Step 1: Implementar**

```ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'

/** POST { address } -> { lat, lng, formatted }. Geocoding server-side con Google. */
export async function POST(req: Request) {
  try {
    await requireAuth()
    const { address } = (await req.json()) as { address?: string }
    if (!address || address.trim().length < 4) {
      return NextResponse.json({ error: 'address requerido' }, { status: 400 })
    }
    const key = process.env.GOOGLE_GEOCODING_API_KEY
    if (!key) return NextResponse.json({ error: 'GOOGLE_GEOCODING_API_KEY no configurada' }, { status: 412 })

    const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=ar&key=${key}`
    const res = await fetch(url)
    const data = (await res.json()) as {
      status: string
      results: { geometry: { location: { lat: number; lng: number } }; formatted_address: string }[]
    }
    if (data.status !== 'OK' || !data.results[0]) {
      return NextResponse.json({ error: `geocoding falló: ${data.status}` }, { status: 422 })
    }
    const r = data.results[0]
    return NextResponse.json({ lat: r.geometry.location.lat, lng: r.geometry.location.lng, formatted: r.formatted_address })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/api/geocode/route.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(api): POST /api/geocode (Google) para el pin del wizard

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Migrar el worker a `lib/portals/worker.ts` + ruta cron

**Files:**
- Create: `lib/portals/worker.ts`
- Create: `app/api/cron/publish-listings/route.ts`
- Modify: `netlify/functions/publish-listings.mts`

- [ ] **Step 1: Extraer la orquestación a `lib/portals/worker.ts`**

Copiar las 4 funciones (`processUnpublishes`, `processUpdates`, `processPausesAfterActive`, `processPublishes`) tal cual están hoy en `netlify/functions/publish-listings.mts` (líneas 37-307), envolverlas en una función pública y exportarla:

```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { initPortals, getAdapter } from '@/lib/portals'
import { writeAudit } from '@/lib/portals/audit'
import type { PortalName } from '@/lib/portals/types'
import { nextStateAfterError, stripFlag, swapFlag } from '@/lib/portals/worker-logic'
import { ensurePublicSlug } from '@/lib/landing/assign-slug'
import { mlFetch } from '@/lib/portals/mercadolibre/client'

type SB = ReturnType<typeof createClient<Database>>

export async function runPublishWorker(): Promise<{ ok: true }> {
  await initPortals()
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  await processUnpublishes(supabase)
  await processUpdates(supabase)
  await processPausesAfterActive(supabase)
  await processPublishes(supabase)
  return { ok: true }
}

// ... pegar processUnpublishes/processUpdates/processPausesAfterActive/processPublishes
// EXACTAMENTE como en el .mts actual (cambiando el tipo del param a `SB`).
```

(Copiar el cuerpo verbatim del archivo actual — ver `netlify/functions/publish-listings.mts:37-307`.)

- [ ] **Step 2: Crear la ruta cron**

```ts
// app/api/cron/publish-listings/route.ts
import { NextResponse } from 'next/server'
import { runPublishWorker } from '@/lib/portals/worker'

export const maxDuration = 60

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET
  return !!secret && req.headers.get('x-cron-secret') === secret
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: 'unauthorized' }, { status: 403 })
  try {
    const r = await runPublishWorker()
    return NextResponse.json(r)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function GET(req: Request) {
  return POST(req)
}
```

- [ ] **Step 3: Apagar el schedule del .mts (evitar doble envío) y delegar**

Reemplazar el cuerpo de `netlify/functions/publish-listings.mts` por un delegado sin `schedule`:

```ts
// netlify/functions/publish-listings.mts
// DESACTIVADO como scheduled function: el scheduler de Netlify no dispara en
// este sitio (Next 16 + plugin v5, ver CLAUDE.md). El worker corre vía pg_cron
// → POST /api/cron/publish-listings. Se deja como handler on-demand sin schedule
// para evitar doble envío si Netlify reviviera el cron.
import { runPublishWorker } from '@/lib/portals/worker'

export default async () => {
  await runPublishWorker()
  return new Response('ok', { status: 200 })
}
// NOTA: sin `export const config = { schedule }` a propósito.
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 5: Documentar el job pg_cron (para que el usuario lo corra)**

Crear `supabase/migrations/20260606000002_cron_publish_listings.sql`:

```sql
-- Worker de publicación de portales vía pg_cron (el scheduler de Netlify no dispara).
-- Mismo patrón que report-daily. Reemplazar <CRON_SECRET> por el valor real (mismo
-- que usa el job report-daily) y confirmar el host con:
--   SELECT command FROM cron.job WHERE jobname = 'report-daily';
select cron.schedule(
  'publish-listings',
  '* * * * *',
  $$ select net.http_post(
       url := 'https://inmodf.com.ar/api/cron/publish-listings',
       headers := jsonb_build_object('x-cron-secret', '<CRON_SECRET>'),
       body := '{}'::jsonb,
       timeout_milliseconds := 30000
     ); $$
);
-- Verificar: SELECT * FROM cron.job WHERE jobname='publish-listings';
--            SELECT status_code FROM net._http_response ORDER BY created DESC LIMIT 5;
```

- [ ] **Step 6: Commit**

```bash
git add lib/portals/worker.ts app/api/cron/publish-listings/route.ts netlify/functions/publish-listings.mts supabase/migrations/20260606000002_cron_publish_listings.sql
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(cron): worker de publicación vía pg_cron + ruta Next (fix scheduler Netlify)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Publicar usando el draft + script de teardown QA

**Files:**
- Modify: `app/api/properties/[id]/ml-publish/route.ts`
- Create: `scripts/qa-publish-ml-test.ts`

- [ ] **Step 1: Que el POST publique con las opts del draft**

En `ml-publish/route.ts` POST, antes de `ml.publish(property)`, construir el payload con el draft. El adapter actual llama internamente a `propertyToMlPayload(property)` sin opts → hay que pasarle las opts. Agregar al `MercadoLibreAdapter` un método `publishWithOptions(property, opts)` o, más simple, exponer un override: modificar `adapter.publish` para aceptar `opts?: MlPayloadOptions` y propagarlas:

En `lib/portals/mercadolibre/adapter.ts`:
```ts
import type { MlPayloadOptions } from './mapping'
// ...
async publish(property: Property, opts: MlPayloadOptions = {}): Promise<PublishResult> {
  const validation = this.validate(property)
  if (!validation.ok) throw new PortalAdapterError(`Validación falló: ${validation.errors.join(', ')}`, 'mercadolibre', 'validation', false)
  const payload = propertyToMlPayload(property, opts)
  const created = await mlFetch<MlItemCreated>('/items', { method: 'POST', body: JSON.stringify(payload) })
  return { externalId: created.id, externalUrl: created.permalink }
}
```
(El `PortalAdapter` interface tiene `publish(property): Promise<PublishResult>` — agregar el segundo param opcional al interface en `lib/portals/types.ts` para no romper el tipo.)

En `ml-publish/route.ts` POST, leer el draft y pasarlo:
```ts
const { data: listingDraft } = await supabase
  .from('property_listings').select('metadata')
  .eq('property_id', id).eq('portal', 'mercadolibre').maybeSingle()
const meta = (listingDraft?.metadata ?? {}) as Record<string, unknown>
let allowedAttributeIds: Set<string> | undefined
try {
  const { resolveCategory } = await import('@/lib/portals/mercadolibre/mapping')
  const { fetchCategoryAttributes } = await import('@/lib/portals/mercadolibre/category-attributes')
  const { required, recommended } = await fetchCategoryAttributes(resolveCategory(property))
  allowedAttributeIds = new Set([...required, ...recommended].map(a => a.id))
} catch { allowedAttributeIds = undefined }

pubResult = await (ml as MercadoLibreAdapter).publish(property, {
  attributeOverrides: (meta.ml_attributes ?? {}) as never,
  mediaChoice: (meta.media_choice as 'video' | 'tour' | 'none') ?? 'none',
  listingType: (meta.listing_type as string) ?? 'gold_premium',
  allowedAttributeIds,
})
```
(Importar `MercadoLibreAdapter` ya está; `getAdapter('mercadolibre')` lo devuelve.)

- [ ] **Step 2: Script de teardown QA (cerrar item, NO borrar propiedad)**

```ts
// scripts/qa-publish-ml-test.ts
// Uso: npx tsx scripts/qa-publish-ml-test.ts <command> <propertyId>
//   verify <propertyId>  -> imprime el item de ML tal como quedó publicado
//   teardown <propertyId> -> CIERRA el item de ML (status closed) SIN borrar la propiedad
// SEGURIDAD: solo opera sobre propiedades cuyo título empiece con "[TEST".
import { createClient } from '@supabase/supabase-js'
import { mlFetch } from '../lib/portals/mercadolibre/client'

async function main() {
  const [cmd, propertyId] = process.argv.slice(2)
  if (!cmd || !propertyId) { console.error('uso: <verify|teardown> <propertyId>'); process.exit(1) }
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: prop } = await sb.from('properties').select('title').eq('id', propertyId).maybeSingle()
  if (!prop) { console.error('propiedad no encontrada'); process.exit(1) }
  if (!String(prop.title ?? '').startsWith('[TEST')) {
    console.error('ABORT: la propiedad no es de prueba (título no empieza con "[TEST"). No se toca.')
    process.exit(1)
  }
  const { data: listing } = await sb.from('property_listings').select('external_id, external_url')
    .eq('property_id', propertyId).eq('portal', 'mercadolibre').maybeSingle()
  if (!listing?.external_id) { console.error('sin external_id'); process.exit(1) }

  if (cmd === 'verify') {
    const item = await mlFetch(`/items/${listing.external_id}`)
    console.log(JSON.stringify(item, null, 2))
  } else if (cmd === 'teardown') {
    await mlFetch(`/items/${listing.external_id}`, { method: 'PUT', body: JSON.stringify({ status: 'closed' }) })
    await sb.from('property_listings').update({ status: 'closed' }).eq('property_id', propertyId).eq('portal', 'mercadolibre')
    console.log(`OK: item ${listing.external_id} cerrado. Propiedad ${propertyId} INTACTA.`)
  }
}
main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add app/api/properties/[id]/ml-publish/route.ts lib/portals/mercadolibre/adapter.ts lib/portals/types.ts scripts/qa-publish-ml-test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(ml): publicar con draft (attrs/media/listingType) + script QA teardown seguro

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## FASE C — UI (wizard de 6 pasos)

### Task 11: Tipos compartidos + hook `useMlPublishDraft`

**Files:**
- Create: `components/properties/wizards/ml/types.ts`
- Create: `components/properties/wizards/ml/useMlPublishDraft.ts`

- [ ] **Step 1: Tipos compartidos**

```ts
// components/properties/wizards/ml/types.ts
import type { CategoryAttribute, AttributeOverride } from '@/lib/portals/mercadolibre/category-attributes'

export type StepId = 'images' | 'media' | 'fields' | 'description' | 'review' | 'confirm' | 'done' | 'manage'

export interface MlPreviewProperty {
  id: string; title: string | null; description: string | null; photos: string[]
  asking_price: number; currency: string; address: string; neighborhood: string
  rooms: number | null; bedrooms: number | null; bathrooms: number | null
  covered_area: number | null; total_area: number | null
  latitude: number | null; longitude: number | null
  video_url: string | null; tour_3d_url: string | null
}

export interface MlAttributesResponse {
  categoryId: string
  required: CategoryAttribute[]
  recommended: CategoryAttribute[]
  prefill: Record<string, AttributeOverride>
  listingTypes: { id: string; label: string }[]
  listingTypeSelected: string
  mediaChoice: 'video' | 'tour' | 'none'
}

export interface MlDraft {
  photos: string[]
  videoUrl: string | null
  tour3dUrl: string | null
  mediaChoice: 'video' | 'tour' | 'none'
  mlAttributes: Record<string, AttributeOverride>
  listingType: string
  title: string
  description: string
  askingPrice: number
  latitude: number | null
  longitude: number | null
}

export interface MlListing {
  status: string; external_id: string | null; external_url: string | null
  last_published_at: string | null; last_error: string | null
}
```

- [ ] **Step 2: Hook**

```ts
// components/properties/wizards/ml/useMlPublishDraft.ts
'use client'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import type { MlAttributesResponse, MlDraft, MlListing, MlPreviewProperty } from './types'

interface PreviewResponse {
  property: MlPreviewProperty
  payload: unknown | null
  validation: { ok: boolean; errors: string[]; warnings: string[] }
  listing: MlListing | null
}

export function useMlPublishDraft(propertyId: string) {
  const [loading, setLoading] = useState(true)
  const [property, setProperty] = useState<MlPreviewProperty | null>(null)
  const [attrs, setAttrs] = useState<MlAttributesResponse | null>(null)
  const [listing, setListing] = useState<MlListing | null>(null)
  const [validation, setValidation] = useState<PreviewResponse['validation']>({ ok: false, errors: [], warnings: [] })
  const [draft, setDraft] = useState<MlDraft | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [prevR, attrR] = await Promise.all([
        fetch(`/api/properties/${propertyId}/ml-preview`),
        fetch(`/api/properties/${propertyId}/ml-attributes`),
      ])
      if (!prevR.ok) throw new Error('No se pudo cargar el preview')
      const prev = (await prevR.json()) as PreviewResponse
      const attrJson = attrR.ok ? ((await attrR.json()) as MlAttributesResponse) : null
      setProperty(prev.property)
      setListing(prev.listing)
      setValidation(prev.validation)
      setAttrs(attrJson)
      setDraft({
        photos: prev.property.photos ?? [],
        videoUrl: prev.property.video_url,
        tour3dUrl: prev.property.tour_3d_url,
        mediaChoice: attrJson?.mediaChoice ?? (prev.property.video_url ? 'video' : prev.property.tour_3d_url ? 'tour' : 'none'),
        mlAttributes: attrJson?.prefill ?? {},
        listingType: attrJson?.listingTypeSelected ?? 'gold_premium',
        title: prev.property.title ?? '',
        description: prev.property.description ?? '',
        askingPrice: prev.property.asking_price,
        latitude: prev.property.latitude,
        longitude: prev.property.longitude,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }, [propertyId])

  useEffect(() => { load() }, [load])

  const patch = useCallback((p: Partial<MlDraft>) => setDraft(d => (d ? { ...d, ...p } : d)), [])

  /** Persiste el draft en el server y devuelve la validation recalculada. */
  const save = useCallback(async (): Promise<boolean> => {
    if (!draft) return false
    const r = await fetch(`/api/properties/${propertyId}/ml-preview`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: draft.title, description: draft.description, photos: draft.photos, asking_price: draft.askingPrice,
        videoUrl: draft.videoUrl, tour3dUrl: draft.tour3dUrl, latitude: draft.latitude, longitude: draft.longitude,
        mlAttributes: draft.mlAttributes, mediaChoice: draft.mediaChoice, listingType: draft.listingType,
      }),
    })
    const j = (await r.json()) as { validation?: PreviewResponse['validation']; error?: string }
    if (!r.ok) { toast.error(j.error ?? 'Error al guardar'); return false }
    if (j.validation) setValidation(j.validation)
    return true
  }, [draft, propertyId])

  return { loading, property, attrs, listing, validation, draft, patch, save, reload: load }
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/properties/wizards/ml/types.ts components/properties/wizards/ml/useMlPublishDraft.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(wizard): tipos + hook de estado del draft de publicación ML

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: `GeoPinMap` (client-only, Leaflet)

**Files:**
- Create: `components/properties/wizards/ml/GeoPinMap.tsx`

- [ ] **Step 1: Implementar el mapa con pin arrastrable**

```tsx
'use client'
import { useEffect, useRef } from 'react'
import type { Map as LeafletMap, Marker } from 'leaflet'

interface Props { lat: number; lng: number; onChange: (lat: number, lng: number) => void }

/** Mini-mapa OSM con pin arrastrable. Carga Leaflet dinámicamente (sin SSR). */
export function GeoPinMap({ lat, lng, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<Marker | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      await import('leaflet/dist/leaflet.css')
      if (cancelled || !ref.current || mapRef.current) return
      const map = L.map(ref.current).setView([lat, lng], 16)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(map)
      const icon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconSize: [25, 41], iconAnchor: [12, 41],
      })
      const marker = L.marker([lat, lng], { draggable: true, icon }).addTo(map)
      marker.on('dragend', () => { const p = marker.getLatLng(); onChange(p.lat, p.lng) })
      mapRef.current = map
      markerRef.current = marker
    })()
    return () => { cancelled = true; mapRef.current?.remove(); mapRef.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sincroniza el pin si lat/lng cambian desde afuera (ej. geocoding)
  useEffect(() => {
    if (markerRef.current && mapRef.current) {
      markerRef.current.setLatLng([lat, lng])
      mapRef.current.setView([lat, lng], 16)
    }
  }, [lat, lng])

  return <div ref={ref} className="h-56 w-full rounded-lg border" />
}
```

- [ ] **Step 2: Verificar que el build no rompe por SSR**

El componente se importa siempre con `dynamic(() => import(...), { ssr: false })` desde `StepFields` (Task 15). Confirmar en Task 15.
Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/properties/wizards/ml/GeoPinMap.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(wizard): GeoPinMap (Leaflet/OSM) con pin arrastrable

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: `StepImages`

**Files:**
- Create: `components/properties/wizards/ml/steps/StepImages.tsx`

- [ ] **Step 1: Implementar (drag&drop nativo HTML5 + portada/2ª/3ª destacadas)**

```tsx
'use client'
import { useState } from 'react'
import type { MlDraft } from '../types'

interface Props { draft: MlDraft; onChange: (p: Partial<MlDraft>) => void; onValidityChange: (ok: boolean) => void }

const RANK_LABEL = ['⭐ Portada', '2ª', '3ª']
const RANK_COLOR = ['border-emerald-500', 'border-blue-500', 'border-blue-500']

export function StepImages({ draft, onChange, onValidityChange }: Props) {
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const photos = draft.photos

  function reorder(from: number, to: number) {
    if (from === to) return
    const next = [...photos]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange({ photos: next })
  }

  // Validez: al menos 1 foto (ML exige portada). Recomendado 6+.
  if (photos.length >= 1) onValidityChange(true); else onValidityChange(false)

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium">Elegí las fotos del aviso</h3>
        <p className="text-sm text-muted-foreground">Arrastrá para ordenar. La <b>⭐ portada</b> y las <b>2 siguientes</b> son las que ML muestra primero.</p>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {photos.map((url, i) => (
          <div
            key={url}
            draggable
            onDragStart={() => setDragIdx(i)}
            onDragOver={e => e.preventDefault()}
            onDrop={() => { if (dragIdx !== null) reorder(dragIdx, i); setDragIdx(null) }}
            className={`relative aspect-square rounded-lg overflow-hidden border-2 cursor-grab active:cursor-grabbing ${i < 3 ? RANK_COLOR[i] : 'border-transparent'}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={`Foto ${i + 1}`} className="object-cover w-full h-full" />
            {i < 3 && (
              <span className="absolute bottom-1 left-1 rounded-full bg-black/70 text-white text-[10px] px-2 py-0.5">
                {RANK_LABEL[i]}
              </span>
            )}
          </div>
        ))}
      </div>
      <p className={`text-xs ${photos.length >= 6 ? 'text-emerald-600' : 'text-amber-600'}`}>
        {photos.length} foto{photos.length === 1 ? '' : 's'} · ML recomienda al menos 6 de buena calidad
      </p>
      {photos.length === 0 && <p className="text-xs text-red-600">Cargá al menos una foto en la ficha de la propiedad antes de publicar.</p>}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/properties/wizards/ml/steps/StepImages.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(wizard): StepImages con drag&drop y portada/2ª/3ª

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: `StepMedia`

**Files:**
- Create: `components/properties/wizards/ml/steps/StepMedia.tsx`

- [ ] **Step 1: Implementar (editar URLs + elegir video o tour)**

```tsx
'use client'
import type { MlDraft } from '../types'
import { extractYouTubeId } from '@/lib/portals/mercadolibre/media'

interface Props { draft: MlDraft; onChange: (p: Partial<MlDraft>) => void; onValidityChange: (ok: boolean) => void }

export function StepMedia({ draft, onChange, onValidityChange }: Props) {
  // Media es opcional → siempre válido.
  onValidityChange(true)
  const ytId = extractYouTubeId(draft.videoUrl)

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-medium">Video y recorrido</h3>
        <p className="text-sm text-muted-foreground">ML acepta un video de YouTube. Elegí qué mandar (uno u otro).</p>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">URL del video (YouTube)</span>
        <input value={draft.videoUrl ?? ''} onChange={e => onChange({ videoUrl: e.target.value || null })}
          placeholder="https://youtu.be/..." className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        {draft.videoUrl && !ytId && <span className="text-xs text-amber-600">No se reconoció un ID de YouTube válido.</span>}
        {ytId && <span className="text-xs text-emerald-600">✓ Video detectado ({ytId})</span>}
      </label>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">URL del recorrido 3D (Matterport u otro)</span>
        <input value={draft.tour3dUrl ?? ''} onChange={e => onChange({ tour3dUrl: e.target.value || null })}
          placeholder="https://my.matterport.com/show/?m=..." className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
      </label>

      <div className="space-y-2">
        <span className="text-sm font-medium">¿Qué mandamos a MercadoLibre?</span>
        <div className="grid grid-cols-3 gap-2">
          {([['video', '🎬 Video'], ['tour', '🏠 Recorrido'], ['none', '— Ninguno']] as const).map(([val, label]) => {
            const disabled = (val === 'video' && !ytId) || (val === 'tour' && !draft.tour3dUrl)
            return (
              <button key={val} type="button" disabled={disabled}
                onClick={() => onChange({ mediaChoice: val })}
                className={`rounded-lg border-2 py-3 text-sm ${draft.mediaChoice === val ? 'border-emerald-500 bg-emerald-50' : 'border-muted'} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}>
                {label}
              </button>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">El recorrido 3D se incluye como link en la descripción; ML solo acepta video nativo.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/properties/wizards/ml/steps/StepMedia.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(wizard): StepMedia (video/tour, regla uno u otro)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 15: `StepFields` (campos dinámicos + geolocalización)

**Files:**
- Create: `components/properties/wizards/ml/steps/StepFields.tsx`

- [ ] **Step 1: Implementar render dinámico + completitud + mapa**

```tsx
'use client'
import { useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { toast } from 'sonner'
import type { CategoryAttribute } from '@/lib/portals/mercadolibre/category-attributes'
import type { MlAttributesResponse, MlDraft, MlPreviewProperty } from '../types'

const GeoPinMap = dynamic(() => import('../GeoPinMap').then(m => m.GeoPinMap), { ssr: false })

interface Props {
  property: MlPreviewProperty
  attrs: MlAttributesResponse | null
  draft: MlDraft
  onChange: (p: Partial<MlDraft>) => void
  onValidityChange: (ok: boolean) => void
}

function AttrField({ attr, value, onSet }: { attr: CategoryAttribute; value: { value_name?: string; value_id?: string } | undefined; onSet: (v: { value_name?: string; value_id?: string } | undefined) => void }) {
  const has = !!(value?.value_id || value?.value_name)
  const border = attr.required && !has ? 'border-red-400 bg-red-50' : 'border-input'
  if (attr.valueType === 'list' && attr.allowedValues) {
    return (
      <select value={value?.value_id ?? ''} onChange={e => onSet(e.target.value ? { value_id: e.target.value } : undefined)}
        className={`w-full rounded-md border px-3 py-2 text-sm ${border}`}>
        <option value="">— elegí —</option>
        {attr.allowedValues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
      </select>
    )
  }
  if (attr.valueType === 'boolean') {
    return (
      <select value={value?.value_name ?? ''} onChange={e => onSet(e.target.value ? { value_name: e.target.value } : undefined)}
        className={`w-full rounded-md border px-3 py-2 text-sm ${border}`}>
        <option value="">— elegí —</option>
        <option value="Sí">Sí</option><option value="No">No</option>
      </select>
    )
  }
  return (
    <input value={value?.value_name ?? ''} onChange={e => onSet(e.target.value ? { value_name: e.target.value } : undefined)}
      placeholder={attr.allowedUnits?.[0] ? `valor (${attr.allowedUnits[0]})` : 'valor'}
      className={`w-full rounded-md border px-3 py-2 text-sm ${border}`} />
  )
}

export function StepFields({ property, attrs, draft, onChange, onValidityChange }: Props) {
  const [geocoding, setGeocoding] = useState(false)
  const required = attrs?.required ?? []
  const recommended = attrs?.recommended ?? []

  function setAttr(id: string, v: { value_name?: string; value_id?: string } | undefined) {
    const next = { ...draft.mlAttributes }
    if (v) next[id] = v; else delete next[id]
    onChange({ mlAttributes: next })
  }

  const completeness = useMemo(() => {
    const all = [...required, ...recommended]
    if (all.length === 0) return 100
    const filled = all.filter(a => { const v = draft.mlAttributes[a.id]; return !!(v?.value_id || v?.value_name) }).length
    return Math.round((filled / all.length) * 100)
  }, [required, recommended, draft.mlAttributes])

  const requiredOk = required.every(a => { const v = draft.mlAttributes[a.id]; return !!(v?.value_id || v?.value_name) })
  const geoOk = draft.latitude != null && draft.longitude != null
  onValidityChange(requiredOk && geoOk)

  async function geocode() {
    setGeocoding(true)
    try {
      const r = await fetch('/api/geocode', { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: `${property.address}, ${property.neighborhood}, ${property.city}` }) })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      onChange({ latitude: j.lat, longitude: j.lng })
      toast.success('Ubicación encontrada — ajustá el pin si hace falta')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') } finally { setGeocoding(false) }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-medium">Datos que pide MercadoLibre</h3>
        {attrs && <p className="text-sm text-muted-foreground">Categoría: {attrs.categoryId}. Completá para una publicación de excelencia.</p>}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden"><div className="h-full bg-emerald-600 transition-all" style={{ width: `${completeness}%` }} /></div>
        <span className="text-xs font-semibold text-emerald-700">Completitud {completeness}%</span>
      </div>

      {!attrs && <p className="text-sm text-amber-600">No se pudieron traer los campos de ML (se publicará con los datos básicos).</p>}

      {required.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase text-red-700">Obligatorios de ML</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {required.map(a => (
              <label key={a.id} className="space-y-1"><span className="text-sm">{a.name}</span>
                <AttrField attr={a} value={draft.mlAttributes[a.id]} onSet={v => setAttr(a.id, v)} /></label>
            ))}
          </div>
        </section>
      )}

      {recommended.length > 0 && (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase text-blue-700">Recomendados (suman al score)</p>
          <div className="grid sm:grid-cols-2 gap-3">
            {recommended.map(a => (
              <label key={a.id} className="space-y-1"><span className="text-sm">{a.name}</span>
                <AttrField attr={a} value={draft.mlAttributes[a.id]} onSet={v => setAttr(a.id, v)} /></label>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Tipo de publicación</p>
        <select value={draft.listingType} onChange={e => onChange({ listingType: e.target.value })}
          className="w-full rounded-md border border-input px-3 py-2 text-sm">
          {(attrs?.listingTypes ?? [{ id: 'gold_premium', label: 'Premium' }]).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Ubicación</p>
          <button type="button" onClick={geocode} disabled={geocoding} className="text-xs underline text-[color:var(--brand)]">
            {geocoding ? 'Buscando…' : 'Geocodificar dirección'}
          </button>
        </div>
        {geoOk
          ? <GeoPinMap lat={draft.latitude!} lng={draft.longitude!} onChange={(lat, lng) => onChange({ latitude: lat, longitude: lng })} />
          : <p className="text-sm text-red-600">Falta la ubicación. Tocá “Geocodificar dirección” y confirmá el pin.</p>}
      </section>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck + build (verifica que el dynamic import de Leaflet no rompe SSR)**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/properties/wizards/ml/steps/StepFields.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(wizard): StepFields (campos dinámicos ML + completitud + geo)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 16: `StepDescription`

**Files:**
- Create: `components/properties/wizards/ml/steps/StepDescription.tsx`

- [ ] **Step 1: Implementar (generar/regenerar/editar)**

```tsx
'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MlDraft } from '../types'

interface Props { propertyId: string; draft: MlDraft; onChange: (p: Partial<MlDraft>) => void; onValidityChange: (ok: boolean) => void }

export function StepDescription({ propertyId, draft, onChange, onValidityChange }: Props) {
  const [generating, setGenerating] = useState(false)
  const [buyerProfile, setBuyerProfile] = useState('')
  onValidityChange(draft.description.trim().length >= 100)

  async function generate() {
    setGenerating(true)
    try {
      const r = await fetch(`/api/properties/${propertyId}/generate-description`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ buyerProfile: buyerProfile || undefined, save: false }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      const g = j.generated as { title: string; subtitle: string; body: string }
      onChange({ title: g.title.slice(0, 60), description: `${g.subtitle}\n\n${g.body}` })
      toast.success('Descripción generada con el sistema GPT Portales')
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') } finally { setGenerating(false) }
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-medium">Descripción del aviso</h3>
        <p className="text-sm text-muted-foreground">Generada con el sistema de prompts “GPT Portales” (tono, adjetivos permitidos, disclaimer).</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Título (máx 60)</label>
        <input value={draft.title} onChange={e => onChange({ title: e.target.value.slice(0, 60) })}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        <p className="text-xs text-muted-foreground">{draft.title.length}/60</p>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
        <input value={buyerProfile} onChange={e => setBuyerProfile(e.target.value)}
          placeholder="Perfil del comprador ideal (opcional): familia, inversor, soltero…"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        <Button onClick={generate} disabled={generating} className="w-full">
          {generating ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Generando…</> : <><Sparkles className="h-4 w-4 mr-1" />Generar / Regenerar descripción</>}
        </Button>
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">Descripción (mín 100)</label>
        <textarea value={draft.description} onChange={e => onChange({ description: e.target.value })}
          rows={12} className="w-full rounded-md border bg-background px-3 py-2 text-sm" />
        <p className={`text-xs ${draft.description.length >= 100 ? 'text-emerald-600' : 'text-red-600'}`}>{draft.description.length} caracteres (mín 100)</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/properties/wizards/ml/steps/StepDescription.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(wizard): StepDescription integrando el generador GPT Portales

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 17: `StepReview`

**Files:**
- Create: `components/properties/wizards/ml/steps/StepReview.tsx`

- [ ] **Step 1: Implementar (resumen fiel + Editar / OK publicar)**

```tsx
'use client'
import type { MlAttributesResponse, MlDraft } from '../types'

interface Props { draft: MlDraft; attrs: MlAttributesResponse | null; currency: string; address: string; neighborhood: string; onEdit: () => void; onGo: () => void; canPublish: boolean }

export function StepReview({ draft, attrs, currency, address, neighborhood, onEdit, onGo, canPublish }: Props) {
  const filledAttrs = [...(attrs?.required ?? []), ...(attrs?.recommended ?? [])]
    .map(a => ({ name: a.name, val: draft.mlAttributes[a.id]?.value_name ?? (a.allowedValues?.find(v => v.id === draft.mlAttributes[a.id]?.value_id)?.name) }))
    .filter(x => x.val)

  return (
    <div className="space-y-4">
      <h3 className="text-base font-medium flex items-center gap-2">👁️ Así se va a ver el aviso</h3>
      <div className="rounded-lg border overflow-hidden">
        {draft.photos[0] && (
          <div className="grid grid-cols-3 gap-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={draft.photos[0]} alt="" className="col-span-2 row-span-2 aspect-[4/3] object-cover w-full" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {draft.photos[1] && <img src={draft.photos[1]} alt="" className="aspect-square object-cover w-full" />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {draft.photos[2] && <img src={draft.photos[2]} alt="" className="aspect-square object-cover w-full" />}
          </div>
        )}
        <div className="p-4 space-y-2">
          <p className="text-2xl font-semibold">{new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 0 }).format(draft.askingPrice)}</p>
          <h4 className="text-lg font-medium">{draft.title}</h4>
          <p className="text-sm text-muted-foreground">{address} · {neighborhood}</p>
          {filledAttrs.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {filledAttrs.slice(0, 10).map((a, i) => <span key={i} className="text-xs rounded-full bg-muted px-2 py-0.5">{a.name}: {a.val}</span>)}
            </div>
          )}
          <div className="rounded border bg-muted/30 p-3 text-sm whitespace-pre-wrap max-h-48 overflow-auto mt-2">{draft.description}</div>
          {draft.mediaChoice !== 'none' && <p className="text-xs text-muted-foreground">{draft.mediaChoice === 'video' ? '🎬 Con video' : '🏠 Con recorrido 3D'}</p>}
        </div>
      </div>
      <div className="flex gap-2">
        <button onClick={onEdit} className="flex-1 rounded-md border py-2 text-sm">Editar algo</button>
        <button onClick={onGo} disabled={!canPublish} className="flex-1 rounded-md bg-[color:var(--brand)] text-white py-2 text-sm disabled:opacity-50">OK, ir a publicar →</button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/properties/wizards/ml/steps/StepReview.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(wizard): StepReview (resumen fiel a ML)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 18: `StepConfirm` (+ estado done)

**Files:**
- Create: `components/properties/wizards/ml/steps/StepConfirm.tsx`

- [ ] **Step 1: Implementar**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Loader2, Rocket, CheckCircle2, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { MlDraft } from '../types'

interface Props { propertyId: string; draft: MlDraft; currency: string; canPublish: boolean; onBack: () => void }

export function StepConfirm({ propertyId, draft, currency, canPublish, onBack }: Props) {
  const router = useRouter()
  const [publishing, setPublishing] = useState(false)
  const [result, setResult] = useState<{ externalId: string; externalUrl: string } | null>(null)

  async function publish() {
    setPublishing(true)
    try {
      const r = await fetch(`/api/properties/${propertyId}/ml-publish`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok || !j.ok) throw new Error(j.error ?? 'Error al publicar')
      setResult({ externalId: j.externalId, externalUrl: j.externalUrl })
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') } finally { setPublishing(false) }
  }

  if (result) {
    return (
      <div className="text-center space-y-3 py-8">
        <CheckCircle2 className="h-12 w-12 text-emerald-600 mx-auto" />
        <h3 className="font-semibold text-lg">¡Aviso publicado!</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">ML está validando el aviso. Queda visible al público cuando termine (30s a varios minutos).</p>
        <p className="text-xs text-muted-foreground">ID: <code>{result.externalId}</code></p>
        <div className="space-y-2 max-w-sm mx-auto">
          <Button asChild className="w-full"><a href={result.externalUrl} target="_blank" rel="noopener noreferrer">Abrir en MercadoLibre <ExternalLink className="h-4 w-4 ml-1" /></a></Button>
          <Button variant="outline" className="w-full" onClick={() => router.push(`/properties/${propertyId}`)}>Volver al detalle</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-base font-medium flex items-center gap-2"><Rocket className="h-4 w-4 text-emerald-700" />Confirmar y publicar</h3>
      <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4 text-sm space-y-1">
        <p className="font-medium">Vas a publicar este aviso en MercadoLibre:</p>
        <p><strong>Título:</strong> {draft.title}</p>
        <p><strong>Precio:</strong> {new Intl.NumberFormat('es-AR', { style: 'currency', currency, minimumFractionDigits: 0 }).format(draft.askingPrice)}</p>
        <p><strong>Fotos:</strong> {draft.photos.length}</p>
        <p><strong>Tipo:</strong> {draft.listingType}</p>
      </div>
      <p className="text-xs text-muted-foreground">ML valida el aviso (30s a varios minutos). Después podés pausarlo o cerrarlo desde el panel de gestión.</p>
      <div className="flex gap-2">
        <button onClick={onBack} className="rounded-md border px-4 py-2 text-sm">Editar</button>
        <Button onClick={publish} disabled={publishing || !canPublish} className="flex-1 bg-emerald-700 hover:bg-emerald-800">
          {publishing ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Publicando…</> : <><Rocket className="h-4 w-4 mr-1" />Confirma y publica</>}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/properties/wizards/ml/steps/StepConfirm.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(wizard): StepConfirm + pantalla de éxito

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 19: Extraer `ManageListingPanel`

**Files:**
- Create: `components/properties/wizards/ml/ManageListingPanel.tsx`

- [ ] **Step 1: Mover el componente**

Copiar la función `ManageListingPanel` actual de `components/properties/wizards/MercadoLibreWizard.tsx:601-757` a su propio archivo, exportándola, e importando lo que use (Card, Button, Badge, iconos lucide, MlListing type). Firma:
```ts
export function ManageListingPanel({ listing, propertyAddress, propertyTitle, managing, onAction, onBackToDetail }: { listing: MlListing; propertyAddress: string; propertyTitle: string | null; managing: 'pause' | 'close' | 'activate' | null; onAction: (a: 'pause' | 'close' | 'activate') => void; onBackToDetail: () => void })
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/properties/wizards/ml/ManageListingPanel.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "refactor(wizard): extraer ManageListingPanel a su propio archivo

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 20: Shell del wizard (stepper + framer-motion + navegación)

**Files:**
- Create: `components/properties/wizards/ml/MercadoLibreWizard.tsx`

- [ ] **Step 1: Implementar el shell**

```tsx
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import { Loader2, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useMlPublishDraft } from './useMlPublishDraft'
import { ManageListingPanel } from './ManageListingPanel'
import { StepImages } from './steps/StepImages'
import { StepMedia } from './steps/StepMedia'
import { StepFields } from './steps/StepFields'
import { StepDescription } from './steps/StepDescription'
import { StepReview } from './steps/StepReview'
import { StepConfirm } from './steps/StepConfirm'

const STEPS = [
  { id: 'images', label: '📸 Imágenes' },
  { id: 'media', label: '🎬 Video' },
  { id: 'fields', label: '📋 Campos' },
  { id: 'description', label: '✍️ Descripción' },
  { id: 'review', label: '👁️ Resumen' },
  { id: 'confirm', label: '🚀 Publicar' },
] as const

export function MercadoLibreWizard({ propertyId }: { propertyId: string }) {
  const router = useRouter()
  const { loading, property, attrs, listing, validation, draft, patch, save, reload } = useMlPublishDraft(propertyId)
  const [idx, setIdx] = useState(0)
  const [stepValid, setStepValid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [managing, setManaging] = useState<'pause' | 'close' | 'activate' | null>(null)

  // Si ya hay aviso publicado, mostrar el panel de gestión
  if (!loading && listing?.external_id && property) {
    return <ManageListingPanel listing={listing} propertyAddress={property.address} propertyTitle={property.title}
      managing={managing} onAction={changeStatus} onBackToDetail={() => router.push(`/properties/${propertyId}`)} />
  }
  if (loading || !property || !draft) {
    return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin" /></div>
  }

  const canPublish = validation.ok
  const current = STEPS[idx].id

  async function next() {
    setSaving(true)
    const ok = await save()
    setSaving(false)
    if (!ok) return
    setStepValid(false)
    setIdx(i => Math.min(i + 1, STEPS.length - 1))
  }
  function back() { setStepValid(true); setIdx(i => Math.max(i - 1, 0)) }
  function goTo(targetIdx: number) { setStepValid(true); setIdx(targetIdx) }

  async function changeStatus(action: 'pause' | 'close' | 'activate') {
    const msg = action === 'close' ? '¿Cerrar el aviso DEFINITIVAMENTE?' : action === 'pause' ? '¿Pausar el aviso?' : '¿Reactivar el aviso?'
    if (!confirm(msg)) return
    setManaging(action)
    try {
      const r = await fetch(`/api/properties/${propertyId}/ml-publish`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) })
      const j = await r.json(); if (!r.ok) throw new Error(j.error)
      toast.success('Listo'); await reload()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Error') } finally { setManaging(null) }
  }

  return (
    <div className="space-y-6">
      {/* Stepper */}
      <div className="flex items-center gap-1.5 text-xs flex-wrap">
        {STEPS.map((s, i) => (
          <div key={s.id} className="flex items-center gap-1.5">
            <span className={`px-2.5 py-1 rounded-full ${i < idx ? 'bg-emerald-600 text-white' : i === idx ? 'bg-[color:var(--brand)] text-white' : 'bg-muted text-muted-foreground'}`}>
              {i < idx && <CheckCircle2 className="h-3 w-3 inline mr-1" />}{s.label}
            </span>
            {i < STEPS.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}
          </div>
        ))}
      </div>

      {validation.errors.length > 0 && current === 'confirm' && (
        <Card className="border-red-300"><CardContent className="py-3 text-sm text-red-700">{validation.errors.join(' · ')}</CardContent></Card>
      )}

      <Card>
        <CardContent className="py-5">
          <AnimatePresence mode="wait">
            <motion.div key={current} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={{ duration: 0.18 }}>
              {current === 'images' && <StepImages draft={draft} onChange={patch} onValidityChange={setStepValid} />}
              {current === 'media' && <StepMedia draft={draft} onChange={patch} onValidityChange={setStepValid} />}
              {current === 'fields' && <StepFields property={property} attrs={attrs} draft={draft} onChange={patch} onValidityChange={setStepValid} />}
              {current === 'description' && <StepDescription propertyId={propertyId} draft={draft} onChange={patch} onValidityChange={setStepValid} />}
              {current === 'review' && <StepReview draft={draft} attrs={attrs} currency={property.currency} address={property.address} neighborhood={property.neighborhood} canPublish={canPublish} onEdit={() => goTo(0)} onGo={async () => { await next() }} />}
              {current === 'confirm' && <StepConfirm propertyId={propertyId} draft={draft} currency={property.currency} canPublish={canPublish} onBack={back} />}
            </motion.div>
          </AnimatePresence>
        </CardContent>
      </Card>

      {/* Navegación (oculta en review/confirm que tienen sus propios botones) */}
      {current !== 'review' && current !== 'confirm' && (
        <div className="flex gap-2">
          {idx > 0 && <Button variant="outline" onClick={back}><ArrowLeft className="h-4 w-4 mr-1" />Atrás</Button>}
          <Button className="flex-1" onClick={next} disabled={!stepValid || saving}>
            {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-1" />Guardando…</> : <>Siguiente<ArrowRight className="h-4 w-4 ml-1" /></>}
          </Button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: `currency` en MlPreviewProperty**

`StepReview`/`StepConfirm`/shell usan `property.currency`. Agregar `currency: string` a `MlPreviewProperty` (types.ts) y exponerlo en el GET de ml-preview (ya devuelve `property.currency` dentro de `property`). Confirmar que el `property` del GET incluye `currency` (la fila completa de properties lo tiene).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add components/properties/wizards/ml/MercadoLibreWizard.tsx components/properties/wizards/ml/types.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(wizard): shell de 6 pasos con stepper y animaciones

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 21: Wirear la página + retirar el wizard viejo

**Files:**
- Modify: `app/(dashboard)/properties/[id]/marketing/mercadolibre/page.tsx`
- Modify/Delete: `components/properties/wizards/MercadoLibreWizard.tsx`

- [ ] **Step 1: Apuntar la página al nuevo shell**

En `page.tsx`, cambiar el import:
```ts
// antes: import { MercadoLibreWizard } from '@/components/properties/wizards/MercadoLibreWizard'
import { MercadoLibreWizard } from '@/components/properties/wizards/ml/MercadoLibreWizard'
```

- [ ] **Step 2: Convertir el archivo viejo en re-export (compat) o eliminarlo**

Reemplazar el contenido de `components/properties/wizards/MercadoLibreWizard.tsx` por:
```ts
export { MercadoLibreWizard } from './ml/MercadoLibreWizard'
```
Run para detectar otros imports: `grep -rn "wizards/MercadoLibreWizard" --include="*.tsx" --include="*.ts" app components`
Si solo lo usa la página (ya migrada), se puede eliminar el archivo viejo; si hay otros, el re-export los mantiene.

- [ ] **Step 3: Typecheck + build + lint**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: build OK (Leaflet solo en client, dynamic ssr:false).

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/properties/[id]/marketing/mercadolibre/page.tsx" components/properties/wizards/MercadoLibreWizard.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(wizard): activar el nuevo wizard de ML en la página de marketing

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## FASE D — QA, review y docs (fuera del bucle de tareas TDD)

Estas se ejecutan tras completar las tareas (las maneja el orquestador):

- **QA con la propiedad de prueba** (`[TEST`): correr la migración de caché, abrir el wizard, completar los 6 pasos, publicar, `npx tsx scripts/qa-publish-ml-test.ts verify <id>` para confirmar que el item quedó con título/categoría/fotos/atributos/descripción/video/ubicación correctos, luego `teardown <id>` para cerrarlo, y verificar que la propiedad sigue existiendo. Reportar al usuario.
- **`/code-review`** sobre el diff de la rama.
- **Actualizar `CLAUDE.md`** con la sección del nuevo wizard, el sistema de atributos dinámicos, y la migración del worker a pg_cron.

---

## Self-Review (cobertura del spec)

- §4 Paso 1 Imágenes → Task 13 ✓
- §4 Paso 2 Video/Tour → Task 14 + Task 3 (extractYouTubeId) ✓
- §4 Paso 3 Campos ML dinámicos + geo → Tasks 4, 6, 12, 15 ✓
- §4 Paso 4 Descripción → Task 16 ✓
- §4 Paso 5 Resumen → Task 17 ✓
- §4 Paso 6 Confirmar → Tasks 10, 18 ✓
- §5.2 mapping con opts → Task 5 ✓
- §5.3 rutas (ml-attributes, ml-preview, geocode, cron) → Tasks 6, 7, 8, 9 ✓
- §5.4 tabla caché + draft en metadata → Tasks 2, 7 ✓
- §5.5 deps → Task 1 ✓
- Worker pg_cron → Task 9 ✓
- QA teardown seguro → Task 10 ✓
- Decisión gold_premium default → Task 5 ✓
- Decisión orden de fotos canónico → Task 7 (PATCH escribe properties.photos) ✓

Sin placeholders. Tipos consistentes: `AttributeOverride` definido una sola vez (category-attributes.ts), `MlPayloadOptions`/`propertyToMlPayload` usados igual en Tasks 5/6/7/10, `MlDraft` consistente en Tasks 11/13-20.
