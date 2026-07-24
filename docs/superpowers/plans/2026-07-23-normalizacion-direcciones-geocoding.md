# Normalización de Direcciones + Geocoding con Fallback — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que toda propiedad (importada o nueva) se geolocalice de forma confiable sin bloqueos de config, con un normalizador de direcciones como fuente de verdad, geocoder Google→OSM que nunca bloquea, pin manual siempre disponible, y backfill de las 25 importadas — más fixes de Argenprop CABA, Meta v2 y el popup del listado.

**Architecture:** Dos módulos puros nuevos (`lib/properties/address.ts` para normalizar/parsear y `lib/properties/geocoder.ts` para geocodificar con fallback + scoring de confianza) que consumen el endpoint `/api/geocode`, los wizards de portales, el backfill y el alta de propiedades. Migración aditiva (`province`, `geo_confidence`, `geocoded_at`). Cambios acotados en Argenprop (detección CABA + parseo de calle), Meta v2 (validación temprana + aplicar preset geo) y el popup (fotos `unoptimized` + layout flex).

**Tech Stack:** Next.js 16, React 19, TypeScript 5, Supabase (Postgres + JS client service-role), Vitest (test runner: `npm test` = `vitest run`), Leaflet/OSM (mapa), Google Geocoding API + Nominatim/OSM (geocoders).

## Global Constraints

- **Idioma:** toda la prosa al usuario en español (rioplatense). Código/identificadores en inglés como el resto del repo.
- **Autor de commits:** `Sujupar <redstyle50@gmail.com>` o el deploy de Netlify falla. Usar `git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit ...`.
- **Rama:** `feat/normalizacion-direcciones-geocoding` (ya creada). NO commitear a `main` (auto-deploya en Netlify) hasta verificar.
- **NO publicar nada en vivo** en MercadoLibre ni Argenprop durante las pruebas. El backfill se corre primero en `--dry-run`.
- **Turbopack local roto** por el acento en el path (`Gestión`): NO validar con `next build`/`next dev` (default Turbopack). Usar `npx tsc --noEmit` para typecheck y `next dev --webpack` si hace falta el navegador. Verificado en CLAUDE.md.
- **Tests colocados** `*.test.ts` junto al módulo (patrón existente: `lib/properties/media.test.ts`, `lib/portals/validation.test.ts`). Correr un test puntual: `npm test -- <ruta>`.
- **Migraciones:** el usuario corre SQL en el Dashboard, o se aplican vía session pooler pg (patrón `scripts/apply-*-migration-pg.ts`, `npm i --no-save pg`). La CLI de Supabase NO conecta. El **JS client con service-role SÍ** funciona (lo usa `scripts/backfill-property-geocode.ts`).
- **Scripts Node:** correr con `node --env-file=.env.local --import tsx <script>` (lee `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_GEOCODING_API_KEY` si existe).

## Shared Interfaces (contratos entre tareas)

`lib/properties/address.ts` (Task 2):
```ts
export type ArProvince = string // 'CABA' | 'Buenos Aires' | 'Córdoba' | ...
export interface AddressParts {
  street: string | null
  number: string | null
  neighborhood: string | null
  locality: string | null
  province: ArProvince | null
  isCaba: boolean
}
export function parseAddress(rawAddress: string, hints?: { neighborhood?: string | null; city?: string | null; province?: string | null }): AddressParts
export function buildGeocodeQuery(parts: AddressParts): string
export function normalizeCity(s: string | null | undefined): string | null
export function normalizeNeighborhood(s: string | null | undefined): string | null
export function deriveProvince(input: { address?: string | null; city?: string | null; csvZona?: string | null }): ArProvince | null
export function expandProvince(province: ArProvince | null): string
export function formatDisplayAddress(parts: AddressParts): string
```

`lib/properties/geocoder.ts` (Task 3):
```ts
export type GeoConfidence = 'high' | 'medium' | 'low'
export interface GeocodeExpected { province?: string | null; locality?: string | null; number?: string | null; isCaba?: boolean }
export interface GeocodeResult { lat: number; lng: number; formatted: string; confidence: GeoConfidence; provider: 'google' | 'osm' }
export async function geocodeAddress(query: string, expected?: GeocodeExpected): Promise<GeocodeResult | null>
```

`lib/marketing/geo-targeting-presets.ts` (Task 12, nuevo export):
```ts
export function geoSpecForPreset(property: Property, presetId: GeoPresetId): MetaTargetingSpec
```

DB (Task 1): `properties.province TEXT`, `properties.geo_confidence TEXT` (`'high'|'medium'|'low'|'manual'`), `properties.geocoded_at TIMESTAMPTZ`.

---

## Fase 0 — Migración y tipos

### Task 1: Migración de columnas de geocoding

**Files:**
- Create: `supabase/migrations/20260723000001_property_geocoding.sql`
- Modify: `types/database.types.ts` (bloque `properties` Row L516-563, Insert y Update análogos)

**Interfaces:**
- Produces: columnas `province`, `geo_confidence`, `geocoded_at` en `properties`; el tipo `Property = Database['public']['Tables']['properties']['Row']` (usado por todo el resto) las incluye.

- [ ] **Step 1: Escribir la migración**

Create `supabase/migrations/20260723000001_property_geocoding.sql`:
```sql
-- Geocoding: provincia normalizada + confianza del pin + timestamp de geocodificación.
-- La tabla `properties` fue creada fuera de migraciones; ALTER ADD funciona igual.
ALTER TABLE properties ADD COLUMN IF NOT EXISTS province TEXT;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS geo_confidence TEXT;   -- 'high' | 'medium' | 'low' | 'manual'
ALTER TABLE properties ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ;

COMMENT ON COLUMN properties.province IS 'Provincia/región normalizada: CABA, Buenos Aires, u otra. Fuente de verdad de región para geocoding y portales.';
COMMENT ON COLUMN properties.geo_confidence IS 'Confianza del pin: high|medium|low (geocoder) o manual (confirmado por humano).';
COMMENT ON COLUMN properties.geocoded_at IS 'Cuándo se geocodificó (distingue backfill de pin manual).';
```

- [ ] **Step 2: Aplicar la migración vía session pooler pg**

Create a temporary runner (o reusar el patrón de `scripts/apply-*-migration-pg.ts`). Run:
```bash
npm i --no-save pg
node --env-file=.env.local --import tsx scripts/apply-geocoding-migration-pg.ts
```
donde el script conecta a `aws-0-us-west-2.pooler.supabase.com:5432`, user `postgres.mncsnastmcjdjxrehdep`, password `SUPABASE_DB_PASSWORD`, y ejecuta el SQL del Step 1.

Expected: `ALTER TABLE` ×3 sin error. Verificar: `SELECT column_name FROM information_schema.columns WHERE table_name='properties' AND column_name IN ('province','geo_confidence','geocoded_at');` devuelve 3 filas.

> Si la conexión pg no funciona en el entorno, entregar el SQL al usuario para correrlo en el Dashboard SQL Editor y confirmar contra la API antes de seguir (CLAUDE.md: "verificar siempre contra la API después de una migración manual").

- [ ] **Step 3: Actualizar los tipos generados**

En `types/database.types.ts`, en el bloque `properties` (Row ~L516-563), agregar tras `postal_code: string | null`:
```ts
                    province: string | null
                    geo_confidence: string | null
                    geocoded_at: string | null
```
Repetir en los bloques `Insert` y `Update` de `properties` (mismas 3 líneas, todas opcionales `?: string | null` en Insert/Update).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores nuevos relacionados a `properties`. (Puede haber pre-existentes ajenos; comparar contra baseline `git stash` si hay dudas.)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260723000001_property_geocoding.sql types/database.types.ts scripts/apply-geocoding-migration-pg.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): migración geocoding (province, geo_confidence, geocoded_at)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Fase A — Normalización + geocoding (núcleo)

### Task 2: Módulo `lib/properties/address.ts` (normalizador puro)

**Files:**
- Create: `lib/properties/address.ts`
- Test: `lib/properties/address.test.ts`

**Interfaces:**
- Produces: `parseAddress`, `buildGeocodeQuery`, `normalizeCity`, `normalizeNeighborhood`, `deriveProvince`, `expandProvince`, `formatDisplayAddress`, tipos `AddressParts`/`ArProvince` (ver Shared Interfaces).

- [ ] **Step 1: Escribir los tests fallidos**

