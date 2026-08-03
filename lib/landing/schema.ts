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
  /** Titular (tipo + ubicación + beneficio principal). Si falta, se deriva. */
  titleOverride: z.string().max(160).optional(),
  /** Subtítulo del hero (segunda línea, refuerza el beneficio). */
  subtitle: z.string().max(200).optional(),
  /** Descripción corta bajo el titular/video. */
  shortDesc: z.string().max(280).optional(),
  /** Texto del CTA del hero (abre el popup). Default "Ver el recorrido de la propiedad". */
  ctaLabel: z.string().max(40).optional(),
  /** E1.9 — etiqueta sobre el precio en el hero de lujo (ej. "Precio de venta"). */
  offerLabel: z.string().max(40).optional(),
  /** Índice en property.photos para el fondo del hero. Default 0. */
  heroPhotoIndex: z.number().int().min(0).optional(),
  /**
   * Protagonista del hero:
   *  'auto'  → video si la propiedad tiene, sino foto (default, E1.8)
   *  'photo' → siempre la foto
   *  'video' → fuerza el video (si existe)
   */
  mediaMode: z.enum(['auto', 'photo', 'video']).optional(),
  /** Variante visual. */
  variant: z.enum(['classic', 'cinematic', 'split']).optional(),
})

// ---- E1.8 · Bloques de CONVERSIÓN (beneficios intangibles, no ficha de portal) ----

const BenefitItem = z.object({
  /** A qué se ata el beneficio (para el ícono/encuadre). */
  tie: z.enum(['propiedad', 'ubicacion', 'amenities', 'otro']),
  title: z.string().max(80),
  body: z.string().max(320),
})

/** Los 3 beneficios INTANGIBLES (propiedad / ubicación / amenities). */
const IntangibleBenefitsBlock = z.object({
  id: z.string(),
  type: z.literal('intangible_benefits'),
  eyebrow: z.string().max(60).optional(),
  items: z.array(BenefitItem).min(1).max(4),
})

/** Beneficio principal + slides de imágenes que lo refuerzan. */
const BenefitShowcaseBlock = z.object({
  id: z.string(),
  type: z.literal('benefit_showcase'),
  headline: z.string().max(160),
  body: z.string().max(400).optional(),
  /** Índices de property.photos para las slides. Si falta, las primeras. */
  photoIndices: z.array(z.number().int().min(0)).optional(),
})

/** "Sobre esta propiedad" — storytelling. */
const StoryBlock = z.object({
  id: z.string(),
  type: z.literal('story'),
  title: z.string().max(80).optional(),
  /** Si falta, usa property.description. */
  body: z.string().optional(),
})

/** Beneficio principal destacado (declaración grande, centrada). */
const MainBenefitBlock = z.object({
  id: z.string(),
  type: z.literal('main_benefit'),
  headline: z.string().max(200),
  body: z.string().max(300).optional(),
})

/** Solo lo ESENCIAL (3-4 datos tangibles) — gancho, no ficha completa. */
const EssentialSpecsBlock = z.object({
  id: z.string(),
  type: z.literal('essential_specs'),
})

/** Ubicación SUTIL: barrio + una línea de beneficio de zona. SIN mapa ni botón. */
const LocationNoteBlock = z.object({
  id: z.string(),
  type: z.literal('location_note'),
  text: z.string().max(240).optional(),
})

