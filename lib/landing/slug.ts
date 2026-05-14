import type { Property } from '../portals/types'

const RANDOM_LEN = 6
const MAX_TOTAL = 80

function randomSuffix(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = ''
  for (let i = 0; i < RANDOM_LEN; i++) {
    s += chars[Math.floor(Math.random() * chars.length)]
  }
  return s
}

function kebab(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quita tildes
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export type SlugInput = Pick<Property, 'address' | 'neighborhood' | 'property_type'>

/**
 * Genera un slug url-friendly para usar como subdomain.
 * Formato: <type>-<neighborhood>-<address>-<random6>
 * Largo máximo: 80 chars.
 */
export function propertyToSlug(property: SlugInput): string {
  const parts = [
    property.property_type ?? '',
    property.neighborhood ?? '',
    property.address ?? '',
  ]
    .map(kebab)
    .filter(Boolean)
  const base = parts.join('-')
  const suffix = randomSuffix()
  const trunc = base.slice(0, MAX_TOTAL - RANDOM_LEN - 1)
  return `${trunc}-${suffix}`
}
