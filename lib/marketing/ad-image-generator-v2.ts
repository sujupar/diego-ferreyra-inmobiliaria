/**
 * Generator v2 — pipeline 2-stage.
 *
 * Stage A: Gemini 2.5 Flash Image procesa SOLO la foto. Prompt corto sin
 *          texto, sin overlays, sin tipografía. Devuelve foto retocada.
 * Stage B: Engine de overlay tipográfico (satori + resvg) compone el texto
 *          con fuentes reales sobre la foto procesada.
 *
 * Resultado: piezas con foto de calidad agencia + tipografía vectorial
 * impecable + CERO errores ortográficos (los strings no pasan por IA).
 *
 * Diferencias clave vs v1 (lib/marketing/ad-image-generator.ts):
 *  - Prompt 10x más corto (foto-only)
 *  - Aspect ratio fijo 1:1 para el output Gemini (después overlay define ratio final)
 *  - Cero ambigüedad de texto — los tokens van solo al overlay
 *
 * Si Gemini falla en el stage A, hacemos fallback a la foto original
 * (sin procesar) y el overlay igual se aplica. Una pieza con foto cruda
 * pero tipografía perfecta sigue siendo aceptable.
 */
import sharp from 'sharp'
import type { Property } from '@/lib/portals/types'
import type { PropertyHighlight } from './property-vision-analyzer'
import {
  renderOverlayPiece,
  paletteFor,
  type OverlayInput,
} from './ad-image-typography-overlay'
import type { AdFormat, CompositionStyle } from './ad-image-templates'

export type { AdFormat, CompositionStyle }

export interface GeneratedAdImage {
  format: AdFormat
  buffer: Buffer
  mimeType: string
  promptHash: string
  /** Source de la foto: 'gemini' (procesada) o 'fallback' (original sin procesar) */
  photoSource: 'gemini' | 'fallback'
}

export interface GenerateInputV2 {
  property: Property
  highlight: PropertyHighlight
  copyHeadline: string
  format: AdFormat
  compositionStyle?: CompositionStyle
  overridePhotoUrl?: string
}

interface GeminiImageResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string
        inline_data?: { mime_type: string; data: string }
        inlineData?: { mimeType: string; data: string }
      }>
    }
  }>
  error?: { message?: string }
}

function hashString(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

async function fetchPhotoBuffer(url: string): Promise<{ buffer: Buffer; mime: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? 'image/jpeg'
    const buf = Buffer.from(await res.arrayBuffer())
    const mime = ct.startsWith('image/') ? ct.split(';')[0] : 'image/jpeg'
    return { buffer: buf, mime }
  } catch {
    return null
  }
}

/**
 * Stage A: Gemini procesa la foto. Prompt minimalista — solo retoque
 * fotográfico, sin pedirle texto/overlays/logos.
 */
async function enhancePhotoWithGemini(
  basePhotoUrl: string,
  mood: NonNullable<PropertyHighlight['mood']> | undefined,
): Promise<{ buffer: Buffer; mime: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('[ad-image-v2] GEMINI_API_KEY ausente — saltando enhancement')
    return null
  }

  const photo = await fetchPhotoBuffer(basePhotoUrl)
  if (!photo) {
    console.warn('[ad-image-v2] no se pudo descargar foto base')
    return null
  }

  const moodPhotoBrief = (() => {
    const briefs: Record<NonNullable<PropertyHighlight['mood']>, string> = {
      luminoso:
        'bright airy daylight feel, cool-neutral white balance, lifted shadows, soft natural light, no harsh contrast',
      cálido:
        'warm golden hour feel, slight amber tint in highlights, comfortable inviting glow, soft shadows',
      moderno:
        'clean modern editorial feel, crisp contrast, neutral grays, very contemporary',
      clásico:
        'classic timeless feel, balanced warm tones, muted color palette, refined',
      amplio:
        'spacious airy feel, lots of room to breathe, clean light, minimal shadows',
      industrial:
        'industrial editorial feel, slight desaturation, controlled shadows, architectural emphasis',
      aspiracional:
        'aspirational magazine cover feel, dramatic but elegant, premium polished look',
      familiar:
        'warm family-friendly feel, comfortable lighting, lived-in but premium',
    }
    return briefs[mood ?? 'luminoso']
  })()

  // Prompt CORTO y FOTO-ONLY. Sin pedir texto, sin headlines, sin precios.
  // Cualquier texto que aparezca va a generar bugs (es lo que pasaba en v1).
  const prompt = `Enhance this real estate photo for an Architectural Digest editorial.

Improve:
- Light: ${moodPhotoBrief}
- Correct lens distortion if visible
- White balance to natural temperature
- Lift shadows subtly
- Maintain photographic realism — do NOT alter architecture, do NOT add/remove objects

CRITICAL RULES:
- DO NOT add any text, words, letters, numbers, logos, watermarks, badges, labels, prices, captions, or graphic overlays to the image.
- DO NOT add typography of any kind.
- DO NOT add any decorative elements (frames, borders, shapes, icons).
- Return ONLY the enhanced photograph with nothing added on top.

The output must be a clean photograph — only photographic content, no text, no overlays.`

  const model = process.env.GEMINI_IMAGE_MODEL ?? 'gemini-2.5-flash-image'
  const controller = new AbortController()
  // Timeout 20s (no 30s del v1): el prompt foto-only es más corto y rápido,
  // si tarda más es señal de un problema. batchSize=2 × 20s = 40s deja margen
  // dentro del maxDuration=60s de Netlify.
  const timeoutId = setTimeout(() => controller.abort(), 20_000)

  try {
    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: photo.mime, data: photo.buffer.toString('base64') } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
        temperature: 0.15,
        imageConfig: { aspectRatio: '1:1' },
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
      console.warn(`[ad-image-v2] Gemini ${res.status}:`, (await res.text()).slice(0, 300))
      return null
    }

    const data = (await res.json()) as GeminiImageResponse
    const parts = data.candidates?.[0]?.content?.parts ?? []
    const imagePart = parts.find(p => p.inline_data || p.inlineData)
    const inline = imagePart?.inline_data ?? (imagePart?.inlineData
      ? { mime_type: imagePart.inlineData.mimeType, data: imagePart.inlineData.data }
      : null)
    if (!inline?.data) {
      console.warn('[ad-image-v2] respuesta sin imagen inline')
      return null
    }

    const rawBuffer = Buffer.from(inline.data, 'base64')
    // Normalizamos a JPG 1080×1080 para que el overlay lo use uniformemente.
    const normBuffer = await sharp(rawBuffer)
      .resize(1080, 1080, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 92 })
      .toBuffer()
    return { buffer: normBuffer, mime: 'image/jpeg' }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[ad-image-v2] Gemini timeout')
    } else {
      console.warn('[ad-image-v2] error stage A:', err)
    }
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Normaliza property_type a español argentino. Duplicado deliberado del helper
 * de ad-image-prompts.ts — los tokens del overlay son source of truth, no
 * dependen del prompt v1.
 */
