/**
 * Avanza UNA etapa de la preparación de un video (transcribir o describir).
 * El cliente llama en loop hasta que el video queda `listo` o `error`.
 *
 * Cada escritura es condicional a la etapa que se leyó: si dos pestañas llaman a
 * la vez, la segunda no pisa a la primera.
 */
import { BUCKET, publicacionesDb } from '../db'
import { estiloVigente, type EstadoEstilo } from '../estilo'
import { siguienteAccion } from '../preparacion'
import { SIN_VOZ, type Segmento, type VideoFila } from '../tipos'
import { aplicarResultadoDescripcion, escribirDescripcion } from './describir'
import { tieneVoz, transcribirAudio } from './transcribir'

export class EstiloNoAprendido extends Error {
  constructor() {
    super('Primero aprendé el estilo en Ajustes')
  }
}
export class VideoNoEncontrado extends Error {
  constructor() {
    super('El video no existe')
  }
}

const ERRORES_LEGIBLES = [
  'Falta configurar la clave de OpenAI',
  'El audio es demasiado largo para transcribir (más de 13 minutos)',
  'No se pudo transcribir el audio',
]

function legible(e: unknown, etapa: string): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (ERRORES_LEGIBLES.includes(msg)) return msg
  return etapa === 'transcribiendo'
    ? 'No se pudo transcribir el audio. Tocá Reintentar.'
    : 'No se pudo escribir la descripción. Tocá Reintentar.'
}

async function leerVideo(id: string): Promise<VideoFila> {
  const { data, error } = await publicacionesDb().from('publicacion_videos').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(`DB: ${error.message}`)
  if (!data) throw new VideoNoEncontrado()
  return data as VideoFila
}

async function transcribir(v: VideoFila): Promise<void> {
  const db = publicacionesDb()
  const { data: audio, error } = await db.storage.from(BUCKET).download(v.audio_path!)
  if (error || !audio) throw new Error(`Storage: ${error?.message ?? 'sin audio'}`)
  const segmentos = await transcribirAudio(audio)
  const { error: e2 } = await db
    .from('publicacion_videos')
    .update({ transcripcion: segmentos, etapa: 'describiendo', error_etapa: null, ultimo_error: null })
    .eq('id', v.id)
    .eq('etapa', 'transcribiendo')
  if (e2) throw new Error(`DB: ${e2.message}`)
}

async function describir(v: VideoFila): Promise<void> {
  const db = publicacionesDb()
  const segmentos: Segmento[] = v.transcripcion ?? []

  if (!tieneVoz(segmentos)) {
    const { error } = await db
      .from('publicacion_videos')
      .update({ etapa: 'listo', error_etapa: null, ultimo_error: SIN_VOZ })
      .eq('id', v.id)
      .eq('etapa', 'describiendo')
    if (error) throw new Error(`DB: ${error.message}`)
    return
  }

  const { data: ajustes, error: eAj } = await db.from('publicacion_ajustes').select('estilo').maybeSingle()
  if (eAj) throw new Error(`DB: ${eAj.message}`)
  const estilo = estiloVigente(ajustes?.estilo as EstadoEstilo | undefined)
  if (!estilo) throw new EstiloNoAprendido()

  const ia = await escribirDescripcion(segmentos, estilo.guia, estilo.ejemplos.map((e) => e.caption))

  // Releer justo antes de escribir: la persona pudo editar mientras la IA escribía.
  const fresco = await leerVideo(v.id)
  if (fresco.etapa !== 'describiendo') return
  const final = aplicarResultadoDescripcion(fresco, ia)
  const comun = { titulo_youtube: final.titulo_youtube, etapa: 'listo', error_etapa: null, ultimo_error: null }

  // Primero intento escribir también la descripción, SOLO si sigue sin editar.
  const { data: escritas, error: e1 } = await db
    .from('publicacion_videos')
    .update({ ...comun, descripcion: final.descripcion })
    .eq('id', v.id)
    .eq('etapa', 'describiendo')
    .eq('descripcion_editada', false)
    .select('id')
  if (e1) throw new Error(`DB: ${e1.message}`)
  if ((escritas ?? []).length > 0) return

  // La editaron en el medio: se respeta lo suyo y solo se cierra la etapa.
  const { error: e3 } = await db
    .from('publicacion_videos')
    .update(comun)
    .eq('id', v.id)
    .eq('etapa', 'describiendo')
  if (e3) throw new Error(`DB: ${e3.message}`)
}

export async function avanzarPreparacion(videoId: string): Promise<VideoFila> {
  const v = await leerVideo(videoId)
  const accion = siguienteAccion(v)
  if (accion === 'nada' || accion === 'esperar_navegador') return v

  try {
    if (accion === 'transcribir') await transcribir(v)
    else await describir(v)
  } catch (e) {
    if (e instanceof EstiloNoAprendido || e instanceof VideoNoEncontrado) throw e
    console.error('[publicaciones] preparar', videoId, v.etapa, e)
    await publicacionesDb()
      .from('publicacion_videos')
      .update({ etapa: 'error', error_etapa: v.etapa, ultimo_error: legible(e, v.etapa) })
      .eq('id', videoId)
      .eq('etapa', v.etapa)
  }
  return leerVideo(videoId)
}