Create `lib/properties/address.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  parseAddress, buildGeocodeQuery, normalizeCity, normalizeNeighborhood,
  deriveProvince, expandProvince, formatDisplayAddress,
} from './address'

describe('parseAddress', () => {
  it('parsea CABA con barrio y provincia embebida', () => {
    const p = parseAddress('José Luis Cantilo 4300, Villa Devoto, Capital Federal')
    expect(p.street).toBe('José Luis Cantilo')
    expect(p.number).toBe('4300')
    expect(p.neighborhood).toBe('Villa Devoto')
    expect(p.isCaba).toBe(true)
    expect(p.province).toBe('CABA')
  })

  it('usa los hints por sobre el blob cuando existen', () => {
    const p = parseAddress('Aleu 3500, San Andrés, General San Martín', {
      neighborhood: 'San Andrés', city: 'General San Martín', province: 'GBA Norte',
    })
    expect(p.street).toBe('Aleu')
    expect(p.number).toBe('3500')
    expect(p.locality).toBe('General San Martín')
    expect(p.province).toBe('Buenos Aires')
    expect(p.isCaba).toBe(false)
  })

  it('normaliza mayúsculas de la calle preservándola', () => {
    const p = parseAddress('ALMAFUERTE 2500, General San Martín, GBA Norte')
    expect(p.number).toBe('2500')
    expect(p.street?.toLowerCase()).toContain('almafuerte')
  })

  it('sin altura → number null', () => {
    const p = parseAddress('Lares de Canning, Lares de Canning, Tristán Suárez')
    expect(p.number).toBeNull()
    expect(p.street).toBeTruthy()
  })
})

describe('buildGeocodeQuery', () => {
  it('CABA → barrio + Ciudad Autónoma de Buenos Aires + Argentina, sin duplicar', () => {
    const q = buildGeocodeQuery(parseAddress('José Luis Cantilo 4300, Villa Devoto, Capital Federal'))
    expect(q).toBe('José Luis Cantilo 4300, Villa Devoto, Ciudad Autónoma de Buenos Aires, Argentina')
  })

  it('GBA → partido + Provincia de Buenos Aires + Argentina', () => {
    const q = buildGeocodeQuery(parseAddress('Aleu 3500, San Andrés, General San Martín', {
      neighborhood: 'San Andrés', city: 'General San Martín', province: 'GBA Norte',
    }))
    expect(q).toBe('Aleu 3500, General San Martín, Provincia de Buenos Aires, Argentina')
  })
})

describe('normalizeNeighborhood', () => {
  it('aplica alias Nueva Pompeya → Pompeya', () => {
    expect(normalizeNeighborhood('Nueva Pompeya')).toBe('Pompeya')
  })
  it('title-case', () => {
    expect(normalizeNeighborhood('villa devoto')).toBe('Villa Devoto')
  })
  it('null-safe', () => {
    expect(normalizeNeighborhood('')).toBeNull()
    expect(normalizeNeighborhood(null)).toBeNull()
  })
})

describe('deriveProvince', () => {
  it('CSV Capital Federal → CABA', () => {
    expect(deriveProvince({ csvZona: 'Capital Federal' })).toBe('CABA')
  })
  it('CSV GBA Norte → Buenos Aires', () => {
    expect(deriveProvince({ csvZona: 'GBA Norte' })).toBe('Buenos Aires')
  })
  it('detecta CABA en el texto del address', () => {
    expect(deriveProvince({ address: 'Agüero 950, Palermo, Capital Federal' })).toBe('CABA')
  })
  it('desconocida → null', () => {
    expect(deriveProvince({ address: 'Calle X 100' })).toBeNull()
  })
})

describe('expandProvince', () => {
  it('CABA → Ciudad Autónoma de Buenos Aires', () => {
    expect(expandProvince('CABA')).toBe('Ciudad Autónoma de Buenos Aires')
  })
  it('Buenos Aires → Provincia de Buenos Aires', () => {
    expect(expandProvince('Buenos Aires')).toBe('Provincia de Buenos Aires')
  })
  it('otra provincia se mantiene', () => {
    expect(expandProvince('Córdoba')).toBe('Córdoba')
  })
})

describe('formatDisplayAddress', () => {
  it('arma un string limpio sin duplicar', () => {
    const p = parseAddress('José Luis Cantilo 4300, Villa Devoto, Capital Federal')
    expect(formatDisplayAddress(p)).toBe('José Luis Cantilo 4300, Villa Devoto')
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npm test -- lib/properties/address.test.ts`
Expected: FAIL con "Failed to resolve import './address'" o "is not a function".

- [ ] **Step 3: Implementar el módulo**

Create `lib/properties/address.ts`:
```ts
/**
 * Normalizador de direcciones argentinas. Fuente de verdad para:
 *  - armar una query de geocoding desambiguada (buildGeocodeQuery)
 *  - componentes limpios para portales (parseAddress + formatDisplayAddress)
 *
 * NO reestructura el dato: `properties.address` sigue siendo un blob de texto.
 * Este módulo lo interpreta best-effort.
 */

export type ArProvince = string // 'CABA' | 'Buenos Aires' | 'Córdoba' | ...

export interface AddressParts {
  street: string | null
  number: string | null
  neighborhood: string | null
  locality: string | null
  province: ArProvince | null
  isCaba: boolean
}

const CABA_RE = /caba|capital federal|ciudad aut[oó]noma|c\.?a\.?b\.?a\.?/i

function stripAccentsLower(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b([\p{L}])/gu, m => m.toUpperCase())
}

// Alias de barrios: nombre del CSV/usuario → nombre canónico para geocoding/portales.
const NEIGHBORHOOD_ALIASES: Record<string, string> = {
  'nueva pompeya': 'Pompeya',
}

export function normalizeNeighborhood(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim()
  if (!t) return null
  const alias = NEIGHBORHOOD_ALIASES[stripAccentsLower(t)]
  return alias ?? titleCase(t)
}

export function normalizeCity(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim()
  if (!t) return null
  return titleCase(t)
}

export function deriveProvince(input: { address?: string | null; city?: string | null; csvZona?: string | null }): ArProvince | null {
  const zona = (input.csvZona ?? '').trim()
  if (zona) {
    if (CABA_RE.test(zona)) return 'CABA'
    if (/gba|buenos aires|provincia/i.test(zona)) return 'Buenos Aires'
    return titleCase(zona)
  }
  const hay = `${input.address ?? ''} ${input.city ?? ''}`
  if (CABA_RE.test(hay)) return 'CABA'
  return null
}

export function expandProvince(province: ArProvince | null): string {
  if (!province) return ''
  if (province === 'CABA' || CABA_RE.test(province)) return 'Ciudad Autónoma de Buenos Aires'
  if (stripAccentsLower(province) === 'buenos aires') return 'Provincia de Buenos Aires'
  return province
}

export function parseAddress(
  rawAddress: string,
  hints?: { neighborhood?: string | null; city?: string | null; province?: string | null },
): AddressParts {
  const raw = (rawAddress ?? '').trim()
  const segments = raw.split(',').map(s => s.trim()).filter(Boolean)
  const streetSeg = segments[0] ?? ''
  // La altura es el último número del primer segmento (calle + altura).
  const m = streetSeg.match(/^(.*?)\s+(\d+)\s*$/)
  const street = m ? m[1].trim() : (streetSeg || null)
  const number = m ? m[2] : null

  const neighborhood = normalizeNeighborhood(hints?.neighborhood) ?? normalizeNeighborhood(segments[1])
  const locality = normalizeCity(hints?.city) ?? normalizeCity(segments[2]) ?? neighborhood

  const province =
    (hints?.province ? deriveProvince({ csvZona: hints.province }) : null) ??
    deriveProvince({ address: raw, city: hints?.city })

  const isCaba = province === 'CABA' || CABA_RE.test(raw) || CABA_RE.test(hints?.city ?? '')

  return {
    street,
    number,
    neighborhood,
    locality,
    province: province ?? (isCaba ? 'CABA' : null),
    isCaba,
  }
}

export function buildGeocodeQuery(parts: AddressParts): string {
  const streetLine = [parts.street, parts.number].filter(Boolean).join(' ')
  // CABA: geocodifica mejor con el BARRIO como localidad. GBA: con el partido (locality).
  const locality = parts.isCaba ? (parts.neighborhood ?? parts.locality) : parts.locality
  const prov = expandProvince(parts.province)
  return [streetLine, locality, prov, 'Argentina'].filter(Boolean).join(', ')
}

export function formatDisplayAddress(parts: AddressParts): string {
  const streetLine = [parts.street, parts.number].filter(Boolean).join(' ')
  return [streetLine, parts.neighborhood, parts.locality]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ')
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npm test -- lib/properties/address.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add lib/properties/address.ts lib/properties/address.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): normalizador de direcciones (parse + geocode query + provincia)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Módulo `lib/properties/geocoder.ts` (Google→OSM + confianza)

**Files:**
- Create: `lib/properties/geocoder.ts`
- Test: `lib/properties/geocoder.test.ts`

**Interfaces:**
- Consumes: nada de otras tasks (usa `fetch` + `process.env.GOOGLE_GEOCODING_API_KEY`).
- Produces: `geocodeAddress(query, expected?)`, tipos `GeocodeResult`/`GeocodeExpected`/`GeoConfidence`.

- [ ] **Step 1: Escribir los tests fallidos**

Create `lib/properties/geocoder.test.ts`:
```ts
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { geocodeAddress } from './geocoder'

function mockFetchOnce(json: unknown, ok = true) {
  return vi.fn().mockResolvedValue({ ok, json: async () => json } as Response)
}

const OSM_ROOFTOP = [{
  lat: '-34.6042926', lon: '-58.5129293',
  display_name: '4300, José Luis Cantilo, Villa Devoto, ...',
  class: 'place', type: 'house',
  address: { house_number: '4300', road: 'José Luis Cantilo', suburb: 'Villa Devoto', state: 'Ciudad Autónoma de Buenos Aires' },
}]

