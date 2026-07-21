/**
 * Biblioteca de testimonios REALES (de las landings). El motor narrativo elige
 * la clave; acá viven la cita, el nombre y el recorte del retrato. NUNCA se
 * inventan clientes: solo estos 3.
 */
import { join } from 'node:path'
import sharp from 'sharp'
import type { TestimonialKey } from './brand-bible'

interface Testimonio {
  name: string
  roleLabel: string
  quote: string
  file: string
  crop: { left: number; top: number; width: number; height: number }
}

export const TESTIMONIOS: Record<Exclude<TestimonialKey, 'none'>, Testimonio> = {
  federico: {
    name: 'Federico',
    roleLabel: 'Propietario en Zona Norte · testimonio real',
    quote: 'Vendimos 3 propiedades: la primera en 5 días, la segunda en 15, y la más difícil en solo 25.',
    file: 'federico.png',
    crop: { left: 70, top: 35, width: 380, height: 605 },
  },
  claudia: {
    name: 'Claudia',
    roleLabel: 'Propietaria en CABA · testimonio real',
    quote: 'Vender es un proceso lleno de desconfianza. El resultado fue una experiencia segura y sin el estrés que tanto temíamos.',
    file: 'claudia.png',
    crop: { left: 52, top: 22, width: 340, height: 445 },
  },
  pablo: {
    name: 'Pablo',
    roleLabel: 'Propietario en CABA · testimonio real',
    quote: 'Necesitábamos vender dos propiedades para comprar la de nuestros sueños. Coordinaron todo para que se hiciera realidad.',
    file: 'pablo.png',
    crop: { left: 60, top: 28, width: 360, height: 560 },
  },
}

export interface ResolvedTestimonial {
  quote: string
  name: string
  roleLabel: string
  photo: string // data URI del retrato recortado
}

export async function cropTestimonial(key: TestimonialKey): Promise<ResolvedTestimonial | null> {
  if (key === 'none' || !TESTIMONIOS[key]) return null
  const t = TESTIMONIOS[key]
  const path = join(process.cwd(), 'public', 'social', 'testimonios', t.file)
  const buf = await sharp(path).extract(t.crop).resize(600, 785, { fit: 'cover' }).png().toBuffer()
  return { quote: t.quote, name: t.name, roleLabel: t.roleLabel, photo: `data:image/png;base64,${buf.toString('base64')}` }
}
