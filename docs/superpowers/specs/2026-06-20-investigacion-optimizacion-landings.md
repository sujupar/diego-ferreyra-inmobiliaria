# Optimización de 2 Landings (Tasación + Clase Gratuita) — Arquitectura técnica consolidada

> Stack: Next.js 16.0.10 + React 19 + TypeScript 5 + Supabase + Resend + Meta Ads (Pixel + CAPI). Deploy Netlify (auto en push a `main`). **Restricción dura:** no romper captura de leads, conversiones Meta (Pixel+CAPI dedup por `eventId`), públicos por etapa, CRM ni métricas. Todo cambio de schema es **aditivo** (migraciones a mano en el SQL Editor de Supabase — el CLI no conecta).
>
> Fuente: workflow de investigación `research-optimizacion-landings` (5 frentes + síntesis), 2026-06-20.

---

## 0. Resumen ejecutivo de decisiones

| Tema | Decisión | Justificación corta |
|---|---|---|
| **Video de la CLASE (~13 min)** | **Self-host** sobre `<video>` + tracking propio. Hosting a confirmar: Cloudflare R2 (egress gratis, ~$0) vs Supabase Pro ($25/mes) | El archivo no entra en Supabase Free (50 MB). Lo clave: la medición debe vivir en NUESTRA tabla para unificar la analítica de la clase con los hero (mismo `<video>`, mismo esquema). |
| **Identidad anónima** | UUID v4 propio (`anon_id`) en cookie first-party `df_anon` (2 años) + fallback `localStorage` | Estándar 2025-2026. No PII. Bajo nuestro control vs `_fbp` (90d). |
| **`_fbp`/`_fbc`** | Columnas de **atribución**, NO identidad de tracking | Solo existen para tráfico Meta / con consentimiento. |
| **Modelo de % visto** | Estado-por-(visitante, video) con UPSERT idempotente + UNIQUE | Reduce 100x el volumen vs append y elimina doble conteo. |
| **Métrica de % visto** | Reportar DOS: `max_percent` (profundidad) y `watch_seconds/duration` (atención real anti-inflado) | Son distintas; la honesta para promedios es `watch_seconds/duration`. |
| **UTM en CRM** | Columnas dedicadas `meta_*` + `utm` JSONB como respaldo | El asesor lee "de qué anuncio vino" sin parsear JSON; permite `GROUP BY`. |
| **Macros Meta** | Nombres **+** IDs (8 macros) inyectados por código en `url_tags` del AdCreative | Nombres = lectura instantánea; IDs = inmutables. |
| **Click-to-play** | Poster como `next/image priority` (= LCP), montar `<video>` solo al click | Elimina descarga/decodificación de MP4 en el viewport inicial. |
| **framer-motion** | Sacar del bundle crítico (CSS reveal o LazyMotion+dynamic) | ~30-50 KB gz que empeoran INP/TBT. |

---

## 1. Performance / Core Web Vitals (R1: LCP≤2.0s / INP≤200ms / CLS≤0.05 mobile)

### 1.1 LCP — el cambio más grande
`FunnelHeroVideo.tsx` usa hoy `<video autoPlay muted preload="metadata">` con `poster` crudo. Eso descarga headers + primer segmento del MP4 en el primer viewport, compitiendo con el LCP. **Solución (cumple además R2):** render inicial = `<Image priority fetchPriority="high">` del poster + botón play; al `onClick` montar `<video preload="auto" autoPlay controls>` (play con audio válido dentro del gesto del usuario). `FunnelClickToPlayVideo.tsx` **ya** implementa este patrón → es la base a generalizar.

### 1.2 `next.config.ts` (Next 16)
- `images.formats: ['image/avif','image/webp']` (el default NO trae AVIF; -20-30% peso).
- `images.qualities: [60, 75]` (Next 16 coacciona qualities fuera de la lista). Poster hero `quality={60-65}`.
- Verificar que el project ref de `NEXT_PUBLIC_SUPABASE_URL` prod coincida con `images.remotePatterns`, o el optimizador devuelve 400 y el poster (LCP) no carga.

