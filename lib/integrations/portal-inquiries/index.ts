import type { ParsedInquiry, Portal, RawEmail } from './types'
import { detectPortal } from './extract'
import { parseMercadoLibre } from './parsers/mercadolibre'
import { parseZonaprop } from './parsers/zonaprop'
import { parseArgenprop } from './parsers/argenprop'

export type { ParsedInquiry, Portal, RawEmail } from './types'
export { detectPortal } from './extract'

/**
 * Detecta el portal del email y lo parsea. Devuelve null si el remitente no
 * corresponde a ninguno de los portales soportados (el cron lo ignora).
 */
export function parseInquiry(email: RawEmail): ParsedInquiry | null {
  const portal = detectPortal(email.from, email.subject)
  if (!portal) return null
  return parseByPortal(portal, email)
}

export function parseByPortal(portal: Portal, email: RawEmail): ParsedInquiry {
  switch (portal) {
    case 'mercadolibre':
      return parseMercadoLibre(email)
    case 'zonaprop':
      return parseZonaprop(email)
    case 'argenprop':
      return parseArgenprop(email)
  }
}

/** Remitentes conocidos por portal — para armar el query `from:(...)` de Gmail. */
export const PORTAL_SENDERS: Record<Portal, string[]> = {
  mercadolibre: ['mercadolibre.com', 'mercadolibre.com.ar', 'mercadolivre.com'],
  zonaprop: ['zonaprop.com.ar', 'zonaprop.com'],
  argenprop: ['argenprop.com'],
}

/** Construye el query de búsqueda de Gmail para los 3 portales. */
export function buildGmailQuery(newerThanDays = 2): string {
  const senders = Object.values(PORTAL_SENDERS).flat()
  const fromClause = senders.map(s => `from:${s}`).join(' OR ')
  return `(${fromClause}) newer_than:${newerThanDays}d`
}
