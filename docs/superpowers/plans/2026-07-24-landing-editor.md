# Editor de landing de lujo (E1.6) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un editor visual (panel + vista previa en vivo) para que el asesor retoque el CONTENIDO (textos + fotos + mostrar/ocultar secciones) de una landing de lujo, sin poder romper la estructura de lujo, editando un borrador que sólo se hace público al "Publicar cambios".

**Architecture:** Reusa el motor existente "content is data" (`LandingDocument` Zod → `BLOCK_REGISTRY` → componentes de lujo). El editor MUTA el documento en memoria y lo autosalva en una columna NUEVA `property_landings.draft_content` (la pública sigue leyendo `content`). Publicar promueve `draft_content → content`. La vista previa reusa los mismos `render()` del registry en `mode='edit'` con envoltorios de selección. Sin page-builder libre: sólo edición de campos + toggles de 3 secciones opcionales.

**Tech Stack:** Next.js 16 (RSC + client components), React 19, TypeScript 5, Zod 4, `@dnd-kit/core` + `@dnd-kit/sortable` (ya instalados), Supabase (service-role admin client), Tailwind CSS v4, shadcn/ui (Button/Card/Input/Textarea/Switch), `sonner` (toasts).

## Global Constraints

- **Idioma:** toda la UI y prosa en español (es-AR). Sin jerga técnica en textos visibles al asesor.
- **Commit author:** `Sujupar <redstyle50@gmail.com>` — cualquier otro autor hace fallar el deploy de Netlify. Push a `main` (Netlify auto-deploya).
- **No romper el diseño:** el editor sólo expone campos de contenido + toggles de `curated_gallery` / `floor_plans` / `location_showcase`. NUNCA reordena secciones libremente, NUNCA agrega bloques arbitrarios, NUNCA permite borrar los bloques de conversión (`closing_invite` id `cta-mid` y `closing`) ni `hero`/`stats`/`story`/`footer`.
- **Invariante de conversión (ya en el Zod schema `LandingDocument.superRefine`):** el documento debe tener ≥1 bloque `cta | closing_invite | lead_form`. Como los toggles nunca tocan los `closing_invite`, el borrador SIEMPRE valida.
- **IDs de bloque estables y únicos:** el editor identifica/inserta/quita bloques por `block.id` (string). Insertar un bloque opcional reusa su id canónico (`gallery`/`plans`/`location`), NUNCA genera ids duplicados (el `superRefine` los rechaza).
- **Índices de foto:** `heroPhotoIndex`, `photoIndex`, `photoIndices` apuntan a `property.photos` por posición. El editor sólo elige/reordena índices; NO sube ni borra fotos (eso vive en la sección Multimedia).
- **maxLength por campo (del schema, estricto — el input DEBE capear o el guardado Zod lanza):** `titleOverride` 160, `subtitle` 200, `offerLabel`/`ctaLabel`/`label` 40, story `eyebrow` 60 / `headline` 160 / `body` 500, gallery `eyebrow` 60 / `title` 120, location `eyebrow` 60 / `title` 120 / `body` 400, closing `eyebrow` 60 / `headline` 200 / `body` 400.
- **Auth:** toda ruta/página del editor gatea con `requireAuth()` + `authorizeLanding(id, user.id, role)` — el `abogado` SIEMPRE 403; el `asesor` sólo si `properties.assigned_to === user.id`; `admin`/`dueno`/`coordinador` siempre.
- **Verificación (entorno sin `next dev`, Turbopack rompe por la tilde del path):** `npx tsc --noEmit` (0 errores) + probes tsx con `renderToStaticMarkup` / aserciones de lógica pura (corridas con `node --env-file=.env.local --import tsx <script>`) + review adversarial (Workflow) + WebFetch de producción. El drag/click/autosave real lo prueba el USUARIO en el navegador — no es verificable headless.
- **Probes tsx:** el alias `@/` NO resuelve bajo tsx; los probes importan por ruta RELATIVA y NO deben importar módulos que arrastren el cliente de IA o de DB. Mantener la lógica pura en archivos sin esos imports.

---

## File Structure

**Crear:**
- `supabase/migrations/20260724000001_property_landings_draft_content.sql` — columna aditiva `draft_content jsonb`.
- `scripts/apply-draft-content-migration-pg.ts` — aplica + verifica la migración vía session pooler (patrón CLAUDE.md).
- `lib/landing/editor/block-order.ts` — orden curado + insertar/quitar bloque opcional por id canónico.
- `lib/landing/editor/block-patch.ts` — reemplazar/parcheart bloque por id; parchear item de historia.
- `lib/landing/editor/editable.ts` — mapa de maxLength + tipos toggleables + labels.
- `app/(dashboard)/properties/[id]/landing/edit/page.tsx` — server: gate de auth + carga property + landing → `LandingEditor`.
- `components/landing/editor/LandingEditor.tsx` — shell client (estado, selección, autosave, publicar, layout 2 paneles).
- `components/landing/editor/EditorPreview.tsx` — itera bloques vía `BLOCK_REGISTRY` con envoltorio de selección.
- `components/landing/editor/EditorPanel.tsx` — enruta el bloque seleccionado a su panel.
- `components/landing/editor/panels/HeroPanel.tsx`
- `components/landing/editor/panels/StoryBlocksPanel.tsx`
- `components/landing/editor/panels/CuratedGalleryPanel.tsx`
- `components/landing/editor/panels/LocationPanel.tsx`
- `components/landing/editor/panels/ClosingPanel.tsx`
- `components/landing/editor/panels/InfoPanel.tsx`
- `components/landing/editor/PhotoPicker.tsx` — single-select (portada/historia) y multi-select+reorder (galería) con @dnd-kit.
- `components/landing/editor/SectionToggles.tsx` — interruptores de galería/planos/ubicación.
- `components/landing/editor/useAutosave.ts` — hook debounce → PATCH `draftContent`, con `flush()`.
- `scripts/landing-editor-order.probe.ts`, `scripts/landing-editor-patch.probe.ts`, `scripts/landing-editor-preview.probe.tsx` — probes.

**Modificar:**
- `lib/landing/landing-service.ts` — `LandingRow += draft_content`; `updateLanding` acepta `draftContent`; `publishLanding` promueve+limpia el borrador.
- `app/api/properties/[id]/landing/route.ts` — PATCH acepta `draftContent`.
- `components/properties/LandingSection.tsx` — botón "Editar landing" → `router.push('/properties/[id]/landing/edit')`.
- `app/globals.css` — `.lx-editor-preview` neutraliza las animaciones (`lx-reveal`, `hero-rise`, `hero-zoom`, `hero-cue`) para que la preview quede estática y visible mientras se edita.

---

## Interfaces canónicas (definidas una vez, consumidas por todo el plan)

```ts
// lib/landing/editor/block-order.ts
export const CURATED_ORDER: readonly string[] =
  ['hero', 'stats', 'story', 'gallery', 'plans', 'cta-mid', 'location', 'closing', 'footer']
export function removeBlockById(blocks: LandingBlock[], id: string): LandingBlock[]
export function insertBlockInCuratedOrder(blocks: LandingBlock[], block: LandingBlock): LandingBlock[]

// lib/landing/editor/block-patch.ts
export function replaceBlockById(blocks: LandingBlock[], id: string, next: LandingBlock): LandingBlock[]
export function patchStoryItem(
  block: Extract<LandingBlock, { type: 'story_blocks' }>,
  index: number,
  patch: Partial<{ eyebrow: string; headline: string; body: string; photoIndex: number }>,
): Extract<LandingBlock, { type: 'story_blocks' }>

// lib/landing/editor/editable.ts
export const FIELD_MAX: Record<string, number>          // ver Global Constraints
export const TOGGLEABLE: ReadonlyArray<{ id: string; type: LandingBlockType; label: string }>
export function defaultOptionalBlock(id: string, property: LandingProperty): LandingBlock | null

// lib/landing/landing-service.ts (interfaz extendida)
interface LandingRow { /* ...existente... */ draft_content: unknown | null }
export async function updateLanding(propertyId: string, patch: {
  wizardState?: Partial<WizardState>; templateId?: string; content?: unknown; draftContent?: unknown
}): Promise<LandingRow>

// components/landing/editor/useAutosave.ts
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'
export function useAutosave(propertyId: string, doc: LandingDocument): {
  status: SaveStatus; flush: () => Promise<void>
}
```

---

## FASE 1 — Cimientos (borrador + shell + preview + autosave)

### Task 1: Migración `draft_content` + aplicar y verificar

**Files:**
- Create: `supabase/migrations/20260724000001_property_landings_draft_content.sql`
- Create: `scripts/apply-draft-content-migration-pg.ts`

**Interfaces:**
- Produces: columna `property_landings.draft_content jsonb` (nullable).

- [ ] **Step 1: Escribir la migración**

`supabase/migrations/20260724000001_property_landings_draft_content.sql`:
```sql
-- E1.6 Editor de landing — columna de borrador.
-- El editor edita draft_content; "Publicar cambios" promueve draft_content -> content.
-- La página pública sigue leyendo content (status='published'), así editar NO afecta
-- lo que está en vivo hasta publicar. Aditiva y nullable: NULL = sin cambios sin publicar.
ALTER TABLE public.property_landings
  ADD COLUMN IF NOT EXISTS draft_content jsonb;

COMMENT ON COLUMN public.property_landings.draft_content IS
  'Borrador de edición (E1.6). NULL = sin cambios sin publicar. Publicar promueve draft_content -> content y lo limpia.';
```

