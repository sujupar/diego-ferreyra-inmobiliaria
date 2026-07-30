# Diseño: Landing Pages Editables + Avatar con Mapa de Empatía + Base UTM
**Diego Ferreyra Inmobiliaria — Fase 1 (Landing) con ganchos para Fase 2 (Campaña)**
Autor: arquitectura. Fecha: 2026-07-09. Ámbito: modelo de datos, flujo de co-creación, avatar. Deja señalados los puntos de integración de Fase 2 sin construirlos.

---

## 0. Principios de diseño (los dos niveles que pediste)

**Nivel 1 — estructura de software sólida**
- **Una landing por propiedad, un slug para siempre.** `properties.public_slug` sigue siendo la única fuente de verdad del enlace. El diseño (template + contenido) vive aparte y puede cambiar N veces sin tocar el slug. Esto satisface *“SIEMPRE el mismo enlace aunque cambien el diseño”* sin acoplarlo al render.
- **El contenido es dato, no código.** La landing se sirve desde un documento JSONB (`content.blocks[]`) interpretado por un registro de componentes. Los "templates" son *funciones que producen ese documento*, no páginas hardcodeadas. Cambiar template = regenerar/mergear bloques, mismo row, mismo slug.
- **El avatar es una entidad de primera clase compartida** (tabla `property_avatars`), no un blob enterrado en el job de Meta. La landing lo crea; la campaña lo reutiliza por FK. Cero duplicación de la persona entre Fase 1 y Fase 2.
- **La base UTM se materializa al publicar la landing** y el builder de Meta la *lee* (deja de hardcodearla). La landing pasa a ser precondición dura de la campaña.

**Nivel 2 — eficiencia / precisión / calidad**
- Co-creación con IA barata por defecto (DeepSeek/`gpt-4o-mini` vía `chatCompletion` con `jsonMode`), escalando a `gpt-4.1` solo si falla la validación de esquema. El análisis de fotos reusa el Vision que ya corre en `start` de Meta.
- Reúso agresivo de lo que ya existe: `getOrGenerateBridgedDescription()`, `ensurePublicSlug()`, `buyer-avatar-generator`, `LandingVisitTracker`, el patrón de subida por signed URL, `@dnd-kit` (ya instalado).
- **No** se agrega Puck/Craft.js. Editor propio sobre `@dnd-kit` + un schema de bloques cerrado (menos superficie, menos peso, control total del diseño premium). Tradeoff en §10.

---

## 1. Modelo de datos

Tres tablas nuevas. Ninguna toca `properties` salvo lecturas. Migración idempotente, estilo Dashboard (el usuario la corre a mano).

### 1.1 `property_avatars` — avatar canónico compartido

```sql
-- supabase/migrations/20260709000001_property_landings.sql
-- Landing pages editables + avatares con mapa de empatía.
-- IDEMPOTENTE. Correr en Dashboard SQL Editor (Supabase CLI no conecta).

create extension if not exists pgcrypto;  -- gen_random_uuid

-- ---------- AVATARES (compartidos landing <-> campaña) ----------
create table if not exists public.property_avatars (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null references public.properties(id) on delete cascade,
  parent_avatar_id uuid references public.property_avatars(id) on delete set null, -- linaje (refinado de)
  source        text not null default 'landing'
                  check (source in ('landing','campaign','system','manual')),
  label         text,                       -- shortLabel para UI
  avatar        jsonb not null,             -- EmpathyAvatar completo (ver §7.1)
  is_primary    boolean not null default false,  -- el avatar "vivo" de la propiedad
  model_used    text,                       -- observabilidad IA
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists idx_property_avatars_property on public.property_avatars(property_id);
-- Un solo primary por propiedad (índice parcial, mismo patrón que public_slug):
create unique index if not exists idx_property_avatars_one_primary
  on public.property_avatars(property_id) where is_primary;
```

**Por qué tabla y no columna en `properties`:** la campaña (Fase 2) necesita *seleccionar un avatar existente, ajustarlo o pedir propuestas del sistema*. Con tabla + `parent_avatar_id` un ajuste de campaña crea un hijo sin pisar el avatar de la landing; `is_primary` marca cuál es el "oficial". `meta_launch_jobs.selected_avatar_id` deja de ser un label de texto y pasa a apuntar acá (ver §7.3).

### 1.2 `property_landings` — la landing (1:1) + estado del wizard

