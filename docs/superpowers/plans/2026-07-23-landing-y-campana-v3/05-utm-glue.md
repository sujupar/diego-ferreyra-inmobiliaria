He verificado el código real. Dos hallazgos críticos que condicionan el diseño: (1) coexisten DOS esquemas de UTM (el builder nuevo `utm_source=meta` vs los anuncios VIVOS `utm_source=fb_ad`, ya reconciliados en lectura por `attribution.ts`), y (2) el `CHECK` de `funnel_type` solo admite `('clase_gratuita','tasacion','otro')` — NO existe `alto_valor` ni `venta_propiedad`, así que hoy TODA landing de propiedad cae en `'otro'`. Además la vista `vw_landing_conversion_daily` cruza contra `deals`, pero los leads de las landings de propiedad viven en `property_leads` → el loop de conversión de propiedad está roto en la vista. Con eso, el diseño:

---

# Capa de Pegamento — UTMs, Conexión Landing ↔ Meta y Atribución

**Proyecto:** Diego Ferreyra Inmobiliaria · **Alcance:** áreas 1–4 (estructura UTM en la landing, fix `funnel_type`, conexión landing↔Meta, integridad hacia atrás). **No cubre:** editor drag&drop, templates, mapa de empatía, cambio a gpt-image-2 (otros agentes).

---

## 0. Principios y hallazgos que gobiernan el diseño

| # | Hallazgo empírico | Consecuencia de diseño |
|---|---|---|
| H1 | La URL de Meta se arma ad-hoc en `meta-campaign-builder.ts:395-409` con string manual + `.replaceAll('%7B%7B','{{')`. | Extraer a **una** función `buildLandingUrl()` en `lib/marketing/utm.ts`. Un solo lugar arma la URL; la landing define la base, la campaña completa los placeholders. |
| H2 | Coexisten 2 esquemas: builder nuevo (`utm_source=meta / utm_medium=paid_social`) y anuncios VIVOS (`utm_source=fb_ad / utm_medium={{adset.name}} / campaign_id={{campaign.id}}`, verificado 2026-07-17 en `attribution.ts`). | El esquema **canónico de escritura** es el del builder (GA4-standard). NO tocar los anuncios vivos. `attribution.ts:readAttributionFromParams` **ya** adapta ambos en lectura — se mantiene como está. |
| H3 | La URL del builder solo setea `utm_content={{ad.id}}` y `utm_term={{placement}}`. Las columnas `fb_campaign_id/fb_adset_id/fb_ad_id/fb_placement` de `landing_page_visits` **existen pero nunca se llenan** desde /p/[slug]. | La base UTM debe agregar params crudos `fb_campaign_id={{campaign.id}}`, `fb_adset_id={{adset.id}}`, `fb_ad_id={{ad.id}}`, `fb_placement={{placement}}`. Sin esto la atribución exacta por ad/adset es ciega. |
| H4 | `funnel_type CHECK IN ('clase_gratuita','tasacion','otro')` (migración `20260518000005:13`) + `ALLOWED_FUNNELS` hardcodeado en `track-visit/route.ts:25`. | Toda landing de propiedad es hoy `'otro'`. Extender constraint + set a `('clase_gratuita','tasacion','venta_propiedad','alto_valor','otro')`. |
| H5 | `app/p/[slug]/page.tsx:86` pasa `funnelType="otro"` **hardcodeado**. | Derivar server-side desde la propiedad/landing (congelado en `property_landings`), NUNCA desde la URL (spoofeable + las visitas directas no traen UTM). |
| H6 | `vw_landing_conversion_daily` cruza visitas contra `deals`. Los leads de /p/[slug] van a `property_leads`. | Las visitas `venta_propiedad`/`alto_valor` no tienen contraparte de registro → conversión siempre 0/NULL. Reescribir la vista para unir por fuente correcta. |
| H7 | El slug se asigna solo en 2 puntos (`worker.ts:416` al publicar en portal, y admin/pipeline-test). No hay UI de landing. | La creación de landing (Fase 1) es un **tercer punto de asignación** de slug vía `ensurePublicSlug()`. El slug es la clave estable: aunque cambie el template/diseño, el enlace no cambia (requisito del usuario). |

