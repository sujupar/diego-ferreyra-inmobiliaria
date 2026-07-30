# Plan de Implementación Unificado — Landing Pages Premium + Reestructuración Campaña Meta
**Diego Ferreyra Inmobiliaria · Síntesis de 5 documentos de diseño · 2026-07-09**
Stack: Next.js 16.0.10 / React 19 / TS5 / Supabase / Netlify · Tailwind 4 + shadcn (new-york) · @dnd-kit + framer-motion (instalados)

---

## Resumen ejecutivo

**Estado actual.** La landing pública (`app/p/[slug]/page.tsx`) es 100% *prop-driven*: lee columnas de `properties` y las pinta en 8 secciones planas de igual peso. No existe tabla de landing, ni schema, ni UI para editarla, ni avatar con mapa de empatía, ni base de UTMs. Resultado: la landing "parece portal" (informa, no convierte) y hay bugs concretos ya identificados — `funnelType="otro"` hardcodeado (page.tsx:86), el `CHECK` de `funnel_type` no admite valores de propiedad, `video_file_url` no se renderiza, y la vista `vw_landing_conversion_daily` cruza contra `deals` cuando los leads de propiedad viven en `property_leads` (loop de conversión roto).

**El gap central.** *No hay forma de crear una landing desde la UI, y la campaña Meta la necesita publicada como precondición.* Hoy el wizard de Meta (`start/route.ts:66-71`) corta con 412 chequeando `public_slug` — pero el slug se asigna solo al publicar en portal, así que el gate es falso: mide la cosa equivocada. Además el builder arma las UTMs a mano (`meta-campaign-builder.ts:395-409`) y el bug de presupuesto (`confirm/route.ts:272-278` **no pasa `dailyBudgetArs`** → se ignora el budget elegido) es un riesgo de plata real ("un cero de más nos deja en la quiebra"). Sin una landing como entidad de primera clase, todo esto queda desconectado.

**Estrategia en dos fases.** La landing pasa a ser **entidad propia 1:1 con la propiedad** (`property_landings`), con el diseño como **dato** (`content` JSONB de bloques interpretados por un registry), avatar compartido (`property_avatars`), y una **base UTM materializada al publicar** que el builder de Meta *lee* en vez de hardcodear. Eso convierte a la landing en la precondición dura y natural de la campaña.

- **Fase 1 — Landing:** modelo de datos + render schema-driven + templates de alta conversión + editor drag-and-drop + avatar con mapa de empatía + base UTM + fix de tracking. El slug (`properties.public_slug`) sigue siendo la única fuente del enlace: **el link no cambia jamás aunque cambie el diseño o el template**.
- **Fase 2 — Campaña:** gate real (landing publicada) + reúso del avatar de la landing + resumabilidad paso-a-paso del wizard + swap Gemini→gpt-image-2 + **blindaje de presupuesto**.

**Principio de ejecución:** no construir el editor premium primero. El camino crítico para desbloquear valor es delgado — **migración base → render + template default → publish mínimo → gate** — y habilita la campaña sin el editor. La capa premium (editor DnD, motion cinematográfico, 4 templates) se agrega encima sin bloquear.

---

## Decisiones que el usuario debe confirmar antes de implementar