- [ ] **Step 2: Escribir el script de aplicación** (patrón `scripts/apply-plans-migration-pg.ts` de CLAUDE.md)

`scripts/apply-draft-content-migration-pg.ts`:
```ts
import { readFileSync } from 'node:fs'
import { Client } from 'pg'

async function main() {
  const sql = readFileSync(
    'supabase/migrations/20260724000001_property_landings_draft_content.sql',
    'utf8',
  )
  const client = new Client({
    host: 'aws-0-us-west-2.pooler.supabase.com',
    port: 5432,
    user: 'postgres.mncsnastmcjdjxrehdep',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  })
  await client.connect()
  await client.query(sql)
  const { rows } = await client.query(
    `SELECT column_name, data_type FROM information_schema.columns
     WHERE table_name = 'property_landings' AND column_name = 'draft_content'`,
  )
  console.log('draft_content presente:', rows)
  await client.end()
  if (rows.length !== 1) throw new Error('La columna draft_content NO quedó creada')
}
main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 3: Instalar pg efímero y aplicar**

Run: `npm i --no-save pg && node --env-file=.env.local --import tsx scripts/apply-draft-content-migration-pg.ts`
Expected: imprime `draft_content presente: [ { column_name: 'draft_content', data_type: 'jsonb' } ]` y sale 0.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260724000001_property_landings_draft_content.sql scripts/apply-draft-content-migration-pg.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(landing): columna draft_content para el editor (E1.6)"
```

---

### Task 2: Servicio — draft_content en LandingRow, updateLanding y publishLanding

**Files:**
- Modify: `lib/landing/landing-service.ts`

**Interfaces:**
- Consumes: `LandingDocument` (Zod, `safeParse`), `safeParseLandingDocument`, `admin()`, `ensurePublicSlug(adminTyped(), id)`.
- Produces: `updateLanding({ draftContent })` escribe `draft_content`; `publishLanding` promueve el borrador; `LandingRow.draft_content`.

- [ ] **Step 1: Probe de la lógica de promoción (test pura)**

`scripts/landing-editor-promote.probe.ts` — la función de decisión de publish extraída como pura para testear sin DB. Primero agregá a `landing-service.ts` esta función exportada pura:
```ts
// lib/landing/landing-service.ts — helper puro y testeable
export function pickPublishSource(row: { content: unknown; draft_content: unknown | null }): {
  source: unknown
  promoteDraft: boolean
} {
  const hasDraft = row.draft_content != null
  return { source: hasDraft ? row.draft_content : row.content, promoteDraft: hasDraft }
}
```
Probe:
```ts
import { pickPublishSource } from '../lib/landing/landing-service'
const a = pickPublishSource({ content: { c: 1 }, draft_content: null })
if (a.promoteDraft !== false || (a.source as { c: number }).c !== 1) throw new Error('sin draft debe usar content')
const b = pickPublishSource({ content: { c: 1 }, draft_content: { c: 2 } })
if (b.promoteDraft !== true || (b.source as { c: number }).c !== 2) throw new Error('con draft debe promover el draft')
console.log('OK pickPublishSource')
```
NOTA: `landing-service.ts` importa `@supabase/supabase-js`; para que el probe no falle por el alias `@/`, importá `pickPublishSource` por ruta relativa y asegurate de que la función esté ANTES de cualquier import problemático a nivel de módulo (los imports de supabase son inertes hasta llamar `admin()`). Si el probe falla al cargar el módulo, moved `pickPublishSource` a `lib/landing/editor/promote.ts` (sin imports de supabase) y reexportala desde el service.

- [ ] **Step 2: Correr el probe (falla: función no existe / lógica)**

Run: `node --env-file=.env.local --import tsx scripts/landing-editor-promote.probe.ts`
Expected: FALLA (aún no está `pickPublishSource` o la lógica).

- [ ] **Step 3: Implementar `pickPublishSource` + extender `LandingRow`**

En `lib/landing/landing-service.ts`, en la interfaz `LandingRow` agregá el campo (justo después de `content: unknown`):
```ts
  content: unknown
  draft_content: unknown | null
```
Y agregá la función `pickPublishSource` (Step 1). `getLanding` usa `select('*')` → `draft_content` ya viene en la fila; sólo el tipo faltaba.

- [ ] **Step 4: Correr el probe (pasa)**

Run: `node --env-file=.env.local --import tsx scripts/landing-editor-promote.probe.ts`
Expected: `OK pickPublishSource`.

- [ ] **Step 5: `updateLanding` acepta `draftContent`**

En `updateLanding`, extendé el tipo del `patch` y agregá el branch de validación+escritura (junto al branch de `patch.content`):
```ts
export async function updateLanding(propertyId: string, patch: {
  wizardState?: Partial<WizardState>
  templateId?: string
  content?: unknown
  draftContent?: unknown
}): Promise<LandingRow> {
  // ...código existente hasta el branch de content...
  if (patch.content !== undefined) {
    const parsed = LandingDocument.safeParse(patch.content)
    if (!parsed.success) throw new Error('content inválido: ' + parsed.error.issues[0]?.message)
    update.content = parsed.data
  }
  if (patch.draftContent !== undefined) {
    const parsed = LandingDocument.safeParse(patch.draftContent)
    if (!parsed.success) throw new Error('draft inválido: ' + parsed.error.issues[0]?.message)
    update.draft_content = parsed.data
  }
  // ...persistencia existente (update).eq('property_id').select('*').single()...
}
```

- [ ] **Step 6: `publishLanding` promueve el borrador**

En `publishLanding`, reemplazá la validación del source y el UPDATE final:
```ts
const landing = await getLanding(propertyId)
if (!landing) throw new Error('landing not found')

const { source, promoteDraft } = pickPublishSource(landing)
const doc = safeParseLandingDocument(source)
if (!doc) throw new Error('La landing no tiene un diseño válido. Revisá que tenga al menos un CTA.')

// ...avatar / slug / utm existentes... (sin cambios)

const update: Record<string, unknown> = {
  status: 'published',
  avatar_id: avatarId,
  utm_base: utmBase,
  public_slug: slug,
  published_slug: slug,
  published_at: new Date().toISOString(),
}
if (promoteDraft) {
  update.content = doc          // promueve el borrador editado a la versión pública
  update.draft_content = null   // limpia el borrador (ya está publicado)
}
await admin().from('property_landings').update(update).eq('property_id', propertyId)
await writeRevision(landing.id, landing.template_id, doc, avatarId, 'publish', userId)
return { slug, url: utmBase.base_url }
```
El flujo del wizard (sin borrador) queda byte-por-byte igual: `promoteDraft=false` → no escribe `content` ni `draft_content`.

- [ ] **Step 7: tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 8: Commit**

```bash
git add lib/landing/landing-service.ts scripts/landing-editor-promote.probe.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(landing): updateLanding(draftContent) + publishLanding promueve el borrador (E1.6)"
```

---

### Task 3: PATCH route acepta `draftContent`

**Files:**
- Modify: `app/api/properties/[id]/landing/route.ts`

**Interfaces:**
- Consumes: `updateLanding({ draftContent })`.
- Produces: `PATCH /api/properties/[id]/landing` acepta `{ draftContent }`.

- [ ] **Step 1: Extender el body del PATCH**

En el handler `PATCH`, ampliá el tipo del body y el pasaje a `updateLanding`:
```ts
const body = (await req.json()) as {
  wizardState?: Record<string, unknown>
  templateId?: string
  content?: unknown
  draftContent?: unknown
}
const landing = await updateLanding(id, {
  wizardState: body.wizardState as never,
  templateId: body.templateId,
  content: body.content,
  draftContent: body.draftContent,
})
```
El gate de auth (`requireAuth()` + `authorizeLanding`) y el `try/catch → 400` quedan igual.

- [ ] **Step 2: tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 3: Commit**

```bash
git add "app/api/properties/[id]/landing/route.ts"
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(landing): PATCH landing acepta draftContent (E1.6)"
```

---

### Task 4: Helpers puros de orden y patch de bloques

**Files:**
- Create: `lib/landing/editor/block-order.ts`
- Create: `lib/landing/editor/block-patch.ts`
- Create: `lib/landing/editor/editable.ts`
- Create: `scripts/landing-editor-order.probe.ts`

**Interfaces:**
- Consumes: `LandingBlock`, `LandingBlockType`, `LandingProperty` (types).
- Produces: `CURATED_ORDER`, `removeBlockById`, `insertBlockInCuratedOrder`, `replaceBlockById`, `patchStoryItem`, `FIELD_MAX`, `TOGGLEABLE`, `defaultOptionalBlock`.

- [ ] **Step 1: Escribir el probe (falla)**

