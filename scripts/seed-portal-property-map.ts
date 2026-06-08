#!/usr/bin/env tsx
/**
 * Seed de `portal_property_map` — la lista de publicaciones en portales y su
 * asesor responsable. Esta lista la aporta el negocio.
 *
 * Uso:
 *   npx tsx scripts/seed-portal-property-map.ts --file scripts/data/portal-property-map.csv --dry-run
 *   npx tsx scripts/seed-portal-property-map.ts --file scripts/data/portal-property-map.csv --commit
 *
 * Formato CSV (con header). Columnas reconocidas (case-insensitive):
 *   portal,external_code,external_url,address,neighborhood,title,advisor
 * - `portal`: mercadolibre | zonaprop | argenprop (obligatorio)
 * - `advisor`: nombre, email o "Diego"/"Lucas" — se resuelve contra profiles.
 * - Al menos uno de external_code / external_url / address debería venir, para
 *   poder matchear después.
 *
 * También acepta JSON (array de objetos con las mismas claves) si el archivo
 * termina en .json.
 *
 * Dedup: por (portal, external_code) o (portal, external_url). Re-ejecutar es
 * seguro (UPSERT semántico vía select-then-insert/update — NO usa onConflict
 * para no depender de una UNIQUE constraint).
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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
const DRY_RUN = !COMMIT
const fileIdx = args.indexOf('--file')
const FILE = fileIdx >= 0 ? args[fileIdx + 1] : ''

if (!FILE) {
  console.error('Falta --file <ruta>. Ej: --file scripts/data/portal-property-map.csv')
  process.exit(1)
}

const VALID_PORTALS = new Set(['mercadolibre', 'zonaprop', 'argenprop'])

interface InputRow {
  portal: string
  external_code?: string
  external_url?: string
  address?: string
  neighborhood?: string
  title?: string
  advisor?: string
}

function parseCsv(text: string): InputRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length === 0) return []
  const headers = splitCsvLine(lines[0]).map(h => h.trim().toLowerCase())
  return lines.slice(1).map(line => {
    const cells = splitCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h] = (cells[i] ?? '').trim() })
    return row as unknown as InputRow
  })
}

// CSV splitter mínimo con soporte de comillas dobles.
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQ) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (c === '"') inQ = false
      else cur += c
    } else if (c === '"') inQ = true
    else if (c === ',') { out.push(cur); cur = '' }
    else cur += c
  }
  out.push(cur)
  return out
}

function loadRows(): InputRow[] {
  const abs = path.resolve(process.cwd(), FILE)
  const text = fs.readFileSync(abs, 'utf-8')
  if (FILE.toLowerCase().endsWith('.json')) return JSON.parse(text) as InputRow[]
  return parseCsv(text)
}

interface ProfileLite { id: string; full_name: string | null; email: string | null; role: string }

function buildAdvisorResolver(profiles: ProfileLite[]) {
  return (raw?: string): { id: string; label: string } | null => {
    const v = (raw ?? '').trim()
    if (!v) return null
    const low = v.toLowerCase()
    // por email exacto
    const byEmail = profiles.find(p => p.email && p.email.toLowerCase() === low)
    if (byEmail) return { id: byEmail.id, label: byEmail.full_name ?? byEmail.email ?? byEmail.id }
    // por nombre (contención)
    const byName = profiles.filter(p => (p.full_name ?? '').toLowerCase().includes(low))
    if (byName.length === 1) return { id: byName[0].id, label: byName[0].full_name ?? byName[0].id }
    // atajos por rol
    if (low.includes('diego')) {
      const owner = profiles.find(p => p.role === 'dueno')
      if (owner) return { id: owner.id, label: owner.full_name ?? 'Diego (dueño)' }
    }
    if (low.includes('lucas')) {
      const asesor = profiles.find(p => p.role === 'asesor')
      if (asesor) return { id: asesor.id, label: asesor.full_name ?? 'Lucas (asesor)' }
    }
    return null
  }
}

async function findExisting(supabase: SupabaseClient, row: InputRow): Promise<string | null> {
  if (row.external_code) {
    const { data } = await supabase
      .from('portal_property_map')
      .select('id')
      .eq('portal', row.portal)
      .eq('external_code', row.external_code)
      .maybeSingle()
    if (data) return data.id
  }
  if (row.external_url) {
    const { data } = await supabase
      .from('portal_property_map')
      .select('id')
      .eq('portal', row.portal)
      .eq('external_url', row.external_url)
      .maybeSingle()
    if (data) return data.id
  }
  return null
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: profilesData } = await supabase.from('profiles').select('id, full_name, email, role').eq('is_active', true)
  const profiles = (profilesData ?? []) as ProfileLite[]
  const resolveAdvisor = buildAdvisorResolver(profiles)

  const rows = loadRows()
  console.log(`\n${DRY_RUN ? '🔎 DRY-RUN' : '✍️  COMMIT'} — ${rows.length} filas desde ${FILE}\n`)

  let inserted = 0, updated = 0, skipped = 0
  for (const [i, row] of rows.entries()) {
    const portal = (row.portal ?? '').trim().toLowerCase()
    if (!VALID_PORTALS.has(portal)) {
      console.warn(`  [${i + 1}] portal inválido "${row.portal}" — omitida`)
      skipped++
      continue
    }
    const advisor = resolveAdvisor(row.advisor)
    if (row.advisor && !advisor) {
      console.warn(`  [${i + 1}] no pude resolver asesor "${row.advisor}" — se guarda SIN asignar`)
    }
    const record = {
      portal,
      external_code: row.external_code?.trim() || null,
      external_url: row.external_url?.trim() || null,
      address: row.address?.trim() || null,
      neighborhood: row.neighborhood?.trim() || null,
      title: row.title?.trim() || null,
      assigned_to: advisor?.id ?? null,
      active: true,
    }
    const label = `${portal} · ${record.external_code ?? record.external_url ?? record.address ?? '(sin id)'} → ${advisor?.label ?? '(sin asesor)'}`

    if (DRY_RUN) {
      console.log(`  [${i + 1}] ${label}`)
      continue
    }
    const existingId = await findExisting(supabase, { portal, external_code: record.external_code ?? undefined, external_url: record.external_url ?? undefined })
    if (existingId) {
      const { error } = await supabase.from('portal_property_map').update(record).eq('id', existingId)
      if (error) { console.error(`  [${i + 1}] update falló: ${error.message}`); skipped++ }
      else { console.log(`  [${i + 1}] ↻ ${label}`); updated++ }
    } else {
      const { error } = await supabase.from('portal_property_map').insert(record)
      if (error) { console.error(`  [${i + 1}] insert falló: ${error.message}`); skipped++ }
      else { console.log(`  [${i + 1}] + ${label}`); inserted++ }
    }
  }

  console.log(`\n${DRY_RUN ? 'DRY-RUN (no se escribió nada). Repetí con --commit.' : `Listo: ${inserted} insertadas, ${updated} actualizadas, ${skipped} omitidas.`}\n`)
}

main().catch(err => { console.error(err); process.exit(1) })
