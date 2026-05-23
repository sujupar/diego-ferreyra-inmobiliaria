# Plan: Optimización profesional Meta Ads — multi-ad + Gemini image gen + geo 2km

> **Fecha:** 2026-05-23
> **Estado:** En ejecución
> **Sucede a:** `2026-05-21-publicacion-manual-meta-ads-inteligente.md`

---

## Contexto

El flow básico de creación de campaña Meta Ads ya funciona end-to-end (Campaign + Image + Creative + AdSet + Ad, validado por script QA con ambos modos auto y wizard). Ahora pasamos a la **optimización profesional**: dejar de crear una sola pieza genérica y convertir el sistema en uno que arma campañas competitivas con varias variantes creativas y targeting realista.

**Hallazgos del usuario en la primera prueba real:**

1. **Highlights pobres:** Gemini Vision devuelve solo 3 opciones genéricas. El asesor necesita más opciones y que estén derivadas de un análisis profundo de las fotos + características de la propiedad.

2. **Geo targeting roto:** el preset "Similares" puso un único pin de 10km, lo que cubre casi todo Buenos Aires. Necesita ser **múltiples pines de 2km** en barrios con perfil socioeconómico similar al barrio de la propiedad.

3. **Un solo anuncio por campaña:** Meta optimiza mucho mejor cuando tiene **3-5 anuncios distintos** que puede A/B testear. Hoy creamos solo 1 ad → menos performance.

4. **Imágenes crudas como creative:** usamos las fotos sin procesar de la propiedad. El estándar profesional es **imágenes editadas que comuniquen precio + ambientes + barrio** con tipografía y composición premium. Gemini 2.5 Flash Image puede generarlas.

5. **CTA "Más información" ocupa demasiado espacio.** Cambiar a **"Ver más"** (`SEE_MORE`).

6. **Copy genérico:** un solo headline + primary text. Necesitamos varios titulares y varios copies, uno por variante de ad.

---

## Fases del plan

| Fase | Qué incluye | Tiempo estimado |
|------|-------------|-----------------|
| **A** | Quick wins: CTA → SEE_MORE + Gemini Vision devuelve 5-7 highlights | 30 min |
| **B** | Multiple ads (3-5 ads por campaña, uno por highlight) + copy variants alineadas | 2-3 hs |
| **C** | Geo targeting profesional: múltiples pines de 2km en barrios similares | 2-3 hs |
| **D** | Generación de imágenes premium para ads con Gemini 2.5 Flash Image + conversión a formatos Meta (1:1, 4:5, 9:16) | 5-7 hs |
| **E** | UI updates en wizard: step "Qué destacar" expandido + preview de variantes en step "Aviso" | 2-3 hs |
| **F** | Script E2E ampliado: valida toda la campaña multi-ad + assets generados | 1 hs |

Total estimado: 12-18 hs distribuidas. Ejecuto en secuencia A → F.

---

## Fase A — Quick wins

### A1: CTA "Ver más" (SEE_MORE)

**Archivo:** `lib/marketing/meta-campaign-builder.ts`

Cambio:
```ts
call_to_action: { type: 'LEARN_MORE', value: { link: landingUrl } }
//          → 
call_to_action: { type: 'SEE_MORE', value: { link: landingUrl } }
```

`SEE_MORE` es valor válido de Meta Marketing API. Texto en UI = "Ver más" (3 chars menos que "Más información" → más espacio para el título).

### A2: Más highlights del análisis de fotos

**Archivo:** `lib/marketing/property-vision-analyzer.ts`

Cambios al system prompt de Gemini Vision:
- Pedir **5 highlights** en lugar de 3.
- Pedir que cada highlight indique **qué características o números podemos usar en el copy** (ej. "70 m² cubiertos", "3 ambientes", "balcón aterrazado de 15 m²").
- Pedir que ordene por nivel de impacto (highlight[0] = el más fuerte).
- Pedir que cada highlight tenga un **mood/estética sugerida** para la pieza gráfica (ej. "luminoso, aspiracional", "cálido, familiar", "moderno, minimalista").

