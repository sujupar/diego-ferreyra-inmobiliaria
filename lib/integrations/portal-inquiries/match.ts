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
  active: boolean
}

export type MatchMethod = 'code' | 'url' | 'address' | 'title' | 'none'

export interface MatchResult {
  mapId: string | null
  assignedTo: string | null
  method: MatchMethod
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

const NONE: MatchResult = { mapId: null, assignedTo: null, method: 'none' }

export function pickBestMatch(parsed: ParsedInquiry, rows: PortalMapRow[]): MatchResult {
  const active = rows.filter(r => r.active && r.portal === parsed.portal)
  const hit = (r: PortalMapRow, method: MatchMethod): MatchResult => ({ mapId: r.id, assignedTo: r.assigned_to, method })

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

  // 3. Dirección (fuzzy por contención).
  if (parsed.propertyAddress) {
    const pa = normText(parsed.propertyAddress)
    if (pa.length >= 5) {
      const r = active.find(x => {
        const xa = normText(x.address)
        return xa.length >= 5 && (xa.includes(pa) || pa.includes(xa))
      })
      if (r) return hit(r, 'address')
    }
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
    .select('id, portal, external_code, external_url, address, title, assigned_to, active')
    .eq('portal', parsed.portal)
    .eq('active', true)
  if (error) {
    console.error('[portal-match] query failed:', error.message)
    return NONE
  }
  return pickBestMatch(parsed, (data ?? []) as PortalMapRow[])
}
