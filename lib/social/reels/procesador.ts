/**
 * Qué se hace con cada comentario y con cada botón tocado.
 *
 * Es el pegamento entre las tres partes: la decisión (pura, `decision.ts`), la
 * base y la API de Instagram. Vive fuera de la ruta para que la ruta sea fina y
 * para poder ejecutarlo desde un script de prueba sin levantar un servidor.
 *
 * ## Idempotencia: el orden importa
 *
 * Meta REINTENTA sus avisos cuando no recibe un 200 a tiempo. Lo primero que se
 * hace con un comentario es intentar INSERTARLO, apoyándose en el UNIQUE de
 * `ig_comment_id`. Si el insert no agrega nada, es un reintento de algo ya
 * atendido y se corta ahí.
 *
 * Hacerlo al revés —actuar y después registrar— significaría que un reintento
 * manda una segunda respuesta y un segundo mensaje privado a la misma persona.
 */
import { createClient } from '@supabase/supabase-js'
import { esComentarioDeLaCuenta, responderComentario } from '@/lib/integrations/instagram/comentarios'
import { leerDatoDelBoton, mandarPrivadoConBoton, mandarTexto } from '@/lib/integrations/instagram/mensajes'
import { mensajeLegible } from '@/lib/integrations/instagram/client'
import type { ComentarioDelAviso } from '@/lib/integrations/instagram/webhook'
import { decidirQueHacer, type AjustesGlobales } from './decision'
import { elegirRespuesta } from './respuestas'
import type { FilaReel } from './servicio'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Texto por defecto del privado, por si el asesor no escribió el suyo. */
const DM_POR_DEFECTO = 'Hola! Vi que comentaste en el reel. Te armé la ficha completa de la propiedad, con fotos y todos los detalles. ¿Te la paso?'
const SEGUIMIENTO_POR_DEFECTO = 'Acá la tenés 👇'

/**
 * Los interruptores globales. FALLA CERRADO: si la tabla no existe, si la
 * consulta se cae o si la fila no está, se devuelve todo apagado. "No pude
 * leerlo" nunca puede significar "andá y escribile a la gente".
 */
export async function leerAjustes(): Promise<AjustesGlobales> {
  const apagado: AjustesGlobales = { automatizacion_habilitada: false, dm_habilitado: false }
  try {
    const { data, error } = await admin()
      .from('instagram_ajustes')
      .select('automatizacion_habilitada, dm_habilitado')
      .eq('id', 'default')
      .maybeSingle()
    if (error || !data) return apagado
    const fila = data as { automatizacion_habilitada?: boolean; dm_habilitado?: boolean }
    return {
      automatizacion_habilitada: fila.automatizacion_habilitada === true,
      dm_habilitado: fila.dm_habilitado === true,
    }
  } catch {
    return apagado
  }
}

async function reelPorMedia(igMediaId: string): Promise<FilaReel | null> {
  const { data } = await admin()
    .from('property_reels')
    .select('*')
    .eq('ig_media_id', igMediaId)
    .maybeSingle()
  return (data as unknown as FilaReel) ?? null
}

/** ¿Esta persona ya recibió su privado por este reel? Instagram permite uno solo. */
async function yaRecibioDm(reelId: string, igUserId: string): Promise<boolean> {
  const { data } = await admin()
    .from('reel_comentarios')
    .select('id')
    .eq('reel_id', reelId)
    .eq('ig_user_id', igUserId)
    .not('dm_enviado_en', 'is', null)
    .limit(1)
  return (data ?? []).length > 0
}

/**
 * Registra el comentario. `false` = ya estaba (reintento de Meta) y no hay que
 * volver a hacer nada.
 */
async function registrarComentario(
  reelId: string,
  c: ComentarioDelAviso,
): Promise<boolean> {
  const { data, error } = await admin()
    .from('reel_comentarios')
    .upsert(
      {
        reel_id: reelId,
        ig_comment_id: c.comentarioId,
        ig_user_id: c.autorId,
        username: c.username,
        texto: c.texto,
      },
      // El UNIQUE de ig_comment_id existe en la migración: sin él, Postgres no
      // detectaría el conflicto y el upsert se comportaría como INSERT puro,
      // acumulando duplicados. Es la trampa que este proyecto ya documentó con
      // meta_ads_daily.
      { onConflict: 'ig_comment_id', ignoreDuplicates: true },
    )
    .select('id')

  if (error) throw new Error(`No se pudo registrar el comentario: ${error.message}`)
  return (data ?? []).length > 0
}

async function anotar(comentarioId: string, campos: Record<string, unknown>): Promise<void> {
  const { error } = await admin()
    .from('reel_comentarios')
    .update(campos)
    .eq('ig_comment_id', comentarioId)
  // No se traga en silencio: un registro que no se actualiza hace que el
  // contador de la pantalla mienta.
  if (error) console.error('[reels] no se pudo anotar el comentario', comentarioId, error.message)
}

export type ResultadoComentario =
  | { accion: 'ignorado'; motivo: string }
  | { accion: 'repetido' }
  | { accion: 'simulado' }
  | { accion: 'respondido'; privadoEnviado: boolean }
  | { accion: 'error'; error: string }

/**
 * Atiende UN comentario de punta a punta.
 *
 * El privado se intenta ANTES de responder en público: el resultado decide qué
 * frase se usa. Prometer "te escribí al privado" cuando el privado falló sería
 * mentirle a la persona delante de todos los que leen los comentarios.
 */
