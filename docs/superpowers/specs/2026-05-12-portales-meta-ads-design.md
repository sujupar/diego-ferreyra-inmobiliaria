# Publicación automática en portales + Meta Ads — Design Spec

- **Fecha**: 2026-05-12
- **Autor**: Sujupar + Claude
- **Estado**: aprobado, listo para planning
- **Alcance**: Fase 1 (portales) + Fase 2 (Meta Ads + landing + inbox)

---

## 1. Contexto y objetivo

Hoy la captación de una propiedad termina cuando el abogado aprueba los documentos y el asesor sube las fotos (`properties.status = 'approved'`). A partir de ese estado la propiedad queda "captada" pero nadie automatiza el siguiente paso: publicarla en portales y montar pauta digital.

Objetivo: que el flujo desde "captada" hasta "campaña activa con inbox de leads" sea **100% automático y trazable**, con cero intervención manual entre la aprobación legal y la primera impresión de la propiedad en internet.

El sistema cubre dos fases secuenciales:

- **Fase 1 — Publicación en portales argentinos**: ZonaProp, Argenprop, MercadoLibre Inmuebles. Trigger automático al captarse la propiedad. Sincroniza métricas (views, contactos, favoritos) por portal cada 6 h.
- **Fase 2 — Meta Ads + Landing**: generación automática de landing page por propiedad en subdominio `[slug].inmodf.com.ar`, montaje programático de campaña en Meta Ads con lógica de targeting/budget basada en características de la propiedad, captura de leads en inbox con permisos por rol.

---

## 2. Estado actual relevante

- Tabla `properties` ya tiene: address, neighborhood, city, property_type, rooms/bedrooms/bathrooms/garages, covered_area/total_area, floor, age, asking_price, currency, photos (string[]), legal_status, description (agregada 2026-05-06).
- Roles definidos (enum `app_role`): admin, dueno, coordinador, asesor, abogado, agent, viewer. RLS por rol implementada (`20260505000000_rls_per_role.sql`).
- Stack: Next.js 16, React 19, Supabase, Resend, Netlify (con scheduled functions).
- `lib/marketing/meta-ads.ts` ya integra Meta Marketing API v21.0 para **lectura** de insights. Env vars listas: `META_AD_ACCOUNT_ID`, `META_ACCESS_TOKEN`, `META_APP_ID`, `META_APP_SECRET`.
- Patrón scheduled function: `.mts` self-contained en `netlify/functions/`, no importa de `lib/marketing/`.
- Diego Ferreyra Inmobiliaria tiene **plan activo de inmobiliaria** en ZonaProp y Argenprop. Cuenta de MercadoLibre asumida activa.

### Campos faltantes en `properties` que el sistema requiere

| Campo | Tipo | Por qué |
|---|---|---|
| `latitude`, `longitude` | numeric | ZonaProp y ML requieren geolocalización precisa |
| `video_url` | text | Opcional. Portales que lo soportan suben el video |
| `tour_3d_url` | text | Opcional. Matterport / similar |
| `expensas` | numeric | Crítico para departamentos en Argentina |
| `amenities` | jsonb (array de strings) | Pileta, parrilla, SUM, gym, seguridad 24h, etc. |
| `operation_type` | text enum: venta / alquiler / temporario | Hoy se asume venta |
| `title` | text nullable | Título comercial; fallback al address |
| `postal_code` | text nullable | Algunos portales lo piden |

---

## 3. Decisiones arquitectónicas

### 3.1. Enfoque de entrega: incremental por portal (Enfoque B)

Toda la infraestructura (schema, adapter pattern, queue, métricas, UI) se construye antes de que lleguen las credenciales. Cada portal se "activa" flippeando una env var cuando llegan sus credenciales. Esto significa:

- Semana 1: schema + adapters esqueleto + UI + MercadoLibre activado (es self-serve, sin espera).
- Semanas 2-6: Argenprop y ZonaProp se activan en producción a medida que llegan credenciales. **Cero código que escribir** al activar.

### 3.2. Adapter pattern para portales

Un `PortalAdapter` por portal. Interfaz común:

```ts
interface PortalAdapter {
  readonly name: 'mercadolibre' | 'argenprop' | 'zonaprop'
  readonly enabled: boolean  // se deriva de env vars

  publish(property: Property): Promise<PublishResult>
  update(property: Property, externalId: string): Promise<void>
  unpublish(externalId: string): Promise<void>
  fetchMetrics(externalId: string, since: Date): Promise<PortalMetrics[]>
  validate(property: Property): ValidationResult  // pre-vuelo
}
```

Agregar un portal nuevo = un archivo `lib/portals/<portal>-adapter.ts` + un test. Nada más se toca.

### 3.3. Trigger DB + worker scheduled function

**No** triggers SQL ejecutando HTTP. En su lugar:

- Trigger SQL `properties_after_capture` se dispara cuando `status` cambia a `approved` y `legal_status='approved'` y `photos` tiene ≥ 1 elemento. Inserta una fila en `property_listings` por cada adapter (incluso los `disabled`).
- Scheduled function `publish-listings.mts` corre **cada 1 minuto**, toma todos los `status='pending'` cuyo `next_attempt_at <= NOW()` y cuyo portal está enabled, los procesa.
- Retry exponencial: 1 m, 5 m, 25 m, 2 h, 12 h. Max 5 intentos → `status='failed'` y se notifica.

### 3.4. Manejo de credenciales por portal

Tabla `portal_credentials` (encriptada con `pgsodium` o secret manager). Una fila por portal con `enabled`, `access_token`, `refresh_token`, `expires_at`, `metadata` (jsonb para datos específicos del portal: account_id ML, código cliente Argenprop, etc.).

Env vars son el "fallback" inicial: `ML_APP_ID`, `ML_SECRET_KEY`, `ARGENPROP_API_KEY`, `ARGENPROP_CLIENT_CODE`, `ZONAPROP_API_KEY`, `ZONAPROP_CLIENT_CODE`. Adapter chequea env primero, después DB.

Cuando un portal no tiene credenciales, su `enabled` es false y los jobs para ese portal quedan en `pending` (no `failed`) — el worker los skipea hasta que se active.

### 3.5. Decomposición en specs y planes

- **Un solo design spec** (este documento) cubriendo Fase 1 + Fase 2 a nivel arquitectónico.
- **Dos planes de implementación separados**:
  - `plans/2026-05-12-fase1-publicacion-portales.md` — detallado, ejecutable inmediatamente.
  - `plans/2026-05-12-fase2-meta-ads-landing.md` — outline; se profundiza cuando arranquemos Fase 2 incorporando aprendizajes de Fase 1.

---

## 4. Esquema de datos (Fase 1)

### 4.1. Extensiones a `properties`

```sql
ALTER TABLE properties
  ADD COLUMN latitude numeric,
  ADD COLUMN longitude numeric,
  ADD COLUMN video_url text,
  ADD COLUMN tour_3d_url text,
  ADD COLUMN expensas numeric,
  ADD COLUMN amenities jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN operation_type text DEFAULT 'venta',
  ADD COLUMN title text,
  ADD COLUMN postal_code text;
```

`operation_type` no usa CHECK constraint (estilo proyecto: text libre con default), pero el adapter valida valores.

### 4.2. Tabla nueva: `property_listings`

```sql
CREATE TABLE property_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  portal text NOT NULL,  -- 'mercadolibre' | 'argenprop' | 'zonaprop'
  status text NOT NULL DEFAULT 'pending',  -- pending | publishing | published | failed | disabled | paused
  external_id text,  -- ID del aviso en el portal
  external_url text,  -- URL pública del aviso
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz DEFAULT NOW(),
  last_published_at timestamptz,
  last_error text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, portal)
);
```

Estados:
- `pending`: en cola, esperando worker o credenciales.
- `publishing`: lock activo, worker en proceso.
- `published`: publicado OK, `external_id` poblado.
- `failed`: 5 intentos sin éxito.
- `disabled`: portal sin credenciales en este momento (revive a `pending` cuando se habilita).
- `paused`: pausado manualmente desde UI (ej. propiedad reservada).

### 4.3. Tabla nueva: `property_metrics_daily`