---

## 1. Base estructural de UTMs, creada al crear la landing

### 1.1 Entidad `property_landings` (nueva, 1:1 con propiedad)

La landing pasa a ser entidad independiente. **Mi área solo define las columnas de la capa de pegamento** (UTM + funnel + slug freeze). El contenido del editor/template/secciones lo definen otros agentes en la misma tabla (columna `content jsonb` que dejo declarada pero no especifico).

```sql
-- Migración 20260724000001_property_landings.sql  (correr en Dashboard SQL Editor)
CREATE TABLE IF NOT EXISTS property_landings (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id   uuid NOT NULL UNIQUE REFERENCES properties(id) ON DELETE CASCADE,

  -- ---- Capa de pegamento (MI ÁREA) ----
  public_slug   text,                         -- espejo de properties.public_slug (fuente = properties, ver 1.4)
  funnel_type   text NOT NULL DEFAULT 'venta_propiedad'
                  CHECK (funnel_type IN ('venta_propiedad','alto_valor')),  -- congelado al crear
  utm_campaign  text NOT NULL,                -- token canónico congelado (ver 1.2). Ej: 'venta_palermo-libertad-1234-a1b2c3'
  status        text NOT NULL DEFAULT 'draft' -- draft | published | archived
                  CHECK (status IN ('draft','published','archived')),
  published_at  timestamptz,

  -- ---- Contenido del editor (OTROS AGENTES) ----
  content       jsonb,                        -- secciones/orden/template/copy — no lo especifico acá
  template_key  text,                         -- template elegido; NO afecta el slug ni las UTMs

  created_by    uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_property_landings_slug   ON property_landings(public_slug);
CREATE INDEX IF NOT EXISTS idx_property_landings_status ON property_landings(status);
ALTER TABLE property_landings ENABLE ROW LEVEL SECURITY;
-- RLS granular por rol (patrón de 20260505000001): SELECT/UPDATE a admin/dueno/coordinador/asesor;
-- el asesor solo su propiedad (property.assigned_to = auth.uid()). El abogado NO ve landings.
```

**Regla de oro (requisito del usuario "siempre el mismo enlace"):** `public_slug` y `utm_campaign` se **congelan** al crear la landing (como `appraisals.neighborhood_slug`). Cambiar `template_key`/`content` NO los toca. El enlace `/p/{slug}` es invariante ante rediseños.

### 1.2 Taxonomía de UTMs — qué es estático (landing) y qué es dinámico (campaña)

| Parámetro | Origen | Valor | Cuándo se fija |
|---|---|---|---|
| `utm_source` | **Estático** (landing) | `meta` | Al crear landing. Constante GA4. |
| `utm_medium` | **Estático** (landing) | `paid_social` | Al crear landing. |
| `utm_campaign` | **Estático** (landing) | `property_landings.utm_campaign` = `{funnelPrefix}_{slug}` (ej. `venta_palermo-...` / `altovalor_...`) | Congelado al crear landing. |
| `utm_content` | **Dinámico** (Meta) | `{{ad.id}}` | Meta lo resuelve al servir el anuncio. |
| `utm_term` | **Dinámico** (Meta) | `{{placement}}` | Meta lo resuelve (feed/story/reels). |
| `fb_campaign_id` | **Dinámico** (Meta) | `{{campaign.id}}` | **NUEVO** — llena la columna homónima de `landing_page_visits`. |
| `fb_adset_id` | **Dinámico** (Meta) | `{{adset.id}}` | **NUEVO**. |
| `fb_ad_id` | **Dinámico** (Meta) | `{{ad.id}}` | **NUEVO** (duplica `utm_content` pero en su columna dedicada). |
| `fb_placement` | **Dinámico** (Meta) | `{{placement}}` | **NUEVO**. |

`funnelPrefix`: `venta` → `venta_propiedad`, `altovalor` → `alto_valor`.

### 1.3 Función única — `lib/marketing/utm.ts` (NUEVA)

Reemplaza el bloque ad-hoc de `meta-campaign-builder.ts:395-409` y se reusa en cualquier consumidor (smoke test, previews del editor, portales).

