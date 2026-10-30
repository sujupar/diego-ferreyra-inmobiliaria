/**
 * Operaciones de tandas y videos contra la base. Las rutas solo autentican,
 * validan con Zod y llaman acá.
 */
import type { z } from 'zod'
import { armarCalendario, mananaEnArgentina, type HorariosPorDefecto, type Ritmo } from '../calendario'
import { BUCKET, publicacionesDb, urlPublica } from '../db'
import { sincronizarEnvios } from '../envios'
import { ajustarDescripcion, ajustarTituloYoutube } from '../textos'
import type { EnvioFila, Plataforma, TandaFila, VideoFila } from '../tipos'
import {
  altaVideosSchema,
  detectarDuplicados,
  esRutaPropia,
  patchTandaSchema,
  patchVideoSchema,
  transicionPermitida,
} from '../validacion'
import { ErrorHttp } from './http'

export type VideoConUrls = VideoFila & { miniatura_url: string | null; video_url: string | null }

export function conUrls(v: VideoFila): VideoConUrls {
  return {
    ...v,
    miniatura_url: v.miniatura_path ? urlPublica(v.miniatura_path) : null,
    // El video solo existe del todo cuando terminó de subirse.
    video_url: v.video_path && v.etapa !== 'subiendo' ? urlPublica(v.video_path) : null,
  }
}

function dbError(e: { message: string } | null): void {
  if (e) throw new Error(`DB: ${e.message}`)
}

export async function leerTanda(id: string): Promise<TandaFila> {
  const { data, error } = await publicacionesDb().from('publicacion_tandas').select('*').eq('id', id).maybeSingle()
  dbError(error)
  if (!data) throw new ErrorHttp(404, 'La tanda no existe')
  return data as TandaFila
}

async function videosDeTanda(tandaId: string): Promise<VideoFila[]> {
  const { data, error } = await publicacionesDb()
    .from('publicacion_videos')
    .select('*')
    .eq('tanda_id', tandaId)
    .order('orden', { ascending: true })
  dbError(error)
  return (data ?? []) as VideoFila[]
}

async function leerVideo(id: string): Promise<VideoFila> {
  const { data, error } = await publicacionesDb().from('publicacion_videos').select('*').eq('id', id).maybeSingle()
  dbError(error)
  if (!data) throw new ErrorHttp(404, 'El video no existe')
  return data as VideoFila
}

async function enviosDe(videoIds: string[]): Promise<EnvioFila[]> {
  if (videoIds.length === 0) return []
  const { data, error } = await publicacionesDb().from('publicacion_envios').select('*').in('video_id', videoIds)
  dbError(error)
  return (data ?? []) as EnvioFila[]
}

const ARRANCADOS = new Set(['en_curso', 'publicado'])

// ---------- Tandas ----------

export async function listarBorradores(): Promise<{ id: string; created_at: string; updated_at: string; videos: number }[]> {
  const { data, error } = await publicacionesDb()
    .from('publicacion_tandas')
    .select('id, created_at, updated_at, publicacion_videos(count)')
    .eq('estado', 'borrador')
    .order('updated_at', { ascending: false })
    .limit(10)
  dbError(error)
  return (data ?? []).map((t) => ({
    id: t.id as string,
    created_at: t.created_at as string,
    updated_at: t.updated_at as string,
    videos: Number((t.publicacion_videos as { count: number }[] | null)?.[0]?.count ?? 0),
  }))
}

export async function crearTanda(usuarioId: string): Promise<TandaFila> {
  const { data, error } = await publicacionesDb()
    .from('publicacion_tandas')
    .insert({ creada_por: usuarioId, inicio: mananaEnArgentina(new Date()) })
    .select('*')
    .single()
  dbError(error)
  return data as TandaFila
}

export async function detalleTanda(id: string): Promise<{ tanda: TandaFila; videos: VideoConUrls[] }> {
  const tanda = await leerTanda(id)
  const videos = await videosDeTanda(id)
  return { tanda, videos: videos.map(conUrls) }
}

