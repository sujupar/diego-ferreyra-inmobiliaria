/**
 * Conecta un video ya publicado con la automatización de comentarios de su
 * propiedad (la regla vive en `../conexion.ts`). Nunca tira: devuelve el motivo
 * y lo deja anotado en `publicacion_videos.automatizacion_error`, que la pantalla
 * muestra con "Conectar de nuevo". El video ya salió: esto no puede hacerlo fallar.
 */
import { paginaDeLaCuenta, paginaFetch } from '@/lib/integrations/instagram/client'
import { listarReelsPublicados } from '@/lib/integrations/instagram/publicar'
import { landingPublicada } from '@/lib/social/reels/servicio'
import { AVISO_SIN_LANDING, planDeConexion, type RedPublicada } from '../conexion'
import { publicacionesDb } from '../db'
import type { EnvioFila } from '../tipos'

interface FilaVideoConexion {
  id: string
  property_id: string | null
  automatizacion: unknown
  reel_id: string | null
  descripcion: string
  automatizacion_error: string | null
  publicacion_tandas: { creada_por: string | null } | null
}

const MOTIVOS: Record<string, string> = {
  sin_id_de_la_red: 'No se pudo conectar: la red no devolvió el identificador de la publicación. Tocá "Conectar de nuevo".',
}

async function anotar(videoId: string, error: string | null, reelId?: string): Promise<void> {
  const cambios: Record<string, unknown> = { automatizacion_error: error }
  if (reelId) cambios.reel_id = reelId
  const { error: e } = await publicacionesDb().from('publicacion_videos').update(cambios).eq('id', videoId)
  if (e) console.error('[publicaciones/conexion] no se pudo anotar', videoId, e.message)
}

/** El reel que ya tiene alguno de estos identificadores (un reintento, o la otra red que llegó antes). */
async function reelConIds(ids: Record<string, unknown>): Promise<string | null> {
  for (const columna of ['ig_media_id', 'fb_post_id'] as const) {
    const valor = ids[columna]
    if (typeof valor !== 'string' || !valor) continue
    const { data } = await publicacionesDb().from('property_reels').select('id').eq(columna, valor).maybeSingle()
    if (data?.id) return data.id as string
  }
  return null
}

export async function conectarVideo(videoId: string, red: RedPublicada): Promise<{ ok: boolean; error: string | null }> {
  const db = publicacionesDb()
  const { data, error } = await db
    .from('publicacion_videos')
    .select('id, property_id, automatizacion, reel_id, descripcion, automatizacion_error, publicacion_tandas(creada_por)')
    .eq('id', videoId)
    .maybeSingle()
  if (error || !data) return { ok: false, error: `No se pudo leer el video: ${error?.message ?? 'no existe'}` }
  const video = data as unknown as FilaVideoConexion

  const landing = video.property_id ? await landingPublicada(video.property_id) : { publicada: false }
  const plan = planDeConexion({ video, red, landingPublicada: landing.publicada, ahora: new Date() })

  if (plan.accion === 'nada') {
    if (plan.motivo === 'sin_propiedad' || plan.motivo === 'sin_configuracion') return { ok: true, error: null }
    const motivo = plan.detalle ? `No se conectaron los comentarios: ${plan.detalle}` : (MOTIVOS[plan.motivo] ?? 'No se conectaron los comentarios.')
    await anotar(videoId, motivo)
    return { ok: false, error: motivo }
  }

  if (plan.accion === 'completar') {
    const { error: e } = await db.from('property_reels').update(plan.cambios).eq('id', plan.reelId)
    // 23505: ese id ya está en el reel (un reintento): ya está conectado.
    if (e && e.code !== '23505') {
      const motivo = `No se pudieron conectar los comentarios de esta red: ${e.message}`
      await anotar(videoId, motivo)
      return { ok: false, error: motivo }
    }
    // El aviso "quedó Apagado porque falta la landing" sigue siendo cierto: completar la otra red no lo borra.
    if (video.automatizacion_error !== AVISO_SIN_LANDING) await anotar(videoId, null)
    return { ok: true, error: video.automatizacion_error === AVISO_SIN_LANDING ? AVISO_SIN_LANDING : null }
  }

  const { data: nuevo, error: e } = await db
    .from('property_reels')
    .insert({ ...plan.fila, created_by: video.publicacion_tandas?.creada_por ?? null })
    .select('id')
    .single()
  let reelId = nuevo?.id as string | undefined
  if (e) {
    // Ya existe un reel con ese id (un reintento de esta misma conexión): se engancha ese.
    reelId = e.code === '23505' ? ((await reelConIds(plan.fila)) ?? undefined) : undefined
    if (!reelId) {
      const motivo = `No se pudieron conectar los comentarios: ${e.message}`
      await anotar(videoId, motivo)
      return { ok: false, error: motivo }
    }
  }
  // Condicional: si otra corrida conectó la otra red en el medio, gana la suya y la nuestra se le suma.
  const { data: ganado, error: eGanar } = await db
    .from('publicacion_videos')
    .update({ reel_id: reelId, automatizacion_error: plan.aviso ?? null })
    .eq('id', videoId)
    .is('reel_id', null)
    .select('reel_id')
  // Un error de base no es "perdí la carrera": el reel creado queda y se reintenta con "Conectar de nuevo".
  if (eGanar) {
    const motivo = `No se pudieron conectar los comentarios: ${eGanar.message}`
    await anotar(videoId, motivo)
    return { ok: false, error: motivo }
  }
  if ((ganado ?? []).length === 0 && nuevo?.id) {
    // Perdimos la carrera: el ganador es el reel que conectó la otra red. Primero se le suman nuestros
    // ids y RECIÉN después se borra el nuestro (al revés, un id podía perderse sin aviso).
    const { data: actual } = await db.from('publicacion_videos').select('reel_id').eq('id', videoId).maybeSingle()
    const otro = actual?.reel_id as string | undefined
    if (otro && otro !== nuevo.id) {
      const ids = Object.fromEntries(
        Object.entries(plan.fila).filter(([k, v]) => ['ig_media_id', 'fb_video_id', 'fb_post_id'].includes(k) && v),
      )
      await db.from('property_reels').delete().eq('id', nuevo.id)
      const { error: eSumar } = await db.from('property_reels').update(ids).eq('id', otro)
      if (eSumar) {
        const motivo = `No se pudieron conectar los comentarios de esta red: ${eSumar.message}`
        await anotar(videoId, motivo)
        return { ok: false, error: motivo }
      }
    }
  }
  return { ok: true, error: plan.aviso ?? null }
}

