/**
 * La regla del 549: leer el teléfono que dejó un interesado y decidir si se le
 * puede escribir por WhatsApp.
 *
 * Por qué existe: los portales entregan el teléfono como lo tipeó la persona, y
 * la base tiene de todo — `541161400496` (sin el 9), `5401162653949` (con el 0
 * de larga distancia), `011 15 5823-4521`, `1561956411` (el 15 porteño sin
 * área), `4941-0027` (sin característica). `normalizeWhatsappPhone` por sí
 * sola tiene un camino peligroso para esto: un número de 10 dígitos que no
 * parsea como argentino se reintenta con `+` adelante, y `33652765622` termina
 * siendo un número de FRANCIA. A un interesado de un portal argentino que no
 * marcó `+` nunca lo leemos como extranjero: o es un celular argentino válido o
 * va a revisar con un motivo que se le puede explicar al equipo.
 *
 * Único camino a un extranjero: que el número venga con `+` y otro código de
 * país escrito por la persona.
 */
import { parsePhoneNumberFromString } from 'libphonenumber-js/max'
import { normalizeWhatsappPhone } from '@/lib/integrations/whatsapp/phone'

export type MotivoRevisar = 'vacio' | 'falta_caracteristica' | 'muy_corto' | 'muy_largo' | 'no_es_celular'

export type TelefonoLeido =
  | {
      ok: true
      /** Como lo pide Meta: `5491161400496`, sin `+`. */
      whatsapp: string
      /** Para mostrar: `+54 9 11 6140-0496`. */
      mostrado: string
      /** E.164: `+5491161400496`. */
      canonico: string
      /** El crudo no era ya E.164 (sin contar espacios, guiones y paréntesis). */
      corregido: boolean
    }
  | { ok: false; motivo: MotivoRevisar; crudo: string }

export const MOTIVO_TEXTO: Record<MotivoRevisar, string> = {
  vacio: 'No dejó teléfono.',
  falta_caracteristica: 'Tiene 8 números: le falta la característica.',
  muy_corto: 'Tiene pocos números para ser un celular.',
  muy_largo: 'Tiene números de más.',
  no_es_celular: 'No es un celular argentino válido.',
}

// Un número argentino es SIEMPRE característica + abonado = 10 dígitos.
const DIGITOS_NACIONALES = 10

function revisar(motivo: MotivoRevisar, crudo: string): TelefonoLeido {
  return { ok: false, motivo, crudo }
}

/**
 * `+54 9 <área> <abonado con guion antes de los últimos 4>`. El largo del área
 * NO sale de una tabla nuestra: lo dice el formato nacional de libphonenumber
 * (`011 15-6140-0496`, `0351 15-678-8146`), que conoce las 300 características.
 */
function mostrar(whatsapp: string): string {
  const numero = parsePhoneNumberFromString(`+${whatsapp}`)
  if (!numero) return `+${whatsapp}`
  if (numero.country !== 'AR') return numero.formatInternational()
  const area = /^0(\d{2,4})\s/.exec(numero.formatNational())?.[1]
  const nacional = String(numero.nationalNumber) // '9' + área + abonado
  if (!area || !nacional.startsWith(`9${area}`)) return numero.formatInternational()
  const abonado = nacional.slice(1 + area.length)
  return `+54 9 ${area} ${abonado.slice(0, -4)}-${abonado.slice(-4)}`
}

function aceptado(whatsapp: string, crudo: string): TelefonoLeido {
  const canonico = `+${whatsapp}`
  // Espacios, guiones, puntos y paréntesis son forma, no corrección.
  const sinForma = crudo.replace(/[\s\-().]/g, '')
  return { ok: true, whatsapp, mostrado: mostrar(whatsapp), canonico, corregido: sinForma !== canonico }
}

/** Siempre con `+54` adelante: así el número nunca puede caer en otro país. */
function comoArgentino(nacional: string): string | null {
  const wa = normalizeWhatsappPhone(`+54${nacional}`)
  return wa && wa.startsWith('549') ? wa : null
}

export function leerTelefono(crudo: string | null | undefined): TelefonoLeido {
  const texto = (crudo ?? '').trim()
  if (!texto) return revisar('vacio', crudo ?? '')

  // 1) `+` con otro país: lo escribió la persona, es el único camino al exterior.
  if (texto.startsWith('+') && !texto.replace(/\D/g, '').startsWith('54')) {
    const wa = normalizeWhatsappPhone(texto)
    return wa ? aceptado(wa, texto) : revisar('no_es_celular', texto)
  }

  // 2) Argentina: dígitos solos, sin el 54 ni el 0 de larga distancia
  //    (cubre `54…`, `540…`, `0…`, `011…`).
  let resto = texto.replace(/\D/g, '')
  if (!resto) return revisar('no_es_celular', texto)
  if (resto.startsWith('54')) resto = resto.slice(2)
  if (resto.startsWith('0')) resto = resto.slice(1)
  // El 9 de celular que ya venía escrito (`+54 9 11…`, `91169719596`).
  if (resto.length === DIGITOS_NACIONALES + 1 && resto.startsWith('9')) resto = resto.slice(1)

  if (resto.length === 8) return revisar('falta_caracteristica', texto)
  if (resto.length < DIGITOS_NACIONALES) return revisar('muy_corto', texto)

  if (resto.length === DIGITOS_NACIONALES) {
    // El 15 porteño sin área (`15 6195-6411`): misma heurística que
    // `expandirQuinceLocal` — esta inmobiliaria opera en CABA/GBA.
    const nacional = /^15\d{8}$/.test(resto) ? `11${resto.slice(2)}` : resto
    const wa = comoArgentino(nacional)
    return wa ? aceptado(wa, texto) : revisar('no_es_celular', texto)
  }

  // 3) 12 dígitos: el 15 metido después de la característica (`11 15 5823-4521`,
  //    `2224 15 512345`). Con `+54` adelante libphonenumber no lo saca (el 15 es
  //    del formato nacional), así que se prueba sacarlo tras un área de 2, 3 o 4
  //    dígitos y se RE-VALIDA. Si más de una lectura valida, no se adivina.
  if (resto.length === DIGITOS_NACIONALES + 2) {
    const lecturas = new Set<string>()
    for (const largoArea of [2, 3, 4]) {
      if (resto.slice(largoArea, largoArea + 2) !== '15') continue
      const wa = comoArgentino(resto.slice(0, largoArea) + resto.slice(largoArea + 2))
      if (wa) lecturas.add(wa)
    }
    if (lecturas.size === 1) return aceptado([...lecturas][0], texto)
    return revisar(lecturas.size === 0 ? 'muy_largo' : 'no_es_celular', texto)
  }

  return revisar('muy_largo', texto)
}

/**
 * Lo que carga el equipo en dos campos: característica (con o sin el 0) y
 * número (con o sin el 15). Se limpian y se leen con la misma regla.
 */
export function armarDesdePartes(caracteristica: string, numero: string): TelefonoLeido {
  const area = caracteristica.replace(/\D/g, '').replace(/^0/, '')
  let abonado = numero.replace(/\D/g, '')
  // El 15 sobra solo si con él el número queda dos dígitos largo.
  if (area && abonado.startsWith('15') && area.length + abonado.length === DIGITOS_NACIONALES + 2) {
    abonado = abonado.slice(2)
  }
  return leerTelefono(area + abonado)
}