export async function actualizarTanda(id: string, cambios: z.infer<typeof patchTandaSchema>): Promise<TandaFila> {
  const tanda = await leerTanda(id)
  if (tanda.estado !== 'borrador') throw new ErrorHttp(409, 'Esta tanda ya está programada')
  const { data, error } = await publicacionesDb()
    .from('publicacion_tandas')
    .update(cambios)
    .eq('id', id)
    .select('*')
    .single()
  dbError(error)
  return data as TandaFila
}

async function borrarArchivos(videos: Pick<VideoFila, 'video_path' | 'miniatura_path' | 'audio_path'>[]): Promise<void> {
  const paths = videos.flatMap((v) => [v.video_path, v.miniatura_path, v.audio_path]).filter((p): p is string => !!p)
  if (paths.length === 0) return
  const { error } = await publicacionesDb().storage.from(BUCKET).remove(paths)
  // Un archivo huérfano en Storage no rompe nada; la fila sí tiene que irse.
  if (error) console.warn('[publicaciones] no se pudieron borrar archivos', error.message)
}

export async function borrarTanda(id: string): Promise<void> {
  const tanda = await leerTanda(id)
  if (tanda.estado !== 'borrador') throw new ErrorHttp(409, 'Una tanda programada no se borra entera: sacá los videos del calendario')
  const videos = await videosDeTanda(id)
  await borrarArchivos(videos)
  const { error } = await publicacionesDb().from('publicacion_tandas').delete().eq('id', id)
  dbError(error)
}

// ---------- Alta de videos ----------

export async function altaVideos(
  tandaId: string,
  alta: z.infer<typeof altaVideosSchema>,
): Promise<{ videos: { id: string; nombre: string; signedUrl: string; token: string; path: string }[]; repetidos: string[] }> {
  const tanda = await leerTanda(tandaId)
  if (tanda.estado !== 'borrador') throw new ErrorHttp(409, 'Esta tanda ya está programada: empezá una nueva')
  const existentes = await videosDeTanda(tandaId)
  const { nuevos, repetidos } = detectarDuplicados(existentes, alta.archivos)
  if (nuevos.length === 0) return { videos: [], repetidos }

  let orden = existentes.reduce((m, v) => Math.max(m, v.orden), -1)
  const filas = nuevos.map((a) => {
    const id = crypto.randomUUID()
    const ext = a.tipo === 'video/quicktime' ? 'mov' : 'mp4'
    return {
      id,
      tanda_id: tandaId,
      orden: ++orden,
      nombre_archivo: a.nombre.normalize('NFC'),
      tamano_bytes: a.tamano,
      video_path: `tandas/${tandaId}/${id}/video.${ext}`,
      etapa: 'subiendo',
    }
  })
  const db = publicacionesDb()
  const { error } = await db.from('publicacion_videos').insert(filas)
  dbError(error)

  const videos = await Promise.all(
    filas.map(async (f) => {
      const { data, error: e } = await db.storage.from(BUCKET).createSignedUploadUrl(f.video_path, { upsert: true })
      if (e || !data) throw new Error(`Storage: ${e?.message ?? 'sin URL'}`)
      return { id: f.id, nombre: f.nombre_archivo, signedUrl: data.signedUrl, token: data.token, path: f.video_path }
    }),
  )
  return { videos, repetidos }
}

export async function urlParaArchivo(
  videoId: string,
  kind: 'miniatura' | 'audio' | 'video',
): Promise<{ signedUrl: string; token: string; path: string }> {
  const v = await leerVideo(videoId)
  const path =
    kind === 'video'
      ? v.video_path ?? `tandas/${v.tanda_id}/${v.id}/video.mp4`
      : `tandas/${v.tanda_id}/${v.id}/${kind === 'miniatura' ? 'miniatura.jpg' : 'audio.wav'}`
  const { data, error } = await publicacionesDb().storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true })
  if (error || !data) throw new Error(`Storage: ${error?.message ?? 'sin URL'}`)
  return { signedUrl: data.signedUrl, token: data.token, path }
}

// ---------- Edición de un video ----------