```sql
-- ---------- LANDINGS ----------
create table if not exists public.property_landings (
  id            uuid primary key default gen_random_uuid(),
  property_id   uuid not null unique references public.properties(id) on delete cascade,
  status        text not null default 'analyzing'
                  check (status in ('analyzing','awaiting_answers','generating_avatar',
                                    'draft','published','archived')),
  template_id   text not null default 'editorial-cinematografico',

  -- Documento editable interpretado por app/p/[slug]. Schema TS en §2.
  content       jsonb not null default '{"version":1,"blocks":[],"theme":{}}'::jsonb,

  -- Avatar activo de la landing (apunta a property_avatars.is_primary normalmente)
  avatar_id     uuid references public.property_avatars(id) on delete set null,

  -- Estado de co-creación: preguntas de la IA, respuestas del asesor, análisis Vision.
  -- Vive acá (no en tabla-job aparte) porque hay una sola landing por propiedad:
  -- resumir el wizard = leer este row. Ver §6.
  wizard_state  jsonb not null default '{}'::jsonb,

  -- Base UTM materializada al publicar (leída por meta-campaign-builder). Ver §8.
  utm_base      jsonb not null default '{}'::jsonb,

  -- Observabilidad IA (strengths/weaknesses de Vision + descripción de portal usada)
  ai_analysis   jsonb,

  published_at    timestamptz,
  published_slug  text,          -- snapshot auditoría; la VERDAD sigue en properties.public_slug
  created_by      uuid references public.profiles(id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_property_landings_status on public.property_landings(status);
```

**Decisión 1:1 (no 1:N de landings activas).** Una sola landing por propiedad (`property_id unique`) porque el slug es por propiedad y no puede haber dos landings vivas en el mismo enlace. Las *versiones* (undo, cambio de template) van a una tabla de revisiones append-only, no a múltiples filas activas.

### 1.3 `property_landing_revisions` — historial / undo / cambio de template

```sql
-- ---------- REVISIONES (snapshots append-only) ----------
create table if not exists public.property_landing_revisions (
  id           uuid primary key default gen_random_uuid(),
  landing_id   uuid not null references public.property_landings(id) on delete cascade,
  revision     int  not null,
  template_id  text not null,
  content      jsonb not null,
  avatar_id    uuid,
  reason       text,   -- 'template_switch' | 'manual_edit' | 'publish' | 'autosave'
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (landing_id, revision)
);
create index if not exists idx_landing_revisions_landing on public.property_landing_revisions(landing_id);
```

Se escribe una revisión en cada **publish** y en cada **cambio de template** (no en cada keystroke; el autosave del editor solo hace `PATCH` al `content` vivo). Permite “volver al diseño anterior” y auditar. Retención: sin límite por ahora (barato).

### 1.4 Triggers `updated_at` + RLS

```sql
-- updated_at
create or replace function public.tg_touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

drop trigger if exists trg_property_avatars_touch on public.property_avatars;
create trigger trg_property_avatars_touch before update on public.property_avatars
  for each row execute function public.tg_touch_updated_at();
drop trigger if exists trg_property_landings_touch on public.property_landings;
create trigger trg_property_landings_touch before update on public.property_landings
  for each row execute function public.tg_touch_updated_at();

-- RLS (granular por rol, consistente con 20260505000001). Lectura pública NO va acá:
-- app/p/[slug] usa admin client (service role), como getPropertyBySlug hoy.
alter table public.property_avatars           enable row level security;
alter table public.property_landings          enable row level security;
alter table public.property_landing_revisions enable row level security;

-- authenticated: admin/dueno/coordinador/asesor gestionan; abogado NO (no ve marketing).
do $$ begin
  -- landings
  create policy p_landings_rw on public.property_landings
    for all to authenticated
    using  (public.current_role() in ('admin','dueno','coordinador','asesor'))
    with check (public.current_role() in ('admin','dueno','coordinador','asesor'));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy p_avatars_rw on public.property_avatars
    for all to authenticated
    using  (public.current_role() in ('admin','dueno','coordinador','asesor'))
    with check (public.current_role() in ('admin','dueno','coordinador','asesor'));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy p_landing_rev_ro on public.property_landing_revisions
    for select to authenticated
    using (public.current_role() in ('admin','dueno','coordinador','asesor'));
exception when duplicate_object then null; end $$;
-- INSERT de revisiones lo hace el service-role en el endpoint publish/switch → bypass RLS.
```

> Ajustá `public.current_role()` al helper real de la migración `20260505000001_rls_per_role_safe.sql` (usa el mismo que ya usan `deals`/`properties`). Si ese helper tiene otro nombre, reemplazá las 3 policies.

**Nada cambia en `properties`.** `public_slug`, `photos`, `video_url`, `video_file_url`, `tour_3d_url` se leen tal cual. Sin columnas `landing_*` nuevas en `properties` (evita ensanchar una tabla ya caliente con triggers).

---

## 2. Documento editable (schema del `content` JSONB)

El `content` es un árbol plano de bloques ordenados. Un solo JSONB, responsive por bloque. TS canónico en `lib/landing/schema.ts`:

