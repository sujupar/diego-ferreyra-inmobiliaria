#!/usr/bin/env tsx
/**
 * Importación masiva de propiedades YA captadas (pre-software) desde el CSV de
 * la inmobiliaria. Las sube como CAPTADAS (status='approved' + legal_status='approved'),
 * asignadas a su asesor, con flags `legal_docs_pending=true` (faltan archivos legales)
 * y `origin_pending=true` (falta asignar origen). NO dispara emails ni auto-publica
 * (INSERT directo vía service role; los triggers de captación están desactivados).
 * Marca el aviso de cada portal como 'published' para que el worker NO lo re-publique.
 *
 * Idempotente por ID Zonaprop (columna import_external_id): re-correr actualiza, no duplica.
 *
 * Requisitos: migración 20260625000001_property_import_flags.sql aplicada.
 *
 * Uso:
 *   npx tsx scripts/import-precaptadas.ts --file scripts/data/precaptadas.csv            # dry-run
 *   npx tsx scripts/import-precaptadas.ts --file scripts/data/precaptadas.csv --commit
 *   (opcional: --limit N  |  --fallback-owner = asignar asesores no resueltos al dueño)
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

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
const FALLBACK_OWNER = args.includes('--fallback-owner')
const fileIdx = args.indexOf('--file')
const FILE = fileIdx >= 0 ? args[fileIdx + 1] : 'scripts/data/precaptadas.csv'
const limIdx = args.indexOf('--limit')
const LIMIT = limIdx >= 0 ? parseInt(args[limIdx + 1] || '0', 10) : 0

// --- CSV parser robusto (campos entre comillas, comas y saltos embebidos) ----
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.length > 1 || row[0] !== '') rows.push(row)
      row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

function norm(h: string): string {
  return (h ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}
const truthy = (v: string) => /^(s[ií]|si|x|true|1)$/i.test((v ?? '').trim())

function parseNum(v: string): number | null {
  const digits = (v ?? '').replace(/[^\d]/g, '')
  if (!digits) return null
  const n = parseInt(digits, 10)
  return Number.isFinite(n) ? n : null
}
function parsePhotos(all: string, cover: string): string[] {
  const urls = (all ?? '').split(/\s*[|\n]\s*/).map(s => s.trim()).filter(u => /^https?:\/\//i.test(u))
  const out: string[] = []
  const push = (u: string) => { const t = u.trim(); if (t && /^https?:\/\//i.test(t) && !out.includes(t)) out.push(t) }
  if (cover) push(cover) // portada primero (photos[0] = miniatura, regla del proyecto)
  for (const u of urls) push(u)
  return out
}
function safeHttps(v: string): string | null {
  const t = (v ?? '').trim()
  return /^https:\/\//i.test(t) ? t : null // XSS: solo https (regla CLAUDE.md)
}
function mapPropertyType(v: string): string {
  const t = norm(v)
  if (t.includes('terreno') || t.includes('lote')) return 'terreno'
  if (t === 'ph' || t.includes('ph')) return 'ph'
  if (t.includes('casa')) return 'casa'
  return 'departamento'
}
function mapOperation(v: string): string {
  return norm(v).includes('alquiler') ? 'alquiler' : 'venta'
}
function mapCurrency(v: string): string {
  return /ars|peso|\$\s*$/i.test((v ?? '').trim()) && !/u\$s|usd|d[oó]lar/i.test(v) ? 'ARS' : 'USD'
}

const AMENITY_COLS: Array<[RegExp, string]> = [
  [/^pileta$/, 'pileta'], [/^parrilla$/, 'parrilla'], [/^hidromasaje$/, 'hidromasaje'],
  [/^gimnasio$/, 'gimnasio'], [/^solarium$/, 'solarium'], [/juegos/, 'sala_de_juegos'],
  [/aire acondicionado/, 'aire_acondicionado'], [/mov reducida|acceso mov/, 'acceso_movilidad_reducida'],
]

interface Prop {
  external_id: string
  advisorName: string
  record: Record<string, unknown>
  zpUrl: string | null
  warnings: string[]
}

async function resolveAdvisors(sb: SupabaseClient) {
  const { data } = await sb.from('profiles').select('id, full_name, email, role').eq('is_active', true)
  const profs = (data ?? []) as Array<{ id: string; full_name: string | null; email: string | null; role: string }>
  const owner = profs.find(p => p.role === 'dueno') ?? null
  const resolve = (name: string): { id: string | null; resolved: boolean } => {
    const n = norm(name)
    if (!n) return { id: null, resolved: false }
    const byName = profs.find(p => norm(p.full_name ?? '').includes(n) || n.includes(norm(p.full_name ?? '').split(' ')[0] || '###'))
    if (byName) return { id: byName.id, resolved: true }
    if (n.includes('diego')) { const d = profs.find(p => p.role === 'dueno'); if (d) return { id: d.id, resolved: true } }
    if (n.includes('lucas')) { const l = profs.find(p => p.role === 'asesor'); if (l) return { id: l.id, resolved: true } }
    return { id: null, resolved: false }
  }
  return { owner, resolve }
}

async function main() {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const abs = path.resolve(process.cwd(), FILE)
  if (!fs.existsSync(abs)) { console.error(`No existe el CSV: ${abs}\nColocá el archivo ahí o pasá --file <ruta>.`); process.exit(1) }
  let content = fs.readFileSync(abs, 'utf-8')
  if (/Ã[©³±¡º¼½]/.test(content)) { content = Buffer.from(content, 'latin1').toString('utf8'); console.log('(corregí mojibake del CSV)') }

  const grid = parseCsv(content)
  if (grid.length < 2) { console.error('CSV vacío'); process.exit(1) }
  const headers = grid[0].map(norm)
  const col = (pred: (h: string) => boolean) => headers.findIndex(pred)
  const idx = {
    ext: col(h => h === 'id zonaprop'),
    advisor: col(h => h.includes('asignado')),
    type: col(h => h === 'tipo'),
    op: col(h => h.includes('operacion')),
    title: col(h => h.includes('titulo')),
    address: col(h => h.includes('direccion')),
    barrio: col(h => h === 'barrio'),
    city: col(h => h.includes('localidad')),
    currency: col(h => h === 'moneda'),
    price: col(h => h === 'precio'),
    expensas: col(h => h.includes('expensas') && h.includes('ars')),
    total: col(h => h.includes('sup total')),
    covered: col(h => h.includes('sup cubierta')),
    rooms: col(h => h.includes('ambientes')),
    beds: col(h => h.includes('dormitorios')),
    baths: col(h => h.includes('bano')),
    garages: col(h => h.includes('cocheras')),
    floor: col(h => h.includes('pisos del edificio')),
    age: col(h => h.includes('antiguedad')),
    photos: col(h => h.includes('todas las urls') || h.includes('descargables') || (h.includes('imagenes') && h.includes('publicas'))),
    cover: col(h => h.includes('url portada')),
    video: col(h => h.includes('video')),
    tour: col(h => h.includes('recorrido')),
    pubUrl: col(h => h.includes('url publicacion') || (h.includes('publicacion') && h.includes('zonaprop'))),
    desc: col(h => h.includes('descripcion')),
  }
  if (idx.ext < 0 || idx.address < 0 || idx.advisor < 0) {
    console.error('No encontré columnas clave (ID Zonaprop / Dirección / Asignado a). Headers:', headers.join(' | ')); process.exit(1)
  }
  const get = (r: string[], i: number) => (i >= 0 ? (r[i] ?? '').trim() : '')

  const { owner, resolve } = await resolveAdvisors(sb)
  const dataRows = grid.slice(1).filter(r => get(r, idx.address))
  const rows = LIMIT > 0 ? dataRows.slice(0, LIMIT) : dataRows

  const props: Prop[] = []
  const unresolvedAdvisors = new Set<string>()
  for (const r of rows) {
    const advisorName = get(r, idx.advisor)
    const adv = resolve(advisorName)
    let assigned = adv.id
    const warnings: string[] = []
    if (!adv.resolved) {
      unresolvedAdvisors.add(advisorName || '(vacío)')
      if (FALLBACK_OWNER && owner) { assigned = owner.id; warnings.push(`asesor "${advisorName}" no existe → asignado al dueño (temporal)`) }
      else assigned = null
    }
    const amenities: string[] = []
    for (const [re, slug] of AMENITY_COLS) {
      const ci = headers.findIndex(h => re.test(h))
      if (ci >= 0 && truthy(get(r, ci))) amenities.push(slug)
    }
    const photos = parsePhotos(get(r, idx.photos), get(r, idx.cover))
    if (photos.length === 0) warnings.push('sin fotos')
    const tour = safeHttps(get(r, idx.tour))
    if (idx.tour >= 0 && get(r, idx.tour) && !tour) warnings.push('recorrido 360 no es https → omitido')
    const price = parseNum(get(r, idx.price))
    if (!price) warnings.push('sin precio')

    const record: Record<string, unknown> = {
      address: get(r, idx.address),
      neighborhood: get(r, idx.barrio) || get(r, idx.city) || null,
      city: get(r, idx.city) || 'CABA',
      property_type: mapPropertyType(get(r, idx.type)),
      operation_type: mapOperation(get(r, idx.op)),
      title: get(r, idx.title) || get(r, idx.address),
      asking_price: price,
      currency: mapCurrency(get(r, idx.currency)),
      commission_percentage: 0,
      rooms: parseNum(get(r, idx.rooms)),
      bedrooms: parseNum(get(r, idx.beds)),
      bathrooms: parseNum(get(r, idx.baths)),
      garages: parseNum(get(r, idx.garages)),
      covered_area: parseNum(get(r, idx.covered)),
      total_area: parseNum(get(r, idx.total)),
      floor: parseNum(get(r, idx.floor)),
      age: parseNum(get(r, idx.age)),
      expensas: parseNum(get(r, idx.expensas)),
      amenities,
      photos,
      description: (get(r, idx.desc) || '').replace(/\s*\/\s*/g, '\n').trim() || null,
      video_url: (idx.video >= 0 && /^https?:\/\//i.test(get(r, idx.video))) ? get(r, idx.video) : null,
      tour_3d_url: tour,
      status: 'approved',
      legal_status: 'approved',
      legal_reviewed_at: new Date().toISOString(),
      legal_notes: 'Importación masiva CSV (pre-captada) 2026-06-25',
      origin: null,
      assigned_to: assigned,
      created_by: owner?.id ?? null,
      import_source: 'csv_precaptada',
      import_external_id: get(r, idx.ext),
      legal_docs_pending: true,
      origin_pending: true,
    }
    props.push({ external_id: get(r, idx.ext), advisorName, record, zpUrl: get(r, idx.pubUrl) || null, warnings })
  }

  // --- Reporte ---
  console.log(`\n${COMMIT ? '✍️  COMMIT' : '🔎 DRY-RUN'} — ${props.length} propiedades desde ${FILE}\n`)
  for (const p of props) {
    const r = p.record
    console.log(`  [${p.external_id}] ${r.address} · ${r.property_type}/${r.operation_type} · ${r.currency} ${r.asking_price ?? '—'} · ${(r.photos as string[]).length} fotos · → ${p.advisorName}${(r.assigned_to ? '' : ' ⚠️ SIN ASIGNAR')}${p.warnings.length ? '  ⚠️ ' + p.warnings.join('; ') : ''}`)
  }

  if (unresolvedAdvisors.size > 0) {
    console.log(`\n⚠️  Asesores no encontrados en el sistema: ${[...unresolvedAdvisors].join(', ')}`)
    if (!FALLBACK_OWNER) console.log('   (sus propiedades quedan SIN asignar. Invitá al asesor, o corré con --fallback-owner para asignarlas al dueño temporalmente.)')
  }

  if (!COMMIT) {
    console.log(`\nDRY-RUN: no se escribió nada. Revisá el mapeo y repetí con --commit.\n`)
    return
  }

  // --- Commit: upsert select-then-insert/update por import_external_id ---
  let inserted = 0, updated = 0, errors = 0, listings = 0
  for (const p of props) {
    if (!p.external_id) { console.error(`  ✗ fila sin ID Zonaprop (${p.record.address}) — omitida`); errors++; continue }
    const { data: ex } = await sb.from('properties').select('id').eq('import_external_id', p.external_id).maybeSingle()
    let propId: string | null = null
    if (ex) {
      const { error } = await sb.from('properties').update(p.record).eq('id', ex.id)
      if (error) { console.error(`  ✗ update ${p.external_id}: ${error.message}`); errors++; continue }
      propId = ex.id; updated++; console.log(`  ↻ ${p.external_id} ${p.record.address}`)
    } else {
      const { data: ins, error } = await sb.from('properties').insert(p.record).select('id').single()
      if (error) { console.error(`  ✗ insert ${p.external_id}: ${error.message}`); errors++; continue }
      propId = ins.id; inserted++; console.log(`  + ${p.external_id} ${p.record.address}`)
    }
    // Marcar el aviso de Zonaprop como YA publicado (el worker no lo toca).
    if (propId && p.zpUrl) {
      const { error: zerr } = await sb.from('property_listings').upsert({
        property_id: propId, portal: 'zonaprop', status: 'published',
        external_id: p.external_id, external_url: p.zpUrl,
        last_published_at: new Date().toISOString(), attempts: 1, last_error: null,
        metadata: { imported: true, source: 'csv_precaptada' },
      }, { onConflict: 'property_id,portal' })
      if (!zerr) listings++
      else console.error(`  (listing ${p.external_id}: ${zerr.message})`)
    }
  }
  console.log(`\nListo: ${inserted} insertadas, ${updated} actualizadas, ${listings} avisos marcados publicados, ${errors} errores.\n`)
}

main().catch(e => { console.error(e); process.exit(1) })
