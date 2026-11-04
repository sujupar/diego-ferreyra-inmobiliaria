/**
 * La etapa de YouTube: abrir la subida, preguntar en qué byte quedó y mandar
 * las partes que entran antes del plazo. Sin red ni base (así se prueba).
 *
 * Contra el video duplicado alcanza con UNA regla: siempre se pregunta primero
 * a la sesión abierta. Una sesión terminada devuelve el video que ya creó; solo
 * una sesión VENCIDA (que nunca terminó) se reemplaza por otra.
 */
import type { EstadoSubidaYt } from '@/lib/integrations/youtube/subida'
import { PLAZO_VENCIDO, vencioElPlazo, type Contexto, type EnvioEnCurso, type Pieza, type ResultadoEtapa } from './redes'

/** 8 MB: múltiplo de 256 KB, como exige YouTube para las partes intermedias. */
export const PARTE_YT = 8 * 1024 * 1024
const TECHO_OPERACION_MS = 4_000
const TECHO_MINIMO_MS = 1_500
/** Si no se indicó plazo, una etapa no trabaja más que esto. */
const PLAZO_POR_DEFECTO_MS = 12_000
const MAX_SESIONES = 3
/** YouTube trata como Short solo lo que dura hasta 3 minutos. */
const TOPE_SHORT_SEG = 180

export interface DepsYoutube {
  ahora(): number
  crearSesion(a: { titulo: string; descripcion: string; total: number; tipo: string }): Promise<string>
  estadoSubida(url: string, total: number): Promise<EstadoSubidaYt>
  leerParte(videoUrl: string, desde: number, hasta: number, techoMs: number): Promise<Uint8Array<ArrayBuffer>>
  subirParte(url: string, desde: number, bytes: Uint8Array<ArrayBuffer>, total: number, techoMs: number): Promise<Exclude<EstadoSubidaYt, { tipo: 'vencida' }>>
  /** Opcional: con qué privacidad quedó. Un proyecto sin auditar hace que YouTube lo deje privado aunque se pida público. */
  privacidad?(videoId: string): Promise<string | null>
}

/** El título que va a YouTube: el escrito, o la primera línea de la descripción, o el nombre del archivo. */
export function tituloParaYoutube(titulo: string, descripcion: string, nombreArchivo: string): string {
  const limpiar = (t: string) => t.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim()
  const escrito = limpiar(titulo)
  if (escrito) return escrito.slice(0, 100)
  const primera = limpiar((descripcion.split('\n').find((l) => l.trim()) ?? '').replace(/#[\p{L}\p{N}_]+/gu, ''))
  if (primera) return primera.slice(0, 100)
  return limpiar(nombreArchivo.replace(/\.[a-z0-9]{2,4}$/i, '')).slice(0, 100) || 'Video'
}

function enlace(videoId: string, duracionSeg: number | null | undefined): string {
  return (duracionSeg ?? 0) > TOPE_SHORT_SEG ? `https://www.youtube.com/watch?v=${videoId}` : `https://www.youtube.com/shorts/${videoId}`
}

export async function avanzarYoutube(envio: EnvioEnCurso, pieza: Pieza, d: DepsYoutube, ctx: Contexto): Promise<ResultadoEtapa> {
  const total = pieza.tamanoBytes ?? 0
  if (!total) return { etapa: envio.etapa, ids: envio.ids_externos, estado: 'fallido', error: 'No se sabe cuánto pesa el video: volvé a subirlo.' }
  const plazo = ctx.plazo ?? d.ahora() + PLAZO_POR_DEFECTO_MS
  const ids: Record<string, unknown> = { ...envio.ids_externos }
  delete ids.reintento
  const publicado = async (videoId: string): Promise<ResultadoEtapa> => {
    let privado = false
    try {
      privado = (await d.privacidad?.(videoId)) === 'private'
    } catch {
      // Solo es para avisar: el video ya está en YouTube.
    }
    return {
      etapa: 'subiendo',
      ids: { ...ids, video_id: videoId, ...(privado ? { privado: true } : {}) },
      estado: 'publicado',
      enlace: enlace(videoId, pieza.duracionSeg),
    }
  }

  let url = typeof ids.upload_url === 'string' ? ids.upload_url : null
  let offset = 0
  if (url) {
    const estado = await d.estadoSubida(url, total)
    if (estado.tipo === 'terminada') return publicado(estado.videoId)
    if (vencioElPlazo(ids, ctx.ahora)) return { etapa: 'subiendo', ids, estado: 'fallido', error: PLAZO_VENCIDO('YouTube') }
    if (estado.tipo === 'vencida') url = null
    else offset = estado.offset
  }
  if (!url) {
    // Abrir la sesión gasta tiempo: si no queda para abrirla con margen, va en la corrida siguiente.
    if (plazo - d.ahora() < 2 * TECHO_MINIMO_MS) return { etapa: envio.etapa, ids, estado: 'en_curso', esperarMs: 0 }
    const sesiones = (typeof ids.sesiones === 'number' ? ids.sesiones : 0) + 1
    if (sesiones > MAX_SESIONES) {
      return { etapa: 'subiendo', ids, estado: 'fallido', error: 'YouTube no terminó de recibir el video. Tocá Reintentar.' }
    }
    url = await d.crearSesion({
      titulo: tituloParaYoutube(pieza.titulo ?? '', pieza.descripcion, pieza.videoUrl.split('/').pop() ?? ''),
      descripcion: pieza.descripcion,
      total,
      tipo: pieza.videoUrl.endsWith('.mov') ? 'video/quicktime' : 'video/mp4',
    })
    Object.assign(ids, { upload_url: url, sesiones, inicio_at: typeof ids.inicio_at === 'string' ? ids.inicio_at : ctx.ahora.toISOString() })
    offset = 0
    // ANTES del primer byte: con la sesión guardada, cualquier corte se resuelve preguntándole a YouTube.
    await ctx.anotarIds?.('subiendo', ids)
  }

  let partes = 0
  while (offset < total) {
    const restante = plazo - d.ahora()
    // Otra parte solo si entran la lectura Y la subida en el peor caso. La primera va siempre que haya un mínimo.
    if (partes > 0 && restante < 2 * TECHO_OPERACION_MS) break
    if (partes === 0 && restante < 2 * TECHO_MINIMO_MS) break
    const techo = Math.min(TECHO_OPERACION_MS, Math.max(TECHO_MINIMO_MS, Math.floor(restante / 2)))
    const hasta = Math.min(offset + PARTE_YT, total) - 1
    const bytes = await d.leerParte(pieza.videoUrl, offset, hasta, techo)
    if (bytes.length !== hasta - offset + 1) throw new Error('No se pudo leer una parte completa del video')
    const r = await d.subirParte(url, offset, bytes, total, techo)
    if (r.tipo === 'terminada') return publicado(r.videoId)
    // YouTube puede quedarse con menos de lo mandado: se sigue desde lo que él confirma.
    offset = r.offset
    partes++
  }
  return { etapa: 'subiendo', ids: { ...ids, subido: offset }, estado: 'en_curso', esperarMs: 0 }
}
