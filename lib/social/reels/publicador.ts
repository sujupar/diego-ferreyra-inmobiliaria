/**
 * El trabajo del cron: llevar los reels desde "programado" hasta "publicado".
 *
 * ## Por qué esto no puede vivir en un request
 *
 * Instagram no publica al instante. Se le pide un contenedor con la URL del
 * video, él lo descarga y lo procesa —minutos— y recién ahí se publica.
 * Esperarlo adentro de un request lo cortaría el límite de tiempo de Netlify, y
 * el gateway devolvería una página HTML de error que del lado del navegador se
 * ve como `Unexpected token '<'`: un mensaje que no dice nada del problema real.
 * Este proyecto ya se comió ese error dos veces.
 *
 * Por eso cada corrida hace UNA etapa por reel:
 *   programado  → crea el contenedor → procesando
 *   procesando  → ¿terminó? → publicado (o fallido)
 *
 * Con el cron cada 5 minutos, un reel típico está publicado en la corrida
 * siguiente a la que lo tomó.
 */
import { createClient } from '@supabase/supabase-js'
import { mensajeLegible } from '@/lib/integrations/instagram/client'
import {
  crearContenedorReel,
  estadoContenedor,
  publicarContenedor,
} from '@/lib/integrations/instagram/publicar'
import type { FilaReel } from './servicio'

/**
 * Tope por corrida. Es un límite de TIEMPO, no de gusto: cada reel son una o
 * dos llamadas a Instagram dentro de la misma función.
 */
const MAXIMO_POR_CORRIDA = 5

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export interface ResumenCorrida {
  mirados: number
  contenedoresCreados: number
  publicados: number
  fallidos: number
  /** Qué pasó con cada uno. Un cron que no cuenta nada es imposible de diagnosticar. */
  detalle: string[]
}

/**
 * Escribe el estado del reel, con UN reintento.
 *
 * POR QUÉ EL REINTENTO: esta escritura es lo único que conecta lo que ya pasó en
 * Instagram con lo que sabemos nosotros. Si se pierde justo después de publicar,
 * el reel queda online pero marcado 'procesando', y la corrida siguiente lo
 * encuentra en estado PUBLISHED. Antes eso terminaba en un segundo reel
 * idéntico; ahora `etapaPublicar` lo reconoce, pero igual conviene no perderla.
 *
 * Devuelve `false` si ni el reintento funcionó, para que el llamador lo cuente
 * en el resumen en vez de dar por hecho que salió bien.
 */
async function marcar(reelId: string, campos: Record<string, unknown>): Promise<boolean> {
  for (let intento = 1; intento <= 2; intento++) {
    const { error } = await admin()
      .from('property_reels')
      .update({ ...campos, updated_at: new Date().toISOString() })
      .eq('id', reelId)
    if (!error) return true
    console.error(`[cron/reels] intento ${intento} no pudo actualizar`, reelId, error.message)
  }
  return false
}

/** ¿La propiedad sigue teniendo landing publicada? */
async function landingSigueViva(propertyId: string): Promise<boolean> {
  const { data } = await admin()
    .from('property_landings')
    .select('status, public_slug')
    .eq('property_id', propertyId)
    .maybeSingle()
  const fila = data as { status?: string; public_slug?: string | null } | null
  return fila?.status === 'published' && !!fila.public_slug
}

async function etapaCrearContenedor(reel: FilaReel, resumen: ResumenCorrida): Promise<void> {
  if (!reel.video_url) {
    await marcar(reel.id, { estado: 'fallido', ultimo_error: 'El reel no tiene video cargado.' })
    resumen.fallidos++
    resumen.detalle.push(`${reel.id}: sin video`)
    return
  }

  // Se vuelve a comprobar acá, no solo al pedirlo: entre el pedido y esta
  // corrida pueden haber pasado horas y la landing podría haberse despublicado.
  // Publicar un reel que invita a pedir información, sin lugar adonde mandar a
  // la persona, es peor que no publicarlo.
  if (!(await landingSigueViva(reel.property_id))) {
    await marcar(reel.id, {
      estado: 'fallido',
      ultimo_error: 'La landing de la propiedad no está publicada. Publicala y reintentá.',
    })
    resumen.fallidos++
    resumen.detalle.push(`${reel.id}: sin landing publicada`)
    return
  }

  try {
    const creationId = await crearContenedorReel({
      videoUrl: reel.video_url,
      descripcion: reel.descripcion,
    })
    await marcar(reel.id, { estado: 'procesando', ig_creation_id: creationId, ultimo_error: null })
    resumen.contenedoresCreados++
    resumen.detalle.push(`${reel.id}: contenedor ${creationId}`)
  } catch (e) {
    await marcar(reel.id, { estado: 'fallido', ultimo_error: mensajeLegible(e) })
    resumen.fallidos++
    resumen.detalle.push(`${reel.id}: ${mensajeLegible(e)}`)
  }
}

