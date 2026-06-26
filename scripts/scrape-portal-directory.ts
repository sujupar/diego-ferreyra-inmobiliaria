#!/usr/bin/env tsx
/**
 * Scrapea el directorio de ZonaProp de la inmobiliaria (vía ScraperAPI), extrae
 * por aviso { postingCode (CÓD), dirección, título }, matchea la dirección contra
 * las filas ya cargadas en portal_property_map (address → asesor) y siembra filas
 * portal='zonaprop' con external_code = postingCode → mismo asesor.
 *
 * Así las consultas de ZonaProp (que traen el CÓD) se asignan solas.
 *
 *   npx tsx scripts/scrape-portal-directory.ts --dry-run
 *   npx tsx scripts/scrape-portal-directory.ts --commit
 *   (opcional: --url <dir> --pages 3)
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { addressMatches } from '../lib/integrations/portal-inquiries/match'

function loadEnvLocal() {
  const p = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m || process.env[m[1]] !== undefined) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    process.env[m[1]] = v
  }
}
loadEnvLocal()

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
const urlIdx = args.indexOf('--url')
const BASE_URL = urlIdx >= 0 ? args[urlIdx + 1] : 'https://www.zonaprop.com.ar/inmobiliarias/diego-ferreyra-inmobiliaria_30463329-inmuebles.html'
const pagesIdx = args.indexOf('--pages')
const MAX_PAGES = pagesIdx >= 0 ? parseInt(args[pagesIdx + 1] || '3', 10) : 3

interface Posting { postingCode: string; address: string; title: string }

async function fetchPage(url: string): Promise<string> {
  const key = process.env.SCRAPER_API_KEY!
  const proxy = `https://api.scraperapi.com?api_key=${key}&url=${encodeURIComponent(url)}&country_code=ar`
  const res = await fetch(proxy)
  if (!res.ok) throw new Error(`ScraperAPI HTTP ${res.status}`)
  return res.text()
}

function pageUrl(base: string, n: number): string {
  if (n === 1) return base
  return base.replace(/\.html$/, `-pagina-${n}.html`)
}

function unescapeJson(s: string): string {
  try { return JSON.parse(`"${s}"`) } catch { return s.replace(/\\"/g, '"') }
}

/** Extrae los avisos del JSON embebido: partiendo por aviso (postingId). */
function extractPostings(html: string): Posting[] {
  const out: Posting[] = []
  const parts = html.split('"postingId":"')
  for (let i = 1; i < parts.length; i++) {
    const seg = parts[i].slice(0, 15000) // un objeto-aviso entra holgado
    const code = seg.match(/"postingCode":"([^"]+)"/)?.[1]
    if (!code) continue
    const title = seg.match(/"title":"((?:[^"\\]|\\.)*)"/)?.[1] ?? ''
    // postingLocation.address.name (la primera dirección del objeto).
    const addrM = seg.match(/"address":\{"name":"((?:[^"\\]|\\.)*)"/)
    out.push({ postingCode: code, address: addrM ? unescapeJson(addrM[1]) : '', title: unescapeJson(title) })
  }
  return out
}

interface MapRow { id: string; address: string | null; assigned_to: string | null }

async function main() {
  if (!process.env.SCRAPER_API_KEY) { console.error('Falta SCRAPER_API_KEY'); process.exit(1) }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // Lista de referencia (dirección → asesor) desde lo ya sembrado.
  const { data: mapRows, error: mapErr } = await supabase
    .from('portal_property_map')
    .select('id, address, assigned_to')
    .not('assigned_to', 'is', null)
  if (mapErr) { console.error('Error leyendo portal_property_map:', mapErr.message); process.exit(1) }
  const refs = (mapRows ?? []).filter((r: MapRow) => r.address) as MapRow[]

  // Scrape de las páginas del directorio.
  const seen = new Set<string>()
  const postings: Posting[] = []
  for (let n = 1; n <= MAX_PAGES; n++) {
    const url = pageUrl(BASE_URL, n)
    console.log(`Scrapeando página ${n}: ${url}`)
    let html: string
    try { html = await fetchPage(url) } catch (e) { console.warn(`  página ${n} falló: ${e instanceof Error ? e.message : e}`); break }
    const found = extractPostings(html).filter(p => !seen.has(p.postingCode))
    found.forEach(p => seen.add(p.postingCode))
    console.log(`  avisos nuevos: ${found.length}`)
    postings.push(...found)
    if (found.length === 0) break
  }
  console.log(`\nTotal avisos ZonaProp: ${postings.length}\n`)

  let matched = 0, unmatched = 0, inserted = 0, updated = 0
  for (const p of postings) {
    const ref = p.address ? refs.find(r => addressMatches(p.address, r.address)) : undefined
    if (!ref || !ref.assigned_to) {
      console.log(`  ✗ ${p.postingCode} · dir="${p.address || '(oculta)'}" · ${p.title.slice(0, 50)} → sin match`)
      unmatched++
      continue
    }
    matched++
    const label = `${p.postingCode} · ${p.address} → asesor de "${ref.address}"`
    if (!COMMIT) { console.log(`  ✓ ${label}`); continue }

    // upsert por (portal, external_code)
    const { data: existing } = await supabase
      .from('portal_property_map')
      .select('id')
      .eq('portal', 'zonaprop')
      .eq('external_code', p.postingCode)
      .maybeSingle()
    const record = { portal: 'zonaprop', external_code: p.postingCode, address: p.address || null, title: p.title || null, assigned_to: ref.assigned_to, active: true }
    if (existing) {
      const { error } = await supabase.from('portal_property_map').update(record).eq('id', existing.id)
      if (error) { console.error(`  ✗ update ${p.postingCode}: ${error.message}`); continue }
      console.log(`  ↻ ${label}`); updated++
    } else {
      const { error } = await supabase.from('portal_property_map').insert(record)
      if (error) { console.error(`  ✗ insert ${p.postingCode}: ${error.message}`); continue }
      console.log(`  + ${label}`); inserted++
    }
  }

  console.log(`\n=== Resumen ===`)
  console.log(`  Avisos: ${postings.length} · con match: ${matched} · sin match: ${unmatched}`)
  if (COMMIT) console.log(`  Sembradas zonaprop: ${inserted} nuevas, ${updated} actualizadas`)
  else console.log(`  (DRY-RUN: no se sembró. Repetí con --commit.)`)
  console.log('')
}

main().catch(err => { console.error(err); process.exit(1) })