`scripts/landing-editor-order.probe.ts`:
```ts
import { CURATED_ORDER, insertBlockInCuratedOrder, removeBlockById } from '../lib/landing/editor/block-order'
import { replaceBlockById } from '../lib/landing/editor/block-patch'
import type { LandingBlock } from '../lib/landing/schema'

const base: LandingBlock[] = [
  { id: 'hero', type: 'hero' },
  { id: 'stats', type: 'stats_bar' },
  { id: 'story', type: 'story_blocks', items: [{ numeral: 'I', eyebrow: 'a', headline: 'b', body: 'c', tie: 'propiedad' }] },
  { id: 'cta-mid', type: 'closing_invite', headline: 'x' },
  { id: 'location', type: 'location_showcase' },
  { id: 'closing', type: 'closing_invite', headline: 'y' },
  { id: 'footer', type: 'footer_brand' },
]

// Insertar 'gallery' debe caer entre 'story' (idx 2) y 'cta-mid' (antes de plans/cta-mid).
const withGallery = insertBlockInCuratedOrder(base, {
  id: 'gallery', type: 'curated_gallery', photoIndices: [1, 2],
})
const ids = withGallery.map((b) => b.id).join(',')
if (ids !== 'hero,stats,story,gallery,cta-mid,location,closing,footer')
  throw new Error('orden incorrecto tras insertar gallery: ' + ids)

// Quitar 'gallery' vuelve al original.
const back = removeBlockById(withGallery, 'gallery').map((b) => b.id).join(',')
if (back !== 'hero,stats,story,cta-mid,location,closing,footer')
  throw new Error('removeBlockById falló: ' + back)

// replaceBlockById cambia el bloque manteniendo posición.
const replaced = replaceBlockById(base, 'cta-mid', { id: 'cta-mid', type: 'closing_invite', headline: 'NUEVO' })
const mid = replaced.find((b) => b.id === 'cta-mid') as Extract<LandingBlock, { type: 'closing_invite' }>
if (mid.headline !== 'NUEVO') throw new Error('replaceBlockById no reemplazó')
if (replaced.map((b) => b.id).join(',') !== base.map((b) => b.id).join(','))
  throw new Error('replaceBlockById cambió el orden')

if (CURATED_ORDER[0] !== 'hero' || CURATED_ORDER[CURATED_ORDER.length - 1] !== 'footer')
  throw new Error('CURATED_ORDER inesperado')
console.log('OK block-order + block-patch')
```

- [ ] **Step 2: Correr el probe (falla: módulos no existen)**

Run: `node --env-file=.env.local --import tsx scripts/landing-editor-order.probe.ts`
Expected: FALLA con "Cannot find module".

- [ ] **Step 3: Implementar `block-order.ts`**

```ts
/**
 * E1.6 Editor — orden curado de la plantilla de lujo (por id de bloque) y helpers
 * para insertar/quitar bloques OPCIONALES manteniendo el orden. NO permite bloques
 * arbitrarios: sólo se insertan bloques cuyo id ∈ CURATED_ORDER.
 */
import type { LandingBlock } from '@/lib/landing/schema'

export const CURATED_ORDER: readonly string[] = [
  'hero', 'stats', 'story', 'gallery', 'plans', 'cta-mid', 'location', 'closing', 'footer',
]

function rank(id: string): number {
  const i = CURATED_ORDER.indexOf(id)
  return i < 0 ? Number.MAX_SAFE_INTEGER : i
}

export function removeBlockById(blocks: LandingBlock[], id: string): LandingBlock[] {
  return blocks.filter((b) => b.id !== id)
}

/**
 * Inserta `block` en la posición canónica: justo después del último bloque cuyo
 * rank es <= al del bloque nuevo. Idempotente (si ya existe, lo reemplaza en su lugar).
 */
export function insertBlockInCuratedOrder(blocks: LandingBlock[], block: LandingBlock): LandingBlock[] {
  const without = removeBlockById(blocks, block.id)
  const r = rank(block.id)
  let insertAt = without.length
  for (let i = 0; i < without.length; i++) {
    if (rank(without[i].id) > r) { insertAt = i; break }
  }
  return [...without.slice(0, insertAt), block, ...without.slice(insertAt)]
}
```

- [ ] **Step 4: Implementar `block-patch.ts`**

```ts
/**
 * E1.6 Editor — reemplazo/patch de bloques por id (inmutable), preservando orden.
 */
import type { LandingBlock } from '@/lib/landing/schema'

export function replaceBlockById(blocks: LandingBlock[], id: string, next: LandingBlock): LandingBlock[] {
  return blocks.map((b) => (b.id === id ? next : b))
}

type StoryBlock = Extract<LandingBlock, { type: 'story_blocks' }>

export function patchStoryItem(
  block: StoryBlock,
  index: number,
  patch: Partial<{ eyebrow: string; headline: string; body: string; photoIndex: number }>,
): StoryBlock {
  const items = block.items.map((it, i) => (i === index ? { ...it, ...patch } : it))
  return { ...block, items }
}
```

- [ ] **Step 5: Implementar `editable.ts`**

```ts
/**
 * E1.6 Editor — límites de longitud (del schema), secciones toggleables y defaults.
 */
import type { LandingBlock, LandingBlockType } from '@/lib/landing/schema'
import type { LandingProperty } from '@/lib/landing/registry'

export const FIELD_MAX: Record<string, number> = {
  titleOverride: 160, subtitle: 200, offerLabel: 40, ctaLabel: 40, label: 40,
  'story.eyebrow': 60, 'story.headline': 160, 'story.body': 500,
  'gallery.eyebrow': 60, 'gallery.title': 120,
  'location.eyebrow': 60, 'location.title': 120, 'location.body': 400,
  'closing.eyebrow': 60, 'closing.headline': 200, 'closing.body': 400,
}

/** Secciones OPCIONALES que el asesor puede mostrar/ocultar (por id canónico). */
export const TOGGLEABLE: ReadonlyArray<{ id: string; type: LandingBlockType; label: string }> = [
  { id: 'gallery', type: 'curated_gallery', label: 'Galería de fotos' },
  { id: 'plans', type: 'floor_plans', label: 'Planos' },
  { id: 'location', type: 'location_showcase', label: 'Ubicación' },
]

/** Construye el bloque opcional con sus defaults (para re-mostrar una sección oculta). */
export function defaultOptionalBlock(id: string, property: LandingProperty): LandingBlock | null {
  const photos = property.photos ?? []
  switch (id) {
    case 'gallery':
      return { id: 'gallery', type: 'curated_gallery', eyebrow: 'La propiedad',
        title: 'Recorré cada rincón', photoIndices: photos.map((_, i) => i) }
    case 'plans':
      return { id: 'plans', type: 'floor_plans', title: 'Distribución' }
    case 'location':
      return { id: 'location', type: 'location_showcase', eyebrow: 'Ubicación' }
    default:
      return null
  }
}
```

- [ ] **Step 6: Correr el probe (pasa)**

Run: `node --env-file=.env.local --import tsx scripts/landing-editor-order.probe.ts`
Expected: `OK block-order + block-patch`.

- [ ] **Step 7: tsc + commit**

Run: `npx tsc --noEmit` → 0 errores.
```bash
git add lib/landing/editor/ scripts/landing-editor-order.probe.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(landing): helpers puros de orden/patch de bloques del editor (E1.6)"
```

---

### Task 5: CSS — neutralizar animaciones en la preview del editor

**Files:**
- Modify: `app/globals.css`

**Interfaces:**
- Produces: clase `.lx-editor-preview` que apaga `lx-reveal`/`hero-rise`/`hero-zoom`/`hero-cue` (contenido estático y visible al editar).

- [ ] **Step 1: Agregar el bloque CSS** (al final del scope `.landing-root` o junto a las keyframes de lujo)

```css
/* E1.6 Editor — dentro de la vista previa del editor NO animamos: el contenido
   debe quedar estático y visible mientras se edita (evita parpadeos por re-render
   en cada tecla). Anula tanto los bloques self-animated (lx-reveal) como el hero. */
.lx-editor-preview .lx-reveal,
.lx-editor-preview .hero-rise,
.lx-editor-preview .hero-zoom,
.lx-editor-preview .hero-cue {
  animation: none !important;
  opacity: 1 !important;
  transform: none !important;
}
```

- [ ] **Step 2: Commit**

```bash
git add app/globals.css
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "style(landing): neutralizar animaciones en la preview del editor (E1.6)"
```

---

### Task 6: `EditorPreview` — vista previa con bloques seleccionables

**Files:**
- Create: `components/landing/editor/EditorPreview.tsx`
- Create: `scripts/landing-editor-preview.probe.tsx`

**Interfaces:**
- Consumes: `BLOCK_REGISTRY`, `LandingProperty` (registry), `LandingDocument` (schema), `LeadCaptureProvider`.
- Produces: `<EditorPreview document property selectedId onSelect />` (client).

- [ ] **Step 1: Implementar `EditorPreview.tsx`**