```sql
CREATE TABLE property_metrics_daily (
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  portal text NOT NULL,
  date date NOT NULL,
  views int DEFAULT 0,
  contacts int DEFAULT 0,
  favorites int DEFAULT 0,
  whatsapps int DEFAULT 0,
  raw jsonb DEFAULT '{}'::jsonb,
  PRIMARY KEY (property_id, portal, date)
);
```

Síntesis cada 6 h via scheduled function `sync-portal-metrics.mts`.

### 4.4. Tabla nueva: `portal_credentials`

```sql
CREATE TABLE portal_credentials (
  portal text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false,
  access_token text,
  refresh_token text,
  expires_at timestamptz,
  metadata jsonb DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
```

Acceso solo via `service_role`. RLS denegando todo a authenticated.

### 4.5. Tabla nueva: `property_publish_events` (auditoría)

```sql
CREATE TABLE property_publish_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid REFERENCES property_listings(id) ON DELETE CASCADE,
  property_id uuid REFERENCES properties(id) ON DELETE CASCADE,
  portal text NOT NULL,
  event_type text NOT NULL,  -- 'created' | 'updated' | 'published' | 'failed' | 'retried' | 'unpublished'
  payload jsonb,
  error_message text,
  actor text,  -- 'system' | user_id
  created_at timestamptz NOT NULL DEFAULT NOW()
);
```

### 4.6. RLS

- `property_listings`: read según rol (asesor → solo sus propiedades, coordinador/dueño/admin → todas). Write solo service_role.
- `property_metrics_daily`: mismo patrón.
- `portal_credentials`: deny all a authenticated.
- `property_publish_events`: read según rol (mismo patrón), write solo service_role.

---

## 5. Flujo end-to-end Fase 1

### 5.1. Trigger de publicación

```
[Abogado aprueba] → properties.legal_status = 'approved'
       +
[Asesor sube fotos] → properties.photos.length >= 1
       =
properties.status = 'approved' (existente, ya implementado)
       ↓
[Trigger SQL properties_after_capture]
       ↓
INSERT INTO property_listings (property_id, portal='mercadolibre', status='pending')
INSERT INTO property_listings (property_id, portal='argenprop', status='pending')
INSERT INTO property_listings (property_id, portal='zonaprop', status='pending')
       ↓
[Scheduled function publish-listings.mts cada 1 min]
       ↓
Para cada listing pending con portal enabled:
  - lock con UPDATE ... WHERE status='pending' RETURNING (atomic)
  - status='publishing'
  - adapter.validate(property) → si falla, marca status='failed' con last_error
  - adapter.publish(property) → si OK, status='published', external_id, external_url
  - si throw → attempts++, next_attempt_at = NOW + backoff, status='pending'
  - log en property_publish_events
```

### 5.2. Sincronización de métricas

```
[Scheduled function sync-portal-metrics.mts cada 6 h]
       ↓
Para cada listing con status='published' y portal enabled:
  - adapter.fetchMetrics(external_id, since=lastSync)
  - UPSERT en property_metrics_daily
```

### 5.3. UI en property detail

Nueva sección "Publicación en portales" (visible para no-abogado). Por cada portal:
- Badge de estado (pending / publishing / published / failed / disabled / paused).
- Si `published`: link al aviso, fecha de publicación, mini-card de métricas (últimos 7 días).
- Si `failed`: razón del error + botón "Reintentar manualmente".
- Si `pending` por credenciales faltantes: nota "Esperando activación del portal".
- Botón global "Pausar publicaciones" / "Reactivar".

Sección "Métricas de portales": gráfica con date picker (últimos 7/30/90 días, custom), totalizada por portal con dropdown para ver detalle.

---

## 6. Adapters por portal (Fase 1)

### 6.1. MercadoLibre

- **Auth**: OAuth 2.0. App ID + Secret en env. Flow: user authorize → callback `/api/oauth/mercadolibre/callback` → guarda tokens en `portal_credentials`. Refresh automático cuando `expires_at` esté a < 1 h.
- **Endpoints**:
  - `POST /items` para publicar inmueble.
  - `PUT /items/{id}` para actualizar.
  - `PUT /items/{id}` con `status: 'closed'` para despublicar.
  - `GET /items/{id}/visits` + `GET /items/{id}/questions` para métricas.
