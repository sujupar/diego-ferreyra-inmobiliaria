He confirmado lo clave: los componentes actuales son **prop-driven** (cada uno recibe columnas de `property` directas), no schema-driven. Ese es el eje de la migración. Tengo lo necesario. Acá está el documento de diseño.

---

# Editor Drag-and-Drop de Landing Pages — Documento de Diseño

**Proyecto:** Diego Ferreyra Inmobiliaria · Next.js 16.0.10 / React 19.2 / TS5 / Tailwind4 / shadcn-new-york
**Autor:** Arquitectura frontend · **Alcance:** Fase 1 (editor de landing) con ganchos explícitos hacia Fase 2 (campaña)
**Estado del código hoy:** landing 100% prop-driven (`app/p/[slug]/page.tsx` lee columnas y las pasa a `components/landing/*`). **No existe schema, ni tabla de landing, ni UI de edición.** Este documento cierra ese gap.

---

## 0. Principio rector (leer antes que nada)

El usuario NO pide un builder libre pixel-perfect tipo Webflow. Pide: **añadir/quitar secciones premium, editar texto, cambiar/agregar video e imágenes, reordenar, y ver el mismo contenido en varios templates** — con **un enlace final estable** y **calidad de diseño gráfico altísima**. Eso es un **editor por SECCIONES (bloques predefinidos) con reordenamiento drag-and-drop + edición inline de props**, NO un canvas de posicionamiento absoluto.

Esta distinción es la decisión de arquitectura más importante y determina todo lo demás: un editor de bloques con **schema JSON serializable + block registry** nos da (a) control absoluto sobre la calidad visual de cada bloque (los diseñamos nosotros, no los dibuja el usuario), (b) el mismo JSON renderiza en editor y en público, (c) los "templates" son simplemente **presets del array de bloques**, (d) el enlace nunca cambia porque el slug vive en `properties`, desacoplado del diseño.

---

## 1. Build vs Buy — la decisión

### 1.1 Comparativa honesta

| Criterio | (a) **@measured/Puck** | (b) **Custom @dnd-kit por secciones** | (c) **Craft.js** | (d) **GrapesJS** |
|---|---|---|---|---|
| Modelo mental | Editor de bloques con config JSON serializable (nativo React) | Lista de bloques premium reordenables + panel de props | Framework de nodos anidados arbitrarios (canvas React) | Editor HTML/CSS iframe, salida = HTML string |
| Fit "mismo JSON en editor + público" | **Alto** — `<Render>` usa el mismo config | **Total** — nosotros controlamos ambos renders | Medio — el árbol de nodos no es trivialmente renderizable read-only fuera de Craft | **Bajo** — salida es HTML, no JSON de componentes React |
| Fit "bloques premium con motion propio" | Alto (cada bloque es un componente React nuestro) | **Total** | Alto | **Bajo** — GSAP/Framer dentro de iframe es doloroso |
| Serializable a Postgres JSONB | Sí, limpio | **Sí, lo diseñamos nosotros** | Sí (pesado, incluye layout state) | HTML+CSS string (frágil, difícil de migrar) |
| Riesgo React 19 / Next 16 | **Medio** — Puck v0.19 declara soporte React 19; ecosistema aún estabilizándose sobre RSC | **Nulo** — usamos solo @dnd-kit (ya instalado y probado en el proyecto: galería multimedia, StepImages) + framer-motion 12 | **Alto** — Craft.js arrastra `react-dnd`, históricamente lento en adoptar majors de React; riesgo con React 19 concurrent | **Medio/Alto** — no-React, se integra por wrapper, choca con hydration de RSC |
| Esfuerzo inicial | **Bajo-Medio** (2-3 sem): mapear cada `components/landing/*` a un "Puck component" con su `fields` | **Medio-Alto** (4-6 sem): construimos el shell del editor, DnD, panel de props, undo/redo | Alto (5-7 sem): curva de Craft + resolver read-only render | Muy alto (6-8 sem) + reescribir bloques como HTML |
| Techo de calidad visual | Alto (limitado por el modelo de fields de Puck para controles muy custom) | **Ilimitado** (es nuestro código) | Alto | Medio (CSS plano, sin nuestro design system Tailwind/shadcn nativo) |
| Mantenibilidad a 12 meses | Dependemos del roadmap de Puck y su compat con Next futuro | **Dependemos solo de @dnd-kit** (maduro, estable, ya en el stack) | Dependemos de Craft + react-dnd (mayor superficie de riesgo) | Dependemos de GrapesJS (mundo no-React) |
| Lock-in / salida | Bajo (config es JSON portable) | **Nulo** | Medio | Alto (HTML string) |
| Lo que NOS DA gratis | DnD, undo/redo, panel de fields, drag desde paleta, viewport toggle | Nada — lo construimos | DnD anidado, undo/redo | Editor visual completo de CSS |