/** De un envío publicado, los identificadores que hacen falta para encontrar sus comentarios. */
export async function redDelEnvio(
  envio: Pick<EnvioFila, 'plataforma' | 'ids_externos'>,
  descripcion?: string,
): Promise<RedPublicada | null> {
  const ids = envio.ids_externos ?? {}
  if (envio.plataforma === 'instagram') {
    if (typeof ids.media_id === 'string') return { plataforma: 'instagram', igMediaId: ids.media_id }
    // Publicado "por recuperación" (se reconoció que ya había salido): no quedó el id. Se busca el reel
    // reciente con EXACTAMENTE esta descripción; si hay cero o más de uno, no se adivina.
    const texto = descripcion?.trim()
    if (texto) {
      const iguales = (await listarReelsPublicados(25)).filter((r) => (r.descripcion ?? '').trim() === texto)
      if (iguales.length === 1) return { plataforma: 'instagram', igMediaId: iguales[0].id }
    }
    return { plataforma: 'instagram', igMediaId: '' }
  }
  if (envio.plataforma === 'facebook') {
    const videoId = typeof ids.video_id === 'string' ? ids.video_id : ''
    if (!videoId) return { plataforma: 'facebook', fbVideoId: '', fbPostId: '' }
    // El aviso de un comentario trae la PUBLICACIÓN (`{página}_{post}`), no el video: se la pide una vez.
    const [{ pageId }, v] = await Promise.all([
      paginaDeLaCuenta(),
      paginaFetch<{ post_id?: string }>(`/${encodeURIComponent(videoId)}?fields=post_id`),
    ])
    // Verificado el 2026-11-04: `post_id` viene sin la página ("1092248110314200"). Si algún día viniera
    // completo ("{página}_{post}"), se usa tal cual.
    const post = v.post_id ?? ''
    return { plataforma: 'facebook', fbVideoId: videoId, fbPostId: post ? (post.includes('_') ? post : `${pageId}_${post}`) : '' }
  }
  return null
}

/**
 * Lo que llama el publicador apenas sale un video. NUNCA tira: si algo falla (Meta no responde, la
 * base se cae), queda anotado en el video con "Conectar de nuevo". Sin esto la pantalla decía
 * "se conectan apenas sale" para siempre, sin ningún botón.
 */
export async function conectarAlPublicar(
  videoId: string,
  envio: Pick<EnvioFila, 'plataforma' | 'ids_externos'>,
  descripcion: string,
): Promise<void> {
  try {
    const red = await redDelEnvio(envio, descripcion)
    if (red) await conectarVideo(videoId, red)
  } catch (e) {
    const detalle = e instanceof Error ? e.message : 'error desconocido'
    console.error('[publicaciones/conexion] al publicar', videoId, detalle)
    await anotar(videoId, `No se pudieron conectar los comentarios (${detalle.slice(0, 150)}). Tocá "Conectar de nuevo".`)
  }
}

/** "Conectar de nuevo": vuelve a intentarlo con cada red donde el video ya salió. */
export async function reconectarVideo(videoId: string): Promise<{ ok: boolean; error: string | null }> {
  const { data, error } = await publicacionesDb()
    .from('publicacion_envios')
    .select('plataforma, ids_externos, estado')
    .eq('video_id', videoId)
    .eq('estado', 'publicado')
    .in('plataforma', ['instagram', 'facebook'])
  if (error) return { ok: false, error: `No se pudo leer el video: ${error.message}` }
  if ((data ?? []).length === 0) return { ok: false, error: 'El video todavía no salió en Instagram ni en Facebook.' }
  const { data: v } = await publicacionesDb().from('publicacion_videos').select('descripcion').eq('id', videoId).maybeSingle()
  let ultimo: { ok: boolean; error: string | null } = { ok: true, error: null }
  for (const envio of data as Pick<EnvioFila, 'plataforma' | 'ids_externos'>[]) {
    const red = await redDelEnvio(envio, (v?.descripcion as string | undefined) ?? undefined)
    if (!red) continue
    const r = await conectarVideo(videoId, red)
    // Gana el primer problema: "Conectar de nuevo" tiene que mostrar qué falló, aunque la otra red haya andado.
    if (ultimo.ok || ultimo.error === null) ultimo = r
  }
  return ultimo
}