const OSM_WRONG_TOWN = [{
  lat: '-34.4482859', lon: '-59.4490401',
  display_name: '11 - Rivadavia, Centro, San Andrés de Giles, ...',
  class: 'highway', type: 'secondary',
  address: { house_number: '11', road: 'Rivadavia', county: 'Partido de San Andrés de Giles', state: 'Buenos Aires' },
}]

beforeEach(() => { delete process.env.GOOGLE_GEOCODING_API_KEY })
afterEach(() => { vi.unstubAllGlobals() })

describe('geocodeAddress (OSM, sin key de Google)', () => {
  it('casa exacta en CABA → high', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(OSM_ROOFTOP))
    const r = await geocodeAddress('José Luis Cantilo 4300, Villa Devoto, Ciudad Autónoma de Buenos Aires, Argentina', { isCaba: true, province: 'CABA', number: '4300', locality: 'Villa Devoto' })
    expect(r).not.toBeNull()
    expect(r!.provider).toBe('osm')
    expect(r!.confidence).toBe('high')
    expect(r!.lat).toBeCloseTo(-34.6042926, 4)
  })

  it('altura equivocada (11 vs 2537) → low', async () => {
    vi.stubGlobal('fetch', mockFetchOnce(OSM_WRONG_TOWN))
    const r = await geocodeAddress('Rivadavia 2537, General San Martín, Provincia de Buenos Aires, Argentina', { isCaba: false, province: 'Buenos Aires', number: '2537', locality: 'General San Martín' })
    expect(r).not.toBeNull()
    expect(r!.confidence).toBe('low')
  })

  it('esperaba CABA pero el resultado es Provincia de Buenos Aires → rechazado (null)', async () => {
    vi.stubGlobal('fetch', mockFetchOnce([{ ...OSM_WRONG_TOWN[0] }]))
    const r = await geocodeAddress('X 100, Y, Ciudad Autónoma de Buenos Aires, Argentina', { isCaba: true, province: 'CABA', number: '100' })
    expect(r).toBeNull()
  })

  it('sin resultado → null', async () => {
    vi.stubGlobal('fetch', mockFetchOnce([]))
    const r = await geocodeAddress('Calle inexistente 999, Nada, Argentina')
    expect(r).toBeNull()
  })
})

describe('geocodeAddress (Google primero cuando hay key)', () => {
  it('ROOFTOP → high y provider google; no llama a OSM', async () => {
    process.env.GOOGLE_GEOCODING_API_KEY = 'test-key'
    const google = {
      status: 'OK',
      results: [{
        geometry: { location: { lat: -34.60, lng: -58.51 }, location_type: 'ROOFTOP' },
        formatted_address: 'José Luis Cantilo 4300, CABA',
        partial_match: false,
        address_components: [{ long_name: 'Ciudad Autónoma de Buenos Aires', short_name: 'CABA', types: ['administrative_area_level_1'] }],
      }],
    }
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => google } as Response)
    vi.stubGlobal('fetch', fetchMock)
    const r = await geocodeAddress('José Luis Cantilo 4300, Villa Devoto, Ciudad Autónoma de Buenos Aires, Argentina', { isCaba: true, province: 'CABA', number: '4300' })
    expect(r!.provider).toBe('google')
    expect(r!.confidence).toBe('high')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Correr los tests para verificar que fallan**

Run: `npm test -- lib/properties/geocoder.test.ts`
Expected: FAIL con "Failed to resolve import './geocoder'".

- [ ] **Step 3: Implementar el módulo**

Create `lib/properties/geocoder.ts`:
```ts
/**
 * Geocoder con fallback: Google Geocoding API si hay GOOGLE_GEOCODING_API_KEY,
 * si no OpenStreetMap/Nominatim (gratis). Nunca lanza por falta de key.
 * Devuelve un `confidence` para que el asesor sepa cuándo verificar el pin.
 *
 * Nota Nominatim: 1 req/s + User-Agent obligatorio. Este módulo geocodifica 1x
 * por acción; el backfill serializa con throttle. NO llamar en loops sin throttle.
 */

export type GeoConfidence = 'high' | 'medium' | 'low'

export interface GeocodeExpected {
  province?: string | null   // 'CABA' | 'Buenos Aires' | ...
  locality?: string | null   // barrio (CABA) o partido/localidad (GBA)
  number?: string | null     // altura esperada
  isCaba?: boolean
}

export interface GeocodeResult {
  lat: number
  lng: number
  formatted: string
  confidence: GeoConfidence
  provider: 'google' | 'osm'
}

const LEVELS: GeoConfidence[] = ['low', 'medium', 'high']
function minConf(a: GeoConfidence, b: GeoConfidence): GeoConfidence {
  return LEVELS[Math.min(LEVELS.indexOf(a), LEVELS.indexOf(b))]
}
function downgrade(c: GeoConfidence): GeoConfidence {
  return LEVELS[Math.max(0, LEVELS.indexOf(c) - 1)]
}
function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}
function expectsProvinceCaba(e?: GeocodeExpected): boolean {
  return !!(e?.isCaba || (e?.province && /caba|capital federal|ciudad aut/i.test(e.province)))
}

// ---------- Google ----------
interface GoogleResult {
  geometry: { location: { lat: number; lng: number }; location_type: string }
  formatted_address: string
  partial_match?: boolean
  address_components: Array<{ long_name: string; short_name: string; types: string[] }>
}

async function geocodeGoogle(query: string, key: string, expected?: GeocodeExpected): Promise<GeocodeResult | null> {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&region=ar&key=${key}`
  const res = await fetch(url)
  const data = (await res.json()) as { status: string; results: GoogleResult[] }
  if (data.status !== 'OK' || !data.results?.[0]) return null
  const r = data.results[0]

  // Guarda de región (hard): rechaza cross-provincia.
  const adminL1 = r.address_components.find(c => c.types.includes('administrative_area_level_1'))
  const isResultCaba = !!adminL1 && /ciudad aut|caba|capital federal/i.test(`${adminL1.long_name} ${adminL1.short_name}`)
  if (expectsProvinceCaba(expected) && !isResultCaba) return null
  if (expected?.province && !expectsProvinceCaba(expected) && adminL1) {
    // provincia esperada no-CABA (ej. Buenos Aires) y el resultado no la contiene → rechazar
    if (norm(adminL1.long_name).indexOf(norm(expected.province)) === -1) return null
  }

  // Confianza base por location_type.
  let conf: GeoConfidence =
    r.geometry.location_type === 'ROOFTOP' ? 'high'
    : r.geometry.location_type === 'RANGE_INTERPOLATED' ? 'medium'
    : 'low'
  if (r.partial_match) conf = downgrade(conf)

  // Chequeo de altura: si Google devolvió street_number distinto, baja a low.
  if (expected?.number) {
    const sn = r.address_components.find(c => c.types.includes('street_number'))
    if (sn && norm(sn.long_name) !== norm(expected.number)) conf = 'low'
  }

  return { lat: r.geometry.location.lat, lng: r.geometry.location.lng, formatted: r.formatted_address, confidence: conf, provider: 'google' }
}

// ---------- OSM / Nominatim ----------
interface OsmResult {
  lat: string
  lon: string
  display_name: string
  class?: string
  type?: string
  address?: Record<string, string>
}

async function geocodeOsm(query: string, expected?: GeocodeExpected): Promise<GeocodeResult | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=ar&limit=1&q=${encodeURIComponent(query)}`
  const res = await fetch(url, { headers: { 'User-Agent': 'DiegoFerreyraInmobiliaria/1.0 (contacto@inmodf.com.ar)' } })
  const data = (await res.json()) as OsmResult[]
  const r = data?.[0]
  if (!r) return null

  const addr = r.address ?? {}
  const state = norm(addr.state ?? '')
  const resultIsCaba = /ciudad autonoma|capital federal/.test(state)

  // Guarda de región (hard).
  if (expectsProvinceCaba(expected) && !resultIsCaba) return null
  if (expected?.province && !expectsProvinceCaba(expected)) {
    // Provincia esperada no-CABA (ej. Buenos Aires): el state debe contenerla y NO ser CABA.
    if (resultIsCaba || (state && state.indexOf(norm(expected.province)) === -1)) return null
  }

  // Confianza base por class/type.
  let conf: GeoConfidence =
    (r.class === 'place' && r.type === 'house') || r.type === 'building' ? 'high'
    : (r.class === 'highway' || r.type === 'residential' || r.type === 'road') ? 'medium'
    : 'low'

  // Chequeo de altura (señal principal de mal-match: 11 vs 2537, 69 vs 3500).
  if (expected?.number) {
    if (addr.house_number && norm(addr.house_number) !== norm(expected.number)) conf = 'low'
    else if (!addr.house_number) conf = minConf(conf, 'medium')
  }

  // Chequeo de localidad (soft): si no aparece por ningún lado, baja un nivel.
  if (expected?.locality) {
    const hay = norm([addr.suburb, addr.city_district, addr.city, addr.town, addr.village, addr.county, addr.municipality, addr.state].filter(Boolean).join(' '))
    if (hay && hay.indexOf(norm(expected.locality)) === -1) conf = downgrade(conf)
  }

  return { lat: Number(r.lat), lng: Number(r.lon), formatted: r.display_name, confidence: conf, provider: 'osm' }
}

export async function geocodeAddress(query: string, expected?: GeocodeExpected): Promise<GeocodeResult | null> {
  const key = process.env.GOOGLE_GEOCODING_API_KEY
  if (key) {
    try {
      const g = await geocodeGoogle(query, key, expected)
      if (g) return g
    } catch { /* cae a OSM */ }
  }
  try {
    return await geocodeOsm(query, expected)
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

Run: `npm test -- lib/properties/geocoder.test.ts`
Expected: PASS (todos). Si el test "esperaba CABA pero resultado BA → null" falla, revisar la guarda `expectsProvinceCaba` + `resultIsCaba`.

- [ ] **Step 5: Commit**

```bash
git add lib/properties/geocoder.ts lib/properties/geocoder.test.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): geocoder Google→OSM con scoring de confianza y guarda de región

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Refactor `/api/geocode` — usa el geocoder con fallback

