# Landing de lujo replicable (E1.9) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que cualquier propiedad aprobada obtenga automáticamente una landing de calidad de lujo (nivel Villa Eva) con estructura de alta conversión, editable en copy/fotos, replicable a propiedades muy distintas.

**Architecture:** Plantilla de lujo CURADA sobre el motor de bloques existente (E1.2–E1.8). Un template `luxury` arma un `LandingDocument` en orden fijo, incluyendo/omitiendo bloques según datos + tier (alto_valor / estándar). Diseño navy-luxury por CSS scoped a `.landing-root`; secciones = server components con motion CSS (contenido siempre visible). Copy por IA con fallback determinístico. Popup único de captura para todos los CTAs.

**Tech Stack:** Next.js 16 (RSC) · React 19 · TypeScript 5 · Tailwind v4 (`@theme`) · Zod 4 · next/font · satori NO (motion es CSS puro) · Supabase.

## Global Constraints

- **Motion 100% CSS**, cero framer-motion en la landing. NUNCA ramificar la estructura del DOM según `useReducedMotion`. NUNCA dejar contenido con `opacity:0` esperando JS (contenido SIEMPRE visible; la animación es progresiva, dentro de `@media (prefers-reduced-motion: no-preference)`).
- **Server components** por default; client solo donde hay interacción real (popup, lightbox, floating CTA).
- **Sin asesor/persona** en la landing: todo marca Diego Ferreyra. CUCICBA 8266 como prueba social.
- **Estética:** navy (`--brand`) + verde + neutros cálidos; serif Cormorant Garamond (display) + sans editorial; `clamp()` fluido.
- **Commit author:** `Sujupar <redstyle50@gmail.com>` (sino falla el deploy de Netlify). Push a `origin main`.
- **No `next dev` local** (Turbopack rompe por la tilde de "Gestión"). Verificación por: `npx tsc --noEmit` (0 errores del repo) + `renderToStaticMarkup` en probe tsx (estructura + `NO opacity:0`) + validación `LandingDocument` contra Zod + review adversarial (Workflow) + WebFetch de estructura en producción + OK visual del usuario.
- **Reusar sin reescribir:** `lib/landing/schema.ts`, `registry.tsx`, `LandingRenderer.tsx`, `templates/`, `conversion-copy.ts`, `components/landing/{LeadCaptureProvider,CtaButton,Reveal,MetaPixel,LandingVisitTracker}.tsx`, `lib/landing/{get-landing,funnel-type,landing-service}.ts`.
- **Backwards-compat:** landings publicadas viejas (con `lead_form`/`conversion`) deben seguir renderizando; el invariante del schema acepta `lead_form` o `cta` (≥1).

## Convención de verificación (patrón de "test" del proyecto)

No hay jest/vitest. El "test" de cada tarea es un probe tsx con `renderToStaticMarkup` y/o validación de schema, corrido así (desde el scratchpad, importando por ruta absoluta; React global para JSX clásico):

```
node --import tsx <probe>.mts
```

Regla de oro de cada probe de render: el HTML producido **NO debe contener `opacity:0`** y debe contener los textos/estructura esperados. `npx tsc --noEmit` debe dar **0 errores** antes de cada commit.

## File Structure

**Diseño / fuentes**
- Modify `app/globals.css` — tokens luxury + keyframes + reveal + utilidades (`.lx-eyebrow`, `.lx-rule`, `.lx-frame`) scoped a `.landing-root`.
- Modify `app/p/[slug]/layout.tsx` — sumar sans editorial (Jost) vía next/font; mantener Cormorant.