- **Categorías**: ML usa category IDs (`MLA1459` = inmuebles, sub categorías por tipo).
- **Validaciones específicas**: ≥1 foto desde feb 2026, fotos en URLs públicas (las nuestras lo son), descripción ≥ 100 chars.
- **Payload mínimo**: title, category_id, price, currency_id, available_quantity=1, condition='new', listing_type_id, pictures, attributes (operation, rooms, bedrooms, bathrooms, garages, m²), location (lat/lng).

### 6.2. Argenprop

- **Auth**: API key + código de cliente en header. Provistos por `comercial@argenprop.com`.
- **Endpoints** (basados en especificación pública de la API):
  - `POST /sellers` (registrar vendedor si no existe — una sola vez).
  - `POST /ads` para crear aviso.
  - `PUT /ads/{id}` para actualizar.
  - `PUT /ads/{id}/status` con `active: false` para pausar/despublicar.
  - `GET /ads/{id}/stats` para métricas.
- **Validaciones**: depende de la doc oficial que recibamos; planeamos validador conservador (todos los campos básicos + ≥1 foto).
- **Notas**: Argenprop replica automáticamente a Inmuebles Clarín y BuscaInmueble (incluido en su plan). Esto significa que con un solo POST tenemos cobertura extra. No hace falta integrar esos portales por separado.

### 6.3. ZonaProp

- **Auth**: a definir cuando lleguen credenciales. El nuevo sistema sincrónico usa API key + secret (similar a otros). Hasta entonces, el adapter implementa la interfaz pero retorna `enabled=false`.
- **Estrategia técnica**: el "nuevo sistema sincrónico" es lo que vamos a usar (no el feed XML legacy). Lanzamos POST por aviso, respuesta sincrónica con `external_id`. ZonaProp puede tardar minutos en hacerlo visible internamente — pero el ack es inmediato.
- **Fallback documentado**: si por alguna razón nos dan únicamente el feed XML legacy, agregamos un adapter `ZonapropXmlFeedAdapter` que escribe un endpoint público `/api/portals/zonaprop/feed.xml` que ZonaProp polea cada N horas. Esto está fuera del scope si nos dan API sync.

---

## 7. Fase 2 — Meta Ads + Landing (outline)

### 7.1. Landing page por propiedad

- **Routing**: subdomain wildcard `*.inmodf.com.ar` → Next.js middleware detecta `host` y rewrite a `/p/[slug]/page.tsx`. DNS wildcard CNAME a Netlify.
- **Slug**: kebab-case del address + sufijo de 6 chars random para evitar colisiones. Persistido en `properties.public_slug` (nueva columna).
- **Template**: hero con primera foto, galería swipeable, video player embed, iframe Matterport, datos clave (precio, ambientes, m², expensas, amenities), mapa con pin, descripción, **lead form sticky**.
- **Lead form**: 4 campos (nombre, email, teléfono, mensaje opcional). Server action → `INSERT INTO property_leads`.
- **Pixel Meta**: snippet inyectado para tracking de eventos `PageView`, `Lead`, `ViewContent`. Usa Pixel ID en env.

### 7.2. Tabla nueva: `property_leads`

```sql
CREATE TABLE property_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  message text,
  source text NOT NULL,  -- 'landing' | 'meta_form' | 'portal_mercadolibre' | etc
  utm jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'new',  -- new | contacted | scheduled | discarded
  assigned_to uuid REFERENCES profiles(id),
  meta_lead_id text,
  created_at timestamptz NOT NULL DEFAULT NOW()
);
```

### 7.3. Inbox unificado

- Ruta `/dashboard/inbox`.
- RLS: asesor solo sus propiedades; coordinador/dueño/admin todo. Abogado sin acceso.
- Filtros: por propiedad, por estado, por fecha, por fuente.
- Cada lead nuevo dispara: email Resend al asesor asignado + entrada visible en inbox + (opcional fase posterior) notificación push.