export async function actualizarVideo(id: string, cambios: z.infer<typeof patchVideoSchema>): Promise<VideoConUrls> {
  const v = await leerVideo(id)
  const tanda = await leerTanda(v.tanda_id)
  const envios = tanda.estado === 'confirmada' ? await enviosDe([id]) : []
  if (envios.some((e) => ARRANCADOS.has(e.estado))) {
    throw new ErrorHttp(409, 'Este video ya empezó a publicarse: no se puede cambiar')
  }

  const patch: Record<string, unknown> = {}
  for (const k of ['video_path', 'miniatura_path', 'audio_path'] as const) {
    const p = cambios[k]
    if (p === undefined) continue
    if (!esRutaPropia(p, v.tanda_id, v.id)) throw new ErrorHttp(400, 'Ruta de archivo inválida')
    patch[k] = p
  }
  if (cambios.etapa !== undefined && cambios.etapa !== v.etapa) {
    if (!transicionPermitida(v.etapa, cambios.etapa, v.error_etapa)) {
      throw new ErrorHttp(409, 'El video no está en un paso que permita eso')
    }
    patch.etapa = cambios.etapa
    patch.error_etapa = null
    patch.ultimo_error = null
  }
  if (cambios.descripcion !== undefined) {
    patch.descripcion = ajustarDescripcion(cambios.descripcion)
    patch.descripcion_editada = true
  }
  if (cambios.titulo_youtube !== undefined) patch.titulo_youtube = ajustarTituloYoutube(cambios.titulo_youtube)
  if (cambios.redes !== undefined) {
    const redes = [...new Set(cambios.redes)]
    if (redes.length === 0) throw new ErrorHttp(400, 'Si no va a ninguna red, quitá el video')
    patch.redes = redes
  }
  if (cambios.programado_para !== undefined) {
    if (cambios.programado_para === null) {
      if (tanda.estado === 'confirmada') throw new ErrorHttp(400, 'Un video programado necesita día y hora')
    } else if (Date.parse(cambios.programado_para) <= Date.now()) {
      throw new ErrorHttp(400, 'Ese horario ya pasó')
    }
    patch.programado_para = cambios.programado_para
  }
  for (const k of ['hora_manual', 'orden', 'pausado', 'duracion_seg'] as const) {
    if (cambios[k] !== undefined) patch[k] = cambios[k]
  }
  if (Object.keys(patch).length === 0) return conUrls(v)

  let q = publicacionesDb().from('publicacion_videos').update(patch).eq('id', id)
  // El cambio de etapa es condicional: si otra pestaña ya lo movió, no se pisa.
  if (patch.etapa !== undefined) q = q.eq('etapa', v.etapa)
  const { data, error } = await q.select('*').maybeSingle()
  dbError(error)
  if (!data) throw new ErrorHttp(409, 'El video cambió mientras tanto. Recargá la página.')

  if (tanda.estado === 'confirmada' && patch.redes) await aplicarRedes(id, patch.redes as Plataforma[], envios)
  return conUrls(data as VideoFila)
}

async function aplicarRedes(videoId: string, redes: Plataforma[], envios: EnvioFila[]): Promise<void> {
  const db = publicacionesDb()
  const { crear, cancelar, reactivar } = sincronizarEnvios(redes, envios)
  if (crear.length) {
    const { error } = await db
      .from('publicacion_envios')
      .upsert(crear.map((plataforma) => ({ video_id: videoId, plataforma })), {
        onConflict: 'video_id,plataforma',
        ignoreDuplicates: true,
      })
    dbError(error)
  }
  if (reactivar.length) {
    const { error } = await db
      .from('publicacion_envios')
      .update({ estado: 'programado', ultimo_error: null })
      .eq('video_id', videoId)
      .eq('estado', 'cancelado')
      .in('plataforma', reactivar)
    dbError(error)
  }
  if (cancelar.length) {
    const { error } = await db
      .from('publicacion_envios')
      .update({ estado: 'cancelado' })
      .eq('video_id', videoId)
      .eq('estado', 'programado')
      .in('plataforma', cancelar)
    dbError(error)
  }
}

export async function borrarVideo(id: string): Promise<void> {
  const v = await leerVideo(id)
  const envios = await enviosDe([id])
  if (envios.some((e) => ARRANCADOS.has(e.estado))) {
    throw new ErrorHttp(409, 'Este video ya empezó a publicarse: no se puede quitar')
  }
  const { error } = await publicacionesDb().from('publicacion_videos').delete().eq('id', id)
  dbError(error)
  await borrarArchivos([v])
}

// ---------- Calendario y confirmación ----------