### 1.2 Recomendación: **Híbrido con sesgo a Puck — "Puck como shell, nuestros bloques premium como contenido"**

**Recomiendo (a) @measured/Puck como shell del editor, envolviendo bloques que son nuestros componentes premium** — NO Craft.js, NO GrapesJS, y NO custom-desde-cero salvo que Puck falle el spike.

Razonamiento:

1. **Puck nos regala exactamente la mecánica que si no tendríamos que construir a mano en la opción (b):** drag desde una paleta de bloques, reordenamiento, panel lateral de edición de props (`fields`), undo/redo, y viewport toggle desktop/mobile. Todo eso son ~3-4 semanas de trabajo cuidadoso en la opción (b), y son terreno de bugs sutiles (drag ghosts, focus management, historial). Puck ya lo tiene resuelto y su modelo es **config JSON serializable idéntico a lo que necesitamos guardar en Postgres**.

2. **El techo de calidad NO lo pone Puck sino nuestros bloques.** En Puck, cada "component" es un componente React 100% nuestro con `render()` libre — ahí metemos Framer Motion, GSAP/ScrollTrigger, image-sequence canvas, lo que sea. Puck solo aporta la carcasa de edición. La calidad gráfica altísima que pide el usuario vive en el `render()`, que es código nuestro sin límite.

3. **El riesgo real es la compatibilidad Puck × Next 16 / React 19 RSC.** Es un riesgo acotado y verificable con un spike de 2 días (ver §1.3). Si el spike falla, el fallback es la opción (b) **reutilizando el mismo schema y el mismo block registry** que definimos abajo — o sea, el diseño de datos NO cambia según ganemos o perdamos con Puck. Esa es la clave: **decouplear la decisión de librería del diseño del schema.**

4. **Craft.js y GrapesJS quedan descartados:** Craft por riesgo React-19/react-dnd + su modelo de árbol arbitrario es más potencia de la que necesitamos (no queremos anidamiento libre, queremos secciones planas reordenables). GrapesJS por ser no-React: rompe el modelo RSC, no puede usar nuestros componentes shadcn/Framer, y su salida HTML-string es un pasivo de migración enorme.

**Regla de oro del diseño:** el **schema de bloques (§2) y el block registry (§3) son nuestros y agnósticos de la librería**. Puck consume ese registry; si mañana lo reemplazamos, el registry y el JSON guardado sobreviven intactos. Nunca guardamos el formato interno de Puck crudo en la DB sin una capa de adaptación fina.

### 1.3 Spike obligatorio antes de comprometer (2 días)

Antes de escribir una línea de producción:

1. `npm i @measured/puck` en una rama throwaway. Confirmar que instala sin peer-dep warnings duros contra React 19.2.
2. Montar un `<Puck>` en una ruta `app/(dashboard)/.../editor/page.tsx` marcada `'use client'` con **2 bloques reales** (Hero + LeadForm migrados). Verificar: drag, edición de un campo de texto, y que el `onPublish` devuelve JSON limpio.
3. Renderizar ese mismo JSON con `<Render>` de Puck dentro de un Server Component wrapper (o client boundary) y confirmar que hidrata sin el crash de reconciler. **Verificación real solo en navegador** (igual que el gotcha de @react-pdf documentado en CLAUDE.md — tsc/build no detectan crashes de reconciler en runtime).
4. Confirmar que Framer Motion 12 dentro de un bloque Puck anima OK en el `<Render>` público.

**Gate:** si (2) o (3) fallan de forma no-resoluble en 2 días → caer a opción (b) custom con @dnd-kit, mismo schema. Documentar el resultado del spike en CLAUDE.md (regla `documenting-errors`).

---

## 2. Arquitectura de datos — el schema de landing

### 2.1 Tabla nueva (Fase 1) — migración a correr en el Dashboard

`properties` NO se toca para el diseño (evita el patrón peligroso de columnas `landing_*` sueltas). La landing es una entidad propia 1:1 con la propiedad.