**Schema / motor**
- Modify `lib/landing/schema.ts` — bloques nuevos: `stats_bar`, `story_blocks`, `curated_gallery`, `location_showcase`, `floor_plans`, `closing_invite`, `footer_brand`. Extender `hero` (offer inline). Mantener `cta`, invariante.
- Modify `lib/landing/registry.tsx` — render de los bloques nuevos.
- Create `lib/landing/tier.ts` — `LandingTier` + `deriveTier(property, usdToArs?)` + qué secciones/counts por tier.
- Create `lib/landing/photo-plan.ts` — reparto de `property.photos` (hero/story/gallery) + degradación.
- Create `lib/landing/templates/luxury.ts` — `buildLuxuryDocument(property, copy, tier)` + manifest.
- Modify `lib/landing/templates/index.ts` — registrar `luxury` como default.
- Modify `lib/landing/conversion-copy.ts` — extender `ConversionCopy` con `story[3]`, `locationBody`, `closingHeadline/Body`, `heroOfferLabel`.
- Modify `lib/landing/landing-service.ts` — usar `luxury` + copy IA en `startCoCreation` (ya usa `buildConversionDocument`; cambiar a `buildLuxuryDocument`).
- Modify `app/p/[slug]/page.tsx` — fallback → `luxury`.

**Componentes (`components/landing/luxury/`)**
- Create `HeroLuxury.tsx` (server) — hero lujo foto/video + offer + CTA.
- Create `StatsBar.tsx` (server).
- Create `StoryBlocks.tsx` (server).
- Create `CuratedGallery.tsx` (server) + `GalleryLightbox.tsx` (client).
- Create `LocationShowcase.tsx` (server).
- Create `FloorPlans.tsx` (server, usa GalleryLightbox).
- Create `ClosingInvite.tsx` (server).
- Create `FooterBrand.tsx` (server).
- Create `FloatingCta.tsx` (client).
- Modify `components/landing/LeadCaptureProvider.tsx` — re-estilo premium + honeypot + timing gate; expone `FloatingCta` friendly.

---

## FASE 1 — Columna vertebral

Diseño navy-luxury + Hero + stats + cierre + footer + popup re-estilado + floating CTA + template `luxury` esqueleto (con placeholders determinísticos para los bloques aún no construidos). Al final de la fase: deploy + WebFetch + OK visual del usuario.

### Task 1: Sistema de diseño navy-luxury (tokens + utilidades CSS)

**Files:**
- Modify: `app/globals.css` (agregar bloque al final, dentro del scope `.landing-root` existente de E1.7)
- Modify: `app/p/[slug]/layout.tsx`

**Interfaces:**
- Produces: variables CSS `--lx-*` y clases `.lx-eyebrow`, `.lx-rule`, `.lx-frame`, `.lx-reveal`, keyframes `lx-rise`; var de fuente `--font-landing-sans` (Jost).

- [ ] **Step 1: Sumar la sans editorial en el layout**

En `app/p/[slug]/layout.tsx`, agregar Jost junto a Cormorant:

```tsx
import { Cormorant_Garamond, Jost } from 'next/font/google'
const serifDisplay = Cormorant_Garamond({ subsets: ['latin'], weight: ['400','500','600','700'], variable: '--font-landing-serif', display: 'swap' })
const sansEditorial = Jost({ subsets: ['latin'], weight: ['300','400','500'], variable: '--font-landing-sans', display: 'swap' })
export default function LandingLayout({ children }: { children: ReactNode }) {
  return <div className={`${serifDisplay.variable} ${sansEditorial.variable} landing-root`}>{children}</div>
}
```

- [ ] **Step 2: Agregar tokens + utilidades luxury a globals.css**

Al final de `app/globals.css`, dentro de nuevas reglas scoped a `.landing-root`:

```css
/* ── E1.9 · Sistema navy-luxury de la landing ─────────────────────────── */
.landing-root {
  --lx-bg: #F7F4EE;            /* marfil cálido */
  --lx-bg-2: #EFE9E0;          /* crema */
  --lx-ink: #201C17;           /* tinta */
  --lx-ink-soft: #524A3D;
  --lx-navy: var(--brand);     /* acento de marca */
  --lx-line: rgba(32,28,23,.16);
  --lx-serif: var(--font-landing-serif), Georgia, serif;
  --lx-sans: var(--font-landing-sans), system-ui, sans-serif;
  background-color: var(--lx-bg);
  color: var(--lx-ink);
  font-family: var(--lx-sans);
  font-weight: 300;
}
.landing-root :is(h1,h2,h3){ font-family: var(--lx-serif); font-weight: 500; letter-spacing: -.005em; overflow-wrap: anywhere; }
.lx-eyebrow{ font-family: var(--lx-sans); font-weight: 400; font-size: 11px; letter-spacing: .28em; text-transform: uppercase; color: var(--lx-navy); }
.lx-rule{ width: 56px; height: 1px; background: var(--lx-navy); opacity: .6; }
.lx-frame{ position: relative; }
.lx-frame::after{ content:""; position:absolute; inset: 16px -16px -16px 16px; border: 1px solid var(--lx-line); pointer-events:none; }
@media (prefers-reduced-motion: no-preference){
  @supports (animation-timeline: view()){
    .landing-root .lx-reveal{ animation: lx-rise both; animation-timeline: view(); animation-range: entry 0% cover 20%; }
  }
}
@keyframes lx-rise{ from{ opacity:0; transform: translateY(24px);} to{ opacity:1; transform:none;} }
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit 2>&1 | grep -c "error TS"`
Expected: `0`

- [ ] **Step 4: Commit**

```bash
git add app/globals.css "app/p/[slug]/layout.tsx"
git commit -m "feat(landing): sistema de diseño navy-luxury + sans editorial (E1.9 F1)"
```

### Task 2: Schema — bloques luxury

**Files:**
- Modify: `lib/landing/schema.ts`

**Interfaces:**
- Produces: block types `stats_bar`, `story_blocks`, `curated_gallery`, `location_showcase`, `floor_plans`, `closing_invite`, `footer_brand`; campos nuevos en `hero` (`offerLabel?`). Todos con `id`+`type`.

- [ ] **Step 1: Definir los bloques nuevos (antes del `discriminatedUnion`)**

```ts
const StatsBarBlock = z.object({ id: z.string(), type: z.literal('stats_bar') })

const StoryItem = z.object({
  numeral: z.string().max(4),        // I, II, III
  eyebrow: z.string().max(60),
  headline: z.string().max(160),
  body: z.string().max(500),
  tie: z.enum(['propiedad','ubicacion','amenities','otro']),
  photoIndex: z.number().int().min(0).optional(),
})
const StoryBlocksBlock = z.object({ id: z.string(), type: z.literal('story_blocks'), items: z.array(StoryItem).min(1).max(3) })

const CuratedGalleryBlock = z.object({
  id: z.string(), type: z.literal('curated_gallery'),
  eyebrow: z.string().max(60).optional(), title: z.string().max(120).optional(),
  photoIndices: z.array(z.number().int().min(0)).optional(),   // si falta, todas menos hero/story
})

const LocationShowcaseBlock = z.object({
  id: z.string(), type: z.literal('location_showcase'),
  eyebrow: z.string().max(60).optional(), title: z.string().max(120).optional(),
  body: z.string().max(400).optional(),
  photoIndex: z.number().int().min(0).optional(),   // foto exterior; si falta → banda navy
})

const FloorPlansBlock = z.object({ id: z.string(), type: z.literal('floor_plans'), title: z.string().max(120).optional() })

const ClosingInviteBlock = z.object({
  id: z.string(), type: z.literal('closing_invite'),
  eyebrow: z.string().max(60).optional(), headline: z.string().max(200),
  body: z.string().max(400).optional(), ctaLabel: z.string().max(40).optional(),
})

const FooterBrandBlock = z.object({ id: z.string(), type: z.literal('footer_brand') })
```

- [ ] **Step 2: Extender `HeroBlock`** — agregar `offerLabel: z.string().max(40).optional()` (ej. "Precio de venta"). (El resto de campos hero ya existen de E1.8.)

- [ ] **Step 3: Sumar los bloques al `discriminatedUnion`** (después de los de E1.8):

```ts
  StatsBarBlock, StoryBlocksBlock, CuratedGalleryBlock, LocationShowcaseBlock,
  FloorPlansBlock, ClosingInviteBlock, FooterBrandBlock,
```

- [ ] **Step 4: Probe de schema** — validar un doc luxury representativo (crear `scratchpad/probe-luxury-schema.mts` que importe `lib/landing/schema.ts` por ruta absoluta y valide un doc con todos los bloques nuevos + un doc sin CTA que debe fallar).

