# Landing de alta conversión: respuestas del asesor al centro — Diseño

**Fecha:** 2026-08-06
**Origen:** pedido directo del usuario (dictado, 5 puntos) + doc `Prompt.md` (el prompt del GPT de descripciones que usaban antes).

## Problema

La landing por propiedad se genera con contenido genérico. La causa raíz está medida en el código:

1. El pipeline de enriquecimiento (`vision → description → avatars → copy`) corre ENTERO
   apenas se crea la landing, ANTES de que el asesor responda las preguntas. La etapa
   `copy` usa el avatar candidato [0] pre-respuestas.
2. Las respuestas del asesor solo regeneran avatares (y solo si toca un botón secundario).
   El prompt del copy (`conversion-copy.ts`) **nunca** recibe las respuestas.
3. Las preguntas son opcionales ("Afiná el perfil (opcional)") y publicar no exige nada.
4. La descripción de portales pide al modelo "usá tu conocimiento del barrio": sin
   investigación real de la ubicación, con riesgo de inventos y texto chato.
5. Detalles sueltos: la landing muestra `covered_area` en vez de `total_area`; el video
   de `/v/[token]` no tiene poster (recuadro vacío en el celular); el cierre dice
   "Con cita previa" en vez de invitar a recorrer la propiedad.

## Decisiones del usuario (no negociables)

- Las respuestas del asesor son el insumo central: al enviarlas se dispara UN prompt
  bien diseñado que reescribe TODAS las secciones de la landing.
- Fórmula del titular: **tipo de propiedad + ubicación + beneficio principal**
  (ej.: "Dúplex tipo casa en Martínez con hermoso jardín y mucho sol").
- El subtitular complementa (beneficios relevantes para el comprador), no repite.
- Los dos puntos siguientes (propiedad y ubicación) estratégicos, específicos del perfil.
- Sección ubicación: mapa **no interactivo** + texto persuasivo de vivir ahí, para ese
  perfil. (Revierte la decisión E1.9 de "sin mapa": el usuario lo pidió explícitamente.)
- Cierre: invitar a **recorrer la propiedad**, no "con cita previa" ni "agendar cita".
- No se puede publicar la landing sin responder las preguntas.
- Nada de preguntas de financiación (hoy no existe financiación relevante en Argentina).
- Área mostrada = **área total** de la propiedad.
- Poster del video de la página de gracias = foto principal (`photos[0]`).
- El prompt de portales se mejora adaptando conceptualmente `Prompt.md` (tono
  rioplatense profesional, estructura por tipología, storytelling corto de la
  experiencia de vivir ahí, CTA antes del disclaimer) con investigación REAL de la
  ubicación adaptada al perfil del comprador.

## Diseño

### A. Investigación de ubicación (`lib/marketing/location-insights.ts`) — nuevo

Módulo SIN IA que junta hechos reales de la zona, una vez por propiedad, cacheado:

- **Fuentes:**
  1. Búsquedas Google vía el endpoint estructurado de ScraperAPI (`SCRAPER_API_KEY`
     ya existe y se usa en el repo). 3–4 consultas en paralelo por categorías:
     transporte, comercios/gastronomía, colegios, plazas/verde — armadas con
     dirección + barrio + ciudad. Se guardan título+snippet de los resultados
     orgánicos, deduplicados y recortados por código puro (testeable).
  2. Datos duros de mercado propios: `getMarketData` (precio m² del barrio, renta,
     oferta) cuando el barrio matchea el catálogo CABA.
- **Persistencia:** `properties.location_insights` (jsonb) + `location_insights_at`
  (migración nueva). Shape: `{ zona, categorias: {transporte[], comercios[],
  educacion[], verde[]}, mercado?: {...}, fuente: 'google'|'sin_busqueda' }`.
- **Endpoint:** `POST /api/properties/[id]/location-insights` — idempotente
  (devuelve el cache si existe; `refresh: true` lo regenera). Sin IA adentro →
  rápido, no choca con el límite de Netlify.
- **Verificación previa:** probe real del endpoint estructurado de ScraperAPI antes
  de cablear. Si el plan no lo incluye o falla → `fuente: 'sin_busqueda'` y los
  prompts caen al modo "conocimiento del modelo con regla anti-invención estricta"
  (comportamiento actual pero con instrucción explícita de omitir lo dudoso).
