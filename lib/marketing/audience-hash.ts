import { createHash } from 'node:crypto'
import { normalizeArPhone } from './normalize-phone'

export const CUSTOMER_LIST_SCHEMA = ['EMAIL', 'PHONE', 'FN', 'LN', 'CT', 'COUNTRY'] as const

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex')
}

export interface ContactPii {
  fullName: string
  email?: string | null
  phone?: string | null
  city?: string | null
}

/** Devuelve una fila de hashes alineada a CUSTOMER_LIST_SCHEMA ('' donde falte). */
export function hashContactRow(c: ContactPii): string[] {
  const email = c.email?.trim().toLowerCase()
  const phone = c.phone ? normalizeArPhone(c.phone) : ''
  const parts = (c.fullName ?? '').trim().split(/\s+/)
  const fn = parts[0] ?? ''
  const ln = parts.slice(1).join(' ')
  const city = c.city?.trim().toLowerCase().replace(/\s+/g, '')
  return [
    email ? sha256(email) : '',
    phone ? sha256(phone) : '',
    fn ? sha256(fn.toLowerCase()) : '',
    ln ? sha256(ln.toLowerCase()) : '',
    city ? sha256(city) : '',
    (email || phone) ? sha256('ar') : '', // country solo si hay algún identificador
  ]
}

/** Identificador estable del miembro para el ledger (email hash, sino phone hash). */
export function memberKey(c: ContactPii): { hashedEmail: string | null; hashedPhone: string | null } {
  const email = c.email?.trim().toLowerCase()
  const phone = c.phone ? normalizeArPhone(c.phone) : ''
  return { hashedEmail: email ? sha256(email) : null, hashedPhone: phone ? sha256(phone) : null }
}
