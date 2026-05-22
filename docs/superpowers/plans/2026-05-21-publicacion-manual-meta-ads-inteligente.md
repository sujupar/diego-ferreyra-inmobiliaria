# Plan: Publicación manual post-captación + Meta Ads inteligente

> **Fecha:** 2026-05-21
> **Estado:** Borrador para aprobación
> **Supersede parcialmente:** `2026-05-12-fase2-meta-ads-landing.md` (filosofía "auto" se reemplaza por "manual con asistente inteligente")

---

## Contexto y por qué cambiamos de filosofía

Hasta ahora el sistema disparaba **automáticamente** la publicación en portales y la creación de campañas Meta cuando una propiedad llegaba a estado "captada" (triggers SQL `enqueue_property_listings` y `enqueue_meta_campaign_on_capture`).

**El usuario quiere lo contrario:** que el asesor inmobiliario **decida intencionalmente** cuándo publicar y cuándo lanzar campaña, con un asistente inteligente que haga el 99% del trabajo creativo (análisis, segmentación, copy, presupuesto) y deje al asesor el 1% de decisiones clave (qué destacar, cuánto invertir, lanzar o esperar).

Adicionalmente, hay **3 errores críticos** detectados en la auditoría de hoy que hay que corregir antes de avanzar:

| # | Error | Síntoma |
|---|-------|---------|
| A | `item.status.invalid` en ML al pausar | Item queda creado en ML pero no se logra pausar → riesgo de publicación pública accidental |
| B | Atributo `HAS_LOWER_PRICE` no enviable | Validation error 400 al actualizar item ML |
| C | Falta env vars Meta en Netlify | Pipeline de Meta nunca arranca |

---

## Fases del plan

| Fase | Qué incluye | Bloquea a |
|------|-------------|-----------|
| **F0** | Fixes urgentes (errores ML A/B + cleanup item colgado + variables Meta documentadas) | F1+ |
| **F1** | Eliminar triggers SQL de auto-publish + popup post-captación con 2 botones | F2, F3 |
| **F2** | Wizard de publicación manual en MercadoLibre (preview + edit + publicar) | — |
| **F3** | Wizard inteligente de Meta Ads (vision + persona + geo + copy + budget) | F4 |
| **F4** | Pixel + CAPI + Inbox de leads por rol | F5 (opcional) |
| **F5** | (Propositivo, para después) Rediseño de landing para alta conversión Meta | — |
| **QA** | Agente de QA pass al final de cada fase + smoke test end-to-end | — |

---

## F0 — Fixes urgentes (HOY, antes de cualquier otra cosa)

