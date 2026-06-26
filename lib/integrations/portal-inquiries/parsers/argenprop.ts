import type { ParsedInquiry, RawEmail } from '../types'
import { detectInquiryType, emailToText, extractPhone, firstLeadEmail, firstUrl, valueAfterLabel } from '../extract'

/**
 * Parser de los emails de consulta de Argenprop. Formato real:
 *  - From: `Argenprop <noresponder@argenprop.com>`
 *  - Subject: `<email-del-interesado> contactó por <DIRECCIÓN> en <BARRIO>`
 *    → la DIRECCIÓN del asunto es la clave de match (Argenprop no manda código limpio).
 *  - URL: link de tracking de Mandrill cuyo parámetro `p=` (base64) contiene la URL
 *    real del aviso `argenprop.com/aviso--<id>` → de ahí sacamos el código del aviso.
 *  - Body: nombre + teléfono + email del interesado.
 */
export function parseArgenprop(email: RawEmail): ParsedInquiry {
  const text = emailToText(email)
  const subj = email.subject ?? ''
  const m = subj.match(/contact[oó]\s+por\s+(.+?)\s+en\s+(.+?)\s*$/i)
  const address = m ? m[1].replace(/\s+/g, ' ').trim() : null
  const neighborhood = m ? m[2].replace(/\s+/g, ' ').trim() : null

  const url = firstUrl(text, ['argenprop.com'])
  const avisoId = decodeMandrillAviso(url)

  return {
    portal: 'argenprop',
    inquiryType: detectInquiryType(text, subj),
    leadName: cleanName(valueAfterLabel(text, ['nombre', 'name'])),
    leadEmail: firstLeadEmail(text, 'argenprop') ?? emailFromSubject(subj),
    leadPhone: extractPhone(text),
    message: valueAfterLabel(text, ['mensaje', 'consulta', 'comentario']),
    propertyCode: avisoId,
    propertyUrl: avisoId ? `https://www.argenprop.com/aviso--${avisoId}` : null,
    propertyAddress: address,
    propertyTitle: address ? `${address}${neighborhood ? ` · ${neighborhood}` : ''}` : null,
  }
}

/** Primer email al inicio del asunto ("x@y.com contactó por ..."). */
function emailFromSubject(subj: string): string | null {
  const m = subj.match(/^\s*([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i)
  return m ? m[1] : null
}

/** Corta el nombre si el parser arrastró el siguiente campo (Email/Tel). */
function cleanName(s: string | null): string | null {
  if (!s) return null
  let n = s.split(/\s{2,}/)[0] // cortar en 2+ espacios (separación de columnas)
  n = n.split(/\b(e-?mail|tel[eé]fono|tel|cel)\b/i)[0]
  n = n.replace(/[-–·:]+\s*$/, '').trim()
  return n || null
}

/**
 * Mandrill envuelve el link: `.../track/click/<acct>/www.argenprop.com?p=<base64 JSON>`.
 * El JSON trae la URL real con `aviso--<id>`. Devuelve ese id (no el <acct> del tracker).
 */
function decodeMandrillAviso(url: string | null): string | null {
  if (!url) return null
  const pm = url.match(/[?&]p=([^&]+)/)
  if (pm) {
    try {
      const json = Buffer.from(decodeURIComponent(pm[1]), 'base64').toString('utf-8')
      const am = json.match(/aviso--?(\d+)/i)
      if (am) return am[1]
    } catch {
      /* sigue al fallback */
    }
  }
  const direct = url.match(/aviso--?(\d+)/i)
  return direct ? direct[1] : null
}
