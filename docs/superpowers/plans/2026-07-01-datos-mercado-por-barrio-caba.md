# Datos de Mercado por Barrio — CABA (Fase A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Los 4 "Datos de Mercado" del informe de tasación se actualizan solos una vez al mes desde 4 fuentes HTTP, dos de ellos por barrio (los 48 de CABA), se renderizan como gráficos propios branded en el PDF, y cada tasación congela el mes con el que se creó — sin romper nada del tasador actual.

**Architecture:** Ingesta mensual vía pg_cron → rutas `app/api/cron/refresh-market-data` (fetch JSON de Monitor Inmobiliario + datos del Infogram + RSS del Colegio de Escribanos + HTML de Zonaprop vía ScraperAPI) → snapshots en 3 tablas nuevas de Supabase (histórico ilimitado, upsert idempotente por período). Un resolver (`getMarketData`) con cadena de fallbacks alimenta un contrato único (`MarketDataForReport`) que consumen el PDF (4 secciones SVG nuevas en @react-pdf) y la UI. El wizard captura el barrio con un combobox canónico y la tasación persiste `neighborhood_slug` + `market_period`. Tasaciones legacy (columnas null) siguen renderizando EXACTAMENTE el camino actual de imágenes.

**Tech Stack:** Next.js 16 (App Router), TypeScript 5, Supabase (Postgres + Storage + pg_cron + pg_net), @react-pdf/renderer 4.3.1 (Svg/Path nativos), Cheerio 1.1.2, Vitest 4, ScraperAPI. **Cero dependencias npm nuevas.**

**Spec:** `docs/superpowers/specs/2026-07-01-datos-mercado-por-barrio-design.md` (aprobado 2026-07-01). GBA Norte (2ª ola) NO está en este plan — se planifica aparte cuando CABA esté verificado (spec §3.7).

## Global Constraints

- **No romper el tasador**: toda tasación existente (sin `neighborhood_slug`/`market_period`) debe renderizar el PDF **idéntico** a hoy. Las páginas 3-4 actuales de `PDFReport.tsx` se conservan verbatim como rama legacy.
- **Commit author OBLIGATORIO**: `Sujupar <redstyle50@gmail.com>` (si no, el deploy de Netlify falla). Los commits los hace el ejecutor con `git -c user.name=Sujupar -c user.email=redstyle50@gmail.com commit ...` o con el config ya seteado del repo. Cerrar cada mensaje con `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Prosa hacia el usuario en español**; código/identificadores en inglés como el resto del repo. Comentarios de código en español (estilo del repo).
- **Migraciones SQL**: la CLI de Supabase NO conecta. Los archivos se escriben en `supabase/migrations/` y **el usuario los corre a mano** en el Dashboard SQL Editor. Todo SQL debe ser idempotente (`IF NOT EXISTS`, `ON CONFLICT`, `DO $$`).
- **Cron**: las Netlify scheduled functions NO disparan en este sitio. Solo **pg_cron → ruta Next con `x-cron-secret`**. La auth de la ruta debe aceptar el secreto de `process.env.CRON_SECRET` **O** el de la tabla `cron_config` (hay 2 secretos coexistiendo; ver Task 7 — usar el patrón dual de `app/api/cron/send-report/route.ts`, NO el env-only de `refresh-portal-map` que da 403).
- **Scraping**: NADA de Puppeteer/headless. Fetch plano; Zonaprop SOLO vía ScraperAPI (`SCRAPER_API_KEY`).
- **@react-pdf**: `<Image src>` necesita URL HTTP pública (bucket público) o base64. Los buckets nuevos deben ser públicos.
- **Upsert Supabase**: todo `.upsert(..., { onConflict })` requiere UNIQUE constraint real en la DB (gotcha documentado del proyecto). Las migraciones de este plan las crean.
- **Crash lesson del preview** (documentado en este repo): el tab "Vista Previa" del `PDFPreviewModal` renderiza el `<PDFReportDocument>` **inline con props crudas** — NO reemplazar ese JSX por builders/props derivadas inestables. Este plan solo AGREGA props estables (`marketData`, `neighborhoodName`); cualquier cambio ahí se verifica en navegador real, no solo con tsc/build.
- **Build local**: el path del proyecto tiene acentos ("Gestión") y Turbopack PANIQUEA. Para `next build` local usar el patrón documentado:
  ```bash
  rsync -a --delete --exclude node_modules --exclude .next "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria/" /tmp/dfb/ && cp -c -R "/Users/apple/Documents/01. Anti Gravity/01. Gestión - Diego Ferreyra Inmobiliaria/node_modules" /tmp/dfb/node_modules 2>/dev/null; cd /tmp/dfb && npx next build
  ```
  Los tests (`npm test`) sí corren en el path original.
- **Verificación antes de afirmar**: nunca declarar una tarea completa sin correr el comando de verificación del paso y ver su salida (tests PASS, curl 200, render sin throw).

---

## Estado actual (contexto mínimo para cada implementador)

- Los 4 slots de mercado hoy: imágenes globales `{slot}.png` en bucket `market-images`, labels en tabla `market_image_settings`, servidos por `GET /api/settings/market-images`, renderizados en `components/appraisal/pdf/PDFReport.tsx` páginas 3-4 (líneas ~561-617) con fallback a `/pdf-assets/monthly-data/*.png`. El `PDFPreviewModal` los fetchea lazy (cache de módulo). `PDFDownloadButton` NO los pasa (usa defaults).
- El barrio hoy es texto libre concatenado en `subject.location` = `"dirección, barrio, ciudad"`. El PDF lo re-deriva con `extractNeighborhood()` (regex que hoy suele caer a `'CABA'`). El deal auto-creado parsea `location.split(',')[1]`. El modo edición re-split-ea por comas. **El formato del string `location` NO se cambia en este plan** — el slug canónico viaja aparte.
- Tabla `appraisals`: NO tiene columna de barrio ni de período. `insertAppraisalWithComparables` (`lib/supabase/appraisals-write.ts:93`) inserta la fila.
- Fuentes verificadas EN VIVO (2026-07-01):
  - **JSON Bryn**: `https://script.google.com/macros/s/AKfycbwKtvJPYs-reH0TeR9QLpAtKFdu90HAKY3NeWa5kRUqZ5ViipkGKle8kOPwNMEW4p91Mg/exec?token=bryn-monitor-2026&origen=monitorinmobiliario` → `{ kpis:{~73 claves}, barrios:[48], _actualizado }`. HTTP 200, ~11KB, sigue redirects (302 a googleusercontent).
  - **Infogram** (composición del stock): `https://e.infogram.com/09008d4a-dcf6-4acf-aebe-18cb3cfc2f5c?src=embed` → HTML ~188KB con `window.infographicData` (los datos de la tabla de tipos + antigüedad + vendedor + ant. publicación).
  - **RSS Colegio**: `https://www.colegio-escribanos.org.ar/category/estadisticas-de-escrituras/feed/` → RSS 2.0, item[0] = artículo del mes con `content:encoded` (texto + `<img>` del gráfico oficial).
  - **Zonaprop por barrio**: `https://www.zonaprop.com.ar/barrios/capital-federal/{slug}` (server-rendered; bloquea IPs cloud → ScraperAPI). Los 6 conteos (departamentos/terrenos/locales/casas/PH/oficinas) están en el HTML inicial.
  - **Mapa CABA**: el HTML de `https://monitorinmobiliario.com/` trae un SVG inline con 48 `<path class="barrio-path" data-id="..." data-n="..." fill="#...">`. OJO: los `<path>` del HTML NO se autocierran — al extraerlos hay que agregar `/>` o se anidan y solo renderiza el primero (bug ya sufrido y resuelto en los mockups). Hay un bug conocido en la fuente: `data-id="villa-ortuzar"` aparece DUPLICADO y falta `villa-general-mitre` — el path duplicado con centroide más al SUR es Villa General Mitre (regla en Task 10).

## Mapa de archivos

**Crear:**
```
lib/market-data/types.ts                     — contrato completo (tipos TS)
lib/market-data/neighborhoods.ts             — catálogo canónico 48 + General + normalize + lookups
lib/market-data/period.ts                    — currentPeriod() (mes vigente ART)
lib/market-data/arc-geometry.ts              — geometría de donas/semi-donas (puro, testeado)
lib/market-data/sources/bryn.ts              — fetch+parse JSON Bryn (+fallback data-* del mapa)
lib/market-data/sources/infogram.ts          — fetch+parse window.infographicData
lib/market-data/sources/colegio.ts           — fetch+parse RSS + cifras + resumen
lib/market-data/sources/zonaprop.ts          — fetch vía ScraperAPI + parse 6 conteos
lib/market-data/ingest.ts                    — orquestador refreshCore/refreshZonaprop + merge helpers
lib/market-data/resolver.ts                  — getMarketData() con fallbacks + agregado General
lib/market-data/caba-map-paths.ts            — GENERADO: 48 paths del mapa + viewBox
lib/market-data/__fixtures__/                — bryn.json, infogram.html, colegio-feed.xml, zonaprop-palermo.html, map-sample.html
scripts/extract-caba-map.ts                  — genera caba-map-paths.ts desde la fuente
scripts/capture-market-fixtures.ts           — captura/actualiza los fixtures reales
scripts/verify-zonaprop-slugs.ts             — prueba los 48 slugs vía proxy, reporta 404s
app/api/cron/refresh-market-data/route.ts    — cron core+zonaprop (x-cron-secret dual)
app/api/market-data/route.ts                 — GET datos resueltos para una tasación
app/api/market-data/status/route.ts          — GET estado de ingesta (panel Config)
app/api/market-data/refresh/route.ts         — POST refresco manual (admin/dueno)
app/api/neighborhoods/route.ts               — GET catálogo para el combobox
components/appraisal/pdf/market/palette.ts   — colores del sistema de gráficas
components/appraisal/pdf/market/gauges.tsx   — SemiDonut + Donut (@react-pdf Svg)
components/appraisal/pdf/market/StockDashboardPDF.tsx
components/appraisal/pdf/market/EscriturasPDF.tsx
components/appraisal/pdf/market/BarrioPanelPDF.tsx   — panel precios + mapa resaltado
components/appraisal/pdf/market/TiposPDF.tsx
components/appraisal/NeighborhoodSelect.tsx  — combobox del wizard
supabase/migrations/20260701000010_market_data_catalog.sql
supabase/migrations/20260701000011_market_data_snapshots.sql
supabase/migrations/20260701000012_cron_market_data.sql   — correr DESPUÉS del deploy
```

**Modificar:**
```
lib/scraper/types.ts                          — ScrapedProperty += neighborhoodSlug? (aditivo)
lib/supabase/appraisals.ts                    — SaveAppraisalInput/AppraisalDetail += campos nuevos
lib/supabase/appraisals-write.ts              — insert/update persisten slug+period
app/api/appraisals/route.ts                   — POST setea market_period server-side
components/appraisal/PropertyWizard.tsx       — Input barrio → NeighborhoodSelect
app/(dashboard)/appraisal/new/page.tsx        — slug en edit-mode + fetch marketData + threading
app/(dashboard)/appraisals/[id]/page.tsx      — fetch marketData por (slug,period) + threading
components/appraisal/PDFPreviewModal.tsx      — props marketData/neighborhoodName (aditivo)
components/appraisal/PDFDownloadButton.tsx    — idem
components/appraisal/pdf/PDFReport.tsx        — páginas de mercado data-driven con rama legacy intacta
app/(dashboard)/settings/page.tsx             — panel de estado + refrescar + override legacy plegado
CLAUDE.md                                     — sección nueva del sistema (al final, Task 15)
```

**Regla de interconexión para subagentes (Fase 3):** las tareas 3-6 (sources) y 11 (PDF) dependen SOLO de `lib/market-data/types.ts` (Task 1). Nadie modifica tipos ajenos: si un implementador necesita cambiar un tipo compartido, se detiene y lo reporta (el orquestador re-sincroniza). Los archivos "Modificar" de tareas distintas no se solapan, salvo `PDFReport.tsx` (solo Task 11) y las páginas (solo Task 13).

---

### Task 1: Contrato de tipos + catálogo canónico de barrios + período

**Files:**
- Create: `lib/market-data/types.ts`
- Create: `lib/market-data/neighborhoods.ts`
- Create: `lib/market-data/period.ts`
- Test: `lib/market-data/neighborhoods.test.ts`, `lib/market-data/period.test.ts`

**Interfaces:**
- Consumes: nada (tarea raíz).
- Produces: TODOS los tipos del sistema (`StockComposition`, `EscriturasData`, `NeighborhoodPrice`, `PropertyTypesCounts`, `MarketDataForReport`, `SourceResult`), el catálogo `CABA_BARRIOS: CanonicalNeighborhood[]` (48 + `GENERAL_SLUG='general'`), `normalizeBarrio(name)`, `findBySlug(slug)`, `findByText(freeText)` (mapeo legacy), `ALL_CABA_SLUGS: string[]`, `currentPeriod(now?): string`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// lib/market-data/neighborhoods.test.ts
import { describe, it, expect } from 'vitest'
import { CABA_BARRIOS, ALL_CABA_SLUGS, GENERAL_SLUG, normalizeBarrio, findBySlug, findByText } from './neighborhoods'

describe('catálogo canónico de barrios CABA', () => {
    it('tiene exactamente 48 barrios (sin contar General)', () => {
        expect(CABA_BARRIOS.filter(b => b.slug !== GENERAL_SLUG)).toHaveLength(48)
        expect(ALL_CABA_SLUGS).toHaveLength(48)
    })
    it('slugs únicos y normalizados (sin acentos, kebab-case)', () => {
        const slugs = CABA_BARRIOS.map(b => b.slug)
        expect(new Set(slugs).size).toBe(slugs.length)
        for (const s of slugs) expect(s).toMatch(/^[a-z0-9-]+$/)
    })
    it('normalizeBarrio matchea los nombres del JSON de Bryn', () => {
        expect(normalizeBarrio('Núñez')).toBe('nunez')
        expect(normalizeBarrio('Villa Ortúzar')).toBe('villa-ortuzar')
        expect(normalizeBarrio('La Paternal')).toBe('la-paternal')
        expect(normalizeBarrio('Vélez Sarsfield')).toBe('velez-sarsfield')
    })
    it('findBySlug resuelve nombre visible', () => {
        expect(findBySlug('puerto-madero')?.name).toBe('Puerto Madero')
        expect(findBySlug('general')?.isGeneral).toBe(true)
        expect(findBySlug('no-existe')).toBeUndefined()
    })
    it('findByText mapea texto libre legacy (con typos de acentos y case)', () => {
        expect(findByText('palermo')?.slug).toBe('palermo')
        expect(findByText('NUÑEZ')?.slug).toBe('nunez')
        expect(findByText('  Villa Crespo ')?.slug).toBe('villa-crespo')
        expect(findByText('Barrio inventado')).toBeUndefined()
        expect(findByText('')).toBeUndefined()
    })
})
```

```ts
// lib/market-data/period.test.ts
import { describe, it, expect } from 'vitest'
import { currentPeriod } from './period'

describe('currentPeriod', () => {
    it('devuelve el primer día del mes vigente en Buenos Aires (UTC-3)', () => {
        // 2026-07-01T01:00Z = 2026-06-30 22:00 ART → período junio
        expect(currentPeriod(new Date('2026-07-01T01:00:00Z'))).toBe('2026-06-01')
        // 2026-07-01T04:00Z = 2026-07-01 01:00 ART → período julio
        expect(currentPeriod(new Date('2026-07-01T04:00:00Z'))).toBe('2026-07-01')
        expect(currentPeriod(new Date('2026-12-31T15:00:00Z'))).toBe('2026-12-01')
    })
})
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `npm test -- lib/market-data`
Expected: FAIL — "Cannot find module './neighborhoods'" (y './period').

- [ ] **Step 3: Implementar `lib/market-data/period.ts`**

```ts
/** Período de datos de mercado = primer día del mes VIGENTE en Buenos Aires.
 *  ART es UTC-3 fijo (sin DST) — restamos 3h y leemos el mes en UTC. */
export function currentPeriod(now: Date = new Date()): string {
    const art = new Date(now.getTime() - 3 * 3600_000)
    const y = art.getUTCFullYear()
    const m = String(art.getUTCMonth() + 1).padStart(2, '0')
    return `${y}-${m}-01`
}
```

- [ ] **Step 4: Implementar `lib/market-data/types.ts`** (contrato COMPLETO del sistema — nadie más define tipos compartidos)

```ts
/** Contrato central de Datos de Mercado. Las fuentes (sources/*) PRODUCEN estas
 *  estructuras; el resolver las SIRVE; el PDF y la UI las CONSUMEN. Los jsonb de
 *  las tablas market_snapshot_* guardan exactamente estas formas (camelCase). */

export interface CompositionSlice { label: string; pct: number; count?: number | null }

export interface StockComposition {
    stockDeptos: number | null        // kpis.stock_deptos
    stockVm: number | null            // kpis.stock_vm (decimal, ej 0.0297)
    absorcion: number | null          // kpis.absorcion (meses)
    totalInmuebles: number | null     // total tabla tipos (si el Infogram lo trae)
    tipos: CompositionSlice[]         // 9 tipos (Casa, Departamentos, ..., Otros)
    antiguedad: CompositionSlice[]
    vendedor: CompositionSlice[]
    antPublicacion: CompositionSlice[]
}

export interface EscriturasData {
    mesLabel: string                  // "Mayo 2026" (del título del artículo)
    cantidad: number | null           // 5435
    varInteranual: number | null      // decimal, ej -0.031
    montoTexto: string | null         // "$848.932 millones"
    hipotecas: number | null
    articleUrl: string
    imageUrl: string | null           // publicUrl en Storage (bucket market-data)
    summary: string                   // resumen listo para el PDF
}

export interface NeighborhoodPrice {
    prom: number | null; vm: number | null; via: number | null
    usado: number | null; pozo: number | null; estrenar: number | null
    alq2amb: number | null; renta: number | null; deptos: number | null
}

export interface PropertyTypesCounts {
    departamentos: number | null; terrenos: number | null; locales: number | null
    casas: number | null; ph: number | null; oficinas: number | null
    total: number | null
}

/** Lo que recibe el PDF/UI para UNA tasación. */
export interface MarketDataForReport {
    /** Período pedido (congelado en la tasación) y el efectivamente servido. */
    period: string
    resolvedPeriod: string
    neighborhood: { slug: string; name: string; isGeneral: boolean }
    caba: {
        stock: StockComposition | null
        escrituras: EscriturasData | null
        price: NeighborhoodPrice | null   // panel de precios CABA-wide (para General)
    }
    barrio: {
        price: NeighborhoodPrice | null
        propertyTypes: PropertyTypesCounts | null
    }
}

/** Resultado uniforme de cada fuente en la ingesta. */
export type SourceResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string }

export interface BrynBarrioRow { slug: string; name: string; price: NeighborhoodPrice }
export interface BrynParsed {
    actualizado: string | null
    cabaPrice: NeighborhoodPrice
    stockKpis: Pick<StockComposition, 'stockDeptos' | 'stockVm' | 'absorcion'>
    extraOferta: { terrenos: number | null; locales: number | null; oficinas: number | null }
    barrios: BrynBarrioRow[]
}
```

- [ ] **Step 5: Implementar `lib/market-data/neighborhoods.ts`** (catálogo COMPLETO — los 48 nombres son EXACTAMENTE los del JSON de Bryn)

```ts
import type { NeighborhoodPrice } from './types'
void 0 as unknown as NeighborhoodPrice // (evita import fantasma si el linter borra el import)

export interface CanonicalNeighborhood {
    slug: string
    name: string                 // nombre visible = EXACTO el del JSON de Bryn
    zonapropSlug: string         // slug de la URL de Zonaprop (default = slug)
    isGeneral?: boolean
}

export const GENERAL_SLUG = 'general'

/** Normaliza un nombre de barrio a slug: NFD sin acentos, kebab-case. */
export function normalizeBarrio(name: string): string {
    return name
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
}

const N = (name: string, zonapropSlug?: string): CanonicalNeighborhood => ({
    slug: normalizeBarrio(name), name, zonapropSlug: zonapropSlug || normalizeBarrio(name),
})

/** Los 48 barrios oficiales de CABA — nombres EXACTOS del JSON de Bryn (fuente
 *  autoritativa de matching). zonapropSlug se corrige en Task 6 si el verificador
 *  de slugs encuentra 404s (ej. San Nicolás suele ser "centro-microcentro"). */
export const CABA_BARRIOS: CanonicalNeighborhood[] = [
    N('Agronomía'), N('Almagro'), N('Balvanera'), N('Barracas'), N('Belgrano'),
    N('Boedo'), N('Caballito'), N('Chacarita'), N('Coghlan'), N('Colegiales'),
    N('Constitución'), N('Flores'), N('Floresta'), N('La Boca'), N('La Paternal'),
    N('Liniers'), N('Mataderos'), N('Monserrat'), N('Monte Castro'), N('Nueva Pompeya'),
    N('Núñez'), N('Palermo'), N('Parque Avellaneda'), N('Parque Chacabuco'), N('Parque Chas'),
    N('Parque Patricios'), N('Puerto Madero'), N('Recoleta'), N('Retiro'), N('Saavedra'),
    N('San Cristóbal'), N('San Nicolás'), N('San Telmo'), N('Vélez Sarsfield'), N('Versalles'),
    N('Villa Crespo'), N('Villa del Parque'), N('Villa Devoto'), N('Villa General Mitre'),
    N('Villa Lugano'), N('Villa Luro'), N('Villa Ortúzar'), N('Villa Pueyrredón'), N('Villa Real'),
    N('Villa Riachuelo'), N('Villa Santa Rita'), N('Villa Soldati'), N('Villa Urquiza'),
    { slug: GENERAL_SLUG, name: 'CABA', zonapropSlug: '', isGeneral: true },
]