Run: `node --import tsx scratchpad/probe-luxury-schema.mts`
Expected: "doc luxury valida: SÍ ✓" y "doc sin CTA rechazado: SÍ ✓"

- [ ] **Step 5: tsc + commit**

```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"   # 0
git add lib/landing/schema.ts && git commit -m "feat(landing): schema de bloques luxury (E1.9 F1)"
```

### Task 3: Tier + photo-plan (lógica de intensidad y curación)

**Files:**
- Create: `lib/landing/tier.ts`
- Create: `lib/landing/photo-plan.ts`

**Interfaces:**
- Produces: `type LandingTier = 'alto_valor'|'estandar'`; `deriveTier(property): LandingTier`; `tierConfig(tier): { storyCount: 2|3, gallery: 'feature'|'grid' }`. `planPhotos(photos): { hero:number, story:number[], gallery:number[], location:number|null }`.

- [ ] **Step 1: `tier.ts`**

```ts
import type { LandingProperty } from '@/lib/landing/registry'
export type LandingTier = 'alto_valor' | 'estandar'
const ALTO_VALOR_USD = 400_000  // mismo umbral que deriveFunnelType
export function deriveTier(property: LandingProperty): LandingTier {
  const price = property.asking_price ?? 0
  const usd = (property.currency ?? 'USD').toUpperCase() === 'USD' ? price : 0
  return usd >= ALTO_VALOR_USD ? 'alto_valor' : 'estandar'
}
export function tierConfig(tier: LandingTier) {
  return tier === 'alto_valor'
    ? { storyCount: 3 as const, gallery: 'feature' as const }
    : { storyCount: 3 as const, gallery: 'grid' as const }
}
```

- [ ] **Step 2: `photo-plan.ts`**

```ts
export interface PhotoPlan { hero: number; story: number[]; gallery: number[]; location: number | null }
export function planPhotos(photos: string[]): PhotoPlan {
  const n = photos.length
  if (n === 0) return { hero: 0, story: [], gallery: [], location: null }
  const hero = 0
  const story = [1, 2, 3].filter(i => i < n)
  const usedForLocation = n > 4 ? n - 1 : null   // última foto para ubicación si hay margen
  const gallery: number[] = []
  for (let i = 1; i < n; i++) if (!story.includes(i) && i !== usedForLocation) gallery.push(i)
  return { hero, story, gallery, location: usedForLocation }
}
```

- [ ] **Step 3: Probe** — `scratchpad/probe-photo-plan.mts`: assertions para n=0,1,3,8 (que nunca repite índices, hero=0, story ⊂ [1..3]).

Run: `node --import tsx scratchpad/probe-photo-plan.mts` → "todas OK ✓"

- [ ] **Step 4: tsc + commit**

```bash
git add lib/landing/tier.ts lib/landing/photo-plan.ts && git commit -m "feat(landing): tier + plan de fotos (E1.9 F1)"
```

### Task 4: HeroLuxury (server) — foto/video + offer + CTA

**Files:**
- Create: `components/landing/luxury/HeroLuxury.tsx`

**Interfaces:**
- Consumes: `CtaButton` (existente), tokens `.lx-*`.
- Produces: `export function HeroLuxury(props: HeroLuxuryProps)`.

```ts
interface HeroLuxuryProps {
  title: string; subtitle?: string; offerLabel?: string
  price: number; currency: string; operationType: string
  neighborhood: string; city: string
  specs: string[]                       // ej. ["3 amb","2 dorm","78 m²"]
  ctaLabel?: string
  heroImage?: string; videoUrl?: string | null; videoFileUrl?: string | null; mediaMode?: 'auto'|'photo'|'video'
}
```

