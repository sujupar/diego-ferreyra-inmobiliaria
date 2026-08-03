/**
 * Migra el recorrido de YouTube a un ARCHIVO propio, por propiedad.
 *
 * POR QUÉ: las 41 propiedades tenían el recorrido como link de YouTube. Eso
 * trajo dos problemas verificados en un teléfono real el 2026-08-03:
 *   1. YouTube puede BLOQUEAR la reproducción embebida por la música del video
 *      (caso real: "LatinAutor - UMPG bloqueó su reproducción en este sitio
 *      web"). El cliente llega a la página del recorrido y no ve nada. No
 *      depende del navegador: pasa en cualquier sitio que no sea YouTube.
 *   2. Con el video como archivo propio se puede mandar DIRECTO por WhatsApp,
 *      sin sacar a la persona de la conversación — que es donde después el
 *      agente coordina la visita.
 *
 * Qué hace: sube el archivo ya descargado y convertido a Storage
 * (`property-files`, MISMO bucket y MISMA convención de path que la subida
 * manual desde la ficha: `properties/{id}/video/{uuid}.mp4`) y setea
 * `properties.video_file_url`.
 *
 * NO toca `video_url` (el link de YouTube): queda como estaba, porque lo
 * consumen los portales, que esperan un enlace tipo YouTube. Son dos campos con
 * dos propósitos distintos — ver CLAUDE.md, "Multimedia de propiedad captada".
 *
 * Idempotente: una propiedad que ya tiene `video_file_url` se saltea.
 *
 * Uso:
 *   node --env-file=.env.local --import tsx scripts/migrate-youtube-to-file.ts --dir <carpeta>          # dry-run
 *   node --env-file=.env.local --import tsx scripts/migrate-youtube-to-file.ts --dir <carpeta> --commit
 *
 * La carpeta tiene un `<idDeYouTube>.mp4` por video (los baja
 * `yt-dlp` + `ffmpeg` aparte; no se descarga nada desde acá).
 */
import { readFileSync, existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'property-files'

function youtubeId(url: string): string | null {
  const m = url.match(/[?&]v=([A-Za-z0-9_-]{6,})/) || url.match(/youtu\.be\/([A-Za-z0-9_-]{6,})/)
  return m ? m[1] : null
}

async function main() {
  const commit = process.argv.includes('--commit')
  const dirIdx = process.argv.indexOf('--dir')
  const dir = dirIdx > -1 ? process.argv[dirIdx + 1] : null
  if (!dir) throw new Error('Falta --dir <carpeta con los .mp4>')

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const { data, error } = await sb
    .from('properties')
    .select('id, address, video_url, video_file_url')
    .not('video_url', 'is', null)
    .order('address')
  if (error) throw new Error(`No se pudieron leer las propiedades: ${error.message}`)

  const rows = (data ?? []) as Array<{ id: string; address: string; video_url: string | null; video_file_url: string | null }>
  let subidos = 0, salteados = 0, sinArchivo = 0

  for (const p of rows) {
    const etiqueta = p.address.slice(0, 42).padEnd(44)
    if (p.video_file_url) { console.log(`= ${etiqueta} ya tenía archivo`); salteados++; continue }
    const vid = youtubeId(p.video_url ?? '')
    const file = vid ? `${dir.replace(/\/+$/, '')}/${vid}.mp4` : null
    if (!vid || !file || !existsSync(file)) {
      console.log(`! ${etiqueta} sin archivo local para ${vid ?? p.video_url}`)
      sinArchivo++
      continue
    }
    const bytes = readFileSync(file)
    const path = `properties/${p.id}/video/${randomUUID()}.mp4`
    if (!commit) {
      console.log(`~ ${etiqueta} subiría ${(bytes.length / 1024 / 1024).toFixed(1)} MB → ${path}`)
      subidos++
      continue
    }
    const up = await sb.storage.from(BUCKET).upload(path, bytes, { contentType: 'video/mp4', upsert: false })
    if (up.error) { console.log(`✗ ${etiqueta} error al subir: ${up.error.message}`); continue }
    const { data: pub } = sb.storage.from(BUCKET).getPublicUrl(path)
    const upd = await sb.from('properties').update({ video_file_url: pub.publicUrl }).eq('id', p.id)
    if (upd.error) { console.log(`✗ ${etiqueta} subió pero no se pudo guardar: ${upd.error.message}`); continue }
    console.log(`✓ ${etiqueta} ${(bytes.length / 1024 / 1024).toFixed(1)} MB`)
    subidos++
  }

  console.log(`\n${commit ? 'SUBIDOS' : 'SE SUBIRÍAN'}: ${subidos} · ya tenían: ${salteados} · sin archivo local: ${sinArchivo}`)
  if (!commit) console.log('Dry-run. Volvé a correr con --commit para hacerlo de verdad.')
}
main().catch(e => { console.error('Error:', e instanceof Error ? e.message : e); process.exit(1) })
