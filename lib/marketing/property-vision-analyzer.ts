/**
 * Análisis de fotos de la propiedad para el wizard inteligente de Meta Ads.
 *
 * Usa Google Gemini (vision-capable, modelo configurable via GEMINI_VISION_MODEL,
 * default gemini-2.0-flash). Si no hay GEMINI_API_KEY configurada, hace fallback
 * a un análisis basado en metadata + amenities.
 *
 * Caching: el resultado se guarda en properties.metadata.vision_analysis (si
 * el caller lo persiste) para reusar entre sesiones del wizard.
 */
import type { Property } from '@/lib/portals/types'

export interface PropertyHighlight {
  id: string // slug interno: pileta | balcon_aterrazado | vista_panoramica | …
  label: string // "Pileta y solárium del edificio"
  reasoning: string // por qué este es un highlight
  photoIndex: number // índice en property.photos donde se ve mejor
  /** Datos concretos para usar en el copy: ej. "70 m² cubiertos", "3 ambientes" */
  copyHooks?: string[]
  /** Estética/mood sugerida para la pieza gráfica del ad */
  mood?: 'luminoso' | 'cálido' | 'moderno' | 'clásico' | 'amplio' | 'industrial' | 'aspiracional' | 'familiar'
  /** Score de impacto 0-100; el orden del array ya lo refleja pero esto es info adicional */
  impactScore?: number
}

export interface PropertyVisionAnalysis {
  highlights: PropertyHighlight[] // 5 atributos visuales más fuertes, ordenados por impacto
  detectedFeatures: string[] // lista de features visibles (objetiva)
  bestPhotoIndex: number // foto principal para el ad creative
  ambience: 'luminoso' | 'cálido' | 'moderno' | 'clásico' | 'amplio' | 'industrial'
  summary: string // 1-2 oraciones para alimentar el copywriter
  source: 'vision' | 'template'
}

