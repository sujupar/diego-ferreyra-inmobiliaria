# Landing de lujo replicable (E1.9) — Design

**Fecha:** 2026-07-24
**Estado:** aprobado el diseño (pendiente review del spec)
**Contexto previo:** E1.2–E1.8 (sistema de bloques + landing de conversión). El usuario rechazó los looks de E1.7 y E1.8 y aportó una referencia concreta (**Villa Eva** / SERHANT, ultra-lujo Miami). Pide un SISTEMA que genere landings de esa calidad, replicable para propiedades muy distintas de Diego Ferreyra Inmobiliaria (CABA/GBA), desde deptos ~US$180k hasta casas premium.

## Objetivo

Que cualquier propiedad aprobada obtenga, de forma **automática y editable**, una landing de **calidad de primer nivel** con una estructura de **alta conversión** — sin depender de que alguien la arme a mano.

## Análisis de la referencia (qué la hace primer nivel + por qué convierte)

- **Diseño editorial de lujo:** paleta cálida (marfil/oro), serif de revista (Cormorant) + sans fina (Jost), muchísimo aire, detalles finos (filetes, marcos "desplazados" con `::after`, marca decorativa), tipografía fluida con `clamp()`.
- **Estructura narrativa que no suelta:** hero con oferta clara → barra de datos → **3 bloques de storytelling emocional numerados (I/II/III, foto+texto alternados)** → galería curada (destacada 2×2 + "ver más") con lightbox → film → recorrido por niveles → planos (zoom) → **ubicación como imagen (no mapa)** → invitación "solo con cita" con agente → footer con la persona.
- **Conversión difusa (siempre a mano):** 4 CTAs (hero, niveles, invitación, botón flotante) → **un solo popup**; copy del popup adaptado por contexto (tour vs planos); lenguaje de exclusividad; agente personal = confianza.
- **Calidad técnica:** self-contained (fonts base64), responsive fluido, reveal-on-scroll (IntersectionObserver), accesible (foco/teclado, aria), imágenes optimizadas (AVIF/WebP/JPG srcset, lazy, `fetchpriority`), `prefers-reduced-motion` respetado, anti-spam (honeypot + timing gate).

## Decisiones tomadas (con el usuario)

1. **Estética:** lujo con la MARCA de Diego Ferreyra — **navy + verde + neutros cálidos premium** (no marfil/oro literal). Misma estructura y nivel de pulido.
2. **Sin persona/asesor en la landing:** todo a nombre de la marca. Los leads igual se rutean al asesor de la propiedad internamente (sistema actual, sin cambios). El cierre/footer son de marca.
3. **Arquitectura (camino C):** **plantilla de lujo CURADA** sobre el motor de bloques existente. Orden fijo probado + **intensidad según el valor de la propiedad**. El usuario edita texto/fotos; no puede romper la estructura → siempre convierte y siempre se ve premium.

## Arquitectura

Extiende E1.2–E1.8 (schema + registry + LandingRenderer + template + LeadCaptureProvider). "Content is data": la plantilla arma un `LandingDocument`; la IA llena el copy; los bloques condicionales se incluyen/omiten según los datos.

### 1. Sistema de diseño (navy luxury), scoped a `.landing-root`

- **Paleta:** fondo marfil/off-white cálido, tinta charcoal, **acento navy (`--brand`)** + verde secundario sutil, filetes navy/neutros. (Traducción del sistema marfil/oro de la referencia a navy.)
- **Tipografía:** Cormorant Garamond (display serif, ya cargada) + una sans editorial fina (evaluar **Jost** vía next/font, o Geist actual) + eyebrows/kickers (mayúsculas, tracking ancho, navy). Todo con `clamp()` fluido.
- **Detalles:** eyebrow, filetes finos, **figuras con marco desplazado** (`::after`), spacing generoso, números romanos en los bloques de historia.
- **Motion:** 100% CSS (server components), reveal-on-scroll (`animation-timeline: view()` con fallback `@supports`), entrada del hero por keyframes, **contenido SIEMPRE visible** (sin `opacity:0` esperando JS), `prefers-reduced-motion` safe. (Regla dura de E1.7: nunca ramificar el DOM según `useReducedMotion`.)

### 2. Librería de secciones (bloques nuevos/actualizados)

Core (siempre):
- **hero** (actualizar): variante lujo. Foto a sangre completa + veil + wordmark de marca chico + título serif + línea de ubicación + filete + **bloque de oferta (precio + specs clave inline)** + CTA→popup. *Con video → video protagonista.*
- **stats_bar** (nuevo): barra de datos rápidos (ambientes · dorm · baños · m² · cochera · [expensas/antigüedad]) — solo los presentes.
- **story_blocks** (nuevo): 2–3 bloques numerados (I/II/III), foto+texto alternados, con figura de marco desplazado. Beneficios **intangibles/al dolor**. Copy IA.
- **curated_gallery** (nuevo): grilla curada (1 destacada grande + resto) + "Ver galería completa" (revela ocultas) + **lightbox** (teclado/touch, focus-trap, `inert` de fondo).
- **location_showcase** (nuevo): imagen linda del entorno + card con copy de beneficio de zona (IA). **Sin mapa ni botón.**
- **closing_invite** (nuevo): invitación de marca ("Conocé esta propiedad en persona / Coordiná tu visita") + CTA→popup. Sin asesor.
- **footer_brand** (nuevo): Diego Ferreyra Inmobiliaria + contacto general + CUCICBA 8266 + legal.
- **floating_cta** (nuevo, page-level): botón flotante que aparece al pasar el hero y se oculta cerca del cierre; abre el popup.
- **lead popup**: reusar `LeadCaptureProvider` (ya endurecido: focus/inert/aria). **Re-estilar premium** + agregar honeypot + timing gate (anti-spam de la referencia).

