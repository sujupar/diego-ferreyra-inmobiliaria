/**
 * Engine de overlay tipográfico — stage B del pipeline 2-stage.
 *
 * Toma:
 *  - Una foto procesada (buffer JPG/PNG) que vino del stage A (Gemini Image)
 *  - Tokens inmutables (precio, headline, specs, etc.)
 *  - Estilo de composición + formato Meta
 *  - Paleta del mood
 *
 * Devuelve un Buffer JPG listo para subir a /adimages — texto vectorial
 * con kerning perfecto y CERO errores ortográficos (no pasa por modelo IA).
 *
 * Flow:
 *   tokens + foto → JSX template → satori → SVG string
 *                                          ↓
 *                                       resvg → PNG buffer
 *                                          ↓
 *                                      sharp → JPG buffer (final)
 */
import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { getSatoriFonts } from './satori-fonts'
import {
  renderTemplate,
  getDimensions,
  type CompositionStyle,
  type AdFormat,
  type TemplateProps,
} from './ad-image-templates'
import type { PropertyHighlight } from './property-vision-analyzer'

export interface OverlayInput {
  /** Buffer crudo de la foto procesada por Gemini (stage A) */
  photoBuffer: Buffer
  /** Mime type de la foto procesada — para construir el data URL */
  photoMime: string
  format: AdFormat
  style: CompositionStyle
  /** Tokens literales que se renderizan sin tocar */
  tokens: TemplateProps['tokens']
  /** Paleta de colores derivada del mood del highlight */
  palette: TemplateProps['palette']
}

/**
 * Convierte mood → paleta. Sin usar IA — paletas determinísticas por mood
 * mapeadas a hex codes calibrados para impresión premium.
 */
export function paletteFor(
  mood: NonNullable<PropertyHighlight['mood']> | undefined,
): TemplateProps['palette'] {
  const palettes: Record<NonNullable<PropertyHighlight['mood']>, TemplateProps['palette']> = {
    luminoso: { bg: '#FAFAF8', text: '#1B1F2A', accent: '#2A3B84' },
    cálido: { bg: '#F7F2EA', text: '#3B2C20', accent: '#B8956A' },
    moderno: { bg: '#FFFFFF', text: '#0A0A0A', accent: '#1B1F2A' },
    clásico: { bg: '#F2EDE3', text: '#2D2317', accent: '#A38851' },
    amplio: { bg: '#FFFFFF', text: '#0F1729', accent: '#0F1729' },
    industrial: { bg: '#E8E5DF', text: '#1A1A1A', accent: '#7A1F22' },
    aspiracional: { bg: '#F8F5EE', text: '#1B1F2A', accent: '#D4AF7A' },
    familiar: { bg: '#F9F6F0', text: '#5A4632', accent: '#1B1F2A' },
  }
  return palettes[mood ?? 'luminoso']
}

/**
 * Genera la pieza final tipográfica sobre la foto.
 *
 * Concurrencia: satori NO es thread-safe en algunos modos, pero al
 * importarse fresh por module y usar buffer inputs, está OK para
 * llamadas paralelas dentro de la misma lambda. Probado.
 */
export async function renderOverlayPiece(input: OverlayInput): Promise<Buffer> {
  const { width, height } = getDimensions(input.format)

  // Convertir foto a data URL — satori lee imágenes inline, no por URL.
  const photoBase64 = input.photoBuffer.toString('base64')
  const photoDataUrl = `data:${input.photoMime};base64,${photoBase64}`

  const tree = renderTemplate(input.style, {
    format: input.format,
    photoDataUrl,
    tokens: input.tokens,
    palette: input.palette,
  })

  // satori convierte el JSX tree a SVG. Si el tree usa una fuente que no
  // pasamos, satori tira error claro. Usamos Inter + Cormorant Garamond.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svgString = await satori(tree as any, {
    width,
    height,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    fonts: getSatoriFonts() as any,
  })

  // resvg renderiza el SVG a PNG con anti-aliasing de calidad. El bg fit
  // viene del propio SVG (no necesitamos background extra).
  const resvg = new Resvg(svgString, {
    fitTo: { mode: 'width', value: width },
    background: '#FFFFFF',
    font: {
      // Las fuentes vienen embedidas en el SVG por satori; no necesitamos
      // exponerlas de nuevo a resvg.
      loadSystemFonts: false,
    },
  })
  const pngBuffer = Buffer.from(resvg.render().asPng())

  // sharp normaliza al JPG final con quality 92 (vs 88 del v1 — la
  // tipografía vectorial se beneficia de quality alta).
  const finalBuffer = await sharp(pngBuffer)
    .resize(width, height, { fit: 'cover', position: 'center' })
    .jpeg({ quality: 92, progressive: true, mozjpeg: true })
    .toBuffer()

  return finalBuffer
}