**Files:**
- Modify: `app/api/geocode/route.ts` (reemplazo completo del handler)

**Interfaces:**
- Consumes: `geocodeAddress` (Task 3).
- Produces: `POST /api/geocode` acepta `{ address, expected? }` y devuelve `{ lat, lng, formatted, confidence, provider }`. Ya NO devuelve 412 por falta de key.

- [ ] **Step 1: Reemplazar el handler**

Replace `app/api/geocode/route.ts` completo con:
```ts
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { geocodeAddress, type GeocodeExpected } from '@/lib/properties/geocoder'

/** POST { address, expected? } -> { lat, lng, formatted, confidence, provider }. Google→OSM. */
export async function POST(req: Request) {
  try {
    await requireAuth()
    const { address, expected } = (await req.json()) as { address?: string; expected?: GeocodeExpected }
    if (!address || address.trim().length < 4) {
      return NextResponse.json({ error: 'address requerido' }, { status: 400 })
    }
    const r = await geocodeAddress(address, expected)
    if (!r) {
      return NextResponse.json({ error: 'No se pudo geolocalizar la dirección. Colocá el pin a mano en el mapa.' }, { status: 422 })
    }
    return NextResponse.json(r)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores en `app/api/geocode/route.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/api/geocode/route.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(geocode): endpoint usa geocoder con fallback OSM (elimina el 412 duro)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Wizards — query normalizada + persistir dirección y confianza

**Files:**
- Modify: `components/properties/wizards/ml/steps/StepFields.tsx` (función `geocode`, L95-115; tipo `draft`/`onChange` para confidence)
- Modify: `components/properties/wizards/ap/steps/StepFields.tsx` (idéntico)
- Modify: `components/properties/wizards/ml/types.ts` (agregar `geoConfidence` a `MlDraft`; `address`, `province` a `MlPreviewProperty` si faltan)
- Modify: `components/properties/wizards/ml/useMlPublishDraft.ts` (mandar `address`, `geoConfidence` en `save()`)
- Modify: `app/api/properties/[id]/ml-preview/route.ts` (PATCH acepta `address`, `geoConfidence`)
- Modify: `app/api/properties/[id]/ap-preview/route.ts` (PATCH acepta `address`, `geoConfidence`)

**Interfaces:**
- Consumes: `parseAddress`, `buildGeocodeQuery` (Task 2). Endpoint `/api/geocode` con `expected` (Task 4).
- Produces: al geocodificar, el wizard arma la query normalizada y persiste `properties.address` (si el asesor la editó), `latitude`, `longitude`, `geo_confidence`.

- [ ] **Step 1: `ml-preview` PATCH acepta `address` y `geoConfidence`**

En `app/api/properties/[id]/ml-preview/route.ts`, en el tipo del `body` (L154-166) agregar:
```ts
      address?: string
      geoConfidence?: 'high' | 'medium' | 'low' | 'manual'
```
y en la sección "1) Campos de la propiedad" (tras L187, después de longitude) agregar:
```ts
    if (typeof body.address === 'string' && body.address.trim().length >= 4) update.address = body.address.trim().slice(0, 300)
    if (typeof body.geoConfidence === 'string') { update.geo_confidence = body.geoConfidence; update.geocoded_at = new Date().toISOString() }
```

- [ ] **Step 2: `ap-preview` PATCH — mismo cambio**

En `app/api/properties/[id]/ap-preview/route.ts`, en el tipo del `body` (L74-79) agregar las mismas 2 líneas (`address?`, `geoConfidence?`), y tras L105 (después de longitude) agregar el mismo bloque de `update.address` / `update.geo_confidence`/`geocoded_at` del Step 1.

- [ ] **Step 3: Agregar `address` + `geoConfidence` al draft (types + hook)**

En `components/properties/wizards/ml/types.ts`, en la interface `MlDraft` agregar:
```ts
  address?: string
  geoConfidence?: 'high' | 'medium' | 'low' | 'manual'
```
En `MlPreviewProperty` confirmar que existe `address: string` y agregar `province?: string | null` si falta.

En `components/properties/wizards/ml/useMlPublishDraft.ts`:
- En el `setDraft({...})` (L35-47) agregar `address: prev.property.address,` y `geoConfidence: undefined,`.
- En el body del `save()` PATCH (L67-79) agregar `address: draft.address,` y `geoConfidence: draft.geoConfidence,`. (El endpoint ya acepta ambos por el Step 1.)

> Nota: para el AP existe el hook equivalente (buscar `useApPublishDraft.ts` en `components/properties/wizards/ap/`). Aplicar el mismo cambio de `address` + `geoConfidence` ahí. Confirmá el nombre real del hook antes de editar.

- [ ] **Step 4: `geocode()` usa la query normalizada + guarda confianza (ML)**

En `components/properties/wizards/ml/steps/StepFields.tsx`, reemplazar la función `geocode` (L95-115) por:
```tsx
  async function geocode() {
    setGeocoding(true)
    try {
      const parts = parseAddress(draft.address ?? property.address, {
        neighborhood: property.neighborhood,
        city: property.city,
        province: property.province ?? null,
      })
      const addressQuery = buildGeocodeQuery(parts)
      const r = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          address: addressQuery,
          expected: { province: parts.province, locality: parts.isCaba ? parts.neighborhood : parts.locality, number: parts.number, isCaba: parts.isCaba },
        }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      onChange({ latitude: j.lat, longitude: j.lng, geoConfidence: j.confidence })
      const msg = j.confidence === 'high'
        ? 'Ubicación encontrada — verificá el pin.'
        : 'Ubicación aproximada (baja confianza). Ajustá el pin a la ubicación exacta.'
      toast[j.confidence === 'high' ? 'success' : 'warning'](msg)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error')
    } finally {
      setGeocoding(false)
    }
  }
```
Y agregar el import al tope del archivo:
```tsx
import { parseAddress, buildGeocodeQuery } from '@/lib/properties/address'
```

- [ ] **Step 5: `geocode()` — mismo cambio en AP**

Aplicar el reemplazo idéntico del Step 4 en `components/properties/wizards/ap/steps/StepFields.tsx` (misma función `geocode`, mismo import). El resto del archivo es equivalente.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores en los archivos tocados. Si `property.province` no existe en `MlPreviewProperty`/`ApPreviewProperty`, agregarlo (Step 3).

- [ ] **Step 7: Commit**

```bash
git add components/properties/wizards app/api/properties/[id]/ml-preview/route.ts app/api/properties/[id]/ap-preview/route.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(wizards): geocode con query normalizada + persiste dirección y confianza

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: `GeoPinMap` siempre visible + dirección editable + badge de confianza

**Files:**
- Modify: `components/properties/wizards/ml/GeoPinMap.tsx` (acepta lat/lng nullable + defaultCenter; drop de pin por click)
- Modify: `components/properties/wizards/ap/GeoPinMap.tsx` (idéntico)
- Modify: `components/properties/wizards/ml/steps/StepFields.tsx` (sección Ubicación: mapa siempre, input dirección editable, badge)
- Modify: `components/properties/wizards/ap/steps/StepFields.tsx` (idéntico)
- Modify: `lib/marketing/neighborhood-data.ts` — solo si NO exporta ya un lookup de centroide; si `findNeighborhood(name)` existe (lo usa geo-targeting-presets), reusarlo.

**Interfaces:**
- Consumes: `findNeighborhood` de `lib/marketing/neighborhood-data.ts` (ya existe) para el centro por barrio.
- Produces: `GeoPinMap` con props `{ lat: number | null; lng: number | null; defaultCenter: [number, number]; onChange }`.

- [ ] **Step 1: `GeoPinMap` acepta lat/lng nullable + click para soltar el pin (ML)**

Reemplazar `components/properties/wizards/ml/GeoPinMap.tsx` por:
```tsx
'use client'
import { useEffect, useRef } from 'react'
import 'leaflet/dist/leaflet.css'
import type { Map as LeafletMap, Marker } from 'leaflet'

interface Props {
  lat: number | null
  lng: number | null
  defaultCenter: [number, number]
  onChange: (lat: number, lng: number) => void
}

/** Mini-mapa OSM con pin arrastrable. Se muestra SIEMPRE: si no hay lat/lng,
 *  centra en defaultCenter y el asesor coloca el pin con un click o arrastrándolo. */
