import type { ParsedInquiry, RawEmail } from '../types'
import { detectInquiryType, emailToText, extractPhone, firstLeadEmail, valueAfterLabel } from '../extract'

/**
 * Parser de los emails de consulta de ZonaProp. Formato real:
 *  - From: `"Laura mediante ZonaProp" <laura@usuarios.zonaprop.com.ar>`
 *    → el nombre del interesado está en el display name (antes de "mediante ZonaProp").
 *  - Subject: `📱 ¡Consultaron tu WhatsApp en el aviso <TÍTULO>...! CÓD:2CBSS6 - REF:#306958245#`
 *    o `📩 ¡Recibiste una nueva consulta por el aviso <TÍTULO>! CÓD:... - REF:#...#`
 *    → CÓD = código del anunciante (lo que matcheamos); REF = id interno de ZonaProp.
 *  - Body: teléfono + email del interesado.
 */
export function parseZonaprop(email: RawEmail): ParsedInquiry {
  const text = emailToText(email)
  const subj = email.subject ?? ''
  // El código es letras y números, con guiones internos ("DF-101" entero, no
  // "DF"). Si sigue un ".", ":" o "/" es un ENLACE que el anunciante cargó en
  // ese campo ("CÓD:https://…", "CÓD:www.…"): tomarlo como código juntaba
  // consultas de avisos distintos bajo un aviso falso. Sin CÓD de verdad, queda
  // la REF (que no agrupa).
  const cod = subj.match(/C[ÓO]D[:\s]*([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)(?![A-Za-z0-9.:/-])/i)?.[1] ?? null
  const ref = subj.match(/REF[:\s#]*#?(\d+)/i)?.[1] ?? null

  return {
    portal: 'zonaprop',
    inquiryType: detectInquiryType(text, subj),
    leadName: leadNameFromFrom(email.from),
    leadEmail: firstLeadEmail(text, 'zonaprop'),
    leadPhone: extractPhone(text),
    message: valueAfterLabel(text, ['mensaje', 'consulta', 'comentario']),
    propertyCode: cod ?? ref,
    // Las URLs del mail son redireccionadores de clic (link.zonaprop), no el aviso.
    // El parser no sale a la red: el cron los sigue (`resolverAvisoZonaprop`).
    propertyUrl: null,
    propertyAddress: null, // ZonaProp no incluye la dirección; se matchea por CÓD/título
    propertyTitle: titleFromSubject(subj),
  }
}

/** "Laura mediante ZonaProp" <...> → "Laura". */
function leadNameFromFrom(from: string): string | null {
  const dn = (from.split('<')[0] ?? '').trim().replace(/^"|"$/g, '').trim()
  const cleaned = dn.replace(/\s*mediante\s+zonaprop\s*$/i, '').trim()
  return cleaned || null
}

/** Título del aviso, entre "aviso " y "CÓD" en el asunto. */
function titleFromSubject(subj: string): string | null {
  const i = subj.toLowerCase().indexOf('aviso ')
  if (i < 0) return null
  let t = subj.slice(i + 6)
  const cd = t.search(/!?\s*C[ÓO]D/i)
  if (cd >= 0) t = t.slice(0, cd)
  t = t.replace(/[.!…\s]+$/g, '').trim()
  return t || null
}