| # | Decisión | Recomendación del equipo | Tradeoff (2 líneas) |
|---|---|---|---|
| **D1** | **Editor: build vs buy** (Puck vs custom @dnd-kit). Los 3 docs discrepan: 2 votan custom, 1 vota Puck-con-spike. | **Custom @dnd-kit por secciones**, con un **spike de Puck de 2 días como gate opcional** antes de construir el shell. Todo lo previo (schema, registry, bloques, templates, renderer) es **agnóstico de la librería**, así que la decisión se difiere sin costo. | Puck ahorra ~3 semanas del shell (DnD/undo/panel), pero suma dependencia joven sobre React19/Next16 y su valor real (layout libre) sobra en un **catálogo cerrado de bloques premium**. Custom = control total y coherencia de conversión, a costa de esas 3 semanas. |
| **D2** | **¿"Alto Valor" es una landing propia o un tratamiento?** | **No es un sistema aparte.** Es `funnel_type='alto_valor'` (propiedad ≥ USD 400k) que auto-sugiere el template `cinematic-estate` + imágenes `quality='high'`. Misma infraestructura, distinto tratamiento y prefijo UTM (`altovalor_`). | Unificar reduce superficie y reusa todo el motor. Si el negocio necesita un flujo HNWI realmente distinto (campos legales, formularios, compliance), se bifurca después — no ahora. |
| **D3** | **¿Reducir de 27 a 12 piezas** en la campaña? | **Sí, 12** (3 fotos × 2 estilos × 2 formatos: `feed_square` + `feed_vertical`). El `confirm` solo consume `feed_square`, hasta 10 — las 18 verticales/story de hoy **nunca se usan** para los Ads. | −55% de costo (~$1.20 → ~$0.55/campaña) y permite subir `quality` sin culpa. Se pierden piezas story/vertical para orgánico, que se generan on-demand con el mismo motor si hacen falta. |
| **D4** | **Quality tier de gpt-image-2.** | **`medium` por defecto, `high` solo para propiedades ≥ USD 600k.** Override por env `OPENAI_IMAGE_QUALITY`. | `high` (~$0.17/img) cuadruplica el costo; `medium` (~$0.04) es el sweet spot. Con 12 piezas el gasto queda acotado incluso en `high` para el segmento premium. |
| **D5** | **Cantidad de templates en v1.** | **Arrancar con 2** (`editorial-directo` default + `cinematic-estate`) y sumar `warm-family` + `lifestyle-video` en la capa premium (E1.7). | Menos superficie inicial: valida el motor de templates end-to-end antes de invertir en 4 diseños premium con motion. El schema soporta N desde el día 1. |
| **D6** | **Avatar: tabla propia vs JSONB embebido.** | **Tabla `property_avatars`** (fuente compartida, con lineage `parent_avatar_id`), + copia del objeto final efectivo a `meta_launch_jobs.optimized_avatar` para **no tocar el runner de imágenes**. | +1 tabla y un JOIN, a cambio de un seam limpio landing↔campaña sin duplicar la persona (el asesor la ajusta en campaña sin pisar la de la landing). Embeber jsonb ahorra DDL pero reintroduce la duplicación que hoy tiene el wizard. |

> **Decisiones ya tomadas en el plan (no requieren confirmación, documentadas por si se quieren vetar):** media en bloques por **índices a `properties.photos` resueltos en render** (no URLs snapshot) — nunca queda stale y cero superficie de inyección, alineado a la lección de permutación de fotos del CLAUDE.md. Motor de avatar/copy: **DeepSeek `deepseek-chat` con `jsonMode` por defecto → escalar a `gpt-4.1` una sola vez si falla la validación de esquema**. Motor de imagen: **`generateScene` (`/edits`) con la foto real como referencia**, no text2image (fidelidad al inmueble para captación). Gate HTTP: **409 + `code:'LANDING_REQUIRED'`** (el front rutea por `code`, no por status).

---

## Arquitectura de datos unificada (reconciliación de los 5 docs)

Los 5 docs proponen `property_landings` con nombres/columnas divergentes. Esquema canónico consolidado (una sola migración de Fase 1):

**`property_landings`** (1:1 con propiedad, `property_id UNIQUE`)
- `id`, `property_id`, `status text CHECK IN ('draft','published','archived')` — **el gate de Fase 2 exige `'published'`**. Las micro-etapas de co-creación NO van acá (anti-patrón `pending` del worker): viven en `wizard_state`.
- `template_id text` (preset de origen; no afecta slug ni UTMs)
- `content jsonb` — el `LandingDocument` completo (bloques + theme). **La verdad del diseño.** Validado con Zod.
- `avatar_id uuid → property_avatars(id)` (el avatar activo de la landing)
- `wizard_state jsonb` — `{step, questions, answers, ...}` de la co-creación (resume = leer el row)
- `ai_analysis jsonb` — strengths/weaknesses de Vision (observabilidad)
- `funnel_type text CHECK IN ('venta_propiedad','alto_valor')` — **congelado al crear**
- `utm_base jsonb` — `{utm_source:'meta', utm_medium:'paid_social', utm_campaign, base_url}` — **materializado al publicar, congelado**
- `public_slug text` (espejo denormalizado; fuente = `properties.public_slug`), `published_at`, `published_slug`, `created_by`, `created_at`, `updated_at`

**`property_avatars`** (compartida landing↔campaña) — `id`, `property_id`, `parent_avatar_id` (lineage), `source CHECK IN ('landing','campaign','system','manual')`, `label`, `avatar jsonb` (EmpathyAvatar: `says/thinks/feels/does` + `pains/gains` + `headlineAngles` + campos compat de `BuyerAvatar`), `is_primary bool` (índice parcial único por propiedad), `model_used`, `created_by`, timestamps.