export function GeoPinMap({ lat, lng, defaultCenter, onChange }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const markerRef = useRef<Marker | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const L = (await import('leaflet')).default
      if (cancelled || !ref.current || mapRef.current) return
      const hasPin = lat != null && lng != null
      const center: [number, number] = hasPin ? [lat!, lng!] : defaultCenter
      const map = L.map(ref.current).setView(center, hasPin ? 16 : 14)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap', maxZoom: 19,
      }).addTo(map)
      const icon = L.icon({
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
        iconSize: [25, 41], iconAnchor: [12, 41],
      })
      if (hasPin) {
        const marker = L.marker([lat!, lng!], { draggable: true, icon }).addTo(map)
        marker.on('dragend', () => { const p = marker.getLatLng(); onChangeRef.current(p.lat, p.lng) })
        markerRef.current = marker
      }
      // Click en el mapa: coloca/mueve el pin (clave cuando el geocode falló).
      map.on('click', (e: { latlng: { lat: number; lng: number } }) => {
        const { lat: la, lng: ln } = e.latlng
        if (!markerRef.current) {
          const marker = L.marker([la, ln], { draggable: true, icon }).addTo(map)
          marker.on('dragend', () => { const p = marker.getLatLng(); onChangeRef.current(p.lat, p.lng) })
          markerRef.current = marker
        } else {
          markerRef.current.setLatLng([la, ln])
        }
        onChangeRef.current(la, ln)
      })
      mapRef.current = map
    })()
    return () => {
      cancelled = true
      mapRef.current?.remove()
      mapRef.current = null
      markerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Sincroniza el pin si lat/lng cambian desde afuera (ej. geocoding).
  useEffect(() => {
    const map = mapRef.current
    if (!map || lat == null || lng == null) return
    if (!markerRef.current) return // se creará por click/drag; evitamos duplicar en el mount
    const cur = markerRef.current.getLatLng()
    if (Math.abs(cur.lat - lat) < 1e-7 && Math.abs(cur.lng - lng) < 1e-7) return
    markerRef.current.setLatLng([lat, lng])
    map.setView([lat, lng], 16)
  }, [lat, lng])

  return <div ref={ref} className="h-56 w-full rounded-lg border z-0" />
}
```

- [ ] **Step 2: `GeoPinMap` AP — mismo reemplazo**

Aplicar el contenido idéntico del Step 1 a `components/properties/wizards/ap/GeoPinMap.tsx`.

- [ ] **Step 3: Sección Ubicación siempre visible + dirección editable + badge (ML)**

En `components/properties/wizards/ml/steps/StepFields.tsx`, reemplazar la `<section>` de Ubicación (L174-186) por:
```tsx
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Ubicación</p>
          <button type="button" onClick={geocode} disabled={geocoding} className="text-xs underline text-[color:var(--brand)]">
            {geocoding ? 'Buscando…' : 'Geocodificar dirección'}
          </button>
        </div>
        <input
          value={draft.address ?? property.address}
          onChange={e => onChange({ address: e.target.value })}
          placeholder="Calle y altura, barrio, ciudad"
          className="w-full rounded-md border border-input px-3 py-2 text-sm"
        />
        {!geoOk && (
          <p className="text-sm text-amber-600">Sin ubicación confirmada. Geocodificá o colocá el pin en el mapa (click) y confirmá.</p>
        )}
        {geoOk && draft.geoConfidence && draft.geoConfidence !== 'high' && draft.geoConfidence !== 'manual' && (
          <p className="text-sm text-amber-600">Ubicación aproximada (confianza {draft.geoConfidence}). Verificá y ajustá el pin.</p>
        )}
        <GeoPinMap
          lat={draft.latitude ?? null}
          lng={draft.longitude ?? null}
          defaultCenter={geoDefaultCenter(property.neighborhood)}
          onChange={(lat, lng) => onChange({ latitude: lat, longitude: lng, geoConfidence: 'manual' })}
        />
      </section>
```
Agregar el helper arriba (fuera del componente) y el import:
```tsx
import { findNeighborhood } from '@/lib/marketing/neighborhood-data'
// ...
function geoDefaultCenter(neighborhood: string): [number, number] {
  const n = findNeighborhood(neighborhood)
  return n ? [n.lat, n.lng] : [-34.6037, -58.3816] // fallback: Obelisco / CABA
}
```
(El binding de `draft.address` en el hook + endpoint ya se agregó en Task 5 Step 1/3, así que la dirección editada persiste al guardar el draft.)

- [ ] **Step 4: Sección Ubicación AP — mismo cambio**

Aplicar el reemplazo del Step 3 en `components/properties/wizards/ap/steps/StepFields.tsx` (mismo JSX, helper e imports; el hook AP equivalente persiste `address`).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores. Confirmar que `findNeighborhood` devuelve `{ lat, lng }` (lo usa `geo-targeting-presets.ts`; si el shape difiere, ajustar `geoDefaultCenter`).

- [ ] **Step 6: Verificación visual (opcional, si hay navegador)**

Run: `npx next dev --webpack` y abrir el wizard de una propiedad importada (sin lat/lng). Confirmar: el mapa aparece de entrada centrado en el barrio; un click coloca el pin; "Geocodificar" mueve el pin con toast de confianza; el input de dirección es editable.

- [ ] **Step 7: Commit**

```bash
git add components/properties/wizards
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(wizards): GeoPinMap siempre visible (click para pin) + dirección editable + badge de confianza

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: ML `buildLocation` usa `province`

**Files:**
- Modify: `lib/portals/mercadolibre/mapping.ts` (`buildLocation`, L153-173)

**Interfaces:**
- Consumes: `property.province` (Task 1).

- [ ] **Step 1: Usar province para state, con fallback a la heurística actual**

En `lib/portals/mercadolibre/mapping.ts`, reemplazar el cuerpo de `buildLocation` (L153-173) por:
```ts
function buildLocation(property: Property) {
  const cityRaw = (property.city ?? '').trim()
  const prov = (property.province ?? '').trim()
  const isCaba =
    /^caba$/i.test(prov) || /capital federal|ciudad aut[oó]noma/i.test(prov) ||
    (!prov && (!cityRaw || /^caba$/i.test(cityRaw) || /capital federal/i.test(cityRaw) || /ciudad aut[oó]noma/i.test(cityRaw)))

  // state: CABA → "Capital Federal"; si hay province explícita usarla; si no, heurística "Buenos Aires".
  const stateName = isCaba ? 'Capital Federal' : (prov && !/buenos aires/i.test(prov) ? prov : 'Buenos Aires')
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores en `mapping.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/portals/mercadolibre/mapping.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(ml): buildLocation usa properties.province para el state

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Script de backfill de las 25 (dry-run + commit)

**Files:**
- Create: `scripts/backfill-address-geocode.ts`
- Read (referencia): `scripts/data/precaptadas.csv` (recuperar `Zona/Provincia`), `scripts/import-precaptadas.ts` (parser CSV a reusar el criterio)

**Interfaces:**
- Consumes: `parseAddress`/`buildGeocodeQuery` (Task 2), `geocodeAddress` (Task 3).

- [ ] **Step 1: Escribir el script**

