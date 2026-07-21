# Generador de Carruseles — Sección "Redes Sociales" (Fase 1) — Design Doc

**Fecha:** 2026-07-21
**Estado:** Diseño aprobado. Pendiente: pre-flight de conflictos → plan → implementación.
**Depende de:** Fase 0 (spec `2026-07-20-carruseles-redes-sociales-design.md`) — 3 carruseles de referencia aprobados + `kit.ts`/`runner.ts`.

---

## 1. Contexto y objetivo

Fase 0 dejó 3 carruseles aprobados (Aversión a la pérdida, 3 errores, No es momento) y un motor
en `scripts/carousel/` (`kit.ts` = sistema de diseño, `runner.ts` = generación+render,
`openai-image.ts` = gpt-image-2). Fase 1 lleva eso a una **sección de la plataforma** para que el
equipo genere carruseles solo, a partir de un tema, con la identidad y la metodología ya entrenadas.

**Requisito nuevo del usuario:** carruseles de **largo variable** (más largos cuando hay que explicar
algo), con **gancho muy fuerte** y una narrativa que **mantiene la curiosidad abierta** y **resuelve
recién al final**, ahí el CTA.

**Flujo elegido:** **un paso** — la IA genera el carrusel completo (copy + imágenes) y después se ajusta.

## 2. Alcance

### v1 (en alcance)
- Sección "Redes Sociales" en el dashboard con lista de carruseles + "Nuevo carrusel".
- Configuración: estructura (3 plantillas + Auto), tema (texto), largo (5–12 o Auto), CTA
  (campaña/orgánico), Diego on/off.
- Generación **un paso** async con **progreso slide por slide** (patrón `meta-launch-v2`).
- Edición post-generación: editar copy (re-render instantáneo del texto), regenerar imagen de un slide,
  agregar/quitar/reordenar slides.
- Export: ZIP de PNG en alta + caption/hashtags sugeridos.
- Persistencia y RLS por rol.

### No hacer (v1)
- Publicación directa a Instagram/Meta (se exporta; publicación manual).
- Programación/calendario de posteos.
- Video/reels.
- Edición visual libre tipo Canva (solo los controles acotados de arriba).

## 3. Flujo de usuario (un paso)

1. **`/redes-sociales`** (o `/social`): lista de carruseles (thumbnail = slide 1, título, fecha, estado)
   + botón "Nuevo carrusel".
2. **Configurar** (`/redes-sociales/nuevo`): estructura, tema, largo, CTA, Diego on/off. "Generar".
3. **Job**: `POST /api/social/carousels` crea el registro + arranca la generación. La UI pollea
   `GET /api/social/carousels/[id]` cada 3s y muestra el progreso (slides apareciendo).
4. **Preview + edición**: carrusel completo. Por slide: editar copy (guarda + re-render del PNG de texto,
   rápido), "regenerar imagen" (1 llamada gpt-image-2), reordenar, quitar, agregar slide.
5. **Export**: `POST /api/social/carousels/[id]/export` → ZIP de PNG + `caption.txt`.

## 4. Motor narrativo (el corazón)

**OpenAI texto** (`OPENAI_TEXT_MODEL`, default `gpt-4.1`) con un **system prompt entrenado**:

- **Biblia de marca:** paleta (navy/rojo=pérdida/verde=acción), tono, formato 4:5, Diego solo en
  gancho/cierre, testimonios reales rotulados.
- **Metodología de curiosidad (explícita):** (1) gancho que frena el scroll y **abre un bucle**
  ("¿cómo pasó esto?"); (2) mantener la tensión sin resolver, un paso por slide; (3) **resolver recién
  al final**; (4) CTA único. Reparte la narrativa en **N slides** según el tema y el largo pedido, sin
  soltar la curiosidad.
- **Few-shot:** los 3 carruseles aprobados (copy + rol de cada slide) como ejemplos.

**Salida = JSON estructurado** (validado con schema; el modelo se fuerza a `response_format` JSON):

