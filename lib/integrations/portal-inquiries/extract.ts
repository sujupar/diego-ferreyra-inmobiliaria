import * as cheerio from 'cheerio'
import type { InquiryType, Portal, RawEmail } from './types'

/**
 * Utilidades de extracción compartidas entre los parsers de portales.
 * Son tolerantes: trabajan sobre el texto plano + el HTML convertido a texto,
 * y se apoyan en regex (email/teléfono/URL) y en búsqueda por etiquetas
 * ("Nombre:", "Teléfono:", etc.).
 */

/** Detecta el portal por el remitente (y subject como respaldo). */
export function detectPortal(from: string, subject = ''): Portal | null {
  const hay = `${from} ${subject}`.toLowerCase()
  if (/mercadolibre|mercadolivre|meli\b/.test(hay)) return 'mercadolibre'
  if (/zonaprop/.test(hay)) return 'zonaprop'
  if (/argenprop/.test(hay)) return 'argenprop'
  return null
}

/**
 * ¿Este correo es una CONSULTA real (no factura/marketing/soporte)? Calibrado
 * con correos reales de la casilla:
 *  - ZonaProp: los leads llegan vía el relay `<algo>@usuarios.zonaprop.com.ar`.
 *    (Marketing/avisos administrativos llegan desde @zonaprop.com.ar → se ignoran.)
 *  - Argenprop: los leads llegan desde `noresponder@argenprop.com`.
 *    (Soporte/respuestas humanas: soporte@, ebazan@, lsanchezlorca@ → se ignoran.)
 *  - MercadoLibre: no tenemos muestra de lead aún. Excluimos marketing
 *    (info.mercadolibre) y exigimos un asunto de pregunta/consulta.
 */
export function isLeadEmail(from: string, subject: string, portal: Portal): boolean {
  const f = (from ?? '').toLowerCase()
  const s = (subject ?? '').toLowerCase()
  switch (portal) {
    case 'zonaprop':
      return f.includes('usuarios.zonaprop.com.ar')
    case 'argenprop':
      return f.includes('noresponder@argenprop.com')
    case 'mercadolibre':
      if (f.includes('info.mercadolibre')) return false // marketing
      return /pregunta|consulta|interesad|te\s+contact|quiere/.test(s)
  }
}

/**
 * Detecta el canal de la consulta ("Tipo" en la notificación). Los portales
 * mandan emails distintos según el lead haya escrito por WhatsApp, dejado el
 * teléfono para que lo llamen, o enviado una consulta por mail/formulario.
 */
export function detectInquiryType(text: string, subject = ''): InquiryType {
  const hay = `${subject}\n${text}`.toLowerCase()
  if (/\bwhats?app\b/.test(hay)) return 'whatsapp'
  if (/(te llame|que lo llamen|llamada telef|pedido de llamado|solicita.*llamad)/.test(hay)) return 'phone'
  return 'mail'
}

/** Convierte HTML a texto preservando saltos de línea de bloques y <br>. */
export function htmlToText(html: string): string {
  if (!html) return ''
  const $ = cheerio.load(html)
  $('script, style, head').remove()
  // Preservar las URLs de los <a>: cheerio.text() descarta atributos, pero la
  // URL/código del aviso suele vivir en el href (no en el texto "Ver aviso").
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href')
    if (href && /^https?:/i.test(href)) $(el).append(` ${href} `)
  })
  $('br').replaceWith('\n')
  $('p, div, tr, li, h1, h2, h3, h4, td').append('\n')
  const text = $.root().text()
  return text
    .split('\n')
    .map(l => l.replace(/ /g, ' ').trim())
    .filter((l, i, arr) => l !== '' || (i > 0 && arr[i - 1] !== '')) // colapsa líneas vacías repetidas
    .join('\n')
    .trim()
}

