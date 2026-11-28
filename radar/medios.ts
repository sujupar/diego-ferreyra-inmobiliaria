// Medios del radar: bajar el reel con la sesión del robot, comprimirlo, subirlo al bucket
// privado `video-refs` para que la plataforma lo reproduzca, y limpiar lo que ya no sirve.

import { execFile } from 'node:child_process'
import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { supabaseAdmin } from './db'

const execFileP = promisify(execFile)

const BUCKET = 'video-refs'
const TIMEOUT_MS = 120_000
const RE_SHORTCODE = /^[A-Za-z0-9_-]{5,40}$/
const DIAS_RETENCION = 120

const ytdlp = () => process.env.RADAR_YTDLP_BIN ?? '/opt/homebrew/bin/yt-dlp'
const ffmpeg = () => process.env.RADAR_FFMPEG_BIN ?? '/opt/homebrew/bin/ffmpeg'

async function correr(bin: string, args: string[]): Promise<void> {
  try {
    await execFileP(bin, args, { timeout: TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024 })
  } catch (e) {
    // El mensaje de execFile incluye los argumentos (con la ruta de cookies, no su contenido): se recorta.
    const err = e as { message?: string; stderr?: string }
    const detalle = (err.stderr ?? err.message ?? 'error').toString().trim().split('\n').slice(-3).join(' | ')
    throw new Error(`${bin.split('/').pop()} falló: ${detalle.slice(0, 400)}`)
  }
}

/**
 * Baja el reel, lo comprime y sube video + portada al bucket.
 *
 * PROPIEDAD DE LOS ARCHIVOS: el mp4 comprimido (`mp4Local`) queda en disco para que la
 * Task 7 saque cuadros y transcripción; lo BORRA el orquestador cuando termina. Acá se
 * borra solo la descarga cruda. El archivo de cookies es del que llama: nunca se toca.
 */
export async function bajarYSubir(
  shortcode: string,
  cookiesPath: string,
): Promise<{ videoPath: string; portadaPath: string | null; mp4Local: string }> {
  if (!RE_SHORTCODE.test(shortcode)) throw new Error(`shortcode inválido: ${JSON.stringify(shortcode)}`)

  const dir = join(homedir(), '.radar-referencias', 'tmp', `medios-${shortcode}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true, mode: 0o700 })
  const crudo = join(dir, 'crudo.mp4')
  const comprimido = join(dir, 'video.mp4')
  const portada = join(dir, 'portada.jpg')

  try {
    await correr(ytdlp(), [
      '--cookies', cookiesPath,
      '-f', 'best[ext=mp4]/best',
      '--no-playlist',
      '-o', crudo,
      `https://www.instagram.com/reel/${shortcode}/`,
    ])
    await correr(ffmpeg(), [
      '-y', '-i', crudo,
      '-vf', "scale='if(gt(iw,ih),1280,-2)':'if(gt(iw,ih),-2,1280)'",
      '-c:v', 'libx264', '-crf', '28', '-preset', 'veryfast',
      '-c:a', 'aac', '-b:a', '96k',
      '-movflags', '+faststart',
      comprimido,
    ])
  } catch (e) {
    rmSync(dir, { recursive: true, force: true })
    throw e
  }
  rmSync(crudo, { force: true })

  // La portada es accesoria: si falla, el video igual sirve.
  let hayPortada = true
  try {
    await correr(ffmpeg(), ['-y', '-ss', '1', '-i', comprimido, '-frames:v', '1', '-q:v', '3', portada])
    if (statSync(portada).size === 0) hayPortada = false
  } catch {
    hayPortada = false
  }

  const sb = supabaseAdmin()
  const videoPath = `radar/${shortcode}.mp4`
  const { error: errV } = await sb.storage
    .from(BUCKET)
    .upload(videoPath, readFileSync(comprimido), { contentType: 'video/mp4', upsert: true })
  if (errV) throw new Error(`no se pudo subir el video: ${errV.message}`)

  let portadaPath: string | null = null
  if (hayPortada) {
    const ruta = `radar/${shortcode}.jpg`
    const { error: errP } = await sb.storage
      .from(BUCKET)
      .upload(ruta, readFileSync(portada), { contentType: 'image/jpeg', upsert: true })
    if (errP) console.warn(`[medios] portada no subida (${shortcode}): ${errP.message}`)
    else portadaPath = ruta
  }
  rmSync(portada, { force: true })

  return { videoPath, portadaPath, mp4Local: comprimido }
}

// ---------- retención ----------

export type FilaRetencion = {
  id: string
  video_storage_path: string | null
  oculta: boolean
  no_sirve_at: string | null
  estado_uso: string
  created_at: string
}

/**
 * Filas cuyo video hay que borrar: ocultas, marcadas "no sirve", o con más de 120 días y
 * sin usar. Una referencia `usada` (o en curso) se conserva aunque sea vieja.
 */
export function filasParaLimpiar(filas: FilaRetencion[], ahora: Date = new Date()): FilaRetencion[] {
  const corte = ahora.getTime() - DIAS_RETENCION * 86_400_000
  return filas.filter((f) => {
    if (!f.video_storage_path) return false
    if (f.oculta || f.no_sirve_at) return true
    return f.estado_uso === 'sin_usar' && new Date(f.created_at).getTime() < corte
  })
}

/** Borra del Storage los videos que ya no sirven y anula la columna. Devuelve cuántos. */
export async function limpiarRetencion(): Promise<number> {
  const sb = supabaseAdmin()
  const { data, error } = await sb
    .from('video_refs')
    .select('id, video_storage_path, oculta, no_sirve_at, estado_uso, created_at')
    .eq('fuente', 'radar')
    .not('video_storage_path', 'is', null)
  if (error) throw new Error(`retención: no se pudo leer video_refs: ${error.message}`)

  const aBorrar = filasParaLimpiar((data ?? []) as FilaRetencion[])
  let borradas = 0
  for (let i = 0; i < aBorrar.length; i += 50) {
    const lote = aBorrar.slice(i, i + 50)
    const rutas = lote.flatMap((f) => {
      const v = f.video_storage_path as string
      return [v, v.replace(/\.mp4$/, '.jpg')]
    })
    const { error: errR } = await sb.storage.from(BUCKET).remove(rutas)
    if (errR) throw new Error(`retención: no se pudo borrar del Storage: ${errR.message}`)
    const { error: errU } = await sb
      .from('video_refs')
      .update({ video_storage_path: null })
      .in('id', lote.map((f) => f.id))
    if (errU) throw new Error(`retención: no se pudo anular la columna: ${errU.message}`)
    borradas += lote.length
  }
  return borradas
}