### 1.3 Preconnect (hoy no hay)
En `app/(funnels)/layout.tsx`: preconnect a Supabase Storage (crossOrigin) + a `connect.facebook.net`.

### 1.4 INP / JS de cliente
- Sacar **framer-motion** de `ScrollReveal.tsx` (CSS `@keyframes` + IntersectionObserver, manteniendo `prefers-reduced-motion`).
- `FunnelLeadModal` con `dynamic({ssr:false})` + prefetch del chunk en `onMouseEnter` del CTA.
- Contenido estático de `TasacionClient`/`ClaseClient` → Server Components; `'use client'` solo en CTA→modal, video, pixel, tracker.

### 1.5 Scripts de terceros (NO tocar lo que funciona)
- Pixel en `afterInteractive` (NO `lazyOnload`, NO Partytown). Dedup Pixel↔CAPI por `eventId` **intocable**.

### 1.6 CLS
- `aspect-video` en el contenedor; aspect-ratio explícito del logo; pesos de fuente reducidos (Montserrat 600/700/800, Lato 400/700).

### 1.7 Medición (RUM)
- `<WebVitalsReporter>` en `layout.tsx` con `web-vitals/attribution` → `navigator.sendBeacon` a `/api/landing/vitals` (persiste en Supabase). Lighthouse/PSI mobile antes/después como check.

---

## 2. Video click-to-play (R2)

Un único `<TrackedVideo>` (evolución de `FunnelClickToPlayVideo`): poster `next/image priority` + play → al click monta `<video preload="auto" autoPlay playsInline controls>` con audio + engancha el tracking (sección 3). Acepta MP4 hoy y HLS a futuro (`hls.js`, misma API de eventos). Migrar: `TasacionClient` (hero), `ClaseClient` (VSL), `GraciasClaseClient` (ya usa click-to-play).

---

## 3. Video analytics (R3): anónimo + registrado, por fecha y segmento

**Arquitectura:** self-host + endpoint Next.js + estado en Postgres (única opción que segmenta por nuestro `contact_id`/`funnel` y unifica heros + clase, sin costo de terceros).

**Cliente (`<TrackedVideo>`):** `anon_id` (cookie `df_anon` 2a + localStorage), listeners `loadedmetadata`/`timeupdate` (throttle 1/s)/`pause`/`ended`/`visibilitychange(hidden)`/`pagehide`. Anti-inflado: bitmap `Set<floor(currentTime)>` → `watch_seconds = set.size` (seek NO rellena). `max_percent` = `currentTime/duration`. Hitos 25/50/75/95/100 en bitmap. Flush idempotente cada 15s + pause + `visibilitychange/pagehide` con `sendBeacon` (NUNCA `unload`).

**Endpoint `app/api/track/video` (POST público):** valida, resuelve `contact_id`, UPSERT con `GREATEST`/OR-bitmap.