/** Combina texto plano + HTML→texto, sin duplicar si son iguales. */
export function emailToText(email: RawEmail): string {
  const fromHtml = htmlToText(email.html)
  const plain = (email.text ?? '').trim()
  if (plain && fromHtml && plain !== fromHtml) return `${plain}\n${fromHtml}`
  return plain || fromHtml
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i

/** Primer email que NO sea del propio portal (para no capturar el remitente del aviso). */
export function firstLeadEmail(text: string, portal: Portal | null): string | null {
  void portal
  const matches = text.match(new RegExp(EMAIL_RE, 'gi')) ?? []
  const portalDomains = ['mercadolibre', 'mercadolivre', 'zonaprop', 'argenprop', 'noreply', 'no-reply']
  for (const m of matches) {
    const low = m.toLowerCase()
    if (portalDomains.some(d => low.includes(d))) continue
    return m
  }
  return null
}

/**
 * Extrae un teléfono argentino. Prefiere el que está cerca de una etiqueta de
 * teléfono; si no, toma la primera secuencia "telefónica" con ≥8 dígitos.
 */
const PHONE_RE = /\+?\s*(?:\(?\d{2,4}\)?[\s.-]?){2,5}\d{2,4}/g

export function extractPhone(text: string): string | null {
  // Modo etiquetado: lenient (el campo ya dice "Teléfono").
  const labeled = valueAfterLabel(text, ['teléfono', 'telefono', 'tel', 'celular', 'cel', 'whatsapp', 'móvil', 'movil', 'phone'])
  if (labeled) {
    const v = pickPhone(labeled, false)
    if (v) return v
  }
  // Fallback sin etiqueta: sanitizar URLs y códigos (ej. MLA-1234567890) y exigir
  // separadores/'+' para no confundir un ID o una fecha con un teléfono.
  const clean = text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\b[A-Za-z]{2,}-?\d{4,}\b/g, ' ')
  return pickPhone(clean, true)
}

function pickPhone(s: string, requireSeparator: boolean): string | null {
  const matches = s.match(PHONE_RE)
  if (!matches) return null
  for (const raw of matches) {
    const trimmed = raw.trim()
    const digits = trimmed.replace(/\D/g, '')
    const minLen = requireSeparator ? 10 : 8
    if (digits.length < minLen || digits.length > 15) continue
    if (requireSeparator && !trimmed.startsWith('+') && !/[\s.\-()]/.test(trimmed)) continue
    return trimmed
  }
  return null
}

/**
 * Busca una etiqueta (label) y devuelve el valor a su derecha (mismo renglón
 * tras ':') o el contenido del renglón siguiente. Case-insensitive.
 */
export function valueAfterLabel(text: string, labels: string[]): string | null {
  const lines = text.split('\n')
  const lower = labels.map(l => l.toLowerCase())

  // Pass 1: etiqueta seguida de ':' → campo real (resiste prosa que contenga
  // la palabra-etiqueta, ej. "nueva pregunta en tu publicación!").
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const low = line.toLowerCase()
    for (const label of lower) {
      const idx = low.indexOf(label)
      if (idx === -1) continue
      const rest = line.slice(idx + label.length)
      if (!/^\s*[:：]/.test(rest)) continue // exige ':' inmediato para ser un campo
      const val = rest.replace(/^\s*[:：]\s*/, '').trim()
      if (val) return val
      // Etiqueta con ':' al final del renglón → valor en el renglón siguiente.
      for (let j = i + 1; j < lines.length && j <= i + 2; j++) {
        if (lines[j].trim()) return lines[j].trim()
      }
    }
  }

  // Pass 2: la etiqueta ES (casi) todo el renglón (ej. celda de tabla sin ':')
  // → valor en el renglón siguiente.
  for (let i = 0; i < lines.length; i++) {
    const bare = lines[i].trim().toLowerCase().replace(/[:：]\s*$/, '')
    if (!lower.includes(bare)) continue
    for (let j = i + 1; j < lines.length && j <= i + 2; j++) {
      if (lines[j].trim()) return lines[j].trim()
    }
  }
  return null
}

/** Primera URL que matchee alguno de los dominios dados. */
export function firstUrl(text: string, domains: string[]): string | null {
  const urls = text.match(/https?:\/\/[^\s"'<>)]+/gi) ?? []
  for (const u of urls) {
    if (domains.some(d => u.toLowerCase().includes(d))) return u.replace(/[.,;]+$/, '')
  }
  return urls[0]?.replace(/[.,;]+$/, '') ?? null
}
