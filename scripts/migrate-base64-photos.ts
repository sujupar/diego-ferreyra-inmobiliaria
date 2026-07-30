#!/usr/bin/env tsx
/**
 * Task 8 (.superpowers/sdd/2026-07-31-campana-y-chat-pro/task-8-brief.md):
 * saca las fotos guardadas como base64 DENTRO de `properties.photos` y las
 * sube a Supabase Storage (bucket `property-files`, mismo patrón que
 * app/api/properties/[id]/media/upload-init + commit), reemplazando el
 * elemento del array por la URL pública.
 *
 * Por qué hace falta (A3 de la auditoría, ver también
 * supabase/migrations/20260731000002_vw_properties_list.sql): el listado de
 * propiedades pesaba 21.951 KB por request — 99% eran fotos, y algunas están
 * en base64 DENTRO de la fila (la más larga: 4.439.566 caracteres). La vista
 * ya evita mandar el array completo al navegador, pero el SELECT sigue
 * teniendo que destoastear el array COMPLETO en el servidor para leer
 * `photos[1]` — mientras haya base64 ahí, esa lectura sigue siendo cara. Este
 * script mueve esas fotos a Storage (nunca las borra).
 *
 * REGLA ABSOLUTA: nada se borra. Esto MUEVE (sube a Storage + reemplaza la
 * URL en el array), preservando el ORDEN (photos[0] es la portada en todo el
 * sistema). Antes de tocar una sola fila, siempre volcamos un backup JSON de
 * `id + photos` de TODAS las propiedades a disco (scratchpad, no al repo).
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/migrate-base64-photos.ts               # dry-run (default)
 *   node --env-file=.env.local --import tsx scripts/migrate-base64-photos.ts --commit       # escribe de verdad
 *
 * Idempotente: una foto ya migrada no empieza con 'data:' → una segunda
 * corrida no la vuelve a tocar ni sube nada de nuevo.
 *
 * Si una foto base64 está corrupta (no se puede decodificar), se deja TAL
 * CUAL y se reporta al final — nunca se borra ni se reemplaza por nada.
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const COMMIT = process.argv.includes('--commit')
const BUCKET = 'property-files'

const BACKUP_DIR =
  '/private/tmp/claude-501/-Users-apple-Documents-01--Anti-Gravity-01--Gesti-n---Diego-Ferreyra-Inmobiliaria/63fe1ae4-4cee-4228-8df6-c5ce0669ce7e/scratchpad'

// mime → extensión permitida (mismo set que PHOTO_EXTS en lib/properties/media.ts)
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

const DATA_URL_RE = /^data:([a-zA-Z0-9.+-]+\/[a-zA-Z0-9.+-]+);base64,(.*)$/s
const BASE64_PAYLOAD_RE = /^[A-Za-z0-9+/]*={0,2}$/

interface PropertyRow {
  id: string
  address: string | null
  photos: string[] | null
}

interface ParsedDataUrl {
  ok: true
  mime: string
  ext: string
  buffer: Buffer
}
interface ParsedDataUrlError {
  ok: false
  reason: string
}

export function parseDataUrl(value: string): ParsedDataUrl | ParsedDataUrlError {
  const m = DATA_URL_RE.exec(value)
  if (!m) return { ok: false, reason: 'no matchea el formato data:<mime>;base64,<payload>' }
  const [, mime, payload] = m
  const ext = MIME_TO_EXT[mime.toLowerCase()]
  if (!ext) return { ok: false, reason: `mime no soportado: ${mime}` }
  if (!payload || !BASE64_PAYLOAD_RE.test(payload)) {
    return { ok: false, reason: 'el payload base64 tiene caracteres inválidos (posible corrupción)' }
  }
  let buffer: Buffer
  try {
    buffer = Buffer.from(payload, 'base64')
  } catch (e) {
    return { ok: false, reason: `Buffer.from falló: ${e instanceof Error ? e.message : e}` }
  }
  if (buffer.length === 0) return { ok: false, reason: 'decodificó a 0 bytes' }
  return { ok: true, mime, ext, buffer }
}

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno')
  return createClient(url, key)
}

async function main() {
  console.log(`Modo: ${COMMIT ? 'COMMIT (escribe de verdad)' : 'DRY-RUN (no escribe nada)'}`)
  const supabase = getSupabase()

  // 1) Traer TODAS las propiedades (id + photos) para el backup y el escaneo.
  const { data: allProps, error: fetchErr } = await supabase
    .from('properties')
    .select('id, address, photos')
    .order('created_at', { ascending: true })
  if (fetchErr) throw fetchErr
  const rows = (allProps || []) as PropertyRow[]

  // 2) Backup ANTES de tocar nada — obligatorio, va a scratchpad (no al repo).
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${BACKUP_DIR}/base64-photos-backup-${stamp}.json`
  const backupPayload = {
    generated_at: new Date().toISOString(),
    count: rows.length,
    properties: rows.map((r) => ({ id: r.id, address: r.address, photos: r.photos })),
  }
  writeFileSync(backupPath, JSON.stringify(backupPayload, null, 2), 'utf8')
  if (!existsSync(backupPath)) {
    throw new Error(`No se pudo escribir el backup en ${backupPath} — ABORTANDO antes de tocar nada`)
  }
  console.log(`Backup escrito: ${backupPath} (${rows.length} propiedades)`)

  // 3) Escanear + migrar.
  let totalPhotos = 0
  let totalBase64Found = 0
  let migrated = 0
  const corrupted: Array<{ id: string; address: string | null; index: number; reason: string }> = []
  let propertiesTouched = 0

  for (const prop of rows) {
    const photos = Array.isArray(prop.photos) ? [...prop.photos] : []
    totalPhotos += photos.length
    let changedThisProperty = false

    for (let i = 0; i < photos.length; i++) {
      const item = photos[i]
      if (typeof item !== 'string' || !item.startsWith('data:')) continue
      totalBase64Found++

      const parsed = parseDataUrl(item)
      if (!parsed.ok) {
        corrupted.push({ id: prop.id, address: prop.address, index: i, reason: parsed.reason })
        console.warn(`  CORRUPTA — ${prop.id} (${prop.address}) foto[${i}]: ${parsed.reason} — se deja tal cual`)
        continue
      }

      const path = `properties/${prop.id}/photos/${randomUUID()}.${parsed.ext}`
      console.log(
        `  ${COMMIT ? 'Subiendo' : '[dry-run] subiría'}: ${prop.id} (${prop.address}) foto[${i}] → ${path} (${parsed.buffer.length} bytes, ${parsed.mime})`
      )

      if (!COMMIT) continue

      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, parsed.buffer, { contentType: parsed.mime, upsert: false })
      if (uploadErr) {
        corrupted.push({ id: prop.id, address: prop.address, index: i, reason: `upload falló: ${uploadErr.message}` })
        console.error(`  ERROR subiendo ${prop.id} foto[${i}]: ${uploadErr.message} — se deja tal cual`)
        continue
      }
      const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)
      photos[i] = pub.publicUrl
      changedThisProperty = true
      migrated++
    }

    if (COMMIT && changedThisProperty) {
      // Reemplaza el array COMPLETO preservando el orden — nunca se agregan
      // ni se quitan elementos, solo se reemplazan los que eran base64.
      const { error: updateErr } = await supabase
        .from('properties')
        .update({ photos, updated_at: new Date().toISOString() })
        .eq('id', prop.id)
      if (updateErr) {
        console.error(`  ERROR actualizando fila ${prop.id}: ${updateErr.message}`)
        throw updateErr
      }
      propertiesTouched++
    }
  }

  console.log('\n--- Resumen ---')
  console.log(`Propiedades escaneadas: ${rows.length}`)
  console.log(`Fotos totales: ${totalPhotos}`)
  console.log(`Fotos base64 encontradas: ${totalBase64Found}`)
  console.log(`Fotos migradas${COMMIT ? '' : ' (simulado)'}: ${migrated}`)
  console.log(`Fotos corruptas (se dejaron tal cual): ${corrupted.length}`)
  if (corrupted.length > 0) {
    console.log('Detalle de corruptas:', JSON.stringify(corrupted, null, 2))
  }
  if (COMMIT) console.log(`Propiedades actualizadas en DB: ${propertiesTouched}`)

  // 4) Verificación posterior (solo tiene sentido en modo commit): misma
  // cantidad de fotos por propiedad que antes + 0 elementos 'data:' (salvo
  // las corruptas, que quedan reportadas pero intactas por diseño).
  if (COMMIT) {
    console.log('\n--- Verificación posterior ---')
    const { data: after, error: afterErr } = await supabase.from('properties').select('id, photos')
    if (afterErr) throw afterErr
    const byId = new Map(rows.map((r) => [r.id, Array.isArray(r.photos) ? r.photos.length : 0]))
    let countMismatch = 0
    let remainingBase64 = 0
    for (const r of after || []) {
      const before = byId.get(r.id) ?? 0
      const nowLen = Array.isArray(r.photos) ? r.photos.length : 0
      if (before !== nowLen) {
        countMismatch++
        console.error(`  MISMATCH de cantidad — ${r.id}: antes ${before}, después ${nowLen}`)
      }
      const stillB64 = (Array.isArray(r.photos) ? r.photos : []).filter((p: string) => typeof p === 'string' && p.startsWith('data:')).length
      remainingBase64 += stillB64
    }
    console.log(`Propiedades con cantidad de fotos distinta a antes: ${countMismatch} (debe ser 0)`)
    console.log(`Elementos 'data:' restantes en toda la tabla: ${remainingBase64} (debe ser ${corrupted.filter((c) => !c.reason.startsWith('upload falló')).length} — las corruptas que no se pudieron subir)`)
  }

  console.log(`\nBackup para restaurar si hace falta: ${backupPath}`)
}

// Guard: solo corre main() cuando el archivo se ejecuta directamente (node/tsx),
// nunca al importarlo desde un test (parseDataUrl se testea en aislamiento en
// scripts/migrate-base64-photos.test.ts sin tocar la red).
const isMain = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  main().catch((e) => {
    console.error('Error:', e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