```jsonc
{
  "title": "…",                 // interno
  "cta_type": "campaña|orgánico",
  "caption": "…", "hashtags": ["…"],
  "slides": [
    {
      "role": "hook|build|reveal|proof|cta",
      "layout": "cinematic|split|infographic|testimonial",
      "eyebrow": "…", "title": "…", "body": "…",
      "accent": "red|green|white",
      "image_kind": "concept|diego|testimonial|none",
      "image_prompt": "…",       // qué representar (para gpt-image-2), si aplica
      "cta_label": "…"           // solo en el slide CTA
    }
  ]
}
```

**Largo variable:** el system prompt recibe `target_length` (o "auto") y estructura los slides.
Regla: siempre 1 gancho + 1 CTA; el medio se expande/contrae según el tema.

## 5. Generación de imágenes (server)

Reusa el patrón del codebase (`lib/marketing/ad-image-generator-v2.ts`,
`ad-image-typography-overlay.ts` ya usan satori/resvg/sharp en el server):

1. Por cada slide con `image_kind`:
   - `concept` → gpt-image-2 text2image (`generateBackground`).
   - `diego` → gpt-image-2 edit con las 2 fotos de referencia (solo gancho/cierre, si Diego on).
   - `testimonial` → recorte de foto real (biblioteca de testimonios).
   - `none` → sin imagen (fondo de marca).
2. **Capa de texto** con satori + resvg (el `kit` portado a server) según `layout`/`accent`.
3. **Composición** con sharp → PNG 1080×1350 → Supabase Storage (bucket `social-carousels/{id}/slide-{n}.png`).
4. Cada slide terminado actualiza `social_carousel_slides.storage_url` → la UI lo muestra (preview progresivo).

**Portar el kit:** mover el sistema de diseño de `scripts/carousel/kit.ts` a **`lib/social/carousel-kit.ts`**
(imports `@/`-style, sin extensiones `.ts`, para que compile en el build de Next). Los scripts de Fase 0
pueden re-exportar de ahí. Fonts woff en `lib/social/fonts/` (o Storage) para satori.

## 6. Arquitectura técnica

- **Job async como `meta-launch-v2`:** `POST /start` crea el job y dispara el procesamiento; `GET /status`
  (polling 3s) devuelve estado + slides listos. Estados: `generating_script` → `generating_images`
  (con `progress`) → `ready` / `failed`. Procesamiento server-side (route con `maxDuration` alto; si un
  carrusel largo excede el límite de la función, trocear por slide y continuar en llamadas siguientes —
  patrón de reanudación).
- **Rutas:**
  - `POST /api/social/carousels` — crea + arranca (body: config).
  - `GET  /api/social/carousels/[id]` — status + slides (polling).
  - `GET  /api/social/carousels` — lista.
  - `PATCH /api/social/carousels/[id]/slides/[n]` — editar copy (re-render) o `regenerate:true` (nueva imagen).
  - `POST /api/social/carousels/[id]/slides` / `DELETE …/[n]` / reorder — agregar/quitar/reordenar.
  - `POST /api/social/carousels/[id]/export` — ZIP.
- **Auth/RLS:** `requireAuth` + rol; abogado NO ve esta sección (como Marketing).
- **Env:** `OPENAI_API_KEY` (Netlify + `.env.local`), `OPENAI_TEXT_MODEL`, `OPENAI_IMAGE_MODEL=gpt-image-2`.

## 7. Modelo de datos

Migración `supabase/migrations/2026072x_social_carousels.sql`:

```sql
create table social_carousels (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references profiles(id) on delete set null,
  title text,
  topic text not null,
  structure text not null,            -- aversion|errores|momento|auto
  target_length int,                  -- null = auto
  cta_type text not null default 'campaña',
  diego_enabled boolean not null default true,
  status text not null default 'generating_script',  -- generating_script|generating_images|ready|failed
  progress_percent int default 0,
  script jsonb,                       -- guion completo (§4)
  caption text, hashtags text[],
  error_message text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table social_carousel_slides (
  id uuid primary key default gen_random_uuid(),
  carousel_id uuid not null references social_carousels(id) on delete cascade,
  position int not null,
  role text, layout text, accent text,
  copy jsonb,                         -- {eyebrow,title,body,cta_label}
  image_kind text, image_prompt text,
  storage_url text,                   -- PNG compuesto
  image_storage_url text,             -- escena cruda (para re-render sin re-generar)
  status text default 'pending',      -- pending|image_done|composed|failed
  created_at timestamptz default now()
);
-- RLS: SELECT/INSERT/UPDATE/DELETE por rol (admin/dueno/coordinador/asesor); abogado no.
-- UNIQUE(carousel_id, position).
```

