/**
 * La validación de POST /api/funnel/submit — el borde por donde entra CADA
 * conversión paga del negocio.
 *
 * ## La regla que gobierna este archivo (2026-08-15)
 *
 * **Un metadato de tracking JAMÁS voltea una conversión.** Se pagó por ese
 * clic; si la cookie de Meta viene larga, el UTM viene raro o el eventId viene
 * roto, se recorta o se descarta EL METADATO — el registro entra igual.
 *
 * No es teórico. El 2026-08-14 una clienta real escribió por Instagram:
 * "me sale datos inválidos". La batería contra producción (`battery.sh`)
 * reprodujo el porqué: el clic real en un anuncio deja una cookie `_fbc` de
 * `fb.1.<ts>.<fbclid>`, y Meta emite fbclid que superan los 300 caracteres
 * del tope viejo → Zod rechazaba el envío ENTERO. Las pruebas internas
 * entraban directo (sin cookie de anuncio) y por eso "funcionaba". El bug
 * afectaba EXACTAMENTE al tráfico pago, que es el único que importa acá.
 *
 * ## La segunda regla: el servidor acepta lo que el formulario acepta
 *
 * El formulario valida con criterio permisivo (voseo, celulares, typos); si el
 * servidor es más estricto, la persona ve un error que el formulario no le
 * puede explicar. Los casos reales que el tope viejo rechazaba: email con
 * punto doble ("juan..perez@gmail.com"), punto antes de la arroba, acentos del
 * autocorrector. Todos con el WhatsApp PERFECTO al lado — que es el canal de
 * contacto real de este embudo.
 *
 * Por eso email y teléfono se DEGRADAN en vez de rechazar: si uno viene
 * inservible pero el otro sirve, el inservible se guarda en `descartado` (para
 * verlo en el CRM) y el lead entra por el canal que funciona. Solo se rechaza
 * cuando NO queda ningún canal — ahí sí no hay a quién contactar.
 */
import { z } from 'zod'

/** Mismo criterio que el formulario (`FunnelLeadForm.emailValido`). */
export function emailUsable(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(v.trim())
}

/** Al menos 6 dígitos reales: menos que eso no es un teléfono marcable. */
export function telefonoUsable(v: string): boolean {
  return (v.match(/\d/g) ?? []).length >= 6
}

/**
 * Un campo de tracking: texto recortado a `max`, y CUALQUIER otra cosa (número,
 * objeto, lo que sea) se vuelve null. Nunca rechaza.
 */
function tracking(max: number) {
  return z.preprocess(
    (v) => (typeof v === 'string' ? v.slice(0, max) : null),
    z.string().nullable(),
  ).catch(null)
}

/**
 * Tracking "entero o nada": si supera `max` se DESCARTA, no se recorta.
 * Para valores que solo sirven completos — un `fbc` truncado no matchea ningún
 * clic en Meta, así que recortarlo sería mandar basura como si fuera dato.
 */
function trackingEnteroONada(max: number) {
  return z.preprocess(
    (v) => (typeof v === 'string' && v.length <= max ? v : null),
    z.string().nullable(),
  ).catch(null)
}

const Attribution = z
  .object({
    utm_source: tracking(200),
    utm_medium: tracking(200),
    utm_campaign: tracking(200),
    utm_content: tracking(200),
    utm_term: tracking(200),
    fb_campaign_id: tracking(200),
    fb_adset_id: tracking(200),
    fb_ad_id: tracking(200),
    fb_placement: tracking(200),
  })
  .partial()
  .nullable()
  .catch(null)

/**
 * El schema crudo. Los campos de NEGOCIO (funnel, name, email/phone) tienen
 * reglas mínimas; TODO lo demás es tracking y no puede rechazar.
 *
 * - `name`: alcanza con que no esté vacío. "J" es un nombre raro, pero es una
 *   persona con email y teléfono al lado — rechazarla es perder el lead por
 *   pedante. Se recorta a 200.
 * - `fbc`: tope 1024 — holgado para el `fb.1.<ts>.<fbclid>` más largo visto,
 *   y con `.catch(null)` para lo demencial. Se guarda ENTERO (truncar un fbc
 *   lo rompe para el matching de Meta; mejor completo o nada).
 * - `eventId`/`anonId`: si vienen rotos se pierde la dedup del Píxel o el
 *   stitching del video — nunca el registro.
 */
export const SubmitSchema = z.object({
  funnel: z.enum(['tasacion', 'clase']),
  name: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().slice(0, 200) : v),
    z.string().min(1),
  ),
  email: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().slice(0, 200) : null),
    z.string().nullable(),
  ).catch(null),
  phone: z.preprocess(
    (v) => (typeof v === 'string' ? v.trim().slice(0, 40) : null),
    z.string().nullable(),
  ).catch(null),
  propertyLocation: tracking(200),
  tipoCliente: tracking(100),
  message: tracking(2000),
  company: tracking(200), // honeypot
  eventId: tracking(128),
  eventSourceUrl: tracking(500),
  fbp: tracking(200),
  fbc: trackingEnteroONada(1024),
  anonId: tracking(64),
  attribution: Attribution,
})

export type SubmitInput = z.infer<typeof SubmitSchema>

export interface SubmitResolution {
  ok: boolean
  /** Email listo para guardar (null si vino inservible). */
  email: string | null
  /** Teléfono listo para guardar (null si vino inservible). */
  phone: string | null
  /** Lo que se descartó, para que el CRM lo muestre y un humano lo juzgue. */
  descartado: { email?: string; phone?: string }
  /** Por qué se rechaza, cuando se rechaza. */
  motivo?: string
}

/**
 * La decisión de canales: degradar antes que rechazar.
 *
 * | email      | teléfono   | resultado                                  |
 * |------------|------------|--------------------------------------------|
 * | usable     | usable     | entra con los dos                          |
 * | inservible | usable     | entra por teléfono; email a `descartado`   |
 * | usable     | inservible | entra por email; teléfono a `descartado`   |
 * | inservible | inservible | RECHAZO — no hay a quién contactar         |
 */
export function resolverCanales(email: string | null, phone: string | null): SubmitResolution {
  const emailOk = !!email && emailUsable(email)
  const phoneOk = !!phone && telefonoUsable(phone)
  const descartado: { email?: string; phone?: string } = {}
  if (email && !emailOk) descartado.email = email
  if (phone && !phoneOk) descartado.phone = phone

  if (!emailOk && !phoneOk) {
    return {
      ok: false,
      email: null,
      phone: null,
      descartado,
      motivo: 'sin ningún canal de contacto usable (ni email ni teléfono)',
    }
  }
  return { ok: true, email: emailOk ? email : null, phone: phoneOk ? phone : null, descartado }
}
