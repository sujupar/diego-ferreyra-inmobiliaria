# Test Property → Meta Ads Campaign — Walkthrough

> **Objetivo:** crear una propiedad ficticia, llevarla al estado "captada y aprobada", y describir paso a paso cómo el sistema arma sola la campaña Meta + la landing pública.

## Contexto

El sistema ya tiene **todo automatizado**: en cuanto una propiedad llega a `status='approved'` con `legal_status='approved'`, ≥1 foto, y `latitude/longitude`, un trigger SQL encola un job, un worker corre cada 2 min y crea la campaña Meta (Campaign + AdSet + Ad), apuntando a la landing `/p/<slug>`.

Hay **dos formas** de generar la propiedad de prueba:

| Forma | Cuándo usar | Pro / Contra |
|---|---|---|
| **A. Endpoint `/api/admin/pipeline-test`** | Cuando querés probar TODO el pipeline (publica en MercadoLibre PAUSADO + crea Meta PAUSED) | Pro: 1 click. Hace dryRun. Contra: requiere ML OAuth completado y env vars Meta seteadas. |
| **B. SQL seed `scripts/test-data/seed-test-property.sql`** | Cuando solo querés probar el ramal Meta (saltea ML) o no tenés ML OAuth | Pro: 100% Dashboard. Contra: no testea ML/Argenprop. |

Ambas usan exactamente las mismas imágenes ficticias de Unsplash y los mismos defaults.

---

## Forma A — Endpoint automático (recomendado para test end-to-end)

### Pre-flight (chequear antes)

1. Abrir `https://inmodf.com.ar/admin/pipeline-test` (UI) — esa pantalla muestra el preflight:
   - **MercadoLibre**: `enabled=true` si `ML_APP_ID`+`ML_SECRET_KEY` + OAuth completado.
   - **Meta**: `enabled=true` si `META_AD_ACCOUNT_ID`+`META_ACCESS_TOKEN`+`META_PAGE_ID` están en Netlify.
2. Si Meta dice `enabled=false`, fixear envs en Netlify antes de correr el POST. Sin esas 3 vars la campaña no se crea.

### Ejecutar

Desde el navegador logueado como `admin` o `dueno`:

```bash
# Desde DevTools console en cualquier página /admin (asegura cookie de sesión):
await fetch('/api/admin/pipeline-test', { method: 'POST' }).then(r => r.json())
```

Respuesta esperada (resumida):
```json
{
  "ok": true,
  "result": {
    "propertyId": "uuid",
    "testPrefix": "[TEST 2026-05-21T15:30]",
    "steps": {
      "propertyCreated": true,
      "slugAssigned": { "ok": true, "slug": "depto-3-amb-palermo-ab12" },
      "mercadolibre": { "ok": true, "externalId": "MLA123...", "status": "paused" },
      "meta": {
        "ok": true,
        "campaignId": "120214...",
        "adsetId": "120214...",
        "adIds": ["120214..."],
        "adsManagerUrl": "https://business.facebook.com/adsmanager/manage/campaigns?act=...&selected_campaign_ids=..."
      },
      "landingUrl": "https://inmodf.com.ar/p/depto-3-amb-palermo-ab12"
    }
  }
}
```

El endpoint hace **dryRun=true** en Meta → la campaña queda **PAUSED** (no gasta presupuesto).

### Limpieza

```bash
await fetch('/api/admin/pipeline-test?propertyId=<uuid>', { method: 'DELETE' }).then(r => r.json())
```

Esto: cierra item de ML, archiva campaña Meta, borra la property (cascade limpia listings, campaigns, metrics, leads, jobs).

**Código:** [app/api/admin/pipeline-test/route.ts](../../../app/api/admin/pipeline-test/route.ts)

---

## Forma B — SQL seed (solo ramal Meta)

Pegá [scripts/test-data/seed-test-property.sql](../../../scripts/test-data/seed-test-property.sql) en Supabase Dashboard → SQL Editor → Run.

