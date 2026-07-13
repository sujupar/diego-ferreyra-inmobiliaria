#!/usr/bin/env tsx
/**
 * Re-evalúa la asignación (asesor) de las consultas YA guardadas contra el mapa
 * actual de portal_property_map. Útil después de cargar/cambiar el mapa.
 * Solo actualiza campos derivados (assigned_to, matched_map_id, is_unmatched).
 *
 *   npx tsx scripts/portal-inquiries-rematch.ts --dry-run
 *   npx tsx scripts/portal-inquiries-rematch.ts --commit
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { matchProperty } from '../lib/integrations/portal-inquiries/match'
import type { ParsedInquiry, Portal } from '../lib/integrations/portal-inquiries/types'

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

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: rows, error } = await supabase
    .from('portal_inquiries')
    .select('id, seq, portal, property_external_code, property_url, property_address, assigned_to, matched_map_id, property_id, is_unmatched')
  if (error) { console.error(error.message); process.exit(1) }

  let changed = 0
  for (const r of rows ?? []) {
    const parsed = {
      portal: r.portal as Portal,
      inquiryType: 'mail',
      leadName: null, leadEmail: null, leadPhone: null, message: null,
      propertyCode: r.property_external_code,
      propertyUrl: r.property_url,
      propertyAddress: r.property_address,
      propertyTitle: null,
    } as ParsedInquiry
    const match = await matchProperty(supabase, parsed)
    const newAssigned = match.assignedTo
    const newUnmatched = !newAssigned
    if (newAssigned === r.assigned_to && newUnmatched === r.is_unmatched && match.mapId === r.matched_map_id && match.propertyId === r.property_id) continue
    changed++
    console.log(`  #${r.seq} ${r.portal} ${r.property_external_code || r.property_address || ''} → ${newAssigned ? 'ASIGNADA' : 'sin asignar'} (${match.method})`)
    if (COMMIT) {
      await supabase.from('portal_inquiries').update({
        assigned_to: newAssigned, matched_map_id: match.mapId, is_unmatched: newUnmatched, property_id: match.propertyId,
      }).eq('id', r.id)
    }
  }
  console.log(`\n${COMMIT ? 'Actualizadas' : 'Cambiarían'}: ${changed} de ${rows?.length ?? 0}${COMMIT ? '' : ' (DRY-RUN)'}\n`)
}

main().catch(err => { console.error(err); process.exit(1) })
