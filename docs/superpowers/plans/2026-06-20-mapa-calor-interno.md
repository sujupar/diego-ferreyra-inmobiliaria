# Plan — Mapa de calor 100% INTERNO de las landings (sin apps externas)

> Reemplaza Microsoft Clarity por un sistema propio: data en nuestra Supabase, render en
> nuestro panel Embudos. Para registrados Y no-registrados (segmentable por el `anon_id`).
> Sin tocar lo visual ni el flujo de registro.

## La idea clave (lo que lo hace factible y bueno)
El problema difícil de un heatmap es **normalizar las coordenadas entre pantallas** (un clic en
(300,1200) en mobile ≠ en desktop). Como **el código de las landings es nuestro**, lo evitamos:
**etiquetamos cada sección** con `data-hm="hero"`, `data-hm="cta-final"`, etc., y registramos todo
**relativo a la sección** (no a píxeles absolutos). Una sección reflowea responsive pero mantiene
su layout proporcional, así que un clic en el botón del CTA cae siempre en ~el mismo %x/%y de SU
sección, en cualquier pantalla. Esto da un heatmap responsive-robusto sin screenshots para los datos.

## Qué mide (para registrados y no-registrados)
1. **Scroll funnel:** % de visitantes que llega a cada sección (dónde se van).
2. **Atención por sección:** tiempo promedio que cada sección está en pantalla (IntersectionObserver).
3. **Clics por sección** + posición relativa (%x/%y dentro de la sección) + tipo de elemento (botón/link/otro) + rage clicks (varios clics rápidos en el mismo punto).
4. **Segmentos:** anónimo vs registrado (vía `anon_id`/stitching) + dispositivo (mobile/desktop).
5. Por landing (Tasación / Clase) y por rango de fechas.

## Secciones a etiquetar (`data-hm`) — NO cambia nada visual, solo agrega un atributo
- **Tasación:** `topbar`, `hero`, `video`, `cta-hero`, `benefits`, `stat`, `testimonios`, `cta-final`, `footer`.
- **Clase:** `topbar`, `hero`, `video`, `cta-hero`, `social-proof`, `bio`, `cta-final`, `footer`.

## Arquitectura

### Cliente — `lib/funnel/heatmap-tracker.ts` + `<FunnelHeatmapTracker>` (gemelo del tracker de video)
- Al montar la landing: detecta `anon_id` (ya existe), `device` (innerWidth → mobile/tablet/desktop), `page` (tasacion/clase), `viewport`.
- **Secciones:** `document.querySelectorAll('[data-hm]')` → IntersectionObserver acumula `visible_ms` por sección (mientras >50% visible) + marca `reached`.
- **Scroll:** listener throttled → `max_scroll_pct = (scrollY+innerHeight)/docHeight*100` (guarda el máximo).
- **Clics:** listener global → busca el `[data-hm]` ancestro más cercano → calcula `x_pct,y_pct` dentro del rect de esa sección + `tag` del elemento. Detecta rage (≥3 clics <1s en ~mismo punto).
- **Flush idempotente:** cada 15s + `visibilitychange(hidden)`/`pagehide` con `sendBeacon` (igual que el video, sin romper bfcache). Payload = resumen agregado por sesión: `{anonId, page, device, maxScrollPct, sections:[{key,reached,visibleMs}], clicks:[{section,xPct,yPct,tag,rage}]}`.
- Anti-inflado/abuso: cap de clics por sesión (ej. 60); throttle de scroll; ignora sesiones sin interacción real.

### Endpoint — `app/api/track/heatmap/route.ts` (público, service-role)
- Valida (zod). Resuelve `contact_id` desde `anon_identity` (como el video). UPSERT idempotente del estado de sesión + inserta los clics nuevos.