Storage bucket `social-carousels` (privado; servir vía signed URL o proxy autenticado).

## 8. Edición y export

- **Editar copy:** `PATCH slides/[n]` con `copy` → re-render de la capa de texto sobre `image_storage_url`
  cacheada (sin re-generar la imagen) → nuevo `storage_url`. Rápido y gratis.
- **Regenerar imagen:** `PATCH slides/[n]` con `regenerate:true` (+ opcional `image_prompt` editado) →
  1 gpt-image-2 → recompone. Cuesta 1 imagen.
- **Reordenar/quitar/agregar:** actualiza `position`; agregar slide = generar 1 nuevo.
- **Export:** ZIP con `slide-1.png … slide-N.png` + `caption.txt` (caption + hashtags).

## 9. Seguridad y cumplimiento

- Key OpenAI solo en env (nunca en código). Rotación pendiente del usuario (2026-07-21).
- Testimonios: la biblioteca usa solo los reales de las landings, rotulados "testimonio real". El motor
  NO inventa clientes nombrados.
- Imagen de Diego: uso autorizado (marca). Bloque `FACIAL_LOCK` en los prompts.
- Storage privado + signed URLs; RLS por rol.

## 10. Reuso del kit de Fase 0

- `lib/social/carousel-kit.ts` = `C`, `eyebrow/footer/paginator`, `darkBase/lightBase/splitSlide/
  cinematicBase`, `svgIcon/stars/ICON/leakCard`, `h`, `renderSlide`. Server-safe (sin `.ts` en imports).
- `lib/social/openai.ts` = `generateBackground`, `generateScene`, `buildScenePrompt`, `FACIAL_LOCK`.
- `lib/social/narrative.ts` = system prompt entrenado + few-shot + llamada de texto + validación JSON.
- Los scripts de `scripts/carousel/` se dejan como están (referencia) o se apuntan al lib.

## 11. Riesgos y gotchas

- **Build de Next + imports `.ts`:** los scripts de Fase 0 importan con extensión `.ts` (ok para tsx, NO
  para el build de Next). El código de `lib/social/` DEBE usar imports sin extensión. Verificar que
  `next build` no typechequee/rompa por los scripts (excluir `scripts/**` del build o `.ts` extensions).
- **Límite de tiempo de la función:** un carrusel largo (10+ imágenes × ~40s) puede exceder `maxDuration`.
  Mitigación: procesar por slide con reanudación (el job continúa en el próximo tick/llamada), como los
  previews progresivos de Meta.
- **satori:** solo flexbox, sin grid; el kit ya está armado con flexbox. Vectoriza texto a paths.
- **Costo gpt-image-2:** ~USD 0.15–0.19/imagen. Un carrusel de 7 ≈ USD 1–1.4. Regenerar = 1 imagen.
- **Fuentes en server:** satori necesita las woff locales; bundlearlas en `lib/social/fonts/`.
- **input_fidelity** NO va en gpt-image-2 (solo gpt-image-1).

## 12. Fases de implementación

1. **Datos + kit server:** migración (tablas + RLS + bucket) + portar kit a `lib/social/`.
2. **Motor:** `narrative.ts` (guion) + generación de imágenes server + composición + Storage.
3. **Job + rutas:** start/status/patch/export con polling.
4. **UI:** sección + config + preview con progreso + edición + export.
5. **QA e2e** real (generar un carrusel de largo variable, editar, regenerar, exportar).

## 13. Criterios de aceptación

- [ ] Generar un carrusel de largo variable (p. ej. 8 slides) desde un tema, con gancho fuerte + curiosidad
      + CTA al final, en la voz de marca.
- [ ] Progreso slide por slide durante la generación.
- [ ] Editar copy re-renderiza sin gastar imagen; regenerar imagen cuesta 1 gpt-image-2.
- [ ] Diego fiel (gpt-image-2) solo en gancho/cierre cuando Diego on.
- [ ] Export ZIP con PNG en alta + caption.
- [ ] RLS por rol; abogado no ve la sección.
- [ ] `next build` no se rompe por el nuevo código.