- **Consumidores:** etapa `location` del enrich de la landing; wizards ML/AP (el
  paso Descripción lo llama antes de generar, con texto de progreso); el prompt de
  portales y el de conversión lo reciben en el payload.

### B. Descripción de portales v2 (`system-prompt.ts` + `generator.ts`)

- Se mantiene la estructura por tipología del doc GPT Portales (ya codificada) y el
  disclaimer literal. Se mejora el prompt:
  - Reglas más duras de titular/subtitular (gancho, sin repetición, puntos fuertes
    reales) con **ejemplos de MAL y BIEN** (lección del agente de WhatsApp: los
    ejemplos son lo único que corrige un tono).
  - Sección **Ubicación**: deja de ser "usá tu conocimiento del barrio". El user
    payload inyecta `location_insights` (hechos + números de mercado) y el prompt
    ordena: usar SOLO esos datos + hechos ampliamente conocidos del barrio; adaptar
    la selección al perfil del comprador (soltero → cafés/bares y transporte;
    familia → colegios y plazas; inversor → demanda, precio m² y renta); prohibido
    inventar nombres de lugares.
  - **Conexión emocional**: storytelling corto (≤40 palabras) de la experiencia de
    vivir en ESA propiedad, anclado en datos reales (visión de fotos si hay).
  - CTA antes del disclaimer (ya existe, se conserva).
- `buildUserPayload` suma: `location_insights`, y pasa el perfil del comprador tal
  como llega (`buyerProfile`).

### C. Flujo de landing reordenado (el corazón del cambio)

**Máquina de etapas v2:** `ENRICH_STAGES = ['vision','description','location','avatars']`.
La etapa `copy` sale del arranque automático: el content inicial queda el
determinístico (como hoy al crear). `location` corre el módulo A (sin IA, barato).

