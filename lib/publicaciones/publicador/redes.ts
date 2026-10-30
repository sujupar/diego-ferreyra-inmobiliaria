/**
 * Una etapa de un envío, por red. Las llamadas a Meta entran como dependencias
 * (así se prueba sin red); el que escribe en la base es el runner.
 *
 * Regla de oro, en las dos redes: antes de PUBLICAR se mira si ya está
 * publicado. Si la función murió entre publicar y guardar, la corrida siguiente
 * lo reconoce y lo marca, sin un segundo post.
 */
import type { EstadoContenedor } from '@/lib/integrations/instagram/publicar'
import type { EstadoReelFb } from '@/lib/integrations/facebook/reels'

export interface EnvioEnCurso {
  etapa: string | null
  ids_externos: Record<string, unknown>
}

export interface Pieza {
  videoUrl: string
  descripcion: string
  duracionSeg?: number | null
}

/** La API de Reels de Facebook solo acepta de 3 a 90 segundos. */
export const MAX_REEL_FB_SEG = 90

export interface ResultadoEtapa {
  etapa: string | null
  ids: Record<string, unknown>
  estado: 'en_curso' | 'publicado' | 'fallido'
  enlace?: string | null
  /** Cuánto esperar antes de la etapa siguiente (Meta procesa el video entre medio). */
  esperarMs?: number
  /** Motivo legible cuando `estado = 'fallido'`. */
  error?: string
}

const UN_MINUTO = 60_000

export interface DepsInstagram {
  crearContenedor: (a: { videoUrl: string; descripcion: string }) => Promise<string>
  estadoContenedor: (creationId: string) => Promise<EstadoContenedor>
  publicarContenedor: (creationId: string) => Promise<{ igMediaId: string; permalink: string | null }>
}

export async function avanzarInstagram(envio: EnvioEnCurso, pieza: Pieza, d: DepsInstagram): Promise<ResultadoEtapa> {
  const creationId = typeof envio.ids_externos.creation_id === 'string' ? envio.ids_externos.creation_id : null
  if (envio.etapa === null || !creationId) {
    const id = await d.crearContenedor({ videoUrl: pieza.videoUrl, descripcion: pieza.descripcion })
    return { etapa: 'contenedor', ids: { creation_id: id }, estado: 'en_curso', esperarMs: UN_MINUTO }
  }

  const estado = await d.estadoContenedor(creationId)
  switch (estado) {
    case 'YA_PUBLICADO':
      return { etapa: 'contenedor', ids: envio.ids_externos, estado: 'publicado', enlace: null }
    case 'LISTO': {
      const pub = await d.publicarContenedor(creationId)
      return { etapa: 'contenedor', ids: { ...envio.ids_externos, media_id: pub.igMediaId }, estado: 'publicado', enlace: pub.permalink }
    }
    case 'ERROR':
      return {
        etapa: 'contenedor',
        ids: envio.ids_externos,
        estado: 'fallido',
        error: 'Instagram no pudo procesar el video (revisá el formato o la duración: hasta 15 minutos).',
      }
    case 'VENCIDO':
      // Un contenedor sin publicar vence a las 24 h: se arma uno nuevo.
      return { etapa: null, ids: {}, estado: 'en_curso', esperarMs: 0 }
    default:
      return { etapa: 'contenedor', ids: envio.ids_externos, estado: 'en_curso', esperarMs: UN_MINUTO }
  }
}

export interface DepsFacebook {
  iniciar: () => Promise<string>
  subir: (videoId: string, url: string) => Promise<void>
  publicar: (videoId: string, descripcion: string) => Promise<void>
  /** Video normal de la Página, en un solo paso (para los de más de 90 s). */
  videoComun: (url: string, descripcion: string) => Promise<string>
  estado: (videoId: string) => Promise<{ estado: EstadoReelFb; enlace: string | null }>
}

const ERROR_FB = 'Facebook no pudo procesar el video (revisá el formato: vertical, de 3 a 90 segundos).'

export async function avanzarFacebook(envio: EnvioEnCurso, pieza: Pieza, d: DepsFacebook): Promise<ResultadoEtapa> {
  const videoId = typeof envio.ids_externos.video_id === 'string' ? envio.ids_externos.video_id : null
  if (envio.etapa === null || !videoId) {
    if (envio.etapa !== null && !videoId) return { etapa: null, ids: {}, estado: 'en_curso', esperarMs: 0 }
    if ((pieza.duracionSeg ?? 0) > MAX_REEL_FB_SEG) {
      const id = await d.videoComun(pieza.videoUrl, pieza.descripcion)
      return { etapa: 'publicando', ids: { video_id: id, tipo: 'video' }, estado: 'en_curso', esperarMs: UN_MINUTO }
    }
    const id = await d.iniciar()
    return { etapa: 'iniciado', ids: { video_id: id }, estado: 'en_curso', esperarMs: 0 }
  }

  if (envio.etapa === 'iniciado') {
    await d.subir(videoId, pieza.videoUrl)
    return { etapa: 'subido', ids: envio.ids_externos, estado: 'en_curso', esperarMs: 30_000 }
  }

  const actual = await d.estado(videoId)
  if (actual.estado === 'publicado') {
    return { etapa: envio.etapa, ids: envio.ids_externos, estado: 'publicado', enlace: actual.enlace }
  }
  if (actual.estado === 'error') {
    return { etapa: envio.etapa, ids: envio.ids_externos, estado: 'fallido', error: ERROR_FB }
  }
  if (envio.etapa === 'subido') {
    await d.publicar(videoId, pieza.descripcion)
    return { etapa: 'publicando', ids: envio.ids_externos, estado: 'en_curso', esperarMs: UN_MINUTO }
  }
  return { etapa: envio.etapa, ids: envio.ids_externos, estado: 'en_curso', esperarMs: UN_MINUTO }
}