### F0.1 — Cerrar item ML colgado `MLA3356354388`
- **Acción manual del usuario:** entrar a [Mis publicaciones en ML](https://www.mercadolibre.com.ar/myaccount/listings) y cerrar/eliminar el item.
- **Fallback automático:** el botón "Eliminar todo lo de la prueba" ya intenta `PUT status: closed`. Verificar si funcionó o si quedó algún huérfano.

### F0.2 — Fix estrategia de pausa en pipeline-test
**Archivo:** [app/api/admin/pipeline-test/route.ts](app/api/admin/pipeline-test/route.ts)

**Problema:** se intenta `PUT status: paused` inmediatamente después del POST, pero ML retiene el item en `not_yet_active` (validación interna 30-300s).

**Solución elegida:** **NO pausar.** En su lugar, crear el item con `status: 'closed'` desde el inicio para test. Como esto no es siempre soportable por listing_type_id, usar workaround:
1. POST normal → recibimos `external_id`.
2. **Polling con backoff** (5 intentos × 10s) chequeando `GET /items/{id}` hasta que `status === 'active'`.
3. Una vez `active`, `PUT status: paused`.
4. Si después de 50s sigue `not_yet_active`, dejarlo como `not_yet_active` y advertir en UI: "Item creado, ML aún lo está validando. Volvé a /admin/pipeline-test en 5 min y usá 'Cleanup' para cerrarlo definitivamente."

**Por qué no listing_type='free':** quita la posibilidad de probar el flujo real (silver).

### F0.3 — Fix atributo `HAS_LOWER_PRICE`
**Archivo:** [lib/portals/mercadolibre/mapping.ts](lib/portals/mercadolibre/mapping.ts)

**Investigación:** este atributo lo agrega ML cuando detecta que el item tiene variantes de precio. El PUT con `attributes` está triggereando el cálculo y devuelve 400 porque el value `[(242084,null)]` no es válido (le falta el ID del item con precio menor).

**Solución:**
1. En el PUT (update), filtrar de los attributes cualquier ID en una blocklist: `['HAS_LOWER_PRICE', 'BASE_PRICE', 'PRICE_TO_PAY']` (atributos calculados que ML no acepta como input).
2. Agregar en `propertyToMlPayload` un comment explicando la blocklist.

### F0.4 — Documentar env vars Meta (NO en código — en `docs/`)
**Archivo:** [docs/portales-publicacion.md](docs/portales-publicacion.md) (extender) o nuevo `docs/meta-ads-setup.md`

Contenido:
- Tabla de env vars requeridas (`META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_PAGE_ID`, `META_PIXEL_ID`, `META_BUSINESS_ID`).
- Paso a paso para obtener cada una desde Business Manager.
- Ubicación: Netlify env vars (todas las contexts), **no en Supabase**.

**Crítico:** este documento es la fuente de verdad cuando alguien tenga que rotar tokens.

---

## F1 — Eliminar auto-publish + popup post-captación

### F1.1 — Desactivar triggers SQL de auto-encolamiento

**Migración a crear:** `supabase/migrations/20260522000001_disable_auto_publish_triggers.sql`

```sql
-- Desactiva el encolamiento automático. La publicación es ahora MANUAL via UI.
-- Las tablas property_listings y meta_provision_jobs siguen existiendo y se
-- llenan solo cuando el usuario clickea "Publicar" desde el wizard.

DROP TRIGGER IF EXISTS trg_enqueue_property_listings ON public.properties;
DROP TRIGGER IF EXISTS trg_enqueue_meta_capture ON public.properties;

-- Las funciones se mantienen por si en el futuro queremos volver a auto-mode
-- para algún tipo de propiedad específico. Solo desactivamos los triggers.

COMMENT ON FUNCTION public.enqueue_property_listings IS
  'DESACTIVADA 2026-05-22. La publicación es manual desde /properties/[id]/marketing.';
COMMENT ON FUNCTION public.enqueue_meta_campaign_on_capture IS
  'DESACTIVADA 2026-05-22. Las campañas Meta se crean manualmente desde el wizard.';
```

**🔴 Impacto a verificar (anticipativo, no reactivo):**
- ¿El worker `publish-listings.mts` se rompe sin filas pending? **No** — el worker hace `SELECT WHERE status='pending'`, si no hay filas no hace nada. Sigue corriendo cada 1 min sin problema, lo que cambia es que ahora las filas las inserta la UI directamente.
- ¿`property_meta_campaigns` queda sin uso? **No** — el wizard la sigue poblando manualmente.
- ¿Tests existentes que dependen del trigger? Hay que buscar `enqueue_property_listings` en tests y actualizarlos.

### F1.2 — Tarjeta post-captación en el detail de propiedad

**Archivo a crear:** [components/properties/PostCaptureActions.tsx](components/properties/PostCaptureActions.tsx)

Se monta en [app/(dashboard)/properties/[id]/page.tsx](app/(dashboard)/properties/[id]/page.tsx) cuando `property.status === 'approved'`.

**Diseño:**
- Card visible al tope del detail con título "Propiedad captada ✓ — ¿qué hacemos con ella?"
- 2 botones grandes lado a lado:
  - **"Publicar en MercadoLibre"** → abre wizard ML (F2)
  - **"Lanzar campaña Meta Ads"** → abre wizard Meta (F3)
- Estado de cada uno arriba de su botón:
  - ML: "No publicada" / "Publicada el X" / "Pausada" / "Error"
  - Meta: "Sin campaña" / "Campaña activa" / "Pausada" / "Error"
- Cualquier orden, cualquier momento. Nunca obliga.

**Permisos:** asesor solo ve si la propiedad es suya; admin/coordinador/dueno siempre la ven.

### F1.3 — Modal "¡Captación lograda!" inmediato al pasar a approved

**Archivo a crear:** [components/properties/CaptureSuccessModal.tsx](components/properties/CaptureSuccessModal.tsx)

Detecta transición `status: pending_review → approved` (puede ser via flag en sessionStorage o query param `?justCaptured=1` que pone el endpoint que aprueba).

**UX:**
- Confetti suave + emoji celebratorio
- "¡La propiedad de [Dirección] ya está captada!"
- 3 botones:
  - **"Publicar en MercadoLibre ahora"**
  - **"Crear campaña Meta Ads ahora"**
  - **"Después"** (cierra modal, queda la tarjeta en el detail)

---

## F2 — Wizard de publicación manual en MercadoLibre

### F2.1 — Endpoint preview (no publica, solo arma payload)

**Archivo a crear:** [app/api/properties/[id]/ml-preview/route.ts](app/api/properties/[id]/ml-preview/route.ts)

**GET:** devuelve `{ payload, validation }` usando `propertyToMlPayload(property)` + `validateCommon(property)`. **No llama a ML.**

**PUT:** recibe overrides parciales del usuario (título editado, descripción editada, fotos reordenadas) y los persiste en `properties` (campos `title`, `description`, `photos`) o en columna nueva `ml_overrides JSONB` si no queremos pisar los originales.

**Decisión a tomar:** ¿overrides pisan los datos de la propiedad o son separados?
- **Recomiendo separados** (`ml_overrides JSONB`) para que la landing/Argenprop/Zonaprop usen lo "limpio" y ML use lo editado para portal.

### F2.2 — Componente del wizard ML

**Archivo a crear:** [components/properties/wizards/MercadoLibreWizard.tsx](components/properties/wizards/MercadoLibreWizard.tsx)

**Estructura:**
- **Paso 1 — Preview**: muestra cómo se va a ver el aviso (mockup visual estilo ML: foto grande + título + precio + atributos).
- **Paso 2 — Editar**: campos editables inline (título, descripción, orden de fotos, precio).
  - Validaciones live: título ≤ 60, descripción ≥ 100 chars, ≥ 1 foto.
  - Reorder de fotos con drag-and-drop.
- **Paso 3 — Confirmar y publicar**: botón final "Publicar en MercadoLibre".

### F2.3 — Endpoint de publicación manual

**Archivo a crear:** [app/api/properties/[id]/ml-publish/route.ts](app/api/properties/[id]/ml-publish/route.ts)

**POST:**
1. Cargar property + `ml_overrides`.
2. Inicializar adapter ML.
3. Llamar `ml.publish(propertyWithOverrides)`.
4. Insertar/actualizar `property_listings` con `status='published'`, `external_id`, `external_url`.
5. Audit en `property_publish_events`.
6. Devolver `{ externalId, externalUrl }` al wizard.

### F2.4 — Worker auto-pausa (best-effort)

**Archivo a modificar:** [netlify/functions/publish-listings.mts](netlify/functions/publish-listings.mts)

Agregar nueva fase: items publicados con `metadata.needs_pause_after_active=true` (lo setea pipeline-test) → polling hasta `active` → `PUT paused`.

Esto resuelve el bug F0.2 de forma robusta sin bloquear el endpoint.

---

## F3 — Wizard inteligente de Meta Ads

### F3.0 — Arquitectura del wizard

**Flujo de 6 pasos** (todos pre-completados, asesor revisa y ajusta):

| Paso | Qué hace el sistema | Qué decide el asesor |
|------|---------------------|----------------------|
| 1 | Pre-carga tipo, dirección, características | Confirma tipo (depto/casa/PH) si hay ambigüedad |
| 2 | Analiza fotos con Claude vision, propone 3 highlights | Elige cuál destacar, puede agregar comentario propio |
| 3 | Genera buyer persona (edad, situación, presupuesto, lifestyle) | Ajusta si conoce el barrio mejor que el sistema |
| 4 | Sugiere segmentación geográfica simplificada | Elige entre 3 presets ("Cercanos", "Similares", "Amplio") |
| 5 | Genera copy + selecciona fotos + recomienda presupuesto ARS | Edita copy, presupuesto, fotos finales |
| 6 | Muestra preview del ad en feed mock | Click "Lanzar campaña" |

### F3.1 — Servicio de análisis de fotos (vision)

**Archivo a crear:** [lib/marketing/property-vision-analyzer.ts](lib/marketing/property-vision-analyzer.ts)

```ts
export async function analyzePropertyPhotos(photos: string[]): Promise<{
  highlights: Array<{ id: string; label: string; reasoning: string; photoIndex: number }>;
  detectedFeatures: string[]; // ej. ["pileta", "balcón aterrazado", "vista panorámica", "cocina integrada"]
  bestPhotoIndex: number; // foto principal para creative
  ambience: 'luminoso' | 'cálido' | 'moderno' | 'clásico' | 'amplio';
}>
```

**Implementación:** llamada a Claude API (`claude-opus-4-7` o `claude-sonnet-4-6` para costos) con las URLs de fotos. Prompt cacheable (la parte sistema con la guía inmobiliaria).

**Variables nuevas en Netlify:**
- `ANTHROPIC_API_KEY` (si no existe ya)

**Costo aproximado:** ~$0.05 por propiedad analizada (cacheable, así que solo primera vez).

### F3.2 — Generador de buyer persona

**Archivo a crear:** [lib/marketing/buyer-persona-generator.ts](lib/marketing/buyer-persona-generator.ts)

```ts
export async function generateBuyerPersona(input: {
  property: Property;
  highlights: Highlight[];
  neighborhoodData?: { medianAge: number; medianIncome: number; familyShare: number };
}): Promise<{
  ageRange: [number, number];
  income: 'medio' | 'medio-alto' | 'alto' | 'premium';
  familyStatus: 'soltero/pareja sin hijos' | 'familia chica' | 'familia con hijos crecidos' | 'inversor';
  lifestyle: string[]; // ej. ["valora vida activa", "trabaja en zona céntrica", "busca primera vivienda"]
  communicationTone: 'aspiracional' | 'práctico' | 'familiar' | 'urgente';
  hooks: string[]; // 3 ángulos de copy que resonarían
}>
```

**Datos del barrio:** usar dataset local CABA + AMBA (ya existe en `lib/data/neighborhoods.ts`?) o consultar Google Places para hints geográficos.

### F3.3 — Selector geográfico simplificado

**Archivo a crear:** [lib/marketing/geo-targeting-presets.ts](lib/marketing/geo-targeting-presets.ts)

3 presets pre-calculados por el sistema:

1. **"Cercanos"** — radio 3km del lat/lng (cuando hay alta densidad poblacional).
2. **"Barrios con perfil similar"** — clusters CABA/AMBA por nivel socioeconómico. Tabla nueva `neighborhood_clusters` con groupings.
3. **"Amplio (toda CABA)"** — para premium / inversores.

**Tabla nueva:** `supabase/migrations/20260522000002_neighborhood_clusters.sql`
```sql
CREATE TABLE public.neighborhood_clusters (
  cluster_id text PRIMARY KEY,
  name text NOT NULL,
  cities text[] NOT NULL,
  neighborhoods text[] NOT NULL,
  socioeconomic_level text NOT NULL,
  median_income_usd numeric
);
```

Seed con datos públicos (INDEC, censo).

### F3.4 — Generador de copy

**Archivo existente a expandir:** [lib/marketing/copy-ai-generator.ts](lib/marketing/copy-ai-generator.ts) ya existe — lo extendemos.

**Nuevo método:**
```ts
export async function generatePropertyAdCopy(input: {
  property: Property;
  persona: BuyerPersona;
  highlights: Highlight[];
  emphasizedHighlight: Highlight;
  customNote?: string; // comentario del asesor
}): Promise<{
  headline: string;
  primaryText: string;
  description: string;
  cta: 'Más información' | 'Obtener oferta' | 'Reservar visita';
  variants: { headline: string; primaryText: string }[]; // 3 variantes A/B
}>
```

### F3.5 — Recomendador de presupuesto

**Archivo existente a expandir:** [lib/marketing/budget-rules.ts](lib/marketing/budget-rules.ts)

Reglas basadas en:
- Precio de la propiedad
- Barrio y nivel socioeconómico target
- Tipo de operación (venta vs alquiler)
- Histórico de campañas del cliente (si existe)

Devuelve `{ daily: number; total: number; durationDays: number; reasoning: string }` en ARS.

### F3.6 — Componente wizard Meta

**Archivo a crear:** [components/properties/wizards/MetaAdsWizard.tsx](components/properties/wizards/MetaAdsWizard.tsx)

6 sub-componentes (uno por paso). Estado global via Zustand store local del wizard.

### F3.7 — Endpoint de creación de campaña con preset inteligente

**Archivo a modificar:** [lib/marketing/meta-campaign-builder.ts](lib/marketing/meta-campaign-builder.ts) ya existe — agregar parámetros del wizard.

**Nuevo endpoint:** [app/api/properties/[id]/meta-launch/route.ts](app/api/properties/[id]/meta-launch/route.ts)

**Naming convention de campaña** (importante por requerimiento del usuario):
```
[CAPT-{propertyId-last-4}] {Calle abreviada} - {Barrio} - {Tipo} - {Operacion}
```
Ejemplo: `[CAPT-a4f2] Av Santa Fe 1234 - Palermo - Depto - Venta`

Así el usuario en Ads Manager identifica visualmente la propiedad.

### F3.8 — Selector de foto principal con razón

En paso 5, asesor ve grid de fotos con label de cada highlight. Puede:
- Marcar foto como "principal del ad"
- Agregar nota: "Esta es la pileta más grande del edificio"

Esa nota se incorpora al copy generation como contexto adicional.

---

## F4 — Pixel + CAPI + Inbox de leads

### F4.1 — Verificar/completar Pixel en landing

**Archivos a revisar:** [app/p/[slug]/page.tsx](app/p/[slug]/page.tsx) o equivalente.

Eventos a disparar:
- `PageView` (automático con Pixel)
- `ViewContent` con `content_ids: [propertyId]`, `value: askingPrice`, `currency: 'USD'`
- `Lead` cuando el form se submite
- `Contact` cuando se clickea WhatsApp/teléfono

### F4.2 — CAPI server-side (deduplication con eventID)

**Archivo a crear:** [lib/marketing/meta-capi.ts](lib/marketing/meta-capi.ts)

Usar el reference doc `cognymkt-meta-capi` skill como guía. Eventos:
- `Lead` con `event_id` único compartido entre Pixel y CAPI (deduplication).
- Hashing SHA-256 de email/phone antes de enviar.

### F4.3 — Schema `property_leads` + RLS

**Migración:** `supabase/migrations/20260522000003_property_leads.sql`

```sql
CREATE TABLE public.property_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('landing_form', 'meta_instant_form', 'whatsapp_click', 'phone_click')),
  full_name text,
  phone text,
  email text,
  message text,
  utm_source text, utm_campaign text, utm_medium text, utm_term text, utm_content text,
  meta_campaign_id text,
  meta_adset_id text,
  meta_ad_id text,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'discarded', 'converted')),
  assigned_to uuid REFERENCES profiles(id) ON DELETE SET NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  contacted_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_property_leads_property ON property_leads(property_id);
CREATE INDEX idx_property_leads_assigned_to ON property_leads(assigned_to) WHERE status = 'new';

-- RLS
ALTER TABLE property_leads ENABLE ROW LEVEL SECURITY;

-- Admin/dueno/coordinador ven todo
CREATE POLICY "admin_full_access" ON property_leads FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid()
            AND role IN ('admin', 'dueno', 'coordinador'))
  );

-- Asesor solo ve leads de sus propiedades
CREATE POLICY "asesor_own_property_leads" ON property_leads FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM properties p WHERE p.id = property_id AND p.assigned_to = auth.uid())
    AND
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'asesor')
  );
```

### F4.4 — UI inbox

**Archivo a crear:** [app/(dashboard)/inbox/page.tsx](app/(dashboard)/inbox/page.tsx)

- Lista de leads filtrable por: propiedad, fuente, estado.
- Badges visuales (nuevo, contactado, etc).
- Click → drawer con detalle + acciones (marcar contactado, asignar, etc).
- Asesor solo ve los suyos. Admin ve todos con filtro por asesor.

### F4.5 — Email notification al asesor cuando llega lead

Hook después de INSERT en `property_leads`. Reutilizar [lib/email/resend-client.ts](lib/email/resend-client.ts).

---

## F5 — Landing optimizada para conversión (PROPOSITIVO)

**No se implementa ahora.** Una vez F1-F4 estén funcionando y el usuario diga "me encanta", **traigo propositivamente** este tema:

> "Ahora que la campaña dirige tráfico a la landing, te traigo el tema de la landing. La actual sirve para mostrar la propiedad pero no está optimizada para que el visitante de Meta se convierta en lead. Te propongo rediseñarla con: hero sticky con CTA persistente, formulario inline corto (3 campos), prueba social, secciones cortas con scroll storytelling, optimización LCP/INP, y testing A/B."

---

## QA — Agente de pruebas end-to-end

Después de cada fase, lanzar un **agente especializado de QA** (subagent_type: claude o feature-dev:code-reviewer) con instrucciones específicas:

**Para F0:**
- Verificar que el cleanup endpoint cierre el item pendiente.
- Verificar typecheck pasa.
- Test unitario del filtrado de attributes ML.

**Para F1:**
- Verificar que NO se crean filas en `property_listings` ni `meta_provision_jobs` al pasar a `approved`.
- Verificar que el popup aparece al captar.
- Verificar permisos por rol.

**Para F2:**
- Verificar wizard renderiza con property fixture.
- Verificar edit overrides persisten en DB.
- Verificar publicar real en cuenta de test ML termina exitoso.

**Para F3:**
- Verificar análisis vision retorna highlights válidos.
- Verificar buyer persona varía por barrio/precio.
- Verificar copy se genera y respeta límites Meta (125 chars primary text).
- Verificar campaña se crea PAUSED.

**Para F4:**
- Verificar Pixel dispara eventos correctos.
- Verificar CAPI deduplica con Pixel.
- Verificar lead llega al inbox y al email del asesor correcto.
- Verificar RLS: asesor B no ve leads del asesor A.

---

## Anticipación: 14 dimensiones de impacto

Aplicando el skill `anticipating-implementation-conflicts`:

| Dimensión | Riesgo identificado | Mitigación |
|-----------|---------------------|------------|
| 1. RLS | Inbox de leads necesita policy por asesor | Definida en F4.3 |
| 2. Migrations | DROP TRIGGER puede romper tests | F1.1 mantiene funciones, solo drop trigger |
| 3. Pg cron / vault | No usamos pg_cron en este plan | N/A |
| 4. Landing isolation | El wizard no debe romper la landing existente | F5 explícitamente diferido; F2 usa `ml_overrides` separados |
| 5. Native vs web | App es web (Next.js), no Capacitor | N/A |
| 6. Triggers FK row actual | Ninguno de los nuevos triggers escribe a tablas con FK al row | N/A |
| 7. Idempotencia | Cada endpoint debe ser idempotente | F2.3 y F3.7 usan upsert con onConflict |
| 8. Permisos / roles | Asesor solo sus propiedades; admin/dueno/coordinador todo | Aplicado en F1.2, F4.3, F4.4 |
| 9. UNIQUE constraints en upsert | property_listings, meta_provision_jobs, property_leads | Verificar todas tienen unique + onConflict |
| 10. Email | Reusar Resend client existente | F4.5 |
| 11. Scraper | No tocamos scraper en este plan | N/A |
| 12. Tokens / secrets | Token Meta NUNCA en DB ni código | F0.4 documenta en Netlify env vars solo |
| 13. Deploy target | Netlify functions tienen restricción de `@/` paths | F4.2 CAPI handler va a `app/api/*` (Next route, no Netlify Function) o se inlinea si va a `.mts` |
| 14. Filenames Unicode | No aplica a este plan | N/A |

---

## Cómo se ejecuta este plan

1. **Aprobación del plan** por el usuario (este documento).
2. **Implementación F0** (fixes urgentes) — sesión actual, sin esperar nada.
3. **Configurar env vars Meta** en Netlify (acción del usuario, ~5 min).
4. **Redeploy** del sitio.
5. **Implementación F1** (eliminar auto + popup) — siguiente sesión.
6. **QA pass F1** con agente.
7. **Implementación F2** (wizard ML manual).
8. **QA pass F2**.
9. **Implementación F3** (wizard Meta inteligente — más grande, puede dividirse en sub-tasks).
10. **QA pass F3**.
11. **Implementación F4** (pixel + CAPI + inbox).
12. **QA pass F4**.
13. **Smoke test end-to-end manual** del usuario (publicar propiedad real + crear campaña real con presupuesto mínimo).
14. **Entrega final.**
15. **F5 traída propositivamente** cuando el usuario apruebe la versión final.

---

## SQL que el usuario va a tener que ejecutar manualmente

> Recordatorio del CLAUDE.md: el usuario corre SQL en el Dashboard SQL Editor de Supabase, no por CLI.

**F1.1 — Desactivar triggers** (`20260522000001_disable_auto_publish_triggers.sql`)
**F3.3 — Tabla neighborhood_clusters** (`20260522000002_neighborhood_clusters.sql`)
**F4.3 — Tabla property_leads + RLS** (`20260522000003_property_leads.sql`)

Cada uno se entrega al usuario al cerrar la fase correspondiente, con copy-paste a SQL Editor.

---

## Apertura: lo que se mantiene de planes anteriores

- **Landing actual en `/p/[slug]`**: queda funcional. F5 la rediseña, pero no la rompe en el camino.
- **Worker `publish-listings.mts`**: queda corriendo para procesar la fase de pausing/unpublishing post-publicación manual.
- **Worker `sync-portal-metrics.mts`**: queda corriendo, ahora con menos volumen.
- **Email notifications system**: se reutiliza, no se reemplaza.

---

## Pregunta pendiente para el usuario (no bloquea aprobación)

Antes de F3, necesito una decisión sobre el modelo de IA para el análisis de fotos:

- **Opción A** — Claude Opus 4.7 (mejor calidad, ~$0.05/propiedad).
- **Opción B** — Claude Sonnet 4.6 (calidad muy buena, ~$0.01/propiedad).
- **Opción C** — Claude Haiku 4.5 (calidad aceptable, ~$0.002/propiedad).

Recomiendo **B (Sonnet 4.6)** como default. Es el sweet spot calidad/costo para análisis de imágenes inmobiliarias.

---

## Métricas de éxito del plan

Al cierre del plan (F0-F4 completas), el usuario debe poder:

1. ✅ Captar una propiedad real y ver el popup post-captación.
2. ✅ Publicar manualmente en ML con preview + edit.
3. ✅ Lanzar campaña Meta con asistente que hace 99% del trabajo creativo.
4. ✅ Ver leads entrar al inbox propios (si asesor) o todos (si admin).
5. ✅ Confirmar que el sistema NO publica/lanza nada sin click intencional del usuario.
6. ✅ Cero items huérfanos en ML por errores de pausa.