```ts
// lib/landing/schema.ts
export type Breakpoint = 'desktop' | 'mobile';

export type BlockType =
  | 'hero' | 'hero_video'            // hero imagen a full-bleed | hero con video de fondo
  | 'features' | 'stats'             // ambientes/m²/amenities | contadores animados
  | 'gallery'                        // grilla/carrusel de fotos
  | 'video_file' | 'video_embed'    // <video> (video_file_url) | embed YouTube/Vimeo (video_url)
  | 'tour3d'                         // iframe tour_3d_url
  | 'description' | 'rich_text'     // descripción de portal | texto libre editable
  | 'location_map'                   // lat/lng
  | 'social_proof' | 'testimonial'  // CUCICBA/casos | quote
  | 'cta_band'                       // franja CTA (scrollea al lead_form)
  | 'lead_form'                      // LA oferta única (registro / video recorrido / agendar)
  | 'spacer' | 'divider';

export interface LandingBlock<P = Record<string, unknown>> {
  id: string;                 // nanoid, estable (clave de dnd + react key)
  type: BlockType;
  props: P;                   // props base (desktop)
  mobile?: Partial<P>;        // overrides SOLO mobile
  hidden?: Breakpoint[];      // ocultar en un breakpoint (ej. hero_video en mobile)
  motion?: 'fade-up' | 'reveal' | 'parallax' | 'none';
  order: number;              // redundante con el índice, pero explícito para dnd
}

export interface LandingTheme {
  palette: 'obsidian' | 'ivory' | 'sand' | 'custom';
  accent: string;             // hex
  font: 'serif-editorial' | 'grotesk' | 'humanist';
  motion: 'cinematic' | 'subtle' | 'off';   // respeta prefers-reduced-motion en runtime
}

export interface LandingDocument {
  version: 1;
  blocks: LandingBlock[];
  theme: LandingTheme;
  meta?: { title?: string; ogImage?: string; description?: string };
}
```

Ejemplo de props por bloque (los tipos concretos viven en `schema.ts`):

```ts
interface HeroProps       { imageUrl: string; kicker?: string; headline: string; sub?: string; ctaLabel: string; }
interface HeroVideoProps  { videoFileUrl?: string; posterUrl: string; headline: string; ctaLabel: string; }
interface GalleryProps    { imageUrls: string[]; layout: 'grid' | 'masonry' | 'carousel'; }
interface VideoFileProps  { url: string; posterUrl?: string; }        // <-- video_file_url (HOY NO se renderiza; bug)
interface LeadFormProps   { offer: 'registro' | 'video_recorrido' | 'agendar_visita';
                            headline: string; buttonLabel: string; fields: ('nombre'|'email'|'telefono')[];
                            multiStep: boolean; }
```

**Invariante de conversión (una oferta / un CTA):** el documento debe tener **exactamente un** bloque `lead_form`. Todos los `cta_band` y los CTAs de hero apuntan a él (scroll/anchor), no a URLs externas. Se valida en `publish` (§6.4). Esto es lo que corrige *“la landing parece portal”*.

**Referencias a media:** los bloques guardan **URLs explícitas** (de Storage), no índices a `properties.photos`. Así, editar las fotos de la propiedad no muta silenciosamente la landing. Se ofrece una acción “Actualizar media desde la propiedad” (`POST …/landing/resync-media`) para re-sincronizar a demanda. Tradeoff en §10.

---

## 3. Cómo `app/p/[slug]` sirve el documento editable

`app/p/[slug]/page.tsx` deja de renderizar secciones hardcodeadas y pasa a interpretar `content.blocks`. Con fallback a lo legacy (propiedades sin landing todavía).

```ts
// lib/landing/get-landing.ts
export async function getLandingBySlug(slug: string): Promise<{
  property: PropertyRow;
  landing: PropertyLandingRow | null;   // null => render legacy
  avatar: EmpathyAvatar | null;
} | null> {
  const admin = createAdminClient();
  const { data: property } = await admin.from('properties')
    .select('*').eq('public_slug', slug).eq('status','approved').maybeSingle();
  if (!property) return null;
  const { data: landing } = await admin.from('property_landings')
    .select('*, avatar:property_avatars(*)')
    .eq('property_id', property.id).eq('status','published').maybeSingle();
  return { property, landing: landing ?? null, avatar: landing?.avatar?.avatar ?? null };
}
```

```tsx
// app/p/[slug]/page.tsx (esqueleto)
const data = await getLandingBySlug(slug);
if (!data) notFound();
const funnelType = deriveFunnelType(data.property);   // <-- FIX del bug funnelType="otro" hardcodeado (page.tsx:86)

return (
  <>
    <MetaPixel pixelId={META_PIXEL_ID} />
    <LandingVisitTracker slug={slug} funnelType={funnelType} />
    {data.landing
      ? <LandingRenderer doc={data.landing.content} property={data.property} avatar={data.avatar} />
      : <LegacyLanding property={data.property} /> /* Hero/Features/Gallery/... actuales */ }
  </>
);
```

```tsx
// components/landing/LandingRenderer.tsx  (Server Component)
const BLOCK_COMPONENTS: Record<BlockType, React.ComponentType<any>> = {
  hero: LandingHero, hero_video: LandingHeroVideo, features: LandingFeatures,
  gallery: LandingGallery, video_file: LandingVideoFile /* NUEVO: <video src=video_file_url> */,
  video_embed: LandingVideoEmbed, tour3d: LandingTour3DEmbed, description: LandingDescription,
  location_map: LandingLocationMap, lead_form: LandingLeadForm, cta_band: LandingCtaBand,
  social_proof: LandingSocialProof, stats: LandingStats, testimonial: LandingTestimonial,
  rich_text: LandingRichText, spacer: LandingSpacer, divider: LandingDivider,
};
export function LandingRenderer({ doc, property, avatar }: Props) {
  return <ThemeProvider theme={doc.theme}>
    {doc.blocks.sort((a,b)=>a.order-b.order).map(b => {
      const C = BLOCK_COMPONENTS[b.type];
      return <MotionWrap key={b.id} motion={b.motion} hidden={b.hidden}>
        <C {...b.props} property={property} avatar={avatar} />
      </MotionWrap>;
    })}
  </ThemeProvider>;
}
```