**`property_landing_revisions`** (append-only, undo/cambio de template) — `landing_id`, `revision int`, `template_id`, `content`, `avatar_id`, `reason`, `created_by`, `created_at`, `UNIQUE(landing_id, revision)`. Se escribe en cada publish y cambio de template (no en cada keystroke).

**Reglas de oro que gobiernan todo el diseño:**
1. `properties.public_slug` = única fuente del enlace. Cambiar template/`content` no lo toca.
2. El **contenido es dato**, no código: los templates son *funciones que producen `content`*, no páginas hardcodeadas.
3. `content` guarda **índices/referencias** a `properties.photos`/`video_file_url`/`tour_3d_url`, resueltos en render (nunca stale, sin inyección).
4. RLS granular por rol (patrón `20260505000001`): admin/dueño/coordinador/asesor RW; **abogado sin acceso**. Lectura pública de `/p/[slug]` vía admin client (service role), como `getPropertyBySlug` hoy.

---

## Migraciones SQL nuevas

| Migración | Qué hace | Cuándo correrla (Dashboard SQL Editor — CLI no conecta) |
|---|---|---|
| `20260709000001_property_landings.sql` | `property_avatars` + `property_landings` + `property_landing_revisions` + triggers `updated_at` + RLS por rol. Idempotente. | **Antes** de deployar E1.3+. La lectura en `/p/[slug]` es best-effort (`landing?.` + fallback legacy) para tolerar la ventana. |
| `20260709000002_funnel_type_property.sql` | `DROP`+`ADD` del `CHECK` de `funnel_type` en `landing_page_visits` → `('clase_gratuita','tasacion','venta_propiedad','alto_valor','otro')`. | **Antes** de deployar E1.2 (track-visit escribe los valores nuevos; sin la migración, viola el CHECK). |
| `20260709000003_property_leads_attribution.sql` | Columnas `funnel_type`/`utm_*`/`fb_*` en `property_leads` (nullable, `IF NOT EXISTS`) + índices + reescritura de `vw_landing_conversion_daily` (une visitas contra `deals` **y** `property_leads` según funnel). | **Antes** de deployar E1.9. Cero backfill destructivo; filas viejas quedan `funnel_type=NULL` y la vista las excluye del cruce de propiedad. |
| `20260709000004_meta_launch_phase2.sql` | `meta_launch_jobs`: `wizard_step`, `avatar_source`, `avatar_ref uuid → property_avatars(id) ON DELETE SET NULL` + backfill defensivo (`wizard_step='avatar_select'` para jobs vivos). | **Antes** de deployar E2.2 (save-input escribe `wizard_step`; sin la columna el PATCH falla). Sin cambio de return type ni triggers → no requiere `DROP FUNCTION`. |

> **Gate obligatorio (lección `neighborhood_slug` del CLAUDE.md):** correr cada migración en el Dashboard **antes** del deploy del código que la lee/escribe. Las lecturas son defensivas donde toque la ventana de despliegue.

---

## FASE 1 — LANDING

### E1.0 · Fix `funnel_type` + tracking correcto *(glue, sin dependencias, valor inmediato)*
**Archivos:** `supabase/migrations/20260709000002_funnel_type_property.sql`; `app/api/landing/track-visit/route.ts:25` (`ALLOWED_FUNNELS` extendido); `lib/landing/funnel-type.ts` (**nuevo**, `deriveFunnelType(property, usdToArs)`, umbral `ALTO_VALOR_USD=400_000`); `app/p/[slug]/page.tsx:86` (reemplaza `funnelType="otro"` por el derivado).
**Migración:** `20260709000002`. **Depende de:** nada (la derivación funciona con fallback `deriveFunnelType(property)` aunque no exista fila de landing).
**Hecho:**
- [ ] Una visita a `/p/[slug]` registra `funnel_type` correcto (`venta_propiedad` / `alto_valor`) en `landing_page_visits`, verificado con SELECT.
- [ ] Derivación **server-side** desde la propiedad/landing, nunca desde la URL (spoofeable + visitas directas no traen UTM).
- [ ] Histórico `'otro'` **no** se reclasifica (series intactas).

### E1.1 · Migración base + entidades *(cimiento de todo)*
**Archivos:** `supabase/migrations/20260709000001_property_landings.sql`.
**Depende de:** nada. **Hecho:**
- [ ] Las 3 tablas existen; triggers `updated_at` activos; RLS por rol funcionando (INSERT/SELECT desde un rol autenticado OK; **abogado bloqueado**).
- [ ] Índice parcial único `is_primary` por propiedad verificado (no permite 2 primarios).
- [ ] `ajustar public.current_role()` al helper real de `20260505000001`.

