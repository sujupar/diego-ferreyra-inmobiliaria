/**
 * Motor narrativo: dado el input de configuración, genera el guion estructurado
 * del carrusel (biblia de marca + metodología de curiosidad).
 */
import { openaiText } from './openai'
import { SYSTEM_PROMPT, CAROUSEL_SCHEMA, type CarouselScript } from './brand-bible'

export interface CarouselInput {
  topic: string
  structure: 'aversion' | 'errores' | 'momento' | 'auto'
  targetLength: number | null // null = auto
  ctaType: 'campaign' | 'organic'
  diegoEnabled: boolean
}

const STRUCTURE_HINT: Record<CarouselInput['structure'], string> = {
  aversion: 'Aversión a la pérdida: gancho con número/pérdida, reencuadre, fugas (infografía), testimonio, CTA.',
  errores: 'Los N errores: gancho enumerando, un error por slide con su imagen conceptual, CTA.',
  momento: 'Objeción + dato: gancho con la objeción, dato de mercado, reencuadre, testimonio, CTA.',
  auto: 'Elegí vos la estructura que mejor sirva al tema.',
}

export async function generateScript(input: CarouselInput): Promise<CarouselScript> {
  const user = [
    `TEMA: ${input.topic}`,
    `ESTRUCTURA BASE: ${STRUCTURE_HINT[input.structure]}`,
    `LARGO: ${input.targetLength ? `${input.targetLength} slides exactos` : 'auto (elegí vos entre 5 y 10 según el tema)'}`,
    `CTA: ${input.ctaType === 'campaign' ? 'campaign (botón "Solicitá tu tasación profesional")' : 'organic (pedir un comentario, ej. "Comentá TASACIÓN")'}`,
    `DIEGO: ${input.diegoEnabled ? 'habilitado (usalo SOLO en el gancho o en el cierre)' : 'deshabilitado (NO lo uses; en su lugar imágenes conceptuales)'}`,
    ``,
    `Generá el guion completo siguiendo la metodología de curiosidad. Devolvé SOLO el JSON.`,
  ].join('\n')

  const script = await openaiText<CarouselScript>(SYSTEM_PROMPT, user, CAROUSEL_SCHEMA as any)

  // Normalización defensiva.
  script.cta_type = input.ctaType
  if (!input.diegoEnabled) {
    for (const s of script.slides) {
      if (s.image_kind === 'diego') {
        s.image_kind = 'concept'
        if (s.layout === 'split') s.layout = 'cinematic'
      }
    }
  }
  return script
}
