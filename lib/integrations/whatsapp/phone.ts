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

export function normalizeWhatsappPhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null
  const x = parsePhoneNumberFromString(raw, 'AR')
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

export const isWhatsappUsable = (raw: string | null | undefined): boolean =>
  normalizeWhatsappPhone(raw) !== null