### E1.2 · Schema + registry + renderer + fallback legacy
**Archivos (nuevos):** `lib/landing/schema.ts` (Zod `LandingDocument`: `blocks[]` discriminated union por `type` + `theme` + `superRefine` con invariantes de conversión); `lib/landing/registry.tsx` (`Record<type, BlockDef>`, cada bloque **un** `Render` que ramifica por `ctx.mode: 'edit'|'public'`); `lib/landing/get-landing.ts`; `lib/landing/legacy-fallback.ts` (`legacyFallbackConfig(property)`); `components/landing/blocks/*`; `components/landing/LandingRenderer.tsx`; `components/landing/LandingVideoFile.tsx` (**renderiza `video_file_url` — bug documentado**).
**Archivos (reescritos):** `app/p/[slug]/page.tsx` — interpreta `content.blocks`; si no hay fila de landing publicada → `LegacyLanding` (cero landings rotas el día del deploy).
**Depende de:** E1.1. **Hecho:**
- [ ] Una fila de landing hecha a mano renderiza en `/p/[slug]`; una propiedad **sin** fila renderiza por fallback legacy idéntico al actual.
- [ ] `video_file_url` se ve (`<video controls playsInline poster preload="none">`).
- [ ] Datos duros resueltos de `property` en render (precio/m²/fotos por índice); índices fuera de rango degradan sin romper.
- [ ] **Verificación real en navegador** (no solo build) por la clase de crash de reconciler/hydration que tsc no detecta.

### E1.3 · Templates (código) + builder + preview
**Archivos:** `lib/landing/templates/{types,index}.ts` + presets `editorial-directo.ts` (default), `cinematic-estate.ts` (D5: estos 2 primero). Cada template = manifiesto + `build(ctx) → LandingDocument` con `requiresVideo`/`supportsVideo`; condiciona el bloque de video (`video_file` → `video_embed` → omite). Endpoint `GET app/api/properties/[id]/landing/preview?template=<id>` (render en memoria, no persiste).
**Depende de:** E1.2. **Hecho:**
- [ ] Cada template renderiza la **propiedad real** en preview; propiedades CON y SIN video funcionan (degradación limpia, nunca embed roto).
- [ ] Elegir template persiste `content` + `template_id` + escribe revisión; **el slug no se toca**.

### E1.4 · Co-creación + avatar con mapa de empatía + UTM base + publish *(desbloqueo del gate)*
**Archivos (nuevos):** `lib/marketing/empathy-avatar.ts` (interfaz `EmpathyAvatar`, superset de `BuyerAvatar`); `lib/marketing/empathy-avatar-generator.ts` (`generateEmpathyAvatar` + `generateThreeEmpathyAvatars`; DeepSeek→gpt-4.1 con guard de esquema); `lib/landing/questions-generator.ts` (3-5 preguntas, `jsonMode`, fallback determinístico); `lib/landing/utm.ts` (`buildUtmBase(funnelType, slug)`, `buildLandingUrl(appUrl, slug, base, {mode})`). Endpoints bajo `app/api/properties/[id]/landing/`: `start`, `route[GET/PATCH]`, `answers`, `avatar/refine`, `templates`, `template`, `publish`, `unpublish`.
**Archivos (tocados):** `app/(dashboard)/properties/[id]/page.tsx` — sección "Landing Page" (oculta para abogado). `lib/landing/assign-slug.ts` (`ensurePublicSlug`) — **tercer punto de asignación** al publicar.
**Máquina de estados:** `draft` (co-creación en `wizard_state.step`: `intro→questions→avatar_review→template→editor→preview→publish`) → `published` → `archived`. Resume = leer el row.
**`publish`:** (1) valida invariante "1 `lead_form`" + ≥1 CTA + título/OG; (2) `ensurePublicSlug`; (3) `utm_base = buildUtmBase(funnel_type, slug)`; (4) `status='published'`; (5) revisión. **Idempotente.**
**Depende de:** E1.1, E1.2, E1.3. **Hecho:**
- [ ] E2E: crear → responder preguntas → avatar con mapa de empatía (persistido en `property_avatars.is_primary`) → elegir template → publicar → `/p/<slug>` sirve la landing.
- [ ] Publicar materializa `utm_base` y congela `slug`/`funnel_type`; el CTA único apunta al `lead_form` (scroll, no URL externa).
- [ ] `POST /api/leads` del form dispara CAPI con `eventId` consistente (sin cambios de pipeline).

