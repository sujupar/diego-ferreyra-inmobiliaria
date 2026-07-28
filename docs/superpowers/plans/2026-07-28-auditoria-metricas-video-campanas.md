# Auditoría + fix — Métricas de video y campañas (Embudos)

> Reportado por el usuario 2026-07-28: (1) el filtro "Registrados" da todo cero,
> (2) las vistas de video parecen muy por debajo de la interacción real,
> (3) aparece `{{campaign.name}}` como si fuera una campaña.

## Evidencia (datos reales de producción, no supuestos)

| Métrica | Valor |
|---|---|
| Sesiones por dispositivo | **365 mobile / 52 desktop** (87% mobile) |
| Filas en `video_view_state` | 25 (hero-tasacion 13, hero-clase 8, clase-completa 4) |
| Filas con `contact_id` (registrados) | 5 — **todas de clase**, ninguna de tasación |
| Anon identificados (registrados) | 15 → **solo 3 tienen fila de video** |
| Fallos de back-fill del stitching | **0** (el stitching funciona bien) |
| Clics en la sección hero | 81 (52 `button`, 23 `other`, 6 `video`) |
| Visitas con `utm_campaign` = `{{campaign.name}}` | **60** (39 tasación + 21 clase) |

## Causa raíz #1 — El video NO arrancaba en mobile (subregistro masivo)

`FunnelClickToPlayVideo` montaba el `<video autoPlay>` **con sonido** recién en el
re-render posterior al clic. iOS/Android no lo consideran un gesto directo del
usuario → **bloquean el playback**. Sin playback no hay `timeupdate`, y sin eso la
vista **nunca se registraba**. Con 87% de tráfico mobile, se perdía la mayoría.

Esto explica también el síntoma (2): 31 clics de botón en el hero de tasación vs
13 vistas registradas.

**Fix:** el `<video>` vive siempre en el DOM con `preload="none"` (0 bytes hasta el
play, el LCP sigue siendo el poster) y el clic llama `video.play()` **dentro del
gesto**. Si el navegador aun así rechaza el sonido → cae a `muted` + botón
"Activá el sonido". Además se registran **intento de play** y **playback efectivo**
por separado, para que un bloqueo futuro sea visible en el panel y no invisible.

## Causa raíz #2 — "Registrados = 0" NO era un bug del filtro

El filtro y el stitching están bien (0 filas huérfanas). El cero era **dato real**
provocado por la causa #1: de 15 registrados, solo 3 tenían video, y los 3 eran de
clase. Al arreglar la reproducción, el segmento se puebla solo.

Refuerzos aplicados igual:
- Las 3 RPCs de video resuelven el segmento con `coalesce(v.contact_id, ai.contact_id)`
  (LEFT JOIN a `anon_identity`) → defensa si algún back-fill no corriera.
- El panel, cuando el segmento da cero, **explica por qué** en vez de mostrar ceros mudos.

> **"Etapa: Clase gratuita"** = personas **registradas** cuyo deal está en esa etapa
> del CRM. Es un sub-filtro de "Registrados" para cruzar consumo de video × etapa.

## Causa raíz #3 — Macros de Meta sin sustituir

Meta **no** reemplaza `{{campaign.name}}` en anuncios de *publicación impulsada*
(ej. "Publicación de Instagram: Venta Casa 6"). Llegaba el literal y el panel lo
mostraba como una campaña más (60 visitas).

**Fix:** se descartan en la captura (`isUnsubstitutedMacro`), se agrupan como
**"(sin campaña identificada)"** en las RPCs, y se limpian las filas históricas.
Se conserva `campaign_id` cuando sí llega (permite identificar la campaña por id).

**Acción del usuario en Meta (opcional):** para recuperar el nombre en esos
anuncios, cargar los parámetros en el campo **"Parámetros de URL"** del anuncio; en
publicaciones impulsadas los macros directamente no se sustituyen.

## Cambios entregados

| Archivo | Qué |
|---|---|
| `components/funnel/FunnelClickToPlayVideo.tsx` | play() dentro del gesto + fallback muted + métricas de intento/playback |
| `app/api/track/video/route.ts` | acepta `playIntents`/`playbackStarted`; guarda el intento aunque no haya playback |
| `components/funnel/FunnelHeatmapTracker.tsx` | respeta `data-hm-tag` → los clics de play cuentan como `video` |
| `lib/funnel/attribution.ts` (+ tests) | `isUnsubstitutedMacro` + descarte en la captura |
| `components/landing/LandingVisitTracker.tsx` | descarta macros; lee `campaign_id` como fallback de id |
| `app/(dashboard)/embudos/EmbudosClient.tsx` | métrica "Tocaron play", alerta de bloqueo, mensaje explicativo del segmento |
| `supabase/migrations/20260728000001_...sql` | columnas nuevas, RPCs con segmento robusto + intentos, limpieza de macros |

## Verificación posterior (a los 2-3 días de tráfico)
1. En Embudos: "Tocaron play" ≥ "Vistas" y sin la alerta ámbar → la reproducción funciona.
2. El filtro "Registrados" debería empezar a mostrar datos.
3. La tabla por campaña ya no muestra `{{campaign.name}}`.