async function etapaPublicar(reel: FilaReel, resumen: ResumenCorrida): Promise<void> {
  if (!reel.ig_creation_id) {
    await marcar(reel.id, { estado: 'fallido', ultimo_error: 'Se perdió el identificador del contenedor.' })
    resumen.fallidos++
    return
  }

  try {
    const estado = await estadoContenedor(reel.ig_creation_id)

    if (estado === 'EN_PROCESO') {
      resumen.detalle.push(`${reel.id}: Instagram sigue procesando`)
      return
    }

    if (estado === 'YA_PUBLICADO') {
      // El reel YA está en Instagram: se publicó y después se perdió la
      // escritura. Volver a llamar a media_publish daría error y, peor, un
      // "Reintentar" crearía un SEGUNDO reel idéntico en la cuenta.
      //
      // No se puede recuperar el identificador del aviso desde el contenedor, y
      // ese identificador es justo lo que el webhook usa para rutear los
      // comentarios. Así que se marca publicado y se le dice al asesor, con
      // todas las letras, qué tiene que hacer: engancharlo desde la lista, que
      // es un camino que ya existe.
      await marcar(reel.id, {
        estado: 'publicado',
        publicado_en: new Date().toISOString(),
        ultimo_error:
          'El reel se publicó, pero no quedó vinculado. Para automatizar sus comentarios, ' +
          'usá "Enganchar uno ya publicado" y elegilo de la lista.',
      })
      resumen.publicados++
      resumen.detalle.push(`${reel.id}: ya estaba publicado, sin vincular`)
      return
    }
    if (estado === 'ERROR' || estado === 'VENCIDO') {
      await marcar(reel.id, {
        estado: 'fallido',
        ultimo_error: estado === 'VENCIDO'
          ? 'Instagram descartó el video por demora. Reintentá.'
          : 'Instagram no pudo procesar el video. Revisá el formato (mp4 o mov) y la duración.',
      })
      resumen.fallidos++
      resumen.detalle.push(`${reel.id}: ${estado}`)
      return
    }

    const { igMediaId, permalink } = await publicarContenedor(reel.ig_creation_id)
    const guardado = await marcar(reel.id, {
      estado: 'publicado',
      ig_media_id: igMediaId,
      ig_permalink: permalink,
      publicado_en: new Date().toISOString(),
      ultimo_error: null,
    })
    resumen.publicados++
    resumen.detalle.push(
      guardado
        ? `${reel.id}: publicado ${igMediaId}`
        : `${reel.id}: PUBLICADO EN INSTAGRAM pero no se pudo guardar (${igMediaId})`,
    )
  } catch (e) {
    await marcar(reel.id, { estado: 'fallido', ultimo_error: mensajeLegible(e) })
    resumen.fallidos++
    resumen.detalle.push(`${reel.id}: ${mensajeLegible(e)}`)
  }
}

export async function correrPublicacionDeReels(ahora = new Date()): Promise<ResumenCorrida> {
  const resumen: ResumenCorrida = {
    mirados: 0,
    contenedoresCreados: 0,
    publicados: 0,
    fallidos: 0,
    detalle: [],
  }

  // Los programados vencidos y los que ya están esperando a Instagram, en una
  // sola consulta. El índice parcial de la migración cubre exactamente esto.
  const { data, error } = await admin()
    .from('property_reels')
    .select('*')
    .in('estado', ['programado', 'procesando'])
    .or(`programado_para.lte.${ahora.toISOString()},estado.eq.procesando`)
    .order('programado_para', { ascending: true })
    .limit(MAXIMO_POR_CORRIDA)

  if (error) throw new Error(`No se pudieron leer los reels pendientes: ${error.message}`)

  const pendientes = (data ?? []) as unknown as FilaReel[]
  resumen.mirados = pendientes.length

  if (pendientes.length === 0) {
    // Un cron que decide no hacer nada deja escrito el motivo: si no, el día que
    // falle de verdad no se distingue de una corrida tranquila.
    resumen.detalle.push('nada pendiente')
    return resumen
  }

  for (const reel of pendientes) {
    if (reel.estado === 'programado') await etapaCrearContenedor(reel, resumen)
    else await etapaPublicar(reel, resumen)
  }

  return resumen
}