> **Hito de desbloqueo:** al terminar E1.4 ya existe una landing publicable con slug + `utm_base` + `funnel_type` congelados. **La Fase 2 (gate) queda habilitada** aunque el editor premium (E1.6) y el motion (E1.7) todavía no existan.

### E1.5 · Cierre del loop de atribución (visita→lead→campaña)
**Archivos:** `supabase/migrations/20260709000003_property_leads_attribution.sql`; `app/api/leads/route.ts` (POST público persiste `funnel_type` [server-side desde `property_landings`] + `utm_*` + `fb_*`); reescritura de `vw_landing_conversion_daily`.
**Depende de:** E1.1, E1.4 (para resolver `funnel_type`). **Hecho:**
- [ ] Un lead de `/p/[slug]` escribe `funnel_type` + `utm_*` + `fb_*`; la vista muestra conversión real para `venta_propiedad`/`alto_valor` (antes daba 0/NULL).
- [ ] Filas viejas de `property_leads` (`funnel_type=NULL`) excluidas del cruce, sin backfill destructivo.

### E1.6 · Editor drag-and-drop (desktop + mobile) + linter de conversión
**Archivos:** `components/landing/editor/*` (shell: paleta · canvas `SortableContext` @dnd-kit · inspector schema-driven), `app/(dashboard)/properties/[id]/landing/page.tsx`, `lib/landing/conversion-linter.ts`. Autosave debounced (600-800ms) → `PATCH .../landing { content }` con `status` intacto en `'draft'` (**nunca `pending`**). Undo/redo (`useReducer` past/present/future). Toggle Desktop/Mobile con `@container` queries. Publish deshabilitado hasta que el linter pase.
**Decisión de librería (D1):** antes de construir el shell, **spike Puck de 2 días** (instala limpio en React19.2; `<Puck>` con 2 bloques reales; `<Render>` hidrata sin crash de reconciler en navegador; framer-motion anima OK). Si falla no-resoluble → custom @dnd-kit, **mismo schema/registry**. Bias por defecto: custom.
**Depende de:** E1.2, E1.4. **Hecho:**
- [ ] Asesor agrega/quita/reordena bloques, edita props, alterna Desktop/Mobile, autosave con "Guardado ✓"; bloques `locked` (`lead_form`) no borrables.
- [ ] Linter valida los 6 invariantes (1 oferta/CTA dominante, headline ≠ descripción cruda, form ≤3 campos o multi-step, ProofBar con CUCICBA, cero links de salida, LCP con priority); Publicar bloqueado si falla.
- [ ] Cambiar de template pisa con confirmación (sin merge); verificación en navegador.

### E1.7 · Capa premium: motion + design system derivado + 2 templates extra
**Archivos:** instalar `gsap` + `lenis`; `components/landing/blocks/*` (variantes premium: `HeroVideoFull`/`HeroCinematic`/`HeroSplit`, `ProofBar`, `StorySection`, `GallerySequenceScroll` [image-sequence pinned = "video sintético" sin video], `ValueStack`, `StickyCTA`); `lib/landing/motion/useMotionAllowed.ts`; `lib/landing/palette.ts` (extracción con `node-vibrant`, cacheada en `content.theme`, contraste AA garantizado en el CTA); `next/font` pairings; templates `warm-family.ts` + `lifestyle-video.ts`.
**Depende de:** E1.2, E1.3 (se agrega progresivamente por bloque). **Hecho:**
- [ ] Lighthouse sobre una landing publicada real: **LCP < 2.5s, INP < 200ms, CLS < 0.1**; `prefers-reduced-motion` y `theme.motion='off'` desactivan parallax/image-sequence.
- [ ] Marca invariante presente (logo, CUCICBA 8266, foto+nombre del asesor `assigned_to`); GSAP/Lenis cargan `dynamic({ssr:false})` sin bloquear first paint.
- [ ] Skills de apoyo: `frontend-design` al construir bloques; `webquality-core-web-vitals` / `cognymkt-cwv-audit` para verificar.

---

## FASE 2 — CAMPAÑA

