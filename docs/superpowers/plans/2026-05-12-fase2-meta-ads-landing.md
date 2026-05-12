# Fase 2 — Meta Ads + Landing por propiedad — Implementation Plan (OUTLINE)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans para implementar este plan task-by-task. Steps usan checkbox (`- [ ]`) syntax.

> **ESTADO: OUTLINE.** Este plan describe la estructura completa de la fase, los milestones y los entregables, pero los tasks de detalle se profundizan **al cerrar Fase 1** incorporando aprendizajes reales (ej. cuál fue la estructura final del adapter, cómo respondió cada portal, qué patrones de UI funcionaron). Ejecutar este plan tal como está sin refinarlo dará un primer corte funcional, pero asumimos que vamos a abrir cada milestone en su PR-de-planificación al arrancarlo.

**Goal:** Cuando una propiedad se publica exitosamente en al menos un portal (output de Fase 1), generar automáticamente: (1) landing page propia en subdominio `[slug].inmodf.com.ar`, (2) campaña Meta Ads programática con targeting/budget inteligente, (3) inbox unificado de leads con permisos por rol.

**Architecture:** Igual filosofía de Fase 1 — trigger SQL + scheduled function worker + adapter (en este caso Meta Marketing API v21.0). Landing es server-rendered Next.js sobre subdomain wildcard. Logic de budget/targeting es rules-based en TypeScript (no LLM). Copy se genera con OpenAI y se cachea.

**Tech Stack:** Next.js 16 (rewrite middleware para wildcard), Meta Marketing API v21.0, OpenAI (solo para copy), Resend (notificación de leads), Supabase, vitest.

**Spec:** `docs/superpowers/specs/2026-05-12-portales-meta-ads-design.md` §7

**Pre-requisito:** Fase 1 completada y mergeada. Al menos MercadoLibre activo en producción.

---

## Milestones de alto nivel

- **M9**: Schema + DNS wildcard + middleware subdomain — fundamentos de landing.
- **M10**: Landing page template SSR (hero, galería, video, tour, lead form).
- **M11**: Pixel Meta + Plausible analytics en landing.
- **M12**: Schema `property_leads` + email notification + endpoints inbox.
- **M13**: Inbox UI + RLS por rol.
- **M14**: Meta Ads adapter (publish, pause, fetch insights).
- **M15**: Rules engine para budget + targeting + creative selection.
- **M16**: OpenAI integration para copy generation (con caché en `properties.ad_copy_variations`).
- **M17**: Worker `provision-landing-and-ads.mts` con trigger SQL desde `property_listings`.
- **M18**: Tab "Marketing" en property detail (combina portal metrics + Meta metrics + landing analytics).
- **M19**: /review final Fase 2 + smoke test end-to-end + docs.

---

# M9 — Subdomain routing + slug

### Task 9.1: Schema — `properties.public_slug`

- Crear migración `20260601000000_property_public_slug.sql` agregando columna `public_slug text UNIQUE` a `properties`, con generación auto via trigger (kebab-case del address + sufijo random de 6 chars).
- RLS open read (es público por diseño — la landing tiene que ser indexable).

### Task 9.2: DNS wildcard + Netlify config

- Configurar registro DNS `*.inmodf.com.ar CNAME` apuntando a Netlify.
- Validar que Netlify emita SSL wildcard automáticamente.
- Documentar en `DEPLOY.md`.

### Task 9.3: Middleware Next.js para subdomain rewrite

- Modificar `middleware.ts` para detectar `host` distinto de `inmodf.com.ar` y `www.inmodf.com.ar` → rewrite a `/p/[slug]/page.tsx` extrayendo el slug del subdominio.

---

# M10 — Landing page SSR

### Task 10.1: Layout y route handler

- Crear `app/p/[slug]/page.tsx` server component que fetchea propiedad por slug (read RLS abierto).
- Si no existe slug o property `status` no publicado → 404.

### Task 10.2: Componentes de landing

- `components/landing/Hero.tsx` — primera foto + título + precio + CTA sticky.
- `components/landing/Gallery.tsx` — swipeable / lightbox.
- `components/landing/VideoEmbed.tsx` — video_url (YouTube/Vimeo/mp4).
- `components/landing/Tour3DEmbed.tsx` — iframe Matterport.
- `components/landing/Features.tsx` — grid de ambientes, m², expensas, amenities.
- `components/landing/LocationMap.tsx` — mapa estático con pin.
- `components/landing/Description.tsx` — markdown render.
- `components/landing/LeadForm.tsx` — server action submit a `/api/leads` con validación zod.

