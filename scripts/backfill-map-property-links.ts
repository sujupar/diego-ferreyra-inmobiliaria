#!/usr/bin/env tsx
/**
 * Linkea filas de `portal_property_map` que NO tienen `property_id` a su
 * `properties` correspondiente, por DIRECCIÓN.
 *
 * Por qué hace falta: la migración `20260711000001` hace backfill de
 * `property_id` leyendo `notes='property:<id>'`, pero las filas sembradas por
 * `scripts/seed-portal-property-map.ts` (desde el CSV del negocio) NUNCA
 * tuvieron esa convención — quedan sin FK aunque el mapa las asigna bien a un
 * asesor. Sin FK, sus consultas cuentan como "Sin identificar" en el panel de
 * métricas aunque en el inbox aparezcan correctamente asignadas.
 *
 * Cuándo correrlo: DESPUÉS de correr las migraciones `20260711000001` y
 * `20260711000002` en el Dashboard de Supabase (requiere que exista la
 * columna `portal_property_map.property_id`).
 *
 * Qué hace (por fila del mapa sin property_id):
 *   1. Si `notes` matchea `property:<uuid>` y esa propiedad existe → linkea
 *      por notes (cubre rezagos que el UPDATE #4 de la migración no haya
 *      tomado, p. ej. filas nuevas insertadas entre migración y este script).
 *   2. Si no, y la fila tiene `address` → busca en `properties` con
 *      `addressMatches`. Solo linkea si matchea EXACTAMENTE UNA propiedad.
 *      2+ matches → AMBIGUO (se loguea y se saltea). 0 matches → SIN MATCH.
 *   Propiedades con address que empieza con '[' (placeholders de
 *   prueba/import) se excluyen, igual que en backfill-map-from-properties.ts.
 *
 * Después de correr esto con --commit, para propagar los nuevos property_id
 * del mapa a las consultas YA guardadas, correr:
 *   - el UPDATE #4 de la migración `20260711000001` (idempotente), o
 *   - npx tsx scripts/portal-inquiries-rematch.ts --commit
 *
 *   npx tsx scripts/backfill-map-property-links.ts            # dry-run
 *   npx tsx scripts/backfill-map-property-links.ts --commit
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

interface MapRow {
  id: string
  portal: string
  external_code: string | null
  address: string | null
  title: string | null
  assigned_to: string | null
  notes: string | null
  property_id: string | null
}

interface PropertyRow {
  id: string
  address: string | null
  assigned_to: string | null
}

async function main() {
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data: mapRows, error: e1 } = await supabase
    .from('portal_property_map')
    .select('id, portal, external_code, address, title, assigned_to, notes, property_id')
    .is('property_id', null)
  if (e1) { console.error(e1.message); process.exit(1) }

  const { data: props, error: e2 } = await supabase
    .from('properties')
    .select('id, address, assigned_to')
  if (e2) { console.error(e2.message); process.exit(1) }

  const properties = (props ?? []) as PropertyRow[]
  const propsById = new Map(properties.map(p => [p.id, p]))
  const candidateProps = properties.filter(p => p.address && !p.address.trim().startsWith('['))

  let porNotes = 0, porDireccion = 0, ambiguas = 0, sinMatch = 0
  const total = (mapRows ?? []).length

  for (const row of (mapRows ?? []) as MapRow[]) {
    // 1. Rezago de la convención notes (el UPDATE #4 de la migración ya cubrió
    //    la mayoría; esto atrapa lo que haya quedado afuera).
    const notesMatch = row.notes?.match(/property:([0-9a-fA-F-]{36})/)
    if (notesMatch && propsById.has(notesMatch[1])) {
      const propertyId = notesMatch[1]
      console.log(`  [notes] ${row.portal} · "${row.address ?? row.external_code ?? row.id}" → ${propertyId}`)
      if (COMMIT) {
        const { error } = await supabase.from('portal_property_map').update({ property_id: propertyId }).eq('id', row.id)
        if (error) { console.error(`    ✗ ${error.message}`); continue }
      }
      porNotes++
      continue
    }

    // 2. Match por dirección.
    if (!row.address) { sinMatch++; continue }
    const matches = candidateProps.filter(p => addressMatches(row.address, p.address))
    if (matches.length === 0) {
      console.log(`  [sin match] ${row.portal} · "${row.address}"`)
      sinMatch++
      continue
    }
    if (matches.length > 1) {
      console.log(`  [ambiguo] ${row.portal} · "${row.address}" → ${matches.length} propiedades (${matches.map(m => m.id).join(', ')})`)
      ambiguas++
      continue
    }
    const property = matches[0]
    console.log(`  [dirección] ${row.portal} · "${row.address}" → ${property.id}`)
    if (COMMIT) {
      const { error } = await supabase.from('portal_property_map').update({ property_id: property.id }).eq('id', row.id)
      if (error) { console.error(`    ✗ ${error.message}`); continue }
    }
    porDireccion++
  }

  console.log(`\nSin FK: ${total} · linkeadas por notes: ${porNotes} · linkeadas por dirección: ${porDireccion} · ambiguas: ${ambiguas} · sin match: ${sinMatch}${COMMIT ? '' : ' (DRY-RUN)'}\n`)
}

main().catch(err => { console.error(err); process.exit(1) })