```sql
-- 20260724000001_property_landing.sql  (correr en Supabase Dashboard SQL Editor)
create table if not exists property_landing (
  property_id     uuid primary key references properties(id) on delete cascade,
  schema_version  int  not null default 1,
  config          jsonb not null,          -- LandingConfig (§2.2), la VERDAD del diseño
  template_id     text not null default 'signature',   -- preset de origen (solo trazabilidad)
  status          text not null default 'draft'
                    check (status in ('draft','published')),
  -- Base UTM (Fase 2). Se crea al crear la landing, conecta con Meta.
  utm_base        jsonb not null default '{}'::jsonb,   -- {source,medium,campaign_template,...}
  avatar          jsonb,                    -- BuyerAvatar + mapa de empatía (§2.4)
  published_at    timestamptz,
  updated_at      timestamptz not null default now(),
  updated_by      uuid references profiles(id) on delete set null
);
alter table property_landing enable row level security;
-- RLS por rol (patrón 20260505000001): admin/dueno/coordinador/asesor RW; abogado sin acceso.
```

Notas de decisión:
- **El slug NO se mueve acá.** Sigue en `properties.public_slug` (ver §2.6). Eso garantiza el requisito duro: **el enlace final es siempre el mismo aunque cambie el diseño o el template**. La landing puede reescribir su `config` 100 veces; `public_slug` no se toca.
- `config` es un único JSONB (no desnormalizado como `meta_launch_jobs`). Aquí sí conviene un blob porque es un documento de diseño que se lee/escribe entero, no campos consultados individualmente. Contraste consciente con `meta_launch_jobs` que es máquina de estados.
- `schema_version` habilita migraciones de schema versionadas (§3.4) — imprescindible para no romper landings publicadas.
- `status='draft'` vs `'published'`: **cuidado con el antipatrón documentado en CLAUDE.md** (worker pg_cron levanta filas `'pending'`). Acá el enum es `draft/published`, ningún worker lo toca — pero mantengo la disciplina: los estados de trabajo no se mezclan con estados de diseño.

### 2.2 El schema TypeScript — `LandingConfig`

Fuente única de verdad, validada con **Zod** (ya en el stack, v4). Vive en `lib/landing/schema.ts`.

