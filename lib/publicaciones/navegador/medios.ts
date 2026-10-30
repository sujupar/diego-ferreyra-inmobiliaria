/**
 * Miniatura y audio de un video, sacados EN EL NAVEGADOR.
 *
 * Por qué acá y no en el servidor: no hay ffmpeg en Netlify y una función que
 * baje 200 MB para sacar un fotograma se pasa del tiempo. El navegador ya tiene
 * el archivo en la mano y lo decodifica gratis.
 *
 * `fuente` es el archivo elegido o, al retomar una tanda, la URL pública del
 * video ya subido (el bucket es público y sirve CORS).
 */
import { crearTurno } from '../turno'
import { codificarWav } from '../wav'

const FRECUENCIA = 16_000
const ALTO_MAXIMO = 720
const ESPERA_MS = 30_000

function urlDe(fuente: File | string): { url: string; liberar: () => void } {
  if (typeof fuente === 'string') return { url: fuente, liberar: () => {} }
  const url = URL.createObjectURL(fuente)
  return { url, liberar: () => URL.revokeObjectURL(url) }
}

function esperar(el: HTMLMediaElement, evento: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      limpiar()
      reject(new Error('El video tardó demasiado en abrirse'))
    }, ESPERA_MS)
    const ok = () => {
      limpiar()
      resolve()
    }
    const mal = () => {
      limpiar()
      reject(new Error('Este navegador no puede abrir el video'))
    }
    const limpiar = () => {
      clearTimeout(t)
      el.removeEventListener(evento, ok)
      el.removeEventListener('error', mal)
    }
    el.addEventListener(evento, ok, { once: true })
    el.addEventListener('error', mal, { once: true })
  })
}

export async function extraerMiniatura(
  fuente: File | string,
): Promise<{ jpeg: Blob; duracionSeg: number; ancho: number; alto: number }> {
  const { url, liberar } = urlDe(fuente)
  const video = document.createElement('video')
  video.crossOrigin = 'anonymous'
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  try {
    const cargado = esperar(video, 'loadeddata')
    video.src = url
    await cargado
    const duracionSeg = Number.isFinite(video.duration) ? video.duration : 0
    const momento = Math.min(1, duracionSeg * 0.1)
    if (momento > 0) {
      const buscado = esperar(video, 'seeked')
      video.currentTime = momento
      await buscado
    }
    const escala = Math.min(1, ALTO_MAXIMO / (video.videoHeight || ALTO_MAXIMO))
    const ancho = Math.round((video.videoWidth || 405) * escala)
    const alto = Math.round((video.videoHeight || ALTO_MAXIMO) * escala)
    const canvas = document.createElement('canvas')
    canvas.width = ancho
    canvas.height = alto
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No se pudo dibujar la miniatura')
    ctx.drawImage(video, 0, 0, ancho, alto)
    const jpeg = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo armar la miniatura'))), 'image/jpeg', 0.82),
    )
    return { jpeg, duracionSeg, ancho, alto }
  } finally {
    video.removeAttribute('src')
    video.load()
    liberar()
  }
}

/**
 * Audio mono a 16 kHz en WAV. Un video SIN pista de audio no es un error: sale un
 * segundo de silencio y la transcripción lo marca como "sin voz".
 */
const turnoDeAudio = crearTurno()

/** De a un video por vez aunque la cola prepare dos: ver `lib/publicaciones/turno.ts`. */
export function extraerAudio(fuente: File | string): Promise<Blob> {
  return turnoDeAudio(() => extraerAudioAhora(fuente))
}

async function extraerAudioAhora(fuente: File | string): Promise<Blob> {
  const bytes =
    typeof fuente === 'string'
      ? await fetch(fuente).then((r) => {
          if (!r.ok) throw new Error('No se pudo bajar el video para sacar el audio')
          return r.arrayBuffer()
        })
      : await fuente.arrayBuffer()

  const Contexto = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  const ctx = new Contexto()
  let original: AudioBuffer
  try {
    original = await ctx.decodeAudioData(bytes)
  } catch {
    return codificarWav(new Float32Array(FRECUENCIA), FRECUENCIA)
  } finally {
    void ctx.close()
  }

  const largo = Math.max(1, Math.ceil(original.duration * FRECUENCIA))
  const offline = new OfflineAudioContext(1, largo, FRECUENCIA)
  const fuenteAudio = offline.createBufferSource()
  fuenteAudio.buffer = original
  fuenteAudio.connect(offline.destination)
  fuenteAudio.start()
  const remuestreado = await offline.startRendering()
  return codificarWav(remuestreado.getChannelData(0), FRECUENCIA)
}