**Al enviar respuestas** (botón principal, renombrado "Generar los textos con mis
respuestas"): `POST /landing/answers` valida que TODAS las preguntas tengan
respuesta no vacía → guarda answers → regenera avatares CON answers (1 llamada IA,
como hoy) → setea `enrich='copy'` y `copyFromAnswers=false` → el cliente reanuda el
loop de enrich → la etapa `copy` (1 llamada IA) genera el copy v2 y reconstruye el
content con `buildLuxuryDocument`, seteando `copyFromAnswers=true`. Dos requests,
una llamada de IA cada uno — respeta la REGLA DURA de no encadenar IA en un request.

**Prompt v2 de `conversion-copy.ts`** — recibe TODO: propiedad, avatar elegido,
**respuestas del asesor textuales (q → a)**, visionSummary, descripción (recorte),
location_insights. Instrucciones nuevas:

- `titular`: fórmula tipo + ubicación + beneficio principal; el beneficio se ELIGE
  interpretando las respuestas (diferencial que dio el asesor).
- `subtitulo`: complementa con beneficios concretos para ese comprador; prohibido
  repetir palabras clave del titular.
- `benefits` (los bloques I/II/III): específicos y estratégicos — anclar cada uno en
  un dato real (respuesta del asesor, foto, insight de zona); prohibido el relleno
  genérico tipo "espacios pensados para vivir mejor".
- `locationBody` (nuevo campo, reemplaza al `locationNote` de una línea): 2–4 frases
  persuasivas de vivir en esa ubicación PARA ese perfil, basadas en los insights.
- Cierres (`midCtaHeadline`, `mainBenefit*`): invitación a recorrer la propiedad.
- Se conservan: `coerceCopy` (caps + ctaLabel fijo), regla anti prompt-injection,
  fallback determinístico (que ahora también aprovecha answers si existen).

**Template luxury:**
- Eyebrow del cierre: `'Con cita previa'` → `'Vení a recorrerla'`. Eyebrow del
  cta-mid: `'Agendá tu visita'` → `'Conocela por dentro'`.
- Bloque `location_showcase`: gana mapa no interactivo + el `locationBody`. Nuevo
  componente server `StaticMapTiles` (grilla de tiles OSM + pin SVG superpuesto,
  cero JS, no interactivo por construcción, atribución "© OpenStreetMap"). Con
  lat/lng null → banda navy actual sin mapa. Schema: `LocationShowcaseBlock` suma
  `showMap?: boolean` (default true); el registry pasa lat/lng de la propiedad.

**Preguntas:** el prompt de `questions-generator.ts` gana prohibición explícita de
preguntas sobre financiación/crédito/hipoteca y una guía de qué preguntar
(comprador ideal, diferencial, objeciones, entorno). El fallback fijo queda. En el
fallback de avatares, 'Financiación'/'Averigua financiación' se reemplazan por
conceptos vigentes (gastos de escritura, expensas).

### D. Gate de publicación (punto 3)

- **Helper puro** `faltanRespuestas(ws)` en `lib/landing/` (testeado): preguntas sin
  respuesta no vacía. Gate satisfecho = `!faltanRespuestas` **y** `copyFromAnswers === true`.
- **UI:** el bloque deja de decir "(opcional)". "Publicar landing" disabled hasta
  gate satisfecho + `!faltaRecorrido`; con mensaje que explica qué falta.
- **Server:** `publishLanding` rechaza (400 con mensaje claro) si `ws.questions` no
  está vacío y el gate no se cumple. Si `questions` está vacío (landing legacy o
  enrich caído), NO bloquea — documentado como compat.
- Editar una respuesta después de generar re-arma el ciclo: guardar answers siempre
  pone `copyFromAnswers=false` hasta que la etapa copy vuelva a correr.

### E. Área total (punto 4)

- `registry.tsx` `buildSpecs` (specs del hero): `total_area` con fallback a
  `covered_area` si falta (1/31 propiedades hoy).
- `StatsBar`: muestra "m² totales" desde `total_area`; si es null, cae a
  "m² cubiertos" desde `covered_area` (no mentir la etiqueta).

### F. Poster del video de gracias (punto 5)

- `ThanksMedia.tsx`: el `<video>` gana `poster={photos[0]}` (+ `preload="metadata"`).
  La página `/v/[token]` ya pasa `photos`; la vista previa del editor hereda el fix.

### G. Migración

- `2026….sql` (numerar mirando el directorio — hay prefijos 20260806 usados por la
  otra sesión): `ALTER TABLE properties ADD COLUMN IF NOT EXISTS location_insights
  jsonb, ADD COLUMN IF NOT EXISTS location_insights_at timestamptz;`
- Aplicar vía script pg (patrón `scripts/apply-*-pg.ts`, session pooler) ANTES de
  deployar el código que la lee/escribe.

## Compatibilidad

- Landings ya publicadas: intactas (el editor y `content` no cambian de shape;
  `locationBody` viaja dentro del bloque, con default).
- Landings draft viejas con `enrich` en valores de la máquina v1: `nextEnrichStage`
  mapea valores desconocidos a `'done'` (ya lo hace); la etapa `copy` re-armada
  funciona igual para ellas al responder preguntas. `location` faltante no rompe:
  los prompts toleran `location_insights` null.
- El bloque `location_showcase` sin `showMap` explícito se comporta como `true`
  (solo muestra mapa si hay lat/lng).

## Testing

- Unit (vitest/tsx según runner del repo): máquina enrich v2 (orden, re-armado,
  legacy), `faltanRespuestas`, `buildUserPrompt` v2 (answers/insights inyectados),
  parsers de location-insights (dedupe/trim puros), template luxury (eyebrows
  nuevos, showMap), `buildUserPayload` v2 de portales, lógica de área.
- Probes de render (`renderToStaticMarkup`, patrón del repo): LocationShowcase con
  mapa estático, ThanksMedia con poster. El look final solo se confirma en
  navegador (Turbopack local roto por el path con tilde — no usar `next build`).
- Verificación: `tsc --noEmit` + suite de tests + probe real de ScraperAPI.
- E2E: script tsx contra la base real sobre una propiedad `[TEST` (patrón
  `scripts/qa-*`): crear landing → correr etapas → intentar publicar sin responder
  (debe rechazar) → responder → verificar copy regenerado con las respuestas →
  publicar → verificar HTML público (título con fórmula, mapa, área total, poster).

## Fuera de alcance

- Bloques legacy (`features`, `essential_specs`) que no están en el template luxury.
- `GenerateDescriptionCard` (huérfana desde 2026-07-31): no se toca.
- Re-generar landings ya publicadas.