`MotionWrap` es un client component fino (framer-motion / GSAP-ScrollTrigger) que aplica `fade-up`/`reveal`/`parallax` respetando `prefers-reduced-motion` y `theme.motion==='off'`. Los componentes de bloque pueden ser server (estáticos) con islas cliente donde haga falta (form, tracker, carrusel). **Se agrega `LandingVideoFile`** que renderiza `<video controls playsInline poster>` desde `video_file_url` — hoy la landing lo ignora (bug documentado en el scouting).

---

## 4. Templates de alta conversión (código, no filas)

Un template es un **manifiesto + un builder** que produce un `LandingDocument` a partir de `(property, avatar, description)`. Registro en `lib/landing/templates/`.

```ts
// lib/landing/templates/types.ts
export interface LandingTemplate {
  id: string;                    // 'editorial-cinematografico'
  name: string;                  // "Editorial Cinematográfico"
  requiresVideo: boolean;        // si true, se deshabilita cuando no hay video
  thumbnail: string;             // /landing-templates/editorial.webp (preview estático)
  theme: LandingTheme;
  build(ctx: TemplateBuildContext): LandingDocument;
}
export interface TemplateBuildContext {
  property: PropertyRow;
  avatar: EmpathyAvatar | null;
  description: { title: string; subtitle: string; body: string };  // de getOrGenerateBridgedDescription
  hasVideoFile: boolean;   // property.video_file_url
  hasVideoEmbed: boolean;  // property.video_url
  hasTour: boolean;        // property.tour_3d_url
}
```

Templates iniciales (todos “landing de conversión”, no portal):

| id | requiresVideo | Ángulo |
|---|---|---|
| `editorial-cinematografico` | no | Hero full-bleed foto HD, tipografía serif, reveal on scroll, 1 oferta |
| `video-inmersivo` | **sí** | `hero_video` de fondo (video_file_url), CTA sticky |
| `minimal-lujo` | no | Mucho espacio negativo, paleta obsidian, stats animados |
| `galeria-grid` | no | Peso en `gallery` masonry para props con muchas fotos, sin video |

El builder **condiciona el bloque de video**: usa `video_file` si `hasVideoFile`, si no `video_embed` si `hasVideoEmbed`, si no lo omite. `requiresVideo:true` se filtra en la UI cuando `!hasVideoFile && !hasVideoEmbed` → satisface *“propiedad CON y SIN video”*.

**Preview de templates (mismo enlace, distintos diseños):** el paso de preview renderiza cada template en un `<iframe>` a una ruta de preview server-side que NO depende del slug publicado:

```
GET /api/properties/[id]/landing/preview?template=<id>   → HTML de la landing con content=build(ctx) EN MEMORIA (no persiste)
```

El asesor ve la propiedad real en 3-4 diseños y elige. Al elegir → `POST …/landing/template` persiste `content` + `template_id` + escribe revisión. El **slug no se toca nunca** en este flujo.

---

## 5. Editor drag-and-drop (desktop + mobile)

Sobre `@dnd-kit` (ya instalado). Tres zonas: **paleta de bloques** (izq) · **canvas** (centro, `SortableContext` vertical) · **inspector** (der, props del bloque seleccionado). Toggle **Desktop/Mobile** que:
- cambia el ancho del canvas (viewport simulado),
- edita `block.props` (desktop) vs `block.mobile` (overrides mobile),
- respeta `block.hidden` para ocultar por breakpoint.

```ts
// components/landing/editor/useLandingEditor.ts
function useLandingEditor(landingId: string) {
  // estado local optimista + autosave debounced (800ms) a PATCH …/landing
  addBlock(type: BlockType, atIndex?: number): void;
  removeBlock(id: string): void;
  moveBlock(activeId: string, overId: string): void;  // onDragEnd de dnd-kit → reordena + reindexa order
  updateBlockProps(id: string, patch: object, bp: Breakpoint): void;
  setTheme(patch: Partial<LandingTheme>): void;
  save(): Promise<void>;   // PATCH content completo
}
```

El autosave hace `PATCH /api/properties/[id]/landing { content }` con `status` intacto (`draft`). Solo `publish` cambia a `published`. Nunca se usa `status:'pending'` (lección del worker de portales). El editor valida el invariante “1 lead_form” en cliente (avisa) y el server lo re-valida en publish.

---

## 6. Flujo de co-creación (asesor + IA) — máquina de estados + endpoints

