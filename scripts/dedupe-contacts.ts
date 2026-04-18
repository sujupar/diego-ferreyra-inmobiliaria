#!/usr/bin/env tsx
/**
 * Dedupe de contacts duplicados (efecto cascada del bug original — cada
 * tasación duplicada disparaba auto-creación de deal SIN contact_phone, así
 * que el lookup-by-email fallaba y se creaba un contacto nuevo cada vez).
 *
 * Heurística: misma (full_name, COALESCE(phone, email, '')) → keep el
 * más antiguo (asumimos que es el original; los duplicados son los más
 * recientes auto-creados). Re-apunta deals/scheduled_appraisals.contact_id
 * al keeper antes de borrar.
 *
 * NOTA: contactos sin email Y sin phone con full_name = dirección de propiedad
 * son obviamente auto-creados. Estos los marca con prioridad alta.
 *
 * Uso:
 *   npx tsx scripts/dedupe-contacts.ts             # dry-run
 *   npx tsx scripts/dedupe-contacts.ts --execute   # ejecuta
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

interface ContactRow {
  id: string
  full_name: string
  phone: string | null
  email: string | null
  created_at: string
}

async function main() {
  console.log(`\n${EXECUTE ? '🔥 MODO EJECUCIÓN' : '🔍 DRY-RUN'} — Dedup de contacts\n`)

  const all: ContactRow[] = []
  const PAGE = 1000
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from('contacts')
      .select('id, full_name, phone, email, created_at')
      .order('created_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all.push(...(data as ContactRow[]))
    if (data.length < PAGE) break
    from += PAGE
  }
  console.log(`Total contacts: ${all.length}\n`)

  // Group by (full_name, phone || email || ''). full_name + phone is the strongest.
  // If both phone and email are null, the contact was almost certainly auto-created
  // by the buggy /api/deals (which sent contact_name=propertyTitle and no phone/email).
  const buckets = new Map<string, ContactRow[]>()
  for (const c of all) {
    const key = `${c.full_name}|${c.phone || c.email || '__noid__'}`
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(c)
  }

  const dupGroups: { keeper: ContactRow; dups: ContactRow[] }[] = []
  for (const [, group] of buckets) {
    if (group.length < 2) continue
    // Already ASC by created_at; the oldest is the keeper.
    dupGroups.push({ keeper: group[0], dups: group.slice(1) })
  }

  if (dupGroups.length === 0) {
    console.log('✅ No hay contacts duplicados según la heurística.')
    return
  }

  const totalDups = dupGroups.reduce((acc, g) => acc + g.dups.length, 0)
  console.log(`📊 ${dupGroups.length} clusters, ${totalDups} contacts a borrar.\n`)

  for (const g of dupGroups.slice(0, 30)) {
    const id = g.keeper.phone || g.keeper.email || '(sin id)'
    console.log(`👤 ${g.keeper.full_name}  [${id}]  (${g.dups.length + 1} contacts)`)
    console.log(`   KEEPER  ${g.keeper.id.slice(0, 8)}  ${new Date(g.keeper.created_at).toLocaleString('es-AR')}`)
    for (const d of g.dups.slice(0, 3)) {
      console.log(`   borrar  ${d.id.slice(0, 8)}  ${new Date(d.created_at).toLocaleString('es-AR')}`)
    }
    if (g.dups.length > 3) console.log(`   ... y ${g.dups.length - 3} más`)
  }
  if (dupGroups.length > 30) console.log(`\n   ... y ${dupGroups.length - 30} clusters más`)

  if (!EXECUTE) {
    console.log(`\nPara ejecutar: npx tsx scripts/dedupe-contacts.ts --execute`)
    return
  }

  console.log('\n🔥 Ejecutando...\n')
  const repoint = new Map<string, string>()
  for (const g of dupGroups) for (const d of g.dups) repoint.set(d.id, g.keeper.id)
  const dupIds = Array.from(repoint.keys())

  // Re-point all FKs that reference contacts.id
  console.log(`Re-apuntando FKs (deals, scheduled_appraisals, appraisals, properties, tasks)...`)
  let stats = { deals: 0, scheduled: 0, appraisals: 0, properties: 0, tasks: 0 }
  for (const [dupId, keeperId] of repoint) {
    const [d, s, a, p, t] = await Promise.all([
      supabase.from('deals').update({ contact_id: keeperId }).eq('contact_id', dupId).select('id'),
      supabase.from('scheduled_appraisals').update({ contact_id: keeperId }).eq('contact_id', dupId).select('id'),
      supabase.from('appraisals').update({ contact_id: keeperId }).eq('contact_id', dupId).select('id'),
      supabase.from('properties').update({ contact_id: keeperId }).eq('contact_id', dupId).select('id'),
      supabase.from('tasks').update({ contact_id: keeperId }).eq('contact_id', dupId).select('id'),
    ])
    stats.deals += d.data?.length || 0
    stats.scheduled += s.data?.length || 0
    stats.appraisals += a.data?.length || 0
    stats.properties += p.data?.length || 0
    stats.tasks += t.data?.length || 0
  }
  console.log(`  deals: ${stats.deals}  scheduled: ${stats.scheduled}  appraisals: ${stats.appraisals}  properties: ${stats.properties}  tasks: ${stats.tasks}`)

  console.log(`\nBorrando ${dupIds.length} contacts duplicados...`)
  const BATCH = 100
  let deleted = 0
  for (let i = 0; i < dupIds.length; i += BATCH) {
    const batch = dupIds.slice(i, i + BATCH)
    const { error } = await supabase.from('contacts').delete().in('id', batch)
    if (error) { console.error('❌', error.message); process.exit(1) }
    deleted += batch.length
    process.stdout.write(`\r  ${deleted}/${dupIds.length}`)
  }
  console.log()

  const { count } = await supabase.from('contacts').select('*', { count: 'exact', head: true })
  console.log(`\n✅ Cleanup completo. Contacts restantes: ${count}\n`)
}
main().catch(e => { console.error(e); process.exit(1) })