- [ ] **Step 1: Implementar** — dos layouts (video protagonista / foto a sangre completa), estética luxury:
  - Wordmark de marca chico arriba (texto "DIEGO FERREYRA" con `.lx-eyebrow` en blanco).
  - Título serif grande, `lx-rule`, **bloque de oferta** (`offerLabel` + precio serif + specs inline con separadores), CTA (`CtaButton variant="light" source="hero"`).
  - Motion: clases `hero-rise` (ya existen de E1.7/E1.8) con `animationDelay` escalonado; **sin `opacity:0` inicial en el HTML** (usar el patrón CSS de E1.8). Scrim reforzado (from-black/20 via/40 to/80 + scrim inferior) para contraste. `min-h-[92vh]`, `break-words` en título.
  - Video: reusar `toEmbedUrl` (copiar de `Hero.tsx` de E1.8) para YouTube/Vimeo; `<video>` para file. `price>0 ? formatPrice : 'Precio a consultar'`.

- [ ] **Step 2: Probe render** — `scratchpad/probe-hero-luxury.mts`: render foto + render video (con `videoUrl` con params) → assert título/precio/CTA/`#`popup presentes, iframe youtube en modo video, **sin `opacity:0`**.

Run: `node --import tsx scratchpad/probe-hero-luxury.mts` → "N/N ✓"

- [ ] **Step 3: tsc + commit**

```bash
git add components/landing/luxury/HeroLuxury.tsx && git commit -m "feat(landing): HeroLuxury foto/video + offer (E1.9 F1)"
```

### Task 5: StatsBar + ClosingInvite + FooterBrand (server)

**Files:**
- Create: `components/landing/luxury/StatsBar.tsx`
- Create: `components/landing/luxury/ClosingInvite.tsx`
- Create: `components/landing/luxury/FooterBrand.tsx`

**Interfaces:**
- `StatsBar(props: { rooms; bedrooms; bathrooms; garages; coveredArea; totalArea?; floor?; age?; expensas? })` — grilla horizontal (borde entre items), toma hasta 7 datos presentes, serif en el número + `.lx-eyebrow` en el label.
- `ClosingInvite(props: { eyebrow?; headline; body?; ctaLabel; source })` — banda centrada, `lx-eyebrow` + headline serif + body + `CtaButton`.
- `FooterBrand(props: {})` — marca "Diego Ferreyra Inmobiliaria" (serif) + contacto general + "Matriculado CUCICBA 8266" + legal `© {año fijo — pasar por prop para no usar Date.now en server render del año? usar new Date().getFullYear() está OK en runtime server}`.

- [ ] **Step 1:** Implementar los 3 componentes (server, tokens luxury, responsive con `grid`/`flex-wrap`).
- [ ] **Step 2: Probe** — render de los 3, assert textos clave (CUCICBA, headline, un stat) + sin `opacity:0`.
- [ ] **Step 3: tsc + commit** — `git commit -m "feat(landing): StatsBar + ClosingInvite + FooterBrand (E1.9 F1)"`

### Task 6: FloatingCta (client) + re-estilo del popup

**Files:**
- Create: `components/landing/luxury/FloatingCta.tsx`
- Modify: `components/landing/LeadCaptureProvider.tsx`

**Interfaces:**
- `FloatingCta(props: { label?: string })` — client; usa `useLeadCapture().open('floating')`; aparece con IntersectionObserver al pasar el hero (o simplemente tras scroll > 1 viewport con un listener pasivo). Fixed bottom-right, estilo luxury navy.
- `LeadCaptureProvider`: (a) re-estilo premium (marfil, serif en el título, botón navy); (b) honeypot (input oculto `_company` — si viene lleno, no enviar); (c) timing gate (no enviar si `Date.now()-mountTs < 1500ms`; usar un ref seteado en el primer render del cliente vía useEffect, **no** `Date.now()` en render).

- [ ] **Step 1:** FloatingCta con IntersectionObserver sobre un sentinel del hero (o `window.scrollY` con listener pasivo + `useReducedMotion`-agnóstico). Oculto por default; `inert`/`aria-hidden` cuando no visible.
- [ ] **Step 2:** Honeypot + timing gate en el submit del provider (agregar al form + al `submit`). Re-estilo.
- [ ] **Step 3: Probe** — render `LeadCaptureProvider` cerrado (children visibles, sin modal, sin `opacity:0`) + `FloatingCta` (no rompe SSR).
- [ ] **Step 4: tsc + commit** — `git commit -m "feat(landing): FloatingCta + popup premium + anti-spam (E1.9 F1)"`

