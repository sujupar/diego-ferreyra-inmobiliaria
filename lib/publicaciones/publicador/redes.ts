/**
 * Una etapa de un envío, por red. Las llamadas a Meta entran como dependencias
 * (así se prueba sin red); el que escribe en la base es el runner.
 *
 * TRES reglas contra el post duplicado (revisión adversarial de la fase 2):
 *  1. Antes de publicar se pregunta si ya salió. Si la función murió entre
 *     publicar y guardar, la corrida siguiente lo reconoce y lo marca.
 *  2. Un pedido que publica DE UNA (el video normal de Facebook) se anota ANTES
 *     de mandarlo (`ctx.antes`). Si después no se sabe qué pasó, no se vuelve a
 *     mandar solo: se pide revisar la Página.
 *  3. "Reintentar" NO borra los identificadores: deja la marca `reintento` y la
 *     etapa vuelve a preguntarle a Meta. Solo si Meta confirma el error se
 *     arranca de cero.
 * Instagram es más fácil: un contenedor se publica una sola vez, así que mientras
 * no se cree otro contenedor, no hay duplicado posible.
 */
import type { EstadoContenedor } from '@/lib/integrations/instagram/publicar'
import type { EstadoCompletoFb } from '@/lib/integrations/facebook/reels'

export interface EnvioEnCurso {
  etapa: string | null
  ids_externos: Record<string, unknown>
}

export interface Pieza {
  videoUrl: string
  descripcion: string
  duracionSeg?: number | null
}

export interface Contexto {
  ahora: Date
  /** Guarda la etapa ANTES de un pedido que no se puede repetir. Si falla, no se manda nada. */
  antes: (etapa: string) => Promise<void>
}

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

/** La API de Reels de Facebook solo acepta de 3 a 90 segundos. */
export const MAX_REEL_FB_SEG = 90
/** Si Meta no terminó en este plazo, no va a terminar: se avisa en vez de esperar para siempre. */
export const PLAZO_MAXIMO_MS = 12 * 3600_000
/** Veces que se rearma un contenedor de Instagram vencido antes de rendirse. */
const MAX_RECREADOS = 2
const UN_MINUTO = 60_000

const PLAZO_VENCIDO = (red: string) =>
  `${red} no terminó de procesar el video en 12 horas. Revisá la cuenta y, si no salió, tocá Reintentar.`

function vencioElPlazo(ids: Record<string, unknown>, ahora: Date): boolean {
  const inicio = typeof ids.inicio_at === 'string' ? Date.parse(ids.inicio_at) : NaN
  return Number.isFinite(inicio) && ahora.getTime() - inicio > PLAZO_MAXIMO_MS
}

function sinReintento(ids: Record<string, unknown>): Record<string, unknown> {
  const copia = { ...ids }
  delete copia.reintento
  return copia
}

// ---------------------------------------------------------------- Instagram

export interface DepsInstagram {
  crearContenedor: (a: { videoUrl: string; descripcion: string }) => Promise<string>
  estadoContenedor: (creationId: string) => Promise<EstadoContenedor>
  publicarContenedor: (creationId: string) => Promise<{ igMediaId: string; permalink: string | null }>
}

export async function avanzarInstagram(
  envio: EnvioEnCurso,
  pieza: Pieza,
  d: DepsInstagram,
  ctx: Contexto,
): Promise<ResultadoEtapa> {
  const ids = envio.ids_externos
  const creationId = typeof ids.creation_id === 'string' ? ids.creation_id : null
  if (envio.etapa === null || !creationId) {
    const id = await d.crearContenedor({ videoUrl: pieza.videoUrl, descripcion: pieza.descripcion })
    const recreados = typeof ids.recreados === 'number' ? ids.recreados : undefined
    return {
      etapa: 'contenedor',
      ids: { creation_id: id, inicio_at: ctx.ahora.toISOString(), ...(recreados ? { recreados } : {}) },
      estado: 'en_curso',
      esperarMs: UN_MINUTO,
    }
  }

  const estado = await d.estadoContenedor(creationId)
  const limpio = sinReintento(ids)
  switch (estado) {
    case 'YA_PUBLICADO':
      return { etapa: 'contenedor', ids: limpio, estado: 'publicado', enlace: null }
    case 'LISTO': {
      // Repetir media_publish sobre el mismo contenedor no duplica: Instagram lo publica una vez.
      const pub = await d.publicarContenedor(creationId)
      return { etapa: 'contenedor', ids: { ...limpio, media_id: pub.igMediaId }, estado: 'publicado', enlace: pub.permalink }
    }
    case 'ERROR':
      if (ids.reintento === true) return { etapa: null, ids: {}, estado: 'en_curso', esperarMs: 0 }
      return {
        etapa: 'contenedor',
        ids: limpio,
        estado: 'fallido',
        error: 'Instagram no pudo procesar el video (revisá el formato o la duración: hasta 15 minutos).',
      }
    case 'VENCIDO': {
      // Un contenedor sin publicar vence a las 24 h: se arma uno nuevo, pero no para siempre.
      const recreados = (typeof ids.recreados === 'number' ? ids.recreados : 0) + 1
      if (recreados > MAX_RECREADOS) {
        return { etapa: 'contenedor', ids: limpio, estado: 'fallido', error: PLAZO_VENCIDO('Instagram') }
      }
      return { etapa: null, ids: { recreados }, estado: 'en_curso', esperarMs: 0 }
    }
    default:
      if (vencioElPlazo(ids, ctx.ahora)) {
        return { etapa: 'contenedor', ids: limpio, estado: 'fallido', error: PLAZO_VENCIDO('Instagram') }
      }
      return { etapa: 'contenedor', ids: limpio, estado: 'en_curso', esperarMs: UN_MINUTO }
  }
}

