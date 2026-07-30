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
import { parsePhoneNumberFromString } from 'libphonenumber-js/max'

// Tipos que pueden tener WhatsApp. Verificado empíricamente: AR/ES/BR/UY dan
// 'MOBILE', pero US/MX/CL dan 'FIXED_LINE_OR_MOBILE' — hay que aceptar los dos o
// se rechazan clientes reales del exterior.
const CON_WHATSAPP = new Set(['MOBILE', 'FIXED_LINE_OR_MOBILE'])

/** Un intento de parseo. `region` solo aplica cuando el número no trae `+`. */
function intentar(value: string, region?: 'AR'): string | null {
  const x = parsePhoneNumberFromString(value, region)
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

export function normalizeWhatsappPhone(raw: string | null | undefined): string | null {
  const value = raw?.trim()
  if (!value) return null

  // 1) Como lo escribió una persona: región por defecto Argentina.
  const comoEscrito = intentar(value, 'AR')
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

export const isWhatsappUsable = (raw: string | null | undefined): boolean =>
  normalizeWhatsappPhone(raw) !== null