### Task 7: Registry + template luxury (esqueleto) + page fallback

**Files:**
- Modify: `lib/landing/registry.tsx`
- Modify: `lib/landing/conversion-copy.ts`
- Create: `lib/landing/templates/luxury.ts`
- Modify: `lib/landing/templates/index.ts`
- Modify: `app/p/[slug]/page.tsx`

**Interfaces:**
- `ConversionCopy` extendido: `story: {numeral;eyebrow;headline;body;tie}[]` (3), `locationTitle/locationBody`, `closingHeadline/closingBody`, `heroOfferLabel`. `deterministicConversionCopy` completa los nuevos campos.
- `buildLuxuryDocument(property, copy, tier): LandingDocument`.
- `registry`: entradas para los 7 bloques nuevos (los aún-no-construidos de F2/F3 pueden mapear a un render mínimo temporal que se completa en su fase — o construir F2/F3 antes de activarlos; ver nota).

**NOTA de orden:** para no romper prod, el template `luxury` sólo referencia bloques YA construidos. En F1 arma: `hero`(luxury) → `stats_bar` → `closing_invite` → `footer_brand` (+ `cta` mid usando `CtaBand` existente + floating vía provider). Los bloques narrativos/visuales se **insertan en F2/F3** editando `buildLuxuryDocument`.

- [ ] **Step 1: Extender copy** — agregar campos a `ConversionCopy` + `deterministicConversionCopy` (story×3 benefit-framed, location, closing, heroOfferLabel). Extender el prompt IA + `coerceCopy`.
- [ ] **Step 2: Registry** — agregar render de `stats_bar`, `closing_invite`, `footer_brand` (los de F1). Para `story_blocks/curated_gallery/location_showcase/floor_plans`: agregar entradas que devuelvan `null` temporalmente (placeholder) **o** dejarlas para F2 y NO incluirlas en el doc de F1 (preferido: no incluir → registry sin esas entradas todavía haría fallar el tipo `Record<LandingBlockType,BlockDef>`; por eso: agregar las 7 entradas ya, las de F2/F3 devuelven `null` hasta su fase). Hero luxury: apuntar el render `hero` a `HeroLuxury` (mapear specs con un helper `buildSpecs(property)`).
- [ ] **Step 3: `luxury.ts`** — `buildLuxuryDocument`: hero + stats_bar + cta(mid) + closing_invite + footer_brand (F1). Manifest `{ id:'luxury', label:'Lujo', build }`. `build(property)` usa `deterministicConversionCopy`.
- [ ] **Step 4: `index.ts`** — registrar `luxuryTemplate`, `DEFAULT_TEMPLATE_ID='luxury'`, `suggestTemplateId → 'luxury'`.
- [ ] **Step 5: `page.tsx`** — fallback `published?.document ?? luxuryTemplate.build(property)`.
- [ ] **Step 6: Probe E2E** — render de `LandingRenderer` NO es posible bajo tsx (usa `@/`); en su lugar: validar `buildLuxuryDocument(fakeProperty, deterministicConversionCopy(fakeProperty), 'estandar')` contra el schema + render individual de HeroLuxury/StatsBar/ClosingInvite/FooterBrand (ya cubiertos). Assert doc válido.
- [ ] **Step 7: tsc + commit + DEPLOY** — `git commit -m "feat(landing): template luxury esqueleto + registry + fallback (E1.9 F1)"`, `git push origin main`.

### Task 8: Review adversarial F1 + verificación en producción

- [ ] **Step 1:** Workflow de review adversarial sobre los archivos de F1 (dimensiones: rsc-ssr, motion-a11y, responsive-overflow, lcp-seo, data-edge, consistency). Arreglar hallazgos confirmados. Re-deploy.
- [ ] **Step 2:** Poll `/api/version` = commit F1; WebFetch `https://inmodf.com.ar/p/prueba-20260522-2224`; assert `landing-root`, hero, stats, cierre, footer, CUCICBA, `#`popup, **`opacity:0` = 0**.
- [ ] **Step 3:** Pedir OK visual al usuario (link). Es un checkpoint humano — NO avanzar a F2 sin su visto bueno.