El script:
1. Inserta un `contacts` ficticio.
2. Inserta una `properties` con `status='approved' + legal_status='approved' + photos + lat/lng + public_slug` ya seteado.
3. Marca `property_listings` de Argenprop/Zonaprop como `disabled` (no se publican).
4. El trigger `enqueue_meta_campaign_on_capture` ENCOLA el job en `meta_provision_jobs`.

A los ~3 min el worker procesa el job y la campaña aparece en `property_meta_campaigns`.

---

## Step-by-step del sistema (qué pasa una vez creada la propiedad)

### 1. Trigger SQL detecta la captación

**Archivo:** [supabase/migrations/20260514000002_meta_trigger_on_capture.sql](../../../supabase/migrations/20260514000002_meta_trigger_on_capture.sql)

```sql
CREATE TRIGGER trg_enqueue_meta_capture
  AFTER INSERT OR UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_meta_campaign_on_capture();
```

Condiciones para encolar (deben cumplirse TODAS):
- `NEW.status = 'approved'`
- `NEW.legal_status = 'approved'`
- `array_length(NEW.photos, 1) >= 1`
- `NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL`
- No existe ya `property_meta_campaigns` con status IN (`pending`, `provisioning`, `active`, `paused`)
- No existe ya `meta_provision_jobs` con `action='create_campaign'` y status pending/in_progress

Si todas se cumplen → `INSERT INTO meta_provision_jobs (property_id, action='create_campaign', status='pending')`.

### 2. Worker scheduled corre cada 2 min

**Archivo:** [netlify/functions/provision-meta-campaigns.mts](../../../netlify/functions/provision-meta-campaigns.mts) (`schedule: */2 * * * *`)

Flow del worker:
1. `SELECT * FROM meta_provision_jobs WHERE status='pending' AND next_attempt_at <= NOW() LIMIT 5`
2. `UPDATE job SET status='in_progress'` (lock atómico contra otros workers)
3. Según `job.action`:
   - **`create_campaign`** → asegura `public_slug` (JIT, vía `ensurePublicSlug`) → `createCampaignForProperty(property, { dryRun: false })`
   - **`pause_campaign`** → `pauseCampaign(campaign_id)`
   - **`archive_campaign`** → `archiveCampaign(campaign_id)`
4. Si éxito: `UPDATE job SET status='done'`
5. Si error: retry exponencial (1m, 5m, 25m, 2h, 12h) — `attempts++` y `next_attempt_at` se recalcula

### 3. `createCampaignForProperty` arma la campaña en Meta

**Archivo:** [lib/marketing/meta-campaign-builder.ts](../../../lib/marketing/meta-campaign-builder.ts)

Secuencia (todas son calls a `graph.facebook.com/v21.0`):

| Paso | Llamada Meta | Output |
|---|---|---|
| 3.1 | Calcular budget — `decideBudget(price, currency, usdToArs)` | tier según USD: 0-100k=ARS 5k/día, 100-300k=ARS 10k, 300-600k=ARS 15k, >600k=ARS 25k |
| 3.2 | Calcular targeting — `decideTargeting(property, usdToArs)` | Geo: círculo 5-40 km alrededor de lat/lng. Edad 25-65. Intereses real estate (4 IDs Meta). Plataformas FB feed/story/instream + IG feed/story/explore/reels |
| 3.3 | Generar copy — `generateAdCopyVariations` | OpenAI/DeepSeek si hay API key, fallback `copy-templates.ts`. Output: 3 primary texts, 3 headlines, 1 description |
| 3.4 | `POST /act_XXX/campaigns` | Campaign creada con `objective=OUTCOME_LEADS`, `status=PAUSED` |
| 3.5 | `INSERT property_meta_campaigns` con `status='provisioning'` | Guarda en DB para idempotencia (si los pasos siguientes fallan, el reintento no crea otra Campaign duplicada) |
| 3.6 | `POST /act_XXX/adimages?url=<photo[0]>` | Hash de imagen Meta |
| 3.7 | `POST /act_XXX/adcreatives` | Creative con `object_story_spec` linkeando a la landing |
| 3.8 | `POST /act_XXX/adsets` | AdSet con `daily_budget`, `optimization_goal=LEAD_GENERATION`, `destination_type=WEBSITE`, targeting completo, `status=PAUSED` |
| 3.9 | `POST /act_XXX/ads` | Ad linkeando adset + creative, `status=PAUSED` |
| 3.10 | `smokeTestLanding(url)` — GET a la landing | Si 200 OK → activa todo. Si no → `status='failed'` con `last_error='Smoke test de landing falló'` |
| 3.11 | `UPDATE property_meta_campaigns` con `adset_id`, `ad_ids[]`, `status` final | Persiste estado final |
| 3.12 | `activateCampaign` — POST status=ACTIVE en orden Campaign → AdSet → Ads | Solo si smoke test OK y NO es dryRun |

