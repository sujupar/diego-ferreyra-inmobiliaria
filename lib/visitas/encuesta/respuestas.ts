/**
 * Validación de lo que manda la encuesta pública (spec §4.10): Zod ESTRICTO por paso y para el
 * final, más las reglas que Zod no expresa (etiquetas de ESA propiedad, "Nada en especial" sola,
 * "Otra cosa" con texto). Todo lo que entra por acá lo escribió un desconocido: se valida en el
 * servidor aunque la pantalla ya lo haya validado.
 */
import { z } from 'zod'
import { OPINIONES_PRECIO, type Moneda, type PasoGuardable, type RespuestasEncuesta } from './tipos'
import { MAX_OPCIONES, NADA, OTRA, type OpcionesDeLaEncuesta } from './opciones'
import { primerPasoSinResponder } from './pasos'

export const MAX_TEXTO_LIBRE = 280

/**
 * Los caracteres de control se cambian por espacio recorriendo el texto, no con una regex
 * `[\u0000-\u001F]`: esa regex la marca la regla `no-control-regex` de ESLint.
 */
export function sinControles(s: string): string {
  let out = ''
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0
    out += c < 32 || c === 127 ? ' ' : ch
  }
  return out
}

/** NFC (macOS pega NFD), sin caracteres de control, espacios colapsados, con tope. Texto, no HTML. */
export function limpiarTextoLibre(v: string | null | undefined): string {
  return sinControles((v ?? '').normalize('NFC'))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXTO_LIBRE)
}

/** Mismo techo que la ficha (lib/properties/editable-fields.ts): un monto mayor es un error de tipeo. */
export const TECHO_OFERTA: Readonly<Record<Moneda, number>> = { USD: 100_000_000, ARS: 200_000_000_000 }

const etiquetas = z.array(z.string().min(1).max(40)).max(MAX_OPCIONES)

export const cuerpoPatch = z.discriminatedUnion('paso', [
  z.object({ paso: z.literal('abierta') }).strict(),
  z.object({ paso: z.literal('gusto'), valor: z.boolean() }).strict(),
  z.object({ paso: z.literal('mas_gusto'), etiquetas, otra: z.string().max(1000).nullish() }).strict(),
  z.object({ paso: z.literal('menos_gusto'), etiquetas, otra: z.string().max(1000).nullish() }).strict(),
  z.object({ paso: z.literal('precio'), valor: z.enum(OPINIONES_PRECIO) }).strict(),
  z.object({ paso: z.literal('oferta'), monto: z.number().int().positive().nullable(), declina: z.boolean() }).strict(),
])
export type CuerpoPatch = z.infer<typeof cuerpoPatch>
export type CuerpoRespuesta = Exclude<CuerpoPatch, { paso: 'abierta' }>

export type PatchPaso = Partial<RespuestasEncuesta> & { last_step: PasoGuardable }
type Resultado = { ok: true; patch: PatchPaso } | { ok: false; error: string }

function validarEtiquetas(
  tags: readonly string[], otra: string | null | undefined, permitidas: readonly { clave: string }[],
): { ok: true; tags: string[]; otra: string | null } | { ok: false; error: string } {
  if (tags.length === 0) return { ok: false, error: 'Elegí al menos una opción' }
  const validas = new Set(permitidas.map(o => o.clave))
  if (new Set(tags).size !== tags.length || tags.some(t => !validas.has(t))) return { ok: false, error: 'Elegí una de las opciones' }
  if (tags.includes(NADA) && tags.length > 1) return { ok: false, error: '"Nada en especial" va sola' }
  if (!tags.includes(OTRA)) return { ok: true, tags: [...tags], otra: null }
  const texto = limpiarTextoLibre(otra)
  if (texto.length < 2) return { ok: false, error: 'Contanos qué otra cosa' }
  return { ok: true, tags: [...tags], otra: texto }
}

export function patchDelPaso(c: CuerpoRespuesta, ctx: { opciones: OpcionesDeLaEncuesta; moneda: Moneda }): Resultado {
  switch (c.paso) {
    case 'gusto':
      return { ok: true, patch: { liked: c.valor, last_step: 'gusto' } }
    case 'mas_gusto': {
      const v = validarEtiquetas(c.etiquetas, c.otra, ctx.opciones.masGusto)
      if (!v.ok) return v
      return { ok: true, patch: { most_liked_tags: v.tags, most_liked_other: v.otra, last_step: 'mas_gusto' } }
    }
    case 'menos_gusto': {
      const v = validarEtiquetas(c.etiquetas, c.otra, ctx.opciones.menosGusto)
      if (!v.ok) return v
      return { ok: true, patch: { least_liked_tags: v.tags, least_liked_other: v.otra, last_step: 'menos_gusto' } }
    }
    case 'precio':
      return { ok: true, patch: { price_opinion: c.valor, last_step: 'precio' } }
    case 'oferta': {
      if (c.declina) return { ok: true, patch: { offer_amount: null, offer_currency: null, offer_declined: true, last_step: 'oferta' } }
      if (c.monto === null) return { ok: false, error: 'Escribí un monto o tocá "Prefiero no decirlo"' }
      if (c.monto > TECHO_OFERTA[ctx.moneda]) return { ok: false, error: 'Revisá el monto' }
      return { ok: true, patch: { offer_amount: c.monto, offer_currency: ctx.moneda, offer_declined: false, last_step: 'oferta' } }
    }
  }
}

export const cuerpoFinal = z.object({
  telefono: z.string().max(40).nullish(),
  email: z.string().max(254).nullish(),
  similares: z.boolean(),
  /** Honeypot: invisible para personas; los robots lo llenan. Nombre sin sentido A PROPÓSITO
   * (nunca "empresa"/"company"): Chrome autocompleta esos campos, y un campo autocompletado
   * ya no está vacío para una persona real — rechazaría encuestas de verdad como si fueran bots. */
  hp_campo_x: z.string().max(200).optional(),
}).strict()
export type CuerpoFinal = z.infer<typeof cuerpoFinal>

export interface ContactoFinal {
  contact_phone: string | null
  contact_email: string | null
  wants_similar: boolean
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function contactoFinal(
  c: CuerpoFinal,
  telefonoDeLaVisita: string | null,
  normalizar: (v: string | null | undefined) => string | null,
): { ok: true; contacto: ContactoFinal } | { ok: false; error: string } {
  let telefono: string | null
  if (c.telefono?.trim()) {
    telefono = normalizar(c.telefono)
    if (!telefono) return { ok: false, error: 'Revisá tu WhatsApp: no parece un número válido' }
  } else {
    telefono = normalizar(telefonoDeLaVisita)
    if (!telefono) return { ok: false, error: 'Dejanos tu WhatsApp' }
  }
  const email = (c.email ?? '').normalize('NFC').trim().toLowerCase()
  if (email && !EMAIL_RE.test(email)) return { ok: false, error: 'Revisá el email' }
  return { ok: true, contacto: { contact_phone: telefono, contact_email: email || null, wants_similar: c.similares } }
}

export function esHoneypot(c: Pick<CuerpoFinal, 'hp_campo_x'>): boolean {
  return !!c.hp_campo_x?.trim()
}

/** El primer paso sin responder; `null` = se puede terminar. */
export function faltaParaTerminar(r: RespuestasEncuesta): PasoGuardable | null {
  return primerPasoSinResponder(r)
}