### Task 10.3: SEO + Open Graph

- Metadata dinámica por propiedad (title, description, og:image, twitter card).
- JSON-LD `RealEstateListing` schema.org.

### Task 10.4: Tests visuales rápidos

- Smoke test que cada componente renderice con un property fixture.

---

# M11 — Pixel + Analytics

### Task 11.1: Pixel Meta

- Snippet `<MetaPixel propertyId pixelId />` en landing.
- Evento `PageView` automático.
- Evento `Lead` disparado al submit del form.
- Evento `ViewContent` con el `propertyId` como content_id.

### Task 11.2: Plausible (opcional fase post)

- Si se decide: instalar `@vercel/analytics` o Plausible script.
- Trackear scroll depth, tiempo en página, click en CTA.

---

# M12 — Schema leads + endpoints

### Task 12.1: Migration `property_leads`

- Crear tabla según spec §7.2.
- RLS: asesor → solo sus propiedades, coordinador/dueño/admin → todo.
- Trigger SQL: al insertar lead, escribir audit log + disparar email via Edge Function o Resend webhook.

### Task 12.2: Endpoint `/api/leads`

- `POST /api/leads` recibe `{ propertyId, name, email, phone, message, utm }`, valida con zod, inserta en `property_leads`.
- Resolver `assigned_to` desde `properties.assigned_to`.
- Disparar email Resend al asesor (template nuevo en `emails/lead-notification.tsx`).

### Task 12.3: Endpoint `/api/leads/[id]`

- `PATCH` para cambiar status (new → contacted → scheduled → discarded).
- Solo asesor asignado o admin/dueño/coordinador.

---

# M13 — Inbox UI

### Task 13.1: Ruta `/dashboard/inbox`

- Página server component que lista leads con filtros (propiedad, fecha, estado, fuente).
- RLS resuelve visibilidad automáticamente.

### Task 13.2: Componente `InboxList`

- Tabla con: lead, propiedad, fecha, estado, asesor, fuente.
- Click en lead abre side panel con detalles + acciones (cambiar status, agregar nota, derivar).

### Task 13.3: Badge en nav

- DashboardNav muestra contador de leads nuevos del rol actual.

---

# M14 — Meta Ads adapter

### Task 14.1: Module `lib/marketing/meta-campaign-builder.ts`

- Funciones: `createCampaign(property, copy)`, `pauseCampaign(campaignId)`, `resumeCampaign`, `fetchCampaignInsights(campaignId, since)`.
- Usa Marketing API v21.0 (mismo wrapper que ya existe en `lib/marketing/meta-ads.ts`).

### Task 14.2: Schema `property_meta_campaigns`

- Tabla con: property_id, campaign_id, adset_id, ad_ids[], status, budget_daily, created_at, paused_at.

### Task 14.3: Schema `property_meta_metrics_daily`

- Similar a `property_metrics_daily` pero con campos Meta (spend, impressions, clicks, ctr, leads, cost_per_lead).
- Scheduled function `sync-meta-property-metrics.mts` cada 6h.

---

# M15 — Rules engine

### Task 15.1: `lib/marketing/budget-rules.ts`

- Función `budgetTier(property): number` con tabla configurable. Default tentativo:
  - Precio ≤ USD 100k → USD 5/día
  - USD 100k-300k → USD 10/día
  - USD 300k-600k → USD 15/día
  - > USD 600k → USD 25/día
- Exposed via JSON en settings page para que Diego ajuste sin tocar código.

### Task 15.2: `lib/marketing/targeting-rules.ts`

- Función `audience(property): MetaAudienceSpec`.
- Default: radio 5 km de lat/lng, age 25-65, intereses real estate.
- > USD 600k: radio expandido a CABA + GBA.
- Hooks para custom audiences (lookalike de leads convertidos — fase posterior).

### Task 15.3: `lib/marketing/creative-rules.ts`

- Función `selectCreatives(property): MetaCreativeSpec[]`.
- Retorna 3 creatives: hero (mejor foto), video (si existe), carousel (4-6 fotos).

### Task 15.4: Tests unitarios de las reglas

- Property fixture + verificación de output esperado en cada tier.

---

# M16 — Copy generation OpenAI

### Task 16.1: Schema `properties.ad_copy_variations`

- Migration agregando columna `jsonb` para cache.

### Task 16.2: `lib/marketing/copy-generator.ts`

- Función `generateAdCopy(property): Promise<AdCopyVariations>`.
- Prompt template en español argentino, real estate.
- Output: 3 headlines, 3 primary texts, 1 description.
- Caché en DB; regenerar solo si se solicita explícitamente.