**Resultado:** el wizard muestra 5 highlights con label + reasoning + foto + mood. El asesor elige uno como protagonista pero **todos se usan** para generar las variantes de ad.

---

## Fase B — Multiple ads

### B1: Builder crea N AdCreatives + N Ads

**Archivo:** `lib/marketing/meta-campaign-builder.ts`

Cambio en `createCampaignForProperty`:
- En lugar de crear 1 AdCreative + 1 Ad, iterar sobre los top N highlights (default 3).
- Para cada highlight:
  - Tomar la foto correspondiente (`photos[highlight.photoIndex]`).
  - Subir a Meta como AdImage (multipart).
  - Crear AdCreative con esa imagen + copy variant correspondiente.
  - Crear Ad linkeando el creative al AdSet.
- Todos los Ads van al mismo AdSet — Meta optimiza entre ellos.

**Persistencia:** guardar `ad_ids: string[]` en `property_meta_campaigns` (ya es array).

### B2: Copy variants alineadas

**Archivo:** `lib/marketing/copy-ai-generator.ts`

Actualmente devuelve 3 primaryTexts + 3 headlines pero usamos solo el `[0]`. Cambios:
- Mantener la estructura actual (3 variants).
- En el builder, iterar: `ads[i]` usa `copy.primaryTexts[i]` + `copy.headlines[i]` + `copy.description`.
- Si hay más highlights que copy variants (raro), reusar la última variant.

### B3: Persistir relación highlight ↔ ad

En `property_meta_campaigns.copy` (JSONB), guardar:
```json
{
  "variants": [
    { "ad_id": "...", "highlight_id": "pileta", "headline": "...", "primary_text": "..." },
    ...
  ]
}
```

Para que el inbox de leads pueda mostrar "este lead vino del ad de la pileta" en el futuro.

---

## Fase C — Geo targeting profesional

### C1: Dataset de barrios CABA con lat/lng centrales

**Archivo a crear:** `lib/marketing/neighborhood-data.ts`

Contiene:
```ts
export interface NeighborhoodPoint {
  name: string
  cluster: 'premium' | 'alto' | 'medio_alto' | 'medio'
  lat: number
  lng: number
}

export const CABA_NEIGHBORHOODS: NeighborhoodPoint[] = [
  { name: 'Palermo', cluster: 'alto', lat: -34.5810, lng: -58.4290 },
  { name: 'Recoleta', cluster: 'premium', lat: -34.5879, lng: -58.3974 },
  ... ~30 barrios CABA + GBA Norte
]
```

### C2: Preset "Cercanos" → pines de 2km

**Archivo:** `lib/marketing/geo-targeting-presets.ts`

Cambios:
- **"Cercanos"**: un solo pin de 2km en lat/lng exacto de la propiedad. (Era 3-5km.)
- **"Barrios similares"**: múltiples pines de 2km en cada barrio del cluster correspondiente al barrio de la propiedad. Ej: propiedad en Palermo → pines en Palermo, Villa Crespo, Caballito, Colegiales, Chacarita.
- **"Toda CABA"**: mantener (1 pin amplio para premium/inversores).

La función `buildGeoPresets()` ahora puede devolver custom_locations con `Array.length > 1`, que Meta acepta sin problema.

### C3: Identificar el cluster del barrio de la propiedad

**Archivo:** `lib/marketing/geo-targeting-presets.ts`

Función helper:
```ts
function clusterOfNeighborhood(name: string): NeighborhoodPoint['cluster'] {
  const found = CABA_NEIGHBORHOODS.find(
    n => n.name.toLowerCase() === name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  )
  return found?.cluster ?? 'medio'
}
```

---

## Fase D — Generación de imágenes premium con Gemini

### D1: Servicio `ad-image-generator.ts`

**Archivo a crear:** `lib/marketing/ad-image-generator.ts`