function normalizePropertyTypeLabel(t: string | null | undefined): string {
  const map: Record<string, string> = {
    apartment: 'Departamento',
    departamento: 'Departamento',
    depto: 'Departamento',
    dpto: 'Departamento',
    house: 'Casa',
    casa: 'Casa',
    ph: 'PH',
    'p.h.': 'PH',
    loft: 'Loft',
    duplex: 'Dúplex',
    'dúplex': 'Dúplex',
    studio: 'Monoambiente',
    monoambiente: 'Monoambiente',
    mono: 'Monoambiente',
  }
  const key = (t ?? '').toString().toLowerCase().trim()
  return map[key] ?? (t ?? 'Propiedad')
}

function formatPrice(price: number, currency: string): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency || 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

function buildSpecs(property: Property): string {
  const parts: string[] = []
  if (property.rooms) parts.push(`${property.rooms} amb`)
  if (property.bedrooms) parts.push(`${property.bedrooms} dorm`)
  if (property.covered_area) parts.push(`${property.covered_area} m²`)
  if (property.floor != null) parts.push(`piso ${property.floor}`)
  if (property.neighborhood) parts.push(property.neighborhood)
  return parts.join(' · ')
}

function sanitizeHeadline(s: string): string {
  return s
    .replace(/[‘’‚‛′]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    // 60 chars: headlines de 80 con Cormorant 130px overflowean vertical en
    // story_vertical. 60 cabe en todos los templates con margen.
    .slice(0, 60)
}

/**
 * Punto de entrada del pipeline 2-stage. Devuelve la pieza final lista
 * para subir a Meta /adimages.
 */
export async function generateAdImageV2(
  input: GenerateInputV2,
): Promise<GeneratedAdImage | null> {
  const basePhotoUrl =
    input.overridePhotoUrl ??
    input.property.photos[input.highlight.photoIndex] ??
    input.property.photos[0]
  if (!basePhotoUrl) {
    console.warn('[ad-image-v2] property sin foto')
    return null
  }

  // Stage A: Gemini procesa foto
  let processedPhoto = await enhancePhotoWithGemini(basePhotoUrl, input.highlight.mood)
  let photoSource: 'gemini' | 'fallback' = 'gemini'
  if (!processedPhoto) {
    // Fallback: usar foto original sin procesar
    processedPhoto = await fetchPhotoBuffer(basePhotoUrl)
    photoSource = 'fallback'
    if (!processedPhoto) {
      console.warn('[ad-image-v2] ni Gemini ni la foto original están disponibles')
      return null
    }
  }

  // Stage B: overlay tipográfico
  const tokens = {
    propertyType: normalizePropertyTypeLabel(input.property.property_type),
    headline: sanitizeHeadline(input.copyHeadline),
    price: formatPrice(input.property.asking_price, input.property.currency),
    specs: buildSpecs(input.property),
    neighborhood: input.property.neighborhood ?? '',
  }
  const palette = paletteFor(input.highlight.mood)
  const compositionStyle = input.compositionStyle ?? 'split_photo_info'

  const overlayInput: OverlayInput = {
    photoBuffer: processedPhoto.buffer,
    photoMime: processedPhoto.mime,
    format: input.format,
    style: compositionStyle,
    tokens,
    palette,
  }

  try {
    const finalBuffer = await renderOverlayPiece(overlayInput)
    const promptHash = hashString(
      `${input.property.id}|${input.format}|${compositionStyle}|${input.highlight.id}`,
    )
    return {
      format: input.format,
      buffer: finalBuffer,
      mimeType: 'image/jpeg',
      promptHash,
      photoSource,
    }
  } catch (err) {
    console.warn('[ad-image-v2] stage B (overlay) falló:', err)
    return null
  }
}
