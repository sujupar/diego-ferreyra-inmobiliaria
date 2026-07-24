/**
 * Normalizador de direcciones argentinas. Fuente de verdad para:
 *  - armar una query de geocoding desambiguada (buildGeocodeQuery)
 *  - componentes limpios para portales (parseAddress + formatDisplayAddress)
 *
 * NO reestructura el dato: `properties.address` sigue siendo un blob de texto.
 * Este módulo lo interpreta best-effort.
 */

export type ArProvince = string // 'CABA' | 'Buenos Aires' | 'Córdoba' | ...

export interface AddressParts {
  street: string | null
  number: string | null
  neighborhood: string | null
  locality: string | null
  province: ArProvince | null
  isCaba: boolean
}

const CABA_RE = /caba|capital federal|ciudad aut[oó]noma|c\.?a\.?b\.?a\.?/i

function stripAccentsLower(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

function titleCase(s: string): string {
  // Accent-safe: mayusculiza la primera letra tras inicio/espacio/guion/apóstrofo/punto.
  // (No usar \b: en JS no es unicode-aware y rompe con acentos, ej. "núñez" → "NÚñez".)
  return s.toLowerCase().replace(/(^|[\s\-'.])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase())
}

// Alias de barrios: nombre del CSV/usuario → nombre canónico para geocoding/portales.
const NEIGHBORHOOD_ALIASES: Record<string, string> = {
  'nueva pompeya': 'Pompeya',
}

export function normalizeNeighborhood(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim()
  if (!t) return null
  const alias = NEIGHBORHOOD_ALIASES[stripAccentsLower(t)]
  return alias ?? titleCase(t)
}

export function normalizeCity(s: string | null | undefined): string | null {
  if (!s) return null
  const t = s.trim()
  if (!t) return null
  return titleCase(t)
}

export function deriveProvince(input: { address?: string | null; city?: string | null; csvZona?: string | null }): ArProvince | null {
  const zona = (input.csvZona ?? '').trim()
  if (zona) {
    if (CABA_RE.test(zona)) return 'CABA'
    if (/gba|buenos aires|provincia/i.test(zona)) return 'Buenos Aires'
    return titleCase(zona)
  }
  const hay = `${input.address ?? ''} ${input.city ?? ''}`
  if (CABA_RE.test(hay)) return 'CABA'
  return null
}

export function expandProvince(province: ArProvince | null): string {
  if (!province) return ''
  if (province === 'CABA' || CABA_RE.test(province)) return 'Ciudad Autónoma de Buenos Aires'
  if (stripAccentsLower(province) === 'buenos aires') return 'Provincia de Buenos Aires'
  return province
}

export function parseAddress(
  rawAddress: string,
  hints?: { neighborhood?: string | null; city?: string | null; province?: string | null },
): AddressParts {
  const raw = (rawAddress ?? '').trim()
  const segments = raw.split(',').map(s => s.trim()).filter(Boolean)
  const streetSeg = segments[0] ?? ''
  // La altura es el último número del primer segmento (calle + altura).
  const m = streetSeg.match(/^(.*?)\s+(\d+)\s*$/)
  const street = m ? m[1].trim() : (streetSeg || null)
  const number = m ? m[2] : null

  const neighborhood = normalizeNeighborhood(hints?.neighborhood) ?? normalizeNeighborhood(segments[1])
  const locality = normalizeCity(hints?.city) ?? normalizeCity(segments[2]) ?? neighborhood

  const province =
    (hints?.province ? deriveProvince({ csvZona: hints.province }) : null) ??
    deriveProvince({ address: raw, city: hints?.city })

  const isCaba = province === 'CABA' || CABA_RE.test(raw) || CABA_RE.test(hints?.city ?? '')

  return {
    street,
    number,
    neighborhood,
    locality,
    province: province ?? (isCaba ? 'CABA' : null),
    isCaba,
  }
}

export function buildGeocodeQuery(parts: AddressParts): string {
  const streetLine = [parts.street, parts.number].filter(Boolean).join(' ')
  // CABA: geocodifica mejor con el BARRIO como localidad. GBA: con el partido (locality).
  const locality = parts.isCaba ? (parts.neighborhood ?? parts.locality) : parts.locality
  const prov = expandProvince(parts.province)
  return [streetLine, locality, prov, 'Argentina'].filter(Boolean).join(', ')
}

export function formatDisplayAddress(parts: AddressParts): string {
  const streetLine = [parts.street, parts.number].filter(Boolean).join(' ')
  // Para CABA la "localidad" del blob es la provincia (Capital Federal) → mostramos
  // solo el barrio (mismo criterio isCaba que buildGeocodeQuery).
  const tail = parts.isCaba ? [parts.neighborhood] : [parts.neighborhood, parts.locality]
  return [streetLine, ...tail]
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .join(', ')
}