### E2.0 · Blindaje de presupuesto *(CRÍTICO — independiente, hacer temprano)*
**El bug (confirmado):** el builder ya soporta el override (`meta-campaign-builder.ts:417`) con **una sola** conversión `×100` en `:664`, pero `confirm/route.ts:272-278` arma `overrides` **sin `dailyBudgetArs`** → el budget del wizard se ignora.
**Archivos:** `confirm/route.ts:272-278` (cablear + validar rango + assert dryRun), `save-input/route.ts:77-79` (validar rango), `components/properties/wizards/MetaAdsWizardV2.tsx` (UI confirmación + presets/slider acotado). Env: `META_MIN_DAILY_ARS` (def 3.000), `META_MAX_DAILY_ARS` (def 60.000).
**Defensa en capas:**
- **A** — `confirm`: `overrides.dailyBudgetArs = rawBudget` (entero ARS, **sin `×100`**). Validar `Number.isInteger && MIN ≤ v ≤ MAX` → si no, `markJobFailed` + 400 `BUDGET_OUT_OF_RANGE`.
- **B** — `save-input`: mismo rango (hoy solo `Math.floor(≥0)`).
- **C** — UI: "Vas a gastar **$X/día ≈ $Y/mes**" con `Intl.NumberFormat('es-AR')`; checkbox obligatorio si ≥ 30.000; botón disabled fuera de rango.
- **D** — input imposible de "cero de más": presets (5k/10k/15k/25k) + slider con `max` duro (no un `<input number>` pegable).
- **E** — assert en dryRun: si `campaign.budgetDailyArs !== rawBudget` → abortar antes de crear en vivo.
**Regla de oro (documentar en código):** `daily_budget_ars` viaja como **entero ARS** en toda la app; el `×100` ocurre **exactamente una vez** en `:664`. Test en CI: `grep -rn '\* 100' lib/marketing | wc -l` == 1.
**Depende de:** nada. **Hecho:**
- [ ] Setear 10000 en el wizard → dryRun devuelve `1_000_000` → AdSet real con `daily_budget:1000000`.
- [ ] `50_000` (sobre MAX) y `null`/`0` → 400, **no** llama al builder.
- [ ] Test E2E real de creación de Campaign (regla CLAUDE.md), no solo unit.

### E2.1 · Landing gate (412→409) + step 0 del wizard
**Archivos:** `start/route.ts:66-71` (chequea `property_landings.status='published'` + `public_slug`; 409 + `code:'LANDING_REQUIRED'` + `redirectTo`); `app/(dashboard)/properties/[id]/marketing/meta-ads/page.tsx` (SELECT landing → props `hasPublishedLanding`, `landingAvatar`); `MetaAdsWizardV2.tsx` (step `landing_gate` como step 0; CTA "Crear la landing" → `/properties/[id]/marketing/landing?next=meta-ads`).
**Depende de:** E1.1, **E1.4** (una landing debe poder publicarse; el gate es inútil antes). **Hecho:**
- [ ] Propiedad sin landing publicada → wizard muestra "Creá primero la Landing"; con landing → arranca en `confirm_data`.
- [ ] Mantener el guard de `public_slug` en el builder (`:325`) como defensa; la **fuente de verdad** del gate es `status='published'`.

### E2.2 · Resumabilidad paso-a-paso (`wizard_step`)
**El gap:** `avatar_select`/`photo_stars`/`geo`/`budget` viven todos bajo `status='awaiting_user_input'`; `pollStatus()` (`MetaAdsWizardV2.tsx:191-192`) siempre resume en `avatar_select` → recargar en `budget` pierde el punto. **La resumabilidad de imágenes SÍ funciona (contar piezas por `launch_job_id`) — no tocarla.**
**Archivos:** `supabase/migrations/20260709000004_meta_launch_phase2.sql` (`wizard_step` + `avatar_source` + `avatar_ref`); `save-input/route.ts` (persistir `wizardStep` validado); `MetaAdsWizardV2.tsx` (`goToStep()` con PATCH fire-and-forget en cada avance **y retroceso**; `pollStatus` resume por `wizard_step`; `hydrateInputsFromJob(job)` re-hidrata `selected_avatar_id`/`starred_photo_indices`/`geo_preset_id`/`daily_budget_ars`/`optimized_avatar`).
**Depende de:** E2.1, migración `20260709000004`. **Hecho:**
- [ ] Recargar durante `budget` resume en `budget` con inputs hidratados (no en `avatar_select`).
- [ ] Ir atrás + recargar vuelve al paso correcto; jobs en `generating`/`awaiting_confirm` ignoran `wizard_step` (status manda la fase macro).