```ts
// lib/landing/schema.ts
import { z } from 'zod'

// ---- Tokens de tema (el "diseño gráfico de alto nivel" es configurable pero acotado) ----
export const ThemeSchema = z.object({
  palette: z.enum(['obsidian','ivory','sand','emerald']).default('obsidian'),
  fontPair: z.enum(['editorial','grotesk','serif-lux']).default('editorial'),
  motion: z.enum(['full','subtle','off']).default('full'),   // respeta prefers-reduced-motion en runtime
  radius: z.enum(['none','soft','round']).default('soft'),
})

// ---- Cada tipo de bloque = un discriminated union por `type` ----
const BlockBase = z.object({
  id: z.string(),               // nanoid estable — clave de dnd-kit y de React
  locked: z.boolean().default(false),   // el usuario no puede borrarlo (form, CTA)
})

export const HeroBlock = BlockBase.extend({
  type: z.literal('hero'),
  props: z.object({
    variant: z.enum(['cinematic-photo','video-bg','split']).default('cinematic-photo'),
    eyebrow: z.string().max(40),                // "En venta"
    headline: z.string().max(90),              // message-match con el ad
    subheadline: z.string().max(160).optional(),
    mediaSource: z.enum(['photo','video_file','video_url']).default('photo'),
    mediaRef: z.string().optional(),           // índice de photo o url — resuelto en render
    overlay: z.number().min(0).max(1).default(0.55),
    ctaLabel: z.string().max(30).default('Quiero conocerla'),  // orientado a resultado
    ctaTarget: z.literal('#lead-form').default('#lead-form'),
  }),
})

export const GalleryBlock = BlockBase.extend({
  type: z.literal('gallery'),
  props: z.object({
    layout: z.enum(['masonry','carousel','grid-3','fullbleed-scroll']).default('masonry'),
    photoIndices: z.array(z.number()).default([]),  // referencia a properties.photos por índice
    caption: z.string().optional(),
  }),
})

export const VideoBlock = BlockBase.extend({
  type: z.literal('video'),
  props: z.object({
    source: z.enum(['video_file','video_url','tour_3d']),  // soporta CON y SIN video
    ref: z.string(),                            // url embed, o storage url del archivo, o tour url
    autoplayMuted: z.boolean().default(true),
    posterIndex: z.number().optional(),
  }),
})

export const FeaturesBlock = BlockBase.extend({
  type: z.literal('features'),
  props: z.object({
    style: z.enum(['icon-grid','stat-band','editorial-list']).default('stat-band'),
    // los datos (m², ambientes) se resuelven de `property` en render; acá solo se elige QUÉ mostrar
    show: z.array(z.enum(['rooms','bedrooms','bathrooms','garages','coveredArea',
                          'totalArea','floor','age','expensas','amenities'])),
    headline: z.string().optional(),
  }),
})

export const AvatarCopyBlock = BlockBase.extend({   // NUEVO — copy dirigido por el avatar/mapa de empatía
  type: z.literal('avatar_copy'),
  props: z.object({
    angle: z.enum(['pain','gain','lifestyle']).default('gain'),
    heading: z.string().max(80),
    body: z.string().max(400),
    generatedFromAvatar: z.boolean().default(true),  // trazabilidad IA vs edición manual
  }),
})

export const SocialProofBlock = BlockBase.extend({
  type: z.literal('social_proof'),
  props: z.object({
    style: z.enum(['badge-strip','testimonial-card','matricula']).default('matricula'),
    matricula: z.string().optional(),          // CUCICBA / CMCPSI, above-the-fold
    testimonials: z.array(z.object({ quote: z.string(), author: z.string() })).default([]),
  }),
})

export const LocationBlock = BlockBase.extend({
  type: z.literal('location'),
  props: z.object({
    lat: z.number().optional(), lng: z.number().optional(),
    style: z.enum(['map-pin','neighborhood-highlight']).default('map-pin'),
    hideExactAddress: z.boolean().default(false),   // privacidad de captación
  }),
})

export const CtaBlock = BlockBase.extend({
  type: z.literal('cta'),
  props: z.object({
    headline: z.string().max(90),
    kicker: z.string().optional(),
    buttonLabel: z.string().max(30),
    scrollTo: z.literal('#lead-form').default('#lead-form'),
  }),
})

export const LeadFormBlock = BlockBase.extend({   // SIEMPRE locked:true — es el objetivo de conversión
  type: z.literal('lead_form'),
  props: z.object({
    mode: z.enum(['single','multi-step']).default('multi-step'),   // multi-step rinde +20-40%
    offer: z.enum(['register','request_video_tour','book_visit']).default('request_video_tour'),
    fields: z.array(z.enum(['name','phone','email'])).min(2).default(['name','phone']),
    submitLabel: z.string().max(30).default('Quiero el recorrido en video'),
    consentText: z.string().optional(),
  }),
})

export const AnyBlock = z.discriminatedUnion('type', [
  HeroBlock, GalleryBlock, VideoBlock, FeaturesBlock, AvatarCopyBlock,
  SocialProofBlock, LocationBlock, CtaBlock, LeadFormBlock,
])
export type AnyBlock = z.infer<typeof AnyBlock>

export const LandingConfig = z.object({
  version: z.literal(1),
  theme: ThemeSchema,
  blocks: z.array(AnyBlock),
}).superRefine((cfg, ctx) => {
  // ---- VALIDACIÓN DURA: la landing es un instrumento de conversión, no un lienzo libre ----
  const types = cfg.blocks.map(b => b.type)
  if (!types.includes('lead_form'))
    ctx.addIssue({ code: 'custom', message: 'La landing DEBE tener un formulario (objetivo de conversión).' })
  if (!types.includes('hero'))
    ctx.addIssue({ code: 'custom', message: 'La landing DEBE empezar con un Hero.' })
  const ctaish = cfg.blocks.filter(b => b.type === 'cta' || b.type === 'lead_form')
  if (ctaish.length === 0)
    ctx.addIssue({ code: 'custom', message: 'Debe haber al menos un CTA hacia el formulario.' })
  // Regla de "UNA sola oferta": no permitir 2 lead_form con offers distintas
  const offers = new Set(cfg.blocks.filter(b => b.type==='lead_form').map(b => (b as any).props.offer))
  if (offers.size > 1)
    ctx.addIssue({ code: 'custom', message: 'Una sola oferta por landing.' })
})
export type LandingConfig = z.infer<typeof LandingConfig>
```

Decisiones clave del schema:
- **Los datos duros NO se copian al config.** `FeaturesBlock` guarda *qué* mostrar (`show: ['coveredArea',...]`), no el valor `95 m²`. `GalleryBlock` guarda `photoIndices`, no URLs. El valor real se resuelve de `property` en render (§3.2). Esto evita que la landing quede *stale* si cambian las fotos o los metros, y evita el gotcha de inyección de URLs arbitrarias (mismo espíritu que la validación de permutación de fotos documentada en CLAUDE.md).
- **`locked`** hace cumplir las reglas de conversión a nivel UI (no se puede borrar el form ni el CTA), y `superRefine` las hace cumplir a nivel datos (defensa en profundidad, igual que RLS + validación de servidor).
- **Discriminated union por `type`** = el block registry es un simple `Record<type, componente>` y TS estrecha props por bloque sin `any`.

### 2.3 Templates de alta conversión = presets del array `blocks`

