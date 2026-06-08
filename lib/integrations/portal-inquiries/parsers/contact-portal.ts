import type { ParsedInquiry, Portal, RawEmail } from '../types'
import { detectInquiryType, emailToText, extractPhone, firstLeadEmail, firstUrl, valueAfterLabel } from '../extract'

/**
 * Parser compartido para portales que mandan emails de "contacto" con los datos
 * completos del interesado (ZonaProp y Argenprop). A diferencia de ML, acá sí
 * suele venir nombre + email + teléfono + mensaje.
 */
export function parseContactPortal(email: RawEmail, portal: Portal, urlDomains: string[]): ParsedInquiry {
  const text = emailToText(email)
  const url = firstUrl(text, urlDomains)
  return {
    portal,
    inquiryType: detectInquiryType(text, email.subject),
    leadName: valueAfterLabel(text, ['nombre', 'name', 'de parte de', 'contacto de', 'interesado']),
    leadEmail: firstLeadEmail(text, portal),
    leadPhone: extractPhone(text),
    message: valueAfterLabel(text, ['mensaje', 'consulta', 'comentario', 'pregunta', 'message']),
    // Solo etiquetas que claramente denotan un código numérico — "aviso" a secas
    // suele preceder al TÍTULO, no al código, así que va en propertyTitle.
    propertyCode:
      valueAfterLabel(text, ['código', 'codigo', 'código de aviso', 'cod. aviso', 'referencia', 'id del aviso']) ??
      codeFromUrl(url),
    propertyUrl: url,
    propertyAddress: valueAfterLabel(text, ['dirección', 'direccion', 'ubicación', 'ubicacion']),
    propertyTitle:
      valueAfterLabel(text, ['propiedad', 'aviso', 'publicación', 'publicacion', 'título', 'titulo']) ??
      cleanSubject(email.subject),
  }
}

/** Extrae el ID numérico del aviso desde la URL (último run de ≥6 dígitos). */
export function codeFromUrl(url: string | null): string | null {
  if (!url) return null
  const nums = url.match(/\d{6,}/g)
  return nums?.length ? nums[nums.length - 1] : null
}

function cleanSubject(subject: string): string | null {
  const s = (subject ?? '').replace(/^(re|fwd?):\s*/i, '').trim()
  return s || null
}