export async function procesarComentario(
  c: ComentarioDelAviso,
  ajustes: AjustesGlobales,
  ahora = new Date(),
): Promise<ResultadoComentario> {
  const reel = await reelPorMedia(c.igMediaId)
  // Un reel que no es nuestro: la cuenta tiene 1.200 publicaciones y la mayoría
  // no pasó nunca por la plataforma.
  if (!reel) return { accion: 'ignorado', motivo: 'reel_desconocido' }

  if (!(await registrarComentario(reel.id, c))) return { accion: 'repetido' }

  const decision = decidirQueHacer(
    reel,
    {
      texto: c.texto,
      creado_en: c.creadoEn,
      autor_ig_id: c.autorId,
      es_de_la_cuenta: esComentarioDeLaCuenta(c.autorId),
      ya_recibio_dm: await yaRecibioDm(reel.id, c.autorId),
    },
    ajustes,
    ahora,
  )

  if (decision.accion === 'ignorar') {
    await anotar(c.comentarioId, { coincide: false, motivo_ignorado: decision.motivo })
    return { accion: 'ignorado', motivo: decision.motivo }
  }

  if (decision.accion === 'simular') {
    // Queda escrito lo que HABRÍA pasado, sin tocar Instagram.
    await anotar(c.comentarioId, { coincide: true, simulado: true })
    return { accion: 'simulado' }
  }

  let privadoEnviado = false
  let error: string | null = null

  if (decision.accion === 'responder_y_dm') {
    try {
      await mandarPrivadoConBoton({
        comentarioId: c.comentarioId,
        texto: reel.dm_texto?.trim() || DM_POR_DEFECTO,
        textoBoton: reel.dm_boton,
        reelId: reel.id,
      })
      privadoEnviado = true
    } catch (e) {
      // El privado falla pero la respuesta pública sale igual: el comentario no
      // puede quedar sin contestar por un problema nuestro.
      error = mensajeLegible(e)
    }
  }

  try {
    await responderComentario(c.comentarioId, elegirRespuesta(c.comentarioId, privadoEnviado))
  } catch (e) {
    error = error ? `${error} · ${mensajeLegible(e)}` : mensajeLegible(e)
    await anotar(c.comentarioId, { coincide: true, error })
    return { accion: 'error', error }
  }

  await anotar(c.comentarioId, {
    coincide: true,
    respondido_en: new Date().toISOString(),
    dm_enviado_en: privadoEnviado ? new Date().toISOString() : null,
    error,
    motivo_ignorado: decision.accion === 'solo_responder' ? decision.motivo : null,
  })

  return { accion: 'respondido', privadoEnviado }
}

/**
 * La persona tocó el botón: se le manda el enlace de la landing.
 *
 * El identificador del reel viene ADENTRO del botón. No se cruza por usuario:
 * el identificador del que comenta y el del que escribe por privado no siempre
 * coinciden, y equivocarse significa mandarle la landing de otra propiedad.
 */
export async function procesarBoton(
  remitenteId: string,
  dato: string,
  ajustes: AjustesGlobales,
): Promise<{ ok: boolean; motivo?: string }> {
  if (!ajustes.automatizacion_habilitada || !ajustes.dm_habilitado) {
    return { ok: false, motivo: 'interruptor_apagado' }
  }

  const reelId = leerDatoDelBoton(dato)
  if (!reelId) return { ok: false, motivo: 'dato_ajeno' }

  const { data } = await admin()
    .from('property_reels')
    .select('id, property_id, dm_seguimiento')
    .eq('id', reelId)
    .maybeSingle()
  const reel = data as { id: string; property_id: string; dm_seguimiento: string | null } | null
  if (!reel) return { ok: false, motivo: 'reel_inexistente' }

  const { data: landing } = await admin()
    .from('property_landings')
    .select('public_slug, status')
    .eq('property_id', reel.property_id)
    .maybeSingle()
  const fila = landing as { public_slug?: string | null; status?: string } | null

  // Sin landing publicada no hay nada que mandar. Mandar un enlace roto es peor
  // que no contestar: la persona lo toca, no pasa nada y se va.
  if (fila?.status !== 'published' || !fila.public_slug) {
    return { ok: false, motivo: 'landing_no_publicada' }
  }

  const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar'
  const enlace = `${base.replace(/\/+$/, '')}/p/${fila.public_slug}`

  await mandarTexto({
    destinatarioId: remitenteId,
    texto: `${reel.dm_seguimiento?.trim() || SEGUIMIENTO_POR_DEFECTO}\n${enlace}`,
  })

  // Queda anotado contra el último comentario de esa persona en ese reel: es lo
  // que alimenta el contador de "botones tocados" de la pantalla.
  const { data: comentarios } = await admin()
    .from('reel_comentarios')
    .select('id')
    .eq('reel_id', reel.id)
    .eq('ig_user_id', remitenteId)
    .order('created_at', { ascending: false })
    .limit(1)

  const ultimo = (comentarios ?? [])[0] as { id: string } | undefined
  if (ultimo) {
    const ahora = new Date().toISOString()
    await admin()
      .from('reel_comentarios')
      .update({ boton_tocado_en: ahora, enlace_enviado_en: ahora })
      .eq('id', ultimo.id)
  }

  return { ok: true }
}