### E2.3 · Reúso del avatar de la landing (3 fuentes)
**Archivos:** `MetaAdsWizardV2.tsx` (`avatar_select` con 3 orígenes: **(1) avatar de la landing, pre-seleccionado** desde `property_avatars`; **(2) ajustarlo** → `optimizeAvatarWithComment` crea hijo `source='campaign'`; **(3) propuestas del sistema** → `generateThreeEmpathyAvatars`); `lib/marketing/buyer-avatar-generator.ts:325` (preservar `empathyMap` en optimize); `start/route.ts` (incluir avatar de landing en la respuesta). Copiar el objeto final efectivo a `meta_launch_jobs.optimized_avatar` + `avatar_ref`/`avatar_source` → **el runner de imágenes (`ad-image-async-runner.ts:273`) no cambia**.
**Depende de:** E1.1/E1.4 (avatares poblados), E2.2 (migración con las columnas). **Hecho:**
- [ ] `avatar_select` preselecciona el avatar de la landing con su mapa de empatía; ajustar crea hijo sin pisar el de la landing; `confirm` lee el avatar correcto vía `optimized_avatar`.

### E2.4 · Builder lee `utm_base` + smoke test en modo preview
**Archivos:** `meta-campaign-builder.ts:395-409` → `buildLandingUrl(getAppUrl(), slug, landing.utm_base, {mode:'meta'})` (agrega `utm_content/utm_term` + **`fb_campaign_id/fb_adset_id/fb_ad_id/fb_placement`** — hoy esas columnas de `landing_page_visits` nunca se llenan); `:800` smoke test → `{mode:'preview'}` (URL limpia, sin placeholders `{{...}}`). `attribution.ts` **no se toca** (ya reconcilia el esquema viejo `fb_ad` y el nuevo `meta`).
**Depende de:** E1.4 (`utm.ts` + `utm_base` poblado), E2.1. **Hecho:**
- [ ] La URL de campaña incluye `utm_*` + `fb_*` macros; el smoke test pega a la preview y valida 200 + hero.
- [ ] Tras servir un ad real, `landing_page_visits.fb_ad_id` queda poblado (atribución por anuncio, antes ciega).
- [ ] Campañas ya montadas (esquema `fb_ad`) intactas — solo las nuevas usan `buildLandingUrl`.

### E2.5 · Swap Gemini → gpt-image-2 + 27→12 piezas + prompts editoriales
**Archivos:** `ad-image-generator.ts:98` (motor interno → `generateScene` de `lib/social/openai.ts`, `/edits` con la foto real como referencia; **misma firma pública** `generateAdImage`, mismo `sharp` de normalización → runner intacto; descargar ref a `/tmp`, limpiar en `finally`); `ad-image-prompts.ts:129` (estructura `ROL/PROPERTY_LOCK/ESTILO/ENCUADRE/LUZ/PALETA/MENSAJE/NEGATIVOS`; **`NEGATIVOS: sin texto/letras`** — el copy se compone determinístico aparte, elimina "Departamenton" por construcción); `ad-image-async-runner.ts:56-85` (`TOTAL_PIECES` 27→12, `pieceCoordsAt` ajustado; **idempotencia por `launch_job_id` sin cambios**); `pickQuality(property)` (medium default, high ≥ USD 600k, override `OPENAI_IMAGE_QUALITY`).
**Depende de:** nada estructural (independiente de la landing). **Hecho:**
- [ ] Una campaña genera 12 piezas vía gpt-image-2, `feed_square` para los Ads, sin texto en la imagen, ~$0.55/campaña.
- [ ] Reanudar una generación interrumpida no regenera piezas ya persistidas (contador por `launch_job_id`).
- [ ] Verificación con API real + creación E2E de Campaign (no solo unit).

---

## Orden de implementación recomendado

Secuencia óptima para desbloquear valor rápido y proteger plata primero. **El editor premium y el swap de imágenes van al final** — son caros y no bloquean.

1. **E2.0 · Blindaje de presupuesto** — *primero y en paralelo a todo.* Es un riesgo de plata **hoy** en el flujo de campaña existente, independiente de la landing. No esperar a la Fase 2 conceptual.
2. **E1.1 · Migración base** (`20260709000001`) — cimiento de la Fase 1.
3. **E1.0 · Fix `funnel_type` + tracking** (`20260709000002`) — barato, corrige métricas del embudo ya.
4. **E1.2 · Schema + registry + renderer + fallback** — el `/p/[slug]` schema-driven, sin romper landings actuales.
5. **E1.3 · Templates (2) + preview** — `editorial-directo` + `cinematic-estate`.
6. **E1.4 · Co-creación + avatar + UTM base + publish** — **← HITO DE DESBLOQUEO.** Acá ya se puede publicar una landing con slug+UTM+funnel congelados.
7. **E2.1 · Landing gate** — la campaña Meta pasa a exigir landing publicada (ya posible).
8. **E2.2 · Resumabilidad** (`20260709000004`) + **E2.3 · Reúso de avatar** + **E2.4 · Builder lee UTM** — cierra el flujo de campaña sobre la landing.
9. **E1.5 · Loop de atribución** (`20260709000003`) — visita→lead→campaña medible.
10. **E2.5 · gpt-image-2 + 12 piezas** — calidad gráfica de la campaña (independiente, encaja cuando convenga).
11. **E1.6 · Editor drag-and-drop** (con spike Puck previo) — la capa cara; hasta acá el asesor publica con templates + edición inline mínima.
12. **E1.7 · Motion premium + design system + 2 templates extra** — el diferenciador Awwwards, incremental por bloque.