### Task 16.3: Endpoint `/api/properties/[id]/regenerate-copy`

- POST que re-corre el generator y actualiza el caché.

---

# M17 — Worker provision

### Task 17.1: Trigger SQL

- Cuando `property_listings` tiene al menos un `status='published'` → insertar fila en `meta_provision_jobs (property_id, status='pending')`.

### Task 17.2: Scheduled function `provision-landing-and-ads.mts`

- Para cada job pending:
  1. Verificar landing live (HTTP GET 200 a la URL del subdominio).
  2. Generar copy si no existe.
  3. Crear campaign en Meta (estado `PAUSED`).
  4. Smoke test creative.
  5. Pasar campaign a `ACTIVE`.
  6. Insertar en `property_meta_campaigns` y marcar job `done`.
- Retry exponencial igual que worker de Fase 1.

---

# M18 — Tab Marketing en property detail

### Task 18.1: Componente `PropertyMarketingTab`

- Tres secciones lado a lado:
  1. Portales (reuso PortalListingsCard + PortalMetricsChart).
  2. Meta Ads (insights de campaign, spend, leads, CPL).
  3. Landing (visitas, conversiones, eventos pixel).
- Date picker global.

### Task 18.2: Endpoint `/api/properties/[id]/meta-metrics`

- Agrega `property_meta_metrics_daily` para una propiedad en un date range.

### Task 18.3: Endpoint `/api/properties/[id]/landing-metrics`

- Si tenemos Plausible: query a su API. Si no: contar `property_leads` y `property_publish_events` con event_type='landing_view'.

---

# M19 — Cierre

### Task 19.1: Smoke test end-to-end

1. Crear propiedad de prueba.
2. Aprobar legal + subir fotos.
3. Verificar publicación en MercadoLibre (Fase 1).
4. Verificar que se cree la landing en `[slug].inmodf.com.ar`.
5. Verificar que se cree la campaign Meta (paused → active).
6. Submit un lead en la landing.
7. Verificar que llegue al inbox del asesor asignado y email.
8. Verificar métricas en tab Marketing tras 6h.

### Task 19.2: Documentación

- README de marketing actualizado.
- Guía operacional para coordinador/dueño en `docs/operations/`.

### Task 19.3: /review final Fase 2

- Subagent review focalizado.
- Resolver issues.
- Mergear y celebrar.

---

## Open questions a resolver al refinar este plan

Cuando arranquemos Fase 2, tenemos que cerrar:

1. **Pixel ID Meta**: ¿uno global del negocio o uno por propiedad? Default sugerido: uno global, separado por evento custom_data.
2. **Plausible vs GA4 vs nada**: ¿qué analytics usamos en landing? Más simple: ninguna externa, sumar eventos al `property_publish_events`.
3. **Subdomain slug format**: ¿prefijo de barrio + tipo + 4 chars random? Validar con Diego cuál es más SEO-friendly.
4. **Budget tiers**: validar los valores tentativos con Diego antes de production.
5. **Form fields**: validar con Diego los 4-5 campos óptimos del lead form (nombre, email, teléfono, mensaje, presupuesto?).
6. **Templates landing**: ¿un solo template o variaciones por tipo (departamento vs casa vs terreno)? Empezar con uno.
7. **Notificación tiempo real**: ¿push notification o solo email? Resend email primero, push después si se pide.
8. **Idioma copy**: confirmamos español argentino. ¿Tonadas formal o casual? Probar ambas en A/B post-launch.

---

## Self-review

**Spec coverage**:
- §7.1 Landing → M9, M10 ✓
- §7.2 Schema leads → M12 ✓
- §7.3 Inbox → M13 ✓
- §7.4 Campaign builder → M14, M15 ✓
- §7.5 Métricas Meta → M14.3, M17, M18 ✓
- §7.6 AI copy → M16 ✓
- §8 Permisos → cubierto en RLS de M12 ✓

**Placeholder scan**: Este plan es explícitamente OUTLINE. No tiene código detallado en cada step — eso se profundiza al arrancar cada milestone, igual que se hizo con Fase 1 antes de empezar. Cada milestone aquí debe convertirse en su propio sub-plan con tasks step-by-step al momento de ejecutarlo. La diferencia con un placeholder pernicioso es que sí enumera entregables, archivos esperados y dependencias.

**Type consistency**: No aplica todavía hasta que se profundicen los tasks.

---

## Execution

Cuando se cierre Fase 1, abrir este plan, refinarlo por milestone (M9 primero, hasta producir tasks 2-5 minute), y ejecutar con `superpowers:subagent-driven-development`.