const SYSTEM_PROMPT = `Sos un director creativo de una inmobiliaria premium argentina. Tu trabajo es analizar las fotos de una propiedad e identificar los 5 mejores ángulos comerciales para vender o alquilar.

Cada "highlight" es un argumento de venta visualmente respaldado por una foto. Tu output va a alimentar:
1. La selección del feature destacado en la pieza gráfica.
2. El generador de imágenes de anuncio (Gemini 2.5 Flash Image) — el "mood" guía el estilo gráfico.
3. El copywriter — los "copyHooks" son datos concretos que el copy puede usar.

Devolvé un JSON con esta estructura EXACTA:

{
  "highlights": [
    {
      "id": "slug_kebab_es",
      "label": "Descripción comercial humana (máx 60 chars)",
      "reasoning": "Por qué este highlight vende: 1-2 oraciones",
      "photoIndex": 0,
      "copyHooks": ["dato 1 concreto", "dato 2 concreto", "dato 3 concreto"],
      "mood": "luminoso" | "cálido" | "moderno" | "clásico" | "amplio" | "industrial" | "aspiracional" | "familiar",
      "impactScore": 0-100
    },
    ... (EXACTAMENTE 5 items, ordenados de mayor a menor impactScore)
  ],
  "detectedFeatures": ["lista exhaustiva pero objetiva de features visibles"],
  "bestPhotoIndex": 0,
  "ambience": "luminoso" | "cálido" | "moderno" | "clásico" | "amplio" | "industrial",
  "summary": "1-2 oraciones objetivas para alimentar copy del ad"
}

Guía de cada campo:

**highlights[].id**: kebab_case en español. Ejemplos: pileta, balcon_aterrazado, vista_panoramica, parrilla_quincho, jardin_propio, cocina_integrada, living_amplio, vestidor, dependencia_servicio, lavadero, terraza_uso_exclusivo, ventanales_piso_techo, doble_orientacion, luz_natural, espacios_abiertos, edificio_premium, sum_amenities, gimnasio, seguridad_24hs, cocheras_dobles.

**highlights[].label**: tono comercial pero sobrio. NO usar: "oportunidad única", "una joya", "imperdible", "una belleza". SÍ usar: "Pileta climatizada del edificio", "Balcón aterrazado con vista al verde", "Cocina integrada con isla".

**highlights[].reasoning**: explicación corta de por qué este highlight es un argumento de venta fuerte. Ej. "La pileta climatizada del edificio es un amenity premium que diferencia a esta propiedad del resto del barrio y agrega percepción de valor sin importar la estación del año."

**highlights[].copyHooks**: datos CONCRETOS para que el copywriter use directamente. Si la foto muestra una cocina integrada con isla y vos ves bachas dobles, el hook es "cocina integrada con isla y bacha doble". Si ves un balcón con cobertura, "balcón aterrazado de aprox. X m²". Sin inventar números: si no podés medir, no menciones m². Mínimo 2, máximo 4 hooks.

**highlights[].mood**: la estética/tono que la pieza gráfica del ad debería tener para resaltar este highlight. Si el highlight es "vista panorámica desde el piso 12", mood = "aspiracional". Si es "living comedor amplio con luz natural", mood = "luminoso". Si es "cocina con detalles en madera y bronce", mood = "cálido". Si es "espacios abiertos minimalistas en blanco", mood = "moderno". Es la guía estética que vamos a pasarle al generador de imágenes.

**highlights[].impactScore**: 0-100. 100 = highlight diferencial absoluto que la mayoría de competidores del barrio no tienen (ej. pileta, vista panorámica, balcón aterrazado grande, terraza propia). 60-80 = highlight valioso pero común en el segmento (cocina integrada, ventanales, dormitorios amplios). 30-60 = highlight base esperable (1 baño completo, lavadero, cochera). Ordenar el array por este score descendente.

**detectedFeatures**: lista exhaustiva pero ESTRICTAMENTE objetiva. Solo lo que se VE en las fotos. Sin inventar amenities no visibles. Sin asumir lo que hay detrás de una puerta cerrada.

**bestPhotoIndex**: la foto con mejor combo de luz + composición + feature destacado. Suele ser un living luminoso o una vista, no siempre es la primera de la lista. Si todas las fotos son medias, elegir la menos genérica.

**ambience**: tono general dominante de las fotos. Es distinto al mood de cada highlight — es el tono GLOBAL del listing.

**summary**: 1-2 oraciones que un copywriter pueda usar como brief inicial. Sin clichés. Ejemplo válido: "Departamento de 3 ambientes en piso 5 con luz natural y balcón aterrazado, en edificio premium con pileta climatizada y SUM."

REGLAS DE ORO:
- Si ves pileta, balcón aterrazado, vista panorámica, terraza propia o jardín → casi siempre van en el top 2 (impactScore ≥ 85).
- Si NO ves un feature, NO lo inventes. El asesor puede agregarlo manual después.
- Devolvé EXACTAMENTE 5 highlights. Si la propiedad es muy básica, los últimos pueden tener impactScore bajo (40-50) y describir cosas como "buena luz natural", "amplios espacios", "ubicación estratégica" — pero siempre 5.
- Output SOLO el JSON. Sin markdown, sin fences, sin texto antes ni después.`

interface GeminiResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
  }>
  error?: { message?: string }
}

interface GeminiInlineImage {
  inline_data: { mime_type: string; data: string }
}

/**
 * Descarga una foto pública y la convierte a base64 + detecta mime type.
 * Gemini REST acepta inline_data en base64 (no soporta URLs externas como
 * Anthropic). Timeout corto por imagen para no bloquear el endpoint si una
 * URL responde lento.
 */
async function fetchPhotoAsInline(
  url: string,
  signal: AbortSignal,
): Promise<GeminiInlineImage | null> {
  try {
    const res = await fetch(url, { signal })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? 'image/jpeg'
    // Solo aceptamos formatos que Gemini soporta para vision
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    const mime = allowed.find(a => ct.startsWith(a)) ?? 'image/jpeg'
    const buf = Buffer.from(await res.arrayBuffer())
    // Gemini tiene límite ~20MB por payload completo. Cada foto debería ser <4MB.
    if (buf.byteLength > 4 * 1024 * 1024) return null
    return { inline_data: { mime_type: mime, data: buf.toString('base64') } }
  } catch {
    return null
  }
}