```tsx
'use client'
/**
 * E1.6 Editor — vista previa en vivo. Itera los bloques del documento con el MISMO
 * BLOCK_REGISTRY que la landing pública (mode='edit'), pero envuelve cada bloque en
 * un overlay clickeable que lo SELECCIONA (y captura los clics para que los CTAs
 * internos no se disparen mientras se edita). Sin animaciones (clase lx-editor-preview).
 */
import { BLOCK_REGISTRY, type LandingProperty } from '@/lib/landing/registry'
import type { LandingDocument } from '@/lib/landing/schema'
import { LeadCaptureProvider } from '@/components/landing/LeadCaptureProvider'

interface EditorPreviewProps {
  document: LandingDocument
  property: LandingProperty
  selectedId: string | null
  onSelect: (id: string) => void
}

export function EditorPreview({ document, property, selectedId, onSelect }: EditorPreviewProps) {
  const ctx = { property, theme: document.theme ?? {}, mode: 'edit' as const }
  const title = property.title ?? `${property.property_type} en ${property.neighborhood}`
  return (
    <div className="landing-root lx-editor-preview">
      <LeadCaptureProvider propertyId={property.id} propertyTitle={title}>
        {document.blocks.map((block) => {
          const def = BLOCK_REGISTRY[block.type]
          if (!def) return null
          const node = def.render(block, ctx)
          const selected = selectedId === block.id
          return (
            <div key={block.id} className="relative" data-block-id={block.id}>
              {node ?? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  Sección «{def.label}» (sin datos para mostrar)
                </div>
              )}
              {/* Captura TODOS los clics del bloque → seleccionar (bloquea CTAs internos). */}
              <button
                type="button"
                onClick={() => onSelect(block.id)}
                aria-label={`Editar sección ${def.label}`}
                className="absolute inset-0 z-10 cursor-pointer"
              />
              {selected && (
                <div className="pointer-events-none absolute inset-0 z-20 ring-2 ring-inset ring-[color:var(--brand)]" />
              )}
            </div>
          )
        })}
      </LeadCaptureProvider>
    </div>
  )
}
```

- [ ] **Step 2: Probe de render estático (falla primero)**

`scripts/landing-editor-preview.probe.tsx`:
```tsx
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { EditorPreview } from '../components/landing/editor/EditorPreview'
import { buildLuxuryDocument } from '../lib/landing/templates/luxury'
import { deterministicConversionCopy } from '../lib/landing/conversion-copy'
import { deriveTier } from '../lib/landing/tier'

const property = {
  id: 'p1', title: 'Depto de prueba', property_type: 'departamento', neighborhood: 'Palermo',
  city: 'CABA', operation_type: 'venta', asking_price: 250000, currency: 'USD',
  photos: ['https://x/0.jpg', 'https://x/1.jpg', 'https://x/2.jpg', 'https://x/3.jpg'],
  description: 'Hermoso depto.',
} as unknown as Parameters<typeof buildLuxuryDocument>[0]

const doc = buildLuxuryDocument(property, deterministicConversionCopy(property), deriveTier(property))
const html = renderToStaticMarkup(
  React.createElement(EditorPreview, { document: doc, property, selectedId: 'hero', onSelect: () => {} }),
)
if (!html.includes('lx-editor-preview')) throw new Error('falta la clase lx-editor-preview')
if (!html.includes('data-block-id="hero"')) throw new Error('no envolvió el bloque hero')
if (!html.includes('Editar sección')) throw new Error('faltan los overlays de selección')
if (!html.includes('ring-[color:var(--brand)]')) throw new Error('no marcó el bloque seleccionado')
console.log('OK EditorPreview render estático')
```
NOTA sobre imports: `conversion-copy.ts` exporta `deterministicConversionCopy` (puro); si el módulo arrastra el cliente IA a nivel de import y el probe falla al cargar, importá en su lugar `luxuryTemplate.build(property)` (que también usa el copy determinístico) desde `../lib/landing/templates/luxury` y borrá los imports de copy/tier.

- [ ] **Step 3: Correr el probe (pasa tras implementar)**

Run: `node --env-file=.env.local --import tsx scripts/landing-editor-preview.probe.tsx`
Expected: `OK EditorPreview render estático`. Si falla por `LeadCaptureProvider` (hooks en SSR), envolvé el probe verificando que igual produce el markup; si el provider necesita `'use client'` en SSR, el `renderToStaticMarkup` lo tolera (es un provider de contexto). Si aún falla, temporalmente probá `EditorPreview` sin el provider para aislar y luego reintroducilo.

- [ ] **Step 4: tsc + commit**

Run: `npx tsc --noEmit` → 0 errores.
```bash
git add components/landing/editor/EditorPreview.tsx scripts/landing-editor-preview.probe.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(landing): EditorPreview con bloques seleccionables (E1.6)"
```

---

### Task 7: `useAutosave` — hook de guardado automático a borrador

**Files:**
- Create: `components/landing/editor/useAutosave.ts`

**Interfaces:**
- Consumes: `LandingDocument` (para validar antes de mandar), `PATCH /api/properties/[id]/landing` con `{ draftContent }`.
- Produces: `useAutosave(propertyId, doc) → { status, flush }`.

- [ ] **Step 1: Implementar el hook**

```ts
'use client'
/**
 * E1.6 Editor — autosave del borrador. Debounce ~800ms: valida el documento con Zod
 * en el cliente y hace PATCH { draftContent }. Expone flush() para forzar el guardado
 * pendiente antes de publicar. No escribe si el documento no cambió.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { LandingDocument } from '@/lib/landing/schema'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export function useAutosave(propertyId: string, doc: LandingDocument) {
  const [status, setStatus] = useState<SaveStatus>('idle')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef<string>('')     // JSON del último doc guardado
  const pending = useRef<LandingDocument | null>(null)
  const firstRun = useRef(true)

  const save = useCallback(async (d: LandingDocument) => {
    const json = JSON.stringify(d)
    if (json === lastSaved.current) return
    const parsed = LandingDocument.safeParse(d)
    if (!parsed.success) { setStatus('error'); return }
    setStatus('saving')
    try {
      const res = await fetch(`/api/properties/${propertyId}/landing`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ draftContent: parsed.data }),
      })
      if (!res.ok) throw new Error()
      lastSaved.current = json
      setStatus('saved')
    } catch {
      setStatus('error')
    }
  }, [propertyId])

  // Inicializa lastSaved con el doc de arranque (no re-guarda lo que vino del server).
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; lastSaved.current = JSON.stringify(doc); return }
    pending.current = doc
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { if (pending.current) save(pending.current) }, 800)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [doc, save])

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current)
    if (pending.current) await save(pending.current)
  }, [save])

  return { status, flush }
}
```

- [ ] **Step 2: tsc + commit**

Run: `npx tsc --noEmit` → 0 errores.
```bash
git add components/landing/editor/useAutosave.ts
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(landing): hook useAutosave del editor (E1.6)"
```

---

### Task 8: `LandingEditor` shell + ruta del editor + botón en LandingSection

**Files:**
- Create: `components/landing/editor/LandingEditor.tsx`
- Create: `app/(dashboard)/properties/[id]/landing/edit/page.tsx`
- Modify: `components/properties/LandingSection.tsx`

**Interfaces:**
- Consumes: `EditorPreview`, `useAutosave`, `safeParseLandingDocument`, `getLanding`, `authorizeLanding`, `requireAuth`, `luxuryTemplate`, `admin` (para leer la propiedad server-side).
- Produces: página `/properties/[id]/landing/edit`; `LandingEditor` client shell (panel derecho vacío por ahora — se llena en F2).

- [ ] **Step 1: `LandingEditor.tsx` (shell con panel placeholder)**

