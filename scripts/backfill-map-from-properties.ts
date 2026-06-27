#!/usr/bin/env tsx
/**
 * Completa portal_property_map para ARGENPROP (que matchea por dirección) con
 * TODAS las properties que tienen asesor y dirección. Inserta una fila
 * portal='argenprop' (address → asesor) por cada propiedad cuya dirección no
 * esté ya cubierta en el mapa argenprop (dedup por addressMatches).
 *
 * Los CÓDs de ZonaProp se siembran aparte con scrape-portal-directory.ts.
 *
 *   node --import tsx scripts/backfill-map-from-properties.ts            # dry-run
 *   node --import tsx scripts/backfill-map-from-properties.ts --commit
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

const COMMIT = process.argv.includes('--commit')
const PORTAL = 'argenprop'

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: props, error: e1 } = await supabase
    .from('properties')
    .select('id, address, neighborhood, assigned_to')
    .not('assigned_to', 'is', null)
    .not('address', 'is', null)
  if (e1) { console.error(e1.message); process.exit(1) }

  const { data: mapRows, error: e2 } = await supabase
    .from('portal_property_map')
    .select('id, address')
    .eq('portal', PORTAL)
  if (e2) { console.error(e2.message); process.exit(1) }
  const existing = (mapRows ?? []).filter(r => r.address) as { id: string; address: string }[]

  let inserted = 0, skipped = 0
  for (const p of (props ?? []) as { id: string; address: string; neighborhood: string | null; assigned_to: string }[]) {
    if (p.address.trim().startsWith('[')) { skipped++; continue } // saltea props de prueba/import ([PRUEBA/[TEST/[PENDIENTE)
    if (existing.some(m => addressMatches(p.address, m.address))) { skipped++; continue }
    console.log(`  + ${PORTAL}: "${p.address}"`)
    if (COMMIT) {
      const rec = { portal: PORTAL, address: p.address, neighborhood: p.neighborhood, title: p.address, assigned_to: p.assigned_to, active: true, notes: `property:${p.id}` }
      const { error } = await supabase.from('portal_property_map').insert(rec)
      if (error) { console.error(`    ✗ ${error.message}`); continue }
    }
    inserted++
  }
  console.log(`\n${COMMIT ? 'Insertadas' : 'Insertaría'}: ${inserted} · ya cubiertas: ${skipped}${COMMIT ? '' : ' (DRY-RUN)'}\n`)
}

main().catch(err => { console.error(err); process.exit(1) })
