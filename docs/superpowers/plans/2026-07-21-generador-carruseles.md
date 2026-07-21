# Generador de Carruseles (Sección "Redes Sociales") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development o executing-plans. Steps con checkbox (`- [ ]`).

**Goal:** Sección en el dashboard para generar carruseles de campaña (largo variable, narrativa de curiosidad) a partir de un tema, con la identidad y metodología de Fase 0, usando OpenAI + gpt-image-2.

**Architecture:** Job async **un-paso** con **continuación del lado del cliente** (el polling de `GET /status` procesa el próximo slide pendiente, para caber en `maxDuration=60`). Motor narrativo OpenAI (texto→JSON) + generación de imágenes gpt-image-2 + capa de texto satori/resvg/sharp (kit portado a `lib/social/`) + Supabase Storage. Reusa los patrones de `meta-launch-v2` (job+polling) y `ad-image-typography-overlay` (satori server-side).

**Tech Stack:** Next.js 16, Supabase (Postgres + Storage + RLS), OpenAI (`gpt-image-2`, texto `gpt-4.1`), satori + @resvg/resvg-js + sharp.

## Global Constraints
- Paleta: navy `#0d2d49` / rojo pérdida `#FF4D57` / verde acción `#00BF63`. Tipos: Montserrat + Lato. Formato 4:5 = **1080×1350**.
- Diego SOLO en gancho/cierre; `gpt-image-2` (NO `input_fidelity`, es de gpt-image-1); 2 fotos de referencia (`public/pdf-assets/photos/Foto Diego.png` + `fondo y foto diego/Foto Diego sin fondo.png`).
- Testimonios: solo reales de las landings, rotulados "testimonio real". No inventar clientes nombrados.
- `lib/social/**` usa imports `@/` **sin extensión** (`scripts/**` está excluido del build; los `.ts` de Fase 0 no aplican acá).
- Migración additive; FK a `profiles(id)` con `ON DELETE SET NULL`; RLS por rol; **abogado NO ve la sección**.
- **Correr la migración ANTES de deployar** el código que escribe en las tablas. Verificar contra la API (proyecto Supabase `mncsnastmcjdjxrehdep`).
- Commit author `Sujupar <redstyle50@gmail.com>`; push a `origin main` (auto-deploy Netlify).
- `OPENAI_API_KEY` en Netlify env (la nueva, rotada por el usuario) + `.env.local` local. `OPENAI_IMAGE_MODEL=gpt-image-2`, `OPENAI_TEXT_MODEL=gpt-4.1`.

---

### Task 1: Migración (tablas + RLS + bucket)

**Files:**
- Create: `supabase/migrations/20260721000001_social_carousels.sql`
- Create: `scripts/apply-social-carousels-migration-pg.ts` (aplica vía session pooler, patrón `apply-plans-migration-pg.ts`)

**Deliverable:** tablas `social_carousels` + `social_carousel_slides` + bucket `social-carousels` con RLS por rol, aplicadas y verificadas por API.

- [ ] **1.1** Escribir la migración: las 2 tablas del spec §7 (con `ON DELETE SET NULL` en `created_by`, CHECK en `status`, `UNIQUE(carousel_id, position)`), habilitar RLS, políticas por rol reutilizando la función de rol existente (mirar `20260505000001_rls_per_role_safe.sql` para el patrón exacto de `current_user_role()`), abogado excluido. Bucket privado `social-carousels` + políticas `storage.objects` por rol.
- [ ] **1.2** Escribir `scripts/apply-social-carousels-migration-pg.ts` (copiar de `scripts/apply-plans-migration-pg.ts`, cambiar el path del .sql).
- [ ] **1.3** Aplicar: `node --env-file=.env.local --import tsx scripts/apply-social-carousels-migration-pg.ts`. Si falla el pooler, entregar el SQL al usuario para el Dashboard.
- [ ] **1.4** Verificar por API: `select` de una columna de cada tabla (script corto) → confirmar que existen en el proyecto `mncsnastmcjdjxrehdep`. Verificar el bucket con `storage.listBuckets()`.
- [ ] **1.5** Commit (`feat(redes): migración social_carousels + bucket + RLS`).

