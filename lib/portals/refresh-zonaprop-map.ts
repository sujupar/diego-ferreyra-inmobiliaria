import type { SupabaseClient } from '@supabase/supabase-js'
import { addressMatches } from '../integrations/portal-inquiries/match'

/**
 * Refresca portal_property_map (zonaprop) leyendo el directorio público de la
 * inmobiliaria en ZonaProp (vía ScraperAPI): por cada aviso extrae el CÓD +
 * dirección, lo cruza contra `properties` (1º por postingId == import_external_id
 * exacto; 2º por dirección) y siembra external_code → asesor. Así las consultas de
 * ZonaProp (que llegan SIN dirección, solo con el CÓD) routean al asesor correcto,
 * incluso para avisos publicados a mano.
 *
 * Lógica compartida por `scripts/scrape-portal-directory.ts` (CLI) y
 * `app/api/cron/refresh-portal-map/route.ts` (cron pg_cron). No usa server-only.
 */

export const ZONAPROP_DIRECTORY_URL =
  'https://www.zonaprop.com.ar/inmobiliarias/diego-ferreyra-inmobiliaria_30463329-inmuebles.html'

interface Posting { postingId: string; postingCode: string; address: string; title: string; url: string }
interface PropRef { id: string; address: string | null; assigned_to: string | null; import_external_id: string | null }

export interface RefreshMapStats {
  avisos: number
  matched: number
  unmatched: number
  inserted: number
  updated: number
  pages: number
  error?: string
}

async function fetchPage(url: string): Promise<string> {
  const key = process.env.SCRAPER_API_KEY
  if (!key) throw new Error('Falta SCRAPER_API_KEY')
  const proxy = `https://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(url)}&country_code=ar`
  const res = await fetch(proxy)
  if (!res.ok) throw new Error(`ScraperAPI HTTP ${res.status}`)
  return res.text()
}

function pageUrl(base: string, n: number): string {
  return n === 1 ? base : base.replace(/\.html$/, `-pagina-${n}.html`)
}

function unescapeJson(s: string): string {
  try { return JSON.parse(`"${s}"`) } catch { return s.replace(/\\"/g, '"') }
}

/** Extrae los avisos del JSON embebido, partiendo por aviso (postingId). */
function extractPostings(html: string): Posting[] {
  const out: Posting[] = []
  const parts = html.split('"postingId":"')
  for (let i = 1; i < parts.length; i++) {
    const postingId = parts[i].match(/^(\d+)/)?.[1] ?? ''
    const seg = parts[i].slice(0, 15000)
    const code = seg.match(/"postingCode":"([^"]+)"/)?.[1]
    if (!code || code.includes('/') || code.includes(':')) continue // descarta URLs
    const title = seg.match(/"title":"((?:[^"\\]|\\.)*)"/)?.[1] ?? ''
    const addrM = seg.match(/"address":\{"name":"((?:[^"\\]|\\.)*)"/)
    // URL del aviso: la única "url" que arranca con /propiedades/ (las otras son del
    // directorio/logo/chat). Absoluta → clickeable en el WhatsApp.
    const urlM = seg.match(/"url":"(\/propiedades\/[^"]+\.html)"/)
    const url = urlM ? `https://www.zonaprop.com.ar${urlM[1]}` : ''
    out.push({ postingId, postingCode: code, address: addrM ? unescapeJson(addrM[1]) : '', title: unescapeJson(title), url })
  }
  return out
}

export async function refreshZonaPropMap(
  supabase: SupabaseClient,
  opts: { commit?: boolean; baseUrl?: string; maxPages?: number; log?: (m: string) => void } = {},
): Promise<RefreshMapStats> {
  const commit = opts.commit ?? false
  const baseUrl = opts.baseUrl ?? ZONAPROP_DIRECTORY_URL
  const maxPages = opts.maxPages ?? 5
  const log = opts.log ?? (() => {})
  const stats: RefreshMapStats = { avisos: 0, matched: 0, unmatched: 0, inserted: 0, updated: 0, pages: 0 }

  const { data: propRows, error: propErr } = await supabase
    .from('properties')
    .select('id, address, assigned_to, import_external_id')
    .not('assigned_to', 'is', null)
  if (propErr) { stats.error = propErr.message; return stats }
  const props = (propRows ?? []) as PropRef[]

  const seen = new Set<string>()
  const postings: Posting[] = []
  for (let n = 1; n <= maxPages; n++) {
    let html: string
    try {
      html = await fetchPage(pageUrl(baseUrl, n))
    } catch (e) {
      log(`página ${n} falló: ${e instanceof Error ? e.message : String(e)}`)
      if (n === 1) stats.error = e instanceof Error ? e.message : String(e)
      break
    }
    stats.pages = n
    const found = extractPostings(html).filter(p => !seen.has(p.postingCode))
    found.forEach(p => seen.add(p.postingCode))
    log(`página ${n}: ${found.length} avisos nuevos`)
    postings.push(...found)
    if (found.length === 0) break
  }
  stats.avisos = postings.length

  for (const p of postings) {
    // 1º match EXACTO por postingId == properties.import_external_id; 2º por dirección.
    const byId = p.postingId ? props.find(r => r.import_external_id && String(r.import_external_id) === p.postingId) : undefined
    const byAddr = p.address ? props.find(r => addressMatches(p.address, r.address)) : undefined
    const ref = byId ?? byAddr
    if (!ref || !ref.assigned_to) { stats.unmatched++; continue }
    stats.matched++
    if (!commit) continue

    const { data: existing } = await supabase
      .from('portal_property_map')
      .select('id')
      .eq('portal', 'zonaprop')
      .eq('external_code', p.postingCode)
      .maybeSingle()
    const record = {
      portal: 'zonaprop', external_code: p.postingCode, external_url: p.url || null,
      address: p.address || null, title: p.title || null, assigned_to: ref.assigned_to,
      property_id: ref.id, active: true,
    }
    if (existing) {
      const { error } = await supabase.from('portal_property_map').update(record).eq('id', existing.id)
      if (!error) stats.updated++
    } else {
      const { error } = await supabase.from('portal_property_map').insert(record)
      if (!error) stats.inserted++
    }
  }
  return stats
}