```tsx
'use client'
/**
 * E1.6 Editor — shell de 2 paneles. Izquierda: EditorPreview (landing real). Derecha:
 * panel de edición (placeholder en F1; se completa en F2/F3). Estado del documento +
 * autosave a borrador + "Publicar cambios". La estructura de lujo queda fija.
 */
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { ArrowLeft, Check, Loader2, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EditorPreview } from './EditorPreview'
import { useAutosave } from './useAutosave'
import type { LandingProperty } from '@/lib/landing/registry'
import type { LandingDocument } from '@/lib/landing/schema'

interface LandingEditorProps {
  propertyId: string
  property: LandingProperty
  initialDocument: LandingDocument
  isPublished: boolean
  publicSlug: string | null
}

export function LandingEditor({ propertyId, property, initialDocument, isPublished, publicSlug }: LandingEditorProps) {
  const router = useRouter()
  const [doc, setDoc] = useState<LandingDocument>(initialDocument)
  const [selectedId, setSelectedId] = useState<string | null>('hero')
  const [publishing, setPublishing] = useState(false)
  const { status, flush } = useAutosave(propertyId, doc)

  async function publish() {
    setPublishing(true)
    try {
      await flush() // asegura que el último cambio quedó en el borrador
      const res = await fetch(`/api/properties/${propertyId}/landing/publish`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'No se pudo publicar')
      toast.success('Cambios publicados')
      router.refresh()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Error al publicar')
    } finally {
      setPublishing(false)
    }
  }

  const saveLabel =
    status === 'saving' ? 'Guardando…' : status === 'error' ? 'Error al guardar' : status === 'saved' ? 'Guardado' : ' '

  return (
    <div className="flex h-[100dvh] flex-col">
      <header className="flex items-center justify-between gap-3 border-b bg-background px-4 py-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push(`/properties/${propertyId}`)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Volver
          </Button>
          <span className="text-sm font-medium">Editar landing</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {status === 'saving' && <Loader2 className="h-3 w-3 animate-spin" />}
            {status === 'saved' && <Check className="h-3 w-3 text-emerald-600" />}
            {saveLabel}
          </span>
          <Button size="sm" onClick={publish} disabled={publishing}>
            {publishing ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Rocket className="mr-1 h-4 w-4" />}
            {isPublished ? 'Publicar cambios' : 'Publicar landing'}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* Vista previa (scrollea) */}
        <div className="min-h-0 flex-1 overflow-y-auto bg-muted/30">
          <EditorPreview document={doc} property={property} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
        {/* Panel de edición */}
        <aside className="w-full shrink-0 overflow-y-auto border-t bg-background p-4 md:w-[380px] md:border-l md:border-t-0">
          <p className="text-sm text-muted-foreground">
            Tocá una sección en la vista previa para editarla. (Los controles llegan en la próxima etapa.)
          </p>
          {publicSlug && (
            <a href={`/p/${publicSlug}`} target="_blank" rel="noopener noreferrer"
              className="mt-3 inline-block text-xs text-emerald-700 underline">
              Ver landing publicada
            </a>
          )}
        </aside>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Ruta server `edit/page.tsx`**

```tsx
/**
 * E1.6 — Página del editor de landing (pantalla completa). Server component: gatea por
 * rol (abogado 403) y carga la propiedad + la landing. Edita el borrador (draft_content)
 * si existe; si no, arranca del content publicado; si tampoco hay, del template de lujo.
 */
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { requireAuth } from '@/lib/auth/require-role'
import { authorizeLanding, getLanding } from '@/lib/landing/landing-service'
import { safeParseLandingDocument } from '@/lib/landing/schema'
import { luxuryTemplate } from '@/lib/landing/templates/luxury'
import { LandingEditor } from '@/components/landing/editor/LandingEditor'
import type { LandingProperty } from '@/lib/landing/registry'

function admin() {
  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export default async function LandingEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireAuth()
  const { id } = await params
  if (!(await authorizeLanding(id, user.id, user.profile.role))) redirect(`/properties/${id}`)

  const { data: property } = await admin().from('properties').select('*').eq('id', id).maybeSingle()
  if (!property) notFound()

  const landing = await getLanding(id)
  if (!landing) redirect(`/properties/${id}`) // sin landing: se crea desde la ficha (asistente IA)

  const initialDocument =
    safeParseLandingDocument(landing.draft_content) ??
    safeParseLandingDocument(landing.content) ??
    luxuryTemplate.build(property as unknown as LandingProperty)

  return (
    <LandingEditor
      propertyId={id}
      property={property as unknown as LandingProperty}
      initialDocument={initialDocument}
      isPublished={landing.status === 'published'}
      publicSlug={landing.public_slug}
    />
  )
}
```

- [ ] **Step 3: Botón "Editar landing" en `LandingSection.tsx`**

Agregá el import y el hook (arriba del componente):
```ts
import { useRouter } from 'next/navigation'
```
Dentro de `LandingSection`, cerca de los otros `useState`:
```ts
const router = useRouter()
```
En el bloque `published` (LandingSection.tsx:169-189), reemplazá la línea del botón "Editar diseño" por los DOS botones:
```tsx
<div className="flex flex-wrap gap-2">
  <Button size="sm" onClick={() => router.push(`/properties/${propertyId}/landing/edit`)}>
    Editar landing
  </Button>
  <Button variant="ghost" size="sm" onClick={() => patch({ wizardState: { step: 'template' } })}>
    Cambiar plantilla
  </Button>
</div>
```

- [ ] **Step 4: tsc**

Run: `npx tsc --noEmit`
Expected: 0 errores. (Si `requireAuth`/`authorizeLanding`/`getLanding` no están exportados con esos nombres, verificá en `lib/auth/require-role.ts` y `lib/landing/landing-service.ts` — `authorizeLanding` y `getLanding` SÍ se exportan según el mapeo.)

- [ ] **Step 5: Commit**

```bash
git add "components/landing/editor/LandingEditor.tsx" "app/(dashboard)/properties/[id]/landing/edit/page.tsx" "components/properties/LandingSection.tsx"
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(landing): shell del editor + ruta /landing/edit + botón en LandingSection (E1.6)"
```

**Deliverable F1:** el asesor entra por "Editar landing", ve la landing real a la izquierda, puede seleccionar bloques (ring), el autosave escribe `draft_content` (verificable en DB) y "Publicar cambios" promueve el borrador a la versión pública. El panel derecho es un placeholder.

---

## FASE 2 — Panels de texto

### Task 9: `EditorPanel` (router) + `InfoPanel`

**Files:**
- Create: `components/landing/editor/EditorPanel.tsx`
- Create: `components/landing/editor/panels/InfoPanel.tsx`
- Modify: `components/landing/editor/LandingEditor.tsx` (usar EditorPanel + pasar `onChange`)

**Interfaces:**
- Consumes: el bloque seleccionado + `onChange(next: LandingBlock)` + `property`.
- Produces: `<EditorPanel block property onChange />` que despacha al panel correcto por `block.type`.

- [ ] **Step 1: `InfoPanel.tsx`** (para bloques sin campos: `stats_bar`, `footer_brand`, y fallback)

```tsx
'use client'
export function InfoPanel({ text }: { text: string }) {
  return <p className="text-sm text-muted-foreground">{text}</p>
}
```

- [ ] **Step 2: `EditorPanel.tsx`** (router — los panels de texto se agregan en las tasks siguientes; acá el esqueleto con InfoPanel y TODO-free imports que ya existen)

```tsx
'use client'
/**
 * E1.6 Editor — despacha el bloque seleccionado a su panel de edición. La estructura
 * de lujo es fija: sólo se editan campos de contenido. Bloques sin campos → InfoPanel.
 */
import type { LandingBlock } from '@/lib/landing/schema'
import type { LandingProperty } from '@/lib/landing/registry'
import { InfoPanel } from './panels/InfoPanel'
import { HeroPanel } from './panels/HeroPanel'
import { StoryBlocksPanel } from './panels/StoryBlocksPanel'
import { CuratedGalleryPanel } from './panels/CuratedGalleryPanel'
import { LocationPanel } from './panels/LocationPanel'
import { ClosingPanel } from './panels/ClosingPanel'

interface EditorPanelProps {
  block: LandingBlock
  property: LandingProperty
  onChange: (next: LandingBlock) => void
}

export function EditorPanel({ block, property, onChange }: EditorPanelProps) {
  switch (block.type) {
    case 'hero':
      return <HeroPanel block={block} property={property} onChange={onChange} />
    case 'story_blocks':
      return <StoryBlocksPanel block={block} property={property} onChange={onChange} />
    case 'curated_gallery':
      return <CuratedGalleryPanel block={block} property={property} onChange={onChange} />
    case 'location_showcase':
      return <LocationPanel block={block} onChange={onChange} />
    case 'closing_invite':
      return <ClosingPanel block={block} onChange={onChange} />
    case 'stats_bar':
      return <InfoPanel text="Esta franja se arma sola con los datos de la propiedad (ambientes, dormitorios, superficie). No necesita edición." />
    case 'floor_plans':
      return <InfoPanel text="Los planos se toman de los archivos cargados en la sección Multimedia de la propiedad." />
    case 'footer_brand':
      return <InfoPanel text="El pie muestra la marca Diego Ferreyra y la matrícula CUCICBA. No necesita edición." />
    default:
      return <InfoPanel text="Esta sección no tiene campos editables." />
  }
}
```
NOTA: creá los 5 panels (Tasks 10-13) ANTES de correr tsc de esta task, o creá stubs temporales. Para orden limpio, implementá HeroPanel/Story/Gallery/Location/Closing en las tasks siguientes y dejá esta task como "cableado" que compila una vez existan. Si preferís TDD estricto, invertí: hacé primero Task 10-13 y last el router.

- [ ] **Step 3: Cablear el panel en `LandingEditor`**

En `LandingEditor.tsx`, reemplazá el `<aside>` placeholder por:
```tsx
import { EditorPanel } from './EditorPanel'
import { replaceBlockById } from '@/lib/landing/editor/block-patch'
// ...
const selectedBlock = doc.blocks.find((b) => b.id === selectedId) ?? null
function handleBlockChange(next: import('@/lib/landing/schema').LandingBlock) {
  setDoc((d) => ({ ...d, blocks: replaceBlockById(d.blocks, next.id, next) }))
}
// ...en el JSX del aside:
<aside className="w-full shrink-0 overflow-y-auto border-t bg-background p-4 md:w-[380px] md:border-l md:border-t-0">
  {selectedBlock ? (
    <EditorPanel block={selectedBlock} property={property} onChange={handleBlockChange} />
  ) : (
    <p className="text-sm text-muted-foreground">Tocá una sección en la vista previa para editarla.</p>
  )}