### Modelo de datos (migración aditiva)
```sql
-- Estado por (visitante, página): scroll + tiempo por sección (jsonb), una fila por sesión-página.
create table heatmap_session_state (
  id uuid primary key default gen_random_uuid(),
  anon_id text not null,
  contact_id uuid references contacts(id) on delete set null,
  page text not null,                       -- 'tasacion' | 'clase'
  device text,                              -- 'mobile' | 'desktop' | 'tablet'
  max_scroll_pct smallint not null default 0,
  sections jsonb not null default '{}',     -- { hero:{reached:true,ms:4200}, ... }  (GREATEST al mergear)
  funnel text,
  first_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (anon_id, page)
);
-- Clics individuales (pocos por sesión) para el overlay y densidad.
create table heatmap_clicks (
  id uuid primary key default gen_random_uuid(),
  anon_id text not null,
  contact_id uuid references contacts(id) on delete set null,
  page text not null,
  device text,
  section text,
  x_pct numeric(5,2),                       -- 0..100 dentro de la sección
  y_pct numeric(5,2),
  tag text,                                 -- 'button'|'a'|'video'|'other'
  rage boolean default false,
  created_at timestamptz not null default now()
);
create index idx_hm_clicks_page on heatmap_clicks (page, device, created_at);
-- RLS ON sin policies (solo service-role, como video_view_state).
```
- RPC `upsert_heatmap_session(...)` (GREATEST de scroll, merge de `sections` por máximo de ms/reached, resuelve contact_id).
- `link_anon_to_contact` extendido para back-fillear también heatmap (state + clicks) por `anon_id`.

### Agregación (RPCs para el panel)
- `heatmap_section_stats(p_from,p_to)` → por (page, section, segment, device): `viewers_reached`, `avg_visible_ms`, `click_count`, `% que llegó`. Para el **mapa de secciones** (scroll funnel + atención + clics + drop-off).
- `heatmap_clicks_agg(p_from,p_to,page,device,segment)` → clics (section, x_pct, y_pct, rage) para el **overlay de densidad**.

### Panel (interno, en Embudos) — reemplaza el botón a Clarity
- **Fase A (v1) — Mapa de secciones (alto valor, sin screenshots):** vista vertical de la landing en orden; cada sección muestra: barra de **% que llegó** (scroll funnel), **tiempo promedio**, **# de clics**, y **drop-off** (cuánto se cae respecto a la anterior). Filtros: segmento (anónimo/registrado/etapa) + dispositivo. Esto responde "dónde pasan el tiempo, dónde se van, qué clickean".
- **Fase B (v2) — Overlay visual de clics:** una captura de cada landing (mobile + desktop) guardada en R2/Storage; en el panel se renderiza la imagen con una capa `<canvas>` de **densidad de clics** (blobs de calor) mapeando `section + x%/y%` a coordenadas de la captura. Es el heatmap "bonito" estilo Clarity, pero interno. Requiere un pipeline de captura de pantalla (lo generamos nosotros, una vez por breakpoint y por cambio de diseño).

## Fasing recomendado
- **v1 (Fase A):** capturador + endpoint + tablas + RPC de secciones + UI del mapa de secciones. **Factible ya, 100% interno, segmentable.** Entrega el 80% del valor.
- **v2 (Fase B):** overlay visual sobre screenshots (el render "pixel". Más trabajo: pipeline de captura + canvas).

## Costo de almacenamiento (Supabase free) — sin problema
~1 fila de estado por sesión-página + ~3-10 clics. A 1.000 sesiones/mes ≈ 1.000 filas + ~5.000 clics =
kilobytes. El free tier (500MB DB) lo absorbe sobrado.

## No romper
- Solo se **agregan** `data-hm` (atributos, cero efecto visual) + un componente tracker (client, async, sin bloquear) + endpoints/tablas nuevas. No toca el form, el submit, el video, ni el LCP.
- Mismo patrón de privacidad: sin PII (solo `anon_id`, secciones, coords relativas, device).

## Sobre Clarity
Lo dejamos **apagado** (sacamos el script + el botón externo) y lo reemplaza este sistema interno.
Decisión: ¿sacamos Clarity ya, o lo dejamos corriendo en silencio como respaldo mientras construimos v1?

## Honestidad técnica
- v1 (mapa de secciones) iguala/мejora lo más accionable de Clarity (scroll, atención, clics, drop-off) y es **nuestro**.
- v2 (overlay sobre screenshot) se acerca al look de Clarity pero **nunca va a tener** las grabaciones
  de sesión (session replay) de Clarity sin un esfuerzo enorme (grabar el DOM tipo rrweb). Si el replay
  es importante, eso es lo único que un sistema interno realista no cubre. ¿Es necesario el replay?
