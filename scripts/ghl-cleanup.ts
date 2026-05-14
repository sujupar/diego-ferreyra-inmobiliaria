#!/usr/bin/env tsx
/**
 * GHL Cleanup — rollback del último import.
 *
 * Borra todos los `deals` que tienen `ghl_opportunity_id NOT NULL`. Las tareas
 * y properties asociadas caen por las FKs ON DELETE SET NULL / CASCADE (ya
 * migradas). Properties con `ghl_imported=true` también se borran.
 *
 * Los `contacts` NO se borran — si fueron creados por el import, igual son
 * data limpia y los podrías querer conservar. Si querés un rollback total,
 * borrar contacts manualmente con `DELETE FROM contacts WHERE ghl_contact_id
 * IS NOT NULL AND NOT EXISTS (SELECT 1 FROM deals WHERE contact_id = contacts.id)`.
 *
 * Uso:
 *   npx tsx scripts/ghl-cleanup.ts              (dry-run)
 *   npx tsx scripts/ghl-cleanup.ts --execute
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

const EXECUTE = process.argv.includes('--execute')
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

function isImportCreated(propertyAddress: string): boolean {
  return /^\[(Importado GHL|PENDIENTE — Importado GHL)\]/i.test(propertyAddress || '')
}

async function main() {
  console.log(`\n${EXECUTE ? '🔥 EJECUTANDO' : '🔍 DRY-RUN'} — GHL Cleanup\n`)

  // 1. Buscar deals con ghl_opportunity_id (creados o merged)
  const { data: deals, error: dErr } = await s
    .from('deals')
    .select('id, property_address, stage, ghl_opportunity_id, contact_id, property_id, created_at')
    .not('ghl_opportunity_id', 'is', null)
  if (dErr) throw dErr

  const newDeals = (deals || []).filter(d => isImportCreated(d.property_address))
  const mergedDeals = (deals || []).filter(d => !isImportCreated(d.property_address))

  console.log(`Deals con ghl_opportunity_id: ${deals?.length || 0}`)
  console.log(`  • NUEVOS (creados por import, a BORRAR): ${newDeals.length}`)
  for (const d of newDeals) {
    console.log(`     ${d.property_address.substring(0, 50).padEnd(50)} stage=${d.stage}`)
  }
  console.log(`  • MERGED (deals existentes claimados, solo UN-CLAIM): ${mergedDeals.length}`)
  for (const d of mergedDeals) {
    console.log(`     ${d.property_address.substring(0, 50).padEnd(50)} stage=${d.stage}`)
  }

  // 2. Buscar properties importadas
  const { data: props, error: pErr } = await s
    .from('properties')
    .select('id, address, ghl_imported, ghl_opportunity_id')
    .or('ghl_imported.eq.true,ghl_opportunity_id.not.is.null')
  if (pErr) throw pErr
  console.log(`\nProperties importadas (ghl_imported=true OR ghl_opportunity_id set): ${props?.length || 0}`)
  for (const p of props || []) {
    console.log(`  • ${p.address.substring(0, 50)}  (${p.id})`)
  }

  // 3. Buscar tasks importadas
  const { data: tasks, error: tErr } = await s
    .from('tasks')
    .select('id, title, type')
    .eq('type', 'complete_imported_property')
  if (tErr) throw tErr
  console.log(`\nTasks 'complete_imported_property': ${tasks?.length || 0}`)

  if (!EXECUTE) {
    console.log('\nDry-run terminado. Re-corré con --execute para borrar.')
    return
  }

  // 4. Borrar (orden: tasks → properties → deals; los contacts quedan)
  console.log('\nBorrando tasks...')
  const taskIds = (tasks || []).map(t => t.id)
  if (taskIds.length > 0) {
    const { error } = await s.from('tasks').delete().in('id', taskIds)
    if (error) console.error('Error borrando tasks:', error)
    else console.log(`  ✓ ${taskIds.length} tasks borradas`)
  }

  console.log('Borrando properties...')
  const propIds = (props || []).map(p => p.id)
  if (propIds.length > 0) {
    const { error } = await s.from('properties').delete().in('id', propIds)
    if (error) console.error('Error borrando properties:', error)
    else console.log(`  ✓ ${propIds.length} properties borradas`)
  }

  console.log('Borrando deals NUEVOS (creados por import)...')
  if (newDeals.length > 0) {
    const { error } = await s.from('deals').delete().in('id', newDeals.map(d => d.id))
    if (error) console.error('Error borrando deals nuevos:', error)
    else console.log(`  ✓ ${newDeals.length} deals nuevos borrados`)
  }

  console.log('Un-claim de deals MERGED (limpiar ghl_*_id y notas de import)...')
  for (const d of mergedDeals) {
    // Re-leemos las notas y sacamos la sección "── Datos del import GHL ──"
    const { data: full } = await s.from('deals').select('notes').eq('id', d.id).single()
    let cleanedNotes = full?.notes || null
    if (cleanedNotes) {
      cleanedNotes = cleanedNotes
        .split(/\n── Datos del import GHL ──\n/)[0]
        .trim() || null
    }
    const { error } = await s.from('deals').update({
      ghl_opportunity_id: null,
      ghl_contact_id: null,
      notes: cleanedNotes,
    }).eq('id', d.id)
    if (error) console.error(`Error un-claim deal ${d.id}:`, error)
  }
  console.log(`  ✓ ${mergedDeals.length} deals un-claimados`)

  // 5. Reset ghl_contact_id en contacts (para que el próximo import los re-evalúe)
  console.log('Limpiando ghl_contact_id en contacts...')
  const { data: clearedContacts, error: cErr } = await s
    .from('contacts')
    .update({ ghl_contact_id: null })
    .not('ghl_contact_id', 'is', null)
    .select('id')
  if (cErr) console.error('Error limpiando contacts:', cErr)
  else console.log(`  ✓ ${clearedContacts?.length || 0} contacts: ghl_contact_id → null`)

  console.log('\n✅ Cleanup terminado.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