### 4. La landing `/p/<slug>` queda viva

**Archivo:** [app/p/[slug]/page.tsx](../../../app/p/[slug]/page.tsx)

Es un Server Component que hace `SELECT * FROM properties WHERE public_slug=? AND status='approved'`. Si no existe o el status no es approved → `notFound()`.

**Estructura visual** (orden de las secciones):

```
<main>
  <LandingVisitTracker>           ← Analytics interno: registra cada visita en property_visits
  <MetaPixel>                     ← Inyecta pixel JS si META_PIXEL_ID está seteado
                                     Eventos: PageView (auto), ViewContent (mount), Lead (form submit)
  <LandingHero>                   ← Hero con foto[0], título, dirección, precio
  <LandingFeatures>               ← Tarjetas: ambientes, dorms, baños, garaje, m², piso, antigüedad, expensas, amenities
  <LandingGallery>                ← Grid con todas las photos[]
  <LandingVideoEmbed>             ← Solo si property.video_url
  <LandingTour3DEmbed>            ← Solo si property.tour_3d_url
  <LandingDescription>            ← Solo si property.description
  <LandingLocationMap>            ← Solo si lat/lng: embed Google Maps
  <LandingLeadForm>               ← Formulario lead → POST /api/leads → INSERT property_leads + sync GHL
</main>
```

**Meta tags / OpenGraph** (los lee el crawler de Meta cuando comparte el link):
- `title`: `property.title` o `"<tipo> en <neighborhood>"`
- `description`: primeros 160 chars de `property.description`
- `og:image`: `photos[0]`

**Para la propiedad de prueba**, todas esas piezas se renderean con los datos del seed:
- Hero: foto Unsplash Palermo, "[TEST ...] Depto 3 amb Palermo", USD 180.000
- Features: 3 amb / 2 dorm / 1 baño / 1 garaje / 70 m² cub / 75 m² tot / piso 5 / 10 años / ARS 50.000 expensas / pileta+parrilla+sum+laundry
- Gallery: 3 fotos Unsplash
- Description: el texto largo del seed
- Map: lat -34.581 / lng -58.429 (Palermo)
- LeadForm: capturará leads de prueba contra `/api/leads` con `propertyId` real

### 5. Captura de leads desde el anuncio

**Archivo:** [components/landing/LeadForm.tsx](../../../components/landing/LeadForm.tsx) → POST [app/api/leads/route.ts](../../../app/api/leads/route.ts)

Cuando alguien clickea el anuncio Meta y llena el form:
1. Form captura `fbclid` + UTMs del query string
2. POST `/api/leads` → `INSERT property_leads`
3. Si hay `META_PIXEL_ID`: dispara evento `Lead` (server-side + client-side)
4. Sync opcional con GHL para que el lead aparezca en el CRM

### 6. Sincronización de métricas (cada 6 h)

**Archivo:** [netlify/functions/sync-meta-property-metrics.mts](../../../netlify/functions/sync-meta-property-metrics.mts) (`schedule: 0 */6 * * *`)

Por cada campaign con `status IN ('active', 'paused')`:
- `GET /<campaign_id>/insights?fields=impressions,clicks,ctr,spend,reach,actions,cost_per_action_type&time_range=<últimos 7 días>&level=campaign&time_increment=1`
- Parsea `actions[]` buscando `action_type='lead'` (o variantes pixel)
- UPSERT en `property_meta_metrics_daily (property_id, campaign_id, date)`

