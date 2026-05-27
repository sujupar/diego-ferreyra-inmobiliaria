/**
 * Generador de imágenes premium para anuncios Meta Ads usando Gemini 2.5
 * Flash Image (modelo `gemini-2.5-flash-image-preview` o GA equivalente).
 *
 * Flow:
 *  1. Descarga la foto base de la propiedad (URL pública).
 *  2. Construye el prompt estructurado (1000+ palabras) con `ad-image-prompts.ts`.
 *  3. Llama a Gemini Image con la foto base + prompt.
 *  4. Recibe la imagen generada (base64).
 *  5. Convierte a los formatos Meta requeridos con sharp.
 *
 * Falla con `null` en lugar de throw — el caller decide si hace fallback a
 * la foto original. Nunca queremos romper el flow de la campaña por un
 * problema de generación de imagen.
 */
import sharp from 'sharp'
import type { Property } from '@/lib/portals/types'
import type { PropertyHighlight } from './property-vision-analyzer'
import { buildAdImagePrompt, type AdFormat, type CompositionStyle } from './ad-image-prompts'

interface FormatDimensions {
  width: number
  height: number
}

const FORMAT_DIMENSIONS: Record<AdFormat, FormatDimensions> = {
  feed_square: { width: 1080, height: 1080 },
  feed_vertical: { width: 1080, height: 1350 },
  story_vertical: { width: 1080, height: 1920 },
}

export interface GeneratedAdImage {
  format: AdFormat
  buffer: Buffer
  mimeType: string
  /** Hash del prompt usado (para cache) */
  promptHash: string
}

interface GenerateInput {
  property: Property
  highlight: PropertyHighlight
  copyHeadline: string
  format: AdFormat
  compositionStyle?: CompositionStyle
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

/**
 * Hash simple del prompt para cache key. SHA-1 trunc a 16 hex chars.
 * No es para seguridad — es para detectar si el prompt cambió.
 */
function hashString(s: string): string {
  // Implementación simple FNV-1a (no requiere import)
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = (h * 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

async function fetchPhotoBase64(url: string): Promise<{ data: string; mime: string } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const ct = res.headers.get('content-type') ?? 'image/jpeg'
    const buf = Buffer.from(await res.arrayBuffer())
    // Gemini soporta jpeg/png/webp. Normalizamos a jpeg si es otra cosa.
    const mime = ct.startsWith('image/') ? ct.split(';')[0] : 'image/jpeg'
    return { data: buf.toString('base64'), mime }
  } catch {
    return null
  }
}

/**
 * Genera una imagen publicitaria para un highlight + formato específico
 * usando Gemini 2.5 Flash Image. Devuelve null si la generación falla
 * o no hay API key.
 */
export async function generateAdImage(
  input: GenerateInput,
): Promise<GeneratedAdImage | null> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    console.warn('[ad-image-gen] GEMINI_API_KEY no configurada — saltando generación')
    return null
  }

  const basePhotoUrl =
    input.property.photos[input.highlight.photoIndex] ?? input.property.photos[0]
  if (!basePhotoUrl) {
    console.warn('[ad-image-gen] propiedad sin fotos — no se puede generar')
    return null
  }

  const photo = await fetchPhotoBase64(basePhotoUrl)
  if (!photo) {
    console.warn('[ad-image-gen] no se pudo descargar foto base')
    return null
  }

  const prompt = buildAdImagePrompt({
    property: input.property,
    highlight: input.highlight,
    format: input.format,
    copyHeadline: input.copyHeadline,
    compositionStyle: input.compositionStyle,
  })
  const promptHash = hashString(prompt)

  const model = process.env.GEMINI_IMAGE_MODEL ?? 'gemini-2.5-flash-image-preview'

  // Timeout 30s para generación de imagen. Gemini Image suele tardar 8-15s.
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)

  try {
    const body = {
      contents: [
        {
          role: 'user',
          parts: [
            { inline_data: { mime_type: photo.mime, data: photo.data } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
        temperature: 0.4,
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
      const text = await res.text()
      console.warn(`[ad-image-gen] Gemini ${res.status}:`, text.slice(0, 500))
      return null
    }

    const data = (await res.json()) as GeminiImageResponse
    const parts = data.candidates?.[0]?.content?.parts ?? []
    // Gemini puede devolver tanto inline_data (snake_case) como inlineData (camelCase)
    const imagePart = parts.find(p => p.inline_data || p.inlineData)
    const inline = imagePart?.inline_data ?? (imagePart?.inlineData
      ? { mime_type: imagePart.inlineData.mimeType, data: imagePart.inlineData.data }
      : null)
    if (!inline?.data) {
      console.warn('[ad-image-gen] respuesta sin imagen inline:', JSON.stringify(data).slice(0, 300))
      return null
    }

    const rawBuffer = Buffer.from(inline.data, 'base64')
    // Convertir/normalizar al formato exacto requerido por Meta
    const targetDim = FORMAT_DIMENSIONS[input.format]
    const finalBuffer = await sharp(rawBuffer)
      .resize(targetDim.width, targetDim.height, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 88, progressive: true })
      .toBuffer()

    return {
      format: input.format,
      buffer: finalBuffer,
      mimeType: 'image/jpeg',
      promptHash,
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      console.warn('[ad-image-gen] Gemini timeout (>30s)')
    } else {
      console.warn('[ad-image-gen] error:', err)
    }
    return null
  } finally {
    clearTimeout(timeoutId)
  }
}

/**
 * Helper: dado un Buffer ya generado, devuelve versiones en otros formatos
 * Meta. Más barato que llamar a Gemini de nuevo — usamos sharp para resize.
 *
 * Útil cuando queremos cubrir varios placements (feed + story) sin gastar
 * varias generaciones por highlight.
 */
export async function reformatAdImage(
  source: Buffer,
  targetFormat: AdFormat,
): Promise<Buffer> {
  const dim = FORMAT_DIMENSIONS[targetFormat]
  return sharp(source)
    .resize(dim.width, dim.height, { fit: 'cover', position: 'center' })
    .jpeg({ quality: 88, progressive: true })
    .toBuffer()
}