### Task 2: Portar el kit de diseño a `lib/social/`

**Files:**
- Create: `lib/social/kit.tsx` (copia de `scripts/carousel/kit.ts` + `render.ts`, imports `@/` sin extensión)
- Create: `lib/social/fonts/` (copiar los 5 woff de `scripts/carousel/fonts/`)
- Create: `scripts/social/smoke-render.ts` (render de prueba de un slide → PNG a scratchpad)

**Interfaces:**
- Produces: `renderSlide(el): Promise<Buffer>`, `h`, `C`, `eyebrow/footer/paginator`, `darkBase/lightBase/splitSlide/cinematicBase/content/spacer`, `svgIcon/stars/ICON/leakCard`, `SCRIM`, `W=1080`, `H=1350`.

- [ ] **2.1** Copiar `render.ts` + `kit.ts` a `lib/social/kit.tsx`. Ajustar la carga de fuentes a `path` relativo del módulo (`fonts/` local). Sin imports `.ts`.
- [ ] **2.2** Smoke test: `scripts/social/smoke-render.ts` construye un `cinematicBase` con texto y escribe un PNG. Correr y **ver el PNG** (Read). Verifica que satori/resvg/fuentes andan desde `lib/social/`.
- [ ] **2.3** Commit.

### Task 3: Helpers OpenAI en `lib/social/`

**Files:**
- Create: `lib/social/openai.ts` (port de `scripts/carousel/openai-image.ts`)

**Interfaces:**
- Produces: `generateBackground(prompt, opts): Promise<Buffer>`, `generateScene({prompt, referencePaths, size, quality}): Promise<Buffer>`, `buildScenePrompt(p): string`, `FACIAL_LOCK`, `openaiText(system, user, jsonSchema): Promise<object>` (nuevo helper de texto→JSON con `response_format`).

- [ ] **3.1** Copiar `openai-image.ts` → `lib/social/openai.ts` (imports `@/`). Mantener el guard `input_fidelity` solo-gpt-image-1.
- [ ] **3.2** Agregar `openaiText(system, user, schema)` que llama a `chat/completions` (o `responses`) con `OPENAI_TEXT_MODEL`, `response_format: {type:'json_schema', json_schema: schema}`, y devuelve el objeto validado.
- [ ] **3.3** Smoke test: `scripts/social/smoke-openai.ts` genera 1 background y llama a `openaiText` con un schema trivial. Correr con `.env.local`, ver el PNG + el JSON.
- [ ] **3.4** Commit.

### Task 4: Motor narrativo `lib/social/narrative.ts`

**Files:**
- Create: `lib/social/narrative.ts`
- Create: `lib/social/brand-bible.ts` (system prompt + few-shot de los 3 carruseles)

**Interfaces:**
- Consumes: `openaiText` (Task 3).
- Produces: `generateScript(input: {topic, structure, targetLength, ctaType, diegoEnabled}): Promise<CarouselScript>` donde `CarouselScript` = el JSON del spec §4 (title, cta_type, caption, hashtags, slides[]).

- [ ] **4.1** Escribir `brand-bible.ts`: el system prompt con la biblia de marca + la **metodología de curiosidad** (gancho→bucles→resolución→CTA) + few-shot con el copy+rol de los 3 carruseles de Fase 0 (copiar de los scripts). Definir el JSON schema de `CarouselScript` (roles: hook|build|reveal|proof|cta; layouts: cinematic|split|infographic|testimonial).
- [ ] **4.2** `generateScript()` arma el user prompt con `{topic, structure, targetLength|auto, ctaType, diegoEnabled}` y llama a `openaiText`. Regla: siempre 1 hook + 1 cta; Diego solo en hook/cta si `diegoEnabled`.
- [ ] **4.3** Verificar: `scripts/social/smoke-narrative.ts` genera un guion de largo 8 sobre un tema de prueba. Ver el JSON: gancho fuerte, curiosidad, resolución al final, CTA. Iterar el prompt hasta que la narrativa cumpla.
- [ ] **4.4** Commit.