Un "template" no es código nuevo: es una función que devuelve un `LandingConfig` inicial. Viven en `lib/landing/templates/`.

```ts
// lib/landing/templates/index.ts
export type TemplateId = 'signature' | 'cinematic' | 'editorial' | 'story'
export interface LandingTemplate {
  id: TemplateId
  label: string
  supportsVideo: boolean          // 'cinematic' exige video; degradación si la prop no tiene
  build(ctx: PropertyContext): LandingConfig   // ctx = property + avatar + descripción portal
}
```

- **`signature`** (default, siempre válido con o sin video): Hero foto cinematográfica → Features stat-band → AvatarCopy(gain) → Gallery masonry → SocialProof matrícula → CTA → LeadForm multi-step.
- **`cinematic`** (requiere video): Hero video-bg fullscreen → scroll-triggered features → Video tour → AvatarCopy(lifestyle) → CTA → Form.
- **`editorial`** (revista de lujo): tipografía serif, layouts asimétricos, Gallery fullbleed-scroll.
- **`story`** (multi-step storytelling, mobile-first): secuencia de AvatarCopy alternados con foto.

**Requisito "mismo enlace aunque cambie el template":** cambiar de template = `setConfig(template.build(ctx))` sobre el mismo `property_landing.property_id`. El slug no se toca jamás. El preview de templates (§4.5) renderiza cada `build(ctx)` con `<Render>` en un iframe/portal, el asesor elige, y ese config se convierte en el punto de partida editable.

**CON/SIN video:** cada template declara `supportsVideo`. La galería de selección de templates filtra o degrada: si la propiedad no tiene `video_url`/`video_file_url`/`tour_3d_url`, `cinematic` se oculta o su Hero cae a `variant:'cinematic-photo'`. El `VideoBlock` no se instancia si no hay fuente — degradación limpia, nunca un embed roto.

### 2.4 Avatar + Mapa de empatía (co-creación IA)

Extiende el `BuyerAvatar` actual (que es básico) con el mapa de empatía que pide el usuario. Se guarda en `property_landing.avatar` y **se reutiliza en Fase 2** (selección de avatar de campaña).

```ts
export interface EmpathyMap {
  says: string[]; thinks: string[]; feels: string[]; does: string[]
  pains: string[]; gains: string[]
}
export interface LandingAvatar extends BuyerAvatar {   // reutiliza el tipo existente
  empathyMap: EmpathyMap
  coCreation: { questionsAsked: string[]; advisorAnswers: string[] }  // traza de la co-creación
}
```

Flujo de co-creación (no la IA sola): la IA lee `property` + descripción de portal (bridge existente `getOrGenerateBridgedDescription`) → propone avatar + 3 preguntas al asesor → el asesor responde → la IA refina el `empathyMap`. El `AvatarCopyBlock` del schema consume `pains`/`gains` para su copy, con `generatedFromAvatar:true` para distinguir texto IA de edición manual.

### 2.5 Base UTM al crear la landing (puente a Fase 2)

`property_landing.utm_base` se materializa al crear la landing y es la **estructura canónica** que `lib/marketing/meta-campaign-builder.ts:395` consumirá en vez de hardcodear los UTM. Hoy el builder arma los UTM inline; con esto se convierte en lector de `utm_base`:

```jsonc
// utm_base ejemplo
{ "source":"meta", "medium":"paid_social",
  "campaign":"propiedad_<slug>",           // <slug> resuelto de public_slug (estable)
  "content":"{{ad.id}}", "term":"{{placement}}" }
```

Así la landing es **requisito** de la campaña (Fase 2: sin landing → bloquear) y la conexión Meta↔landing queda declarada en un solo lugar.

### 2.6 Slug: intacto, pero ahora con UI

`lib/landing/slug.ts` + `assign-slug.ts` (`ensurePublicSlug`, UPDATE atómico) **se reutilizan tal cual**. El único cambio: hoy el slug se asigna solo en 2 lugares automáticos (worker de portal, admin). Ahora **crear la landing dispara `ensurePublicSlug`** como tercer punto de entrada — el flujo correcto, porque el usuario quiere que la landing sea el requisito previo. Idempotente: si ya hay slug (porque se publicó en portal antes), lo respeta.

---

## 3. Block Registry — un schema, dos renders

### 3.1 El registry