**Camino crítico mínimo (MVP que desbloquea Meta):** pasos 1→6→7. Con eso hay landing publicable + gate real + presupuesto blindado, sin editor premium ni motion.

---

## Riesgos

| Riesgo | Severidad | Mitigación |
|---|---|---|
| **★ Presupuesto: "un cero de más nos deja en la quiebra"** | **Crítica** | Defensa en 5 capas (E2.0): cableo correcto, validación de rango en `save-input` **y** `confirm`, UI con confirmación explícita `$X/día ≈ $Y/mes`, input por presets+slider acotado, **assert en dryRun** que aborta si `builder ≠ job`. Invariante `×100` único verificado por grep en CI. Es el entregable #1 del orden. |
| **★ Resumabilidad del wizard** | Alta | `wizard_step` dedicado (no derivar de `current_step`, que el backend pisa con labels de progreso). `hydrateInputsFromJob` re-hidrata inputs desde columnas ya persistidas. La resumabilidad de imágenes (contar por `launch_job_id`) **no se toca**. Backfill defensivo para jobs vivos. |
| Crash de reconciler/hydration en el editor y el render (lección `@react-pdf`) | Alta | **Verificación real solo en navegador** — tsc/build/node-render no lo detectan. Spike Puck×React19/Next16 obligatorio antes del shell (E1.6). Fallback custom con mismo schema si falla. |
| Deploy antes que la migración (lección `neighborhood_slug`) | Alta | Gate por migración en la tabla de arriba; lecturas defensivas (`landing?.` + fallback legacy) en la ventana de despliegue. |
| CWV degradado por motion (GSAP/Lenis/image-sequence) | Media | Presupuesto no negociable LCP<2.5s/INP<200ms/CLS<0.1; `dynamic({ssr:false})` para motion pesado; `useMotionAllowed()` + `prefers-reduced-motion`; Lighthouse sobre landing real antes de declarar hecho. |
| Doble esquema UTM (builder `meta` vs ads vivos `fb_ad`) | Media | **No tocar los ads vivos.** `attribution.ts` ya reconcilia ambos en lectura. Solo campañas nuevas usan `buildLandingUrl`. `buildUtmBase` reconstruye determinísticamente para compat. |
| XSS por `tour_3d_url`/URLs inyectadas en bloques | Media | Media por **índices** resueltos en render (no URLs libres); validación `https://` server-side de `tour_3d_url`; el `content` se valida con Zod en `publish`. |
| Costo de IA a escala | Baja | Avatar DeepSeek→gpt-4.1 condicional (~$0.005-0.02); imágenes 12 piezas medium (~$0.55/campaña); a 50 campañas/mes acotado. |

---

## Recordatorios de proyecto (no negociables)

- **Commits como `Sujupar <redstyle50@gmail.com>`** o el deploy de Netlify falla. Push sin pedir permiso al terminar.
- **Migraciones a mano en el Dashboard SQL Editor** (Supabase CLI no conecta), en el orden de la tabla, **pre-deploy**.
- **Netlify Functions `.mts` no importan `@/`** y **las scheduled functions no disparan** — cualquier tarea periódica de landing/campaña va por **pg_cron**, no `.mts`.
- Antes de escribir código en cada entregable, correr el skill **`anticipating-implementation-conflicts`** (RLS, landing isolation, idempotencia, pg_cron+Vault, dual renderer). Para migraciones, skill **`supabase`**; para bloques, **`frontend-design`**; para CWV, **`webquality-core-web-vitals`**.
- Toda integración Meta se valida con **creación E2E real de Campaign** (no solo unit) — lección repetida del CLAUDE.md.
- Prosa al usuario siempre en español rioplatense.
