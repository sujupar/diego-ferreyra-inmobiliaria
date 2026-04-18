#!/usr/bin/env tsx
/**
 * Dedupe de tasaciones — script ejecutable con preview y --execute opcional.
 *
 * Heurística: dos appraisals son duplicadas si tienen la misma property_location +
 * assigned_to (o ambas con assigned_to NULL) y se crearon a < 1 hora una de otra.
 * Dentro de cada cluster, mantenemos la más reciente y borramos las anteriores.
 * Re-apuntamos deals/properties/scheduled_appraisals al keeper antes de borrar.
 *
 * Uso:
 *   npx tsx scripts/dedupe-appraisals.ts             # dry-run (no borra nada)
 *   npx tsx scripts/dedupe-appraisals.ts --execute   # ejecuta el cleanup
 *
 * Lee credenciales de .env.local automáticamente.
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

// Minimal .env.local loader (no dotenv dep needed)
function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return
  const content = fs.readFileSync(envPath, 'utf-8')
  for (const line of content.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (!m) continue
    const [, key, raw] = m
    if (process.env[key] !== undefined) continue
    let val = raw.trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    process.env[key] = val
  }
}

loadEnvLocal()

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('❌ Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}

const supabase = createClient(url, serviceKey)
const EXECUTE = process.argv.includes('--execute')
const WINDOW_MS = 60 * 60 * 1000 // 1 hora

interface AppraisalRow {
  id: string
  property_location: string | null
  assigned_to: string | null
  publication_price: number | null
  currency: string | null
  created_at: string
}

async function fetchAllAppraisals(): Promise<AppraisalRow[]> {
  const all: AppraisalRow[] = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('appraisals')
      .select('id, property_location, assigned_to, publication_price, currency, created_at')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as AppraisalRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  return all
}

interface DupCluster {
  property_location: string
  assigned_to: string | null
  keeper: AppraisalRow
  duplicates: AppraisalRow[]
}

function findDuplicateClusters(rows: AppraisalRow[]): DupCluster[] {
  // Group by (property_location, assigned_to)
  const buckets = new Map<string, AppraisalRow[]>()
  for (const r of rows) {
    if (!r.property_location) continue
    const key = `${r.property_location}|${r.assigned_to ?? '__null__'}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(r)
  }

  const clusters: DupCluster[] = []
  for (const [, group] of buckets) {
    if (group.length < 2) continue
    // Already DESC-sorted by fetch order, but be defensive:
    group.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    // Walk down: while the next row is within WINDOW_MS of the previous, it's a dup.
    // The "keeper" of a cluster is the latest in that contiguous run.
    let i = 0
    while (i < group.length) {
      const keeper = group[i]
      const dupsInCluster: AppraisalRow[] = []
      let j = i + 1
      let last = keeper
      while (
        j < group.length &&
        new Date(last.created_at).getTime() - new Date(group[j].created_at).getTime() < WINDOW_MS
      ) {
        dupsInCluster.push(group[j])
        last = group[j]
        j++
      }
      if (dupsInCluster.length > 0) {
        clusters.push({
          property_location: keeper.property_location!,
          assigned_to: keeper.assigned_to,
          keeper,
          duplicates: dupsInCluster,
        })
      }
      i = j // skip past this cluster
    }
  }
  return clusters
}

function fmtMoney(n: number | null, c: string | null) {
  if (n == null) return '—'
  return `${c ?? '$'} ${n.toLocaleString('es-AR')}`
}

function fmtDate(s: string) {
  return new Date(s).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function main() {
  console.log(`\n${EXECUTE ? '🔥 MODO EJECUCIÓN' : '🔍 DRY-RUN'} — Dedup de tasaciones\n`)
  console.log('Cargando tasaciones desde Supabase...')
  const rows = await fetchAllAppraisals()
  console.log(`Total tasaciones en DB: ${rows.length}\n`)

  const clusters = findDuplicateClusters(rows)
  if (clusters.length === 0) {
    console.log('✅ No se detectaron duplicados (heurística: misma propiedad + asesor, < 1h entre cada par).')
    return
  }

  const totalDups = clusters.reduce((acc, c) => acc + c.duplicates.length, 0)
  console.log(`📊 Encontrados ${clusters.length} clusters de duplicados, ${totalDups} tasaciones a borrar.\n`)

  // Show top 20 clusters
  console.log('Top clusters por cantidad de duplicados:')
  console.log('─'.repeat(100))
  const sorted = clusters.slice().sort((a, b) => b.duplicates.length - a.duplicates.length)
  for (const c of sorted.slice(0, 20)) {
    const loc = c.property_location.length > 50 ? c.property_location.slice(0, 47) + '...' : c.property_location
    console.log(`\n📍 ${loc}`)
    console.log(`   KEEPER  ${c.keeper.id.slice(0, 8)}  ${fmtDate(c.keeper.created_at)}  ${fmtMoney(c.keeper.publication_price, c.keeper.currency)}`)
    for (const d of c.duplicates) {
      console.log(`   borrar  ${d.id.slice(0, 8)}  ${fmtDate(d.created_at)}  ${fmtMoney(d.publication_price, d.currency)}`)
    }
  }
  if (sorted.length > 20) console.log(`\n   ... y ${sorted.length - 20} clusters más.\n`)

  if (!EXECUTE) {
    console.log('\n' + '═'.repeat(60))
    console.log(`Para ejecutar el cleanup, corré:`)
    console.log(`  npx tsx scripts/dedupe-appraisals.ts --execute`)
    console.log('═'.repeat(60))
    return
  }

  // EXECUTE
  console.log('\n🔥 Ejecutando cleanup...\n')
  const dupIds: string[] = []
  const repointMap = new Map<string, string>() // dupId -> keeperId
  for (const c of clusters) {
    for (const d of c.duplicates) {
      dupIds.push(d.id)
      repointMap.set(d.id, c.keeper.id)
    }
  }

  // Step 1-3: re-point FKs in deals, properties, scheduled_appraisals
  // We do this dup-by-dup to avoid a giant CASE statement; supabase-js doesn't
  // support raw SQL CASE updates without RPC.
  console.log(`Re-apuntando FKs (deals, properties, scheduled_appraisals, tasks) para ${dupIds.length} duplicados...`)
  let repointed = { deals: 0, properties: 0, scheduled: 0, tasks: 0 }
  for (const [dupId, keeperId] of repointMap) {
    const [d, p, s, t] = await Promise.all([
      supabase.from('deals').update({ appraisal_id: keeperId, updated_at: new Date().toISOString() }).eq('appraisal_id', dupId).select('id'),
      supabase.from('properties').update({ appraisal_id: keeperId, updated_at: new Date().toISOString() }).eq('appraisal_id', dupId).select('id'),
      supabase.from('scheduled_appraisals').update({ appraisal_id: keeperId }).eq('appraisal_id', dupId).select('id'),
      supabase.from('tasks').update({ appraisal_id: keeperId }).eq('appraisal_id', dupId).select('id'),
    ])
    repointed.deals += d.data?.length || 0
    repointed.properties += p.data?.length || 0
    repointed.scheduled += s.data?.length || 0
    repointed.tasks += t.data?.length || 0
  }
  console.log(`  deals re-apuntados: ${repointed.deals}`)
  console.log(`  properties re-apuntadas: ${repointed.properties}`)
  console.log(`  scheduled_appraisals re-apuntadas: ${repointed.scheduled}`)
  console.log(`  tasks re-apuntadas: ${repointed.tasks}`)

  // Step 4: delete duplicates (cascade cleans appraisal_comparables)
  console.log(`\nBorrando ${dupIds.length} tasaciones duplicadas...`)
  const BATCH = 100
  let deleted = 0
  for (let i = 0; i < dupIds.length; i += BATCH) {
    const batch = dupIds.slice(i, i + BATCH)
    const { error } = await supabase.from('appraisals').delete().in('id', batch)
    if (error) {
      console.error(`❌ Error borrando batch [${i}, ${i + batch.length}):`, error.message)
      throw error
    }
    deleted += batch.length
    process.stdout.write(`\r  ${deleted}/${dupIds.length}`)
  }
  console.log()

  // Final count
  const { count } = await supabase.from('appraisals').select('*', { count: 'exact', head: true })
  console.log(`\n✅ Cleanup completo. Tasaciones restantes: ${count}\n`)
}

main().catch(err => {
  console.error('\n❌ Error:', err)
  process.exit(1)
})