La landing se crea desde la **página de detalle de propiedad** (`app/(dashboard)/properties/[id]/page.tsx`), nueva sección “Landing Page” (visible para admin/dueño/coordinador/asesor; **oculta para abogado**, como Marketing/Multimedia). Un botón “Crear Landing” abre el wizard.

### 6.1 Máquina de estados (columna `status`)

```
analyzing ──► awaiting_answers ──► generating_avatar ──► draft ──► published
    │  (Vision + descripción         (asesor responde     (elige template,     (ensurePublicSlug,
    │   + IA arma 3-5 preguntas)      3-5 preguntas)        edita, preview)      utm_base, revisión)
    └────────────────── (todos pueden volver atrás; draft↔published editable) ──────────┘
                                                                     └─► archived
```

**Resumabilidad:** como hay una sola landing por propiedad, reanudar = leer el row. `status` dice en qué etapa macro estás; `wizard_state.step` (texto) guarda el sub-paso fino. Al recargar, el wizard hidrata de `GET …/landing`. No hay regeneración: si el avatar ya existe (`avatar_id` no null) no se vuelve a generar; si `content` ya tiene bloques no se re-buildea.

### 6.2 Forma de `wizard_state`

```ts
interface WizardState {
  step: 'intro'|'questions'|'avatar_review'|'template'|'editor'|'preview'|'publish';
  questions?: { id: string; q: string; hint?: string }[];   // 3-5 preguntas de la IA
  answers?: Record<string, string>;                          // respuestas del asesor
  avatarDraftComment?: string;                               // para refinar
  chosenTemplate?: string;
}
```

### 6.3 Endpoints (paths reales, método, payload, qué persiste)

Base: `app/api/properties/[id]/landing/…`. Todos `requireAuth` + 403 abogado. `maxDuration = 60` donde hay IA.

| Método · Path | Payload | Hace / Persiste |
|---|---|---|
| **POST** `/landing/start` | `{}` | Idempotente (upsert por `property_id`). Crea `property_landings` `status='analyzing'`. Encadena: (1) `getOrGenerateBridgedDescription(propertyId)` → descripción; (2) Vision sobre `property.photos` (reusa el analizador de `meta-launch-v2/start`) → `ai_analysis.{strengths,weaknesses}`; (3) `generateLandingQuestions(property, analysis)` (IA text, 3-5 preguntas). Guarda `wizard_state.questions`, pasa a `awaiting_answers`. Devuelve `{ landingId, status, questions }`. |
| **GET** `/landing` | — | Lectura pura. Devuelve `property_landings` + `avatar` (join) + `content` + `wizard_state`. Es el endpoint de **resume/poll**. |
| **POST** `/landing/answers` | `{ answers: Record<string,string> }` | Guarda `wizard_state.answers`, pasa a `generating_avatar`. Llama `generateEmpathyAvatar({property, analysis, answers})` (§7.2), inserta en `property_avatars` (`source='landing'`, `is_primary=true`), setea `landing.avatar_id`, pasa a `draft`. Devuelve `{ avatar }`. |
| **POST** `/landing/avatar/refine` | `{ comment: string }` | Refina el avatar primario (reusa patrón `optimize-avatar` de Meta). Crea hijo `property_avatars` (`parent_avatar_id`, `source='landing'`), lo marca `is_primary` (destrona al anterior en una tx). Devuelve `{ avatar }`. |
| **GET** `/landing/templates` | — | Lista manifiestos filtrados por `hasVideo`. Devuelve `[{id,name,requiresVideo,thumbnail,enabled}]`. |
| **GET** `/landing/preview?template=<id>` | — | Renderiza HTML en memoria con `template.build(ctx)` (no persiste). Para el `<iframe>` de comparación. |
| **POST** `/landing/template` | `{ templateId }` | `content = template.build(ctx)`; guarda `template_id`+`content`; escribe `property_landing_revisions` (`reason='template_switch'`); `status='draft'`. Devuelve `{ content }`. |
| **PATCH** `/landing` | `{ content?, wizard_state?, theme? }` | Autosave del editor. Merge de `content`. **No** cambia `status` ni escribe revisión (evita ruido). Valida shape del documento (zod). |
| **POST** `/landing/resync-media` | `{ blockId? }` | Re-inyecta `property.photos`/`video_file_url`/`tour_3d_url` en los bloques de media (todos o uno). |
| **POST** `/landing/publish` | `{}` | (1) valida invariante “1 `lead_form`”, ≥1 CTA, título/OG presentes; (2) `ensurePublicSlug(propertyId)` (UPDATE atómico WHERE public_slug IS NULL, reusa el existente); (3) `utm_base = buildLandingUtmBase(slug)` (§8); (4) `status='published'`, `published_at=now()`, `published_slug=slug`; (5) revisión `reason='publish'`. Devuelve `{ url: '/p/<slug>', utm_base }`. **Idempotente.** |
| **POST** `/landing/unpublish` | `{}` | `status='draft'`. La landing deja de servirse; el slug se conserva. |
| **POST** `/landing/revisions/[rev]/restore` | — | Copia `content`+`template_id` de una revisión al row vivo (`status='draft'`). |