### Esquema SQL (aditivo)
```sql
create table video_view_state (
  id uuid primary key default gen_random_uuid(),
  anon_id uuid not null,
  contact_id uuid references contacts(id) on delete set null,
  video_key text not null,            -- slug estable: 'clase-vsl', 'hero-tasacion'
  context text,                       -- 'hero' | 'clase'
  page_path text,
  duration_s numeric(8,2),
  watch_seconds numeric(8,2) not null default 0,   -- atención real
  max_percent smallint not null default 0,         -- 0..100 profundidad
  quartiles smallint not null default 0,           -- BITMAP 1=25 2=50 4=75 8=95 16=100
  completed boolean not null default false,
  funnel text,                        -- 'tasacion' | 'clase'
  fbp text,
  first_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (anon_id, video_key)         -- OBLIGATORIA para que el upsert dedupe
);
create index idx_vvs_video_updated on video_view_state (video_key, updated_at);
create index idx_vvs_contact on video_view_state (contact_id);

create table anon_identity (
  anon_id uuid primary key,
  contact_id uuid references contacts(id) on delete set null,
  first_seen timestamptz not null default now(),
  identified_at timestamptz
);

-- (OPCIONAL) append-log para curva de retención
create table video_events (
  id uuid primary key default gen_random_uuid(),
  anon_id uuid not null, contact_id uuid, video_key text not null,
  event_type text not null, at_percent smallint, watch_seconds numeric(8,2),
  funnel text, created_at timestamptz not null default now()
);
```
**UPSERT (toma siempre el máximo):** `on conflict (anon_id, video_key) do update set watch_seconds=greatest(...), max_percent=greatest(...), quartiles=quartiles|excluded.quartiles, completed=... or ..., updated_at=now()`.

> Gotcha del proyecto: `supabase-js .upsert(..., {onConflict})` SOLO deduplica con la UNIQUE en la DB; sin ella → INSERT puro → métricas infladas.

**Stitching anónimo→lead:** campo oculto `anon_id` en el form → al crear contacto: `INSERT anon_identity ON CONFLICT (anon_id) DO UPDATE SET contact_id=excluded.contact_id WHERE anon_identity.contact_id IS NULL` + back-fill `UPDATE video_view_state SET contact_id=$1 WHERE anon_id=$2 AND contact_id IS NULL`.

**Segmentación (RPC para Embudos) — refinado con feedback del cliente:**
- **Segmento base:** `no_registrado` (sin `contact_id`) vs `registrado` (tiene `contact_id`). **"Conversión" = registrarse en la landing** (llenó el form de tasación o de clase) → eso es `registrado`.
- **Dimensión adicional FILTRABLE por etapa del deal** (`agendada`/`visitada`/`captada`/`perdida`/…): la RPC hace join `contact → deal.stage` y devuelve el breakdown por etapa, **además** acepta un filtro opcional `stage`. Objetivo del cliente: descubrir correlaciones como *"los que terminamos captando vieron en promedio el 80% del video"* — dato que se perdería si solo segmentáramos registrado/no-registrado.
- Reportar `avg(max_percent)` + `avg(100*watch_seconds/duration_s)` + completados, por `video_key` + segmento/etapa + rango de fechas. Filtros anti-bot (UA, requerir play real + watch_seconds>0).

---

## 4. Atribución UTM Meta → CRM (R5, NO negociable)

Gran parte ya existe (`LandingVisitTracker`, `landing_page_visits` con `utm_*`+`fbclid`, CAPI con `fbp`/`fbc`/`eventId`). Falta: macros en el Ad, capturar IDs, propagar al deal, mostrarlo.

**Macros (8) en `url_tags` del AdCreative — inyectar por código en `meta-campaign-builder.ts`:**
```
utm_source={{site_source_name}}   utm_medium=paid
utm_campaign={{campaign.name}}    utm_content={{ad.name}}    utm_term={{adset.name}}
fb_campaign_id={{campaign.id}}    fb_adset_id={{adset.id}}    fb_ad_id={{ad.id}}    fb_placement={{placement}}
```
Nombres = lectura inmediata; IDs = inmutables (resuelven nombre actual vía Marketing API y linkean al Ads Manager). Los `{{*.name}}` se congelan al publicar → por eso también IDs.

**Captura first-party:** `LandingVisitTracker` suma `fb_*_id`/`placement` y persiste `attribution` en `localStorage` + cookie `df_attr` (**first-touch**). El submit lee de storage/cookie (NO de `window.location.search`). Reconstruir `fbc` desde `fbclid` si falta.

