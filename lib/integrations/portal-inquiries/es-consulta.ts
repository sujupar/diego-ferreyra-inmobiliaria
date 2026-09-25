/**
 * ¿Este correo del portal es una CONSULTA, o es publicidad del propio portal?
 *
 * ## Por qué existe (incidente 2026-09-23/25)
 *
 * El 5 de septiembre Argenprop empezó a mandar su newsletter de "propiedades
 * nuevas para vos" desde `noresponder@argenprop.com`, **la misma dirección por
 * la que llegan las consultas de verdad**. El filtro de la puerta (`isLeadEmail`)
 * mira solo el remitente, así que cada una de esas piezas de publicidad entró
 * como una consulta: 10 en 20 días, con avisos de WhatsApp a Diego por avisos de
 * OTRAS inmobiliarias, y un 6% de ruido en el conteo de septiembre.
 *
 * ## Por qué NO alcanza con mirar si el aviso es nuestro
 *
 * Es la salida que parece obvia —el mensaje ya marca con ⚠️ los avisos que no
 * reconoce— y es la más peligrosa. Medido sobre 60 días: de 139 consultas con
 * ⚠️, **129 eran personas reales** preguntando por avisos nuestros que todavía
 * no están en el mapa (publicados a mano, códigos sin cruzar). Callarlas sería
 * perder unos 2 interesados por día. El ⚠️ dice "no reconocí el aviso", no "esto
 * no es una consulta", y está puesto a propósito para que se note que falta
 * cargarlo.
 *
 * ## La regla, y por qué es doble
 *
 * Se descarta solo cuando se cumplen LAS DOS cosas:
 *
 *   1. El correo no trae NINGÚN dato del interesado — ni nombre, ni teléfono, ni
 *      un email que no sea nuestra propia casilla. Un correo donde el único
 *      "interesado" somos nosotros no es una consulta.
 *   2. El asunto no es ninguno de los formatos que el portal usa de verdad.
 *
 * Con una sola de las dos no alcanza, y las dos direcciones importan:
 *
 *   - Solo el punto 1 tiraría consultas reales: MercadoLibre OCULTA el contacto
 *     de quien pregunta (sus consultas llegan SIEMPRE sin datos), y Argenprop
 *     tiene un tercer formato raro ("Felicitaciones… hay alguien interesado")
 *     que a veces viene vacío — una de esas fue un lead real de junio.
 *   - Solo el punto 2 sería una lista blanca que se rompe sola: el día que un
 *     portal estrene un formato de consulta, dejaríamos de verlo. Mientras traiga
 *     a una persona, entra igual aunque el asunto sea desconocido.
 *
 * Verificado contra las 473 consultas guardadas: descarta exactamente las 10
 * publicitarias y no toca ninguna de las reales.
 */
import { ASUNTO_DE_CONSULTA_ML } from './extract'
import type { Portal } from './types'

/**
 * Los formatos de asunto con los que cada portal manda una consulta DE VERDAD,
 * sacados de las 473 consultas reales guardadas (no inventados).
 *
 * Se comparan sin tildes y sin mayúsculas: ver `normalizar`.
 */
export const FORMATOS_DE_CONSULTA: Record<Portal, RegExp[]> = {
  // 69 + 19 + 2 consultas reales en el histórico.
  argenprop: [/contacto por/, /te ha enviado un mensaje/, /hay alguien interesado/],
  // 246 + 85 + 42.
  zonaprop: [/nueva consulta/, /consultaron tu whatsapp/, /vieron tu telefono/],
  // ML oculta el contacto de quien pregunta, así que sus consultas llegan
  // SIEMPRE sin datos y el asunto es la única señal que hay. Por eso se reusa
  // EXACTAMENTE la misma lista que usa el filtro de la puerta: si esta fuera más
  // angosta, un correo entraría por la puerta y esta regla lo tiraría, que es un
  // lead perdido sin que nadie se entere. No copiar los patrones acá.
  mercadolibre: [ASUNTO_DE_CONSULTA_ML],
}

export interface CorreoParaClasificar {
  portal: Portal
  subject: string
  leadName: string | null
  leadEmail: string | null
  leadPhone: string | null
}

/** Sin tildes, sin mayúsculas y con los espacios planchados. */
function normalizar(texto: string): string {
  return (texto ?? '')
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * ¿Hay una persona del otro lado?
 *
 * `casillaPropia` es la casilla que leemos (`GMAIL_IMPERSONATE_EMAIL`). Si no se
 * sabe cuál es, cualquier email cuenta como interesado: ante la duda se deja
 * pasar, que el costo de un aviso de más es infinitamente menor que el de
 * perder un interesado.
 */
export function traeInteresado(
  c: { leadName: string | null; leadEmail: string | null; leadPhone: string | null },
  casillaPropia: string | null | undefined,
): boolean {
  if ((c.leadPhone ?? '').trim()) return true
  if ((c.leadName ?? '').trim()) return true
  const email = normalizar(c.leadEmail ?? '')
  if (!email) return false
  const propia = normalizar(casillaPropia ?? '')
  return !propia || email !== propia
}

export interface Veredicto {
  esConsulta: boolean
  /** Para el registro de descartados: por qué no entró. */
  motivo: string
}

export function esConsultaDeVerdad(
  c: CorreoParaClasificar,
  casillaPropia: string | null | undefined,
): Veredicto {
  if (traeInteresado(c, casillaPropia)) {
    return { esConsulta: true, motivo: 'trae los datos de un interesado' }
  }
  const asunto = normalizar(c.subject)
  const conocido = FORMATOS_DE_CONSULTA[c.portal].some(re => re.test(asunto))
  if (conocido) {
    return { esConsulta: true, motivo: 'sin datos, pero el asunto es un formato de consulta conocido' }
  }
  return {
    esConsulta: false,
    motivo: 'sin interesado (ni nombre, ni teléfono, ni un email que no sea el nuestro) y con un asunto que no es ninguno de los formatos de consulta del portal: es publicidad',
  }
}
