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
import { leerDatoDelBoton, mandarPrivadoConEnlace, mandarTexto } from '@/lib/integrations/instagram/mensajes'
import { esReintentable, mensajeLegible } from '@/lib/integrations/instagram/client'
import type { ComentarioDelAviso } from '@/lib/integrations/instagram/webhook'
import { decidirBoton, decidirQueHacer, type AjustesGlobales } from './decision'
import { elegirRespuesta, tienePrivado } from './respuestas'
import { PRIVADO_POR_DEFECTO, SEGUIMIENTO_POR_DEFECTO } from './textos-por-defecto'
import { enlaceDelReel } from './enlace'
import type { FilaReel } from './servicio'

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/**
 * Los textos de fábrica viven en textos-por-defecto.ts: la pantalla de revisión
 * muestra esos mismos, así lo que el asesor aprueba es lo que se manda.
 */
const DM_POR_DEFECTO = PRIVADO_POR_DEFECTO

/**
 * Los interruptores globales. FALLA CERRADO: si la tabla no existe, si la
 * consulta se cae o si la fila no está, se devuelve todo apagado. "No pude
 * leerlo" nunca puede significar "andá y escribile a la gente".
 */
export async function leerAjustes(): Promise<AjustesGlobales> {
  const apagado: AjustesGlobales = { automatizacion_habilitada: false, dm_habilitado: false, cuentas_de_prueba: [] }
  try {
    const { data, error } = await admin()
      .from('instagram_ajustes')
      .select('automatizacion_habilitada, dm_habilitado, cuentas_de_prueba')
      .eq('id', 'default')
      .maybeSingle()
    if (error || !data) return apagado
    const fila = data as { automatizacion_habilitada?: boolean; dm_habilitado?: boolean; cuentas_de_prueba?: unknown }
    return {
      automatizacion_habilitada: fila.automatizacion_habilitada === true,
      dm_habilitado: fila.dm_habilitado === true,
      // Algo que no sea una lista de textos se lee como "ninguna cuenta de
      // prueba": el simulacro queda para todos, que es el lado seguro.
      cuentas_de_prueba: Array.isArray(fila.cuentas_de_prueba)
        ? fila.cuentas_de_prueba.filter((x): x is string => typeof x === 'string')
        : [],
    }
  } catch {
    return apagado
  }
}

/**
 * El enlace a la landing publicada de la propiedad, con las marcas del reel, o
 * `null` si no hay landing publicada.
 */
