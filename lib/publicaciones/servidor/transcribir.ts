/**
 * Transcripción con tiempos (OpenAI whisper-1). El audio llega ya convertido por
 * el navegador a WAV mono 16 kHz (~32 KB por segundo), así que un video de 10
 * minutos pesa ~19 MB y entra en el tope de 25 MB de la API.
 */
import type { Segmento } from '../tipos'

const TOPE_AUDIO_BYTES = 25 * 1024 * 1024
/** Techo de cada llamada a la IA de Publicaciones. */
export const TECHO_IA_MS = 20_000
export const TARDO_DEMASIADO = 'La IA tardó demasiado en responder. Tocá Reintentar.'

/**
 * Frases que whisper "escucha" sobre música o silencio. Si es lo único que hay,
 * el video no tiene voz: escribir una descripción a partir de eso es inventar.
 */
const ALUCINACIONES = [
  /gracias por ver/i,
  /suscr[ií]bete/i,
  /amara\.org/i,
  /subt[ií]tulos (realizados|por)/i,
  /^\W*subt[ií]tulos?\b/i,
  /^\W*$/,
]

export function segmentosDeWhisper(json: unknown): Segmento[] {
  const segs = (json as { segments?: unknown } | null)?.segments
  if (!Array.isArray(segs)) return []
  return segs
    .map((s: { start?: unknown; end?: unknown; text?: unknown }) => ({
      inicio: Number(s.start) || 0,
      fin: Number(s.end) || 0,
      texto: String(s.text ?? '').trim(),
    }))
    .filter((s) => s.texto.length > 0)
}

/** Una persona hablando dice ~2,5 palabras por segundo; por debajo de esto es música con ruido. */
const MIN_PALABRAS_POR_SEGUNDO = 0.8
/** "SOLOCHILENOS40ALVERNESTO": una palabra larga con números pegados no la dice nadie. */
const PALABRA_INVENTADA = /^(?=.*\p{L})(?=.*\d)[\p{L}\d]{12,}$/u

/**
 * ¿El video tiene a alguien hablando? Las probabilidades de whisper NO sirven para
 * decidirlo (medido el 2026-10-30: su alucinación sobre un tono de 8 s tenía
 * `no_speech_prob` MÁS BAJO que la voz real de Diego). Lo que sí separa es la
 * densidad: cuántas palabras por segundo de audio.
 */
export function tieneVoz(segmentos: Segmento[], duracionSeg?: number | null): boolean {
  const reales = segmentos
    .map((s) => s.texto.replace(/\[[^\]]*\]|\([^)]*\)/g, '').trim())
    .filter((t) => t.length > 0 && !ALUCINACIONES.some((re) => re.test(t)))
  const palabras = reales
    .join(' ')
    .split(/\s+/)
    .map((p) => p.replace(/[^\p{L}\d]/gu, ''))
    .filter((p) => p.length > 0 && !PALABRA_INVENTADA.test(p))
  if (palabras.join('').length < 12) return false
  const duracion = duracionSeg && duracionSeg > 0 ? duracionSeg : Math.max(0, ...segmentos.map((s) => s.fin))
  if (duracion <= 0) return true
  return palabras.length / duracion >= MIN_PALABRAS_POR_SEGUNDO
}

export function textoPlano(segmentos: Segmento[]): string {
  return segmentos.map((s) => s.texto).join(' ')
}

export async function transcribirAudio(wav: Blob): Promise<Segmento[]> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('Falta configurar la clave de OpenAI')
  if (wav.size > TOPE_AUDIO_BYTES) {
    throw new Error('El audio es demasiado largo para transcribir (más de 13 minutos)')
  }
  const form = new FormData()
  form.append('file', wav, 'audio.wav')
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'segment')
  form.append('language', 'es')

  let res: Response
  try {
    res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      // Antes del corte de Netlify (~26 s): así el error es legible y no queda colgado.
      signal: AbortSignal.timeout(TECHO_IA_MS),
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new Error(TARDO_DEMASIADO)
    throw e
  }
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    console.error('[publicaciones] whisper', res.status, JSON.stringify(json).slice(0, 400))
    throw new Error('No se pudo transcribir el audio')
  }
  return segmentosDeWhisper(json)
}
