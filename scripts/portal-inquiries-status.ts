#!/usr/bin/env tsx
/**
 * Muestra el estado de las consultas guardadas: cuántas por portal, cuántas
 * asignadas vs sin asignar, y el detalle por asesor. Solo lectura.
 *   npx tsx scripts/portal-inquiries-status.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

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

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: rows, error } = await supabase
    .from('portal_inquiries')
    .select('seq, portal, inquiry_type, lead_name, lead_phone, property_address, property_external_code, assigned_to, is_unmatched, created_at')
    .order('seq', { ascending: true })
  if (error) { console.error('Error:', error.message); process.exit(1) }

  const profIds = Array.from(new Set((rows ?? []).map(r => r.assigned_to).filter(Boolean)))
  const nameMap = new Map<string, string>()
  if (profIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', profIds as string[])
    for (const p of profs ?? []) nameMap.set(p.id, p.full_name ?? p.id)
  }

  const byPortal: Record<string, { total: number; assigned: number; unmatched: number }> = {}
  const byAdvisor: Record<string, number> = {}
  for (const r of rows ?? []) {
    byPortal[r.portal] ??= { total: 0, assigned: 0, unmatched: 0 }
    byPortal[r.portal].total++
    if (r.is_unmatched || !r.assigned_to) byPortal[r.portal].unmatched++
    else { byPortal[r.portal].assigned++; const n = nameMap.get(r.assigned_to) ?? r.assigned_to; byAdvisor[n] = (byAdvisor[n] ?? 0) + 1 }
  }

  console.log(`\n=== Consultas guardadas: ${rows?.length ?? 0} ===\n`)
  console.log('Por portal:')
  for (const [p, c] of Object.entries(byPortal)) console.log(`  ${p}: ${c.total}  (asignadas: ${c.assigned} · sin asignar: ${c.unmatched})`)
  console.log('\nAsignadas por asesor:')
  for (const [n, c] of Object.entries(byAdvisor)) console.log(`  ${n}: ${c}`)

  console.log('\nÚltimas 12 consultas asignadas:')
  for (const r of (rows ?? []).filter(r => !r.is_unmatched && r.assigned_to).slice(-12)) {
    console.log(`  #${r.seq} ${r.portal} · ${r.property_address || r.property_external_code || '—'} · ${r.lead_name || '—'} → ${nameMap.get(r.assigned_to!) ?? '—'}`)
  }

  const unmAp = (rows ?? []).filter(r => (r.is_unmatched || !r.assigned_to) && r.portal === 'argenprop')
  if (unmAp.length) {
    console.log('\n⚠️ Argenprop SIN asignar (dirección no está en la lista — revisá si falta cargarla):')
    for (const r of unmAp.slice(0, 15)) console.log(`  #${r.seq} ${r.property_address || '—'} · ${r.lead_name || '—'}`)
  }
  console.log('')
}

main().catch(err => { console.error(err); process.exit(1) })