async function enlaceDeLaLanding(propertyId: string, reelId: string): Promise<string | null> {
  const { data } = await admin()
    .from('property_landings')
    .select('public_slug, status')
    .eq('property_id', propertyId)
    .maybeSingle()
  const fila = data as { public_slug?: string | null; status?: string } | null
  if (fila?.status !== 'published' || !fila.public_slug) return null
  return enlaceDelReel(process.env.NEXT_PUBLIC_APP_URL ?? 'https://inmodf.com.ar', fila.public_slug, reelId)
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

/**
 * Un reintento ante fallos PASAJEROS de Instagram (500, 429, límites de
 * volumen). Sin esto, un tropezón de un segundo dejaba ese comentario sin
 * respuesta PARA SIEMPRE: el comentario ya quedó registrado, así que el
 * reintento del aviso de Meta lo descarta como repetido y nadie vuelve sobre él.
 *
 * Un solo reintento, y solo de lo que vale la pena: insistir con un permiso
 * faltante es quemar el tiempo del webhook para nada.
 */
async function conReintento<T>(hacer: () => Promise<T>): Promise<T> {
  try {
    return await hacer()
  } catch (e) {
    if (!esReintentable(e)) throw e
    await new Promise((seguir) => setTimeout(seguir, 600))
    return hacer()
  }
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
      autor_username: c.username,
      es_de_la_cuenta: await esComentarioDeLaCuenta(c.autorId),
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
  let motivoSinPrivado: string | null = decision.accion === 'solo_responder' ? decision.motivo : null

  if (decision.accion === 'responder_y_dm') {
    // El enlace va en el PRIMER privado: con el acceso estándar de Meta no hay
    // segundo mensaje (ver `mandarPrivadoConEnlace`). Sin landing publicada no
    // se manda nada: un enlace roto es peor que no mandar.
    const enlace = await enlaceDeLaLanding(reel.property_id, reel.id)
    if (!enlace) {
      motivoSinPrivado = 'landing_no_publicada'
    } else {
      try {
        // El reintento envuelve el envío entero (botón + texto). No duplica:
        // Instagram admite UN solo privado por comentario y rechaza el segundo.
        const forma = await conReintento(() => mandarPrivadoConEnlace({
          comentarioId: c.comentarioId,
          texto: reel.dm_texto?.trim() || DM_POR_DEFECTO,
          textoBoton: reel.dm_boton,
          enlace,
        }))
        privadoEnviado = true
        console.log(`[reels] privado enviado (${forma}) al comentario ${c.comentarioId}`)
      } catch (e) {
        // El privado falla pero la respuesta pública sale igual: el comentario no
        // puede quedar sin contestar por un problema nuestro.
        error = mensajeLegible(e)
      }
    }
  }

  try {
    await conReintento(() =>
      responderComentario(c.comentarioId, elegirRespuesta(c.comentarioId, tienePrivado({ privadoEnviado, motivo: motivoSinPrivado }), {
        con: reel.respuestas_con_privado,
        sin: reel.respuestas_sin_privado,
      })))
  } catch (e) {
    error = error ? `${error} · ${mensajeLegible(e)}` : mensajeLegible(e)
    // Si el privado SÍ salió, queda anotado aunque la respuesta pública falle:
    // si no, el próximo comentario de esa persona recibiría otro privado.
    await anotar(c.comentarioId, {
      coincide: true,
      error,
      dm_enviado_en: privadoEnviado ? new Date().toISOString() : null,
    })
    return { accion: 'error', error }
  }

  await anotar(c.comentarioId, {
    coincide: true,
    respondido_en: new Date().toISOString(),
    dm_enviado_en: privadoEnviado ? new Date().toISOString() : null,
    error,
    motivo_ignorado: motivoSinPrivado,
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
  const reelId = leerDatoDelBoton(dato)
  if (!reelId) return { ok: false, motivo: 'dato_ajeno' }

  const { data } = await admin()
    .from('property_reels')
    .select('id, property_id, dm_seguimiento, automatizacion_activa, simulacro, estado')
    .eq('id', reelId)
    .maybeSingle()
  const reel = data as {
    id: string
    property_id: string
    dm_seguimiento: string | null
    automatizacion_activa: boolean
    simulacro: boolean
    estado: string
  } | null
  if (!reel) return { ok: false, motivo: 'reel_inexistente' }

  const { data: previos } = await admin()
    .from('reel_comentarios')
    .select('id')
    .eq('reel_id', reel.id)
    .eq('ig_user_id', remitenteId)
    .not('enlace_enviado_en', 'is', null)
    .limit(1)

  // Todos los frenos, en un módulo puro y probado uno por uno.
  const decision = decidirBoton(reel, ajustes, (previos ?? []).length > 0)
  if (decision.accion === 'ignorar') return { ok: false, motivo: decision.motivo }

  // Sin landing publicada no hay nada que mandar. Mandar un enlace roto es peor
  // que no contestar: la persona lo toca, no pasa nada y se va.
  const enlace = await enlaceDeLaLanding(reel.property_id, reel.id)
  if (!enlace) return { ok: false, motivo: 'landing_no_publicada' }

  await mandarTexto({
    destinatarioId: remitenteId,
    texto: `${reel.dm_seguimiento?.trim() || SEGUIMIENTO_POR_DEFECTO}\n${enlace}`,
  })

  // Queda anotado contra el último comentario de esa persona en ese reel: es lo
  // que alimenta el contador de "botones tocados" y lo que evita el duplicado
  // de arriba en el reintento siguiente.
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
  } else {
    // Sin comentario donde anotarlo, el freno anti-duplicado de arriba no puede
    // funcionar la próxima vez. Queda registrado para no perder el rastro.
    console.warn('[reels] enlace enviado sin comentario donde anotarlo', reel.id, remitenteId)
  }

  return { ok: true }
}