Usa **Gemini 2.5 Flash Image** (modelo `gemini-2.5-flash-image-preview` o el GA equivalente):
- Endpoint: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-preview:generateContent`
- Input: foto base + prompt detallado (1000-3000 palabras).
- Output: imagen generada en base64.

```ts
export async function generateAdImage(input: {
  basePhotoUrl: string
  property: Property
  highlight: PropertyHighlight
  copy: { headline: string; primaryText: string }
  format: 'feed_square' | 'feed_vertical' | 'story_vertical'
}): Promise<{ imageBase64: string; mimeType: string }>
```

### D2: Prompts estructurados (mínimo 1000 palabras)

**Archivo:** `lib/marketing/ad-image-prompts.ts`

Templates parametrizados con:
- **Brief de la propiedad:** tipo, ambientes, m², precio, barrio, dirección.
- **Highlight a destacar:** pileta / balcón / vista / etc.
- **Mood objetivo:** luminoso aspiracional / cálido familiar / moderno minimalista.
- **Composición exacta:** dónde va la foto, dónde va el precio, dónde van los specs.
- **Estilo premium:** tipografía sans-serif elegante (Inter, Helvetica Neue, similar), paleta sobria, branding sutil.
- **Anti-patrones:** sin clichés inmobiliarios ("oportunidad única"), sin emojis, sin marcos baratos, sin texto invasivo sobre la foto.
- **Especificaciones técnicas:** resolución, aspect ratio, color space.
- **Ejemplos referenciales:** comparar con avisos premium de inmobiliarias top (sin nombrarlas pero describiendo).

Cada prompt entre 1000-3000 palabras, parametrizado, cacheado por property+highlight para no regenerar en cada intento.

### D3: Conversión a formatos Meta

**Dependencia nueva:** `sharp` (npm) para procesamiento de imagen server-side.

**Archivo:** `lib/marketing/image-formats.ts`

Función:
```ts
export async function convertToMetaFormats(imageBuffer: Buffer): Promise<{
  feed_square: Buffer    // 1080x1080
  feed_vertical: Buffer  // 1080x1350
  story_vertical: Buffer // 1080x1920
}>
```

Estrategia: generar imagen con Gemini en formato vertical alto (1080x1920), después con sharp crop/resize a los otros formatos manteniendo el centro de interés.

Alternativa más simple para v1: generar 3 imágenes separadas con Gemini, una por formato, con composición específica para cada uno.

### D4: Persistencia de imágenes generadas

**Archivo:** `supabase/migrations/20260523000001_ad_assets.sql` (a crear)

Tabla nueva `property_ad_assets`:
```sql
CREATE TABLE public.property_ad_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  highlight_id text NOT NULL,
  format text NOT NULL CHECK (format IN ('feed_square', 'feed_vertical', 'story_vertical')),
  prompt_used text NOT NULL,
  storage_path text NOT NULL,  -- ruta en Supabase Storage
  meta_image_hash text,          -- hash devuelto por Meta /adimages
  created_at timestamptz NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_property_ad_assets_unique
  ON property_ad_assets(property_id, highlight_id, format);
