#!/usr/bin/env tsx
/**
 * Dedupe de tasks duplicadas (efecto cascada del bug de duplicación de
 * tasaciones/deals — cada deal duplicado disparaba createTaskForRole).
 *
 * Heurística: mismo (assigned_to, type, deal_id) → keep el más reciente,
 * borra los demás. Solo aplica a status='pending' para no tocar history.
 *
 * Uso:
 *   npx tsx scripts/dedupe-tasks.ts             # dry-run
 *   npx tsx scripts/dedupe-tasks.ts --execute   # ejecuta
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

interface TaskRow {
  id: string
  type: string
  title: string
  assigned_to: string
  deal_id: string | null
  appraisal_id: string | null
  contact_id: string | null
  property_id: string | null
  status: string
  created_at: string
}

async function main() {
  console.log(`\n${EXECUTE ? '🔥 MODO EJECUCIÓN' : '🔍 DRY-RUN'} — Dedup de tasks\n`)

  // Fetch all pending tasks
  const all: TaskRow[] = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('tasks')
      .select('id, type, title, assigned_to, deal_id, appraisal_id, contact_id, property_id, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as TaskRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  console.log(`Total tasks pendientes: ${all.length}\n`)

  // Group by (assigned_to, type, deal_id || appraisal_id || property_id || contact_id)
  // — whichever entity reference is present. The first non-null wins.
  function entityKey(t: TaskRow): string {
    return t.deal_id ?? t.appraisal_id ?? t.property_id ?? t.contact_id ?? '_none_'
  }

  const buckets = new Map<string, TaskRow[]>()
  for (const t of all) {
    const key = `${t.assigned_to}|${t.type}|${entityKey(t)}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(t)
  }

  const dupGroups: { keeper: TaskRow; dups: TaskRow[] }[] = []
  for (const [, group] of buckets) {
    if (group.length < 2) continue
    group.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    dupGroups.push({ keeper: group[0], dups: group.slice(1) })
  }

  if (dupGroups.length === 0) {
    console.log('✅ No hay tasks duplicadas.')
    return
  }

  const totalDups = dupGroups.reduce((acc, g) => acc + g.dups.length, 0)
  console.log(`📊 ${dupGroups.length} clusters, ${totalDups} tasks a borrar.\n`)

  for (const g of dupGroups.slice(0, 30)) {
    const titlePreview = g.keeper.title.length > 60 ? g.keeper.title.slice(0, 57) + '...' : g.keeper.title
    console.log(`📌 [${g.keeper.type}] ${titlePreview}  (${g.dups.length + 1} tasks)`)
    console.log(`   KEEPER  ${g.keeper.id.slice(0, 8)}  ${new Date(g.keeper.created_at).toLocaleString('es-AR')}`)
    for (const d of g.dups.slice(0, 3)) {
      console.log(`   borrar  ${d.id.slice(0, 8)}  ${new Date(d.created_at).toLocaleString('es-AR')}`)
    }
    if (g.dups.length > 3) console.log(`   ... y ${g.dups.length - 3} más`)
  }
  if (dupGroups.length > 30) console.log(`\n   ... y ${dupGroups.length - 30} clusters más`)

  if (!EXECUTE) {
    console.log(`\nPara ejecutar: npx tsx scripts/dedupe-tasks.ts --execute`)
    return
  }

  console.log('\n🔥 Ejecutando...\n')
  const dupIds = dupGroups.flatMap(g => g.dups.map(d => d.id))
  const BATCH = 100
  let deleted = 0
  for (let i = 0; i < dupIds.length; i += BATCH) {
    const batch = dupIds.slice(i, i + BATCH)
    const { error } = await supabase.from('tasks').delete().in('id', batch)
    if (error) { console.error('❌', error.message); process.exit(1) }
    deleted += batch.length
    process.stdout.write(`\r  ${deleted}/${dupIds.length}`)
  }
  console.log()

  const { count } = await supabase.from('tasks').select('*', { count: 'exact', head: true }).eq('status', 'pending')
  console.log(`\n✅ Cleanup completo. Tasks pendientes restantes: ${count}\n`)
}
main().catch(e => { console.error(e); process.exit(1) })
