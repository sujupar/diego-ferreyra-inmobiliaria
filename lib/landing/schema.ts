/**
 * E1.2 — Schema del documento de landing (la VERDAD del diseño).
 *
 * La landing es DATO, no código: un `LandingDocument` con `blocks[]` ordenados
 * que un registry interpreta. Los bloques guardan solo OVERRIDES + toggles; los
 * datos duros (precio, m², fotos) se resuelven en render desde `properties` por
 * índice/referencia (nunca URLs snapshot → nunca stale, sin inyección).
 *
 * Este schema se valida con Zod al publicar (E1.4) y al guardar desde el editor
 * (E1.6). El invariante de conversión (exactamente 1 lead_form) se chequea acá.
 */
import { z } from 'zod'

// ---- Bloques (discriminated union por `type`) ----
// Cada bloque: id estable (para @dnd-kit en el editor) + type + props propios.

const HeroBlock = z.object({
  id: z.string(),
  type: z.literal('hero'),
  /** Sobrescribe el título; si falta, se deriva de property.title. */
  titleOverride: z.string().max(140).optional(),
  /** Índice en property.photos para el fondo del hero. Default 0. */
  heroPhotoIndex: z.number().int().min(0).optional(),
  /** Variante visual (para templates premium en E1.7). */
  variant: z.enum(['classic', 'cinematic', 'split']).optional(),
})

const FeaturesBlock = z.object({
  id: z.string(),
  type: z.literal('features'),
})

const GalleryBlock = z.object({
  id: z.string(),
  type: z.literal('gallery'),
  /** Índices de property.photos a mostrar; si falta, todas. */
  photoIndices: z.array(z.number().int().min(0)).optional(),
})

const VideoEmbedBlock = z.object({
  id: z.string(),
  type: z.literal('video_embed'), // usa property.video_url (YouTube/Vimeo)
})

const VideoFileBlock = z.object({
  id: z.string(),
  type: z.literal('video_file'), // usa property.video_file_url (archivo subido) — BUG documentado
})

const Tour3dBlock = z.object({
  id: z.string(),
  type: z.literal('tour_3d'), // usa property.tour_3d_url
})

const DescriptionBlock = z.object({
  id: z.string(),
  type: z.literal('description'),
  /** Si falta, usa property.description. */
  textOverride: z.string().optional(),
})

const LocationMapBlock = z.object({
  id: z.string(),
  type: z.literal('location_map'), // usa property.latitude/longitude
})

const ProofBarBlock = z.object({
  id: z.string(),
  type: z.literal('proof_bar'),
  /** Ítems de prueba social. Default incluye CUCICBA 8266. */
  items: z.array(z.string().max(80)).max(6).optional(),
})

const LeadFormBlock = z.object({
  id: z.string(),
  type: z.literal('lead_form'), // el objetivo de conversión — bloque LOCKED en el editor
  /** Texto del CTA orientado a resultado. Default "Quiero conocerla". */
  ctaLabel: z.string().max(40).optional(),
})

export const LandingBlock = z.discriminatedUnion('type', [
  HeroBlock,
  FeaturesBlock,
  GalleryBlock,
  VideoEmbedBlock,
  VideoFileBlock,
  Tour3dBlock,
  DescriptionBlock,
  LocationMapBlock,
  ProofBarBlock,
  LeadFormBlock,
])
export type LandingBlock = z.infer<typeof LandingBlock>
export type LandingBlockType = LandingBlock['type']

// ---- Theme ----
export const LandingTheme = z.object({
  /** Color de acento (CTA). Derivado de las fotos en E1.7; hex validado. */
  accent: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  /** 'off' desactiva parallax/motion (respeta prefers-reduced-motion). */
  motion: z.enum(['on', 'off']).optional(),
})
export type LandingTheme = z.infer<typeof LandingTheme>

// ---- Documento ----
export const LandingDocument = z
  .object({
    version: z.literal(1),
    blocks: z.array(LandingBlock).min(1),
    theme: LandingTheme.default({}),
  })
  .superRefine((doc, ctx) => {
    // Invariante de conversión: EXACTAMENTE un lead_form. Es el objetivo de la
    // landing; sin él no hay conversión, con dos se dispersa.
    const forms = doc.blocks.filter(b => b.type === 'lead_form')
    if (forms.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: `La landing debe tener exactamente 1 formulario (tiene ${forms.length}).`,
        path: ['blocks'],
      })
    }
    // IDs únicos (para @dnd-kit y para revisiones).
    const ids = new Set<string>()
    for (const b of doc.blocks) {
      if (ids.has(b.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `ID de bloque duplicado: ${b.id}`,
          path: ['blocks'],
        })
      }
      ids.add(b.id)
    }
  })
export type LandingDocument = z.infer<typeof LandingDocument>

/** Parseo tolerante: devuelve el doc validado o null (para el fallback legacy). */
export function safeParseLandingDocument(raw: unknown): LandingDocument | null {
  const res = LandingDocument.safeParse(raw)
  return res.success ? res.data : null
}
