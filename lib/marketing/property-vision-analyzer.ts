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
}

export interface PropertyVisionAnalysis {
  highlights: PropertyHighlight[] // top 3 atributos visuales más fuertes
  detectedFeatures: string[] // lista de features visibles (objetiva)
  bestPhotoIndex: number // foto principal para el ad creative
  ambience: 'luminoso' | 'cálido' | 'moderno' | 'clásico' | 'amplio' | 'industrial'
  summary: string // 1-2 oraciones para alimentar el copywriter
  source: 'vision' | 'template'
}

const SYSTEM_PROMPT = `Sos un agente que analiza fotos de propiedades inmobiliarias para una inmobiliaria argentina. Tu trabajo es identificar los 3 highlights visuales más fuertes (lo que hace que esta propiedad se destaque), detectar features visibles concretos, y elegir cuál foto debería ser la "principal" del aviso publicitario.

Devolvé un JSON con esta estructura exacta:

{
  "highlights": [
    { "id": "slug", "label": "Descripción humana 60 chars max", "reasoning": "Por qué destaca esto", "photoIndex": 0 },
    ... (3 items)
  ],
  "detectedFeatures": ["pileta", "balcón aterrazado", "parrilla", "vista despejada", "cocina integrada", "amplios ventanales", ...],
  "bestPhotoIndex": 0,
  "ambience": "luminoso" | "cálido" | "moderno" | "clásico" | "amplio" | "industrial",
  "summary": "1-2 oraciones objetivas para alimentar copy del ad"
}

Reglas:
- highlights[].id: kebab_case en español (pileta, balcon_aterrazado, vista_panoramica, parrilla_quincho, jardin_propio, cocina_integrada, vestidor, dependencia, lavadero, terraza_uso_exclusivo, etc).
- Si ves pileta, balcón aterrazado o vista panorámica, esos casi siempre son los #1 highlights.
- bestPhotoIndex: la foto que tenga el mejor combo de luz + features. NO siempre es la primera.
- detectedFeatures: lista exhaustiva pero objetiva (sin inventar).
- Sin clichés ("oportunidad única", "una joya"). Lenguaje preciso.
- Output SOLO el JSON. Sin texto antes ni después.`

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

  // Timeout global 25s para el flujo entero (descargas + Gemini). El endpoint
  // de Next.js suele tener 30s; dejamos margen para serializar la respuesta.
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 25_000)

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
    return {
      highlights: parsed.highlights.slice(0, 3).map(h => ({
        id: String(h.id).slice(0, 40),
        label: String(h.label).slice(0, 80),
        reasoning: String(h.reasoning).slice(0, 200),
        photoIndex: Number(h.photoIndex) || 0,
      })),
      detectedFeatures: parsed.detectedFeatures.slice(0, 20).map(String),
      bestPhotoIndex: parsed.bestPhotoIndex,
      ambience: (parsed.ambience as PropertyVisionAnalysis['ambience']) ?? 'luminoso',
      summary: String(parsed.summary ?? '').slice(0, 300),
      source: 'vision',
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[vision] Gemini timeout (>25s), usando fallback')
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

  // Priorización por orden conocido de "vendido"
  const PRIORITY = [
    ['pileta', 'Pileta del edificio', 'pileta'],
    ['parrilla', 'Parrilla / quincho', 'parrilla_quincho'],
    ['sum', 'SUM y áreas comunes', 'sum'],
    ['gimnasio', 'Gimnasio del edificio', 'gimnasio'],
    ['seguridad', 'Seguridad 24hs', 'seguridad_24hs'],
    ['cochera', 'Cochera propia', 'cochera_propia'],
    ['balcón', 'Balcón', 'balcon'],
  ] as const

  for (const [needle, label, id] of PRIORITY) {
    if (highlights.length >= 3) break
    if (amenities.some(a => a.toLowerCase().includes(needle))) {
      highlights.push({
        id,
        label,
        reasoning: `Listado en amenities de la propiedad`,
        photoIndex: 0,
      })
    }
  }

  // Si no llegamos a 3, completar con highlights basados en metadata
  if (highlights.length < 3 && property.rooms && property.rooms >= 3) {
    highlights.push({
      id: 'amb_amplio',
      label: `${property.rooms} ambientes amplios`,
      reasoning: 'Cantidad de ambientes',
      photoIndex: 0,
    })
  }
  if (highlights.length < 3 && property.covered_area && property.covered_area >= 80) {
    highlights.push({
      id: 'm2_amplio',
      label: `${property.covered_area} m² cubiertos`,
      reasoning: 'Metraje generoso',
      photoIndex: 0,
    })
  }
  if (highlights.length < 3) {
    highlights.push({
      id: 'ubicacion_estrategica',
      label: `Ubicación en ${property.neighborhood}`,
      reasoning: 'Barrio como diferencial',
      photoIndex: 0,
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
