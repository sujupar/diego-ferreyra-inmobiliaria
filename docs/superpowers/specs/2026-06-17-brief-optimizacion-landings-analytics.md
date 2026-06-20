# Brief — Optimización de Landings + Analítica de Video + Atribución de Campañas

> Prompt profesional (organizado a partir de la instrucción del usuario). Previo al corte de dominio (Fase 5).

## Objetivo
Elevar las dos landing pages nativas (Tasación Directa, Clase Gratuita) a nivel producción-final en **performance**, **experiencia de video** y **medición**, e implementar la **atribución completa de campañas de Meta Ads** — **sin romper** ningún flujo existente (captura de leads, conversiones Meta Pixel+CAPI, públicos por etapa, CRM, métricas).

## Contexto actual
- Landings migradas + capturando leads (Fase 2) + conversiones a Meta con dedup (Fase 3) + públicos por etapa (Fase 4).
- Panel "Embudos" (dashboard) muestra visitas/conversiones/% por página y fecha.
- Visitas en `landing_page_visits` (con UTM ya capturado); conversiones en `funnel_lead_submissions`.
- Videos hero: hoy autoplay-muteado; ya existe componente `FunnelClickToPlayVideo`.
- Video de la clase completa (13 min) pendiente de hosting/medición.

## Requisitos

### R1 — Performance: carga ultra-rápida
Auditar y optimizar la velocidad de carga de ambas landings (Core Web Vitals). Ya son rápidas; dejarlas en el máximo nivel **sin agregar peso ni relleno**. **Criterio:** mobile LCP ≤ 2.0s, INP ≤ 200ms, CLS ≤ 0.05 (lo mejor alcanzable sin sacrificar contenido).

### R2 — Videos click-to-play (no autoplay)
Los videos hero de **AMBAS** landings (Tasación Directa **y** Clase Gratuita) **NO** reproducen en automático: la persona hace **clic** → reproduce (poster + botón play → play con sonido). Reutilizar el componente click-to-play. **Criterio:** ningún video arranca solo.

### R3 — Analítica de video (% visto / engagement)
Medir el **porcentaje de video** que ve cada persona:
- **Anónimos (pre-registro):** identificar con un id anónimo **sin PII** para medir el % visto aunque no tengamos sus datos.
- **Registrados:** asociar el % visto al lead, **vinculando la sesión anónima al lead** al momento del registro.
- **Segmentación:** % promedio visto por **rango de fechas** y por **segmento** (no registrados / registrados / convertidos).
- **Cubre:** los videos hero de ambas landings **+** el **video de la CLASE COMPLETA** (página de gracias).
- El **video de la clase** debe alojarse de forma que **SE PUEDA MEDIR** (preferencia del usuario: en la plataforma propia; investigar hosting que permita medición + buena carga, dado que Supabase free limita a 50MB/archivo).
- **Investigar toda la tecnología:** cómo trackear quartiles/watch-time, id anónimo, vinculación anónimo→lead, esquema de datos, hosting medible.

### R4 — Panel "Embudos" con métricas detalladas
Al entrar a **cada embudo** en el panel "Embudos", ver métricas **super-completas y detalladas**, **incluyendo la analítica de video** (% promedio visto, retención por quartil, por segmento), con filtros de fecha y de conversión/segmento.

### R5 — Atribución de campañas (UTM → campaña / conjunto / anuncio) — **NO NEGOCIABLE**
- Las campañas de Meta Ads usan parámetros URL (UTM). Deben permitir saber de qué **campaña**, **conjunto de anuncios** y **anuncio** vino cada prospecto.
- **Capturar** esos parámetros cuando la persona llega (clase o tasación) y **propagarlos al lead/deal**.
- En el **CRM**, al abrir la solicitud de tasación (o el deal), **mostrar** datos adicionales: campaña, conjunto de anuncios y anuncio de origen.

## Restricciones (no romper)
- No dañar: captura de leads, conversiones Meta (Pixel+CAPI dedup), públicos por etapa, CRM, métricas existentes.
- Cambios de schema **aditivos**; migraciones a mano en el SQL Editor (CLI no conecta).
- Privacidad: id anónimo **sin PII**; UTM no son PII.
- Sin agregar relleno visual ni romper la conversión probada.

## Entregables
1. **Investigación técnica** (analítica de video, id anónimo + vinculación, hosting medible, atribución UTM/Meta, performance CWV).
2. **Plan de implementación detallado** (TDD, por fases, con pre-flight de conflictos).
3. **Implementación + validación**, sin romper lo existente.

## Fuera de alcance
- Corte de dominio + baja GHL (Fase 5, posterior).
- Rediseño visual mayor de las landings.

## Decisiones a resolver con la investigación
- **Medición de video:** `<video>` self-host con tracking propio (timeupdate → quartiles 25/50/75/100 + watch-time) vs player con analytics (Mux/Cloudflare Stream/Bunny) vs **YouTube IFrame API** (mide % visto con video en YouTube). Cuál da medición + buena carga + costo razonable.
- **Hosting del video de la clase (13 min):** Supabase Pro (self-host) vs servicio de streaming vs YouTube-medible. Recomendación.
- **Id anónimo:** cookie/localStorage `anon_id` (UUID) vs reutilizar el `event_id`/`fbp`; cómo vincularlo al lead al registrar.
- **UTM de Meta:** usar los *dynamic params* de Meta en la URL (`{{campaign.id}}`/`{{campaign.name}}`/`{{adset.id}}`/`{{adset.name}}`/`{{ad.id}}`/`{{ad.name}}`) para tener IDs **y** nombres legibles directamente.