```

Razón de cachear: cada generación cuesta ~$0.04 y tarda ~10s. Si el asesor reintenta lanzar, reusamos los assets.

### D5: Subida a Meta como AdImage

Pre-existente: `uploadAdImage` en `meta-campaign-builder.ts` (multipart).
Cambio: aceptar `Buffer` directo (no URL) para no tener que hacer round-trip por Storage.

### D6: Integración al builder

`createCampaignForProperty` ahora:
1. Por cada highlight (3 top):
   1. Genera imagen para formato `feed_square` con Gemini.
   2. Convierte a `feed_vertical` y `story_vertical`.
   3. Sube los 3 formatos a Meta como AdImages.
   4. Crea 1 AdCreative con `image_hash` del formato apropiado.
   5. Crea 1 Ad usando ese creative.
2. Resultado: 3 highlights × 1 ad cada uno = 3 Ads en el AdSet.

---

## Fase E — UI updates en wizard

### E1: Step 2 "Qué destacar"

**Archivo:** `components/properties/wizards/MetaAdsWizard.tsx`

Cambios:
- Mostrar 5 highlights (no 3).
- Cada uno como **card grande** con foto del highlight + label + reasoning + mood badge.
- Click selecciona uno como "principal" pero los 3 top se usan para variantes.
- Indicador visual: "Vamos a generar 3 anuncios distintos basados en estos 3 highlights".

### E2: Step 5 "Aviso" — preview de variantes

Antes de lanzar, mostrar:
- Mini-galería de las 3 imágenes generadas con Gemini (mientras se generan, spinner).
- Cada imagen con su copy variant correspondiente debajo.
- Asesor puede confirmar visualmente.

### E3: Loading state largo

La generación de 3 highlights × 3 formatos = 9 imágenes con Gemini puede tomar 30-60s. Mostrar progress bar con estados:
- "Analizando propiedad..."
- "Generando aviso 1/3..."
- "Generando aviso 2/3..."
- ...
- "Subiendo a Meta..."
- "Creando campaña..."
- "Lista para revisar"

---

## Fase F — Script E2E ampliado

Actualizar `scripts/test-meta-flow-e2e.ts`:
- Validar que se crearon **N Ads** (no 1).
- Validar que el CTA es `SEE_MORE`.
- Validar que los AdImages tienen hash de las imágenes generadas (no URLs crudas).
- Verificar que el `targeting.geo_locations.custom_locations.length` es > 1 cuando el preset es "similares".

---

## Costos estimados (informativo)

- **Gemini 2.5 Flash Image:** ~$0.039 por imagen.
- Por campaña (3 highlights × 3 formatos): ~$0.35.
- Cacheado por property+highlight+format → cero costo en reintentos.

A 50 campañas/mes: ~$17.50/mes en image gen. Razonable.

---

## Riesgos identificados

| Riesgo | Mitigación |
|--------|------------|
| Gemini falla al generar (timeout, contenido rechazado) | Fallback al builder actual (foto cruda). El wizard avisa "no se pudo generar imagen premium, usando foto original". |
| Meta rechaza la imagen generada (sospecha de manipulación o branding ajeno) | Las imágenes que generamos respetan los assets de la propiedad. Si Meta rechaza, fallback a foto cruda. |
| Más Ads = más tiempo de aprobación en Meta | Solo afecta velocidad; las campañas son PAUSED por default así que no impacta gasto. |
| Costo de Gemini si el asesor regenera mucho | Cachear en `property_ad_assets`. Solo regenerar si el highlight cambia. |

---

## Anticipación (14 dimensiones)

| Dimensión | Impacto | Mitigación |
|-----------|---------|------------|
| RLS | Tabla nueva `property_ad_assets` | Policies: admin/dueno/coordinador todo, asesor solo de sus propiedades |
| Migrations | Nueva migración 20260523000001 | El usuario ejecuta manualmente en SQL Editor |
| Idempotencia | Múltiples reintentos del wizard | `property_ad_assets` con UNIQUE (property, highlight, format) |
| Permisos | Solo asesor de la propiedad + admin pueden generar/regenerar | Aplicado en endpoint nuevo de generación |
| Tokens | GEMINI_API_KEY ya está en Netlify | Verificado |
| Deploy | Nueva dependencia sharp — tamaño bundle | sharp es Node-only, no afecta cliente |
| Filenames | N/A | |

---

## Orden de ejecución

1. ✅ Fase A (CTA + más highlights) — listo primero, push inmediato.
2. ✅ Fase B (multiple ads) — push.
3. ✅ Fase C (geo 2km) — push.
4. ✅ Fase D (Gemini image gen) — la más grande, push al final.
5. ✅ Fase E (UI) — push.
6. ✅ Fase F (script E2E ampliado) — validar todo, push.

Después de cada fase, correr `scripts/test-meta-flow-e2e.ts` para confirmar que sigue verde end-to-end.

Reporte final cuando F esté verde y el script confirme todo el flow optimizado.