Create `scripts/backfill-address-geocode.ts`:
```ts
/**
 * Backfill de latitude/longitude/province/geo_confidence para propiedades sin geo.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/backfill-address-geocode.ts          # DRY-RUN (default)
 *   node --env-file=.env.local --import tsx scripts/backfill-address-geocode.ts --commit  # escribe
 *
 * - Solo toca filas con latitude IS NULL (nunca pisa un pin existente/manual).
 * - Recupera Zona/Provincia del CSV (col 13) para las importadas (match import_external_id).
 * - Geocodifica Google→OSM (usa GOOGLE_GEOCODING_API_KEY si está). Throttle 1.1s (Nominatim).
 * - Lista al final las de baja confianza para revisión manual.
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '../types/database.types'
import { parseAddress, buildGeocodeQuery, deriveProvince } from '../lib/properties/address'
import { geocodeAddress } from '../lib/properties/geocoder'

const COMMIT = process.argv.includes('--commit')

// Mapa import_external_id (ID Zonaprop) -> Zona/Provincia (col 13 del CSV).
function loadCsvZonaMap(): Map<string, string> {
  const map = new Map<string, string>()
  try {
    const text = readFileSync(new URL('./data/precaptadas.csv', import.meta.url), 'utf8')
    const rows = text.split(/\r?\n/)
    for (const line of rows.slice(1)) {
      if (!line.trim()) continue
      // Parser tolerante: col 2 = ID Zonaprop, col 13 = Zona/Provincia. Reusa el mismo
      // criterio de comillas que scripts/import-precaptadas.ts (split respetando "").
      const cells = splitCsvLine(line)
      const id = (cells[1] ?? '').trim()
      const zona = (cells[12] ?? '').trim()
      if (id) map.set(id, zona)
    }
  } catch (e) {
    console.warn('No se pudo leer precaptadas.csv (se deriva provincia del texto):', (e as Error).message)
  }
  return map
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++ } else inQ = !inQ }
    else if (c === ',' && !inQ) { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

async function main() {
  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const zonaMap = loadCsvZonaMap()

  const { data: properties, error } = await supabase
    .from('properties')
    .select('id, address, neighborhood, city, province, import_external_id')
    .is('latitude', null)
  if (error) { console.error('fetch error:', error.message); process.exit(1) }
  if (!properties?.length) { console.log('Nada para backfillear.'); return }

  console.log(`${COMMIT ? 'COMMIT' : 'DRY-RUN'} — ${properties.length} propiedades sin geo\n`)
  const buckets = { high: 0, medium: 0, low: 0, miss: 0 }
  const lows: string[] = []

  for (const p of properties) {
    const csvZona = p.import_external_id ? zonaMap.get(p.import_external_id) : undefined
    const province = p.province ?? deriveProvince({ address: p.address, city: p.city, csvZona }) ?? null
    const parts = parseAddress(p.address, { neighborhood: p.neighborhood, city: p.city, province })
    const query = buildGeocodeQuery(parts)
    const r = await geocodeAddress(query, {
      province: parts.province, locality: parts.isCaba ? parts.neighborhood : parts.locality,
      number: parts.number, isCaba: parts.isCaba,
    })
    await new Promise(res => setTimeout(res, 1100)) // throttle Nominatim

    if (!r) { buckets.miss++; console.log(`✗ MISS  ${p.id}  «${query}»`); continue }
    buckets[r.confidence]++
    if (r.confidence === 'low') lows.push(`${p.id}  «${query}»  → ${r.formatted}`)
    console.log(`${r.confidence === 'high' ? '✓' : '~'} ${r.confidence.padEnd(6)} ${r.provider.padEnd(6)} ${p.id}  ${r.lat.toFixed(5)},${r.lng.toFixed(5)}  «${query}»`)

    if (COMMIT) {
      const { error: uErr } = await supabase.from('properties').update({
        latitude: r.lat, longitude: r.lng, province: parts.province,
        geo_confidence: r.confidence, geocoded_at: new Date().toISOString(),
      }).eq('id', p.id).is('latitude', null) // guard: no pisar si alguien la geocodificó mientras tanto
      if (uErr) console.error(`  update error ${p.id}:`, uErr.message)
    }
  }

  console.log(`\nResumen: high=${buckets.high} medium=${buckets.medium} low=${buckets.low} miss=${buckets.miss}`)
  if (lows.length) {
    console.log(`\n⚠ Baja confianza (revisar el pin a mano en el wizard):`)
    for (const l of lows) console.log('  ' + l)
  }
  if (!COMMIT) console.log('\n(DRY-RUN — nada se escribió. Re-correr con --commit tras revisar.)')
}

main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Correr el DRY-RUN sobre las 25 reales**

Run: `node --env-file=.env.local --import tsx scripts/backfill-address-geocode.ts`
Expected: imprime una línea por propiedad con confianza + provider + query, y un resumen `high/medium/low/miss`. **Esta es la "prueba de que lee la dirección" que pidió el usuario.** NO escribe nada.

**Reportar al usuario** el desglose y las de baja confianza. Esperar su OK antes del `--commit`.

- [ ] **Step 3: Commit del script (no del backfill de datos)**

```bash
git add scripts/backfill-address-geocode.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(scripts): backfill de geocoding con dry-run + confianza + provincia del CSV

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

> El `--commit` real se corre en la Fase de deploy, tras revisar el dry-run con el usuario. No es un paso de código.

---

### Task 9: Geocode best-effort al crear propiedad

**Files:**
- Create: `lib/properties/geocode-on-write.ts`
- Modify: `app/api/properties/route.ts` (POST, tras `createProperty`)

**Interfaces:**
- Consumes: `parseAddress`/`buildGeocodeQuery` (Task 2), `geocodeAddress` (Task 3).
- Produces: `geocodePropertyBestEffort(propertyId): Promise<void>` que nunca lanza.

- [ ] **Step 1: Helper best-effort**

Create `lib/properties/geocode-on-write.ts`:
```ts
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { parseAddress, buildGeocodeQuery, deriveProvince } from './address'
import { geocodeAddress } from './geocoder'

/**
 * Geocodifica una propiedad recién creada/editada de forma best-effort.
 * Solo setea lat/lng si están en null (no pisa un pin existente). NUNCA lanza.
 */
export async function geocodePropertyBestEffort(propertyId: string): Promise<void> {
  try {
    const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: p } = await supabase
      .from('properties')
      .select('id, address, neighborhood, city, province, latitude, longitude')
      .eq('id', propertyId).single()
    if (!p || !p.address || p.latitude != null) return
    const province = p.province ?? deriveProvince({ address: p.address, city: p.city }) ?? null
    const parts = parseAddress(p.address, { neighborhood: p.neighborhood, city: p.city, province })
    const r = await geocodeAddress(buildGeocodeQuery(parts), {
      province: parts.province, locality: parts.isCaba ? parts.neighborhood : parts.locality,
      number: parts.number, isCaba: parts.isCaba,
    })
    if (!r) return
    await supabase.from('properties').update({
      latitude: r.lat, longitude: r.lng, province: parts.province,
      geo_confidence: r.confidence, geocoded_at: new Date().toISOString(),
    }).eq('id', propertyId).is('latitude', null)
  } catch (err) {
    console.warn('[geocode-on-write] best-effort falló (continuando):', err)
  }
}
```

- [ ] **Step 2: Llamarlo en el POST (no bloquea el alta)**

En `app/api/properties/route.ts`, importar arriba:
```ts
import { geocodePropertyBestEffort } from '@/lib/properties/geocode-on-write'
```
y tras `const id = await createProperty(payload)` (L38), antes de la notificación, agregar:
```ts
    await geocodePropertyBestEffort(id) // best-effort, nunca lanza
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add lib/properties/geocode-on-write.ts app/api/properties/route.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(properties): geocode best-effort al crear (detecta direcciones malas temprano)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Fase B — Argenprop publica CABA importadas

### Task 10: Argenprop — detección CABA por barrio/provincia + parseo de calle + validación temprana

**Files:**
- Modify: `lib/portals/argenprop/mapping.ts` (`parseCalle`, L47-51)
- Modify: `lib/portals/argenprop/adapter.ts` (`resolveLocalizacion`, L41-59)
- Modify: `app/api/properties/[id]/ap-preview/route.ts` (`validateForArgenprop`, L23-36 — detección temprana)
- Test: `lib/portals/argenprop/mapping.test.ts` (nuevo, para `parseCalle`)

**Interfaces:**
- Consumes: `parseAddress` (Task 2), `resolveCabaBarrioId` (existente), `property.province` (Task 1).

- [ ] **Step 1: Test de `parseCalle` reforzado**

Create `lib/portals/argenprop/mapping.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseCalleFromAddress } from './mapping'

