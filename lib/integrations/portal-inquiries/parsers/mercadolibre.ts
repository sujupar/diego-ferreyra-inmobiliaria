import type { ParsedInquiry, RawEmail } from '../types'
import { emailToText, extractPhone, firstLeadEmail, firstUrl, valueAfterLabel } from '../extract'

/**
 * Parser de los emails de notificación de MercadoLibre (preguntas / consultas).
 *
 * Limitación de ML: en las "preguntas" el comprador es anónimo — ML oculta su
 * email/teléfono y se responde dentro de ML. Por eso leadEmail/leadPhone suelen
 * quedar null; lo valioso es el código del ítem (MLA...) para asignar el aviso.
 */
export function parseMercadoLibre(email: RawEmail): ParsedInquiry {
  const text = emailToText(email)
  const url = firstUrl(text, ['mercadolibre.com', 'articulo.mercadolibre', 'mercadolivre'])
  const codeMatch = `${text} ${url ?? ''}`.match(/ML[A-Z]-?\d{6,}/i)
  const propertyCode = codeMatch ? codeMatch[0].toUpperCase().replace(/-/g, '') : null

  return {
    portal: 'mercadolibre',
    inquiryType: 'mail', // ML notifica "preguntas" — siempre por mail
    leadName: valueAfterLabel(text, ['nombre', 'apodo', 'usuario', 'pregunta de', 'consulta de']),
    leadEmail: firstLeadEmail(text, 'mercadolibre'),
    leadPhone: extractPhone(text),
    message: valueAfterLabel(text, ['pregunta', 'mensaje', 'consulta', 'comentario']),
    propertyCode,
    propertyUrl: url,
    propertyAddress: valueAfterLabel(text, ['dirección', 'direccion', 'ubicación', 'ubicacion']),
    propertyTitle:
      valueAfterLabel(text, ['publicación', 'publicacion', 'aviso', 'propiedad', 'producto']) ??
      cleanSubject(email.subject),
  }
}

function cleanSubject(subject: string): string | null {
  const s = (subject ?? '').replace(/^(re|fwd?):\s*/i, '').trim()
  return s || null
}