```ts
// lib/landing/registry.tsx
import type { ComponentType } from 'react'
import type { AnyBlock } from './schema'

export interface BlockContext {          // datos vivos que los bloques resuelven en render
  property: PropertyRow
  avatar?: LandingAvatar
  mode: 'edit' | 'public'
}
export interface BlockDef<T extends AnyBlock = AnyBlock> {
  type: T['type']
  label: string
  icon: LucideIcon
  Render: ComponentType<{ block: T; ctx: BlockContext }>   // ÚNICO componente, ramifica por ctx.mode
  defaultProps: () => T['props']
  editableFields: FieldSpec[]            // alimenta el panel del editor (o el `fields` de Puck)
  lockable?: boolean                     // lead_form/hero → true
}

export const REGISTRY: Record<AnyBlock['type'], BlockDef> = {
  hero: HeroDef, gallery: GalleryDef, video: VideoDef, features: FeaturesDef,
  avatar_copy: AvatarCopyDef, social_proof: SocialProofDef, location: LocationDef,
  cta: CtaDef, lead_form: LeadFormDef,
}
```

### 3.2 Un solo componente, dos modos (patrón clave)

Cada bloque tiene **un** `Render` que ramifica por `ctx.mode`. En `edit` añade affordances (placeholder, hover ring, contenteditable); en `public` es read-only optimizado. Los datos duros se resuelven acá desde `ctx.property`:

```tsx
// components/landing/blocks/HeroBlock.tsx
export function HeroRender({ block, ctx }: { block: HeroBlock; ctx: BlockContext }) {
  const { property } = ctx
  const media = resolveMedia(block.props, property)   // índice→url, o video_file_url, etc.
  const price = formatPrice(property.asking_price, property.currency)  // dato vivo, no en config
  return (
    <section className="relative h-[88vh] ..." data-block-id={block.id}>
      <HeroMedia media={media} overlay={block.props.overlay} motion={ctx.mode==='public'} />
      {ctx.mode === 'edit'
        ? <InlineText value={block.props.headline} field="headline" blockId={block.id} />
        : <h1>{block.props.headline}</h1>}
      {/* CTA hace scroll a #lead-form en ambos modos */}
    </section>
  )
}
```

Ganancia: **cero divergencia** entre lo que el asesor ve editando y lo que se publica (elimina la clase de bug "en el editor se veía bien"). En Puck, este `Render` es literalmente el `render` del componente Puck; el modo se infiere del contexto de edición de Puck (`usePuck`) o se pasa por prop.

### 3.3 Cómo renderiza la landing pública (`app/p/[slug]`)

`app/p/[slug]/page.tsx` se reescribe: en vez de importar 10 componentes y pasar props sueltas, lee el `config` y mapea:

```tsx
// app/p/[slug]/page.tsx (nuevo core)
const landing = await getLanding(property.id)        // property_landing.config
const config = landing?.status === 'published'
  ? LandingConfig.parse(landing.config)              // valida en runtime
  : legacyFallbackConfig(property)                   // §5: landings viejas sin config
const ctx: BlockContext = { property, avatar: landing?.avatar, mode: 'public' }

return (
  <main>
    <LandingVisitTracker slug={slug} funnelType={resolveFunnelType(property)} /> {/* fix del bug hardcode */}
    {pixelId && <MetaPixel .../>}
    {config.blocks.map(b => {
      const Def = REGISTRY[b.type]
      return <Def.Render key={b.id} block={b as any} ctx={ctx} />
    })}
  </main>
)
```

Sigue siendo Server Component; los bloques con motion (`framer-motion`/GSAP) llevan su `'use client'` boundary interno. **El `#lead-form` sigue posteando a `POST /api/leads` sin cambios** — el registry no toca el pipeline de leads/CAPI.

### 3.4 Versionado de schema (no romper landings publicadas)

`property_landing.schema_version`. Un `migrateConfig(raw): LandingConfig` en `lib/landing/migrate.ts` aplica upgrades idempotentes v1→v2→… antes de `LandingConfig.parse`. Regla: **nunca borrar un `type` de bloque del registry sin un paso de migración** que lo transforme. Landings publicadas se re-validan al leer; si `parse` falla, log + fallback a `legacyFallbackConfig` (§5) — nunca un 500 en una landing viva con campaña corriendo.

---

## 4. El editor — shell, DnD, responsive, undo/redo, autosave

Ruta: `app/(dashboard)/properties/[id]/landing/page.tsx` (sección independiente, como pide el usuario) → componente `LandingEditor` (`'use client'`).

### 4.1 Layout del editor

```
┌──────────────────────────────────────────────────────────────┐
│ Topbar: [Templates ▾] [Tema ▾] [◧ Desktop|Mobile] [↶↷] [Guardado ✓] [Publicar] │
├───────────┬──────────────────────────────────────┬───────────┤
│ Paleta     │        CANVAS (preview vivo)          │ Panel de   │
│ de bloques │   bloques reordenables (dnd-kit)      │ propiedades│
│ (draggable)│   iframe/portal @ ancho del viewport  │ del bloque │
│            │                                        │ seleccionado│
└───────────┴──────────────────────────────────────┴───────────┘
```