describe('parseCalleFromAddress', () => {
  it('extrae calle + altura de un blob con sufijo barrio/ciudad', () => {
    expect(parseCalleFromAddress('José Luis Cantilo 4300, Villa Devoto, Capital Federal'))
      .toEqual({ Nombre: 'José Luis Cantilo', Numero: '4300' })
  })
  it('formato simple "Calle 1234"', () => {
    expect(parseCalleFromAddress('Av. Cabildo 1234')).toEqual({ Nombre: 'Av. Cabildo', Numero: '1234' })
  })
  it('sin altura → S/N', () => {
    expect(parseCalleFromAddress('Lares de Canning, Lares de Canning, Tristán Suárez').Numero).toBe('S/N')
  })
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `npm test -- lib/portals/argenprop/mapping.test.ts`
Expected: FAIL con "parseCalleFromAddress is not a function".

- [ ] **Step 3: Reforzar `parseCalle` (exportado) usando el normalizador**

En `lib/portals/argenprop/mapping.ts`:
- Agregar import: `import { parseAddress } from '@/lib/properties/address'`
- Reemplazar `parseCalle` (L47-51) por una versión exportada que usa `parseAddress`:
```ts
/** Separa "José Luis Cantilo 4300, Villa Devoto, ..." → { Nombre, Numero }. */
export function parseCalleFromAddress(address: string): { Nombre: string; Numero: string } {
  const parts = parseAddress(address)
  if (parts.street && parts.number) return { Nombre: parts.street, Numero: parts.number }
  return { Nombre: (parts.street ?? address.trim()), Numero: 'S/N' }
}
```
- En `propertyToAvisoDto` (L98) cambiar `Calle: parseCalle(property.address),` por `Calle: parseCalleFromAddress(property.address),`.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- lib/portals/argenprop/mapping.test.ts`
Expected: PASS.

- [ ] **Step 5: `resolveLocalizacion` detecta CABA por barrio o provincia**

En `lib/portals/argenprop/adapter.ts`, reemplazar `resolveLocalizacion` (L41-59) por:
```ts
  /** Resuelve localidad + barrio. CABA se detecta por province, por city, o porque el
   *  barrio resuelve en el catálogo de CABA (aunque `city` traiga el barrio). */
  private async resolveLocalizacion(property: Property): Promise<{ localidadId: string; barrioId: string | null }> {
    const creds = this.requireCreds()
    const prov = (property.province ?? '').trim()
    const cityRaw = (property.city ?? '').trim()
    const looksCaba = /caba|capital federal|ciudad aut[oó]noma/i.test(`${prov} ${cityRaw}`)
    // Intento de resolver el barrio en el catálogo CABA (cubre el caso city=barrio).
    const barrioId = await resolveCabaBarrioId(creds, property.neighborhood)
    const isCaba = prov === 'CABA' || looksCaba || !!barrioId
    if (!isCaba) {
      throw new PortalAdapterError(
        `Por ahora la publicación en Argenprop soporta solo CABA (recibido: provincia "${prov || '—'}", ciudad "${cityRaw || '—'}").`,
        'argenprop', 'validation', false,
      )
    }
    if (!barrioId) {
      throw new PortalAdapterError(
        `No se pudo resolver el barrio "${property.neighborhood}" en el catálogo de Argenprop (CABA). Revisá el barrio de la propiedad.`,
        'argenprop', 'validation', false,
      )
    }
    return { localidadId: CABA_LOCALIDAD_ID, barrioId }
  }
```

- [ ] **Step 6: Detección temprana en `validateForArgenprop` (evita el 502 tardío)**

En `app/api/properties/[id]/ap-preview/route.ts`, `validateForArgenprop` (L23-36): agregar un chequeo de región que corre en la validación del wizard. Como `resolveCabaBarrioId` es async (pega al catálogo) y `validateForArgenprop` es sync, usar una heurística barata sin red: marcar warning (no error bloqueante) cuando NO parece CABA, para avisar temprano. Reemplazar el cuerpo por:
```ts
function validateForArgenprop(property: PropertyRow, meta: Record<string, unknown>) {
  const validation = validateCommon(property)
  const schema = getApSchema(property)
  const prefill = { ...derivedPrefill(property), ...((meta.ap_attributes ?? {}) as Record<string, AttributeOverride>) }
  for (const f of schema.required) {
    const v = prefill[f.id]
    if (!v || (!v.value_id && !v.value_name)) {
      validation.errors.push(`Falta campo obligatorio de Argenprop: ${f.name}`)
      validation.ok = false
    }
  }
  // Aviso temprano: Argenprop hoy solo publica CABA. Heurística sin red (el gate real
  // con catálogo corre en adapter.resolveLocalizacion al publicar).
  const prov = (property.province ?? '').trim()
  const city = (property.city ?? '').trim()
  const looksCaba = /caba|capital federal|ciudad aut[oó]noma/i.test(`${prov} ${city}`)
  if (prov && prov !== 'CABA' && !looksCaba) {
    validation.warnings.push('Argenprop hoy solo publica propiedades de CABA — esta parece de otra provincia. Verificá barrio/provincia antes de publicar.')
  }
  return validation
}
```

- [ ] **Step 7: Typecheck + tests de portales**

Run: `npx tsc --noEmit -p tsconfig.json && npm test -- lib/portals`
Expected: typecheck sin errores; tests de `lib/portals` en verde (incluye el nuevo `mapping.test.ts` y el existente `validation.test.ts`).

- [ ] **Step 8: Commit**

```bash
git add lib/portals/argenprop app/api/properties/[id]/ap-preview/route.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(argenprop): detecta CABA por barrio/provincia + parseo de calle robusto + aviso temprano GBA

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Fase C — Meta Ads v2 (ubicación)

### Task 11: Meta v2 — validar lat/lng al inicio (antes de gastar en Gemini)

**Files:**
- Modify: `app/api/properties/[id]/meta-launch-v2/start/route.ts` (tras el gate de `public_slug`, L66-71)

**Interfaces:**
- Consumes: `property.latitude`/`longitude`.

- [ ] **Step 1: Agregar el gate de geolocalización**

En `app/api/properties/[id]/meta-launch-v2/start/route.ts`, después del bloque `if (!property.public_slug) { ... }` (L66-71) agregar:
```ts
    if (property.latitude == null || property.longitude == null) {
      return NextResponse.json(
        { error: 'Falta geolocalización (lat/lng). Confirmá el pin en el wizard de publicación antes de lanzar Meta.' },
        { status: 412 },
      )
    }
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add app/api/properties/[id]/meta-launch-v2/start/route.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "fix(meta-v2): validar lat/lng al iniciar (no gastar en Gemini si falta ubicación)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Meta v2 — aplicar el preset geográfico elegido

**Files:**
- Modify: `lib/marketing/geo-targeting-presets.ts` (extraer `customLocationsForPreset` + agregar `geoSpecForPreset`)
- Modify: `app/api/properties/[id]/meta-launch-v2/[jobId]/confirm/route.ts` (pasar `targetingOverride` al builder)
- Test: `lib/marketing/geo-targeting-presets.test.ts` (nuevo)

**Interfaces:**
- Consumes: `job.geo_preset_id`, `property.latitude/longitude`.
- Produces: `geoSpecForPreset(property, presetId): MetaTargetingSpec`, consumido por el builder vía `overrides.targetingOverride` (`CampaignOverrides.targetingOverride`, ya existe en `meta-campaign-builder.ts:311`).

- [ ] **Step 1: Test de `geoSpecForPreset`**

Create `lib/marketing/geo-targeting-presets.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { geoSpecForPreset } from './geo-targeting-presets'

const prop = { latitude: -34.60, longitude: -58.42, neighborhood: 'Caballito' } as never

describe('geoSpecForPreset', () => {
  it('cercanos → 1 pin en la propiedad, 2km', () => {
    const s = geoSpecForPreset(prop, 'cercanos')
    expect(s.geo_locations.custom_locations).toHaveLength(1)
    expect(s.geo_locations.custom_locations![0]).toMatchObject({ latitude: -34.60, longitude: -58.42, radius: 2 })
  })
  it('amplio → 1 pin Obelisco 25km', () => {
    const s = geoSpecForPreset(prop, 'amplio')
    expect(s.geo_locations.custom_locations![0]).toMatchObject({ latitude: -34.6037, longitude: -58.3816, radius: 25 })
  })
  it('similares → múltiples pines (propiedad + hermanos)', () => {
    const s = geoSpecForPreset(prop, 'similares')
    expect(s.geo_locations.custom_locations!.length).toBeGreaterThan(1)
  })
  it('tira si falta lat/lng', () => {
    expect(() => geoSpecForPreset({ latitude: null, longitude: null } as never, 'cercanos')).toThrow()
  })
})
```

- [ ] **Step 2: Correr para verificar que falla**

Run: `npm test -- lib/marketing/geo-targeting-presets.test.ts`
Expected: FAIL con "geoSpecForPreset is not a function".

- [ ] **Step 3: Extraer `customLocationsForPreset` + agregar `geoSpecForPreset`**

En `lib/marketing/geo-targeting-presets.ts`:

(a) Agregar tras la constante `PIN_RADIUS_KM` (L49) el helper compartido:
```ts
type CustomLocation = { latitude: number; longitude: number; radius: number; distance_unit: 'kilometer' }

/** Custom locations por preset. Fuente de verdad única (la usan buildGeoPresets y geoSpecForPreset). */
function customLocationsForPreset(property: Property, presetId: GeoPresetId): CustomLocation[] {
  if (property.latitude == null || property.longitude == null) {
    throw new Error('Property sin lat/lng — no se pueden armar custom_locations')
  }
  const here: CustomLocation = { latitude: property.latitude, longitude: property.longitude, radius: PIN_RADIUS_KM, distance_unit: 'kilometer' }
  if (presetId === 'cercanos') return [here]
  if (presetId === 'amplio') return [{ latitude: -34.6037, longitude: -58.3816, radius: 25, distance_unit: 'kilometer' }]
  // similares: propiedad + barrios hermanos del mismo cluster.
  const siblings = siblingNeighborhoods(property.neighborhood, 6)
  return [here, ...siblings.map(n => ({ latitude: n.lat, longitude: n.lng, radius: PIN_RADIUS_KM, distance_unit: 'kilometer' as const }))]
}

/** Spec de targeting para un preset, SIN depender de un BuyerPersona (para el confirm de v2).
 *  El builder capea age_min≤25/age_max≥65 igual, así que 25/65 acá es seguro. */
export function geoSpecForPreset(property: Property, presetId: GeoPresetId): MetaTargetingSpec {
  return {
    geo_locations: { custom_locations: customLocationsForPreset(property, presetId) },
    age_min: 25,
    age_max: 65,
    publisher_platforms: ['facebook', 'instagram'],
  }
}
```

(b) Refactorizar `buildGeoPresets` para reusar el helper (DRY, sin cambiar el comportamiento v1): en cada preset, reemplazar el array literal de `custom_locations` por `customLocationsForPreset(property, '<id>')`:
- preset `cercanos` (L68-78): `custom_locations: customLocationsForPreset(property, 'cercanos')`.
- preset `similares` (L122-124): `custom_locations: customLocationsForPreset(property, 'similares')`. Mantener `similarPins`/`siblingNames` que se usan en el texto `description`/`estimatedReach` (no tocar esa parte).
- preset `amplio` (L140-150): `custom_locations: customLocationsForPreset(property, 'amplio')`.

- [ ] **Step 4: Correr el test para verificar que pasa**

Run: `npm test -- lib/marketing/geo-targeting-presets.test.ts`
Expected: PASS.

- [ ] **Step 5: El confirm de v2 aplica el preset**

En `app/api/properties/[id]/meta-launch-v2/[jobId]/confirm/route.ts`:
- Import arriba: `import { geoSpecForPreset, type GeoPresetId } from '@/lib/marketing/geo-targeting-presets'`
- En el bloque que arma los overrides (L272-278), reemplazar por:
```ts
      const presetId = (typeof job.geo_preset_id === 'string' ? job.geo_preset_id : 'cercanos') as GeoPresetId
      let targetingOverride: Record<string, unknown> | undefined
      try {
        targetingOverride = geoSpecForPreset(property as never, presetId) as unknown as Record<string, unknown>
      } catch { targetingOverride = undefined } // sin lat/lng el builder ya tira; dejamos que decida
      campaign = await createCampaignForProperty(property as never, {
        dryRun: true,
        overrides: {
          preGeneratedImageHashes,
          variantCount: Math.min(preGeneratedImageHashes.length, 10),
          ...(targetingOverride ? { targetingOverride } : {}),
        },
      })
```

- [ ] **Step 6: Typecheck + test**

Run: `npx tsc --noEmit -p tsconfig.json && npm test -- lib/marketing/geo-targeting-presets.test.ts`
Expected: typecheck sin errores; test verde.

- [ ] **Step 7: Commit**

```bash
git add lib/marketing/geo-targeting-presets.ts lib/marketing/geo-targeting-presets.test.ts app/api/properties/[id]/meta-launch-v2/[jobId]/confirm/route.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(meta-v2): el preset geográfico elegido se aplica al targeting (confirm)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Fase D — Popup del listado

### Task 13: Popup — fotos con `unoptimized` (arreglo de imágenes rotas)

**Files:**
- Modify: `app/(dashboard)/properties/_components/PropertyGallery.tsx` (los 3 `<Image>`: L28-34, L47, L57)

**Interfaces:** ninguna (cambio local de props de `next/image`).

- [ ] **Step 1: Agregar `unoptimized` + `onError` a los 3 `<Image>`**

En `PropertyGallery.tsx`:

(a) Imagen principal (L28-34):
```tsx
          <Image
            src={photos[active]}
            alt={`${alt} ${active + 1}`}
            fill
            className="object-cover"
            sizes="(max-width: 1200px) 100vw, 800px"
            unoptimized
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
          />
```

(b) Thumbnail (L47):
```tsx
                <Image src={p} alt={`${alt} thumb ${i + 1}`} fill className="object-cover" sizes="64px" unoptimized />
```

(c) Lightbox (L57):
```tsx
            <Image src={photos[active]} alt={`${alt} ${active + 1}`} fill className="object-contain" sizes="100vw" unoptimized />
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "app/(dashboard)/properties/_components/PropertyGallery.tsx"
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "fix(properties): galería del popup usa unoptimized (fotos se ven, como la card)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 14: Popup — layout flex (footer siempre visible, sin scroll horizontal)

**Files:**
- Modify: `app/(dashboard)/properties/_components/PropertyDetailModal.tsx` (estructura del `DialogContent`, L52-122)

**Interfaces:** ninguna.

- [ ] **Step 1: Reestructurar el modal a flex-col con body scrolleable + footer fijo**

En `PropertyDetailModal.tsx`, reemplazar el bloque `<DialogContent ...>` … `</DialogContent>` (L53-122) por:
```tsx
      <DialogContent className="max-w-5xl max-h-[90vh] p-0 flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-6 space-y-6">
          <header className="flex items-start justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <DialogTitle className="text-2xl break-words">{property.address}</DialogTitle>
              <p className="flex items-center gap-1 text-muted-foreground text-sm">
                <MapPin className="size-4 shrink-0" /> <span className="break-words">{property.neighborhood}, {property.city}</span>
              </p>
              <p className="text-3xl font-bold pt-2">{formatCurrency(property.asking_price, property.currency)}</p>
            </div>
            <div className="flex flex-col gap-2 items-end shrink-0">
              <Badge>{property.property_type}</Badge>
              <OwnershipBadge isMine={isMine} />
            </div>
          </header>

          <PropertyGallery photos={property.photos} alt={property.address} />

          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {property.rooms != null && (
              <Stat icon={<Bed />} label="Ambientes" value={String(property.rooms)} />
            )}
            {property.bathrooms != null && (
              <Stat icon={<Bath />} label="Baños" value={String(property.bathrooms)} />
            )}
            {property.covered_area != null && (
              <Stat icon={<Square />} label="Sup. cubierta" value={`${property.covered_area} m²`} />
            )}
            {property.total_area != null && (
              <Stat icon={<Square />} label="Sup. total" value={`${property.total_area} m²`} />
            )}
          </section>

          {(property.video_url || property.tour_3d_url) && (
            <section className="flex flex-wrap gap-2">
              {property.video_url && (
                <Button variant="outline" asChild>
                  <a href={property.video_url} target="_blank" rel="noopener noreferrer">
                    <Video className="size-4 mr-1" /> Ver video <ExternalLink className="size-3 ml-1" />
                  </a>
                </Button>
              )}
              {property.tour_3d_url && (
                <Button variant="outline" asChild>
                  <a href={property.tour_3d_url} target="_blank" rel="noopener noreferrer">
                    <Box className="size-4 mr-1" /> Tour 360° <ExternalLink className="size-3 ml-1" />
                  </a>
                </Button>
              )}
            </section>
          )}

          {property.description && (
            <section>
              <h3 className="font-semibold mb-2">Descripción</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{property.description}</p>
            </section>
          )}
        </div>

        <footer className="shrink-0 px-6 py-4 bg-background border-t flex flex-wrap gap-2 justify-end">
          <Button variant="outline" asChild>
            <Link href={`/properties/${property.id}`}>Ver detalle completo</Link>
          </Button>
          <Button onClick={() => onScheduleVisit(property.id)} className="gap-2">
            <Calendar className="size-4" />
            Agendar visita
          </Button>
        </footer>
      </DialogContent>
```
(El footer sale del div scrolleable y pasa a ser hermano `shrink-0` → siempre visible. Se quitó `sticky bottom-0 -mx-6 -mb-6`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 3: Verificación visual (si hay navegador)**

Run: `npx next dev --webpack`, abrir el listado de propiedades, clickear la de "Carlos Antonio López 2530" (descripción larga). Confirmar: fotos visibles, "Ver detalle completo" + "Agendar visita" siempre visibles abajo, la descripción scrollea dentro del modal, sin scroll horizontal.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/properties/_components/PropertyDetailModal.tsx"
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "fix(properties): popup con footer fijo + body scrolleable (botones siempre visibles, sin scroll horizontal)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Fase de deploy (post-implementación, con el usuario)

1. Confirmar la migración (Task 1) aplicada en el proyecto correcto (`mncsnastmcjdjxrehdep`) verificando las 3 columnas contra la API.
2. Correr `scripts/backfill-address-geocode.ts` **sin** `--commit`, revisar el desglose de confianza con el usuario.
3. Correr con `--commit`. Reportar cuántas quedaron `low` (a confirmar el pin a mano).
4. Merge de `feat/normalizacion-direcciones-geocoding` a `main` (dispara el deploy de Netlify). El usuario aprueba el merge.
5. (Opcional) Setear `GOOGLE_GEOCODING_API_KEY` en Netlify para precisión GBA. Sin ella, OSM ya funciona.
6. **No** publicar en vivo en ML/Argenprop para probar (decisión del usuario). Validar publicación con QA de una propiedad `[TEST` si se quiere, nunca con las reales.

---

## Self-Review

**1. Spec coverage:**
- A1 normalizador → Task 2 ✅ · A2 geocoder → Task 3 ✅ · A3 `/api/geocode` → Task 4 ✅ · A4 wizard query → Task 5 ✅ · A5 pin siempre + dirección editable + confianza → Task 6 ✅ · A6 migración → Task 1 ✅ · A7 backfill → Task 8 ✅ · A8 geocode-on-create → Task 9 ✅ · A9 ML buildLocation province → Task 7 ✅
- B Argenprop CABA + parseCalle + temprano → Task 10 ✅
- C1 Meta v2 validación inicio → Task 11 ✅ · C2 Meta v2 preset → Task 12 ✅
- D1 fotos → Task 13 ✅ · D2 layout → Task 14 ✅
- Testing: unit address/geocoder/geoSpec/parseCalle ✅; dry-run backfill = "prueba de que lee la dirección" (Task 8 Step 2) ✅.

**2. Placeholder scan:** sin "TBD"/"TODO"/"handle edge cases". Los pasos de edición muestran el código real. La migración vía pg tiene fallback documentado (Dashboard).

**3. Type consistency:** `GeoConfidence`='high'|'medium'|'low' (geocoder) + 'manual' solo en DB/UI (coherente con el spec corregido). `geocodeAddress(query, expected?)`, `geoSpecForPreset(property, presetId)`, `parseCalleFromAddress` usados consistentemente. `CampaignOverrides.targetingOverride` confirmado en `meta-campaign-builder.ts:311`. `findNeighborhood` reusado de `neighborhood-data.ts` (mismo `{lat,lng}` que usa geo-targeting-presets).

**Notas de riesgo para el ejecutor:**
- Task 5/6 tocan el hook AP equivalente (`useApPublishDraft.ts` o similar) — verificar su nombre real antes de editar; el patrón es idéntico al de ML.
- Task 6: `findNeighborhood` puede devolver `null` para barrios GBA → el fallback Obelisco cubre eso.
- Task 12: `job.geo_preset_id` puede ser null (jobs viejos) → default `'cercanos'`.
