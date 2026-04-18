#!/usr/bin/env tsx
/**
 * Audit de deals duplicados (creados por la auto-creación buggy).
 * Solo lee, no modifica.
 */
import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

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

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

async function main() {
  const { data: deals } = await supabase
    .from('deals')
    .select('id, property_address, stage, appraisal_id, contact_id, assigned_to, created_at')
    .order('created_at', { ascending: false })
    .limit(500)

  const byKey = new Map<string, any[]>()
  for (const d of deals || []) {
    const key = `${d.property_address}|${d.assigned_to ?? '_'}`
    if (!byKey.has(key)) byKey.set(key, [])
    byKey.get(key)!.push(d)
  }

  console.log(`Total deals: ${deals?.length ?? 0}\n`)
  console.log('Grupos con más de 1 deal por (property_address, assigned_to):\n')
  for (const [key, group] of byKey) {
    if (group.length < 2) continue
    const [addr] = key.split('|')
    console.log(`📍 ${addr}  (${group.length} deals)`)
    for (const d of group) {
      const ts = new Date(d.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
      console.log(`   ${d.id.slice(0, 8)}  ${ts}  stage=${d.stage}  appraisal=${d.appraisal_id?.slice(0, 8) ?? '—'}  contact=${d.contact_id?.slice(0, 8) ?? '—'}`)
    }
    console.log()
  }
}
main().catch(e => { console.error(e); process.exit(1) })