### 7.4. Meta Ads campaign builder

- **Módulo**: `lib/marketing/meta-campaign-builder.ts`.
- **Lógica rules-based** (no LLM para budget/targeting, más predecible y barato):
  - **Budget diario**: tier por precio. Ejemplos tentativos (a calibrar con Diego):
    - Hasta USD 100k: USD 5/día.
    - USD 100-300k: USD 10/día.
    - USD 300-600k: USD 15/día.
    - Más de USD 600k: USD 25/día + targeting nacional/regional.
  - **Targeting geo**: por defecto, radio configurable (5/10/20 km) alrededor de lat/lng. Para propiedades > USD 600k, ampliamos a CABA + GBA + Argentina.
  - **Targeting demo**: age 25-65, intereses "Real estate", "Property", "Home buying".
  - **Creatives**: 3 ads por campaign — uno con la mejor foto (hero), uno con video si existe, uno carousel con 4-6 fotos. Copy generado vía OpenAI con prompt entrenado para real estate AR.
  - **CTA**: "Más información" → URL de la landing.
- **Marketing API endpoints**:
  - `POST /act_<ACCOUNT_ID>/campaigns` (objetivo: OUTCOME_LEADS).
  - `POST /act_<ACCOUNT_ID>/adsets` (audience + budget + placement).
  - `POST /act_<ACCOUNT_ID>/adcreatives` (creatives).
  - `POST /act_<ACCOUNT_ID>/ads` (linkea adset + creative).
- **Estado**: campaign creada en `PAUSED`, luego pasa a `ACTIVE` automáticamente tras validar que landing está live (smoke test HTTP GET 200).

### 7.5. Métricas Meta por propiedad

- Scheduled function `sync-meta-property-metrics.mts` cada 6 h.
- Tabla `property_meta_metrics_daily` con shape similar a `property_metrics_daily`: impressions, clicks, ctr, spend, leads, cost_per_lead, raw.
- Tab "Marketing" en property detail combina portales + Meta + analítica de landing (Plausible o GA4, fase post).

### 7.6. AI para copy (no para budget)

- Función `generatePropertyAdCopy(property)` que llama OpenAI con prompt template en español argentino. Output: 3 variaciones de headline + 3 de primary text + 1 description corta.
- Caché en `properties.ad_copy_variations` (jsonb) para reusar.

---

## 8. Permisos y visibilidad por rol

| Rol | Fase 1 | Fase 2 |
|---|---|---|
| **Admin** | Acceso total a publicación, métricas, retries, settings. | Acceso total: inbox, campaigns, landings. |
| **Dueno** | Igual que Admin. | Igual que Admin. |
| **Coordinador** | Igual que Admin. | Acceso total al inbox de todas las propiedades. |
| **Asesor** | Ve publicación y métricas solo de propiedades asignadas. Botón "Reintentar" disponible. | Inbox solo de sus propiedades. Lee métricas de sus campaigns. NO crea/edita campaigns. |
| **Abogado** | Sin acceso a sección de publicación. | Sin acceso. |

---

## 9. Failure modes y observabilidad

| Failure | Manejo |
|---|---|
| Lat/lng faltantes | Job `failed` con mensaje "Completar geolocalización"; UI ofrece geocodear desde address con un click (Google Geocoding API). |
| Video URL inválido | Adapter skipea el video, no bloquea publicación. Loguea warning. |
| Foto < resolución mínima | Adapter pre-valida; si todas las fotos fallan, `failed` con mensaje claro. |
| Token vencido | Adapter detecta 401, intenta refresh, reintenta una vez antes de fallar. |
| Portal API caído | Backoff exponencial hasta 5 intentos en 14 h. Después → `failed`, notifica admin. |
| Credenciales no configuradas | Listings se quedan en `pending` con nota "esperando activación", no consumen retries. Cuando se setea env var, próximo tick activa. |
| Conflicto en MercadoLibre (aviso duplicado) | Adapter detecta el código de error de ML, actualiza el aviso existente en lugar de crear duplicado. |
| Subdomain colisión | Slug colisiona → reintenta con sufijo random nuevo. |
| Landing 5xx | Smoke test antes de activar campaign falla → campaign queda PAUSED, error en `property_publish_events`. |