</aside>
```

- [ ] **Step 4: tsc + commit** (tras crear los panels de las tasks 10-13)

Run: `npx tsc --noEmit` → 0 errores.
```bash
git add components/landing/editor/
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(landing): router EditorPanel + InfoPanel + cableado en el shell (E1.6)"
```

---

### Task 10: `HeroPanel` (textos del hero)

**Files:**
- Create: `components/landing/editor/panels/HeroPanel.tsx`

**Interfaces:**
- Consumes: `HeroBlock` + `onChange`. Campos de texto: `titleOverride`, `subtitle`, `offerLabel`, `ctaLabel`. (La portada `heroPhotoIndex` y `mediaMode` se agregan en F3.)
- Produces: `<HeroPanel block property onChange />`.

- [ ] **Step 1: Implementar**

```tsx
'use client'
import type { LandingBlock } from '@/lib/landing/schema'
import type { LandingProperty } from '@/lib/landing/registry'
import { Field } from './Field'

type Hero = Extract<LandingBlock, { type: 'hero' }>

export function HeroPanel({ block, onChange }: {
  block: Hero; property: LandingProperty; onChange: (b: Hero) => void
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Portada</h3>
      <Field label="Titular" value={block.titleOverride ?? ''} maxKey="titleOverride" multiline
        onChange={(v) => onChange({ ...block, titleOverride: v })} />
      <Field label="Subtítulo" value={block.subtitle ?? ''} maxKey="subtitle" multiline
        onChange={(v) => onChange({ ...block, subtitle: v })} />
      <Field label="Etiqueta del precio" value={block.offerLabel ?? ''} maxKey="offerLabel"
        onChange={(v) => onChange({ ...block, offerLabel: v })} />
      <Field label="Texto del botón" value={block.ctaLabel ?? ''} maxKey="ctaLabel"
        onChange={(v) => onChange({ ...block, ctaLabel: v })} />
    </div>
  )
}
```

- [ ] **Step 2: Crear el primitivo compartido `Field.tsx`** (usado por todos los panels de texto)

`components/landing/editor/panels/Field.tsx`:
```tsx
'use client'
/** Campo de texto con contador y límite (del schema). Guarda '' → undefined-safe: el
 *  panel decide; acá sólo capamos la longitud para no romper el Zod al guardar. */
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FIELD_MAX } from '@/lib/landing/editor/editable'

export function Field({ label, value, maxKey, multiline, onChange }: {
  label: string; value: string; maxKey: string; multiline?: boolean; onChange: (v: string) => void
}) {
  const max = FIELD_MAX[maxKey] ?? 200
  const Comp = multiline ? Textarea : Input
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <Comp
        value={value}
        maxLength={max}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          onChange(e.target.value.slice(0, max))}
        rows={multiline ? 3 : undefined}
      />
      <span className="block text-right text-[10px] text-muted-foreground">{value.length}/{max}</span>
    </label>
  )
}
```
NOTA: `FIELD_MAX` usa claves por sección para story/gallery/location/closing (`'story.headline'`, etc.). En HeroPanel las claves son los nombres crudos (`titleOverride`, `subtitle`, `offerLabel`, `ctaLabel`) que ya están en `FIELD_MAX`. En los otros panels pasá la clave con prefijo de sección.

- [ ] **Step 3: tsc + commit**

Run: `npx tsc --noEmit` → 0 errores.
```bash
git add components/landing/editor/panels/HeroPanel.tsx components/landing/editor/panels/Field.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(landing): HeroPanel + primitivo Field del editor (E1.6)"
```

---

### Task 11: `StoryBlocksPanel` (los 3 bloques de historia)

**Files:**
- Create: `components/landing/editor/panels/StoryBlocksPanel.tsx`

**Interfaces:**
- Consumes: `StoryBlocksBlock` + `patchStoryItem` + `onChange`. Edita `eyebrow`/`headline`/`body` de cada item. (La foto de cada item → F3.)

- [ ] **Step 1: Implementar**

```tsx
'use client'
import type { LandingBlock } from '@/lib/landing/schema'
import type { LandingProperty } from '@/lib/landing/registry'
import { patchStoryItem } from '@/lib/landing/editor/block-patch'
import { Field } from './Field'

type Story = Extract<LandingBlock, { type: 'story_blocks' }>