async function horariosPorDefecto(): Promise<HorariosPorDefecto> {
  const { data, error } = await publicacionesDb().from('publicacion_ajustes').select('horarios').maybeSingle()
  dbError(error)
  return data?.horarios as HorariosPorDefecto
}

export async function aplicarCalendario(tandaId: string): Promise<VideoConUrls[]> {
  const tanda = await leerTanda(tandaId)
  if (tanda.estado !== 'borrador') throw new ErrorHttp(409, 'Esta tanda ya está programada')
  if (!tanda.ritmo) throw new ErrorHttp(400, 'Elegí un ritmo primero')
  const videos = await videosDeTanda(tandaId)
  const automaticos = videos.filter((v) => !v.hora_manual)

  let fechas: Date[]
  try {
    fechas = armarCalendario(automaticos.length, {
      ritmo: tanda.ritmo as Ritmo,
      inicio: tanda.inicio ?? mananaEnArgentina(new Date()),
      soloHabiles: tanda.solo_habiles,
      horarios: await horariosPorDefecto(),
      ahora: new Date(),
    })
  } catch (e) {
    throw new ErrorHttp(400, e instanceof Error ? e.message : 'No se pudo armar el calendario')
  }

  const db = publicacionesDb()
  const resultados = await Promise.all(
    automaticos.map((v, i) =>
      db.from('publicacion_videos').update({ programado_para: fechas[i].toISOString() }).eq('id', v.id),
    ),
  )
  for (const r of resultados) dbError(r.error)
  return (await videosDeTanda(tandaId)).map(conUrls)
}

export async function confirmarTanda(tandaId: string): Promise<{ videos: number; envios: number }> {
  const tanda = await leerTanda(tandaId)
  const videos = await videosDeTanda(tandaId)
  if (videos.length === 0) throw new ErrorHttp(409, 'La tanda no tiene videos')
  const sinTerminar = videos.filter((v) => v.etapa !== 'listo')
  if (sinTerminar.length) throw new ErrorHttp(409, `Faltan terminar ${sinTerminar.length} video(s)`)
  if (videos.some((v) => !v.programado_para)) throw new ErrorHttp(409, 'Hay videos sin día y hora')
  if (tanda.estado === 'borrador' && videos.some((v) => Date.parse(v.programado_para!) <= Date.now())) {
    throw new ErrorHttp(409, 'Hay videos con un horario que ya pasó: volvé a elegir el ritmo o cambiá la hora')
  }

  const db = publicacionesDb()
  const filas = videos.flatMap((v) => v.redes.map((plataforma) => ({ video_id: v.id, plataforma })))
  // Doble clic en "Programar": la UNIQUE (video_id, plataforma) + ignoreDuplicates
  // hace que la segunda vez no cree nada.
  const { error } = await db
    .from('publicacion_envios')
    .upsert(filas, { onConflict: 'video_id,plataforma', ignoreDuplicates: true })
  dbError(error)
  if (tanda.estado === 'borrador') {
    const { error: e2 } = await db.from('publicacion_tandas').update({ estado: 'confirmada' }).eq('id', tandaId)
    dbError(e2)
  }
  return { videos: videos.length, envios: filas.length }
}

// ---------- Programado ----------

export async function listarProgramado(): Promise<{
  videos: (VideoConUrls & { envios: EnvioFila[] })[]
  publicacion_automatica: boolean
}> {
  const db = publicacionesDb()
  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data, error } = await db
    .from('publicacion_videos')
    .select('*, publicacion_envios(*), publicacion_tandas!inner(estado)')
    .eq('publicacion_tandas.estado', 'confirmada')
    .gte('programado_para', desde)
    .order('programado_para', { ascending: true })
    .limit(500)
  dbError(error)
  const { data: aj, error: e2 } = await db.from('publicacion_ajustes').select('publicacion_automatica').maybeSingle()
  dbError(e2)
  const videos = (data ?? []).map((fila) => {
    const { publicacion_envios, publicacion_tandas: _t, ...v } = fila as VideoFila & {
      publicacion_envios: EnvioFila[]
      publicacion_tandas: unknown
    }
    return { ...conUrls(v as VideoFila), envios: publicacion_envios ?? [] }
  })
  return { videos, publicacion_automatica: aj?.publicacion_automatica === true }
}