Con Puck, este layout ES el `<Puck>` (topbar custom via `overrides`, paleta = component list, panel = fields). Con fallback (b), lo construimos con `DndContext`+`SortableContext` de @dnd-kit (ya probado en el proyecto en `StepImages` y la galería multimedia).

### 4.2 Reordenamiento con @dnd-kit (base común a ambas opciones)

- `SortableContext` con `verticalListSortingStrategy` sobre `config.blocks` (clave = `block.id`).
- Bloques `locked` (`lead_form`) → `useSortable({ disabled: true })` + sin botón borrar.
- Paleta → canvas: `DragOverlay` + `onDragEnd` inserta `REGISTRY[type].defaultProps()`.
- Reutiliza el patrón exacto de la galería multimedia (drag = permutación validada), consistencia con el código existente.

### 4.3 Responsive desktop/mobile

- Toggle en topbar → estado `viewport: 'desktop'|'mobile'`. El canvas es un contenedor de ancho fijo (`1280px` / `390px`) con `@container` queries — **cada bloque usa container queries, no viewport queries**, así el preview mobile es fiel dentro del canvas desktop del editor (el viewport real del navegador del asesor es grande).
- Tailwind 4 soporta `@container` nativo. Cada bloque premium se diseña container-first: `@md:grid-cols-3`, etc.
- `theme.motion` + `prefers-reduced-motion` (runtime) gobiernan las animaciones — presupuesto LCP<2.5s/INP<200ms de la memoria `scroll_animation_stack.md`.

### 4.4 Undo/redo + autosave

- **Undo/redo:** Puck lo trae (history API). En fallback (b): un `useReducer` con stack `past[]/present/future[]`, cada acción (add/remove/move/editField) hace push. Debounce de edición de texto para no llenar el historial por keystroke.
- **Autosave:** `useDebouncedCallback(600ms)` → `PATCH /api/properties/[id]/landing` con `{ config }`. Optimistic UI; indicador "Guardado ✓". Guarda como `status='draft'`. **Publicar** = `PATCH { status:'published' }` que corre `LandingConfig.parse` server-side (rechaza si falla `superRefine`) + `ensurePublicSlug` si aún no hay slug + smoke test (GET a `/p/slug`, reutiliza el patrón de `meta-campaign-builder.ts:800`).
- **Validación en vivo en el editor:** correr `LandingConfig.safeParse` en cada cambio; los issues de `superRefine` se muestran como banners no bloqueantes ("Falta un CTA hacia el formulario") y **el botón Publicar se deshabilita** hasta que `success:true`.

### 4.5 Preview de templates (requisito "ver la propiedad en varios diseños")

Modal/route `landing/templates`: para cada `TemplateId`, renderiza `template.build(ctx)` con `<Render>` en un iframe escalado (thumbnails vivos, no screenshots). El asesor elige → `setConfig(built)` sobre el mismo `property_landing`. **El slug/enlace no cambia.** Cambiar de template después de editar advierte "se reemplaza el diseño actual" (el config editado se pierde salvo que ofrezcamos merge — recomendación: no mergear, es confuso; ofrecer "duplicar como borrador" si hace falta).

---

## 5. Migración de los componentes actuales (sin romper landings publicadas)

Los 10 componentes de `components/landing/*` son hoy prop-driven. La migración es **envolverlos, no reescribirlos** al inicio:

| Componente actual | Bloque destino | Trabajo |
|---|---|---|
| `Hero.tsx` | `hero` | Wrapper `HeroDef.Render` que mapea `block.props`+`ctx.property` → props actuales. Fase 2: reescribir con variantes premium/motion. |
| `Gallery.tsx` | `gallery` | Wrapper; añadir layouts `masonry/fullbleed-scroll`. |
| `VideoEmbed.tsx` + `Tour3DEmbed.tsx` | `video` (source union) | **Unificar** + **agregar `video_file_url`** (hoy NO se renderiza — gap conocido). |
| `Features.tsx` | `features` | Wrapper; `show[]` filtra. |
| `Description.tsx` | (absorbido por `avatar_copy` + hero subheadline) | La descripción portal alimenta copy; el bloque genérico se deprecia. |
| `LocationMap.tsx` | `location` | Wrapper + `hideExactAddress`. |
| `LeadForm.tsx` | `lead_form` (`locked`) | Wrapper; añadir modo `multi-step`. **Pipeline `/api/leads` intacto.** |
| `MetaPixel` + `LandingVisitTracker` | fuera del registry (siempre presentes) | Se renderizan directo en `page.tsx`. **Fix del bug `funnelType="otro"` hardcodeado.** |

