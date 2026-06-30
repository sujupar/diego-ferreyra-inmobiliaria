#!/usr/bin/env tsx
/**
 * CLI para refrescar el mapa de ZonaProp (CÓD↔dirección↔asesor) desde el directorio
 * público de la inmobiliaria. La lógica vive en lib/portals/refresh-zonaprop-map.ts
 * (compartida con el cron app/api/cron/refresh-portal-map).
 *
 *   node --import tsx scripts/scrape-portal-directory.ts            # dry-run
 *   node --import tsx scripts/scrape-portal-directory.ts --commit
 *   (opcional: --url <dir> --pages 5)
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { refreshZonaPropMap, ZONAPROP_DIRECTORY_URL } from '../lib/portals/refresh-zonaprop-map'

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

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
const urlIdx = args.indexOf('--url')
const baseUrl = urlIdx >= 0 ? args[urlIdx + 1] : ZONAPROP_DIRECTORY_URL
const pagesIdx = args.indexOf('--pages')
const maxPages = pagesIdx >= 0 ? parseInt(args[pagesIdx + 1] || '5', 10) : 5

async function main() {
  if (!process.env.SCRAPER_API_KEY) { console.error('Falta SCRAPER_API_KEY'); process.exit(1) }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  console.log(`Scrapeando directorio ZonaProp (${COMMIT ? 'COMMIT' : 'DRY-RUN'})...`)
  const stats = await refreshZonaPropMap(supabase, { commit: COMMIT, baseUrl, maxPages, log: m => console.log('  ' + m) })
  console.log('\n=== Resumen ===')
  console.log(`  Avisos: ${stats.avisos} · con match: ${stats.matched} · sin match: ${stats.unmatched}`)
  if (stats.error) console.error(`  ERROR: ${stats.error}`)
  if (COMMIT) console.log(`  Sembradas zonaprop: ${stats.inserted} nuevas, ${stats.updated} actualizadas`)
  else console.log('  (DRY-RUN: no se sembró. Repetí con --commit.)')
  console.log('')
}

main().catch(err => { console.error(err); process.exit(1) })