**Observabilidad**:
- Tabla `property_publish_events` como log auditable, queryable desde UI.
- Logs estructurados en Netlify (functions logs).
- Endpoint admin `/api/admin/portal-health` que reporta status por portal: % publicaciones exitosas últimas 24 h, latencia promedio, queue depth.

---

## 10. Decisiones explícitas y no-objetivos

**Decisiones explícitas**:
- Trigger automático sin opción "publicar manualmente" como path principal. Sí hay botón "re-publicar / forzar reintento" en UI para casos puntuales.
- Edición post-publicación: si el asesor cambia datos en una propiedad ya publicada, automáticamente se llama a `adapter.update()` en cada portal. Implementado via trigger SQL + worker.
- Despublicación: cuando `properties.status` pasa a `sold` o `withdrawn`, se llama `adapter.unpublish()` en cada portal.
- Budget y targeting de Meta: rules-based, no LLM. LLM solo para copy.
- Landing pages son **server-rendered** (no CSR puro) para SEO + Pixel reliability.

**No-objetivos (out of scope este spec)**:
- Edición visual de videos (Remotion) — fase posterior.
- Integración con WhatsApp Business API — fase posterior.
- A/B testing automático de creatives — fase posterior (Meta Advantage+ se encarga internamente).
- Portales fuera de los 3 top (Properati, Inmoup, Inmuebles24) — agregables sin cambios arquitectónicos pero no incluidos en plan inicial.
- Otros canales publicitarios (Google Ads, TikTok Ads) — fase posterior.
- Edición de contenido por aviso/portal individual (cambiar título solo en ZonaProp). Single source of truth: `properties`.

---

## 11. Riesgos y mitigaciones

| Riesgo | Probabilidad | Mitigación |
|---|---|---|
| ZonaProp no nos da acceso al sync API y solo ofrece XML feed legacy | Media | Adapter alternativo `ZonapropXmlFeedAdapter` ya planeado. Latencia mayor (horas) pero funcional. |
| Argenprop tarda > 4 semanas en credenciales | Media | Fase 1 entrega valor con MercadoLibre desde semana 1. No bloquea progreso. |
| Cambios breaking de Meta Marketing API (v22, v23) | Baja | Wrapper centralizado en `lib/marketing/meta-*.ts`, easy upgrade. |
| Costos OpenAI explotan (mucha generación de copy) | Baja | Caché de variaciones en `properties.ad_copy_variations`. Solo regenerar si se pide. |
| Lat/lng faltantes en propiedades existentes | Alta | Migration script con Google Geocoding API para backfill batch. Manual fallback. |
| Lead duplicados (mismo email en landing + Meta form) | Media | Dedupe en `property_leads` por (property_id, email) con merge de metadata. |
| Subdomain wildcard + Netlify SSL | Baja | Netlify soporta wildcard SSL automático. Validar antes de Fase 2. |

---

## 12. Métricas de éxito

**Fase 1**:
- 100% de propiedades captadas se publican automáticamente en ≥ 2 portales en menos de 10 min desde aprobación.
- ≥ 95% de publicaciones exitosas al primer intento.
- Dashboard de métricas con datos vivos diariamente.

**Fase 2**:
- Landing page live para 100% de propiedades publicadas en < 5 min.
- Campaign Meta activa en < 30 min desde captación.
- Lead capturado en inbox visible al asesor < 1 min desde envío.
- Coste por lead documentado y trackable a nivel propiedad.

---

## 13. Próximos pasos

1. Spec se commitea.
2. Se generan dos planes:
   - `plans/2026-05-12-fase1-publicacion-portales.md` (detallado).
   - `plans/2026-05-12-fase2-meta-ads-landing.md` (outline, refinable luego).
3. Implementación arranca por Fase 1 siguiendo Enfoque B (MercadoLibre en producción semana 1, infra completa para Argenprop/ZonaProp en paralelo).
4. /review al cierre de cada portal y al cierre de Fase 1.
5. Fase 2 arranca solo después del /review de cierre de Fase 1.