/** Banda de CTA que abre el popup. Se usa 2-3 veces distribuida hacia abajo. */
const CtaBlock = z.object({
  id: z.string(),
  type: z.literal('cta'),
  /** Texto del botón. Default "Ver el recorrido de la propiedad". */
  label: z.string().max(40).optional(),
  /** Título opcional sobre el botón. */
  headline: z.string().max(160).optional(),
  subtext: z.string().max(200).optional(),
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

// ---- E1.9 · Bloques de la PLANTILLA DE LUJO (nivel Villa Eva, replicable) ----

/** Barra de datos rápidos (ambientes · dorm · m² · etc). Lee la propiedad. */
const StatsBarBlock = z.object({ id: z.string(), type: z.literal('stats_bar') })

/** Un bloque de historia (numerado, foto+texto alternados). */
const StoryItem = z.object({
  numeral: z.string().max(4), // I, II, III
  eyebrow: z.string().max(60),
  headline: z.string().max(160),
  body: z.string().max(500),
  tie: z.enum(['propiedad', 'ubicacion', 'amenities', 'otro']),
  photoIndex: z.number().int().min(0).optional(),
})
const StoryBlocksBlock = z.object({
  id: z.string(),
  type: z.literal('story_blocks'),
  items: z.array(StoryItem).min(1).max(3),
})

/** Galería curada (1 destacada + grilla) con lightbox. */
const CuratedGalleryBlock = z.object({
  id: z.string(),
  type: z.literal('curated_gallery'),
  eyebrow: z.string().max(60).optional(),
  title: z.string().max(120).optional(),
  /** Índices de property.photos; si falta, todas menos hero/story. */
  photoIndices: z.array(z.number().int().min(0)).optional(),
  /**
   * Cuántas fotos se ven SIN registrarse (el resto va borroso con candado).
   * Lo fija el template = las que ya se vieron arriba (hero + historia), para
   * que ninguna foto quede visible arriba y bloqueada acá. Default 3.
   */
  freePhotoCount: z.number().int().min(1).max(12).optional(),
})

/** Ubicación como imagen + copy de zona (SIN mapa ni botón). */
const LocationShowcaseBlock = z.object({
  id: z.string(),
  type: z.literal('location_showcase'),
  eyebrow: z.string().max(60).optional(),
  title: z.string().max(120).optional(),
  body: z.string().max(400).optional(),
  /** Foto exterior para el fondo; si falta → banda navy con el texto. */
  photoIndex: z.number().int().min(0).optional(),
})

/** Planos (grilla con zoom). Condicional: solo si property.plans tiene items. */
const FloorPlansBlock = z.object({
  id: z.string(),
  type: z.literal('floor_plans'),
  title: z.string().max(120).optional(),
})

/** Invitación de cierre (marca, sin asesor) + CTA→popup. */
const ClosingInviteBlock = z.object({
  id: z.string(),
  type: z.literal('closing_invite'),
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200),
  body: z.string().max(400).optional(),
  ctaLabel: z.string().max(40).optional(),
})

/** Footer de marca (Diego Ferreyra + contacto + CUCICBA). */
const FooterBrandBlock = z.object({ id: z.string(), type: z.literal('footer_brand') })

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
  // E1.8 — conversión
  IntangibleBenefitsBlock,
  BenefitShowcaseBlock,
  StoryBlock,
  MainBenefitBlock,
  EssentialSpecsBlock,
  LocationNoteBlock,
  CtaBlock,
  // E1.9 — plantilla de lujo
  StatsBarBlock,
  StoryBlocksBlock,
  CuratedGalleryBlock,
  LocationShowcaseBlock,
  FloorPlansBlock,
  ClosingInviteBlock,
  FooterBrandBlock,
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

/**
 * Textos de la PÁGINA DE GRACIAS (`/v/<token>`): lo que ve la persona después
 * de registrarse — el recorrido y el formulario para proponer la visita.
 *
 * Vive acá, dentro del documento de la landing, a propósito: así el autosave a
 * borrador y el "Publicar cambios" del editor le sirven a las DOS páginas sin
 * una segunda tabla, un segundo flujo de publicación y un segundo lugar donde
 * las cosas se puedan desincronizar.
 *
 * TODOS los campos son opcionales y ausente = el texto por defecto de siempre
 * (`lib/landing/thanks.ts`). Una landing vieja, sin esta clave, se comporta
 * exactamente igual que antes.
 */
export const ThanksContent = z.object({
  /** Saludo. Admite `{nombre}`. */
  greeting: z.string().max(120).optional(),
  /** Titular. Admite `{direccion}`. */
  headline: z.string().max(200).optional(),
  /** Párrafo opcional bajo el precio. Vacío por defecto: no existe hoy. */
  intro: z.string().max(600).optional(),
  /** Titular de la sección de agendar. */
  scheduleTitle: z.string().max(120).optional(),
  /** Bajada de la sección de agendar. */
  scheduleText: z.string().max(600).optional(),
})
export type ThanksContent = z.infer<typeof ThanksContent>

// ---- Documento ----
export const LandingDocument = z
  .object({
    version: z.literal(1),
    blocks: z.array(LandingBlock).min(1),
    theme: LandingTheme.default({}),
    /** Página de gracias. Opcional — ver `ThanksContent`. */
    thanks: ThanksContent.optional(),
  })
  .superRefine((doc, ctx) => {
    // Invariante de conversión: al menos UN disparador de conversión. `cta` y
    // `closing_invite` abren el popup; `lead_form` inline queda para landings
    // legacy. Sin ninguno no hay conversión.
    const triggers = doc.blocks.filter(
      b => b.type === 'lead_form' || b.type === 'cta' || b.type === 'closing_invite',
    )
    if (triggers.length < 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'La landing debe tener al menos 1 CTA (o formulario) de conversión.',
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
