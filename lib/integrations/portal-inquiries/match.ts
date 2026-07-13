import type { SupabaseClient } from '@supabase/supabase-js'
import type { ParsedInquiry } from './types'

/**
 * Match de una consulta parseada contra la lista `portal_property_map` para
 * resolver el asesor responsable. Prioridad: código exacto → URL → dirección
 * (fuzzy) → título (fuzzy). Sin match ⇒ el caller hace fallback a Diego (dueño).
 *
 * `pickBestMatch` es PURA (testeable sin DB); `matchProperty` la envuelve con
 * la query a Supabase.
 */

export interface PortalMapRow {
  id: string
  portal: string
  external_code: string | null
  external_url: string | null
  address: string | null
  title: string | null
  assigned_to: string | null
  property_id: string | null
  active: boolean
}

export type MatchMethod = 'code' | 'url' | 'address' | 'title' | 'none'

export interface MatchResult {
  mapId: string | null
  assignedTo: string | null
  propertyId: string | null
  method: MatchMethod
  address: string | null
  title: string | null
  external_url: string | null
}

function normText(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function normCode(s: string | null | undefined): string {
  return (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Los portales mandan la dirección con número APROXIMADO y abreviaturas (ej.
// "Agüero 900" vs "Agüero 950"; "Cnel. Falcón" vs "Coronel Falcón"). Por eso el
// match de dirección compara por NOMBRE DE CALLE (sin número ni abreviaturas).
const STREET_STOPWORDS = new Set([
  'de', 'del', 'la', 'las', 'los', 'el', 'y', 'av', 'avda', 'avenida', 'calle',
  'pasaje', 'psje', 'diag', 'diagonal', 'bv', 'blvd', 'boulevard', 'nro', 'altura',
])
const STREET_ABBREV: Record<string, string> = {
  cnel: 'coronel', cnl: 'coronel', gral: 'general', grl: 'general',
  dr: 'doctor', dra: 'doctora', pte: 'presidente', ing: 'ingeniero',
  tte: 'teniente', pje: 'pasaje', prof: 'profesor',
}

export function streetTokens(s: string | null | undefined): string[] {
  const out: string[] = []
  for (const raw of normText(s).split(' ')) {
    if (!raw || /^\d+$/.test(raw) || raw.length < 2) continue // número de puerta / letras sueltas
    const tok = STREET_ABBREV[raw] ?? raw
    if (STREET_STOPWORDS.has(tok)) continue
    out.push(tok)
  }
  return out
}

/**
 * True si dos calles son "la misma": el conjunto de tokens más chico está
 * contenido en el otro y comparten al menos un token distintivo (≥4 letras).
 */
export function streetMatches(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false
  const setB = new Set(b)
  const inter = a.filter(t => setB.has(t))
  if (inter.length === 0) return false
  const subset = inter.length === Math.min(a.length, b.length)
  const distinctive = inter.some(t => t.length >= 4)
  return subset && distinctive
}

// Número de puerta (último número de la dirección).
function buildingNumber(s: string | null | undefined): number | null {
  const nums = normText(s).match(/\d+/g)
  if (!nums || nums.length === 0) return null
  const n = parseInt(nums[nums.length - 1], 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

// Tolerancia del número: los portales redondean (Agüero 900↔950, 2300↔2333),
// pero 2750 vs 4200 en la misma calle son propiedades distintas.
const NUMBER_TOLERANCE = 100

/**
 * Dos direcciones son la misma propiedad si coincide el nombre de calle Y el
 * número está cerca. Si alguno no tiene número (oculto / "0"), se matchea por
 * calle solamente.
 */
export function addressMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!streetMatches(streetTokens(a), streetTokens(b))) return false
  const na = buildingNumber(a)
  const nb = buildingNumber(b)
  if (na === null || nb === null) return true
  return Math.abs(na - nb) <= NUMBER_TOLERANCE
}

const NONE: MatchResult = { mapId: null, assignedTo: null, propertyId: null, method: 'none', address: null, title: null, external_url: null }

export function pickBestMatch(parsed: ParsedInquiry, rows: PortalMapRow[]): MatchResult {
  const active = rows.filter(r => r.active && r.portal === parsed.portal)
  const hit = (r: PortalMapRow, method: MatchMethod): MatchResult => ({ mapId: r.id, assignedTo: r.assigned_to, propertyId: r.property_id, method, address: r.address, title: r.title, external_url: r.external_url })

  // 1. Código exacto.
  if (parsed.propertyCode) {
    const pc = normCode(parsed.propertyCode)
    if (pc) {
      const r = active.find(x => x.external_code && normCode(x.external_code) === pc)
      if (r) return hit(r, 'code')
    }
  }

  // 2. URL: contención mutua, o código numérico embebido en la URL vs external_code.
  if (parsed.propertyUrl) {
    const pu = parsed.propertyUrl.toLowerCase()
    const r = active.find(x => {
      const xu = x.external_url?.toLowerCase()
      return xu && (pu.includes(xu) || xu.includes(pu))
    })
    if (r) return hit(r, 'url')
    const codeInUrl = pu.match(/\d{6,}/g)?.pop()
    if (codeInUrl) {
      const r2 = active.find(x => x.external_code && normCode(x.external_code).includes(codeInUrl))
      if (r2) return hit(r2, 'url')
    }
  }

  // 3. Dirección: nombre de calle + número cercano (tolera redondeo del portal).
  if (parsed.propertyAddress) {
    const r = active.find(x => addressMatches(parsed.propertyAddress, x.address))
    if (r) return hit(r, 'address')
  }

  // 4. Título (fuzzy por contención).
  if (parsed.propertyTitle) {
    const pt = normText(parsed.propertyTitle)
    if (pt.length >= 8) {
      const r = active.find(x => {
        const xt = normText(x.title)
        return xt.length >= 8 && (xt.includes(pt) || pt.includes(xt))
      })
      if (r) return hit(r, 'title')
    }
  }

  return NONE
}

export async function matchProperty(
  supabase: SupabaseClient,
  parsed: ParsedInquiry,
): Promise<MatchResult> {
  const { data, error } = await supabase
    .from('portal_property_map')
    .select('id, portal, external_code, external_url, address, title, assigned_to, property_id, active')
    .eq('portal', parsed.portal)
    .eq('active', true)
  if (error) {
    console.error('[portal-match] query failed:', error.message)
    return NONE
  }
  return pickBestMatch(parsed, (data ?? []) as PortalMapRow[])
}