```ts
// lib/marketing/utm.ts
export interface LandingUtmBase {
  utm_source: string   // 'meta'
  utm_medium: string   // 'paid_social'
  utm_campaign: string // property_landings.utm_campaign (congelado)
}

/** Base estática que se guarda al crear la landing. Deriva utm_campaign del funnel + slug. */
export function buildUtmBase(funnelType: 'venta_propiedad' | 'alto_valor', slug: string): LandingUtmBase {
  const prefix = funnelType === 'alto_valor' ? 'altovalor' : 'venta'
  return { utm_source: 'meta', utm_medium: 'paid_social', utm_campaign: `${prefix}_${slug}` }
}

/**
 * Arma la URL final. mode='meta' inyecta los placeholders dinámicos {{...}} SIN URL-encodear
 * (Meta los reemplaza al servir). mode='preview' produce una URL limpia para el smoke test / QA.
 */
export function buildLandingUrl(
  appUrl: string, slug: string, base: LandingUtmBase,
  opts: { mode: 'meta' | 'preview' } = { mode: 'meta' },
): string {
  const p = new URLSearchParams(base as Record<string, string>)
  if (opts.mode === 'meta') {
    p.set('utm_content', '{{ad.id}}')
    p.set('utm_term', '{{placement}}')
    p.set('fb_campaign_id', '{{campaign.id}}')
    p.set('fb_adset_id', '{{adset.id}}')
    p.set('fb_ad_id', '{{ad.id}}')
    p.set('fb_placement', '{{placement}}')
  }
  const qs = p.toString().replaceAll('%7B%7B', '{{').replaceAll('%7D%7D', '}}')
  return `${appUrl}/p/${slug}?${qs}`
}
```

`meta-campaign-builder.ts:395-409` pasa a:

```ts
const base: LandingUtmBase = landing.utm_base ?? buildUtmBase(landing.funnel_type, property.public_slug!)
const landingUrl = buildLandingUrl(getAppUrl(), property.public_slug!, base, { mode: 'meta' })
```

Si la landing no existe (compat, ver §4/§5), `buildUtmBase` reconstruye la misma base determinísticamente desde el slug — **cero cambio de comportamiento** para campañas ya montadas.

### 1.4 Slug: fuente de verdad y tercer punto de asignación

- `properties.public_slug` sigue siendo **la fuente única** (backward compat con `/p/[slug]`, portal worker y metadata). `property_landings.public_slug` es un espejo denormalizado para lecturas rápidas.
- La creación de landing llama `ensurePublicSlug(propertyId)` (`lib/landing/assign-slug.ts`, UPDATE atómico `WHERE public_slug IS NULL`). Es el **tercer trigger**, además de `worker.ts:416` y admin/pipeline-test. Idempotente: si el portal ya asignó slug, lo reusa.
- **Requisito "montar campaña exige landing":** el gate de Fase 2 (otro agente) chequea `EXISTS property_landings WHERE property_id=? AND status='published'`. La existencia de la landing garantiza slug + `utm_campaign` congelados → la campaña nunca arma UTMs contra un slug inexistente.

---

## 2. Fix del `funnel_type` (área 2)

### 2.1 Extender el dominio de valores

```sql
-- Migración 20260724000002_funnel_type_property.sql
ALTER TABLE landing_page_visits DROP CONSTRAINT IF EXISTS landing_page_visits_funnel_type_check;
ALTER TABLE landing_page_visits ADD CONSTRAINT landing_page_visits_funnel_type_check
  CHECK (funnel_type IN ('clase_gratuita','tasacion','venta_propiedad','alto_valor','otro'));
```

`track-visit/route.ts:25`:
```ts
const ALLOWED_FUNNELS = new Set(['clase_gratuita','tasacion','venta_propiedad','alto_valor','otro'])
```

### 2.2 Derivación server-side (NO desde la URL)

`funnel_type` se **congela** en `property_landings.funnel_type` al crear la landing, y `/p/[slug]` lo lee de ahí y lo pasa al tracker. Regla de derivación:

```ts
// lib/landing/funnel-type.ts (NUEVA)
const ALTO_VALOR_USD = 400_000  // umbral HNWI; ajustable

export function deriveFunnelType(p: {
  asking_price: number | null; currency: string | null; operation_type: string | null
}, usdToArs: number): 'venta_propiedad' | 'alto_valor' {
  if (p.operation_type !== 'venta') return 'venta_propiedad' // alquiler/temporario no son alto_valor
  const usd = p.currency === 'USD'
    ? (p.asking_price ?? 0)
    : (p.asking_price ?? 0) / (usdToArs || 1)
  return usd >= ALTO_VALOR_USD ? 'alto_valor' : 'venta_propiedad'
}
```

`app/p/[slug]/page.tsx:86` (fix del hardcode):
```tsx
// getPropertyBySlug ya trae la landing con su funnel_type congelado
<LandingVisitTracker slug={slug} funnelType={landing?.funnel_type ?? 'venta_propiedad'} />
```

Fallback `'venta_propiedad'` para landings legacy sin fila `property_landings` (§5). NUNCA `'otro'` para /p/[slug]: una propiedad publicada siempre es venta/alquiler medible.

> Nota: `tasacion`/`clase_gratuita` siguen siendo funnels de captación de propietarios en landings GHL/`app/(funnels)/*` — no /p/[slug]. Su tracking no cambia.

---

## 3. Conexión Landing ↔ Meta (área 3)

### 3.1 Smoke test con landing editable (`meta-campaign-builder.ts:800`)

`smokeTestLanding(landingUrl)` hace un GET a la URL con placeholders. Riesgos con la landing editable:

1. **Placeholders `{{...}}` en la URL del GET:** el smoke test debe pegarle a la **versión preview** (sin placeholders), no a la URL de Meta. Fix: `smokeTestLanding(buildLandingUrl(appUrl, slug, base, { mode: 'preview' }))`. Así el 200 valida el render real, no una URL con `{{ad.id}}` literal.
2. **La landing debe estar `published`, no `draft`:** `/p/[slug]` hace `.eq('status','approved')` sobre `properties` — se agrega gate en la creación de campaña: `property_landings.status='published'`. Si está en `draft`, el smoke test daría el contenido a medias. El gate de Fase 2 lo previene antes del build.
3. **Editable ≠ frágil:** como el slug/UTM están congelados, editar secciones no cambia la URL ni rompe el smoke test. El smoke test valida "la landing responde 200 y trae el hero", no el diseño.

### 3.2 Pixel + CAPI: que los eventos de campaña lleguen bien

- `MetaPixel` (client) y el POST a `/api/leads` con `{eventId, fbp, fbc}` (CAPI) ya existen. **No cambia el mecanismo**, se refuerza la **deduplicación** y el **enriquecimiento de atribución**:
  - `fbc` se deriva de `fbclid` de la URL. Con los nuevos params `fb_*`, el lead puede además guardar `fb_campaign_id/adset/ad` exactos → CAPI + tabla coinciden con el ad real, no solo con `utm_content`.
  - `eventId` debe ser el **mismo** en el Pixel browser-side (`PageView`/`Lead`) y en el CAPI server-side para que Meta deduplique. Ya se pasa; se documenta como invariante en `LandingLeadForm`.
- **Evento de conversión:** el `custom_event_type: 'LEAD'` del AdSet (CLAUDE.md, subcode 1885014) debe matchear el evento CAPI `Lead` que dispara `/api/leads`. Se mantiene.

### 3.3 Cerrar el loop visita → lead → campaña

**Problema (H6):** `vw_landing_conversion_daily` cruza `landing_page_visits` contra `deals` por `funnel_type`. Los leads de propiedad van a `property_leads`, que **no tiene `funnel_type` ni columnas fb_**. El loop está roto para `venta_propiedad`/`alto_valor`.

**Fix parte A — enriquecer `property_leads` en la escritura** (`app/api/leads/route.ts`, el POST público):