**Reúso vs. tabla-job aparte:** no se crea `landing_cocreation_jobs`. El patrón `meta_launch_jobs` es pesado (multi-etapa, locks anti-paralelo, 27 piezas). La co-creación de landing es corta y single-writer (un asesor por propiedad); todo el estado intermedio cabe en `property_landings.wizard_state`. Menos superficie, resume trivial. Tradeoff en §10.

### 6.4 Generación de preguntas (firma)

```ts
// lib/landing/questions-generator.ts
export async function generateLandingQuestions(input: {
  property: PropertyRow;
  analysis: { strengths: string[]; weaknesses: string[] };
  description: { title: string; subtitle: string; body: string };
}): Promise<{ id: string; q: string; hint?: string }[]>;   // 3-5 preguntas, jsonMode, fallback determinístico
```

Prompt orientado a extraer lo que la IA **no** puede inferir de fotos/descripción: perfil de comprador ideal que el asesor tiene en la cabeza, urgencia de venta, diferencial emocional del barrio, objeción típica que escucha en visitas, oferta preferida (registro / video recorrido / agendar). Esas respuestas alimentan al avatar (§7) y al copy de los bloques.

---

## 7. Avatar con Mapa de Empatía

### 7.1 Interfaz TS extendida (`lib/marketing/empathy-avatar.ts`)

Superconjunto del `BuyerAvatar` actual (retrocompatible: los campos viejos siguen).

```ts
export interface EmpathyMap {
  says:   string[];   // frases textuales que diría
  thinks: string[];   // lo que piensa pero no dice
  feels:  string[];   // emociones dominantes
  does:   string[];   // comportamientos observables (busca en portales, compara, pide fotos…)
}

export interface Objection { objection: string; reframe: string; } // objeción + cómo rebatirla en copy

export interface EmpathyAvatar {
  id: string;
  version: number;

  // --- Identidad (compat BuyerAvatar) ---
  shortLabel: string;            // "Inversor pragmático"
  fullName?: string;             // "Marcela, 54"
  ageRange: string;
  occupation: string;
  lifeMoment: string;
  location?: string;
  incomeBand?: string;

  // --- Motivación / trabajos ---
  motivation: string;
  jobsToBeDone: string[];        // JTBD funcional / emocional / social
  triggers: string[];            // disparadores de decisión ("se muda hija", "vendió otro inmueble")

  // --- MAPA DE EMPATÍA ---
  empathy: EmpathyMap;
  pains: string[];               // dolores
  gains: string[];               // ganancias esperadas

  // --- Venta ---
  concerns: string[];            // (compat BuyerAvatar.concerns)
  objections: Objection[];       // objeciones + reframe
  preferredChannel: 'whatsapp'|'instagram'|'facebook'|'email'|'llamada'|'presencial';
  communicationTone: string;

  // --- Creative hooks (landing + ad message-match) ---
  hooks: string[];               // (compat BuyerAvatar.hooks)
  headlineAngles: string[];      // ángulos de headline para la oferta única
  visualCue: string;             // (compat) guía visual para gpt-image-2
  reasoning: string;             // (compat) por qué este avatar

  // --- Meta ---
  source: 'ai' | 'ai_refined' | 'manual';
  model?: string;
}
```

`headlineAngles` es el puente de **message-match**: el mismo ángulo alimenta el `headline` del `hero`/`lead_form` de la landing y el copy del ad en Meta (Fase 2), garantizando que el anuncio y la landing “digan lo mismo”.

### 7.2 Generación (firma + decisión de modelo)

Reúsa la estructura de `lib/marketing/buyer-avatar-generator.ts` con prompt extendido y validación de esquema.

```ts
// lib/marketing/empathy-avatar-generator.ts
export async function generateEmpathyAvatar(input: {
  property: PropertyRow;
  analysis: { strengths: string[]; weaknesses: string[] };
  answers: Record<string, string>;    // respuestas de co-creación
  description: { title: string; subtitle: string; body: string };
}): Promise<EmpathyAvatar>;

// Propuestas del sistema para el paso de campaña (Fase 2): 3 alternativas
export async function generateThreeEmpathyAvatars(input: {...}): Promise<EmpathyAvatar[]>;
```

**Decisión de modelo (recomendación):** por defecto `chatCompletion` con `jsonMode` sobre **DeepSeek `deepseek-chat`** (el default actual, barato, buen JSON). Validar la salida contra un guard (`isEmpathyAvatar`) que exija `empathy.{says,thinks,feels,does}` + `pains`/`gains` no vacíos. Si falla la validación, **escalar una sola vez a OpenAI `gpt-4.1`** (`chat-client` ya tiene el fallback OpenAI cableado). Si ambos fallan → fallback determinístico (como el actual) que rellena el mapa de empatía con plantillas por `lifeMoment`. Costo esperado ~$0.005–0.02 por avatar; escalado raro.
*Tradeoff:* `gpt-4.1` da mapas de empatía más ricos y consistentes; DeepSeek es ~10× más barato. Por eso: barato-por-defecto, caro-solo-si-hace-falta.