Las métricas se ven en el dashboard de la propiedad → tab Meta Ads → componente `<MetaCampaignCard>` (selector de 7/30 días).

### 7. Control manual desde dashboard

**UI:** [app/(dashboard)/properties/[id]/page.tsx](../../../app/(dashboard)/properties/[id]/page.tsx) → tab "Meta Ads" → `<MetaCampaignCard>`

Botones disponibles (admin/dueno/coordinador):
- **Pausar** → POST `/api/properties/[id]/meta-campaign` `{action:'pause'}` → encola job `pause_campaign`
- **Reactivar** → idem con `action:'activate'`
- **Archivar** → idem con `action:'archive'` (terminal, no se puede revertir)

Los botones NO actúan directamente sobre Meta — encolan en `meta_provision_jobs` y el worker procesa.

---

## Variables de entorno requeridas en Netlify

| Var | Requerida | Default | Notas |
|---|---|---|---|
| `META_AD_ACCOUNT_ID` | ✅ | — | Prefijo `act_` requerido (ej `act_853173985153585`) |
| `META_ACCESS_TOKEN` | ✅ | — | Long-lived token (60+ días) |
| `META_PAGE_ID` | ✅ | — | ID de la página Facebook que firma los ads |
| `META_PIXEL_ID` | recomendado | — | Si está vacío, no se inyecta pixel en la landing |
| `NEXT_PUBLIC_APP_URL` | recomendado | `https://inmodf.com.ar` | Base para landing URLs |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | — | Worker + landing lo necesitan |
| `OPENAI_API_KEY` o `DEEPSEEK_API_KEY` | opcional | — | Sin esto, copy usa templates determinísticas |
| `USD_TO_ARS` | opcional | Bluelytics live | Override manual de tipo de cambio |

---

## Validaciones bloqueantes (qué impide crear la campaña)

| Validación | Donde se chequea | Error |
|---|---|---|
| `property.public_slug` no nulo | `createCampaignForProperty` línea 103 | `Property sin public_slug` |
| `property.photos.length >= 1` | línea 106 + trigger SQL | `Property sin fotos` |
| `latitude && longitude` | línea 109 + trigger SQL | `Property sin lat/lng` |
| `META_AD_ACCOUNT_ID` + `META_ACCESS_TOKEN` + `META_PAGE_ID` env vars | `getMeta()` línea 29 | `META_AD_ACCOUNT_ID o META_ACCESS_TOKEN faltantes` |
| Smoke test landing devuelve 200 | línea 244 | `status='failed'`, `last_error='Smoke test de landing falló'` |
| Token Meta no expirado | error 401 al primer POST | `MetaApiError`, retry exponencial |

---

## Cómo verificar el ciclo completo de la prueba

Después de correr el seed (o el endpoint), correr en orden:

### Inmediatamente
```sql
-- Propiedad existe y está en estado correcto
SELECT id, address, status, legal_status, public_slug, photos[1], latitude, longitude
FROM properties WHERE address LIKE '[TEST %' ORDER BY created_at DESC LIMIT 1;

-- Job encolado por el trigger
SELECT id, property_id, action, status, attempts, next_attempt_at, last_error
FROM meta_provision_jobs WHERE action='create_campaign'
ORDER BY created_at DESC LIMIT 3;
```

### A los ~3 minutos (después de que corra el worker)
```sql
-- Campaña creada en Meta y persistida
SELECT property_id, campaign_id, adset_id, status, budget_daily, landing_url, last_error
FROM property_meta_campaigns ORDER BY created_at DESC LIMIT 3;

-- El job debería estar 'done'
SELECT id, property_id, action, status, last_error FROM meta_provision_jobs
WHERE action='create_campaign' ORDER BY created_at DESC LIMIT 3;
```

