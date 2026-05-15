#!/usr/bin/env tsx
/**
 * Fix de tasks para captadas importadas de GHL.
 *
 * Las 5 properties con ghl_imported=true se crearon en el bulk import pero
 * sus tasks asociadas fallaron por tasks_type_check. Una vez aplicada la
 * migración 20260514000004, este script crea las tasks faltantes.
 *
 * Idempotente: skipea properties que ya tienen task pendiente.
 *
 * Uso:
 *   npx tsx scripts/ghl-fix-captadas-tasks.ts             (dry-run)
 *   npx tsx scripts/ghl-fix-captadas-tasks.ts --execute
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
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
loadEnv()

const EXECUTE = process.argv.includes('--execute')
const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

interface Property {
  id: string
  address: string
  contact_id: string | null
  ghl_custom_fields: Record<string, string | null> | null
}

const FIELD_ADDRESS = 'lVCemPE4yuqyEGLym5cX'
const FIELD_NEIGH_PRIMARY = 'CTwhVoTNFJbhPUvv650o'
const FIELD_NEIGH_SECONDARY = '1Yo9Go7NxGSnG7HVp1Zp'

async function main() {
  console.log(`\n${EXECUTE ? '🔥 EJECUTANDO' : '🔍 DRY-RUN'} — Fix tasks de captadas\n`)

  const { data: properties, error } = await s
    .from('properties')
    .select('id, address, contact_id, ghl_custom_fields, asking_price, photos, covered_area, total_area, commission_percentage')
    .eq('ghl_imported', true)
  if (error) throw error

  console.log(`Properties ghl_imported=true: ${properties?.length || 0}\n`)

  const { data: coordinators } = await s
    .from('profiles')
    .select('id, full_name')
    .eq('role', 'coordinador')
    .eq('is_active', true)
  console.log(`Coordinadores activos: ${coordinators?.length || 0}`)
  for (const c of coordinators || []) console.log(`  • ${c.full_name} (${c.id})`)
  console.log()

  let created = 0
  let skipped = 0

  for (const p of (properties as Property[]) || []) {
    // ¿Ya tiene task pendiente del tipo correcto?
    const { count } = await s
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('property_id', p.id)
      .eq('type', 'complete_imported_property')
      .eq('status', 'pending')
    if ((count ?? 0) > 0) {
      console.log(`  ⏭  ${p.address.substring(0, 50)} — ya tiene task`)
      skipped++
      continue
    }

    // Computar campos faltantes
    const cf = p.ghl_custom_fields || {}
    const hasAddress = !p.address.startsWith('[PENDIENTE') && !p.address.startsWith('[Importado GHL') && !cf[FIELD_ADDRESS]
    const hasNeighborhood = cf[FIELD_NEIGH_PRIMARY] || cf[FIELD_NEIGH_SECONDARY]
    const missing: string[] = []
    if (!hasAddress) missing.push('dirección')
    if (!hasNeighborhood) missing.push('barrio')
    missing.push('precio de venta', 'comisión', 'm² cubiertos/totales', 'fotos', 'documentos legales')

    const description = `Property importada de GHL — falta: ${missing.join(', ')}.\nVerificar dirección y completar campos comerciales.`
    const title = `Completar datos importados de GHL: ${p.address.substring(0, 60)}`

    for (const c of coordinators || []) {
      console.log(`  ${EXECUTE ? '✓' : '·'}  task → ${(c.full_name as string).padEnd(22)} prop=${p.address.substring(0, 45)}`)
      if (EXECUTE) {
        const { error: tErr } = await s.from('tasks').insert({
          type: 'complete_imported_property',
          title,
          description,
          status: 'pending',
          property_id: p.id,
          contact_id: p.contact_id,
          assigned_to: c.id,
        })
        if (tErr) {
          console.error(`     ⚠ falló: ${tErr.message}`)
          continue
        }
      }
      created++
    }
  }

  console.log(`\nResumen:`)
  console.log(`  Properties con task: ${skipped}`)
  console.log(`  Tasks ${EXECUTE ? 'creadas' : 'a crear'}: ${created}`)
}

main().catch(err => { console.error(err); process.exit(1) })