### Task 5: Composición de slide `lib/social/compose.ts`

**Files:**
- Create: `lib/social/compose.ts`
- Create: `lib/social/testimonios.ts` (biblioteca: Federico/Pablo/Claudia + su crop rect)

**Interfaces:**
- Consumes: kit (Task 2).
- Produces: `composeSlide(slide: SlideSpec, sceneDataUri?: string): Promise<Buffer>` — mapea `layout`+`accent`+`copy` a los helpers del kit y devuelve el PNG 1080×1350. `cropTestimonial(key): Promise<string>`.

- [ ] **5.1** `compose.ts`: switch por `layout` (cinematic/split/infographic/testimonial) que arma el `El` con el copy del slide + la escena (si hay) usando el kit. Reusar exactamente los layouts de los 3 carruseles de Fase 0.
- [ ] **5.2** `testimonios.ts`: mapa de los 3 testimonios reales (foto en `lib/social/assets/` o Storage, quote, nombre, crop rect) + `cropTestimonial`.
- [ ] **5.3** Verificar: extender `smoke-render.ts` para componer un slide de cada layout. Ver los 4 PNG.
- [ ] **5.4** Commit.

### Task 6: Orquestación de generación `lib/social/generate.ts`

**Files:**
- Create: `lib/social/generate.ts`
- Create: `lib/social/storage.ts` (subir PNG a Storage + signed URL)

**Interfaces:**
- Consumes: narrative, openai, compose, storage.
- Produces: `processNextSlide(carouselId): Promise<{done: boolean, progress: number}>` — procesa **1 slide pendiente** (genera imagen si aplica → compone → sube a Storage → update fila) y devuelve si quedan más. `uploadSlidePng(carouselId, n, buf): Promise<string>`.

- [ ] **6.1** `storage.ts`: `uploadSlidePng` sube a `social-carousels/{id}/slide-{n}.png` (bucket privado) y devuelve la ruta; `signedUrl(path)` para servir.
- [ ] **6.2** `generate.ts` `processNextSlide`: lee la 1ra fila `social_carousel_slides` con `status='pending'`, genera imagen según `image_kind` (concept→generateBackground / diego→generateScene / testimonial→cropTestimonial / none→null), `composeSlide`, sube, `status='composed'`, actualiza `progress_percent`. Si no quedan pendientes → `social_carousels.status='ready'`.
- [ ] **6.3** Verificar: `scripts/social/smoke-generate.ts` inserta un carrusel+slides desde un guion y llama `processNextSlide` en loop hasta `ready`. Ver los PNG desde Storage (signed URL) / bajar y Read.
- [ ] **6.4** Commit.

### Task 7: Rutas API

**Files:**
- Create: `app/api/social/carousels/route.ts` (POST crea+guion+slides; GET lista)
- Create: `app/api/social/carousels/[id]/route.ts` (GET status + **procesa próximo slide pendiente** + slides; con `maxDuration=60`)
- Create: `app/api/social/carousels/[id]/slides/[n]/route.ts` (PATCH: editar copy → re-compose; o `regenerate:true` → nueva imagen)
- Create: `app/api/social/carousels/[id]/export/route.ts` (POST → ZIP)

**Interfaces:**
- Consumes: narrative (`generateScript`), generate (`processNextSlide`), compose, storage. `requireAuth` + rol.