```sql
-- Migración 20260724000003_property_leads_attribution.sql
ALTER TABLE property_leads ADD COLUMN IF NOT EXISTS funnel_type    text;
ALTER TABLE property_leads ADD COLUMN IF NOT EXISTS utm_source     text;
ALTER TABLE property_leads ADD COLUMN IF NOT EXISTS utm_medium     text;
ALTER TABLE property_leads ADD COLUMN IF NOT EXISTS utm_campaign   text;
ALTER TABLE property_leads ADD COLUMN IF NOT EXISTS utm_content    text;
ALTER TABLE property_leads ADD COLUMN IF NOT EXISTS utm_term       text;
ALTER TABLE property_leads ADD COLUMN IF NOT EXISTS fb_campaign_id text;
ALTER TABLE property_leads ADD COLUMN IF NOT EXISTS fb_adset_id    text;
ALTER TABLE property_leads ADD COLUMN IF NOT EXISTS fb_ad_id       text;
ALTER TABLE property_leads ADD COLUMN IF NOT EXISTS fb_placement   text;
CREATE INDEX IF NOT EXISTS idx_pl_utm_campaign ON property_leads(utm_campaign) WHERE utm_campaign IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pl_funnel_day   ON property_leads(funnel_type, created_at);
```

El POST de lead (que ya recibe `utm` + payload CAPI vía `getUtmFromUrl`) persiste esos campos. El `funnel_type` se resuelve server-side: `property_landings.funnel_type` de la propiedad (no confiar en la URL). Los `fb_*` vienen de la URL (resueltos por Meta) — **por eso importa H3**: sin los params `fb_*` en la base UTM, el lead no puede guardar el ad real.

**Fix parte B — reescribir la vista** para que cada funnel cruce contra su fuente de registro correcta:

```sql
-- Reemplaza vw_landing_conversion_daily (misma migración 20260724000003)
CREATE OR REPLACE VIEW vw_landing_conversion_daily AS
WITH visits AS (
  SELECT visited_at::date AS day, funnel_type, COUNT(*)::bigint AS visits
  FROM landing_page_visits GROUP BY 1,2
),
regs AS (
  -- Funnels de captación de propietarios → deals (comportamiento previo, preservado)
  SELECT created_at::date AS day,
         CASE WHEN origin = 'clase_gratuita' THEN 'clase_gratuita' ELSE 'tasacion' END AS funnel_type,
         COUNT(*)::bigint AS registrations
  FROM deals
  WHERE origin IN ('clase_gratuita','embudo')          -- alinear con funnel_definitions_fix
  GROUP BY 1,2
  UNION ALL
  -- Funnels de propiedad → property_leads (NUEVO: cierra el loop de /p/[slug])
  SELECT created_at::date AS day,
         COALESCE(funnel_type, 'venta_propiedad') AS funnel_type,
         COUNT(*)::bigint AS registrations
  FROM property_leads
  WHERE funnel_type IN ('venta_propiedad','alto_valor')
  GROUP BY 1,2
)
SELECT COALESCE(v.day, r.day)                 AS day,
       COALESCE(v.funnel_type, r.funnel_type) AS funnel_type,
       COALESCE(v.visits, 0)                  AS visits,
       COALESCE(r.registrations, 0)           AS registrations,
       CASE WHEN COALESCE(v.visits,0) > 0
            THEN ROUND(COALESCE(r.registrations,0)::numeric / v.visits * 100, 2)
            ELSE NULL END                     AS conversion_pct
FROM visits v
FULL OUTER JOIN regs r ON v.day = r.day AND v.funnel_type = r.funnel_type;
```

**Atribución por campaña/ad (grano fino):** con `landing_page_visits.fb_ad_id` y `property_leads.fb_ad_id` ahora poblados, se puede unir visita→lead por `utm_campaign` + `fb_ad_id` y calcular conversión por anuncio. `attribution.ts:hasMetaAttribution` y `readAttributionFromParams` siguen siendo la puerta de lectura (ya soportan ambos esquemas de H2). First-touch se conserva (cookie `df_attr` 90d).

---

## 4. Integridad y compatibilidad hacia atrás (área 4)