export const ALL_CABA_SLUGS: string[] = CABA_BARRIOS.filter(b => !b.isGeneral).map(b => b.slug)

const bySlug = new Map(CABA_BARRIOS.map(b => [b.slug, b]))

export function findBySlug(slug: string | null | undefined): CanonicalNeighborhood | undefined {
    if (!slug) return undefined
    return bySlug.get(slug)
}

/** Mapea texto libre legacy ("Palermo", "NUÑEZ ", "villa crespo") al catálogo. */
export function findByText(text: string | null | undefined): CanonicalNeighborhood | undefined {
    if (!text || !text.trim()) return undefined
    return bySlug.get(normalizeBarrio(text))
}
```

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `npm test -- lib/market-data`
Expected: PASS (todos los tests de neighborhoods + period).

- [ ] **Step 7: tsc + commit**

Run: `npx tsc --noEmit -p tsconfig.json` → 0 errores.
```bash
git add lib/market-data/
git commit -m "feat(market-data): contrato de tipos + catálogo canónico de 48 barrios + período ART

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Migraciones SQL — catálogo, snapshots, estado, columnas de appraisals, bucket

**Files:**
- Create: `supabase/migrations/20260701000010_market_data_catalog.sql`
- Create: `supabase/migrations/20260701000011_market_data_snapshots.sql`

**Interfaces:**
- Consumes: los slugs/nombres de Task 1 (el seed SQL replica el catálogo).
- Produces: tablas `neighborhoods`, `market_snapshot_caba`, `market_snapshot_neighborhood`, `market_data_refresh_state`; (nota: el spec las nombraba `market_snapshots_*` en plural — este plan fija el naming SINGULAR y es el autoritativo); columnas `appraisals.neighborhood_slug` + `appraisals.market_period`; bucket público `market-data`. **Los UNIQUE de los upserts de Task 7.**
- ⚠️ **Acción del usuario**: estas migraciones las corre EL USUARIO a mano en el Dashboard. El ejecutor las escribe, commitea y AVISA. Las tareas 7/9 (que tocan DB real) dependen de que estén corridas.

- [ ] **Step 1: Escribir `supabase/migrations/20260701000010_market_data_catalog.sql`**

```sql
-- Catálogo canónico de barrios (fuente para el combobox del wizard y FK de snapshots).
-- Correr a mano en el SQL Editor del Dashboard (la CLI no conecta). Idempotente.

CREATE TABLE IF NOT EXISTS public.neighborhoods (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        text NOT NULL UNIQUE,
  name        text NOT NULL,
  zonaprop_slug text,
  zone        text NOT NULL DEFAULT 'caba',   -- 'caba' | 'gba_norte' (2ª ola)
  partido     text,                            -- solo GBA
  is_general  boolean NOT NULL DEFAULT false,
  active      boolean NOT NULL DEFAULT true,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Seed: 48 barrios CABA (nombres EXACTOS del JSON de Monitor Inmobiliario) + General.
INSERT INTO public.neighborhoods (slug, name, zonaprop_slug, sort_order) VALUES
  ('agronomia','Agronomía','agronomia',1),('almagro','Almagro','almagro',2),
  ('balvanera','Balvanera','balvanera',3),('barracas','Barracas','barracas',4),
  ('belgrano','Belgrano','belgrano',5),('boedo','Boedo','boedo',6),
  ('caballito','Caballito','caballito',7),('chacarita','Chacarita','chacarita',8),
  ('coghlan','Coghlan','coghlan',9),('colegiales','Colegiales','colegiales',10),
  ('constitucion','Constitución','constitucion',11),('flores','Flores','flores',12),
  ('floresta','Floresta','floresta',13),('la-boca','La Boca','la-boca',14),
  ('la-paternal','La Paternal','la-paternal',15),('liniers','Liniers','liniers',16),
  ('mataderos','Mataderos','mataderos',17),('monserrat','Monserrat','monserrat',18),
  ('monte-castro','Monte Castro','monte-castro',19),('nueva-pompeya','Nueva Pompeya','nueva-pompeya',20),
  ('nunez','Núñez','nunez',21),('palermo','Palermo','palermo',22),
  ('parque-avellaneda','Parque Avellaneda','parque-avellaneda',23),
  ('parque-chacabuco','Parque Chacabuco','parque-chacabuco',24),
  ('parque-chas','Parque Chas','parque-chas',25),('parque-patricios','Parque Patricios','parque-patricios',26),
  ('puerto-madero','Puerto Madero','puerto-madero',27),('recoleta','Recoleta','recoleta',28),
  ('retiro','Retiro','retiro',29),('saavedra','Saavedra','saavedra',30),
  ('san-cristobal','San Cristóbal','san-cristobal',31),('san-nicolas','San Nicolás','san-nicolas',32),
  ('san-telmo','San Telmo','san-telmo',33),('velez-sarsfield','Vélez Sarsfield','velez-sarsfield',34),
  ('versalles','Versalles','versalles',35),('villa-crespo','Villa Crespo','villa-crespo',36),
  ('villa-del-parque','Villa del Parque','villa-del-parque',37),('villa-devoto','Villa Devoto','villa-devoto',38),
  ('villa-general-mitre','Villa General Mitre','villa-general-mitre',39),
  ('villa-lugano','Villa Lugano','villa-lugano',40),('villa-luro','Villa Luro','villa-luro',41),
  ('villa-ortuzar','Villa Ortúzar','villa-ortuzar',42),('villa-pueyrredon','Villa Pueyrredón','villa-pueyrredon',43),
  ('villa-real','Villa Real','villa-real',44),('villa-riachuelo','Villa Riachuelo','villa-riachuelo',45),
  ('villa-santa-rita','Villa Santa Rita','villa-santa-rita',46),('villa-soldati','Villa Soldati','villa-soldati',47),
  ('villa-urquiza','Villa Urquiza','villa-urquiza',48)
ON CONFLICT (slug) DO NOTHING;

INSERT INTO public.neighborhoods (slug, name, zonaprop_slug, is_general, sort_order)
VALUES ('general','CABA','',true,0)
ON CONFLICT (slug) DO NOTHING;

ALTER TABLE public.neighborhoods ENABLE ROW LEVEL SECURITY;

-- Lectura: cualquier usuario autenticado (catálogo no sensible). Escritura: solo service_role.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='neighborhoods'
                 AND policyname='neighborhoods_select_all') THEN
    CREATE POLICY neighborhoods_select_all ON public.neighborhoods
      FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
```

- [ ] **Step 2: Escribir `supabase/migrations/20260701000011_market_data_snapshots.sql`**

```sql
-- Snapshots mensuales de datos de mercado + estado de ingesta + columnas de congelado
-- en appraisals + bucket de Storage. Correr a mano en el Dashboard. Idempotente.

-- 1) Snapshot CABA-wide: 1 fila por mes.
CREATE TABLE IF NOT EXISTS public.market_snapshot_caba (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period       date NOT NULL UNIQUE,          -- primer día del mes (UNIQUE ⇒ upsert válido)
  stock        jsonb,                         -- StockComposition (camelCase)
  escrituras   jsonb,                         -- EscriturasData
  price_caba   jsonb,                         -- NeighborhoodPrice CABA-wide (para "General")
  source_meta  jsonb,                         -- {bryn:{ok,error?},infogram:{...},colegio:{...}}
  captured_at  timestamptz NOT NULL DEFAULT now(),
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- 2) Snapshot por barrio: 1 fila por (barrio, mes).
CREATE TABLE IF NOT EXISTS public.market_snapshot_neighborhood (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  neighborhood_id uuid NOT NULL REFERENCES public.neighborhoods(id) ON DELETE CASCADE,
  neighborhood_slug text NOT NULL,            -- denormalizado para lecturas sin join
  period          date NOT NULL,
  price           jsonb,                      -- NeighborhoodPrice
  property_types  jsonb,                      -- PropertyTypesCounts
  source_meta     jsonb,
  captured_at     timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (neighborhood_id, period)            -- upsert por (barrio,mes)
);
CREATE INDEX IF NOT EXISTS msn_slug_period_idx
  ON public.market_snapshot_neighborhood (neighborhood_slug, period DESC);

-- 3) Estado de ingesta (observabilidad; el cron escribe SIEMPRE, ok o fallo).
CREATE TABLE IF NOT EXISTS public.market_data_refresh_state (
  id          text PRIMARY KEY,               -- 'core' | 'zonaprop'
  period      date,
  last_run_at timestamptz,
  last_status text,                           -- 'ok' | 'partial' | 'failed'
  last_error  text,
  last_stats  jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- 4) Congelado por tasación (nullable ⇒ tasaciones legacy intactas).
ALTER TABLE public.appraisals ADD COLUMN IF NOT EXISTS neighborhood_slug text;
ALTER TABLE public.appraisals ADD COLUMN IF NOT EXISTS market_period date;

-- 5) RLS: lectura authenticated; escritura solo service_role (sin policy de INSERT/UPDATE).
ALTER TABLE public.market_snapshot_caba ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_snapshot_neighborhood ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_data_refresh_state ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='market_snapshot_caba' AND policyname='msc_select') THEN
    CREATE POLICY msc_select ON public.market_snapshot_caba FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='market_snapshot_neighborhood' AND policyname='msn_select') THEN
    CREATE POLICY msn_select ON public.market_snapshot_neighborhood FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='market_data_refresh_state' AND policyname='mdrs_select') THEN
    CREATE POLICY mdrs_select ON public.market_data_refresh_state FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- 6) Bucket público para assets (imagen del gráfico del Colegio). Público porque
--    @react-pdf necesita URL HTTP pública para <Image src>.
INSERT INTO storage.buckets (id, name, public)
VALUES ('market-data', 'market-data', true)
ON CONFLICT (id) DO NOTHING;

-- VERIFICACIÓN:
--   SELECT COUNT(*) FROM public.neighborhoods;                          -- 49
--   SELECT column_name FROM information_schema.columns
--     WHERE table_name='appraisals' AND column_name IN ('neighborhood_slug','market_period');  -- 2 filas
--   SELECT id, public FROM storage.buckets WHERE id='market-data';      -- public=true
```

- [ ] **Step 3: Verificar sintaxis básica (sin DB local)**

Run: `grep -c "CREATE TABLE IF NOT EXISTS" supabase/migrations/20260701000011_market_data_snapshots.sql`
Expected: `3`. Y `grep -c "ON CONFLICT" supabase/migrations/20260701000010_market_data_catalog.sql` → `2`.

- [ ] **Step 4: Commit + AVISAR al usuario**

```bash
git add supabase/migrations/20260701000010_market_data_catalog.sql supabase/migrations/20260701000011_market_data_snapshots.sql
git commit -m "feat(market-data): migraciones — catálogo de barrios, snapshots mensuales, estado, congelado en appraisals

El usuario debe correrlas a mano en el Dashboard SQL Editor (en orden 000010 → 000011).

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
**Reportar en la salida de la tarea:** "⚠️ Migraciones 20260701000010 y 20260701000011 escritas — el usuario debe correrlas en el Dashboard antes de las tareas 7/9/12."

---

### Task 3: Source Bryn — JSON de Monitor Inmobiliario (precio 48 barrios + KPIs de stock)

**Files:**
- Create: `lib/market-data/sources/bryn.ts`
- Create: `lib/market-data/__fixtures__/bryn.json` (capturado real)
- Create: `lib/market-data/__fixtures__/map-sample.html` (capturado real, recortado)
- Create: `scripts/capture-market-fixtures.ts`
- Test: `lib/market-data/sources/bryn.test.ts`

**Interfaces:**
- Consumes: `BrynParsed`, `NeighborhoodPrice`, `SourceResult` de `lib/market-data/types.ts`; `normalizeBarrio`, `findByText` de `lib/market-data/neighborhoods.ts`.
- Produces: `fetchBryn(): Promise<SourceResult<BrynParsed>>`, `parseBrynJson(raw: unknown): BrynParsed` (pura, testeable), `parseBarriosFromMapHtml(html: string): BrynBarrioRow[]` (fallback), `BRYN_URL` (exportada para logging).

- [ ] **Step 1: Capturar fixtures reales — escribir `scripts/capture-market-fixtures.ts`**

```ts
/* Captura/actualiza los fixtures REALES de las fuentes de datos de mercado.
 * Correr: node --env-file=.env.local --import tsx scripts/capture-market-fixtures.ts
 * (No requiere env vars salvo SCRAPER_API_KEY para el fixture de Zonaprop.) */
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'

const DIR = join(process.cwd(), 'lib/market-data/__fixtures__')
const BRYN_URL = 'https://script.google.com/macros/s/AKfycbwKtvJPYs-reH0TeR9QLpAtKFdu90HAKY3NeWa5kRUqZ5ViipkGKle8kOPwNMEW4p91Mg/exec?token=bryn-monitor-2026&origen=monitorinmobiliario'

async function main() {
    mkdirSync(DIR, { recursive: true })

    // 1) JSON Bryn (sigue redirects de Apps Script)
    const bryn = await fetch(BRYN_URL, { redirect: 'follow' })
    writeFileSync(join(DIR, 'bryn.json'), await bryn.text())
    console.log('bryn.json', bryn.status)

    // 2) Home de Monitor Inmobiliario → recortar SOLO los <path barrio-path> (fixture liviano)
    const mi = await fetch('https://monitorinmobiliario.com/', { redirect: 'follow' })
    const html = await mi.text()
    const paths = html.match(/<path\b[^>]*barrio-path[^>]*>/g) || []
    writeFileSync(join(DIR, 'map-sample.html'), paths.join('\n'))
    console.log('map-sample.html paths:', paths.length)

    // 3) Infogram embed (composición del stock)
    const ig = await fetch('https://e.infogram.com/09008d4a-dcf6-4acf-aebe-18cb3cfc2f5c?src=embed', { redirect: 'follow' })
    writeFileSync(join(DIR, 'infogram.html'), await ig.text())
    console.log('infogram.html', ig.status)

    // 4) RSS del Colegio de Escribanos
    const rss = await fetch('https://www.colegio-escribanos.org.ar/category/estadisticas-de-escrituras/feed/', { redirect: 'follow' })
    writeFileSync(join(DIR, 'colegio-feed.xml'), await rss.text())
    console.log('colegio-feed.xml', rss.status)

    // 5) Zonaprop Palermo vía ScraperAPI (si hay key)
    if (process.env.SCRAPER_API_KEY) {
        const url = 'https://www.zonaprop.com.ar/barrios/capital-federal/palermo'
        const proxied = `https://api.scraperapi.com?api_key=${process.env.SCRAPER_API_KEY}&country_code=ar&url=${encodeURIComponent(url)}`
        const zp = await fetch(proxied)
        writeFileSync(join(DIR, 'zonaprop-palermo.html'), await zp.text())
        console.log('zonaprop-palermo.html', zp.status)
    } else {
        console.log('SKIP zonaprop (sin SCRAPER_API_KEY)')
    }
}
main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Correr la captura y verificar los fixtures**

Run: `node --env-file=.env.local --import tsx scripts/capture-market-fixtures.ts`
Expected: `bryn.json 200`, `map-sample.html paths: 48`, `infogram.html 200`, `colegio-feed.xml 200` (zonaprop puede SKIP si no hay key — se completa en Task 6).
Verificar: `node -e "const d=require('./lib/market-data/__fixtures__/bryn.json'); console.log(d.barrios.length, !!d.kpis)"` → `48 true`.

- [ ] **Step 3: Escribir los tests que fallan**

```ts
// lib/market-data/sources/bryn.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseBrynJson, parseBarriosFromMapHtml } from './bryn'

const FIX = join(__dirname, '../__fixtures__')
const raw = JSON.parse(readFileSync(join(FIX, 'bryn.json'), 'utf8'))
const mapHtml = readFileSync(join(FIX, 'map-sample.html'), 'utf8')

describe('parseBrynJson', () => {
    it('devuelve los 48 barrios con slug canónico y precio', () => {
        const p = parseBrynJson(raw)
        expect(p.barrios).toHaveLength(48)
        const palermo = p.barrios.find(b => b.slug === 'palermo')!
        expect(palermo.name).toBe('Palermo')
        expect(palermo.price.prom).toBeGreaterThan(500)
        expect(palermo.price.deptos).toBeGreaterThan(100)
        // renta/vm/via son decimales (0.05 = 5%)
        expect(Math.abs(palermo.price.renta ?? 99)).toBeLessThan(1)
    })
    it('extrae los KPIs de stock y el panel de precio CABA', () => {
        const p = parseBrynJson(raw)
        expect(p.stockKpis.stockDeptos).toBeGreaterThan(10000)
        expect(p.cabaPrice.prom).toBeGreaterThan(500)
        expect(p.extraOferta.terrenos).toBeGreaterThan(100)
    })
    it('FALLA RUIDOSO si el shape cambia (no devuelve datos a medias)', () => {
        expect(() => parseBrynJson({ kpis: {}, barrios: [] })).toThrow(/48/)
        expect(() => parseBrynJson(null)).toThrow()
        expect(() => parseBrynJson({ kpis: {}, barrios: raw.barrios.slice(0, 10) })).toThrow(/48/)
    })
})

describe('parseBarriosFromMapHtml (fallback)', () => {
    it('extrae precio/vm/via/renta/deptos de los data-* de los 48 paths', () => {
        const rows = parseBarriosFromMapHtml(mapHtml)
        expect(rows.length).toBe(48)
        const pal = rows.find(r => r.slug === 'palermo')!
        expect(pal.price.prom).toBeGreaterThan(500)
        expect(pal.price.deptos).toBeGreaterThan(100)
    })
})
```

- [ ] **Step 4: Correr tests → FAIL** (`npm test -- lib/market-data/sources/bryn` → "Cannot find module './bryn'").

- [ ] **Step 5: Implementar `lib/market-data/sources/bryn.ts`**

```ts
import type { BrynParsed, BrynBarrioRow, NeighborhoodPrice, SourceResult } from '../types'
import { findByText } from '../neighborhoods'

export const BRYN_URL = 'https://script.google.com/macros/s/AKfycbwKtvJPYs-reH0TeR9QLpAtKFdu90HAKY3NeWa5kRUqZ5ViipkGKle8kOPwNMEW4p91Mg/exec?token=bryn-monitor-2026&origen=monitorinmobiliario'
export const MI_HOME_URL = 'https://monitorinmobiliario.com/'

const num = (v: unknown): number | null => {
    const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
    return Number.isFinite(n) ? n : null
}

/** Parser PURO del JSON de Bryn. FALLA RUIDOSO ante shape inesperado: preferimos
 *  no actualizar el mes (queda el anterior) antes que persistir datos a medias. */
export function parseBrynJson(raw: unknown): BrynParsed {
    const d = raw as { kpis?: Record<string, unknown>; barrios?: unknown[]; _actualizado?: string }
    if (!d || typeof d !== 'object' || !d.kpis || !Array.isArray(d.barrios)) {
        throw new Error('[bryn] shape inesperado: faltan kpis/barrios')
    }
    const barrios: BrynBarrioRow[] = d.barrios.map((b) => {
        const r = b as Record<string, unknown>
        const name = String(r.barrio ?? '')
        const canonical = findByText(name)
        if (!canonical) throw new Error(`[bryn] barrio desconocido: "${name}" — actualizar catálogo`)
        const price: NeighborhoodPrice = {
            prom: num(r.prom), vm: num(r.vm), via: num(r.via),
            usado: num(r.usado), pozo: num(r.pozo), estrenar: num(r.estrenar),
            alq2amb: num(r.alq_2amb), renta: num(r.renta), deptos: num(r.deptos),
        }
        return { slug: canonical.slug, name: canonical.name, price }
    })
    if (barrios.length !== 48) throw new Error(`[bryn] esperaba 48 barrios, llegaron ${barrios.length}`)

    const k = d.kpis
    return {
        actualizado: d._actualizado ?? null,
        cabaPrice: {
            prom: num(k.precio_prom), vm: num(k.precio_vm), via: num(k.precio_via),
            usado: num(k.precio_usado), pozo: num(k.precio_pozo), estrenar: num(k.precio_estrenar),
            alq2amb: num(k.alquiler_2amb), renta: num(k.renta_prom), deptos: num(k.stock_deptos),
        },
        stockKpis: { stockDeptos: num(k.stock_deptos), stockVm: num(k.stock_vm), absorcion: num(k.absorcion) },
        extraOferta: { terrenos: num(k.terrenos_oferta), locales: num(k.locales_oferta), oficinas: num(k.oficinas_oferta) },
        barrios,
    }
}

/** FALLBACK: si el JSON muere, los mismos datos básicos viven en los data-* del
 *  SVG del mapa de la home. data-vm/via/renta vienen como "+6.98%" → decimal. */
export function parseBarriosFromMapHtml(html: string): BrynBarrioRow[] {
    const tags = html.match(/<path\b[^>]*barrio-path[^>]*>/g) || []
    const pct = (s: string | undefined): number | null => {
        if (!s) return null
        const n = parseFloat(s.replace('%', '').replace('+', ''))
        return Number.isFinite(n) ? n / 100 : null
    }
    const attr = (tag: string, name: string): string | undefined =>
        (tag.match(new RegExp(`data-${name}="([^"]*)"`)) || [])[1]
    const rows: BrynBarrioRow[] = []
    const seen = new Set<string>()
    for (const tag of tags) {
        const name = attr(tag, 'n')
        if (!name) continue
        const canonical = findByText(name)
        if (!canonical || seen.has(canonical.slug)) continue // dup villa-ortuzar: 1º gana; el mapa visual se corrige en Task 10
        seen.add(canonical.slug)
        rows.push({
            slug: canonical.slug, name: canonical.name,
            price: {
                prom: parseFloat(attr(tag, 'prom') || '') || null,
                vm: pct(attr(tag, 'vm')), via: pct(attr(tag, 'via')), renta: pct(attr(tag, 'renta')),
                deptos: parseFloat(attr(tag, 'deptos') || '') || null,
                usado: null, pozo: null, estrenar: null, alq2amb: null,
            },
        })
    }
    return rows
}