---

## FASE 2 — Narrativa + visuales

story_blocks (IA, numerados, marco desplazado) + curated_gallery + lightbox + location_showcase. Se **insertan en `buildLuxuryDocument`** y se activa su render en el registry.

### Task 9: StoryBlocks (server)

**Files:** Create `components/landing/luxury/StoryBlocks.tsx`

- `StoryBlocks(props: { items: {numeral;eyebrow;headline;body;photo?:string}[] })` — bloques alternados (grid 2 col, `:nth-child(even)` invierte orden), figura con `.lx-frame`, numeral serif, `.lx-eyebrow`, headline serif, body. Responsive → 1 col en mobile.
- [ ] Implementar → probe render (assert numerales I/II/III, headline, sin `opacity:0`) → tsc → commit.

### Task 10: CuratedGallery + GalleryLightbox

**Files:** Create `components/landing/luxury/CuratedGallery.tsx` (server) + `components/landing/luxury/GalleryLightbox.tsx` (client)

- `GalleryLightbox(props: { images: {src;alt?}[] })` — client: grilla (1 destacada `span 2×2` + resto), "Ver galería completa" revela ocultas (`useState`), lightbox (teclado ←/→/Esc, touch swipe, focus-trap con `inert` de fondo, restaurar foco). Contenido **visible por default** (la grilla es estática; el lightbox se monta al abrir).
- `CuratedGallery` (server) resuelve `photoIndices` → urls y renderiza `<GalleryLightbox>`.
- [ ] Implementar → probe (render grilla server: assert N imgs + sin `opacity:0`; el lightbox client se prueba por render cerrado) → tsc → commit.

### Task 11: LocationShowcase (server)

**Files:** Create `components/landing/luxury/LocationShowcase.tsx`

- `LocationShowcase(props: { neighborhood; city; title?; body?; image?: string })` — si `image`: full-bleed + card marfil con eyebrow/title serif/body; si no: **banda navy** elegante con el texto centrado. SIN mapa/botón.
- [ ] Implementar → probe (con y sin imagen) → tsc → commit.

### Task 12: Insertar F2 en template + registry + copy IA + review + deploy

**Files:** Modify `registry.tsx`, `templates/luxury.ts`, `conversion-copy.ts`

- [ ] Registry: activar render real de `story_blocks`, `curated_gallery`, `location_showcase` (mapear datos: story usa `planPhotos().story`; gallery usa `planPhotos().gallery`; location usa `planPhotos().location`).
- [ ] `buildLuxuryDocument`: insertar en el orden: hero → stats_bar → story_blocks → curated_gallery → cta(mid) → location_showcase → closing_invite → footer_brand.
- [ ] Copy IA: asegurar que `story` (3), `locationBody`, `closingBody` salgan del generador (ya extendido en Task 7).
- [ ] Probe: `buildLuxuryDocument` con fakeProperty (3 fotos / 1 foto / 0 fotos) valida contra schema y no incluye bloques sin datos.
- [ ] Review adversarial F2 → arreglar → deploy → WebFetch (assert story numerales, galería, ubicación) → **OK visual del usuario**.

---

## FASE 3 — Condicionales + intensidad

### Task 13: FloorPlans (server, condicional)

**Files:** Create `components/landing/luxury/FloorPlans.tsx`

- `FloorPlans(props: { plans: {src;label}[] })` — grilla con `.lx-frame`, zoom vía `GalleryLightbox`. Usa `planLabelFromUrl` (`lib/properties/media.ts`) para las etiquetas.
- Registry: render `floor_plans` solo si `property.plans?.length`. `buildLuxuryDocument`: incluir el bloque **solo si hay planos**.
- [ ] Implementar → probe (con planos / sin planos → omitido) → tsc → commit.

### Task 14: Intensidad por tier + curación fina de fotos