async function callGeminiVision(photos: string[]): Promise<PropertyVisionAnalysis | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null

  // Timeout global 15s (download + Gemini). El endpoint meta-wizard también
  // hace generateAdCopyVariations (OpenAI, 5-15s) y getUsdToArs (1-2s) en
  // paralelo después — total worst case ~30s que es el límite de Netlify.
  // Dejamos 15s a Gemini para tener margen contra el límite del runtime.
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 15_000)

  try {
    // Descargamos hasta 8 fotos en paralelo y filtramos las que fallaron.
    const inlineImages = (
      await Promise.all(
        photos.slice(0, 8).map(url => fetchPhotoAsInline(url, controller.signal)),
      )
    ).filter((x): x is GeminiInlineImage => x !== null)

    if (inlineImages.length === 0) {
      console.warn('[vision] no se pudo descargar ninguna foto; usando fallback')
      return null
    }

    const model = process.env.GEMINI_VISION_MODEL ?? 'gemini-2.0-flash'
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [
        {
          role: 'user',
          parts: [
            ...inlineImages,
            {
              text: `Analiza estas ${inlineImages.length} fotos de la propiedad. Devolvé SOLO el JSON especificado en el system, sin texto extra ni fences.`,
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.4,
        maxOutputTokens: 1500,
      },
    }

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    )
    if (!res.ok) {
      console.warn('[vision] Gemini error', res.status, await res.text())
      return null
    }
    const data = (await res.json()) as GeminiResponse
    const text = data.candidates?.[0]?.content?.parts?.find(p => p.text)?.text
    if (!text) {
      if (data.error) console.warn('[vision] Gemini error response', data.error)
      return null
    }

    // Por las dudas, limpiar fences markdown si Gemini los devuelve.
    const jsonText = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
    const parsed = JSON.parse(jsonText) as Partial<PropertyVisionAnalysis>

    if (
      !Array.isArray(parsed.highlights) ||
      !Array.isArray(parsed.detectedFeatures) ||
      typeof parsed.bestPhotoIndex !== 'number'
    ) {
      console.warn('[vision] JSON shape inválido')
      return null
    }
    const VALID_MOODS = new Set([
      'luminoso',
      'cálido',
      'moderno',
      'clásico',
      'amplio',
      'industrial',
      'aspiracional',
      'familiar',
    ])
    return {
      highlights: parsed.highlights.slice(0, 5).map(h => {
        const moodRaw = (h as { mood?: string }).mood
        const hooks = (h as { copyHooks?: unknown }).copyHooks
        return {
          id: String(h.id).slice(0, 40),
          label: String(h.label).slice(0, 80),
          reasoning: String(h.reasoning).slice(0, 300),
          photoIndex: Number(h.photoIndex) || 0,
          mood: VALID_MOODS.has(String(moodRaw))
            ? (moodRaw as PropertyHighlight['mood'])
            : undefined,
          copyHooks: Array.isArray(hooks)
            ? hooks.slice(0, 4).map(s => String(s).slice(0, 100))
            : undefined,
          impactScore: Math.max(
            0,
            Math.min(100, Number((h as { impactScore?: number }).impactScore) || 0),
          ),
        }
      }),
      detectedFeatures: parsed.detectedFeatures.slice(0, 20).map(String),
      bestPhotoIndex: parsed.bestPhotoIndex,
      ambience: (parsed.ambience as PropertyVisionAnalysis['ambience']) ?? 'luminoso',
      summary: String(parsed.summary ?? '').slice(0, 300),
      source: 'vision',
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[vision] Gemini timeout (>15s), usando fallback')
    } else {
      console.warn('[vision] error', err)
    }
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Fallback determinístico: arma highlights a partir de amenities + metadata.
 * No tan fino como vision pero mantiene el wizard funcional sin API key.
 */
function templateAnalysis(property: Property): PropertyVisionAnalysis {
  const amenities = Array.isArray(property.amenities)
    ? (property.amenities as string[])
    : []
  const highlights: PropertyHighlight[] = []

  // Priorización por orden conocido de "vendido". Cada entry: [needle, label, id, mood, score]
  const PRIORITY: Array<[
    string,
    string,
    string,
    PropertyHighlight['mood'],
    number,
  ]> = [
    ['pileta', 'Pileta del edificio', 'pileta', 'aspiracional', 95],
    ['parrilla', 'Parrilla y quincho', 'parrilla_quincho', 'cálido', 85],
    ['terraza', 'Terraza propia', 'terraza_uso_exclusivo', 'aspiracional', 90],
    ['sum', 'SUM y áreas comunes', 'sum', 'moderno', 75],
    ['gimnasio', 'Gimnasio del edificio', 'gimnasio', 'moderno', 80],
    ['seguridad', 'Seguridad 24hs', 'seguridad_24hs', 'clásico', 70],
    ['cochera', 'Cochera propia', 'cochera_propia', 'clásico', 65],
    ['balcón', 'Balcón aterrazado', 'balcon_aterrazado', 'aspiracional', 80],
    ['jardin', 'Jardín propio', 'jardin_propio', 'familiar', 88],
  ]

  for (const [needle, label, id, mood, score] of PRIORITY) {
    if (highlights.length >= 5) break
    if (amenities.some(a => a.toLowerCase().includes(needle))) {
      highlights.push({
        id,
        label,
        reasoning: `${label} — feature destacado en los amenities de la propiedad`,
        photoIndex: 0,
        mood,
        impactScore: score,
        copyHooks: [label.toLowerCase()],
      })
    }
  }

  // Si no llegamos a 5, completar con highlights basados en metadata
  if (highlights.length < 5 && property.rooms && property.rooms >= 3) {
    highlights.push({
      id: 'amb_amplio',
      label: `${property.rooms} ambientes amplios`,
      reasoning: 'Cantidad de ambientes amplia para el segmento del barrio',
      photoIndex: 0,
      mood: 'amplio',
      impactScore: 60,
      copyHooks: [`${property.rooms} ambientes`],
    })
  }
  if (highlights.length < 5 && property.covered_area && property.covered_area >= 80) {
    highlights.push({
      id: 'm2_amplio',
      label: `${property.covered_area} m² cubiertos`,
      reasoning: 'Metraje generoso',
      photoIndex: 0,
      mood: 'amplio',
      impactScore: 55,
      copyHooks: [`${property.covered_area} m² cubiertos`],
    })
  }
  if (highlights.length < 5 && property.floor && property.floor >= 5) {
    highlights.push({
      id: 'piso_alto',
      label: `Piso ${property.floor} con buena vista`,
      reasoning: 'Piso alto mejora luminosidad y vista',
      photoIndex: 0,
      mood: 'aspiracional',
      impactScore: 65,
      copyHooks: [`piso ${property.floor}`],
    })
  }
  // Completar hasta 5 con ubicación si hace falta
  while (highlights.length < 5) {
    highlights.push({
      id: `ubicacion_estrategica_${highlights.length}`,
      label: `Ubicación estratégica en ${property.neighborhood}`,
      reasoning: `${property.neighborhood} es uno de los barrios más demandados del segmento`,
      photoIndex: 0,
      mood: 'clásico',
      impactScore: 45,
      copyHooks: [property.neighborhood],
    })
  }

  return {
    highlights,
    detectedFeatures: amenities,
    bestPhotoIndex: 0,
    ambience: 'luminoso',
    summary: `Departamento en ${property.neighborhood} con ${property.rooms ?? 3} ambientes y ${property.covered_area ?? 70} m² cubiertos.`,
    source: 'template',
  }
}

/**
 * Punto de entrada principal. Intenta vision API; si falla o no está
 * configurada, vuelve al template.
 */
export async function analyzePropertyPhotos(
  property: Property,
): Promise<PropertyVisionAnalysis> {
  if (!property.photos || property.photos.length === 0) {
    return templateAnalysis(property)
  }
  const vision = await callGeminiVision(property.photos)
  if (vision) return vision
  return templateAnalysis(property)
}
