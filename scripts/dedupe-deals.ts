#!/usr/bin/env tsx
/**
 * Dedupe de deals duplicados (creados por la auto-creación buggy del flujo
 * /appraisal/new). Heurística:
 *   - Mismo (property_address, assigned_to)
 *   - Stage = 'appraisal_sent' (la stage que pone la auto-creación)
 *   - Mismo appraisal_id (después del dedup de appraisals, todos los duplicados
 *     ya apuntan al keeper)
 *   → mantener el más reciente, borrar los demás.
 *
 * Re-apunta tasks.deal_id al keeper antes de borrar.
 * NO toca contacts (podrían tener referencias legítimas en otro lado).
 *
 * Uso:
 *   npx tsx scripts/dedupe-deals.ts             # dry-run
 *   npx tsx scripts/dedupe-deals.ts --execute   # ejecuta
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
const EXECUTE = process.argv.includes('--execute')

interface DealRow {
  id: string
  property_address: string
  stage: string
  appraisal_id: string | null
  contact_id: string | null
  assigned_to: string | null
  created_at: string
}

async function main() {
  console.log(`\n${EXECUTE ? '🔥 MODO EJECUCIÓN' : '🔍 DRY-RUN'} — Dedup de deals\n`)
  const { data: deals, error } = await supabase
    .from('deals')
    .select('id, property_address, stage, appraisal_id, contact_id, assigned_to, created_at')
    .order('created_at', { ascending: false })
    .limit(2000)
  if (error) throw error

  console.log(`Total deals: ${deals?.length ?? 0}\n`)

  // Group by (property_address, assigned_to, appraisal_id) — same property, same asesor,
  // same appraisal → certainly duplicates from the auto-create bug
  const buckets = new Map<string, DealRow[]>()
  for (const d of deals as DealRow[]) {
    if (d.stage !== 'appraisal_sent') continue
    if (!d.appraisal_id) continue
    const key = `${d.property_address}|${d.assigned_to ?? '_'}|${d.appraisal_id}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(d)
  }

  const dupGroups: { keeper: DealRow; dups: DealRow[] }[] = []
  for (const [, group] of buckets) {
    if (group.length < 2) continue
    group.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    dupGroups.push({ keeper: group[0], dups: group.slice(1) })
  }

  if (dupGroups.length === 0) {
    console.log('✅ No hay deals duplicados.')
    return
  }

  const totalDups = dupGroups.reduce((acc, g) => acc + g.dups.length, 0)
  console.log(`📊 ${dupGroups.length} clusters, ${totalDups} deals a borrar.\n`)

  for (const g of dupGroups) {
    console.log(`📍 ${g.keeper.property_address}`)
    console.log(`   KEEPER  ${g.keeper.id.slice(0, 8)}  ${new Date(g.keeper.created_at).toLocaleString('es-AR')}`)
    for (const d of g.dups) {
      console.log(`   borrar  ${d.id.slice(0, 8)}  ${new Date(d.created_at).toLocaleString('es-AR')}`)
    }
  }

  if (!EXECUTE) {
    console.log(`\nPara ejecutar: npx tsx scripts/dedupe-deals.ts --execute`)
    return
  }

  console.log('\n🔥 Ejecutando...\n')
  const repoint = new Map<string, string>()
  for (const g of dupGroups) for (const d of g.dups) repoint.set(d.id, g.keeper.id)
  const dupIds = Array.from(repoint.keys())

  // Re-point tasks.deal_id
  console.log(`Re-apuntando tasks.deal_id de ${dupIds.length} deals duplicados al keeper...`)
  let tasksRepointed = 0
  for (const [dupId, keeperId] of repoint) {
    const { data } = await supabase.from('tasks').update({ deal_id: keeperId }).eq('deal_id', dupId).select('id')
    tasksRepointed += data?.length || 0
  }
  console.log(`  tasks re-apuntadas: ${tasksRepointed}`)

  // Delete deals
  console.log(`\nBorrando ${dupIds.length} deals duplicados...`)
  const { error: delErr } = await supabase.from('deals').delete().in('id', dupIds)
  if (delErr) {
    console.error('❌ Error:', delErr.message)
    process.exit(1)
  }

  const { count } = await supabase.from('deals').select('*', { count: 'exact', head: true })
  console.log(`\n✅ Cleanup completo. Deals restantes: ${count}\n`)
  console.log('Nota: no se tocaron los contacts. Si querés limpiar contacts huérfanos, hacelo manualmente.')
}
main().catch(e => { console.error(e); process.exit(1) })