/** Fetch + parse con fallback. Nunca lanza: devuelve SourceResult. */
export async function fetchBryn(): Promise<SourceResult<BrynParsed>> {
    try {
        const res = await fetch(BRYN_URL, { redirect: 'follow', signal: AbortSignal.timeout(30_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const text = await res.text()
        let raw: unknown
        try { raw = JSON.parse(text) } catch { throw new Error('respuesta no-JSON (¿token rotado?)') }
        return { ok: true, data: parseBrynJson(raw) }
    } catch (e) {
        // Fallback: data-* del mapa de la home (solo barrios; sin kpis de stock)
        try {
            const res = await fetch(MI_HOME_URL, { redirect: 'follow', signal: AbortSignal.timeout(30_000) })
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const barrios = parseBarriosFromMapHtml(await res.text())
            if (barrios.length < 40) throw new Error(`fallback insuficiente: ${barrios.length} barrios`)
            return {
                ok: true,
                data: {
                    actualizado: null, barrios,
                    cabaPrice: { prom: null, vm: null, via: null, usado: null, pozo: null, estrenar: null, alq2amb: null, renta: null, deptos: null },
                    stockKpis: { stockDeptos: null, stockVm: null, absorcion: null },
                    extraOferta: { terrenos: null, locales: null, oficinas: null },
                },
            }
        } catch (e2) {
            return { ok: false, error: `bryn: ${(e as Error).message}; fallback mapa: ${(e2 as Error).message}` }
        }
    }
}
```

- [ ] **Step 6: Correr tests → PASS** (`npm test -- lib/market-data/sources/bryn`).

- [ ] **Step 7: tsc + commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add lib/market-data/sources/bryn.ts lib/market-data/sources/bryn.test.ts lib/market-data/__fixtures__/bryn.json lib/market-data/__fixtures__/map-sample.html lib/market-data/__fixtures__/infogram.html lib/market-data/__fixtures__/colegio-feed.xml scripts/capture-market-fixtures.ts
git commit -m "feat(market-data): source Bryn — JSON 48 barrios + KPIs con fallback al mapa (fixtures reales)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Source Infogram — composición del stock (tipos, antigüedad, vendedor, ant. publicación)

**Files:**
- Create: `lib/market-data/sources/infogram.ts`
- Uses fixture: `lib/market-data/__fixtures__/infogram.html` (capturado en Task 3)
- Test: `lib/market-data/sources/infogram.test.ts`

**Interfaces:**
- Consumes: `StockComposition`, `CompositionSlice`, `SourceResult` de `../types`; el `BrynParsed.stockKpis`/`extraOferta` NO (el merge lo hace ingest — esta fuente solo produce composición).
- Produces: `fetchInfogramComposition(): Promise<SourceResult<InfogramComposition>>`, `parseInfogramHtml(html: string): InfogramComposition` (pura), donde `InfogramComposition = Pick<StockComposition, 'tipos'|'antiguedad'|'vendedor'|'antPublicacion'|'totalInmuebles'>`. Agregar ese alias exportado en `infogram.ts` (no en types.ts).

⚠️ **DISCOVERY OBLIGATORIO:** la estructura interna de `window.infographicData` NO está confirmada — solo que existe y contiene las etiquetas "Departamentos/Antigüedad/Vendedor". El paso 1 la descubre EN EL FIXTURE REAL y el implementador adapta el extractor a lo hallado. Lo que sigue (Steps 3-5) asume la forma típica de Infogram (`data` como arrays de tablas `[ [ [label, value], ... ] ]`) — **ajustar los selectores exactos a lo que muestre el discovery, manteniendo las firmas exportadas y los tests de invariantes**.

- [ ] **Step 1: Discovery — inspeccionar el fixture**

```bash
node -e "
const html = require('fs').readFileSync('lib/market-data/__fixtures__/infogram.html','utf8');
const m = html.match(/window\.infographicData\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/);
if (!m) { console.log('NO ENCONTRADO — buscar variante:'); console.log(html.match(/infographicData[^=]*=/g)); process.exit(1); }
const data = JSON.parse(m[1]);
console.log('claves top:', Object.keys(data));
const walk = (o, path, depth) => {
  if (depth > 4 || !o || typeof o !== 'object') return;
  for (const k of Object.keys(o).slice(0, 20)) {
    const v = o[k];
    const preview = Array.isArray(v) ? 'ARRAY['+v.length+']' : typeof v;
    if (JSON.stringify(v||'').includes('Departamentos')) console.log(path+'.'+k, preview, '← contiene Departamentos');
    walk(v, path+'.'+k, depth+1);
  }
};
walk(data, 'root', 0);
"
```
Expected: imprime la ruta dentro del JSON donde viven las tablas de datos (típico: `root.elements[...].data` o `root...chartData.sheets`). **Documentar la ruta hallada en un comentario del extractor.**

- [ ] **Step 2: Escribir los tests (invariantes, independientes del shape interno)**

```ts
// lib/market-data/sources/infogram.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseInfogramHtml } from './infogram'

const html = readFileSync(join(__dirname, '../__fixtures__/infogram.html'), 'utf8')

describe('parseInfogramHtml', () => {
    it('extrae las 4 composiciones con porcentajes que suman ~100', () => {
        const c = parseInfogramHtml(html)
        expect(c.tipos.length).toBeGreaterThanOrEqual(6)          // 9 tipos típicamente
        expect(c.vendedor.length).toBeGreaterThanOrEqual(2)
        expect(c.antiguedad.length).toBeGreaterThanOrEqual(5)
        expect(c.antPublicacion.length).toBeGreaterThanOrEqual(2)
        for (const serie of [c.tipos, c.vendedor, c.antiguedad, c.antPublicacion]) {
            const sum = serie.reduce((a, s) => a + s.pct, 0)
            expect(sum).toBeGreaterThan(95); expect(sum).toBeLessThan(105)
        }
        expect(c.tipos.find(t => /departamento/i.test(t.label))!.pct).toBeGreaterThan(50)
    })
    it('FALLA RUIDOSO si el HTML no trae infographicData', () => {
        expect(() => parseInfogramHtml('<html></html>')).toThrow(/infographicData/)
    })
})
```

- [ ] **Step 3: Correr tests → FAIL** ("Cannot find module './infogram'").

- [ ] **Step 4: Implementar `lib/market-data/sources/infogram.ts`** (adaptar los selectores internos al discovery del Step 1; ESTA estructura es la esperada según lo conocido)

```ts
import type { CompositionSlice, StockComposition, SourceResult } from '../types'

export const INFOGRAAM_EMBED_URL = 'https://e.infogram.com/09008d4a-dcf6-4acf-aebe-18cb3cfc2f5c?src=embed'

export type InfogramComposition = Pick<StockComposition, 'tipos' | 'antiguedad' | 'vendedor' | 'antPublicacion' | 'totalInmuebles'>

/** Extrae window.infographicData y localiza las 4 series por sus etiquetas.
 *  RUTA INTERNA (documentar la real tras el discovery del Step 1):
 *  el JSON trae las hojas de datos de cada gráfico como matrices [label, value].
 *  Estrategia robusta: aplanar TODAS las matrices [string, number|string][] halladas
 *  y clasificarlas por sus etiquetas conocidas — no depender de índices fijos. */
export function parseInfogramHtml(html: string): InfogramComposition {
    const m = html.match(/window\.infographicData\s*=\s*(\{[\s\S]*?\});?\s*<\/script>/)
    if (!m) throw new Error('[infogram] no encontré window.infographicData (¿cambió el embed?)')
    let data: unknown
    try { data = JSON.parse(m[1]) } catch { throw new Error('[infogram] infographicData no es JSON parseable') }

    // Recolectar toda matriz 2D de pares [label, valor] presente en el JSON.
    const tables: string[][][] = []
    const walk = (o: unknown): void => {
        if (Array.isArray(o)) {
            const looksTable = o.length > 1 && o.every(r => Array.isArray(r))
            if (looksTable) tables.push(o as string[][])
            o.forEach(walk)
        } else if (o && typeof o === 'object') {
            Object.values(o as Record<string, unknown>).forEach(walk)
        }
    }
    walk(data)

    const toSlices = (rows: string[][]): CompositionSlice[] => rows
        .map(r => {
            const label = String(r[0] ?? '').trim()
            // celdas numéricas: puede venir "69.07%" o 69.07 o "79,624"
            const nums = r.slice(1).map(c => parseFloat(String(c).replace(/\./g, m => m).replace(',', '.').replace('%', '')))
                .filter(n => Number.isFinite(n))
            return { label, pct: nums.length ? nums[nums.length - 1] : NaN, count: nums.length > 1 ? nums[0] : null }
        })
        .filter(s => s.label && Number.isFinite(s.pct) && s.pct >= 0 && s.pct <= 100)

    const findSerie = (mustInclude: RegExp[]): CompositionSlice[] => {
        for (const t of tables) {
            const slices = toSlices(t)
            if (mustInclude.every(re => slices.some(s => re.test(s.label)))) return slices
        }
        return []
    }

    const tipos = findSerie([/departamento/i, /casa/i, /terreno/i])
    const vendedor = findSerie([/inmobiliaria/i, /dueñ|duen/i])
    const antiguedad = findSerie([/estrenar/i, /años|anos/i])
    const antPublicacion = findSerie([/d[ií]as/i])
    if (!tipos.length || !vendedor.length || !antiguedad.length || !antPublicacion.length) {
        throw new Error(`[infogram] no pude clasificar las 4 series (tipos:${tipos.length} vend:${vendedor.length} ant:${antiguedad.length} pub:${antPublicacion.length}) — revisar shape`)
    }
    const totalInmuebles = tipos.reduce((a, t) => a + (t.count ?? 0), 0) || null
    return { tipos, vendedor, antiguedad, antPublicacion, totalInmuebles }
}

export async function fetchInfogramComposition(): Promise<SourceResult<InfogramComposition>> {
    try {
        const res = await fetch(INFOGRAAM_EMBED_URL, { redirect: 'follow', signal: AbortSignal.timeout(30_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return { ok: true, data: parseInfogramHtml(await res.text()) }
    } catch (e) {
        return { ok: false, error: `infogram: ${(e as Error).message}` }
    }
}
```

- [ ] **Step 5: Correr tests → PASS.** Si el discovery mostró otra estructura, ajustar SOLO el interior de `parseInfogramHtml` (la firma y los tests de invariantes no cambian). Si los counts no están disponibles, `count` queda `null` y el PDF muestra "—" (contemplado en Task 11).

- [ ] **Step 6: tsc + commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add lib/market-data/sources/infogram.ts lib/market-data/sources/infogram.test.ts
git commit -m "feat(market-data): source Infogram — composición del stock (tipos/antigüedad/vendedor/publicación)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Source Colegio de Escribanos — RSS + imagen oficial + resumen

**Files:**
- Create: `lib/market-data/sources/colegio.ts`
- Uses fixture: `lib/market-data/__fixtures__/colegio-feed.xml` (capturado en Task 3)
- Test: `lib/market-data/sources/colegio.test.ts`

**Interfaces:**
- Consumes: `EscriturasData`, `SourceResult` de `../types`.
- Produces: `fetchColegio(): Promise<SourceResult<ColegioParsed>>`, `parseColegioFeed(xml: string): ColegioParsed` (pura), donde `ColegioParsed = Omit<EscriturasData, 'imageUrl'> & { imageSourceUrl: string | null }` (la subida a Storage y el publicUrl los resuelve ingest en Task 7). Exportar el alias desde `colegio.ts`.

- [ ] **Step 1: Escribir los tests que fallan**

```ts
// lib/market-data/sources/colegio.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseColegioFeed } from './colegio'

const xml = readFileSync(join(__dirname, '../__fixtures__/colegio-feed.xml'), 'utf8')

describe('parseColegioFeed', () => {
    it('toma el item más reciente con título, link y la primera imagen', () => {
        const p = parseColegioFeed(xml)
        expect(p.mesLabel).toMatch(/de 20\d\d|[A-Z][a-z]+ 20\d\d/)     // "Mayo 2026"
        expect(p.articleUrl).toMatch(/^https:\/\/www\.colegio-escribanos\.org\.ar\//)
        expect(p.imageSourceUrl).toMatch(/wp-content\/uploads.*\.(jpg|jpeg|png)/i)
    })
    it('extrae las cifras clave del cuerpo', () => {
        const p = parseColegioFeed(xml)
        expect(p.cantidad).toBeGreaterThan(1000)          // ej. 5435
        expect(p.summary).toContain('escrituras')
        expect(p.summary.length).toBeGreaterThan(60)
        expect(p.summary.length).toBeLessThan(600)
    })
    it('FALLA RUIDOSO con XML sin items', () => {
        expect(() => parseColegioFeed('<rss><channel></channel></rss>')).toThrow(/item/)
    })
})
```

- [ ] **Step 2: Correr tests → FAIL** ("Cannot find module './colegio'").

- [ ] **Step 3: Implementar `lib/market-data/sources/colegio.ts`**

```ts
import * as cheerio from 'cheerio'
import type { EscriturasData, SourceResult } from '../types'

export const COLEGIO_FEED_URL = 'https://www.colegio-escribanos.org.ar/category/estadisticas-de-escrituras/feed/'

export type ColegioParsed = Omit<EscriturasData, 'imageUrl'> & { imageSourceUrl: string | null }

const stripCdata = (s: string) => s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim()

/** Número argentino "5.435" → 5435; "848.932" → 848932. */
const numAr = (s: string | undefined | null): number | null => {
    if (!s) return null
    const n = parseInt(s.replace(/\./g, ''), 10)
    return Number.isFinite(n) ? n : null
}

/** Parser PURO del RSS: item[0] = artículo del mes más reciente (el feed de la
 *  categoría lista SOLO los posts mensuales de escrituras, ya ordenados). */
export function parseColegioFeed(xml: string): ColegioParsed {
    const $ = cheerio.load(xml, { xmlMode: true })
    const item = $('item').first()
    if (!item.length) throw new Error('[colegio] el feed no trae items')

    const title = stripCdata(item.find('title').text())
    const articleUrl = stripCdata(item.find('link').text())
    const contentHtml = stripCdata(item.find('content\\:encoded').text() || item.find('encoded').text())
    if (!articleUrl || !contentHtml) throw new Error('[colegio] item sin link o sin content:encoded')

    // "Cantidad de escrituras de compraventa realizadas en Mayo 2026" → "Mayo 2026"
    const mesLabel = (title.match(/en\s+(.+?)\s*$/i) || [])[1] || title

    const $c = cheerio.load(contentHtml)
    const imageSourceUrl = $c('img').first().attr('src') || null
    const bodyText = $c.root().text().replace(/\s+/g, ' ').trim()

    // Cifras clave (regexes tolerantes al fraseo del Colegio)
    const cantidad = numAr((bodyText.match(/([\d.]{3,})\s+escrituras/i) || [])[1])
        ?? numAr((bodyText.match(/total de\s+([\d.]{3,})/i) || [])[1])
    const viaMatch = bodyText.match(/(-?\d+(?:,\d+)?)\s*%.{0,40}interanual|interanual.{0,40}?(-?\d+(?:,\d+)?)\s*%/i)
    const varInteranual = viaMatch ? (parseFloat((viaMatch[1] || viaMatch[2]).replace(',', '.')) / 100) : null
    const montoTexto = (bodyText.match(/\$\s?[\d.]+ (?:millones|mil millones)/i) || [])[0] || null
    const hipotecas = numAr((bodyText.match(/([\d.]{2,})\s+(?:escrituras\s+)?(?:de\s+)?hipotecas?/i) || [])[1])

    const partes: string[] = []
    if (cantidad) partes.push(`En ${mesLabel} se registraron ${cantidad.toLocaleString('es-AR')} escrituras de compraventa en CABA`)
    if (varInteranual !== null) partes.push(`(${varInteranual > 0 ? '+' : ''}${(varInteranual * 100).toFixed(1).replace('.', ',')}% interanual)`)
    if (montoTexto) partes.push(`por un monto total de ${montoTexto}`)
    const summary = partes.length
        ? partes.join(' ') + '.' + (hipotecas ? ` Se firmaron ${hipotecas.toLocaleString('es-AR')} escrituras con hipoteca.` : '')
        : bodyText.slice(0, 400)

    return { mesLabel, cantidad, varInteranual, montoTexto, hipotecas, articleUrl, imageSourceUrl, summary }
}

export async function fetchColegio(): Promise<SourceResult<ColegioParsed>> {
    try {
        const res = await fetch(COLEGIO_FEED_URL, { redirect: 'follow', signal: AbortSignal.timeout(30_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return { ok: true, data: parseColegioFeed(await res.text()) }
    } catch (e) {
        return { ok: false, error: `colegio: ${(e as Error).message}` }
    }
}
```

- [ ] **Step 4: Correr tests → PASS.** Si alguna cifra no matchea con el fixture real, ajustar el regex Y agregar un caso al test con el texto real — nunca aflojar los asserts de invariantes.

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add lib/market-data/sources/colegio.ts lib/market-data/sources/colegio.test.ts
git commit -m "feat(market-data): source Colegio de Escribanos — RSS, imagen oficial y resumen de cifras

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Source Zonaprop — 6 conteos de tipos de propiedad por barrio (vía ScraperAPI)

**Files:**
- Create: `lib/market-data/sources/zonaprop.ts`
- Create: `scripts/verify-zonaprop-slugs.ts`
- Create fixture: `lib/market-data/__fixtures__/zonaprop-palermo.html` (si Task 3 lo salteó por falta de key)
- Test: `lib/market-data/sources/zonaprop.test.ts`

**Interfaces:**
- Consumes: `PropertyTypesCounts`, `SourceResult` de `../types`; `CABA_BARRIOS`/`findBySlug` de `../neighborhoods` (para `zonapropSlug`).
- Produces: `fetchZonapropTipos(slug: string): Promise<SourceResult<PropertyTypesCounts>>`, `parseZonapropBarrioHtml(html: string): PropertyTypesCounts` (pura), `ZONAPROP_BARRIO_URL(zonapropSlug: string): string`.

⚠️ **DISCOVERY OBLIGATORIO:** los 6 conteos están en el HTML server-rendered, pero el bloque exacto (`__NEXT_DATA__`, JSON-LD, o DOM visible) no está confirmado. El Step 1 lo descubre en el fixture real. La estrategia del parser de abajo es **por capas** (JSON embebido primero, DOM después) — adaptar los selectores al hallazgo manteniendo firma y tests.

- [ ] **Step 1: Capturar el fixture (si falta) y hacer discovery**

```bash
# Si no existe el fixture (Task 3 lo salteó), capturarlo:
node --env-file=.env.local --import tsx scripts/capture-market-fixtures.ts
# Discovery de dónde viven los 6 conteos:
node -e "
const html = require('fs').readFileSync('lib/market-data/__fixtures__/zonaprop-palermo.html','utf8');
console.log('bytes:', html.length);
console.log('__NEXT_DATA__:', html.includes('__NEXT_DATA__'));
console.log('ld+json:', (html.match(/application\/ld\+json/g)||[]).length);
for (const label of ['Departamentos','Terrenos','Locales','Casas','PH','Oficinas']) {
  const i = html.indexOf(label);
  console.log(label, i > -1 ? JSON.stringify(html.slice(Math.max(0,i-120), i+80)) : 'NO ENCONTRADO');
}
"
```
Expected: cada etiqueta aparece con su número cerca (en un blob JSON o en markup). **Anotar el patrón real en el comentario del parser.** Si el HTML llega vacío/bloqueado (<1000 bytes), reintentar con `&render=true` en la URL de ScraperAPI y anotar que ese flag es necesario (costo mayor de créditos).

- [ ] **Step 2: Escribir los tests que fallan**

```ts
// lib/market-data/sources/zonaprop.test.ts
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { parseZonapropBarrioHtml, ZONAPROP_BARRIO_URL } from './zonaprop'

const FIX = join(__dirname, '../__fixtures__/zonaprop-palermo.html')

describe('zonaprop', () => {
    it('arma la URL directa por barrio', () => {
        expect(ZONAPROP_BARRIO_URL('palermo')).toBe('https://www.zonaprop.com.ar/barrios/capital-federal/palermo')
    })
    it.skipIf(!existsSync(FIX))('extrae los 6 conteos del HTML real de Palermo', () => {
        const c = parseZonapropBarrioHtml(readFileSync(FIX, 'utf8'))
        expect(c.departamentos).toBeGreaterThan(1000)   // Palermo: miles de deptos
        expect(c.total).toBeGreaterThan(1000)
        // los 6 campos presentes (pueden ser 0 pero no undefined)
        for (const k of ['departamentos', 'terrenos', 'locales', 'casas', 'ph', 'oficinas'] as const) {
            expect(c[k]).not.toBeUndefined()
        }
    })
    it('FALLA RUIDOSO con HTML sin datos', () => {
        expect(() => parseZonapropBarrioHtml('<html><body>bloqueado</body></html>')).toThrow(/conteos/)
    })
})
```

- [ ] **Step 3: Correr tests → FAIL.**

- [ ] **Step 4: Implementar `lib/market-data/sources/zonaprop.ts`** (capas: JSON embebido → DOM; adaptar al discovery)

```ts
import * as cheerio from 'cheerio'
import type { PropertyTypesCounts, SourceResult } from '../types'

export const ZONAPROP_BARRIO_URL = (zonapropSlug: string) =>
    `https://www.zonaprop.com.ar/barrios/capital-federal/${zonapropSlug}`

const LABELS: Array<[keyof Omit<PropertyTypesCounts, 'total'>, RegExp]> = [
    ['departamentos', /departamentos?/i],
    ['terrenos', /terrenos?/i],
    ['locales', /locales(?:\s+comerciales)?/i],
    ['casas', /casas?/i],
    ['ph', /\bph\b/i],
    ['oficinas', /oficinas?/i],
]

/** Extrae los 6 conteos. Capa 1: pares label/número en el/los blobs JSON embebidos
 *  (__NEXT_DATA__ / preloadedState). Capa 2: texto del DOM ("15.983 Departamentos").
 *  FALLA RUIDOSO si no encuentra al menos departamentos + otros 2 tipos. */
export function parseZonapropBarrioHtml(html: string): PropertyTypesCounts {
    const out: PropertyTypesCounts = {
        departamentos: null, terrenos: null, locales: null, casas: null, ph: null, oficinas: null, total: null,
    }
    const assign = (key: keyof Omit<PropertyTypesCounts, 'total'>, n: number) => {
        if (out[key] === null && Number.isFinite(n) && n >= 0) out[key] = n
    }

    // Capa 1: pares en JSON embebido — busca "label":"Departamentos"..."count":15983 y variantes.
    for (const [key, re] of LABELS) {
        const m = html.match(new RegExp(`"(?:label|name|title)"\\s*:\\s*"[^"]*${re.source}[^"]*"[^}]{0,120}?"(?:count|value|total|amount)"\\s*:\\s*(\\d+)`, 'i'))
            || html.match(new RegExp(`(\\d[\\d.]{1,9})\\s*(?:</[a-z]+>\\s*)*${re.source}`, 'i'))
        if (m) assign(key, parseInt(String(m[1]).replace(/\./g, ''), 10))
    }

    // Capa 2: DOM visible ("• 15.983 Departamentos")
    if (out.departamentos === null) {
        const $ = cheerio.load(html)
        const text = $.root().text().replace(/\s+/g, ' ')
        for (const [key, re] of LABELS) {
            const m = text.match(new RegExp(`([\\d.]{1,9})\\s+${re.source}`, 'i'))
            if (m) assign(key, parseInt(m[1].replace(/\./g, ''), 10))
        }
    }

    const found = LABELS.filter(([k]) => out[k] !== null).length
    if (out.departamentos === null || found < 3) {
        throw new Error(`[zonaprop] no pude extraer los conteos (hallados: ${found}/6) — revisar shape/bloqueo`)
    }
    out.total = LABELS.reduce((a, [k]) => a + (out[k] ?? 0), 0)
    return out
}

/** Fetch de UN barrio vía ScraperAPI (Zonaprop bloquea IPs cloud). */
export async function fetchZonapropTipos(zonapropSlug: string): Promise<SourceResult<PropertyTypesCounts>> {
    const key = process.env.SCRAPER_API_KEY
    if (!key) return { ok: false, error: 'zonaprop: falta SCRAPER_API_KEY' }
    const target = ZONAPROP_BARRIO_URL(zonapropSlug)
    const proxied = `https://api.scraperapi.com?api_key=${key}&country_code=ar&url=${encodeURIComponent(target)}`
    try {
        const res = await fetch(proxied, { signal: AbortSignal.timeout(45_000) })
        if (!res.ok) throw new Error(`HTTP ${res.status} (proxy)`)
        const html = await res.text()
        if (html.length < 1000) throw new Error(`HTML sospechosamente corto (${html.length}b)`)
        return { ok: true, data: parseZonapropBarrioHtml(html) }
    } catch (e) {
        return { ok: false, error: `zonaprop[${zonapropSlug}]: ${(e as Error).message}` }
    }
}
```

- [ ] **Step 5: Correr tests → PASS** (con el fixture real; ajustar la Capa 1/2 según discovery sin tocar firma ni invariantes).

- [ ] **Step 6: Escribir `scripts/verify-zonaprop-slugs.ts`** (verifica los 48 slugs; los 404 se corrigen en `zonapropSlug` del catálogo)

```ts
/* Verifica que los 48 zonapropSlug del catálogo resuelvan página válida vía proxy.
 * Correr: node --env-file=.env.local --import tsx scripts/verify-zonaprop-slugs.ts
 * Salida: lista OK/FAIL por barrio. Los FAIL se corrigen editando zonapropSlug en
 * lib/market-data/neighborhoods.ts (ej. san-nicolas → centro-microcentro). */
import { CABA_BARRIOS } from '../lib/market-data/neighborhoods'
import { fetchZonapropTipos } from '../lib/market-data/sources/zonaprop'

async function main() {
    const barrios = CABA_BARRIOS.filter(b => !b.isGeneral)
    const failed: string[] = []
    for (const b of barrios) {
        const r = await fetchZonapropTipos(b.zonapropSlug)
        console.log(r.ok ? `OK   ${b.slug} (deptos=${r.data.departamentos})` : `FAIL ${b.slug} → ${r.error}`)
        if (!r.ok) failed.push(b.slug)
        await new Promise(res => setTimeout(res, 800))  // gentil con el proxy
    }
    console.log(`\n${barrios.length - failed.length}/48 OK. FAILs:`, failed.join(', ') || '(ninguno)')
}
main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 7: Correr el verificador y corregir el catálogo**

Run: `node --env-file=.env.local --import tsx scripts/verify-zonaprop-slugs.ts`
Expected: mayoría OK. Para cada FAIL, buscar el slug real (Google: `site:zonaprop.com.ar/barrios/capital-federal <barrio>`) y corregir `zonapropSlug` en `lib/market-data/neighborhoods.ts` (típico: `san-nicolas` → `centro-microcentro`). Re-correr hasta 48/48 OK (o documentar en el código los barrios sin página, que quedarán con `property_types=null` → el PDF usa fallback).

- [ ] **Step 8: tsc + commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add lib/market-data/sources/zonaprop.ts lib/market-data/sources/zonaprop.test.ts scripts/verify-zonaprop-slugs.ts lib/market-data/__fixtures__/zonaprop-palermo.html lib/market-data/neighborhoods.ts
git commit -m "feat(market-data): source Zonaprop — 6 conteos por barrio vía ScraperAPI + verificador de slugs

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Ingesta — orquestador + ruta cron `refresh-market-data`

**Files:**
- Create: `lib/market-data/ingest.ts`
- Create: `app/api/cron/refresh-market-data/route.ts`
- Test: `lib/market-data/ingest.test.ts` (helpers puros)

**Interfaces:**
- Consumes: `fetchBryn` (Task 3), `fetchInfogramComposition` (Task 4), `fetchColegio` (Task 5), `fetchZonapropTipos` (Task 6), `currentPeriod` (Task 1), `CABA_BARRIOS`/`ALL_CABA_SLUGS`/`findBySlug` (Task 1), tablas de Task 2.
- Produces: `refreshCore(supabase, period): Promise<CoreStats>`, `refreshZonaprop(supabase, period, limit): Promise<ZonapropStats>`, helpers puros `mergeJsonb(existing, patch)` y `pickPendingSlugs(doneSlugs, allSlugs, limit)`. Ruta `POST/GET /api/cron/refresh-market-data?part=core|zonaprop|all&period=YYYY-MM-DD`.
- ⚠️ Depende de que el usuario haya corrido las migraciones de Task 2 para la prueba real (los unit tests no tocan DB).

**Semántica clave (leer antes de implementar):**
1. **Idempotente y auto-reparable**: upsert por período. Si una fuente falla, NO pisa lo ya guardado de ese período (merge, no replace) y el estado queda `partial`/`failed` con el detalle. La próxima corrida completa lo que falte.
2. **Estado SIEMPRE escrito**: patrón `portal-inquiries` — todo envuelto en try/catch, el estado (`market_data_refresh_state`) se persiste en éxito Y en fallo. Un cron que falla en silencio es el bug histórico de este repo.
3. **Auth dual del cron**: hay DOS secretos coexistiendo (env `CRON_SECRET` de Netlify vs el que mandan los jobs de pg_cron, guardado en `cron_config`). Los crons registrados con el DO-block mandan el de `cron_config` → la ruta DEBE aceptar ambos (patrón `send-report`). Env-only (como `refresh-portal-map`) da 403 con los jobs actuales.
4. **Zonaprop en lotes**: 48 GETs con proxy no entran en `maxDuration=60`. Cada invocación procesa hasta 12 barrios PENDIENTES del período (sin `property_types`) con concurrencia 4 y termina. El job corre cada 2h y se auto-completa; con todo al día, sale temprano (`pending=0`).

- [ ] **Step 1: Tests de helpers puros (fallan)**

```ts
// lib/market-data/ingest.test.ts
import { describe, it, expect } from 'vitest'
import { mergeJsonb, pickPendingSlugs } from './ingest'

describe('mergeJsonb', () => {
    it('el patch pisa solo sus claves; null/undefined del patch NO borra lo existente', () => {
        const existing = { stock: { a: 1 }, escrituras: { b: 2 } }
        expect(mergeJsonb(existing, { stock: { a: 9 } })).toEqual({ stock: { a: 9 }, escrituras: { b: 2 } })
        expect(mergeJsonb(existing, { escrituras: null })).toEqual(existing)
        expect(mergeJsonb(null, { stock: { a: 1 } })).toEqual({ stock: { a: 1 } })
    })
})

describe('pickPendingSlugs', () => {
    it('devuelve los que faltan, respetando el límite', () => {
        expect(pickPendingSlugs(new Set(['a', 'b']), ['a', 'b', 'c', 'd', 'e'], 2)).toEqual(['c', 'd'])
        expect(pickPendingSlugs(new Set(), ['a'], 10)).toEqual(['a'])
        expect(pickPendingSlugs(new Set(['a']), ['a'], 10)).toEqual([])
    })
})
```

- [ ] **Step 2: Correr → FAIL.** Luego implementar `lib/market-data/ingest.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchBryn } from './sources/bryn'
import { fetchInfogramComposition } from './sources/infogram'
import { fetchColegio } from './sources/colegio'
import { fetchZonapropTipos } from './sources/zonaprop'
import { CABA_BARRIOS, ALL_CABA_SLUGS } from './neighborhoods'
import type { StockComposition } from './types'

/** Merge superficial por clave: el patch pisa SOLO sus claves con valor no-nulo.
 *  Así un fallo parcial de fuentes nunca borra datos ya capturados del período. */
export function mergeJsonb<T extends Record<string, unknown>>(
    existing: T | null | undefined,
    patch: Record<string, unknown>,
): Record<string, unknown> {
    const base: Record<string, unknown> = { ...(existing || {}) }
    for (const [k, v] of Object.entries(patch)) {
        if (v !== null && v !== undefined) base[k] = v
    }
    return base
}

export function pickPendingSlugs(done: Set<string>, all: string[], limit: number): string[] {
    return all.filter(s => !done.has(s)).slice(0, limit)
}

async function writeState(
    supabase: SupabaseClient, id: 'core' | 'zonaprop', period: string,
    status: 'ok' | 'partial' | 'failed', error: string | null, stats: Record<string, unknown>,
) {
    const { error: e } = await supabase.from('market_data_refresh_state').upsert({
        id, period, last_run_at: new Date().toISOString(),
        last_status: status, last_error: error, last_stats: stats,
        updated_at: new Date().toISOString(),
    })
    if (e) console.error('[market-data] writeState falló', e)
}

export interface CoreStats { bryn: boolean; infogram: boolean; colegio: boolean; barriosUpserted: number; errors: string[] }

/** Fuentes baratas: Bryn (precio 48 barrios + kpis) + Infogram (composición) +
 *  Colegio (escrituras: baja el JPEG a Storage). Corre diario (idempotente). */
export async function refreshCore(supabase: SupabaseClient, period: string): Promise<CoreStats> {
    const stats: CoreStats = { bryn: false, infogram: false, colegio: false, barriosUpserted: 0, errors: [] }
    try {
        const [bryn, infogram, colegio] = await Promise.all([fetchBryn(), fetchInfogramComposition(), fetchColegio()])

        // --- fila CABA existente (merge, no replace) ---
        const { data: existing } = await supabase.from('market_snapshot_caba')
            .select('stock, escrituras, price_caba, source_meta').eq('period', period).maybeSingle()

        const patch: Record<string, unknown> = {}
        const meta: Record<string, unknown> = { ...(existing?.source_meta || {}) }

        if (bryn.ok) {
            stats.bryn = true
            patch.price_caba = bryn.data.cabaPrice
            // El stock combina kpis (Bryn) + composición (Infogram): merge sobre lo previo.
            const prevStock = (existing?.stock || {}) as Partial<StockComposition>
            patch.stock = mergeJsonb(prevStock as Record<string, unknown>, {
                stockDeptos: bryn.data.stockKpis.stockDeptos,
                stockVm: bryn.data.stockKpis.stockVm,
                absorcion: bryn.data.stockKpis.absorcion,
            })
            meta.bryn = { ok: true, actualizado: bryn.data.actualizado, at: new Date().toISOString() }
        } else { stats.errors.push(bryn.error); meta.bryn = { ok: false, error: bryn.error } }

        if (infogram.ok) {
            stats.infogram = true
            patch.stock = mergeJsonb((patch.stock || existing?.stock || {}) as Record<string, unknown>, {
                tipos: infogram.data.tipos, antiguedad: infogram.data.antiguedad,
                vendedor: infogram.data.vendedor, antPublicacion: infogram.data.antPublicacion,
                totalInmuebles: infogram.data.totalInmuebles,
            })
            meta.infogram = { ok: true, at: new Date().toISOString() }
        } else { stats.errors.push(infogram.error); meta.infogram = { ok: false, error: infogram.error } }

        if (colegio.ok) {
            stats.colegio = true
            let imageUrl: string | null = null
            if (colegio.data.imageSourceUrl) {
                try {
                    const img = await fetch(colegio.data.imageSourceUrl, { signal: AbortSignal.timeout(30_000) })
                    if (img.ok) {
                        const buf = Buffer.from(await img.arrayBuffer())
                        const path = `escrituras/${period}.jpg`
                        const { error: upErr } = await supabase.storage.from('market-data')
                            .upload(path, buf, { contentType: 'image/jpeg', upsert: true })
                        if (!upErr) imageUrl = supabase.storage.from('market-data').getPublicUrl(path).data.publicUrl
                        else stats.errors.push(`storage escrituras: ${upErr.message}`)
                    }
                } catch (e) { stats.errors.push(`descarga imagen colegio: ${(e as Error).message}`) }
            }
            const { imageSourceUrl: _drop, ...rest } = colegio.data
            patch.escrituras = { ...rest, imageUrl }
            meta.colegio = { ok: true, at: new Date().toISOString() }
        } else { stats.errors.push(colegio.error); meta.colegio = { ok: false, error: colegio.error } }

        if (Object.keys(patch).length > 0) {
            const { error: upErr } = await supabase.from('market_snapshot_caba')
                .upsert({ period, ...mergeJsonb(existing as Record<string, unknown> | null, patch), source_meta: meta, captured_at: new Date().toISOString() }, { onConflict: 'period' })
            if (upErr) throw new Error(`upsert caba: ${upErr.message}`)
        }

        // --- precio por barrio (48 filas) ---
        if (bryn.ok) {
            const { data: nbRows, error: nbErr } = await supabase.from('neighborhoods').select('id, slug')
            if (nbErr || !nbRows?.length) throw new Error(`neighborhoods: ${nbErr?.message || 'vacía — ¿corriste las migraciones?'}`)
            const idBySlug = new Map(nbRows.map(r => [r.slug as string, r.id as string]))
            const rows = bryn.data.barrios
                .filter(b => idBySlug.has(b.slug))
                .map(b => ({
                    neighborhood_id: idBySlug.get(b.slug)!, neighborhood_slug: b.slug, period,
                    price: b.price, captured_at: new Date().toISOString(),
                }))
            const { error: bErr } = await supabase.from('market_snapshot_neighborhood')
                .upsert(rows, { onConflict: 'neighborhood_id,period' })
            if (bErr) throw new Error(`upsert barrios: ${bErr.message}`)
            stats.barriosUpserted = rows.length
        }

        const status = stats.errors.length === 0 ? 'ok' : (stats.bryn || stats.infogram || stats.colegio) ? 'partial' : 'failed'
        await writeState(supabase, 'core', period, status, stats.errors.join(' | ') || null, stats as unknown as Record<string, unknown>)
        return stats
    } catch (e) {
        stats.errors.push((e as Error).message)
        await writeState(supabase, 'core', period, 'failed', stats.errors.join(' | '), stats as unknown as Record<string, unknown>)
        return stats
    }
}

export interface ZonapropStats { processed: number; okCount: number; pending: number; errors: string[] }

/** Lote de tipos-de-propiedad: hasta `limit` barrios pendientes del período,
 *  concurrencia 4. Auto-completable corriendo cada 2h. */
export async function refreshZonaprop(supabase: SupabaseClient, period: string, limit = 12): Promise<ZonapropStats> {
    const stats: ZonapropStats = { processed: 0, okCount: 0, pending: 0, errors: [] }
    try {
        const { data: doneRows, error: qErr } = await supabase.from('market_snapshot_neighborhood')
            .select('neighborhood_slug, property_types').eq('period', period)
        if (qErr) throw new Error(qErr.message)
        const done = new Set((doneRows || []).filter(r => r.property_types).map(r => r.neighborhood_slug as string))
        const targets = pickPendingSlugs(done, ALL_CABA_SLUGS, limit)
        stats.pending = ALL_CABA_SLUGS.length - done.size - targets.length

        const { data: nbRows } = await supabase.from('neighborhoods').select('id, slug, zonaprop_slug')
        const bySlug = new Map((nbRows || []).map(r => [r.slug as string, r]))

        const CONCURRENCY = 4
        for (let i = 0; i < targets.length; i += CONCURRENCY) {
            const batch = targets.slice(i, i + CONCURRENCY)
            const results = await Promise.all(batch.map(async slug => {
                const nb = bySlug.get(slug)
                const zp = (nb?.zonaprop_slug as string) || CABA_BARRIOS.find(b => b.slug === slug)?.zonapropSlug || slug
                return { slug, nb, result: await fetchZonapropTipos(zp) }
            }))
            for (const { slug, nb, result } of results) {
                stats.processed++
                if (result.ok && nb) {
                    const { error: uErr } = await supabase.from('market_snapshot_neighborhood').upsert({
                        neighborhood_id: nb.id, neighborhood_slug: slug, period,
                        property_types: result.data, captured_at: new Date().toISOString(),
                    }, { onConflict: 'neighborhood_id,period' })
                    if (uErr) stats.errors.push(`${slug}: upsert ${uErr.message}`)
                    else stats.okCount++
                } else if (!result.ok) stats.errors.push(result.error)
            }
        }
        const status = stats.errors.length === 0 ? 'ok' : stats.okCount > 0 ? 'partial' : (stats.processed === 0 ? 'ok' : 'failed')
        await writeState(supabase, 'zonaprop', period, status, stats.errors.slice(0, 5).join(' | ') || null,
            { ...stats, doneTotal: done.size + stats.okCount, total: ALL_CABA_SLUGS.length })
        return stats
    } catch (e) {
        stats.errors.push((e as Error).message)
        await writeState(supabase, 'zonaprop', period, 'failed', stats.errors.join(' | '), stats as unknown as Record<string, unknown>)
        return stats
    }
}
```

**Nota de tipos:** el upsert por barrio del `refreshCore` NO incluye `property_types` y el de `refreshZonaprop` NO incluye `price` — Postgres `upsert` con columnas parciales pisa las columnas ausentes con... **NO**: el upsert de Supabase hace INSERT ... ON CONFLICT DO UPDATE **solo de las columnas presentes en el payload** — las ausentes se conservan en el UPDATE. Verificado por el uso en el repo. (Si el implementador duda: probarlo en la verificación real del Step 5.)

- [ ] **Step 3: Correr tests de helpers → PASS.**

- [ ] **Step 4: Implementar `app/api/cron/refresh-market-data/route.ts`** (auth dual, patrón send-report)

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refreshCore, refreshZonaprop } from '@/lib/market-data/ingest'
import { currentPeriod } from '@/lib/market-data/period'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function admin() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Auth DUAL: env CRON_SECRET O el secreto de cron_config (los jobs de pg_cron
 *  mandan este último — ver CLAUDE.md "2 secretos coexisten"). */
async function isAuthorized(req: NextRequest): Promise<boolean> {
    const secret = req.headers.get('x-cron-secret')
    if (!secret) return false
    if (process.env.CRON_SECRET && secret === process.env.CRON_SECRET) return true
    try {
        const { data } = await admin().from('cron_config').select('value').eq('key', 'send_report').maybeSingle()
        return !!data?.value && secret === data.value
    } catch { return false }
}

async function run(req: NextRequest) {
    if (!(await isAuthorized(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const { searchParams } = new URL(req.url)
    const part = searchParams.get('part') || 'all'
    const period = searchParams.get('period') || currentPeriod()
    if (!/^\d{4}-\d{2}-01$/.test(period)) return NextResponse.json({ error: 'period inválido (YYYY-MM-01)' }, { status: 400 })

    const supabase = admin()
    const out: Record<string, unknown> = { period, part }
    if (part === 'core' || part === 'all') out.core = await refreshCore(supabase, period)
    if (part === 'zonaprop' || part === 'all') out.zonaprop = await refreshZonaprop(supabase, period, 12)
    return NextResponse.json(out)
}

export async function POST(req: NextRequest) { return run(req) }
export async function GET(req: NextRequest) { return run(req) }
```

- [ ] **Step 5: Verificación real local** (requiere migraciones de Task 2 corridas + `.env.local`)

```bash
# levantar dev server y disparar la ingesta core contra la DB real:
npm run dev &  # (o usar el dev server ya corriendo)
sleep 8
curl -s -X POST "http://localhost:3000/api/cron/refresh-market-data?part=core" \
  -H "x-cron-secret: $(node --env-file=.env.local -e 'console.log(process.env.CRON_SECRET||"")')" | head -c 600
```
Expected: JSON con `core: { bryn: true, infogram: true, colegio: true, barriosUpserted: 48, errors: [] }`. Luego `part=zonaprop` 4 veces → `okCount` acumulando hasta 48. Verificar en la DB (usuario o `node` script con service key): `select period, jsonb_typeof(stock), jsonb_typeof(escrituras) from market_snapshot_caba;` y `select count(*) from market_snapshot_neighborhood where property_types is not null;`.

- [ ] **Step 6: tsc + commit**

```bash
npx tsc --noEmit -p tsconfig.json
git add lib/market-data/ingest.ts lib/market-data/ingest.test.ts app/api/cron/refresh-market-data/route.ts
git commit -m "feat(market-data): ingesta idempotente (core + zonaprop por lotes) + ruta cron con auth dual

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Migración pg_cron — registrar los 2 jobs

**Files:**
- Create: `supabase/migrations/20260701000012_cron_market_data.sql`

**Interfaces:**
- Consumes: la ruta de Task 7 **deployada en producción** (correr esta migración ANTES del deploy = 404s inofensivos pero ruidosos).
- Produces: jobs `market-data-core` (diario 09:15 UTC) y `market-data-zonaprop` (cada 2h) en pg_cron.
- ⚠️ **Acción del usuario**: correr en el Dashboard DESPUÉS de que el deploy con Task 7 esté live.

- [ ] **Step 1: Escribir la migración** (patrón DO-block que copia el secreto de un cron existente — `20260606000002_cron_publish_listings.sql`)

```sql
-- Cron de datos de mercado (pg_cron — las Netlify scheduled functions no disparan).
-- CORRER DESPUÉS del deploy que incluye /api/cron/refresh-market-data.
-- Copia el comando (con el secreto) de cualquier cron existente y cambia la URL.
DO $$
DECLARE
  v_cmd text;
  v_core text;
  v_zp text;
BEGIN
  SELECT command INTO v_cmd FROM cron.job
  WHERE command ILIKE '%/api/cron/%'
    AND jobname NOT IN ('market-data-core','market-data-zonaprop')
  LIMIT 1;
  IF v_cmd IS NULL THEN
    RAISE EXCEPTION 'No encontré ningún cron que pegue a /api/cron/. Corré: SELECT jobname, command FROM cron.job;';
  END IF;

  v_core := regexp_replace(v_cmd, 'https?://[^'']*?/api/cron/[a-z0-9-]+(\?[^'']*)?',
            'https://inmodf.com.ar/api/cron/refresh-market-data?part=core');
  v_zp   := regexp_replace(v_cmd, 'https?://[^'']*?/api/cron/[a-z0-9-]+(\?[^'']*)?',
            'https://inmodf.com.ar/api/cron/refresh-market-data?part=zonaprop');

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='market-data-core') THEN PERFORM cron.unschedule('market-data-core'); END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='market-data-zonaprop') THEN PERFORM cron.unschedule('market-data-zonaprop'); END IF;

  -- core: diario 09:15 UTC (barato: 3 GETs). Mantiene fresco el mes vigente y
  -- levanta el artículo de escrituras cuando el Colegio lo publica (~día 23).
  PERFORM cron.schedule('market-data-core', '15 9 * * *', v_core);
  -- zonaprop: cada 2h, 12 barrios por corrida; con el período completo sale
  -- temprano (pending=0, costo ≈ 1 query). Tras el cambio de mes se auto-completa en ~8h.
  PERFORM cron.schedule('market-data-zonaprop', '0 */2 * * *', v_zp);
  RAISE NOTICE 'OK: market-data-core + market-data-zonaprop registrados.';
END $$;

-- VERIFICACIÓN (3 capas):
--   1. SELECT jobname, schedule FROM cron.job WHERE jobname LIKE 'market-data%';
--   2. SELECT status, return_message FROM cron.job_run_details
--        WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname LIKE 'market-data%')
--        ORDER BY start_time DESC LIMIT 5;
--   3. SELECT status_code, created FROM net._http_response ORDER BY created DESC LIMIT 5;  -- esperar 200
--   4. SELECT * FROM market_data_refresh_state;   -- last_status='ok'
```

- [ ] **Step 2: Commit + avisar**

```bash
git add supabase/migrations/20260701000012_cron_market_data.sql
git commit -m "feat(market-data): migración pg_cron — jobs market-data-core (diario) y zonaprop (cada 2h)

Correr en el Dashboard DESPUÉS del deploy de la ruta.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```
**Reportar:** "⚠️ Migración 20260701000012 lista — correrla DESPUÉS del deploy a main."

---

### Task 9: Resolver + APIs de lectura (`/api/market-data`, `/api/neighborhoods`)

**Files:**
- Create: `lib/market-data/resolver.ts`
- Create: `app/api/market-data/route.ts`
- Create: `app/api/neighborhoods/route.ts`
- Test: `lib/market-data/resolver.test.ts`

**Interfaces:**
- Consumes: tablas de Task 2; `MarketDataForReport`, `PropertyTypesCounts` (Task 1); `findBySlug`, `GENERAL_SLUG`, `CABA_BARRIOS` (Task 1); `getUser` de `@/lib/auth/get-user` (existente).
- Produces: `getMarketData(supabase, slug, period): Promise<MarketDataForReport | null>` y `sumPropertyTypes(rows): PropertyTypesCounts` (pura). API: `GET /api/market-data?neighborhood=<slug>&period=<YYYY-MM-01>` → `{ data: MarketDataForReport | null }`; `GET /api/neighborhoods` → `{ data: {slug,name,isGeneral}[] }`.
- **Cadena de fallbacks** (contrato para el PDF): fila exacta `(slug, period)` → si falta, la fila del **último período ≤ period** → si falta, el **último período disponible**. CABA idem por `period`. Si no hay NINGÚN snapshot → `null` (el caller usa el camino legacy de imágenes). `resolvedPeriod` = el período efectivamente servido.

- [ ] **Step 1: Tests que fallan** (fake supabase mínimo, chainable)

```ts
// lib/market-data/resolver.test.ts
import { describe, it, expect } from 'vitest'
import { getMarketData, sumPropertyTypes } from './resolver'

// Fake client: .from(t).select().eq()... — resolvemos por tabla con datos en memoria.
function fakeSupabase(cabaRows: any[], nbRows: any[]) {
    const mk = (rows: any[]) => {
        const q: any = {
            _rows: rows, _filters: [] as Array<(r: any) => boolean>,
            select() { return q },
            eq(col: string, val: any) { q._filters.push((r: any) => r[col] === val); return q },
            lte(col: string, val: any) { q._filters.push((r: any) => r[col] <= val); return q },
            order(col: string, { ascending }: any = { ascending: true }) {
                q._rows = [...q._rows].sort((a, b) => (a[col] < b[col] ? -1 : 1) * (ascending ? 1 : -1)); return q
            },
            limit(n: number) { q._limit = n; return q },
            maybeSingle() { const r = q._apply(); return Promise.resolve({ data: r[0] ?? null, error: null }) },
            then(res: any) { return Promise.resolve({ data: q._apply(), error: null }).then(res) },
            _apply() { let r = q._rows.filter((row: any) => q._filters.every((f: any) => f(row))); if (q._limit) r = r.slice(0, q._limit); return r },
        }
        return q
    }
    return { from: (t: string) => mk(t === 'market_snapshot_caba' ? cabaRows : nbRows) } as any
}

const CABA = [{ period: '2026-06-01', stock: { stockDeptos: 79000 }, escrituras: { cantidad: 5435 }, price_caba: { prom: 2462 } }]
const NB = [
    { neighborhood_slug: 'palermo', period: '2026-06-01', price: { prom: 3403, deptos: 13892 }, property_types: { departamentos: 15983, total: 18360 } },
    { neighborhood_slug: 'recoleta', period: '2026-06-01', price: { prom: 3100 }, property_types: { departamentos: 6980, total: 7800 } },
]

describe('getMarketData', () => {
    it('resuelve barrio + caba para el período exacto', async () => {
        const d = await getMarketData(fakeSupabase(CABA, NB), 'palermo', '2026-06-01')
        expect(d?.neighborhood.name).toBe('Palermo')
        expect(d?.barrio.price?.prom).toBe(3403)
        expect(d?.caba.stock?.stockDeptos).toBe(79000)
        expect(d?.resolvedPeriod).toBe('2026-06-01')
    })
    it('fallback: período pedido sin datos → sirve el último disponible', async () => {
        const d = await getMarketData(fakeSupabase(CABA, NB), 'palermo', '2026-08-01')
        expect(d?.barrio.price?.prom).toBe(3403)
        expect(d?.resolvedPeriod).toBe('2026-06-01')
        expect(d?.period).toBe('2026-08-01')
    })
    it('general: precio = CABA y tipos = suma de todos los barrios', async () => {
        const d = await getMarketData(fakeSupabase(CABA, NB), 'general', '2026-06-01')
        expect(d?.neighborhood.isGeneral).toBe(true)
        expect(d?.barrio.price?.prom).toBe(2462)
        expect(d?.barrio.propertyTypes?.departamentos).toBe(15983 + 6980)
    })
    it('sin ningún snapshot → null (caller usa legacy)', async () => {
        expect(await getMarketData(fakeSupabase([], []), 'palermo', '2026-06-01')).toBeNull()
    })
    it('slug desconocido → null', async () => {
        expect(await getMarketData(fakeSupabase(CABA, NB), 'narnia', '2026-06-01')).toBeNull()
    })
})

describe('sumPropertyTypes', () => {
    it('suma con nulls', () => {
        const s = sumPropertyTypes([{ departamentos: 10, terrenos: null, locales: 1, casas: 2, ph: null, oficinas: 3, total: 16 },
                                    { departamentos: 5, terrenos: 1, locales: null, casas: 0, ph: 2, oficinas: 0, total: 8 }])
        expect(s).toEqual({ departamentos: 15, terrenos: 1, locales: 1, casas: 2, ph: 2, oficinas: 3, total: 24 })
    })
})
```

- [ ] **Step 2: Correr → FAIL.** Implementar `lib/market-data/resolver.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { MarketDataForReport, NeighborhoodPrice, PropertyTypesCounts, StockComposition, EscriturasData } from './types'
import { findBySlug, GENERAL_SLUG } from './neighborhoods'

export function sumPropertyTypes(rows: PropertyTypesCounts[]): PropertyTypesCounts {
    const acc: PropertyTypesCounts = { departamentos: 0, terrenos: 0, locales: 0, casas: 0, ph: 0, oficinas: 0, total: 0 }
    for (const r of rows) {
        for (const k of Object.keys(acc) as (keyof PropertyTypesCounts)[]) acc[k] = (acc[k] || 0) + (r[k] || 0)
    }
    return acc
}

interface CabaRow { period: string; stock: StockComposition | null; escrituras: EscriturasData | null; price_caba: NeighborhoodPrice | null }

/** Última fila CABA con period ≤ pedido; si no hay, la última que exista. */
async function resolveCaba(supabase: SupabaseClient, period: string): Promise<CabaRow | null> {
    const { data: exact } = await supabase.from('market_snapshot_caba')
        .select('period, stock, escrituras, price_caba')
        .lte('period', period).order('period', { ascending: false }).limit(1)
    if (exact?.length) return exact[0] as unknown as CabaRow
    const { data: any } = await supabase.from('market_snapshot_caba')
        .select('period, stock, escrituras, price_caba')
        .order('period', { ascending: false }).limit(1)
    return (any?.[0] as unknown as CabaRow) ?? null
}

export async function getMarketData(
    supabase: SupabaseClient, slug: string, period: string,
): Promise<MarketDataForReport | null> {
    const canonical = findBySlug(slug)
    if (!canonical) return null

    const caba = await resolveCaba(supabase, period)
    if (!caba) return null // sin snapshots → legacy

    let barrioPrice: NeighborhoodPrice | null = null
    let barrioTipos: PropertyTypesCounts | null = null
    let resolvedPeriod = caba.period

    if (canonical.isGeneral) {
        barrioPrice = caba.price_caba
        const { data: allRows } = await supabase.from('market_snapshot_neighborhood')
            .select('property_types').eq('period', caba.period)
        const tipos = (allRows || []).map(r => r.property_types).filter(Boolean) as PropertyTypesCounts[]
        barrioTipos = tipos.length ? sumPropertyTypes(tipos) : null
    } else {
        const { data: rows } = await supabase.from('market_snapshot_neighborhood')
            .select('period, price, property_types')
            .eq('neighborhood_slug', canonical.slug)
            .lte('period', period).order('period', { ascending: false }).limit(1)
        let row = rows?.[0]
        if (!row) {
            const { data: latest } = await supabase.from('market_snapshot_neighborhood')
                .select('period, price, property_types')
                .eq('neighborhood_slug', canonical.slug)
                .order('period', { ascending: false }).limit(1)
            row = latest?.[0]
        }
        if (row) {
            barrioPrice = (row.price as NeighborhoodPrice) ?? null
            barrioTipos = (row.property_types as PropertyTypesCounts) ?? null
            resolvedPeriod = row.period as string
        }
    }

    return {
        period, resolvedPeriod,
        neighborhood: { slug: canonical.slug, name: canonical.name, isGeneral: !!canonical.isGeneral },
        caba: { stock: caba.stock, escrituras: caba.escrituras, price: caba.price_caba },
        barrio: { price: barrioPrice, propertyTypes: barrioTipos },
    }
}
```

- [ ] **Step 3: Correr → PASS.** Implementar las rutas:

```ts
// app/api/market-data/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'
import { getMarketData } from '@/lib/market-data/resolver'
import { currentPeriod } from '@/lib/market-data/period'

export const dynamic = 'force-dynamic'

/** Datos de mercado resueltos para una tasación. Lee con service role (RLS ya
 *  restringe por SELECT authenticated, pero el service role simplifica; el gate
 *  de acceso es getUser()). */
export async function GET(req: NextRequest) {
    const me = await getUser()
    if (!me) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const slug = searchParams.get('neighborhood') || ''
    const period = searchParams.get('period') || currentPeriod()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) return NextResponse.json({ error: 'period inválido' }, { status: 400 })
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const data = await getMarketData(supabase, slug, period)
    return NextResponse.json({ data })
}
```

```ts
// app/api/neighborhoods/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'
import { CABA_BARRIOS } from '@/lib/market-data/neighborhoods'

export const dynamic = 'force-dynamic'

/** Catálogo para el combobox del wizard. DB primero (permite activar/desactivar
 *  y sumar GBA sin deploy); fallback al catálogo estático si la tabla no existe. */
export async function GET() {
    const me = await getUser()
    if (!me) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    try {
        const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
        const { data, error } = await supabase.from('neighborhoods')
            .select('slug, name, is_general').eq('active', true).order('sort_order')
        if (error || !data?.length) throw error || new Error('vacío')
        return NextResponse.json({ data: data.map(r => ({ slug: r.slug, name: r.name, isGeneral: r.is_general })) })
    } catch {
        return NextResponse.json({ data: CABA_BARRIOS.map(b => ({ slug: b.slug, name: b.name, isGeneral: !!b.isGeneral })) })
    }
}
```

- [ ] **Step 4: Verificación + commit**

Run: `npm test -- lib/market-data && npx tsc --noEmit -p tsconfig.json` → PASS/0 errores. Con dev server + migraciones corridas: `curl -s "http://localhost:3000/api/market-data?neighborhood=palermo" -H "Cookie: <sesión válida>"` (o verificar 401 sin cookie — correcto).
```bash
git add lib/market-data/resolver.ts lib/market-data/resolver.test.ts app/api/market-data/route.ts app/api/neighborhoods/route.ts
git commit -m "feat(market-data): resolver con fallbacks + APIs de lectura (market-data, neighborhoods)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 10: Mapa de CABA — módulo generado + script de extracción

**Files:**
- Create: `scripts/extract-caba-map.ts`
- Create (generado): `lib/market-data/caba-map-paths.ts`
- Test: `lib/market-data/caba-map-paths.test.ts`

**Interfaces:**
- Consumes: `normalizeBarrio`, `ALL_CABA_SLUGS` (Task 1); el HTML real de monitorinmobiliario.com.
- Produces: `CABA_MAP_VIEWBOX: string` y `CABA_MAP_PATHS: Array<{ id: string; name: string; d: string; fill: string }>` (48 entradas, ids = slugs canónicos). Consumido por `BarrioPanelPDF` (Task 11).

**Reglas críticas (bugs YA sufridos, no repetir):**
1. Los `<path>` del HTML fuente NO se autocierran → al reconstruir SVG/JSX cada path debe cerrarse (en el módulo solo guardamos data, así que no aplica al render de @react-pdf, pero SÍ al viewBox: calcularlo del **bounding box real** de las coordenadas, no del `<svg>` del documento — el `<svg>` que envuelve es OTRO (un ícono de 24×24)).
2. La fuente trae `data-id="villa-ortuzar"` DUPLICADO y falta `villa-general-mitre`. Regla de corrección: de los dos paths `villa-ortuzar`, el de **centroide con mayor Y** (más al sur en coordenadas SVG) se reasigna a `villa-general-mitre` / "Villa Gral. Mitre".

- [ ] **Step 1: Escribir `scripts/extract-caba-map.ts`**

```ts
/* Genera lib/market-data/caba-map-paths.ts desde el SVG inline de monitorinmobiliario.com.
 * Correr: node --import tsx scripts/extract-caba-map.ts
 * Re-correr solo si la fuente cambia su mapa (el módulo generado se commitea). */
import { writeFileSync } from 'fs'
import { join } from 'path'

const OUT = join(process.cwd(), 'lib/market-data/caba-map-paths.ts')

function centroid(d: string): { x: number; y: number } {
    const pts = [...d.matchAll(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g)]
    let sx = 0, sy = 0
    for (const p of pts) { sx += parseFloat(p[1]); sy += parseFloat(p[2]) }
    return pts.length ? { x: sx / pts.length, y: sy / pts.length } : { x: 0, y: 0 }
}

async function main() {
    const res = await fetch('https://monitorinmobiliario.com/', { redirect: 'follow' })
    const html = await res.text()
    const tags = html.match(/<path\b[^>]*barrio-path[^>]*>/g) || []
    if (tags.length !== 48) throw new Error(`esperaba 48 paths, hallé ${tags.length}`)

    const attr = (tag: string, name: string) => (tag.match(new RegExp(`${name}="([^"]*)"`)) || [])[1] || ''
    let entries = tags.map(tag => ({
        id: attr(tag, 'data-id'), name: attr(tag, 'data-n'),
        d: attr(tag, ' d'), fill: attr(tag, 'fill') || '#2b5c7c',
    }))

    // Fix del bug de la fuente: villa-ortuzar duplicado → el más al SUR es villa-general-mitre.
    const ortuzar = entries.filter(e => e.id === 'villa-ortuzar')
    if (ortuzar.length === 2) {
        const south = ortuzar.reduce((a, b) => centroid(a.d).y > centroid(b.d).y ? a : b)
        south.id = 'villa-general-mitre'
        south.name = 'Villa Gral. Mitre'
        console.log('fix aplicado: villa-ortuzar sur → villa-general-mitre')
    }

    const ids = entries.map(e => e.id)
    if (new Set(ids).size !== 48) throw new Error(`ids duplicados tras el fix: ${ids.filter((v, i) => ids.indexOf(v) !== i).join(',')}`)

    // viewBox del bbox REAL de las coordenadas (+padding), NO del <svg> del documento.
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9
    for (const e of entries) {
        for (const p of e.d.matchAll(/(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g)) {
            const x = parseFloat(p[1]), y = parseFloat(p[2])
            if (x < minX) minX = x; if (x > maxX) maxX = x
            if (y < minY) minY = y; if (y > maxY) maxY = y
        }
    }
    const pad = 6
    const viewBox = `${(minX - pad).toFixed(1)} ${(minY - pad).toFixed(1)} ${(maxX - minX + 2 * pad).toFixed(1)} ${(maxY - minY + 2 * pad).toFixed(1)}`

    const body = `// GENERADO por scripts/extract-caba-map.ts — NO editar a mano.
// Fuente: SVG inline de monitorinmobiliario.com (48 barrios, fix villa-general-mitre aplicado).
export const CABA_MAP_VIEWBOX = '${viewBox}'

export interface CabaMapPath { id: string; name: string; d: string; fill: string }

export const CABA_MAP_PATHS: CabaMapPath[] = ${JSON.stringify(entries, null, 2)}
`
    writeFileSync(OUT, body)
    console.log(`OK: ${entries.length} paths, viewBox=${viewBox} → ${OUT}`)
}
main().catch(e => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Escribir el test (falla — el módulo no existe aún)**

```ts
// lib/market-data/caba-map-paths.test.ts
import { describe, it, expect } from 'vitest'
import { CABA_MAP_PATHS, CABA_MAP_VIEWBOX } from './caba-map-paths'
import { ALL_CABA_SLUGS } from './neighborhoods'

describe('caba-map-paths (generado)', () => {
    it('tiene 48 paths con ids únicos = slugs del catálogo', () => {
        expect(CABA_MAP_PATHS).toHaveLength(48)
        const ids = CABA_MAP_PATHS.map(p => p.id).sort()
        expect(ids).toEqual([...ALL_CABA_SLUGS].sort())
    })
    it('todos los paths tienen geometría y color', () => {
        for (const p of CABA_MAP_PATHS) {
            expect(p.d.length).toBeGreaterThan(50)
            expect(p.fill).toMatch(/^#[0-9a-f]{6}$/i)
        }
    })
    it('viewBox razonable (mapa ~526×603)', () => {
        const [, , w, h] = CABA_MAP_VIEWBOX.split(' ').map(Number)
        expect(w).toBeGreaterThan(400); expect(h).toBeGreaterThan(500)
    })
})
```

- [ ] **Step 3: Generar el módulo y correr tests**

Run: `node --import tsx scripts/extract-caba-map.ts && npm test -- lib/market-data/caba-map-paths`
Expected: "OK: 48 paths..." y tests PASS. Si el mapeo de ids difiere del catálogo (p.ej. la fuente usa otro id), el test lo dice EXACTO — corregir con un mapa de alias dentro del script (documentado), nunca aflojar el test.

- [ ] **Step 4: Verificación VISUAL** (macOS Quick Look — el mapa renderiza los 48 barrios)

```bash
node --import tsx -e "
import { CABA_MAP_PATHS, CABA_MAP_VIEWBOX } from './lib/market-data/caba-map-paths'
import { writeFileSync } from 'fs'
const svg = '<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"526\" height=\"603\" viewBox=\"' + CABA_MAP_VIEWBOX + '\">'
  + CABA_MAP_PATHS.map(p => '<path d=\"' + p.d + '\" fill=\"' + (p.id === 'palermo' ? '#cfe0ef' : p.fill) + '\" stroke=\"#fff\" stroke-width=\"0.8\"/>').join('')
  + '</svg>'
writeFileSync('/tmp/caba-check.svg', svg)
" && rm -rf /tmp/qlmap && mkdir /tmp/qlmap && qlmanage -t -s 800 -o /tmp/qlmap /tmp/caba-check.svg >/dev/null 2>&1 && open /tmp/qlmap/caba-check.svg.png
```
Expected: PNG con el mapa completo de CABA (48 polígonos) y Palermo claro. **Mirar la imagen** (Read del PNG si es un agente) — no solo que el comando salga 0.

- [ ] **Step 5: Commit**

```bash
git add scripts/extract-caba-map.ts lib/market-data/caba-map-paths.ts lib/market-data/caba-map-paths.test.ts
git commit -m "feat(market-data): mapa SVG de CABA como módulo generado (48 barrios, fix villa-general-mitre)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 11: Render PDF — geometría, paleta, 4 secciones data-driven y rama legacy intacta

**Files:**
- Create: `lib/market-data/arc-geometry.ts` + Test: `lib/market-data/arc-geometry.test.ts`
- Create: `components/appraisal/pdf/market/palette.ts`
- Create: `components/appraisal/pdf/market/gauges.tsx`
- Create: `components/appraisal/pdf/market/StockDashboardPDF.tsx`
- Create: `components/appraisal/pdf/market/EscriturasPDF.tsx`
- Create: `components/appraisal/pdf/market/BarrioPanelPDF.tsx`
- Create: `components/appraisal/pdf/market/TiposPDF.tsx`
- Create: `scripts/render-market-pdf-test.tsx` (verificación por render real, precedente: `scripts/render-meta-audit-pdf.tsx`)
- Modify: `components/appraisal/pdf/PDFReport.tsx` (páginas 3-4, líneas ~561-617 + props + variable `neighborhood`)

**Interfaces:**
- Consumes: `MarketDataForReport`, `StockComposition`, `EscriturasData`, `NeighborhoodPrice`, `PropertyTypesCounts`, `CompositionSlice` (Task 1); `CABA_MAP_PATHS`, `CABA_MAP_VIEWBOX` (Task 10); `styles`, `colors` de `./PDFStyles` (existente).
- Produces: `PDFReportProps` gana `marketData?: MarketDataForReport | null` y `neighborhoodName?: string`. Componentes `StockDashboardPDF({stock})`, `EscriturasPDF({escrituras})`, `BarrioPanelPDF({name, price, highlightSlug, isGeneral})`, `TiposPDF({name, tipos, isGeneral})`; helpers `donutSlicePath(cx,cy,rOuter,rInner,startDeg,endDeg)`, `slicesToArcs(slices,startDeg,totalDeg)`, `fmtInt(n)`, `fmtPct(decimal)`.
- **Regla sagrada:** con `marketData` ausente/null el documento renderiza las páginas 3-4 EXACTAMENTE como hoy (mismo markup de imágenes). Con `marketData` presente, cada sección usa su gráfico data-driven y, si SU dato puntual falta (ej. zonaprop pendiente), cae al bloque de imagen legacy de ESE slot.

- [ ] **Step 1: Tests de geometría (fallan)**

```ts
// lib/market-data/arc-geometry.test.ts
import { describe, it, expect } from 'vitest'
import { polarPoint, donutSlicePath, slicesToArcs } from './arc-geometry'

describe('arc-geometry', () => {
    it('polarPoint: 0°=arriba, 90°=derecha (sentido horario)', () => {
        expect(polarPoint(0, 0, 10, 0).y).toBeCloseTo(-10)
        expect(polarPoint(0, 0, 10, 90).x).toBeCloseTo(10)
        expect(polarPoint(0, 0, 10, 180).y).toBeCloseTo(10)
    })
    it('donutSlicePath produce un path SVG válido sin NaN', () => {
        const p = donutSlicePath(100, 100, 80, 50, -90, 30)
        expect(p).toMatch(/^M .* A .* L .* A .* Z$/)
        expect(p).not.toContain('NaN')
    })
    it('slicesToArcs reparte el total angular por pct y omite slices vacíos', () => {
        const arcs = slicesToArcs([{ pct: 50 }, { pct: 0 }, { pct: 50 }], -90, 180)
        expect(arcs).toHaveLength(2)
        expect(arcs[0].startDeg).toBe(-90); expect(arcs[0].endDeg).toBeCloseTo(0)
        expect(arcs[1].endDeg).toBeCloseTo(90)
    })
    it('un slice de 100% en dona completa no rompe el arco (clamp <360°)', () => {
        const [arc] = slicesToArcs([{ pct: 100 }], 0, 360)
        expect(arc.endDeg - arc.startDeg).toBeLessThan(360)
        expect(donutSlicePath(0, 0, 10, 5, arc.startDeg, arc.endDeg)).not.toContain('NaN')
    })
})
```

- [ ] **Step 2: Correr → FAIL. Implementar `lib/market-data/arc-geometry.ts`**

```ts
/** Geometría de donas/semi-donas para @react-pdf (Svg <Path>). Convención:
 *  0° = 12 en punto, ángulos crecen en sentido horario. */
export function polarPoint(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = (angleDeg * Math.PI) / 180
    return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) }
}

/** Path de un segmento de dona (anillo) entre startDeg y endDeg. */
export function donutSlicePath(
    cx: number, cy: number, rOuter: number, rInner: number, startDeg: number, endDeg: number,
): string {
    const so = polarPoint(cx, cy, rOuter, startDeg)
    const eo = polarPoint(cx, cy, rOuter, endDeg)
    const ei = polarPoint(cx, cy, rInner, endDeg)
    const si = polarPoint(cx, cy, rInner, startDeg)
    const large = endDeg - startDeg > 180 ? 1 : 0
    const f = (n: number) => n.toFixed(2)
    return `M ${f(so.x)} ${f(so.y)} A ${f(rOuter)} ${f(rOuter)} 0 ${large} 1 ${f(eo.x)} ${f(eo.y)} L ${f(ei.x)} ${f(ei.y)} A ${f(rInner)} ${f(rInner)} 0 ${large} 0 ${f(si.x)} ${f(si.y)} Z`
}

export interface Arc { startDeg: number; endDeg: number; index: number }

/** Reparte totalDeg entre slices por pct. Omite pct<=0. Clampa a 359.99° (un
 *  arco de 360° exactos degenera: mismo punto inicio/fin). */
export function slicesToArcs(slices: Array<{ pct: number }>, startDeg: number, totalDeg: number): Arc[] {
    const total = slices.reduce((a, s) => a + Math.max(0, s.pct), 0) || 100
    const maxDeg = Math.min(totalDeg, 359.99)
    let acc = startDeg
    const out: Arc[] = []
    slices.forEach((s, index) => {
        if (s.pct <= 0) return
        const sweep = (Math.max(0, s.pct) / total) * maxDeg
        out.push({ startDeg: acc, endDeg: acc + sweep, index })
        acc += sweep
    })
    return out
}

/** Formatos es-AR sin depender de ICU del runtime. */
export const fmtInt = (n: number | null | undefined): string =>
    n === null || n === undefined ? '—' : String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

export const fmtPct = (decimal: number | null | undefined, digits = 1): string =>
    decimal === null || decimal === undefined ? '—'
        : `${decimal > 0 ? '+' : ''}${(decimal * 100).toFixed(digits).replace('.', ',')}%`
```

- [ ] **Step 3: Correr → PASS. Implementar paleta y gauges**

```ts
// components/appraisal/pdf/market/palette.ts
/** Sistema de color de las gráficas de mercado (mockups aprobados 2026-07-01). */
export const MKT = {
    azul: '#1a5490', navy: '#0f2f4d', verde: '#2e9e5b', rojo: '#d64545',
    gris: '#6b7a8d', linea: '#e6ebf0', fondoSuave: '#f5f8fb',
    // 9 tipos de inmueble (orden de la tabla original)
    tipos: ['#16324a', '#2b7cb8', '#bcd8ec', '#3aa6bd', '#6fae3e', '#b2c63f', '#7fa8c4', '#8a97a3', '#111111'],
    vendedor: ['#2b7cb8', '#6fae3e'],
    antiguedad: ['#16324a', '#2b7cb8', '#bcd8ec', '#8a97a3', '#3aa6bd', '#6fae3e', '#b2c63f'],
    publicacion: ['#2b7cb8', '#6fae3e'],
    donutTipos: ['#1a5490', '#4a86bf', '#e8a33d', '#d64545', '#2e9e5b', '#8a6bb0'],
    mapaResaltado: '#cfe0ef', mapaBorde: '#e4cd7e',
}
```

```tsx
// components/appraisal/pdf/market/gauges.tsx
import React from 'react'
import { Svg, Path } from '@react-pdf/renderer'
import { donutSlicePath, slicesToArcs } from '@/lib/market-data/arc-geometry'

interface GaugeSlice { pct: number; color: string }

/** Semi-dona (barrido superior, -90°→+90°). width = diámetro; height = width/2. */
export function SemiDonutPDF({ width, thickness, slices }: { width: number; thickness: number; slices: GaugeSlice[] }) {
    const r = width / 2
    const arcs = slicesToArcs(slices, -90, 180)
    return (
        <Svg width={width} height={r + 2} viewBox={`0 0 ${width} ${r + 2}`}>
            {arcs.map(a => (
                <Path key={a.index} d={donutSlicePath(r, r, r - 1, r - thickness, a.startDeg, a.endDeg)} fill={slices[a.index].color} />
            ))}
        </Svg>
    )
}

/** Dona completa. */
export function DonutPDF({ size, thickness, slices }: { size: number; thickness: number; slices: GaugeSlice[] }) {
    const r = size / 2
    const arcs = slicesToArcs(slices, 0, 360)
    return (
        <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {arcs.map(a => (
                <Path key={a.index} d={donutSlicePath(r, r, r - 1, r - thickness, a.startDeg, a.endDeg)} fill={slices[a.index].color} />
            ))}
        </Svg>
    )
}
```

- [ ] **Step 4: Implementar las 4 secciones**

```tsx
// components/appraisal/pdf/market/StockDashboardPDF.tsx
import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import type { StockComposition, CompositionSlice } from '@/lib/market-data/types'
import { fmtInt, fmtPct } from '@/lib/market-data/arc-geometry'
import { SemiDonutPDF } from './gauges'
import { MKT } from './palette'

const S = {
    row: { flexDirection: 'row' as const, gap: 14 },
    cell: { fontSize: 8, color: '#3a4a5c', padding: 3 },
    th: { fontSize: 7, color: '#ffffff', backgroundColor: MKT.navy, padding: 4, fontWeight: 700 as const },
    legendItem: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 4, marginBottom: 2 },
    dot: { width: 7, height: 7, borderRadius: 2 },
    legendText: { fontSize: 7, color: '#3a4a5c', flex: 1 },
    legendPct: { fontSize: 7, fontWeight: 700 as const, color: MKT.navy },
    gaugeTitle: { fontSize: 8, fontWeight: 700 as const, color: '#ffffff', backgroundColor: MKT.navy, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 10, marginTop: 4 },
}

function Legend({ slices, palette }: { slices: CompositionSlice[]; palette: string[] }) {
    return (
        <View style={{ marginTop: 4, width: '100%' }}>
            {slices.map((s, i) => (
                <View key={s.label} style={S.legendItem}>
                    <View style={[S.dot, { backgroundColor: palette[i % palette.length] }]} />
                    <Text style={S.legendText}>{s.label}</Text>
                    <Text style={S.legendPct}>{s.pct.toFixed(1).replace('.', ',')}%</Text>
                </View>
            ))}
        </View>
    )
}

export function StockDashboardPDF({ stock }: { stock: StockComposition }) {
    const withColors = (sl: CompositionSlice[], pal: string[]) => sl.map((s, i) => ({ pct: s.pct, color: pal[i % pal.length] }))
    return (
        <View>
            {/* hero */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginBottom: 10 }}>
                <Text style={{ fontSize: 26, fontWeight: 800, color: MKT.azul }}>{fmtInt(stock.stockDeptos)}</Text>
                <Text style={{ fontSize: 9, color: MKT.gris }}>deptos en venta</Text>
                {stock.stockVm !== null && (
                    <Text style={{ fontSize: 9, fontWeight: 700, color: stock.stockVm >= 0 ? MKT.verde : MKT.rojo }}>
                        {fmtPct(stock.stockVm)} mensual
                    </Text>
                )}
                {stock.absorcion !== null && (
                    <Text style={{ fontSize: 9, color: MKT.gris }}>· absorción {stock.absorcion.toFixed(1).replace('.', ',')} meses</Text>
                )}
            </View>
            {/* tabla + gauge principal */}
            <View style={S.row}>
                <View style={{ width: 170 }}>
                    <View style={{ flexDirection: 'row' }}>
                        <Text style={[S.th, { flex: 1.6 }]}>TIPO</Text>
                        <Text style={[S.th, { flex: 1, textAlign: 'right' }]}>CANTIDAD</Text>
                        <Text style={[S.th, { flex: 0.6, textAlign: 'right' }]}>%</Text>
                    </View>
                    {stock.tipos.map((t, i) => (
                        <View key={t.label} style={{ flexDirection: 'row', backgroundColor: i % 2 ? MKT.fondoSuave : '#ffffff' }}>
                            <Text style={[S.cell, { flex: 1.6 }]}>{t.label}</Text>
                            <Text style={[S.cell, { flex: 1, textAlign: 'right' }]}>{fmtInt(t.count ?? null)}</Text>
                            <Text style={[S.cell, { flex: 0.6, textAlign: 'right' }]}>{t.pct.toFixed(1).replace('.', ',')}%</Text>
                        </View>
                    ))}
                    {stock.totalInmuebles ? (
                        <View style={{ flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: MKT.azul, backgroundColor: '#eaf1f8' }}>
                            <Text style={[S.cell, { flex: 1.6, fontWeight: 700 }]}>Inmuebles</Text>
                            <Text style={[S.cell, { flex: 1, textAlign: 'right', fontWeight: 700 }]}>{fmtInt(stock.totalInmuebles)}</Text>
                            <Text style={[S.cell, { flex: 0.6 }]} />
                        </View>
                    ) : null}
                </View>
                <View style={{ flex: 1, alignItems: 'center' }}>
                    <SemiDonutPDF width={210} thickness={34} slices={withColors(stock.tipos, MKT.tipos)} />
                    <Text style={S.gaugeTitle}>Tipo de inmueble en venta</Text>
                </View>
            </View>
            {/* 3 mini-gauges */}
            <View style={[S.row, { marginTop: 14, borderTopWidth: 1, borderTopColor: MKT.linea, paddingTop: 10 }]}>
                {([['Vendedor', stock.vendedor, MKT.vendedor],
                   ['Antigüedad', stock.antiguedad, MKT.antiguedad],
                   ['Ant. publicación', stock.antPublicacion, MKT.publicacion]] as Array<[string, CompositionSlice[], string[]]>)
                    .map(([title, slices, pal]) => (
                        <View key={title} style={{ flex: 1, alignItems: 'center', borderWidth: 1, borderColor: MKT.linea, borderRadius: 8, padding: 6 }}>
                            <SemiDonutPDF width={100} thickness={16} slices={withColors(slices, pal)} />
                            <Text style={[S.gaugeTitle, { fontSize: 7 }]}>{title}</Text>
                            <Legend slices={slices} palette={pal} />
                        </View>
                    ))}
            </View>
        </View>
    )
}
```

```tsx
// components/appraisal/pdf/market/EscriturasPDF.tsx
import React from 'react'
import { View, Text, Image, Link } from '@react-pdf/renderer'
import type { EscriturasData } from '@/lib/market-data/types'
import { MKT } from './palette'

export function EscriturasPDF({ escrituras }: { escrituras: EscriturasData }) {
    return (
        <View>
            {escrituras.imageUrl ? (
                <Image src={escrituras.imageUrl} style={{ width: '100%', borderRadius: 6, marginBottom: 10 }} />
            ) : null}
            <View style={{ backgroundColor: MKT.fondoSuave, borderLeftWidth: 3, borderLeftColor: MKT.azul, padding: 10, borderRadius: 4 }}>
                <Text style={{ fontSize: 10, lineHeight: 1.5, color: '#3a4a5c' }}>{escrituras.summary}</Text>
            </View>
            <Text style={{ fontSize: 7, color: MKT.gris, marginTop: 8, fontStyle: 'italic' }}>
                Fuente: Colegio de Escribanos de la Ciudad de Buenos Aires{escrituras.mesLabel ? ` — ${escrituras.mesLabel}` : ''}.
                {'  '}<Link src={escrituras.articleUrl} style={{ color: MKT.gris }}>Ver informe original</Link>
            </Text>
        </View>
    )
}
```

```tsx
// components/appraisal/pdf/market/BarrioPanelPDF.tsx
import React from 'react'
import { View, Text, Svg, Path } from '@react-pdf/renderer'
import type { NeighborhoodPrice } from '@/lib/market-data/types'
import { CABA_MAP_PATHS, CABA_MAP_VIEWBOX } from '@/lib/market-data/caba-map-paths'
import { fmtInt, fmtPct } from '@/lib/market-data/arc-geometry'
import { MKT } from './palette'

function Card({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
    return (
        <View style={{ width: wide ? '100%' : '31.5%', backgroundColor: MKT.fondoSuave, borderWidth: 1, borderColor: MKT.linea, borderRadius: 6, padding: 8 }}>
            <Text style={{ fontSize: 6.5, color: MKT.gris, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</Text>
            <Text style={{ fontSize: wide ? 18 : 12, fontWeight: 800, color: MKT.navy, marginTop: 2 }}>{value}</Text>
        </View>
    )
}

/** Panel de precios + mapa choropleth con el barrio resaltado (sin tooltip —
 *  decisión aprobada: solo relleno claro + contorno dorado). */
export function BarrioPanelPDF({ name, price, highlightSlug, isGeneral }: {
    name: string; price: NeighborhoodPrice; highlightSlug: string | null; isGeneral: boolean
}) {
    // dims del mapa manteniendo el aspecto del viewBox (≈526×603)
    const [, , vbW, vbH] = CABA_MAP_VIEWBOX.split(' ').map(Number)
    const mapW = 220
    const mapH = mapW * (vbH / vbW)
    return (
        <View style={{ flexDirection: 'row', gap: 14 }}>
            <View style={{ width: mapW, backgroundColor: '#eef3f8', borderWidth: 1, borderColor: MKT.linea, borderRadius: 8, padding: 8, alignItems: 'center' }}>
                <Svg width={mapW - 16} height={mapH - 16} viewBox={CABA_MAP_VIEWBOX}>
                    {CABA_MAP_PATHS.map(p => {
                        const hl = !isGeneral && p.id === highlightSlug
                        return <Path key={p.id} d={p.d}
                            fill={hl ? MKT.mapaResaltado : p.fill}
                            stroke={hl ? MKT.mapaBorde : '#ffffff'}
                            strokeWidth={hl ? 3 : 0.8} />
                    })}
                </Svg>
                <Text style={{ fontSize: 6.5, color: MKT.gris, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 4 }}>
                    {isGeneral ? 'Precio USD/m² por barrio · CABA' : `Ubicación de ${name} en CABA`}
                </Text>
            </View>
            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignContent: 'flex-start' }}>
                <View style={{ width: '100%', backgroundColor: MKT.azul, borderRadius: 6, padding: 10, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                        <Text style={{ fontSize: 6.5, color: '#ffffff', opacity: 0.85, fontWeight: 700, textTransform: 'uppercase' }}>Precio promedio</Text>
                        <Text style={{ fontSize: 20, fontWeight: 800, color: '#ffffff' }}>USD {fmtInt(price.prom)} /m²</Text>
                    </View>
                    {price.via !== null && (
                        <Text style={{ fontSize: 8, fontWeight: 700, color: '#ffffff' }}>{fmtPct(price.via)} interanual</Text>
                    )}
                </View>
                <Card label="Usado" value={price.usado !== null ? `USD ${fmtInt(price.usado)}` : '—'} />
                <Card label="Pozo" value={price.pozo !== null ? `USD ${fmtInt(price.pozo)}` : '—'} />
                <Card label="A estrenar" value={price.estrenar !== null ? `USD ${fmtInt(price.estrenar)}` : '—'} />
                <Card label="Alquiler 2 amb" value={price.alq2amb !== null ? `$ ${fmtInt(price.alq2amb)}` : '—'} />
                <Card label="Renta bruta" value={price.renta !== null ? `${(price.renta * 100).toFixed(2).replace('.', ',')}%` : '—'} />
                <Card label="Deptos en venta" value={fmtInt(price.deptos)} />
            </View>
        </View>
    )
}
```

```tsx
// components/appraisal/pdf/market/TiposPDF.tsx
import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import type { PropertyTypesCounts } from '@/lib/market-data/types'
import { fmtInt } from '@/lib/market-data/arc-geometry'
import { DonutPDF } from './gauges'
import { MKT } from './palette'

const ORDER: Array<[keyof Omit<PropertyTypesCounts, 'total'>, string]> = [
    ['departamentos', 'Departamentos'], ['oficinas', 'Oficinas'], ['locales', 'Locales com.'],
    ['ph', 'PH'], ['terrenos', 'Terrenos'], ['casas', 'Casas'],
]

export function TiposPDF({ tipos }: { tipos: PropertyTypesCounts }) {
    const total = tipos.total || ORDER.reduce((a, [k]) => a + (tipos[k] || 0), 0)
    const slices = ORDER.map(([k], i) => ({ pct: total ? ((tipos[k] || 0) / total) * 100 : 0, color: MKT.donutTipos[i] }))
    return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <View style={{ position: 'relative', width: 150, height: 150, alignItems: 'center', justifyContent: 'center' }}>
                <DonutPDF size={150} thickness={26} slices={slices} />
                <View style={{ position: 'absolute', alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontWeight: 800, color: MKT.navy }}>{fmtInt(total)}</Text>
                    <Text style={{ fontSize: 6, color: MKT.gris, textTransform: 'uppercase', letterSpacing: 0.5 }}>avisos</Text>
                </View>
            </View>
            <View style={{ flex: 1 }}>
                {ORDER.map(([k, label], i) => (
                    <View key={k} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <View style={{ width: 9, height: 9, borderRadius: 2, backgroundColor: MKT.donutTipos[i] }} />
                        <Text style={{ fontSize: 9, color: '#3a4a5c', flex: 1 }}>{label}</Text>
                        <Text style={{ fontSize: 9, fontWeight: 700, color: MKT.navy }}>{fmtInt(tipos[k])}</Text>
                    </View>
                ))}
            </View>
        </View>
    )
}
```

- [ ] **Step 5: Integrar en `PDFReport.tsx`** (cambio quirúrgico)

5a. Props (líneas 16-32): agregar al final de `PDFReportProps`:
```tsx
    /** Datos de mercado resueltos por (barrio, período congelado). Si falta/null,
     *  las páginas de mercado renderizan el camino LEGACY de imágenes (idéntico a hoy). */
    marketData?: import('@/lib/market-data/types').MarketDataForReport | null
    /** Barrio canónico (evita el regex frágil de extractNeighborhood). */
    neighborhoodName?: string
```
5b. Firma del componente (línea ~297): agregar `marketData, neighborhoodName` al destructuring.
5c. Localizar `const neighborhood = extractNeighborhood(...)` dentro del componente (buscar `extractNeighborhood(` — hay una sola asignación) y cambiarla por:
```tsx
    const neighborhood = neighborhoodName || extractNeighborhood(subject.location)
```
5d. Imports nuevos arriba:
```tsx
import { StockDashboardPDF } from './market/StockDashboardPDF'
import { EscriturasPDF } from './market/EscriturasPDF'
import { BarrioPanelPDF } from './market/BarrioPanelPDF'
import { TiposPDF } from './market/TiposPDF'
```
5e. Reemplazar el bloque de PÁGINAS 3-4 (el comprendido entre `{/* PAGE 3: MARKET DATA - CABA */}` y el cierre `</Page>` anterior a `{/* PAGE 5: PROPIEDADES QUE COMPITEN`) por el siguiente. El sub-componente `MarketImageSection` reproduce VERBATIM el markup actual de cada slot (extraído para DRY — mismas props de estilo, mismo fallback):

```tsx
            {(() => {
                // Bloque legacy de UN slot — markup idéntico al histórico.
                const MarketImageSection = ({ slot, defaultLabel, defaultSrc, last }: { slot: string; defaultLabel: string; defaultSrc: string; last?: boolean }) => (
                    <View wrap={false}>
                        <Text style={styles.h2}>{marketImageLabels[slot]?.label || defaultLabel}</Text>
                        <Image
                            src={marketImageUrls[slot] || defaultSrc}
                            style={{ width: '100%', height: 'auto', marginBottom: 4 }}
                        />
                        {marketImageLabels[slot]?.description ? (
                            <Text style={{ fontSize: 8, color: colors.mediumGray, marginBottom: last ? 0 : 16 }}>{marketImageLabels[slot].description}</Text>
                        ) : (last ? null : <View style={{ marginBottom: 16 }} />)}
                    </View>
                )
                const MarketHeader = () => (
                    <View style={[styles.headerWithSubtitle, { position: 'absolute', top: 20, right: 40 }]}>
                        <Text style={styles.headerTitle}>DATOS REFERENCIALES</Text>
                        <Text style={styles.headerSubtitle}>{neighborhood === 'CABA' ? 'CABA' : `${neighborhood}, CABA`}</Text>
                    </View>
                )
                const md = marketData
                if (!md) {
                    // ===== CAMINO LEGACY (tasaciones sin snapshot): 2 páginas, igual que siempre =====
                    return (
                        <>
                            <Page size="A4" style={styles.pageWithPadding}>
                                <MarketHeader />
                                <View style={{ marginTop: 60 }}>
                                    <MarketImageSection slot="stock-departamentos" defaultLabel="Stock de Departamentos en venta en CABA" defaultSrc="/pdf-assets/monthly-data/stock-departamentos.png" />
                                    <MarketImageSection slot="escrituras-caba" defaultLabel="Cantidad de Escrituras CABA" defaultSrc="/pdf-assets/monthly-data/escrituras-caba.png" last />
                                </View>
                            </Page>
                            <Page size="A4" style={styles.pageWithPadding}>
                                <MarketHeader />
                                <View style={{ marginTop: 60 }}>
                                    <MarketImageSection slot="datos-barrio" defaultLabel={`Datos de ${neighborhood}, CABA`} defaultSrc="/pdf-assets/monthly-data/datos-barrio.png" />
                                    <MarketImageSection slot="tipos-propiedades" defaultLabel={`Tipos de propiedades en ${neighborhood}`} defaultSrc="/pdf-assets/monthly-data/tipos-propiedades.png" last />
                                </View>
                            </Page>
                        </>
                    )
                }
                // ===== CAMINO DATA-DRIVEN: 4 páginas; cada sección cae a su imagen legacy si SU dato falta =====
                const barrioTitle = md.neighborhood.isGeneral ? 'CABA (general)' : md.neighborhood.name
                return (
                    <>
                        <Page size="A4" style={styles.pageWithPadding}>
                            <MarketHeader />
                            <View style={{ marginTop: 60 }}>
                                <Text style={styles.h2}>Stock de inmuebles en venta en CABA</Text>
                                {md.caba.stock && md.caba.stock.tipos?.length
                                    ? <StockDashboardPDF stock={md.caba.stock} />
                                    : <MarketImageSection slot="stock-departamentos" defaultLabel="Stock de Departamentos en venta en CABA" defaultSrc="/pdf-assets/monthly-data/stock-departamentos.png" last />}
                            </View>
                        </Page>
                        <Page size="A4" style={styles.pageWithPadding}>
                            <MarketHeader />
                            <View style={{ marginTop: 60 }}>
                                <Text style={styles.h2}>Cantidad de Escrituras CABA</Text>
                                {md.caba.escrituras
                                    ? <EscriturasPDF escrituras={md.caba.escrituras} />
                                    : <MarketImageSection slot="escrituras-caba" defaultLabel="Cantidad de Escrituras CABA" defaultSrc="/pdf-assets/monthly-data/escrituras-caba.png" last />}
                            </View>
                        </Page>
                        <Page size="A4" style={styles.pageWithPadding}>
                            <MarketHeader />
                            <View style={{ marginTop: 60 }}>
                                <Text style={styles.h2}>{`Datos de ${barrioTitle}`}</Text>
                                {md.barrio.price
                                    ? <BarrioPanelPDF name={md.neighborhood.name} price={md.barrio.price} highlightSlug={md.neighborhood.slug} isGeneral={md.neighborhood.isGeneral} />
                                    : <MarketImageSection slot="datos-barrio" defaultLabel={`Datos de ${neighborhood}, CABA`} defaultSrc="/pdf-assets/monthly-data/datos-barrio.png" last />}
                            </View>
                        </Page>
                        <Page size="A4" style={styles.pageWithPadding}>
                            <MarketHeader />
                            <View style={{ marginTop: 60 }}>
                                <Text style={styles.h2}>{`Tipos de propiedades en ${barrioTitle}`}</Text>
                                {md.barrio.propertyTypes
                                    ? <TiposPDF tipos={md.barrio.propertyTypes} />
                                    : <MarketImageSection slot="tipos-propiedades" defaultLabel={`Tipos de propiedades en ${neighborhood}`} defaultSrc="/pdf-assets/monthly-data/tipos-propiedades.png" last />}
                            </View>
                        </Page>
                    </>
                )
            })()}
```
**Nota:** `marketImageLabels` y `marketImageUrls` ya existen en scope con default `{}` — verificar que la firma actual los defaultee (`marketImageLabels = {}, marketImageUrls = {}` en el destructuring, línea ~297); si no, usar `(marketImageLabels || {})` dentro del sub-componente.

- [ ] **Step 6: Verificación por RENDER REAL (node) — escribir `scripts/render-market-pdf-test.tsx`**

```tsx
/* Render de verificación de las páginas de mercado — AMBOS caminos (legacy y
 * data-driven). Correr: node --import tsx scripts/render-market-pdf-test.tsx
 * Salida: /tmp/market-legacy.pdf y /tmp/market-data.pdf + PNGs por página.
 * Precedente de render script en node: scripts/render-meta-audit-pdf.tsx */
import React from 'react'
import { renderToFile } from '@react-pdf/renderer'
import { PDFReportDocument } from '../components/appraisal/pdf/PDFReport'
import type { MarketDataForReport } from '../lib/market-data/types'
import { execSync } from 'child_process'

const subject: any = {
    title: 'Miranda 5211', location: 'Miranda 5211, Palermo, Ciudad Autónoma de Buenos Aires',
    price: 120000, currency: 'USD', images: [], description: '', url: '', portal: 'manual',
    features: { coveredArea: 50, totalArea: 54, rooms: 2, bedrooms: 1, bathrooms: 1, garages: 0, age: 6 },
}
const comparable: any = { ...subject, title: 'Comparable 1', price: 115000 }
const valuationResult: any = {
    publicationPrice: 118000, saleValue: 112000, noSaleZonePrice: 123900, moneyInHand: 106000,
    currency: 'USD', avgPricePerM2: 2300, subjectPricePerM2: 2360,
    comparableAnalysis: [{ property: comparable, adjustedPricePerM2: 2300, coefficients: {} }],
    expenseBreakdown: [], depreciation: {},
}
const marketData: MarketDataForReport = {
    period: '2026-07-01', resolvedPeriod: '2026-07-01',
    neighborhood: { slug: 'palermo', name: 'Palermo', isGeneral: false },
    caba: {
        stock: {
            stockDeptos: 79624, stockVm: 0.0297, absorcion: 21.2, totalInmuebles: 115277,
            tipos: [
                { label: 'Casa', pct: 4.87, count: 5611 }, { label: 'Departamentos', pct: 69.07, count: 79624 },
                { label: 'Terrenos', pct: 4.96, count: 5713 }, { label: 'PH', pct: 6.92, count: 7979 },
                { label: 'Local comercial', pct: 4.9, count: 5651 }, { label: 'Oficina comercial', pct: 4.0, count: 4628 },
                { label: 'Depósitos', pct: 0.54, count: 624 }, { label: 'Cocheras', pct: 3.2, count: 3691 },
                { label: 'Otros', pct: 1.52, count: 1756 },
            ],
            antiguedad: [
                { label: 'En construcción', pct: 1.81 }, { label: 'A estrenar', pct: 32.5 }, { label: 'Hasta 5 años', pct: 5.35 },
                { label: 'Entre 5 y 10', pct: 5.2 }, { label: 'Entre 10 y 20', pct: 7.27 }, { label: 'Entre 20 y 50', pct: 27.67 },
                { label: 'Más de 50', pct: 20.2 },
            ],
            vendedor: [{ label: 'Inmobiliaria', pct: 98.7 }, { label: 'Dueño directo', pct: 1.3 }],
            antPublicacion: [{ label: 'Menos de 45 días', pct: 41.04 }, { label: '45 días o más', pct: 59.0 }],
        },
        escrituras: {
            mesLabel: 'Mayo 2026', cantidad: 5435, varInteranual: -0.031, montoTexto: '$848.932 millones', hipotecas: 584,
            articleUrl: 'https://www.colegio-escribanos.org.ar/', imageUrl: null,
            summary: 'En Mayo 2026 se registraron 5.435 escrituras de compraventa en CABA (-3,1% interanual) por un monto total de $848.932 millones. Se firmaron 584 escrituras con hipoteca.',
        },
        price: { prom: 2462, vm: 0.0008, via: 0.019, usado: 2318, pozo: 3086, estrenar: 2939, alq2amb: 634679, renta: 0.0449, deptos: 79624 },
    },
    barrio: {
        price: { prom: 3403, vm: 0.0035, via: 0.0059, usado: 3051, pozo: 4225, estrenar: 3934, alq2amb: 943809, renta: 0.0552, deptos: 13892 },
        propertyTypes: { departamentos: 15983, terrenos: 339, locales: 734, casas: 251, ph: 465, oficinas: 588, total: 18360 },
    },
}

async function main() {
    // 1) LEGACY (sin marketData) — regresión: no debe tirar
    await renderToFile(
        <PDFReportDocument subject={subject} comparables={[comparable]} valuationResult={valuationResult} />,
        '/tmp/market-legacy.pdf',
    )
    console.log('OK legacy → /tmp/market-legacy.pdf')
    // 2) DATA-DRIVEN
    await renderToFile(
        <PDFReportDocument subject={subject} comparables={[comparable]} valuationResult={valuationResult}
            marketData={marketData} neighborhoodName="Palermo" />,
        '/tmp/market-data.pdf',
    )
    console.log('OK data-driven → /tmp/market-data.pdf')
    execSync('pdftoppm -png -r 60 -f 3 -l 6 /tmp/market-data.pdf /tmp/market-page && pdftoppm -png -r 60 -f 3 -l 4 /tmp/market-legacy.pdf /tmp/legacy-page')
    console.log('PNGs: /tmp/market-page-*.png /tmp/legacy-page-*.png')
}
main().catch(e => { console.error(e); process.exit(1) })
```

Run: `node --import tsx scripts/render-market-pdf-test.tsx`
Expected: ambos PDFs sin throw. **MIRAR los PNGs** (`/tmp/market-page-3.png` … `-6.png`): página 3 = dashboard de stock (tabla + 4 semi-donas), 4 = escrituras, 5 = panel + mapa con Palermo resaltado en dorado, 6 = dona de tipos. `/tmp/legacy-page-3/4.png` = idénticas a las actuales (imágenes). Si el subject mock hace fallar otras páginas del documento por shape, completar el mock — NO tocar PDFReport para acomodar el mock.

- [ ] **Step 7: Tests + tsc + commit**

```bash
npm test -- lib/market-data && npx tsc --noEmit -p tsconfig.json
git add lib/market-data/arc-geometry.ts lib/market-data/arc-geometry.test.ts components/appraisal/pdf/market/ components/appraisal/pdf/PDFReport.tsx scripts/render-market-pdf-test.tsx
git commit -m "feat(tasador): páginas de mercado data-driven en el PDF (stock, escrituras, barrio+mapa, tipos) con rama legacy intacta

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 12: Wizard — combobox de barrios + persistencia del congelado

**Files:**
- Create: `components/appraisal/NeighborhoodSelect.tsx`
- Modify: `lib/scraper/types.ts` (ScrapedProperty)
- Modify: `components/appraisal/PropertyWizard.tsx` (paso 1 + formData + handleComplete)
- Modify: `lib/supabase/appraisals.ts` (SaveAppraisalInput + AppraisalDetail)
- Modify: `lib/supabase/appraisals-write.ts` (insert + update)
- Modify: `app/api/appraisals/route.ts` (POST setea marketPeriod server-side)
- Modify: `app/(dashboard)/appraisal/new/page.tsx` (mapSubjectToFormData)

**Interfaces:**
- Consumes: `findByText`, `CABA_BARRIOS`, `GENERAL_SLUG` (Task 1); `currentPeriod` (Task 1); `GET /api/neighborhoods` (Task 9).
- Produces: `ScrapedProperty.neighborhoodSlug?: string`; `SaveAppraisalInput.marketPeriod?: string`; columnas persistidas `appraisals.neighborhood_slug` / `market_period`; `AppraisalDetail.neighborhood_slug/market_period`. `NeighborhoodSelect({ valueSlug, valueName, onChange(slug, name) })`.
- **Invariantes que NO se rompen:** el formato de `location` sigue siendo `"dirección, <nombre de barrio>, ciudad"` (el deal auto-creado y el re-split de edición dependen de eso); la validación del paso 1 sigue siendo "address y neighborhood no vacíos" (una tasación legacy editada sin re-elegir barrio PUEDE guardarse — queda sin slug = camino legacy).

- [ ] **Step 1: Tipos — cambios aditivos**

En `lib/scraper/types.ts`, dentro de `ScrapedProperty` (después de `location: string`):
```ts
    /** Barrio canónico (slug del catálogo de datos de mercado). Solo lo setea el
     *  wizard manual; los scrapers de portales no lo conocen. */
    neighborhoodSlug?: string
```
En `lib/supabase/appraisals.ts`: a `SaveAppraisalInput` agregar `marketPeriod?: string` (después de `reportEdits`); a `AppraisalDetail` agregar `neighborhood_slug: string | null` y `market_period: string | null` (después de `user_id`).

- [ ] **Step 2: Persistencia server-side**

En `lib/supabase/appraisals-write.ts` → `insertAppraisalWithComparables`, dentro del objeto `.insert({...})` (después de `assigned_to`):
```ts
            neighborhood_slug: subject.neighborhoodSlug ?? null,
            market_period: input.marketPeriod ?? null,
```
En la función de UPDATE del mismo archivo (la que actualiza la fila principal en el PUT — buscar el `.update({` sobre `appraisals`), agregar SOLO:
```ts
            neighborhood_slug: subject.neighborhoodSlug ?? null,
            // market_period NO se toca en updates: el mes queda CONGELADO al de creación.
```
En `app/api/appraisals/route.ts` → `POST`, después de la línea `if (!input.assignedTo && user.profile.role === 'asesor') input.assignedTo = user.id`:
```ts
    // Congelar el período de datos de mercado al mes de creación (server-authoritative).
    if (!input.marketPeriod) input.marketPeriod = currentPeriod()
```
con `import { currentPeriod } from '@/lib/market-data/period'` arriba.

- [ ] **Step 3: `components/appraisal/NeighborhoodSelect.tsx`**

Si `components/ui/select.tsx` no existe: `npx shadcn@latest add select` (estilo new-york ya configurado).

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CABA_BARRIOS } from '@/lib/market-data/neighborhoods'

interface Option { slug: string; name: string; isGeneral?: boolean }

const STATIC_OPTIONS: Option[] = CABA_BARRIOS.map(b => ({ slug: b.slug, name: b.name, isGeneral: b.isGeneral }))

/** Combobox de barrio canónico. DB-first (permite sumar GBA sin deploy) con
 *  fallback al catálogo estático. Si el valor inicial es texto libre legacy que
 *  no matchea el catálogo, se muestra como opción extra (slug '') para no
 *  perderlo — elegir un barrio real lo reemplaza. */
export function NeighborhoodSelect({ valueSlug, valueName, onChange }: {
    valueSlug: string
    valueName: string
    onChange: (slug: string, name: string) => void
}) {
    const [options, setOptions] = useState<Option[]>(STATIC_OPTIONS)

    useEffect(() => {
        let cancelled = false
        fetch('/api/neighborhoods')
            .then(r => r.json())
            .then(({ data }) => { if (!cancelled && Array.isArray(data) && data.length) setOptions(data) })
            .catch(() => { /* fallback estático ya seteado */ })
        return () => { cancelled = true }
    }, [])

    const legacyFreeText = !valueSlug && valueName.trim() !== '' && !options.some(o => o.name === valueName)
    const selectValue = valueSlug || (legacyFreeText ? '__legacy__' : '')

    return (
        <Select
            value={selectValue || undefined}
            onValueChange={(v) => {
                if (v === '__legacy__') return
                const opt = options.find(o => o.slug === v)
                if (opt) onChange(opt.slug, opt.isGeneral ? 'CABA' : opt.name)
            }}
        >
            <SelectTrigger id="neighborhood" className="h-12">
                <SelectValue placeholder="Elegí el barrio" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
                {legacyFreeText && (
                    <SelectItem value="__legacy__">{valueName} (texto libre)</SelectItem>
                )}
                {options.filter(o => o.isGeneral).map(o => (
                    <SelectItem key={o.slug} value={o.slug}>General / CABA</SelectItem>
                ))}
                {options.filter(o => !o.isGeneral).map(o => (
                    <SelectItem key={o.slug} value={o.slug}>{o.name}</SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}
```

- [ ] **Step 4: Integrar en `PropertyWizard.tsx`**

4a. `formData`: agregar `neighborhoodSlug: ''` al estado inicial (y donde se hidrata el draft de localStorage, defaultear `neighborhoodSlug: draft.neighborhoodSlug ?? ''` — drafts viejos sin el campo siguen funcionando).
4b. Reemplazar el `<Input id="neighborhood" .../>` del paso 1 (líneas ~321-327) por:
```tsx
                                    <NeighborhoodSelect
                                        valueSlug={formData.neighborhoodSlug}
                                        valueName={formData.neighborhood}
                                        onChange={(slug, name) => {
                                            updateField('neighborhoodSlug', slug)
                                            updateField('neighborhood', name)
                                        }}
                                    />
```
con `import { NeighborhoodSelect } from './NeighborhoodSelect'` arriba. El `<Label htmlFor="neighborhood">Barrio *</Label>` queda igual.
4c. `handleComplete` (línea ~206): agregar al objeto `property` (después de `location`):
```ts
            neighborhoodSlug: formData.neighborhoodSlug || undefined,
```
4d. `isStepValid` case 0: SIN CAMBIOS (name no vacío alcanza — legacy editable).

- [ ] **Step 5: Modo edición — `app/(dashboard)/appraisal/new/page.tsx`**

En `mapSubjectToFormData` (líneas ~47-73), después de `const neighborhood = parts[1] || ''` agregar el mapeo y devolverlo:
```ts
    // Barrio canónico: del subject si ya lo tiene; si no, mapear el texto legacy.
    const neighborhoodSlug = subject.neighborhoodSlug
        || findByText(neighborhood)?.slug
        || ''
```
y en el objeto de retorno: `neighborhoodSlug,` (después de `neighborhood`). Import arriba: `import { findByText } from '@/lib/market-data/neighborhoods'`.

- [ ] **Step 6: Verificación + commit**

Run: `npx tsc --noEmit -p tsconfig.json` → 0 errores. `npm test` → verde. Smoke con dev server: crear una tasación por el wizard eligiendo "Palermo" → verificar en la respuesta del POST/DB que la fila tiene `neighborhood_slug='palermo'` y `market_period` = mes vigente; editarla (editId) → el Select muestra Palermo; guardar de nuevo → **mismo id** (no duplica) y `market_period` NO cambió.
```bash
git add components/appraisal/NeighborhoodSelect.tsx components/appraisal/PropertyWizard.tsx lib/scraper/types.ts lib/supabase/appraisals.ts lib/supabase/appraisals-write.ts app/api/appraisals/route.ts "app/(dashboard)/appraisal/new/page.tsx"
git commit -m "feat(tasador): combobox de barrio canónico en el wizard + congelado de barrio/período en la tasación

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 13: Threading — marketData desde las páginas hasta el PDF (modal + botón)

**Files:**
- Modify: `components/appraisal/PDFPreviewModal.tsx`
- Modify: `components/appraisal/PDFDownloadButton.tsx`
- Modify: `app/(dashboard)/appraisals/[id]/page.tsx`
- Modify: `app/(dashboard)/appraisal/new/page.tsx`

**Interfaces:**
- Consumes: `GET /api/market-data` (Task 9); props `marketData`/`neighborhoodName` de `PDFReportDocument` (Task 11); `AppraisalDetail.neighborhood_slug/market_period` (Task 12).
- Produces: `PDFPreviewModalProps` y `PDFDownloadButtonProps` ganan `marketData?: MarketDataForReport | null` y `neighborhoodName?: string`.
- **Divergencia legacy intencional:** `PDFDownloadButton` hoy NO pasa `marketImageLabels/Urls` (usa los defaults estáticos) — eso NO se cambia: para tasaciones data-driven la unificación llega vía `marketData` (los 3 caminos idénticos); para legacy se conserva el comportamiento actual byte a byte (prioridad: no romper nada).
- **Crash-safety (lección documentada):** el JSX inline del tab Vista Previa se toca SOLO para agregar las dos props nuevas, pasándolas TAL CUAL llegan del padre (estado de página → identidad estable). Nada de objetos construidos en el render. El `PreviewErrorBoundary` existente queda como red. La verificación final es EN NAVEGADOR (no alcanza tsc/build — así se escapó el crash anterior).

- [ ] **Step 1: `PDFPreviewModal.tsx`**

1a. Import de tipo arriba: `import type { MarketDataForReport } from '@/lib/market-data/types'`.
1b. En `PDFPreviewModalProps` (línea ~107) agregar:
```ts
    marketData?: MarketDataForReport | null
    neighborhoodName?: string
```
1c. Agregar ambos al destructuring del componente (línea ~127).
1d. En `buildDoc` (línea ~216): agregar `marketData={marketData}` y `neighborhoodName={neighborhoodName}` al `<PDFReportDocument>` y ambos a la lista de deps del `useCallback`.
1e. En el JSX inline del `PDFViewer` (línea ~454): agregar las mismas dos props al final (después de `advisorPhotoUrl={advisorPhotoUrl}`).

- [ ] **Step 2: `PDFDownloadButton.tsx`**

Agregar a `PDFDownloadButtonProps` y al destructuring: `marketData?: MarketDataForReport | null` (import type) y `neighborhoodName?: string`; en el `<PDFReportDocument>` del `handleDownload` agregar `marketData={marketData}` y `neighborhoodName={neighborhoodName}`.

- [ ] **Step 3: Página de detalle `app/(dashboard)/appraisals/[id]/page.tsx`**

3a. Estado + fetch (junto a los useEffect existentes, p.ej. debajo del de advisor photo):
```tsx
    const [marketData, setMarketData] = useState<MarketDataForReport | null>(null)

    // Datos de mercado CONGELADOS de la tasación: (barrio, período de creación).
    // Tasaciones legacy (sin slug) → null → el PDF usa el camino de imágenes actual.
    useEffect(() => {
        const slug = appraisal?.neighborhood_slug
        if (!slug) { setMarketData(null); return }
        const period = appraisal?.market_period
        const qs = `neighborhood=${encodeURIComponent(slug)}${period ? `&period=${period}` : ''}`
        let cancelled = false
        fetch(`/api/market-data?${qs}`)
            .then(r => r.json())
            .then(({ data }) => { if (!cancelled) setMarketData(data || null) })
            .catch(() => { if (!cancelled) setMarketData(null) })
        return () => { cancelled = true }
    }, [appraisal?.neighborhood_slug, appraisal?.market_period])
```
con `import type { MarketDataForReport } from '@/lib/market-data/types'`.
3b. En el `<PDFPreviewModal ...>` (línea ~618) y el `<PDFDownloadButton ...>`: agregar
```tsx
    marketData={marketData}
    neighborhoodName={marketData?.neighborhood.name}
```

- [ ] **Step 4: Página de creación `app/(dashboard)/appraisal/new/page.tsx`**

Igual patrón, pero la clave es el subject del wizard (aún sin guardar) y el período vigente (la API defaultea `period=currentPeriod()` si se omite):
```tsx
    const [marketData, setMarketData] = useState<MarketDataForReport | null>(null)

    useEffect(() => {
        const slug = subject?.neighborhoodSlug
        if (!slug) { setMarketData(null); return }
        let cancelled = false
        fetch(`/api/market-data?neighborhood=${encodeURIComponent(slug)}`)
            .then(r => r.json())
            .then(({ data }) => { if (!cancelled) setMarketData(data || null) })
            .catch(() => { if (!cancelled) setMarketData(null) })
        return () => { cancelled = true }
    }, [subject?.neighborhoodSlug])
```
y pasar `marketData={marketData}` + `neighborhoodName={marketData?.neighborhood.name}` al `<PDFPreviewModal>` (línea ~1612). (`subject` es el estado existente de la página con el ScrapedProperty del wizard.)

- [ ] **Step 5: Verificación EN NAVEGADOR (obligatoria) + commit**

1. `npx tsc --noEmit` → 0 errores; build en `/tmp/dfb` (comando de Global Constraints) → OK.
2. Dev server: abrir una tasación **legacy** (sin barrio canónico) → Vista Previa carga, páginas 3-4 = imágenes de siempre. Descargar → OK.
3. Crear tasación con barrio Palermo (con snapshots ya ingestados, Task 7) → Vista Previa: páginas 3-6 = gráficas nuevas (stock/escrituras/panel+mapa/dona). Sin errores en consola. Descargar → PDF correcto. Tab "Organizar" sigue funcionando (más páginas, thumbnails OK).
```bash
git add components/appraisal/PDFPreviewModal.tsx components/appraisal/PDFDownloadButton.tsx "app/(dashboard)/appraisals/[id]/page.tsx" "app/(dashboard)/appraisal/new/page.tsx"
git commit -m "feat(tasador): threading de datos de mercado congelados a preview y descarga del PDF

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 14: Configuración — panel de estado + "Refrescar ahora" + override legacy plegado

**Files:**
- Create: `app/api/market-data/status/route.ts`
- Create: `app/api/market-data/refresh/route.ts`
- Modify: `app/(dashboard)/settings/page.tsx` (sección "Datos de Mercado Mensuales", líneas ~149-245)

**Interfaces:**
- Consumes: `market_data_refresh_state` + snapshots (Task 2); `refreshCore`/`refreshZonaprop` (Task 7); `currentPeriod` (Task 1); `getUser` de `@/lib/auth/get-user`.
- Produces: `GET /api/market-data/status` → `{ period, core: StateRow|null, zonaprop: StateRow|null, counts: { barriosConPrecio, barriosConTipos, total: 48 }, cabaListo: boolean }`; `POST /api/market-data/refresh` body `{ part: 'core'|'zonaprop' }` (admin/dueno) → mismas stats que el cron.
- La UI actual de subida de los 4 slots NO se elimina: queda como override de emergencia dentro de un `<details>` plegado (mismo markup, mismos endpoints).

- [ ] **Step 1: `app/api/market-data/status/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'
import { currentPeriod } from '@/lib/market-data/period'
import { ALL_CABA_SLUGS } from '@/lib/market-data/neighborhoods'

export const dynamic = 'force-dynamic'

export async function GET() {
    const me = await getUser()
    if (!me) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const period = currentPeriod()

    const [{ data: states }, { data: nbRows }, { data: cabaRow }] = await Promise.all([
        supabase.from('market_data_refresh_state').select('*'),
        supabase.from('market_snapshot_neighborhood').select('neighborhood_slug, price, property_types').eq('period', period),
        supabase.from('market_snapshot_caba').select('period, stock, escrituras, price_caba').eq('period', period).maybeSingle(),
    ])
    const rows = nbRows || []
    return NextResponse.json({
        period,
        core: (states || []).find(s => s.id === 'core') || null,
        zonaprop: (states || []).find(s => s.id === 'zonaprop') || null,
        counts: {
            barriosConPrecio: rows.filter(r => r.price).length,
            barriosConTipos: rows.filter(r => r.property_types).length,
            total: ALL_CABA_SLUGS.length,
        },
        cabaListo: !!(cabaRow?.stock && cabaRow?.escrituras),
    })
}
```

- [ ] **Step 2: `app/api/market-data/refresh/route.ts`** (manual, admin/dueno; mismo worker que el cron)

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'
import { refreshCore, refreshZonaprop } from '@/lib/market-data/ingest'
import { currentPeriod } from '@/lib/market-data/period'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
    const me = await getUser()
    if (!me) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!['admin', 'dueno'].includes(me.profile.role)) {
        return NextResponse.json({ error: 'Solo admin/dueño' }, { status: 403 })
    }
    const { part } = await req.json().catch(() => ({ part: 'core' }))
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const period = currentPeriod()
    if (part === 'zonaprop') return NextResponse.json({ period, zonaprop: await refreshZonaprop(supabase, period, 12) })
    return NextResponse.json({ period, core: await refreshCore(supabase, period) })
}
```

- [ ] **Step 3: Panel en `app/(dashboard)/settings/page.tsx`**

3a. Estado + carga (junto a los estados existentes de la página):
```tsx
    const [mdStatus, setMdStatus] = useState<any>(null)
    const [refreshing, setRefreshing] = useState<string | null>(null)

    const loadMdStatus = useCallback(() => {
        fetch('/api/market-data/status').then(r => r.json()).then(setMdStatus).catch(() => {})
    }, [])
    useEffect(() => { loadMdStatus() }, [loadMdStatus])

    async function handleMdRefresh(part: 'core' | 'zonaprop') {
        setRefreshing(part)
        try {
            await fetch('/api/market-data/refresh', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ part }),
            })
            loadMdStatus()
        } finally { setRefreshing(null) }
    }
```
3b. DENTRO de la sección "Datos de Mercado Mensuales", ANTES del bloque actual de los 4 slots, insertar el panel de estado; y ENVOLVER el bloque actual de slots (el `{loading ? ... : <grid de 4 slots>}` completo, sin modificarlo) en un `<details>`:
```tsx
                {/* Estado de la actualización automática (pg_cron) */}
                <div className="rounded-xl border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="font-medium">Actualización automática</h3>
                            <p className="text-xs text-muted-foreground">
                                Mes vigente: {mdStatus?.period || '…'} · CABA {mdStatus?.cabaListo ? '✓ completo' : 'pendiente'} ·
                                precio {mdStatus?.counts?.barriosConPrecio ?? 0}/{mdStatus?.counts?.total ?? 48} barrios ·
                                tipos {mdStatus?.counts?.barriosConTipos ?? 0}/{mdStatus?.counts?.total ?? 48} barrios
                            </p>
                        </div>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" disabled={!!refreshing} onClick={() => handleMdRefresh('core')}>
                                {refreshing === 'core' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refrescar fuentes'}
                            </Button>
                            <Button size="sm" variant="outline" disabled={!!refreshing} onClick={() => handleMdRefresh('zonaprop')}>
                                {refreshing === 'zonaprop' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refrescar tipos (lote)'}
                            </Button>
                        </div>
                    </div>
                    {[mdStatus?.core, mdStatus?.zonaprop].filter(Boolean).map((s: any) => (
                        <p key={s.id} className={`text-xs ${s.last_status === 'ok' ? 'text-green-600' : s.last_status === 'partial' ? 'text-amber-600' : 'text-red-600'}`}>
                            {s.id}: {s.last_status} · {s.last_run_at ? new Date(s.last_run_at).toLocaleString('es-AR') : 'nunca corrió'}
                            {s.last_error ? ` · ${s.last_error}` : ''}
                        </p>
                    ))}
                </div>

                <details className="rounded-xl border bg-card p-4">
                    <summary className="cursor-pointer text-sm font-medium">
                        Override manual (emergencia) — subir imágenes fijas si una fuente falla
                    </summary>
                    <div className="mt-4">
                        {/* AQUÍ VA EL BLOQUE ACTUAL DE LOS 4 SLOTS, SIN CAMBIOS */}
                    </div>
                </details>
```
(Los imports `Button`/`Loader2`/`useCallback` ya existen en la página; verificar y agregar los que falten.)

- [ ] **Step 4: Verificación + commit**

`npx tsc --noEmit` → 0 errores. Dev server: `/settings` muestra el panel con el estado real (tras Task 7); "Refrescar fuentes" corre y actualiza los contadores; el `<details>` plegado abre la UI vieja y subir una imagen sigue funcionando.
```bash
git add app/api/market-data/status/route.ts app/api/market-data/refresh/route.ts "app/(dashboard)/settings/page.tsx"
git commit -m "feat(config): panel de estado de datos de mercado + refresco manual + override legacy plegado

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 15: Documentación + verificación end-to-end (entrada a la Fase 4)

**Files:**
- Modify: `CLAUDE.md` (sección nueva)
- (Sin código nuevo — esta tarea cierra la Fase 3 y define QUÉ prueban los agentes de la Fase 4.)

- [ ] **Step 1: Agregar a `CLAUDE.md`** (después de la sección de publicación en portales) un resumen operativo:

```markdown
## Datos de Mercado por Barrio (tasador) — 2026-07

- **Qué es:** las 4 secciones de mercado del PDF (stock, escrituras, datos del barrio, tipos) se ingestan solas y 2 son POR BARRIO. Spec: `docs/superpowers/specs/2026-07-01-datos-mercado-por-barrio-design.md`.
- **Fuentes:** JSON Bryn (precio 48 barrios + kpis; fallback: data-* del SVG del mapa), Infogram embed (composición del stock, `window.infographicData`), RSS Colegio de Escribanos (escrituras + imagen a Storage `market-data/escrituras/{period}.jpg`), Zonaprop `/barrios/capital-federal/{slug}` vía ScraperAPI (6 conteos).
- **Tablas:** `neighborhoods` (48+General), `market_snapshot_caba` (UNIQUE period), `market_snapshot_neighborhood` (UNIQUE neighborhood_id+period), `market_data_refresh_state` (observabilidad). Histórico ilimitado; upserts con merge (fallo parcial NUNCA borra lo capturado).
- **Cron pg_cron:** `market-data-core` (diario 09:15 UTC, 3 GETs) y `market-data-zonaprop` (cada 2h, lotes de 12 pendientes, sale temprano si el período está completo). Auth DUAL (env CRON_SECRET o cron_config) — env-only da 403 con los jobs actuales.
- **Congelado:** `appraisals.neighborhood_slug` + `market_period` (se setea al CREAR, nunca en updates). Tasaciones legacy (null) → el PDF renderiza el camino de imágenes de siempre (`market-images`/estáticas). El resolver (`lib/market-data/resolver.ts`) sirve `(slug, period)` con fallback al último período disponible.
- **PDF:** con `marketData` → 4 páginas data-driven (dashboard stock, escrituras, panel+mapa con barrio resaltado, dona de tipos); cada sección cae a su imagen legacy si SU dato falta. Mapa: `lib/market-data/caba-map-paths.ts` (generado por `scripts/extract-caba-map.ts`; fix villa-general-mitre aplicado; los <path> de la fuente NO se autocierran — regenerar solo con el script).
- **Gotcha Infogram/Zonaprop:** parsers FALLAN RUIDOSO ante shape nuevo (estado `failed` en `market_data_refresh_state`, visible en Configuración) — nunca datos a medias. Override manual: Configuración → "Override manual" (los 4 slots legacy siguen operativos).
```

- [ ] **Step 2: Suite completa + build**

Run: `npm test` → TODO verde. `npx tsc --noEmit` → 0 errores. Build en `/tmp/dfb` → OK.

- [ ] **Step 3: Commit + push**

```bash
git add CLAUDE.md
git commit -m "docs: sistema de datos de mercado por barrio (fuentes, cron, congelado, gotchas)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 4: CHECKLIST de Fase 4** (un agente probador por funcionalidad; cada uno documenta TODO defecto desde la perspectiva del usuario)

| # | Funcionalidad | Qué verifica el agente |
|---|---|---|
| 1 | Ingesta core | Disparar `?part=core` real → `market_snapshot_caba` del mes con stock+escrituras+price_caba; imagen del Colegio en Storage accesible por URL pública; `market_data_refresh_state.core = ok`. Re-disparar → idempotente (no duplica, no borra). |
| 2 | Ingesta zonaprop | Disparar `?part=zonaprop` ×4 → 48/48 con property_types; con todo completo, una corrida más sale temprano (`processed=0`). |
| 3 | Wizard | Crear tasación eligiendo Palermo → fila con slug+period correctos; elegir "General/CABA" → slug `general`; validación del paso 1 intacta; draft de localStorage viejo no rompe. |
| 4 | PDF nuevo | Tasación Palermo: Vista Previa y Descarga muestran las 4 páginas nuevas con datos REALES del mes (números cruzados contra el JSON de Bryn a mano); mapa con Palermo resaltado dorado; dona de tipos con conteos de Zonaprop. Tab Organizar funciona con las páginas nuevas. |
| 5 | Legacy intacto | Tasación ANTERIOR al deploy: preview + descarga IDÉNTICOS a antes (páginas 3-4 de imágenes); editar textos/precios/orden sigue guardando en el MISMO id. |
| 6 | Congelado | Con tasación de un período viejo (sembrar snapshot de un mes anterior con `?period=`), el PDF usa el período congelado aunque exista uno más nuevo. |
| 7 | General + fallbacks | Tasación "General" → panel con precio CABA + dona suma de 48; barrio sin tipos aún (borrar property_types de un barrio) → esa sección cae a la imagen legacy sin romper. |
| 8 | Config | Panel muestra estado real; "Refrescar" funciona y actualiza contadores; override manual sube imagen y esa imagen aparece en tasaciones LEGACY (no pisa las data-driven). |
| 9 | Cron en prod | Tras deploy + migración 000012: `cron.job` tiene los 2 jobs; `net._http_response` = 200; `market_data_refresh_state` actualizado a la hora esperada. |
| 10 | Regresión tasador | Flujo completo: crear → calcular → guardar → editar coeficiente (recalcula) → PDF → deal auto-creado con barrio correcto → no duplica tasaciones. |

---

## GBA Norte (2ª ola) — NO en este plan

Según el spec §3.7 (aprobado), GBA Norte se implementa DESPUÉS de que la Fase 4 de CABA esté verde, con su propio plan. La infraestructura de este plan ya lo soporta: `neighborhoods.zone/partido`, snapshots agnósticos de fuente, resolver por slug. Ese plan cubrirá: seed de partidos GBA Norte, parser del PDF `INDEX_GBA_NORTE_REPORTE_{AAAA}-{MM}.pdf` (requiere lib de PDF-a-texto serverless, p.ej. `unpdf` — la ÚNICA dependencia nueva prevista), parser del PDF de Colescba (escrituras Provincia, rotulado "Provincia de Bs. As."), Zonaprop `/barrios/gba-norte/{partido}`, y el zone-filter del combobox.

## Notas de ejecución (Fases 3 y 4 del usuario)

- **Orden:** 1 → 2 → {3,4,5,6,10 en paralelo} → 7 → 8 → 9 → 11 → 12 → 13 → 14 → 15. Las tareas 3-6 y 10 son independientes entre sí (solo dependen de Task 1); 11 depende de 1+10; 12 de 1+2; 13 de 9+11+12; 14 de 7+9.
- **Gates de usuario:** correr migraciones 000010+000011 (después de Task 2, antes de probar 7/9/12) y 000012 (después del deploy final).
- **Cada subagente** recibe SU tarea completa + Global Constraints, y NO toca archivos de otras tareas. Si necesita cambiar un contrato compartido (types.ts), se detiene y reporta.
- **Fase 4** = un agente por fila del checklist de Task 15/Step 4; sus hallazgos se corrigen y se re-lanza el agente hasta verde.