- [ ] **7.1** `POST /carousels`: `requireAuth`; valida config; `generateScript`; inserta `social_carousels` (status `generating_images`) + N `social_carousel_slides` (`pending`) con el copy/roles/prompts del guion; devuelve `{id}`.
- [ ] **7.2** `GET /carousels/[id]`: `requireAuth`; si `status='generating_images'`, llama `processNextSlide` UNA vez (continuación del lado del cliente); devuelve `{status, progress, slides:[{position, storage_url→signedUrl, copy}]}`. `export const maxDuration = 60`.
- [ ] **7.3** `PATCH /slides/[n]`: editar `copy` → `composeSlide` sobre la escena cacheada (`image_storage_url`) → nuevo `storage_url` (sin gastar imagen). `regenerate:true` → nueva imagen gpt-image-2 → recompone.
- [ ] **7.4** `POST /export`: arma ZIP de los PNG (bajados de Storage) + `caption.txt`. Devuelve el ZIP.
- [ ] **7.5** Verificar cada ruta con `curl`/script autenticado. Confirmar la continuación: pollear `GET /[id]` y ver el progreso avanzar 1 slide por llamada hasta `ready`.
- [ ] **7.6** Commit.

### Task 8: UI de la sección

**Files:**
- Create: `app/(dashboard)/redes-sociales/page.tsx` (lista)
- Create: `app/(dashboard)/redes-sociales/nuevo/page.tsx` (config form)
- Create: `app/(dashboard)/redes-sociales/[id]/page.tsx` (preview + edición + export)
- Create: `components/social/*` (CarouselCard, ConfigForm, SlideEditor, ProgressView)
- Modify: `app/(dashboard)/DashboardNav.tsx` (entrada "Redes Sociales", role-gated, abogado oculto)

- [ ] **8.1** Config form (estructura/tema/largo/CTA/Diego) → `POST /carousels` → redirect a `[id]`.
- [ ] **8.2** `[id]`: polling a `GET /[id]` cada 3s mientras `generating_images`; muestra los slides que van apareciendo (ProgressView). Al `ready`, muestra el carrusel completo.
- [ ] **8.3** SlideEditor: editar copy (PATCH), botón "regenerar imagen" (PATCH regenerate), reordenar/quitar. Botón "Exportar ZIP".
- [ ] **8.4** Nav entry role-gated (seguir el patrón existente de ocultar secciones al abogado).
- [ ] **8.5** Verificar en el navegador (correr la app): generar un carrusel real de largo variable, ver el progreso, editar un copy, regenerar un slide, exportar.
- [ ] **8.6** Commit.

### Task 9: QA e2e + deploy

- [ ] **9.1** E2e completo en local: 3 estructuras + Auto, largos 5/8/12, CTA campaña y orgánico, Diego on/off. Confirmar narrativa (gancho, curiosidad, resolución, CTA) + fidelidad de Diego + testimonios reales.
- [ ] **9.2** Confirmar RLS: probar con un usuario abogado (no ve la sección / 403 en las rutas).
- [ ] **9.3** `next build` local pasa (no rompe por el nuevo código).
- [ ] **9.4** Confirmar con el usuario que cargó `OPENAI_API_KEY` (nueva) en Netlify. Migración ya corrida (Task 1).
- [ ] **9.5** Commit + push `origin main` (checkpoint con el usuario antes). Verificar deploy Netlify.
- [ ] **9.6** Actualizar CLAUDE.md + memoria con la sección nueva y sus gotchas.

---

## Self-Review

- **Cobertura del spec:** flujo (§3)→T7/T8; motor narrativo (§4)→T4; generación (§5)→T5/T6; arquitectura/rutas (§6)→T7; datos (§7)→T1; edición/export (§8)→T7/T8; RLS (§9)→T1/T8; reuso kit (§10)→T2/T3/T5; riesgo tiempo función (§11)→continuación cliente en T7.2. Cubierto.
- **Placeholders:** los pasos referencian archivos/patrones existentes concretos (apply-plans-migration-pg.ts, rls_per_role_safe.sql, ad-image-typography-overlay, meta-launch-v2). Verificación real (correr + Read PNG) por la naturaleza visual.
- **Consistencia de tipos:** `CarouselScript`/`SlideSpec` definidos en T4/T5 y consumidos en T6/T7. `processNextSlide` (T6) usado en T7.2. `renderSlide`/`composeSlide` consistentes.
