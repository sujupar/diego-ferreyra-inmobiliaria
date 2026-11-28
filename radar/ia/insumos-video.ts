// Insumos del análisis a fondo: Claude no mira video, así que el reel se le pasa como
// cuadros (en orden, el primero ≈ el gancho) + la transcripción local con whisper.
import { execFile } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const ffmpeg = () => process.env.RADAR_FFMPEG_BIN ?? '/opt/homebrew/bin/ffmpeg'
const ffprobe = () => process.env.RADAR_FFPROBE_BIN ?? '/opt/homebrew/bin/ffprobe'
const whisper = () => process.env.RADAR_WHISPER_BIN ?? '/opt/homebrew/bin/whisper-cli'
const modeloWhisper = () =>
  process.env.RADAR_WHISPER_MODELO ?? join(homedir(), '.cache/whisper/ggml-large-v3-turbo.bin')

const TIMEOUT_FRAMES_MS = 60_000
const TIMEOUT_TRANSCRIPCION_MS = 180_000

/** Corre un binario sin shell y devuelve stdout. Inyectable para las pruebas. */
export type Ejecutar = (bin: string, args: string[], timeoutMs: number) => Promise<string>

const ejecutarReal: Ejecutar = (bin, args, timeoutMs) =>
  new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (e, stdout, stderr) => {
      if (!e) return resolve(String(stdout))
      const detalle = String(stderr || e.message).trim().split('\n').slice(-3).join(' | ')
      reject(new Error(`${bin.split('/').pop()} falló: ${detalle.slice(0, 400)}`))
    })
  })

/**
 * Segundos de los `n` cuadros: el primero a 0,5 s (ahí está el gancho) y el último medio
 * segundo antes del final, parejos en el medio. En videos de menos de 1 s se comprime.
 */
export function tiemposFrames(duracionSeg: number, n: number): number[] {
  if (!Number.isFinite(duracionSeg) || duracionSeg <= 0) throw new Error(`duración inválida: ${duracionSeg}`)
  if (!Number.isInteger(n) || n < 1) throw new Error(`cantidad de cuadros inválida: ${n}`)
  const margen = Math.min(0.5, duracionSeg / 4)
  const inicio = margen
  const fin = duracionSeg - margen
  if (n === 1 || fin <= inicio) return [inicio]
  const paso = (fin - inicio) / (n - 1)
  return Array.from({ length: n }, (_, i) => inicio + i * paso)
}

// Lado largo a 720 px como máximo (sin agrandar si el video ya es chico).
const ESCALA_720 = "scale='if(gt(iw,ih),min(720,iw),-2)':'if(gt(iw,ih),-2,min(720,ih))'"

export function argsFrame(mp4: string, seg: number, salida: string): string[] {
  // -ss antes de -i: busca por keyframe y es casi instantáneo.
  return ['-y', '-v', 'error', '-ss', seg.toFixed(3), '-i', mp4, '-frames:v', '1', '-vf', ESCALA_720, '-q:v', '3', salida]
}

export function argsAudio(mp4: string, wav: string): string[] {
  return ['-y', '-v', 'error', '-i', mp4, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]
}

export function argsWhisper(modelo: string, wav: string, salidaSinExtension: string): string[] {
  // -otxt + -of: texto plano a un archivo; -nt sin marcas de tiempo; -np sin el log.
  return ['-m', modelo, '-l', 'es', '-nt', '-np', '-otxt', '-of', salidaSinExtension, '-f', wav]
}

/** Saca las marcas de no-habla de whisper ([Música], [BLANK_AUDIO], (risas)…) y junta espacios. */
export function limpiarTranscripcion(texto: string): string {
  return texto
    .replace(/\[[^\]\n]*\]/g, ' ')
    .replace(/\([^)\n]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function duracion(mp4: string, ejecutar: Ejecutar): Promise<number> {
  const out = await ejecutar(
    ffprobe(),
    ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', mp4],
    TIMEOUT_FRAMES_MS,
  )
  return Number.parseFloat(out.trim())
}

/** `n` cuadros JPEG en orden cronológico: `destino/frame-01.jpg`… Devuelve las rutas. */
export async function extraerFrames(
  mp4Local: string,
  destino: string,
  n = 8,
  deps: { ejecutar?: Ejecutar } = {},
): Promise<string[]> {
  const ejecutar = deps.ejecutar ?? ejecutarReal
  mkdirSync(destino, { recursive: true, mode: 0o700 })
  const tiempos = tiemposFrames(await duracion(mp4Local, ejecutar), n)
  const rutas: string[] = []
  for (const [i, t] of tiempos.entries()) {
    const ruta = join(destino, `frame-${String(i + 1).padStart(2, '0')}.jpg`)
    await ejecutar(ffmpeg(), argsFrame(mp4Local, t, ruta), TIMEOUT_FRAMES_MS)
    rutas.push(ruta)
  }
  return rutas
}

/** Transcripción en castellano, texto plano. Sin pista de audio o sin habla: `''`. */
export async function transcribir(
  mp4Local: string,
  destino: string,
  deps: { ejecutar?: Ejecutar } = {},
): Promise<string> {
  const ejecutar = deps.ejecutar ?? ejecutarReal
  const pistas = await ejecutar(
    ffprobe(),
    ['-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', mp4Local],
    TIMEOUT_FRAMES_MS,
  )
  if (!pistas.trim()) return ''

  mkdirSync(destino, { recursive: true, mode: 0o700 })
  const wav = join(destino, 'audio.wav')
  const salida = join(destino, 'transcripcion')
  try {
    await ejecutar(ffmpeg(), argsAudio(mp4Local, wav), TIMEOUT_TRANSCRIPCION_MS)
    await ejecutar(whisper(), argsWhisper(modeloWhisper(), wav, salida), TIMEOUT_TRANSCRIPCION_MS)
    const txt = `${salida}.txt`
    return existsSync(txt) ? limpiarTranscripcion(readFileSync(txt, 'utf8')) : ''
  } finally {
    rmSync(wav, { force: true })
    rmSync(`${salida}.txt`, { force: true })
  }
}