### En Meta Ads Manager
- Abrir https://business.facebook.com/adsmanager/manage/campaigns
- Filtrar por nombre que arranca con `[Auto] [TEST`
- Verificar: Campaign + AdSet + Ad creados. Si fue dryRun (endpoint): todos en PAUSED. Si fue worker real: ACTIVE.

### En el navegador
- Abrir `https://inmodf.com.ar/p/<slug>` (el slug está en `property.public_slug`)
- Verificar: hero, features, gallery (3 fotos), description, map (Palermo), form de lead.
- Abrir DevTools → Network → debería ver el pixel `connect.facebook.net/.../fbevents.js` si `META_PIXEL_ID` está seteado.

### A las ~6 horas (después del sync de métricas, si llegaron impresiones)
```sql
SELECT property_id, campaign_id, date, impressions, clicks, ctr, spend, leads, cost_per_lead
FROM property_meta_metrics_daily
WHERE property_id = '<uuid>' ORDER BY date DESC;
```

---

## Cleanup

### Opción 1: endpoint DELETE (más limpio, archiva en Meta)
```bash
await fetch('/api/admin/pipeline-test?propertyId=<uuid>', { method:'DELETE' })
```

### Opción 2: SQL directo (no archiva en Meta — hacelo después en Ads Manager)
```sql
-- Ver qué se va a borrar PRIMERO
SELECT id, address, created_at FROM properties WHERE address LIKE '[TEST %';

-- Borrar contacts ficticios primero (la FK contact_id no es cascade)
DELETE FROM contacts WHERE id IN (
  SELECT contact_id FROM properties WHERE address LIKE '[TEST %' AND contact_id IS NOT NULL
);

-- Borrar properties (cascade limpia listings, campaigns, metrics, leads, jobs, visits)
DELETE FROM properties WHERE address LIKE '[TEST %';
```

> ⚠️ **Importante**: el filtro `LIKE '[TEST %'` es seguro porque ninguna propiedad real arranca con `[TEST`. Verificá igual con el SELECT antes de borrar.

---

## Archivos clave (referencia)

| Capa | Archivo |
|---|---|
| Trigger SQL | [supabase/migrations/20260514000002_meta_trigger_on_capture.sql](../../../supabase/migrations/20260514000002_meta_trigger_on_capture.sql) |
| Schema Meta | [supabase/migrations/20260514000001_meta_campaigns_schema.sql](../../../supabase/migrations/20260514000001_meta_campaigns_schema.sql) |
| Worker provisioning | [netlify/functions/provision-meta-campaigns.mts](../../../netlify/functions/provision-meta-campaigns.mts) |
| Worker métricas | [netlify/functions/sync-meta-property-metrics.mts](../../../netlify/functions/sync-meta-property-metrics.mts) |
| Builder Meta | [lib/marketing/meta-campaign-builder.ts](../../../lib/marketing/meta-campaign-builder.ts) |
| Budget rules | [lib/marketing/budget-rules.ts](../../../lib/marketing/budget-rules.ts) |
| Targeting rules | [lib/marketing/targeting-rules.ts](../../../lib/marketing/targeting-rules.ts) |
| Copy AI | [lib/marketing/copy-ai-generator.ts](../../../lib/marketing/copy-ai-generator.ts) |
| Slug helper | [lib/landing/assign-slug.ts](../../../lib/landing/assign-slug.ts) |
| Landing page | [app/p/[slug]/page.tsx](../../../app/p/[slug]/page.tsx) |
| Lead capture | [app/api/leads/route.ts](../../../app/api/leads/route.ts) |
| Dashboard tab Meta | [components/properties/MetaCampaignCard.tsx](../../../components/properties/MetaCampaignCard.tsx) |
| API control campaign | [app/api/properties/[id]/meta-campaign/route.ts](../../../app/api/properties/[id]/meta-campaign/route.ts) |
| Endpoint pipeline-test | [app/api/admin/pipeline-test/route.ts](../../../app/api/admin/pipeline-test/route.ts) |
| Seed SQL fallback | [scripts/test-data/seed-test-property.sql](../../../scripts/test-data/seed-test-property.sql) |