**Estrategia de convivencia (crítica — hay campañas Meta vivas apuntando a landings):**

1. `legacyFallbackConfig(property)`: función pura que produce un `LandingConfig` equivalente al layout actual desde las columnas de `property`. **Toda landing publicada sin fila en `property_landing` renderiza vía este fallback** → cero landings rotas el día del deploy. El `page.tsx` nuevo funciona idéntico al viejo para las que no migraron.
2. Rollout: (a) deploy del registry + fallback (comportamiento visual idéntico), (b) UI del editor detrás de feature flag, (c) migración opt-in propiedad por propiedad (crear `property_landing` = "adoptar" la landing al nuevo sistema).
3. **Verificación en navegador obligatoria** de al menos una landing con campaña activa antes y después (paridad visual), por el patrón de crashes de reconciler/hydration que tsc no detecta (lección @react-pdf de CLAUDE.md).

---

## 6. Esfuerzo realista y orden

| Hito | Con Puck (recom.) | Fallback custom @dnd-kit |
|---|---|---|
| Spike de compat (gate) | 2 días | — |
| Schema + Zod + registry + `legacyFallbackConfig` | 4-5 días | 4-5 días (idéntico) |
| Migrar 10 componentes a bloques (wrappers) | 4-6 días | 4-6 días |
| Shell del editor (DnD, panel, undo/redo, viewport) | **3-4 días** (Puck lo da casi hecho) | **10-14 días** |
| Templates + preview vivo | 3-4 días | 3-4 días |
| Avatar+mapa empatía (co-creación) + `utm_base` | 4-5 días | 4-5 días |
| Autosave/publicar/validación/slug wiring | 3 días | 3 días |
| Rediseño premium de bloques (motion/GSAP) | continuo | continuo |
| **Total a MVP editable** | **~4-5 semanas** | **~7-8 semanas** |

El delta de ~3 semanas a favor de Puck es exactamente el shell del editor — el trabajo más caro y bug-prone. Por eso la recomendación, condicionada al spike.

---

## 7. Decisiones abiertas (con recomendación)

1. **Puck vs custom** → **Puck**, gate en spike de 2 días. Fallback pre-diseñado, mismo schema. *Tradeoff:* dependencia externa joven sobre Next 16 vs 3 semanas menos y menos superficie de bugs propios.
2. **¿`config` como JSONB único o desnormalizado?** → **JSONB único** (documento leído/escrito entero). *Tradeoff:* no consultable por campo, pero no lo necesitamos; simplicidad y versionado ganan.
3. **Datos duros en config vs resueltos en render** → **resueltos en render** desde `property`. *Tradeoff:* un poco más de lógica en cada `Render`, a cambio de landings nunca stale y sin superficie de inyección.
4. **Cambiar template pisa la edición** → **pisa con confirmación**, sin merge. *Tradeoff:* menos flexible, mucho menos confuso.
5. **Motion:** Framer Motion 12 (ya instalado) para el 90%; **GSAP/ScrollTrigger + Lenis solo si un bloque cinematográfico lo exige** (instalación diferida, respetando `scroll_animation_stack.md` y el presupuesto de performance). *Tradeoff:* no meter GSAP hasta que un bloque concreto lo pida.
6. **Slug** → intacto en `properties`, `ensurePublicSlug` como tercer punto de entrada. Garantiza enlace estable, cero riesgo sobre campañas vivas.

---

### Archivos que este diseño crea/toca (rutas absolutas)

- Nuevos: `lib/landing/schema.ts`, `lib/landing/registry.tsx`, `lib/landing/migrate.ts`, `lib/landing/templates/*`, `components/landing/blocks/*`, `app/(dashboard)/properties/[id]/landing/page.tsx` (+ `templates`), `app/api/properties/[id]/landing/route.ts`, migración `supabase/migrations/20260724000001_property_landing.sql`.
- Reescritos: `app/p/[slug]/page.tsx` (registry-driven + fix `funnelType`), los 10 `components/landing/*` (envueltos como bloques).
- Fase 2 (ganchos ya dejados): `lib/marketing/meta-campaign-builder.ts:395` lee `utm_base`; el gate "sin landing → bloquear" en el router de `meta-ads/page.tsx`; el avatar+empathyMap alimenta el `avatar_select` del wizard v2.

**Riesgo #1 a cerrar ya:** el spike Puck×React19/Next16 en navegador. Todo lo demás (schema, registry, migración, fallback) es agnóstico de esa decisión y puede empezar en paralelo.
