# Operaciones — Fase 2: Landing + Meta Ads + Inbox

Guía operacional consolidada del sistema construido en Fase 2.
Especificación arquitectónica en `docs/superpowers/specs/2026-05-12-portales-meta-ads-design.md`.

## Tabla de contenidos

1. [Flujo end-to-end](#flujo-end-to-end)
2. [Trigger de captación](#trigger-de-captación)
3. [Landing page por propiedad](#landing-page-por-propiedad)
4. [Captura de leads](#captura-de-leads)
5. [Inbox unificado](#inbox-unificado)
6. [Campañas Meta Ads](#campañas-meta-ads)
7. [Generador de descripciones (GPT Portales)](#generador-de-descripciones-gpt-portales)
8. [Env vars requeridas](#env-vars-requeridas)
9. [Permisos por rol](#permisos-por-rol)
10. [Failure modes](#failure-modes)
11. [Migraciones a aplicar](#migraciones-a-aplicar)

---

## Flujo end-to-end

```
Captación: status='approved' AND legal_status='approved' AND photos>=1 AND lat/lng
                  ↓
       ┌──────────┴──────────┐  (paralelo, independientes)
       ↓                     ↓
  Trigger enqueue       Trigger enqueue
  property_listings     meta_provision_jobs
       ↓                     ↓
  Worker portales      Worker Meta
  (cada 1 min)         (cada 2 min)
       ↓                     ↓
  Publica en 3         ensurePublicSlug
  portales             Crea Campaign+AdSet+Ad
                       Smoke test landing
                       Activa si OK
                              ↓
                       Landing /p/[slug] con Pixel
                              ↓
                       Lead form → /api/leads
                       + fbq('Lead') tracking
                       + Email Resend al asesor
                              ↓
                       Inbox del equipo
                       Status: new → contacted → scheduled → discarded
```

---

## Trigger de captación

Definido en `supabase/migrations/20260512000000_portal_listings_schema.sql` y `20260514000003_meta_trigger_update_only.sql`.

**Cuándo dispara**:
- `properties.status` cambia a `'approved'`
- AND `legal_status = 'approved'`
- AND `array_length(photos, 1) >= 1`
- AND `latitude IS NOT NULL AND longitude IS NOT NULL`

**Qué hace**:
1. Inserta una fila por portal en `property_listings` (status='pending')
2. Inserta job en `meta_provision_jobs` (action='create_campaign')

Los workers procesan estos jobs independientemente.

**Idempotencia**: si la property ya tiene campaign activa/en cola o listings encolados, no duplica.

---

## Landing page por propiedad

URL pública: `https://inmodf.com.ar/p/[slug]`

**Cómo se asigna el slug**: cuando un worker crea la campaña Meta, llama a `ensurePublicSlug()` que genera kebab-case del address + barrio + sufijo random de 6 chars (ej. `departamento-palermo-honduras-5000-x7k2j9`).

**Cómo testear con una propiedad existente** sin esperar al worker:
```sql
UPDATE properties
SET public_slug = 'test-mi-propiedad'
WHERE id = '<uuid>';
```
Visitar `https://inmodf.com.ar/p/test-mi-propiedad`.

**Componentes**: Hero, Gallery (con lightbox), VideoEmbed (YouTube/Vimeo/mp4), Tour3DEmbed (Matterport iframe), Features (stats + amenities), Description, LocationMap (OpenStreetMap embed sin API key), LeadForm (sticky).

**SEO**: metadata dinámica por propiedad (title, description, og:image), robots: index+follow.

**Pixel Meta**: si `META_PIXEL_ID` está seteado, inyecta el script base + dispara `PageView` y `ViewContent` automáticamente.

---

## Captura de leads

Endpoint: `POST /api/leads`

**Validación zod**:
- `propertyId` UUID requerido
- `name` ≥2 y ≤100 chars
- `email` válido o null
- `phone` ≥6 y ≤30 chars o null
- Al menos uno de email o phone

**Defensa contra spam**:
1. Rate limit best-effort: 5 envíos/IP/min (in-memory, no persiste entre instancias).
2. **Dedup en DB**: si el mismo (email OR phone) ya envió un lead para esa propiedad en los últimos 5 min, se devuelve `{ ok: true, deduplicated: true }` sin crear duplicado ni enviar email.

**Tras el insert**:
- Si la property tiene `assigned_to`, se dispara email Resend al asesor (template `LeadNotificationEmail`).
- Si está configurado el Pixel Meta, la landing dispara `fbq('track', 'Lead')` automáticamente desde el cliente.

---

## Inbox unificado

Ruta: `/dashboard/inbox`

**Acceso**: admin, dueño, coordinador, asesor (abogado no).

**Filtros**:
- Estado (pills): Todos / Nuevos / Contactados / Agendados / Descartados
- Fuente: landing / meta_form / portal_*
- Período: 7/30/90/365 días
- Búsqueda full-text por nombre, email, teléfono, propiedad, mensaje

**Auto-refresh**: cada 60 s.

**Badge en nav**: muestra contador de leads `status='new'` visibles para el usuario. Polea `/api/leads/count` cada 60 s.

**Lead detail (side panel)**:
- CTAs directos: mailto, tel, **WhatsApp** (limpia el número de caracteres no-numéricos).
- UTMs si vinieron de campaña.
- Link a la propiedad y la landing pública.
- Mensaje completo.
- Transición de status (4 botones grandes).
- Notas internas editables.

---

## Campañas Meta Ads

### Schema
- `property_meta_campaigns`: una fila por (property, campaign)
- `property_meta_metrics_daily`: métricas diarias
- `meta_provision_jobs`: cola con action create/pause/activate/archive

### Worker `provision-meta-campaigns.mts`
Corre cada 2 min. Procesa la cola con lock atomic + retry exponencial (1m, 5m, 25m, 2h, 12h).

**Acciones**:
- `create_campaign`: ensurePublicSlug → createCampaignForProperty
- `pause_campaign`: pausa todas las campaigns active de la property
- `archive_campaign`: archiva campaigns active+paused

### Builder `lib/marketing/meta-campaign-builder.ts`

Flow de creación:
1. Decide budget (USD→ARS via Bluelytics, 4 tiers)
2. Decide targeting (radio 5/10/20/40km según precio)
3. Genera copy (templates determinísticos)
4. Crea Campaign en Meta (OUTCOME_LEADS, PAUSED, special_ad_categories: [])
5. **Persiste campaign en DB con status='provisioning'** (previene orphans)
6. Sube imagen hero → adimages
7. Crea AdCreative con link a la landing
8. Crea AdSet (LEAD_GENERATION + WEBSITE destination)
9. Crea Ad
10. Smoke test de landing (HTTP GET 200)
11. Actualiza fila en DB con adset_id + ad_ids + status='active' o 'failed'
12. Si OK, activa Campaign+AdSet+Ad en Meta

### Sync metrics

Worker `sync-meta-property-metrics.mts` corre cada 6h. Pulla insights (últimos 7 días) de cada campaign active/paused → upsert en `property_meta_metrics_daily`.

### Targeting

- Geo: radio alrededor de lat/lng según tier (5/10/20/40 km), country=AR
- Age: 25-65
- Intereses: Real estate, Property, Home buying, Mortgage loan
- Placements: FB feed/story/instream + IG feed/story/explore/reels

### Budget tiers (en ARS)

| Precio USD | Tier | Daily ARS |
|---|---|---|
| ≤ 100k | Entry | 5,000 |
| 100k-300k | Mid | 10,000 |
| 300k-600k | Upper | 15,000 |
| > 600k | Premium | 25,000 |

USD→ARS se obtiene **automáticamente** desde [Bluelytics](https://bluelytics.com.ar) (dólar blue), cache 1h por proceso. Fallback: oficial → env `USD_TO_ARS` → 1200.

### NO se usa special_ad_categories: HOUSING

En Argentina las campañas residenciales NO requieren esa categoría (es regulación EEUU/Canadá). Diego corre campañas sin esa restricción habitualmente.

---

## Generador de descripciones (GPT Portales)

Botón en property detail: "Generar descripción para portales".

**Tech**: OpenAI gpt-4o-mini (configurable via `OPENAI_MODEL`) con `response_format: json_object`.

**System prompt**: `lib/marketing/portal-descriptions/system-prompt.ts`. Basado en los 5 documentos de Diego (Tono, Adjetivos permitidos, Estructuras Casa/Depto/PH con ejemplos, Checklist, Prompt). Incluye:
- Adjetivos permitidos y prohibidos.
- Estructura por tipología (4 partes casa, 5 partes depto/PH) sin etiquetar secciones en el output.
- Disclaimer literal.

**UI**:
- Select de buyer profile (familia, pareja joven, soltero/a, adulto mayor, inversionista).
- Input de notas extra.
- Botón Generar → preview con title/subtitle/body, cada uno con botón Copy.
- Botones: Regenerar (sin guardar), Guardar (escribe en `properties.title` y `properties.description`).

**Atención**: Guardar la descripción afecta también:
- La landing `/p/[slug]` (intencional).
- El PDF de tasación (lee `property.description`).
- Los adapters de portales en su próximo update.

---

## Env vars requeridas

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# App
NEXT_PUBLIC_APP_URL=https://inmodf.com.ar

# Meta Ads
META_AD_ACCOUNT_ID=act_...
META_ACCESS_TOKEN=
META_APP_ID=
META_APP_SECRET=
META_PAGE_ID=             # ID de la página FB (Business Settings)
META_PIXEL_ID=            # ID del Pixel (debe ser solo dígitos)

# Resend (emails)
RESEND_API_KEY=
EMAIL_FROM_DEFAULT=

# OpenAI (generador descripciones)
OPENAI_API_KEY=
OPENAI_MODEL=             # opcional, default gpt-4o-mini

# USD→ARS opcional (override Bluelytics)
USD_TO_ARS=
```

---

## Permisos por rol

| Sección | Admin | Dueño | Coordinador | Asesor | Abogado |
|---|---|---|---|---|---|
| Inbox: ver leads | ✅ todos | ✅ todos | ✅ todos | ✅ solo sus props | ❌ |
| Inbox: cambiar status/notas | ✅ | ✅ | ✅ | ✅ | ❌ |
| Inbox: reasignar | ✅ | ✅ | ✅ | ❌ | ❌ |
| Property detail: tab Marketing | ✅ | ✅ | ✅ | ✅ solo sus props | ❌ |
| Generar descripción | ✅ | ✅ | ✅ | ✅ solo sus props | ❌ |
| Pausar/activar campaign Meta | ✅ | ✅ | ✅ | ❌ | ❌ |
| Settings portales (OAuth) | ✅ | ✅ | ❌ | ❌ | ❌ |

---

## Failure modes

| Failure | Manejo |
|---|---|
| `META_PIXEL_ID` mal formado | Validación regex `^\d+$`; si no, no renderiza el script (sin XSS) |
| `OPENAI_API_KEY` falta | `getApiKey()` throws → endpoint devuelve HTTP 500 con mensaje claro, no expone la key |
| Bluelytics caído | Fallback oficial → env → 1200 default |
| Landing 5xx en smoke test | Campaign queda `status='failed'`, no se activa en Meta |
| Spam de leads | Dedup en DB (5min por email/phone+propertyId) |
| Tokens Meta vencidos | Worker recibe 401 → retry exponencial; admin debe re-OAuth |
| Property sin lat/lng | Trigger no dispara; landing también check campos antes de renderizar map |
| Worker procesa duplicado | Lock atomic con UPDATE WHERE status='pending' |
| Campaign Meta orphan (falla en paso 3-5) | DB tiene fila en `provisioning`; worker no crea nueva |

---

## Migraciones a aplicar

Orden (todas idempotentes):

1. `20260512000000_portal_listings_schema.sql` (ya aplicada)
2. `20260512000001_portal_listings_rls.sql` (ya aplicada)
3. `20260512000002_property_updates_trigger.sql` (ya aplicada)
4. `20260514000000_landing_pages_schema.sql` (ya aplicada)
5. `20260514000001_meta_campaigns_schema.sql` (ya aplicada)
6. `20260514000002_meta_trigger_on_capture.sql` (ya aplicada)
7. **`20260514000003_meta_trigger_update_only.sql`** ← aplicar ahora

---

## Scripts útiles

```bash
# Verificar schema de portales
npm exec tsx scripts/verify-portals-schema.ts

# Smoke test del pipeline
npm exec tsx scripts/smoke-test-portals-flow.ts

# Backfill lat/lng en propiedades existentes
GOOGLE_GEOCODING_API_KEY=... npm exec tsx scripts/backfill-property-geocode.ts
```