**Modelo de datos (aditivo):**
- `landing_page_visits`: + `fb_campaign_id/adset_id/ad_id/placement`.
- `deals`: + `meta_campaign_id/name`, `meta_adset_id/name`, `meta_ad_id/name`, `meta_placement`, `meta_site_source` (text nullable) + `origin_metadata` jsonb. `createFunnelLead` copia la atribución antes de crear el deal (no toca dedup; columnas inertes para el trigger AFTER `deal_stage_history`).
- (Opcional) `meta_entity_names(id, level, name, fetched_at)` TTL 24h.

**Dónde mostrarlo:** `app/(dashboard)/pipeline/[id]/page.tsx` → bloque "Origen de la campaña" (campaña/conjunto/anuncio + badge `fb`/`ig`/`msg`/`an` + placement + links al Ads Manager por ID). Chip de campaña en la lista. Sin params → "Directo/Orgánico".

**No mezclar pipelines:** UTMs nunca al payload CAPI; `fbc`/`fbp` nunca al CRM como campaña. Dedup `eventId` intacto.

---

## 5. Panel Embudos súper-detallado (R4)

Extender `/api/funnels/metrics` + `EmbudosClient.tsx` con:
- **Breakdown por campaña:** `byCampaign[]` `{campaign, visits, conversions, pct}` (de `landing_page_visits.utm_campaign` + `deals.meta_campaign_id`; opcional CPA cruzando `meta_ads_daily`).
- **Analítica de video:** por funnel + segmento (no-reg/reg/convertido): `avg(max_percent)`, `avg(watch_seconds/duration)`, % completaron, embudo de cuartiles. Vía la RPC de la sección 3, filtrable por fecha.
- Si crece a 1M+ filas, mover `countByDay` (paginación 1000/1000) a RPC de agregación.

---

## Plan por fases

- **Fase 0 — Medición base (RUM):** `<WebVitalsReporter>` + `/api/landing/vitals` + migración `landing_vitals`. Baseline Lighthouse antes de tocar nada.
- **Fase 1 — Performance + click-to-play (R1+R2):** reescribir `FunnelHeroVideo` → `<TrackedVideo>`; `next.config.ts` (avif/qualities); preconnect; framer-motion fuera; modal `dynamic`; Server Components. Sin migraciones.
- **Fase 2 — Infra video analytics (R3, TDD):** migraciones `video_view_state` (UNIQUE) + `anon_identity` + RPC; cliente tracker; endpoint `/api/track/video`; stitching en `createFunnelLead`; subir video de la clase + aplicar `<TrackedVideo>`.
- **Fase 3 — Atribución UTM → CRM (R5):** macros en `meta-campaign-builder`; captura en `LandingVisitTracker`; propagación en `createFunnelLead`; migraciones `landing_visits_meta_ids` + `deals_meta_attribution`; bloque "Origen de la campaña" en `pipeline/[id]`.
- **Fase 4 — Embudos detallado (R4):** extender `/api/funnels/metrics` + `EmbudosClient` con breakdown por campaña + analítica de video por segmento.

## Riesgos transversales
- UPSERT requiere UNIQUE real (lección documentada).
- Segmentos/origin enumerados explícitamente, nunca `IS DISTINCT FROM`.
- RLS: tracking tables → INSERT anon, SELECT service/admin.
- FK a `contacts` → `ON DELETE SET NULL`.
- Tracking client-side es estimación (aceptable para métrica interna).

## Preguntas abiertas (para confirmar antes de Fase 2/3)
1. **Hosting del video de la clase:** Cloudflare R2 (egress gratis, ~$0, self-host medible) vs Supabase Pro ($25/mes) vs Bunny Stream (~$1-2, rompe unificación).
2. Definición exacta de **"convertido"** (propuesta: `deals.stage='captured'`).
3. Nivel de detalle del panel Embudos (esencial vs avanzado con CPA + retención).
4. Consentimiento de analytics (documentar en privacidad vs banner).
5. Confirmar project ref Supabase de PRODUCCIÓN para `images.remotePatterns`.
6. First-touch vs last-touch (propuesta: first-touch).