// ---------------------------------------------------------------- Facebook

export interface DepsFacebook {
  iniciar: () => Promise<string>
  subir: (videoId: string, url: string) => Promise<void>
  publicar: (videoId: string, descripcion: string) => Promise<void>
  /** Video normal de la Página, en un solo pedido que PUBLICA (para los de más de 90 s). */
  videoComun: (url: string, descripcion: string) => Promise<string>
  estado: (videoId: string) => Promise<EstadoCompletoFb>
}

const ERROR_FB = 'Facebook no pudo procesar el video (revisá el formato: vertical, de 3 a 90 segundos).'
const NO_SE_SABE_SI_SALIO =
  'No se pudo confirmar si el video salió en Facebook. Revisá la Página: si no está, tocá Reintentar.'

async function mandarVideoComun(pieza: Pieza, d: DepsFacebook, ctx: Contexto): Promise<ResultadoEtapa> {
  await ctx.antes('video_comun_enviado')
  try {
    const id = await d.videoComun(pieza.videoUrl, pieza.descripcion)
    return {
      etapa: 'publicando',
      ids: { video_id: id, tipo: 'video', inicio_at: ctx.ahora.toISOString() },
      estado: 'en_curso',
      esperarMs: UN_MINUTO,
    }
  } catch {
    // Pudo haber salido igual (Meta a veces publica y después responde error):
    // reintentar solo podría publicarlo dos veces.
    return { etapa: 'video_comun_enviado', ids: {}, estado: 'fallido', error: NO_SE_SABE_SI_SALIO }
  }
}

export async function avanzarFacebook(
  envio: EnvioEnCurso,
  pieza: Pieza,
  d: DepsFacebook,
  ctx: Contexto,
): Promise<ResultadoEtapa> {
  const ids = envio.ids_externos
  const videoId = typeof ids.video_id === 'string' ? ids.video_id : null

  if (envio.etapa === 'video_comun_enviado' && !videoId) {
    // Se mandó y no quedó registrado qué pasó. Solo se vuelve a mandar si la
    // persona revisó la Página y tocó Reintentar.
    if (ids.reintento === true) return mandarVideoComun(pieza, d, ctx)
    return { etapa: 'video_comun_enviado', ids: {}, estado: 'fallido', error: NO_SE_SABE_SI_SALIO }
  }

  if (envio.etapa === null || !videoId) {
    if (envio.etapa !== null) return { etapa: null, ids: {}, estado: 'en_curso', esperarMs: 0 }
    if ((pieza.duracionSeg ?? 0) > MAX_REEL_FB_SEG) return mandarVideoComun(pieza, d, ctx)
    const id = await d.iniciar()
    return { etapa: 'iniciado', ids: { video_id: id, inicio_at: ctx.ahora.toISOString() }, estado: 'en_curso', esperarMs: 0 }
  }

  if (envio.etapa === 'iniciado') {
    // Subir por URL se puede repetir sin riesgo: es el mismo video.
    await d.subir(videoId, pieza.videoUrl)
    return { etapa: 'subido', ids: sinReintento(ids), estado: 'en_curso', esperarMs: 30_000 }
  }

  const actual = await d.estado(videoId)
  const limpio = sinReintento(ids)
  if (actual.estado === 'publicado') {
    return { etapa: envio.etapa, ids: limpio, estado: 'publicado', enlace: actual.enlace }
  }
  if (actual.estado === 'error') {
    if (ids.reintento === true) return { etapa: null, ids: {}, estado: 'en_curso', esperarMs: 0 }
    return { etapa: envio.etapa, ids: limpio, estado: 'fallido', error: ERROR_FB }
  }
  if (vencioElPlazo(ids, ctx.ahora)) {
    return { etapa: envio.etapa, ids: limpio, estado: 'fallido', error: PLAZO_VENCIDO('Facebook') }
  }

  if (envio.etapa === 'subido') {
    if (actual.publicacionPedida) return { etapa: 'publicando', ids: limpio, estado: 'en_curso', esperarMs: UN_MINUTO }
    if (!actual.listoParaPublicar) return { etapa: 'subido', ids: limpio, estado: 'en_curso', esperarMs: 30_000 }
    await ctx.antes('publicando')
    await d.publicar(videoId, pieza.descripcion)
    return { etapa: 'publicando', ids: limpio, estado: 'en_curso', esperarMs: UN_MINUTO }
  }
  return { etapa: envio.etapa, ids: limpio, estado: 'en_curso', esperarMs: UN_MINUTO }
}