### 7.3 Persistencia + compartir landing ↔ campaña

- **Persistencia:** siempre en `property_avatars` (JSONB `avatar`). La landing referencia `landing.avatar_id`; el “oficial” es `is_primary=true`.
- **La campaña reutiliza el avatar de la landing (Fase 2):** en el step `avatar_select` del wizard v2, en vez de `generateThreeAvatars` a ciegas, se cargan los `property_avatars` de la propiedad. El primario (el de la landing) aparece **preseleccionado** con su mapa de empatía. El asesor puede: (a) **usarlo tal cual**; (b) **ajustarlo** → crea hijo `source='campaign'` con `parent_avatar_id`, sin tocar el de la landing; (c) **ver propuestas del sistema** → `generateThreeEmpathyAvatars` como alternativas.
- **Cableado en `meta_launch_jobs`:** hoy `selected_avatar_id` es un label de texto del avatar generado en el job. Migrar a FK:

```sql
-- Fase 2 (migración aparte, cuando se toque la campaña):
alter table public.meta_launch_jobs
  add column if not exists avatar_ref uuid references public.property_avatars(id) on delete set null;
-- selected_avatar_id (text) queda para compat; avatar_ref es la fuente nueva.
```

Así el `confirm/route.ts` de Meta lee el `EmpathyAvatar` real (con `headlineAngles`) para el copy de los ads, y la persona es **la misma** que vio el visitante en la landing.

---

## 8. Base UTM materializada ↔ Meta (puente Fase 1 → Fase 2)

Al publicar, la landing materializa su base UTM. **El builder de Meta la lee** en vez de hardcodearla (hoy en `lib/marketing/meta-campaign-builder.ts:395-409`).

```ts
// lib/landing/utm.ts
export function buildLandingUtmBase(slug: string): UtmBase {
  return {
    base_url: `${getAppUrl()}/p/${slug}`,
    utm_source:  'meta',
    utm_medium:  'paid_social',
    utm_campaign: `propiedad_${slug}`,
    utm_content: '{{ad.id}}',       // macros dinámicos de Meta
    utm_term:    '{{placement}}',
  };
}
```

Se guarda en `property_landings.utm_base`. En Fase 2, `meta-campaign-builder` cambia de construir la URL a:

```ts
const landing = await getPublishedLandingForCampaign(propertyId);
if (!landing) throw new NoLandingError();          // GATE de campaña (§9)
const landingUrl = buildUrlFromUtmBase(landing.utm_base);  // reemplaza :395-409
```

```ts
// lib/landing/get-landing.ts
export async function getPublishedLandingForCampaign(propertyId: string): Promise<{
  slug: string; url: string; utm_base: UtmBase; avatar_id: string | null;
} | null>;   // null => no hay landing publicada => bloquear campaña
```

El **smoke test** actual (GET a la landing antes de activar, `meta-campaign-builder.ts:800`) se mantiene: ahora pega a la URL derivada del `utm_base`.

---

## 9. Ganchos de Fase 2 (no se construyen acá, se dejan preparados)

Mi área es Fase 1 (landing + avatar + datos). Estos son los puntos exactos que Fase 2 va a tocar, señalados para que el diseño de datos ya los soporte:

1. **Gate “sin landing → bloquear campaña”.** El router `app/(dashboard)/properties/[id]/marketing/meta-ads/page.tsx` consulta `getPublishedLandingForCampaign(propertyId)`; si `null`, muestra CTA “Creá primero la Landing” en vez del wizard. Ya soportado por `property_landings.status='published'`.
2. **Selección de avatar** = leer `property_avatars` (§7.3). Ya soportado.
3. **gpt-image-2 en vez de Gemini.** Punto de reemplazo `lib/marketing/ad-image-generator.ts` (`generateAdImage`); reusar `lib/social/openai.ts` (`generateScene`/`generateBackground`, `gpt-image-2`, `IMAGE_QUALITY`). Recomendación de costo: `medium` por defecto (~$1.20–1.35 las 27 piezas), `high` opcional para propiedades de alto valor. No es cambio de datos: `property_ad_assets` ya cachea por `launch_job_id` → **resumabilidad de imágenes ya funciona** (cuenta piezas persistidas, skipea las hechas).
4. **Resumabilidad fina del wizard de campaña.** Hoy avatar_select/photo_stars/geo/budget viven todos bajo `awaiting_user_input` → al recargar no sabe el sub-paso. Fix mínimo de datos: `alter table meta_launch_jobs add column if not exists ui_step text;` y persistirlo en cada `save-input`. (Igual que `wizard_state.step` de la landing.)
5. **Blindaje de presupuesto (crítico — “un cero de más nos deja en la quiebra”).** Es Fase 2 pero el dato ya está: el bug real es que `confirm/route.ts:272-278` **no pasa `dailyBudgetArs`** a overrides → se ignora el budget elegido. Al cablearlo: pasar el entero ARS tal cual, y dejar el `×100` **una sola vez** en `meta-campaign-builder.ts:664` (no re-multiplicar). Agregar invariantes: entero, `1 ≤ ars ≤ MAX_DAILY_BUDGET_ARS` (env), y en la UI de review un confirm explícito “Vas a gastar **$X ARS/día**”. Esto no requiere tabla nueva.