Condicionales (por datos/tier):
- **floor_plans** (nuevo): grilla de planos con zoom (lightbox). Solo si `property.plans` tiene items.
- **video en hero**: solo si `video_file_url`/`video_url`. (No hay sección "film" separada — se evita redundancia.)

Se retira de la referencia: la timeline de "5 niveles" (aplica a villas verticales, no al parque de DF) → si en el futuro hay casas multinivel se evalúa; por ahora omitida.

### 3. Plantilla de lujo curada + intensidad por tier

- **Template `luxury`** (nuevo, default): arma el `LandingDocument` en el orden curado, incluyendo/omitiendo condicionales según datos.
- **Tier** (deriva de `funnel_type`/precio, ya existe `deriveFunnelType` con `ALTO_VALOR_USD`):
  - **alto_valor:** despliegue completo (story×3, galería destacada, planos si hay, ubicación con imagen grande, secciones más "aireadas").
  - **estándar:** mismo pulido, más al grano (hero, stats, story×2–3, galería, ubicación, cierre, footer).
- El usuario edita copy/fotos; la ESTRUCTURA es curada (no free-form) → garantiza calidad.

### 4. Copy IA + data mapping

- Extender `lib/landing/conversion-copy.ts` (ya existe, IA→fallback determinístico) para producir también: kickers + titulares + narrativa de los 3 story_blocks, copy de ubicación, copy de cierre. Insumos: propiedad + avatar (dolores/deseos) + descripción bridge + Vision.
- **Data (auto):** precio, specs, fotos por índice, barrio/ciudad → hero/stats/gallery/location.
- **IA (editable):** títulos, subtítulos, los 3 bloques, ubicación, cierre. Fallback determinístico benefit-framed (nunca deja la landing sin copy).
- Se genera al crear la landing en el asistente (E1.4) y en el fallback auto-servido (determinístico, sin IA en render-time).

### 5. Fotos / curación (crítico para la calidad)

- **Hero:** `photos[0]` (portada elegible). Story: `photos[1..3]`. Galería: el resto. Ubicación: una foto exterior/balcón; si no hay linda → **banda navy elegante** con el texto (fallback).
- **Degradación elegante:** con pocas fotos (<4) la galería se simplifica; con 1 foto → hero + sin grilla. Nunca roto.
- **Opcional (fase posterior):** realzar la portada/hero con el pipeline OpenAI `gpt-image-2` ya construido (E2.5) para que fotos mediocres se vean editoriales. No bloqueante.

### 6. Mecánica de conversión

- **≥3 CTAs** repartidos (hero, mitad, cierre) + **floating_cta** → todos abren el **mismo popup** (`LeadCaptureProvider`).
- Popup: nombre / email / teléfono / intención; **honeypot + timing gate**; estado de éxito; foco gestionado + `inert` de fondo (ya hecho). POST `/api/leads` + Pixel/CAPI dedup (ya hecho).

### 7. Robustez / guardrails de calidad

- Todas las secciones: server components + motion CSS → **contenido siempre visible** (sin JS, sin hidratar, con reduced-motion). No hydration mismatch.
- Responsive fluido (`clamp`, grid) sin scroll horizontal; contraste WCAG del texto sobre foto (scrim reforzado).
- Casos sin datos: cada bloque devuelve null u omite en vez de romper.
- **Antes de cada deploy: review adversarial multi-agente** (dimensiones RSC/SSR, a11y, responsive/overflow, LCP/SEO, data-edge, copy/injection) + verificación estructural en producción. El OK visual final es del usuario en el navegador (limitación conocida: la carpeta con tilde rompe Turbopack local, no se puede `next dev`; se verifica con `renderToStaticMarkup` + WebFetch de producción).

## Compatibilidad / migración

- `luxury` pasa a ser el template default (reemplaza `conversion` de E1.8 como default; `conversion`/`editorial`/`cinematic` quedan disponibles).
- El fallback auto-servido (`app/p/[slug]/page.tsx`) construye el documento `luxury` con copy determinístico.
- Landings ya publicadas (docs viejos con `lead_form`/`conversion`) siguen renderizando (backwards-compat del registry/invariante). Re-crear desde el asistente las lleva a `luxury`.
- Migraciones DB: ninguna nueva prevista (los bloques nuevos viven en `content` jsonb; el schema Zod valida). Confirmar en el plan.

## Plan por fases (cada fase se deploya y el usuario la ve)

1. **Columna vertebral:** sistema de diseño navy-luxury (tokens + fuentes + motion) + Hero lujo (video/foto) + stats_bar + closing_invite + footer_brand + popup re-estilado + floating_cta + template `luxury` esqueleto.
2. **Narrativa + visuales:** story_blocks (IA, numerados, marco desplazado) + curated_gallery + lightbox + location_showcase.
3. **Condicionales + intensidad:** floor_plans + lógica de tier (alto_valor vs estándar) + curación de fotos / degradación elegante.
4. **Pulido + review adversarial + deploy + review visual del usuario.** (Opcional: realce de portada con OpenAI.)

## No-goals (fuera de alcance)

- Editor drag-and-drop libre (E1.6) — la estructura curada lo hace innecesario para calidad; edición = copy/fotos.
- Timeline de niveles / villas verticales.
- Sección "film" separada (video va en hero).
- Exponer asesor/persona en la landing.

## Verificación

- Por fase: `tsc` 0 errores + `renderToStaticMarkup` (estructura + sin `opacity:0`) + validación del `LandingDocument` contra el schema + review adversarial (workflow) + WebFetch de estructura en producción + OK visual del usuario.