**Files:** Modify `lib/landing/templates/luxury.ts`

- [ ] `buildLuxuryDocument(property, copy, tier)`: aplicar `tierConfig(tier)`:
  - `alto_valor`: story×3, `curated_gallery` variante `feature`, location con imagen grande, floor_plans si hay.
  - `estandar`: story×3 (o 2 si <3 fotos útiles), gallery `grid`, location; ítems más compactos.
- [ ] `deriveTier(property)` en el fallback (`page.tsx`) y en `landing-service` (asistente).
- [ ] Degradación por fotos: si `planPhotos().story.length < 2` → story se acorta; si `gallery.length === 0` → se omite `curated_gallery`; si 0 fotos → hero sin imagen (banda navy) + sin gallery/story-photos.
- [ ] Probe: `buildLuxuryDocument` para (alto_valor, 10 fotos) y (estandar, 1 foto) → ambos validan y respetan las reglas (assert nº de bloques/story items).
- [ ] tsc + commit.

### Task 15: Wire del asistente (landing-service) a luxury + review + deploy

**Files:** Modify `lib/landing/landing-service.ts`

- [ ] `startCoCreation`: `buildConversionDocument` → `buildLuxuryDocument(property, copy, deriveTier(property))` con copy IA (`generateConversionCopy`). `templateId='luxury'`.
- [ ] Review adversarial F3 (foco: condicionales/data-edge/tier) → arreglar → deploy → WebFetch (propiedad con planos / sin planos; alto valor / estándar) → **OK visual del usuario**.

---

## FASE 4 — Pulido + cierre

### Task 16: Pulido visual + performance + accesibilidad final

- [ ] Pasada de detalles: `fetchpriority` en hero, `loading="lazy"` en galería/story/planos, `aspect-ratio` para evitar CLS, contraste de todos los textos sobre foto, `clamp()` consistente, mobile <375px sin overflow horizontal.
- [ ] Review adversarial final (todas las dimensiones, todo el set de archivos E1.9).
- [ ] Actualizar `CLAUDE.md` (sección "Landing pública premium") + memoria (`landing_conversion_structure` → apuntar a E1.9 luxury).
- [ ] Deploy + WebFetch + **OK visual del usuario** en 2-3 propiedades reales distintas (alto valor / estándar / con planos / con video).

### Task 17 (opcional): Realce de portada con OpenAI

- [ ] Detrás de flag: mejorar la foto de portada/hero con el pipeline `gpt-image-2` (E2.5) para propiedades con fotos flojas. Cache en Storage (reusar `ad-enhanced`-style). No bloqueante; sólo si el usuario lo pide.

---

## Self-Review (cobertura del spec)

- Estética navy + marca → Task 1 (tokens). ✓
- Sin asesor → FooterBrand + ClosingInvite (Task 5). ✓
- Camino C (template curado) → Task 7/12/14 (`buildLuxuryDocument`). ✓
- Hero video/foto + offer → Task 4. ✓
- Barra de datos → Task 5. ✓
- 3 bloques de historia IA → Task 9 + copy Task 7. ✓
- Galería + lightbox → Task 10. ✓
- Ubicación sin mapa → Task 11. ✓
- Planos condicionales → Task 13. ✓
- Cierre + footer marca → Task 5. ✓
- 3 CTAs + floating + popup único → Task 6 + `cta` en template. ✓
- Intensidad por tier → Task 14. ✓
- Copy IA + fallback → Task 7. ✓
- Curación de fotos + degradación → Task 3 + Task 14. ✓
- Robustez (sin opacity:0, reduced-motion, RSC) → Global Constraints + probes por tarea. ✓
- Backwards-compat → invariante schema + fallback (Task 7). ✓
- Verificación (tsc + render probe + schema + adversarial + WebFetch + OK usuario) → cada tarea + Tasks 8/12/15/16. ✓

Sin placeholders pendientes; nombres de tipos/funciones consistentes entre tareas (`buildLuxuryDocument`, `deriveTier`, `tierConfig`, `planPhotos`, `ConversionCopy`, `HeroLuxury`, `GalleryLightbox`).