| Escenario | Riesgo | Mitigación |
|---|---|---|
| **Landings ya publicadas por portal** (`worker.ts:416` asignó slug, sin fila `property_landings`) | `/p/[slug]` haría `landing?.funnel_type` → undefined | `getPropertyBySlug` hace `LEFT JOIN property_landings`. Si no hay fila → fallback `deriveFunnelType(property)` en runtime (no rompe). El slug ya existe → se reusa. |
| **Campañas Meta ya montadas** con el esquema viejo (`utm_source=fb_ad`, `campaign_id=...`) | Cambiar el esquema de escritura rompería atribución de anuncios vivos | **No se tocan.** `attribution.ts` ya adapta ambos esquemas en lectura (H2). Solo las campañas NUEVAS usan `buildLandingUrl`. |
| **`property_leads` existentes** sin columnas nuevas | Vista/analytics fallarían | Columnas `ADD ... IF NOT EXISTS` **nullable, sin default forzado**. Filas viejas quedan con `funnel_type=NULL` → la vista las excluye del cruce de propiedad (no las cuenta como `venta_propiedad` falso). Cero backfill destructivo. |
| **`landing_page_visits` con `funnel_type='otro'` histórico** (todo /p/[slug] previo) | Reclasificar rompería series históricas | **No se reclasifica retroactivamente.** El nuevo valor `venta_propiedad` aplica solo a visitas nuevas. El histórico `'otro'` queda como está (documentado). Dashboards suman `venta_propiedad + alto_valor + otro` si quieren la serie completa. |
| **Migración vs deploy** (gate, patrón CLAUDE.md `neighborhood_slug`) | Deployar código que lee `property_landings`/columnas nuevas antes de correr SQL → 500 en prod | **Orden obligatorio:** correr `20260724000001/2/3` en el Dashboard **ANTES** del deploy. El código usa lecturas defensivas (`landing?.`, `?? fallback`) para tolerar la ventana. La creación de landing (que INSERTA en `property_landings`) va detrás del gate de migración. |
| **`CHECK` viejo bloqueaba inserts** | Insertar `venta_propiedad` antes de correr la migración de constraint → violación CHECK | `track-visit` capea a `'otro'` si el valor no está en `ALLOWED_FUNNELS`; correr `20260724000002` primero elimina el riesgo. |

---

## 5. Resumen de cambios (firmas y archivos reales)

**Nuevos:**
- `lib/marketing/utm.ts` — `buildUtmBase()`, `buildLandingUrl()`, `LandingUtmBase`.
- `lib/landing/funnel-type.ts` — `deriveFunnelType(property, usdToArs)`.
- Migraciones `20260724000001_property_landings.sql`, `20260724000002_funnel_type_property.sql`, `20260724000003_property_leads_attribution.sql` (correr en Dashboard, en ese orden, PRE-deploy).

**Modificados:**
- `lib/marketing/meta-campaign-builder.ts:395-409` → llamar `buildLandingUrl(..., {mode:'meta'})`.
- `lib/marketing/meta-campaign-builder.ts:800` → smoke test contra `{mode:'preview'}`.
- `app/p/[slug]/page.tsx:86` → `funnelType={landing?.funnel_type ?? 'venta_propiedad'}`; `getPropertyBySlug` con `LEFT JOIN property_landings`.
- `app/api/landing/track-visit/route.ts:25` → `ALLOWED_FUNNELS` extendido.
- `app/api/leads/route.ts` (POST público) → persistir `funnel_type` (server-side desde `property_landings`) + `utm_*` + `fb_*`.
- `lib/landing/assign-slug.ts` — reusado como tercer punto de asignación al crear landing (sin cambio de firma).

**Invariantes que NO se tocan:** anuncios Meta vivos (esquema `fb_ad`), `attribution.ts` (ya reconcilia ambos esquemas), first-touch cookie `df_attr`, mecanismo Pixel+CAPI/`eventId`, histórico de `landing_page_visits`/`property_leads`.

**Cierre del bug de presupuesto (fuera de mi área pero relacionado con la conexión):** cuando Fase 2 cablee `dailyBudgetArs` en `confirm/route.ts:272-278`, el override ya está soportado en `meta-campaign-builder.ts:395-420` — **no** volver a multiplicar antes de `:664` (el `×100` de Meta ya está ahí). Documentado como blindaje.