---

## 10. Decisiones abiertas (recomendación + tradeoff)

| # | Decisión | Recomendación | Tradeoff |
|---|---|---|---|
| D1 | ¿Landing 1:1 o 1:N por propiedad? | **1:1** (`property_id unique`) + revisiones append-only | 1:N permitiría A/B de diseños en paralelo, pero rompe “un solo enlace” y complica el gate de campaña. A/B se hace después con `utm_content`, no con dos slugs. |
| D2 | ¿Editor propio o Puck/Craft.js? | **Propio sobre `@dnd-kit`** + schema cerrado | Puck da editor visual gratis, pero pesa, impone su estética y su modelo de datos; el objetivo es *diseño gráfico de altísimo nivel* controlado. Propio = más código de editor, control total. |
| D3 | ¿Estado de co-creación en `property_landings.wizard_state` o tabla-job? | **En `property_landings`** | Tabla-job (estilo `meta_launch_jobs`) da locks anti-paralelo y granularidad; innecesario para single-writer y proceso corto. Si en el futuro la co-creación se vuelve multi-etapa async pesada, migrar a job. |
| D4 | Modelo del avatar | **DeepSeek por defecto → escalar a gpt-4.1 si falla validación** | gpt-4.1 siempre = mejor calidad pero ~10× costo. El escalado condicional captura el 95% de la calidad al costo del barato. |
| D5 | Media en bloques: ¿URLs snapshot o bind a `properties.photos`? | **URLs snapshot** + acción “resync” | Bind live evita desincronización pero muta la landing sin intención al editar fotos; snapshot es predecible, con resync explícito. |
| D6 | Modelo de imágenes (Fase 2) | **gpt-image-2 `medium` default, `high` opcional** | `high` (~$0.17–0.21/img) cuadruplica costo; `medium` (~$0.04–0.05) es el sweet spot. Reusa `lib/social/openai.ts` intacto. |
| D7 | Lectura pública de la landing bajo RLS | **Admin client (service role)** en `app/p/[slug]`, como hoy | Alternativa: policy `anon SELECT` sobre `published`. Service role evita exponer la tabla a `anon` y es el patrón vigente (`getPropertyBySlug`). |

---

## 11. Orden de ejecución / rollout

1. **Correr migración `20260709000001_property_landings.sql`** en el Dashboard (3 tablas + triggers + RLS) — antes de deployar código que la lea.
2. **Backfill opcional:** para propiedades ya publicadas con `public_slug`, crear `property_landings` `status='published'` con `content=null` → el renderer cae a `LegacyLanding` (sin ruptura). O dejarlas sin fila (mismo efecto por el fallback).
3. Deploy Fase 1: sección “Landing Page” en detalle + endpoints `…/landing/*` + `LandingRenderer` + fix `funnelType` + `LandingVideoFile`.
4. Verificar end-to-end real en navegador (no solo build): crear landing → responder preguntas → avatar con mapa de empatía → elegir template → editar dnd → publicar → abrir `/p/<slug>` → confirmar tracking `funnel_type` correcto y CAPI del form.
5. Fase 2 (aparte): gate de campaña + `meta_launch_jobs.avatar_ref`/`ui_step` + swap a gpt-image-2 + cableo de `dailyBudgetArs` + blindaje presupuesto.

**Recordatorios de proyecto:** commits como `Sujupar <redstyle50@gmail.com>` (o falla el deploy Netlify); las Netlify Functions no importan `@/` (si algún worker toca esto, inlinear); las scheduled functions no disparan → cualquier tarea periódica de landing va por pg_cron, no `.mts`.

---

### Archivos nuevos/tocados (mapa rápido)

**Nuevos:** `supabase/migrations/20260709000001_property_landings.sql`, `lib/landing/schema.ts`, `lib/landing/get-landing.ts`, `lib/landing/utm.ts`, `lib/landing/templates/{types,index,editorial-cinematografico,video-inmersivo,minimal-lujo,galeria-grid}.ts`, `lib/landing/questions-generator.ts`, `lib/marketing/empathy-avatar.ts`, `lib/marketing/empathy-avatar-generator.ts`, `components/landing/LandingRenderer.tsx`, `components/landing/LandingVideoFile.tsx`, `components/landing/editor/*`, `app/api/properties/[id]/landing/**` (start, route[GET/PATCH], answers, avatar/refine, templates, preview, template, resync-media, publish, unpublish, revisions/[rev]/restore).
**Tocados:** `app/p/[slug]/page.tsx` (interpretar `content` + fix `funnelType`), `app/(dashboard)/properties/[id]/page.tsx` (sección Landing), y en Fase 2 `lib/marketing/meta-campaign-builder.ts` (leer `utm_base`, gate), `.../meta-ads/page.tsx` (gate), `components/properties/wizards/MetaAdsWizardV2.tsx` (avatar_select desde `property_avatars`), `confirm/route.ts` (cablear budget).
