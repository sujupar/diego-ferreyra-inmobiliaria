/**
 * Normalización de teléfonos para WhatsApp (Meta Cloud API).
 *
 * Bug real que originó este archivo (2026-07): un número colombiano
 * `+57 310 782 2955` pasaba por la heurística vieja de `normalizePhone` en
 * `core.ts` (que solo anteponía '54' si no arrancaba con '54' y tenía 10-11
 * dígitos) y se convertía en `543107822955` — un número ARGENTINO
 * INEXISTENTE. El mensaje se mandaba a ese número y se perdía en silencio
 * (Meta no devuelve error por número inexistente, solo no lo entrega).
 *
 * Fix: usar `libphonenumber-js` para parsear y VALIDAR de verdad contra la
 * metadata real de cada país, en vez de adivinar con longitud de dígitos.
 * Si no se puede confirmar que el número es válido y de un tipo que puede
 * tener WhatsApp, devolver `null` — nunca inventar un número.
 */
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max'

// Tipos que pueden tener WhatsApp. Verificado empíricamente: AR/ES/BR/UY dan
// 'MOBILE', pero US/MX/CL dan 'FIXED_LINE_OR_MOBILE' — hay que aceptar los dos o
// se rechazan clientes reales del exterior.
const CON_WHATSAPP = new Set(['MOBILE', 'FIXED_LINE_OR_MOBILE'])

const REGION_DEFAULT: CountryCode = 'AR'

/**
 * Argentina: alguien que escribe el "15" viejo SIN código de área (ej. "15
 * 6123 4567", la forma clásica porteña de marcar "esto es un celular") no trae
 * información suficiente para saber el área — `libphonenumber-js` lo rechaza
 * como inválido (le falta el área). Como esta inmobiliaria opera en CABA/GBA,
 * asumimos el área 11 en ESE caso puntual (10 dígitos: "15" + 8 dígitos, sin
 * "+" y sin ningún otro prefijo). Es una heurística de negocio, no una regla
 * general del plan de numeración — documentada acá porque es la única forma
 * de no perder ese lead real.
 */
function expandirQuinceLocal(value: string): string {
  if (value.trim().startsWith('+')) return value // ya trae indicativo explícito, no tocar
  const digits = value.replace(/\D/g, '')
  if (/^15\d{8}$/.test(digits)) return `11${digits.slice(2)}`
  return value
}

/** Un intento de parseo. `region` solo aplica cuando el número no trae `+`. */
function intentar(value: string, region?: CountryCode): string | null {
  const candidato = region === 'AR' ? expandirQuinceLocal(value) : value
  const x = parsePhoneNumberFromString(candidato, region)
  if (!x || !x.isValid()) return null
  if (CON_WHATSAPP.has(String(x.getType()))) return x.number.replace('+', '')
  // Argentina: un móvil escrito sin el 9 se parsea como FIXED_LINE. Probamos
  // insertar el 9 y RE-VALIDAMOS — no adivinamos, confirmamos con la librería.
  if (x.country === 'AR') {
    const y = parsePhoneNumberFromString(`+549${x.nationalNumber}`)
    if (y?.isValid() && CON_WHATSAPP.has(String(y.getType()))) return y.number.replace('+', '')
  }
  return null
}

/**
 * `region` es el país que la PERSONA eligió en el selector de bandera de la
 * landing (ISO 3166-1 alpha-2, ej. 'CO', 'MX') — solo importa cuando `raw` NO
 * trae un `+` explícito. Default 'AR' para no romper a los llamadores
 * existentes (`core.ts`, el webhook, `POST /api/whatsapp/send`, el Inbox), que
 * siguen llamando con un solo argumento.
 */
export function normalizeWhatsappPhone(
  raw: string | null | undefined,
  region: CountryCode = REGION_DEFAULT,
): string | null {
  const value = raw?.trim()
  if (!value) return null

  // 1) Como lo escribió una persona: región = la elegida (o Argentina si no se pasó).
  const comoEscrito = intentar(value, region)
  if (comoEscrito) return comoEscrito

  // 2) Como E.164 SIN el '+'. Es el formato en que guardamos `phone_e164` y en el
  //    que Meta manda el `from` de un mensaje entrante. Un número del EXTERIOR en
  //    ese formato no parsea como nacional argentino: "573107822955" leído como
  //    argentino es basura, pero con '+' adelante es el celular colombiano
  //    correcto. Sin este reintento era imposible contestarle desde el chat a un
  //    cliente del exterior — justo el caso que originó todo este trabajo.
  //    Va SEGUNDO a propósito: probar '+' primero rompería los móviles argentinos
  //    pelados (`1161234567` con '+' cae en el plan de EE.UU.).
  if (/^\+?\d{8,15}$/.test(value)) {
    return intentar(`+${value.replace(/^\+/, '')}`)
  }
  return null
}

export const isWhatsappUsable = (
  raw: string | null | undefined,
  region?: CountryCode,
): boolean => normalizeWhatsappPhone(raw, region) !== null