export function StoryBlocksPanel({ block, onChange }: {
  block: Story; property: LandingProperty; onChange: (b: Story) => void
}) {
  return (
    <div className="space-y-6">
      <h3 className="text-sm font-semibold">Historia</h3>
      {block.items.map((it, i) => (
        <div key={i} className="space-y-3 rounded-lg border p-3">
          <p className="text-xs font-semibold text-muted-foreground">Bloque {it.numeral}</p>
          <Field label="Antetítulo" value={it.eyebrow} maxKey="story.eyebrow"
            onChange={(v) => onChange(patchStoryItem(block, i, { eyebrow: v }))} />
          <Field label="Título" value={it.headline} maxKey="story.headline" multiline
            onChange={(v) => onChange(patchStoryItem(block, i, { headline: v }))} />
          <Field label="Texto" value={it.body} maxKey="story.body" multiline
            onChange={(v) => onChange(patchStoryItem(block, i, { body: v }))} />
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: tsc + commit**

Run: `npx tsc --noEmit` → 0 errores.
```bash
git add components/landing/editor/panels/StoryBlocksPanel.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(landing): StoryBlocksPanel (E1.6)"
```

---

### Task 12: `LocationPanel` + `ClosingPanel`

**Files:**
- Create: `components/landing/editor/panels/LocationPanel.tsx`
- Create: `components/landing/editor/panels/ClosingPanel.tsx`

**Interfaces:**
- Consumes: `LocationShowcaseBlock` / `ClosingInviteBlock` + `onChange`.

- [ ] **Step 1: `LocationPanel.tsx`**

```tsx
'use client'
import type { LandingBlock } from '@/lib/landing/schema'
import { Field } from './Field'

type Loc = Extract<LandingBlock, { type: 'location_showcase' }>

export function LocationPanel({ block, onChange }: { block: Loc; onChange: (b: Loc) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Ubicación</h3>
      <Field label="Antetítulo" value={block.eyebrow ?? ''} maxKey="location.eyebrow"
        onChange={(v) => onChange({ ...block, eyebrow: v })} />
      <Field label="Título" value={block.title ?? ''} maxKey="location.title"
        onChange={(v) => onChange({ ...block, title: v })} />
      <Field label="Texto de la zona" value={block.body ?? ''} maxKey="location.body" multiline
        onChange={(v) => onChange({ ...block, body: v })} />
    </div>
  )
}
```

- [ ] **Step 2: `ClosingPanel.tsx`** (sirve para `cta-mid` y `closing`; `headline` es requerido — no dejar vacío)

```tsx
'use client'
import type { LandingBlock } from '@/lib/landing/schema'
import { Field } from './Field'

type Closing = Extract<LandingBlock, { type: 'closing_invite' }>

export function ClosingPanel({ block, onChange }: { block: Closing; onChange: (b: Closing) => void }) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Invitación / CTA</h3>
      <Field label="Antetítulo" value={block.eyebrow ?? ''} maxKey="closing.eyebrow"
        onChange={(v) => onChange({ ...block, eyebrow: v })} />
      <Field label="Título" value={block.headline} maxKey="closing.headline" multiline
        onChange={(v) => onChange({ ...block, headline: v || block.headline })} />
      <Field label="Texto" value={block.body ?? ''} maxKey="closing.body" multiline
        onChange={(v) => onChange({ ...block, body: v })} />
      <Field label="Texto del botón" value={block.ctaLabel ?? ''} maxKey="ctaLabel"
        onChange={(v) => onChange({ ...block, ctaLabel: v })} />
      <p className="text-[11px] text-muted-foreground">El título no puede quedar vacío (es la invitación principal).</p>
    </div>
  )
}
```
NOTA sobre `headline` requerido: si el asesor borra todo, `v || block.headline` conserva el último valor no vacío para no romper el Zod (`headline` min implícito por ser requerido). Alternativa: permitir vacío pero bloquear el autosave (el hook ya pone `status='error'` si el doc no valida). El fallback `|| block.headline` es más amable.

- [ ] **Step 3: tsc + commit**

Run: `npx tsc --noEmit` → 0 errores.
```bash
git add components/landing/editor/panels/LocationPanel.tsx components/landing/editor/panels/ClosingPanel.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(landing): LocationPanel + ClosingPanel (E1.6)"
```

---

### Task 13: `CuratedGalleryPanel` (sólo textos por ahora)

**Files:**
- Create: `components/landing/editor/panels/CuratedGalleryPanel.tsx`

**Interfaces:**
- Consumes: `CuratedGalleryBlock` + `onChange`. Edita `eyebrow`/`title` (la selección/orden de fotos → F3).

- [ ] **Step 1: Implementar**

```tsx
'use client'
import type { LandingBlock } from '@/lib/landing/schema'
import type { LandingProperty } from '@/lib/landing/registry'
import { Field } from './Field'

type Gallery = Extract<LandingBlock, { type: 'curated_gallery' }>

export function CuratedGalleryPanel({ block, onChange }: {
  block: Gallery; property: LandingProperty; onChange: (b: Gallery) => void
}) {
  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold">Galería</h3>
      <Field label="Antetítulo" value={block.eyebrow ?? ''} maxKey="gallery.eyebrow"
        onChange={(v) => onChange({ ...block, eyebrow: v })} />
      <Field label="Título" value={block.title ?? ''} maxKey="gallery.title"
        onChange={(v) => onChange({ ...block, title: v })} />
      {/* La selección y el orden de fotos se agregan en F3 (PhotoPicker). */}
    </div>
  )
}
```

- [ ] **Step 2: tsc — ahora el router EditorPanel compila con todos los panels reales**

Run: `npx tsc --noEmit` → 0 errores.

- [ ] **Step 3: Probe de integración de panels (opcional pero recomendado)**

`scripts/landing-editor-panels.probe.tsx`: renderizá `EditorPanel` para un `hero`, un `story_blocks` y un `stats_bar`, y verificá con `renderToStaticMarkup` que aparecen los labels ("Titular", "Bloque I", "se arma sola"). Mismo patrón que el probe de EditorPreview.
Run: `node --env-file=.env.local --import tsx scripts/landing-editor-panels.probe.tsx` → `OK panels`.

- [ ] **Step 4: Commit**

```bash
git add components/landing/editor/panels/CuratedGalleryPanel.tsx scripts/landing-editor-panels.probe.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(landing): CuratedGalleryPanel + probe de panels (E1.6)"
```

**Deliverable F2:** el asesor edita TODOS los textos (hero, historia, galería, ubicación, cierres) desde el panel; se autosalva al borrador; "Publicar cambios" lo pone en vivo.

---

## FASE 3 — Fotos + toggles de sección

### Task 14: `PhotoPicker` (elegir/reordenar fotos por índice)

**Files:**
- Create: `components/landing/editor/PhotoPicker.tsx`

**Interfaces:**
- Consumes: `property.photos` (URLs), @dnd-kit (patrón de `PhotoGallery.tsx`).
- Produces: dos modos — `<PhotoPicker mode="single" photos value onPick />` (portada/historia) y `<PhotoPicker mode="multi" photos value onReorder />` (galería, con drag).

- [ ] **Step 1: Implementar** (adaptado de `components/properties/PhotoGallery.tsx`, pero opera sobre ÍNDICES y no persiste solo — el cambio sube por `onChange` del panel → autosave)

```tsx
'use client'
/**
 * E1.6 Editor — elige/reordena fotos de la propiedad por ÍNDICE (no sube ni borra
 * nada: eso vive en Multimedia). Modo 'single' = portada/historia (1 índice). Modo
 * 'multi' = galería (varios índices, con drag para reordenar; patrón de PhotoGallery).
 */
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core'
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVertical } from 'lucide-react'

function Thumb({ url, index, selected, onClick }: {
  url: string; index: number; selected: boolean; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick}
      className={`relative aspect-[4/3] overflow-hidden rounded-md ${selected ? 'ring-2 ring-[color:var(--brand)]' : 'ring-1 ring-border'}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`Foto ${index + 1}`} className="h-full w-full object-cover" />
    </button>
  )
}

function SortableThumb({ id, url, index, onRemove }: {
  id: string; url: string; index: number; onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }
  return (
    <div ref={setNodeRef} style={style} className="relative aspect-[4/3] overflow-hidden rounded-md ring-1 ring-border">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`Foto ${index + 1}`} className="h-full w-full object-cover" />
      <button type="button" onClick={onRemove} aria-label="Quitar de la galería"
        className="absolute right-1 top-1 h-5 w-5 rounded-full bg-black/60 text-xs text-white">×</button>
      <button type="button" {...attributes} {...listeners} aria-label="Arrastrar"
        className="absolute bottom-1 right-1 h-5 w-5 cursor-grab touch-none rounded-full bg-black/40 text-white">
        <GripVertical className="h-3 w-3" />
      </button>
    </div>
  )
}

interface SingleProps { mode: 'single'; photos: string[]; value: number; onPick: (index: number) => void }
interface MultiProps { mode: 'multi'; photos: string[]; value: number[]; onReorder: (indices: number[]) => void }

export function PhotoPicker(props: SingleProps | MultiProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  if (props.mode === 'single') {
    return (
      <div className="grid grid-cols-3 gap-2">
        {props.photos.map((url, i) => (
          <Thumb key={i} url={url} index={i} selected={i === props.value} onClick={() => props.onPick(i)} />
        ))}
      </div>
    )
  }

  // multi: los seleccionados (en orden) arriba, arrastrables; los no seleccionados abajo para agregar.
  const selected = props.value
  const available = props.photos.map((_, i) => i).filter((i) => !selected.includes(i))
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const from = selected.indexOf(Number(active.id))
    const to = selected.indexOf(Number(over.id))
    if (from < 0 || to < 0) return
    props.onReorder(arrayMove(selected, from, to))
  }
  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted-foreground">En la galería ({selected.length}). Arrastrá para reordenar.</p>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={selected.map(String)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-3 gap-2">
            {selected.map((idx) => (
              <SortableThumb key={idx} id={String(idx)} url={props.photos[idx]} index={idx}
                onRemove={() => props.onReorder(selected.filter((i) => i !== idx))} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {available.length > 0 && (
        <>
          <p className="text-[11px] text-muted-foreground">Agregar fotos</p>
          <div className="grid grid-cols-3 gap-2">
            {available.map((idx) => (
              <Thumb key={idx} url={props.photos[idx]} index={idx} selected={false}
                onClick={() => props.onReorder([...selected, idx])} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 2: tsc + commit**

Run: `npx tsc --noEmit` → 0 errores.
```bash
git add components/landing/editor/PhotoPicker.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(landing): PhotoPicker (elegir/reordenar por índice) (E1.6)"
```

---

### Task 15: Cablear PhotoPicker en Hero / Story / Gallery panels

**Files:**
- Modify: `components/landing/editor/panels/HeroPanel.tsx`
- Modify: `components/landing/editor/panels/StoryBlocksPanel.tsx`
- Modify: `components/landing/editor/panels/CuratedGalleryPanel.tsx`

- [ ] **Step 1: HeroPanel — portada + modo de medio**

Agregá al final del `space-y-4`:
```tsx
import { PhotoPicker } from '../PhotoPicker'
// ...
{(property.photos?.length ?? 0) > 0 && (
  <div className="space-y-1">
    <span className="text-xs font-medium text-muted-foreground">Foto de portada</span>
    <PhotoPicker mode="single" photos={property.photos ?? []} value={block.heroPhotoIndex ?? 0}
      onPick={(i) => onChange({ ...block, heroPhotoIndex: i })} />
  </div>
)}
```

- [ ] **Step 2: StoryBlocksPanel — foto por item**

Dentro del `.map`, después de los Fields:
```tsx
import { PhotoPicker } from '../PhotoPicker'
// ...
{(property.photos?.length ?? 0) > 0 && (
  <div className="space-y-1">
    <span className="text-xs font-medium text-muted-foreground">Foto</span>
    <PhotoPicker mode="single" photos={property.photos ?? []} value={it.photoIndex ?? 0}
      onPick={(idx) => onChange(patchStoryItem(block, i, { photoIndex: idx }))} />
  </div>
)}
```

- [ ] **Step 3: CuratedGalleryPanel — selección + orden**

Después de los Fields:
```tsx
import { PhotoPicker } from '../PhotoPicker'
// ...
{(property.photos?.length ?? 0) > 0 && (
  <PhotoPicker mode="multi" photos={property.photos ?? []}
    value={block.photoIndices ?? (property.photos ?? []).map((_, i) => i)}
    onReorder={(indices) => onChange({ ...block, photoIndices: indices })} />
)}
```

- [ ] **Step 4: tsc + commit**

Run: `npx tsc --noEmit` → 0 errores.
```bash
git add components/landing/editor/panels/HeroPanel.tsx components/landing/editor/panels/StoryBlocksPanel.tsx components/landing/editor/panels/CuratedGalleryPanel.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(landing): PhotoPicker cableado en hero/historia/galería (E1.6)"
```

---

### Task 16: `SectionToggles` (mostrar/ocultar galería, planos, ubicación)

**Files:**
- Create: `components/landing/editor/SectionToggles.tsx`
- Modify: `components/landing/editor/LandingEditor.tsx` (montar los toggles arriba del panel)

**Interfaces:**
- Consumes: `TOGGLEABLE`, `defaultOptionalBlock`, `insertBlockInCuratedOrder`, `removeBlockById`.
- Produces: `<SectionToggles doc property onToggle />` donde `onToggle(id, on)` agrega/quita el bloque opcional.

- [ ] **Step 1: `SectionToggles.tsx`**

```tsx
'use client'
/**
 * E1.6 Editor — mostrar/ocultar las secciones OPCIONALES (galería, planos, ubicación).
 * No toca hero/stats/historia/CTAs/pie (la estructura de lujo + los CTAs quedan fijos).
 * Planos sólo se ofrece si la propiedad tiene planos cargados.
 */
import type { LandingDocument } from '@/lib/landing/schema'
import type { LandingProperty } from '@/lib/landing/registry'
import { TOGGLEABLE } from '@/lib/landing/editor/editable'
import { Switch } from '@/components/ui/switch'

export function SectionToggles({ doc, property, onToggle }: {
  doc: LandingDocument; property: LandingProperty; onToggle: (id: string, on: boolean) => void
}) {
  const present = new Set(doc.blocks.map((b) => b.id))
  const hasPlans = ((property as { plans?: string[] | null }).plans ?? []).length > 0
  const hasPhotos = (property.photos ?? []).length >= 3
  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-xs font-semibold text-muted-foreground">Secciones</p>
      {TOGGLEABLE.map((t) => {
        if (t.id === 'plans' && !hasPlans) return null
        if (t.id === 'gallery' && !hasPhotos) return null
        return (
          <label key={t.id} className="flex items-center justify-between gap-2 text-sm">
            <span>{t.label}</span>
            <Switch checked={present.has(t.id)} onCheckedChange={(on) => onToggle(t.id, on)} />
          </label>
        )
      })}
    </div>
  )
}
```
NOTA: `components/ui/switch.tsx` NO existe (verificado). Creá el primitivo desde el paquete bundleado `radix-ui` (igual que `collapsible.tsx`/`tabs.tsx` del repo — NO usar `@radix-ui/react-switch` standalone ni `npx shadcn`, que necesita red). Contenido:
```tsx
'use client'
import * as React from 'react'
import { Switch as SwitchPrimitive } from 'radix-ui'
import { cn } from '@/lib/utils'

export function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors data-[state=checked]:bg-[color:var(--brand)] data-[state=unchecked]:bg-input',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0" />
    </SwitchPrimitive.Root>
  )
}
```
Verificá que `radix-ui` exponga `Switch` (`grep -n "Switch" node_modules/radix-ui/dist/index.d.ts`); si el named export difiere, ajustá el import. Alternativa sin dependencia: un `<button role="switch" aria-checked>` estilado.

- [ ] **Step 2: Cablear en `LandingEditor`**

```tsx
import { SectionToggles } from './SectionToggles'
import { insertBlockInCuratedOrder, removeBlockById } from '@/lib/landing/editor/block-order'
import { defaultOptionalBlock } from '@/lib/landing/editor/editable'
// ...
function handleToggle(id: string, on: boolean) {
  setDoc((d) => {
    if (on) {
      const existing = hiddenRef.current[id]
      const block = existing ?? defaultOptionalBlock(id, property)
      if (!block) return d
      delete hiddenRef.current[id]
      return { ...d, blocks: insertBlockInCuratedOrder(d.blocks, block) }
    }
    const found = d.blocks.find((b) => b.id === id)
    if (found) hiddenRef.current[id] = found  // recordamos lo editado por si lo vuelve a mostrar
    return { ...d, blocks: removeBlockById(d.blocks, id) }
  })
}
```
Agregá arriba del componente: `const hiddenRef = useRef<Record<string, import('@/lib/landing/schema').LandingBlock>>({})` (import `useRef`). Montá `<SectionToggles doc={doc} property={property} onToggle={handleToggle} />` en el `<aside>`, ARRIBA del `EditorPanel`.

- [ ] **Step 3: tsc + probe de toggles**

Run: `npx tsc --noEmit` → 0 errores.
Agregá al probe de orden un caso: togglear `location` off y on vuelve a la posición canónica (ya cubierto por `insertBlockInCuratedOrder`). Run el probe de orden → OK.

- [ ] **Step 4: Commit**

```bash
git add components/landing/editor/SectionToggles.tsx components/landing/editor/LandingEditor.tsx components/ui/switch.tsx
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "feat(landing): toggles de secciones opcionales (galería/planos/ubicación) (E1.6)"
```

**Deliverable F3:** el asesor cambia la portada, elige la foto de cada bloque de historia, selecciona/reordena la galería (drag), y muestra/oculta galería/planos/ubicación. Todo autosalvado; publica cuando quiere.

---

## FASE 4 — Pulido, review adversarial y deploy

### Task 17: Review adversarial (Workflow) + arreglos

**Files:** los del editor (según hallazgos).

- [ ] **Step 1: Lanzar el review adversarial**

Con el Workflow tool: fan-out de revisores sobre `components/landing/editor/**`, `lib/landing/editor/**`, `app/(dashboard)/properties/[id]/landing/edit/page.tsx`, y los diffs de `landing-service.ts` / `route.ts`. Dimensiones: (a) el borrador puede quedar Zod-inválido y romper el autosave (headline vacío, índices fuera de rango); (b) hydration/SSR (el editor es client; la ruta server pasa props serializables); (c) el overlay de selección tapa/rompe scroll o CTAs; (d) `publishLanding` promueve mal (pierde `content` cuando no hay draft); (e) fuga de auth (¿la ruta `/landing/edit` gatea abogado?); (f) fotos: índices que no existen en `property.photos`; (g) el `flush()` antes de publicar realmente persiste; (h) `hiddenRef` retiene bloques con datos viejos.

- [ ] **Step 2: Verificar cada hallazgo (adversarial verify) y arreglar los confirmados**

Sólo arreglar los CONFIRMED. Re-correr `tsc` + los probes tras cada fix.

- [ ] **Step 3: Commit de los arreglos**

```bash
git add -A
git -c user.name="Sujupar" -c user.email="redstyle50@gmail.com" commit -m "fix(landing): hallazgos del review adversarial del editor (E1.6)"
```

---

### Task 18: Verificación final headless + deploy

- [ ] **Step 1: tsc del proyecto** (acotado para no gatillar Turbopack)

Run: `npx tsc --noEmit`
Expected: 0 errores.

- [ ] **Step 2: Correr todos los probes**

Run:
```bash
node --env-file=.env.local --import tsx scripts/landing-editor-order.probe.ts
node --env-file=.env.local --import tsx scripts/landing-editor-promote.probe.ts
node --env-file=.env.local --import tsx scripts/landing-editor-preview.probe.tsx
node --env-file=.env.local --import tsx scripts/landing-editor-panels.probe.tsx
```
Expected: todos imprimen `OK ...`.

- [ ] **Step 3: Confirmar que la migración está aplicada en producción** (gate de deploy)

La columna `draft_content` DEBE existir antes de deployar (el PATCH del editor la escribe). Ya se aplicó en Task 1; reconfirmá con un `select` vía el script o el Dashboard.

- [ ] **Step 4: Push (deploy)**

```bash
git push origin main   # (verificá el remote que observa Netlify; el repo es sujupar/diego-ferreyra-inmobiliaria)
```

- [ ] **Step 5: Verificar el deploy**

WebFetch `https://<sitio>/api/version` → confirmá que el commit deployado es el último. (No se puede abrir el editor headless; el look/drag lo prueba el usuario.)

- [ ] **Step 6: Actualizar memoria/CLAUDE.md**

Documentar en CLAUDE.md (sección landing) el editor E1.6: ruta `/properties/[id]/landing/edit`, columna `draft_content`, publish promueve el borrador, verificación sólo en navegador. Actualizar el pointer en MEMORY.md.

---

### Task 19: Prueba del usuario en el navegador (gate humano)

- [ ] **Step 1: Pedirle al usuario que:**
  1. Entre a una propiedad publicada → "Editar landing".
  2. Cambie un texto y una foto, oculte la galería, y vea el "Guardado ✓".
  3. Confirme que la landing pública NO cambió hasta apretar "Publicar cambios".
  4. Apriete "Publicar cambios" y verifique el cambio en `/p/<slug>`.

- [ ] **Step 2: Ajustar según su feedback** (iterar en el navegador — igual que con la landing E1.9).

---

## Self-Review (checklist del plan)

- **Cobertura del spec:** borrador seguro (draft_content) ✓ Task 1-2; panel+preview en vivo ✓ Task 6,8; edición de textos ✓ Task 10-13; fotos (portada/historia/galería drag) ✓ Task 14-15; toggles de secciones ✓ Task 16; autosave + publicar ✓ Task 7-8; no romper el diseño (estructura fija, sólo campos+toggles) ✓ Global Constraints + Task 9,16; auth/abogado ✓ Task 8; verificación headless + navegador ✓ Task 17-19.
- **Placeholders:** ninguno — cada paso trae código real y comando con salida esperada.
- **Consistencia de tipos:** `LandingBlock`/`LandingDocument`/`LandingProperty` usados igual en todos lados; `Extract<LandingBlock,{type:...}>` para narrowing en panels; `patchStoryItem`/`replaceBlockById`/`insertBlockInCuratedOrder` con firmas fijas en "Interfaces canónicas"; `useAutosave` → `{status, flush}`; `PhotoPicker` union `single|multi`. `draft_content` en `LandingRow` + `updateLanding` + PATCH route coherentes.
- **Riesgos conocidos anotados:** invariante CTA (toggles nunca los tocan), `headline` requerido (fallback), índices de foto fuera de rango (verify en Task 17), `Switch` primitivo (verificar/copiar), imports de probes bajo tsx (rutas relativas + evitar IA/DB), y que el editor asume la estructura de lujo (ids canónicos) — para docs de otros templates los textos igual se editan por tipo, pero los toggles asumen lujo.

## Handoff de ejecución

Al terminar de guardar el plan, ofrecer al usuario las dos opciones de ejecución (subagent-driven recomendado vs inline). ANTES de la primera edición de código, correr el pre-flight (`anticipating-implementation-conflicts`) con las 14 dimensiones aplicadas a ESTE repo.
