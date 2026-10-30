/**
 * Las dependencias REALES del publicador (base + Meta) y la corrida completa:
 * publicar lo que toca y, si sobra tiempo, la limpieza de 30 días.
 * La orquestación vive en `publicador/runner.ts` (probada con dependencias falsas).
 */
import {
  estadoReel,
  iniciarReel,
  publicarReel,
  publicarVideoComun,
  subirPorUrl,
} from '@/lib/integrations/facebook/reels'
import { crearContenedorReel, estadoContenedor, publicarContenedor } from '@/lib/integrations/instagram/publicar'
import { BUCKET, publicacionesDb, urlPublica } from '../db'
import { listoParaBorrar } from '../publicador/limpieza'
import { avanzarFacebook, avanzarInstagram } from '../publicador/redes'
import { correrPublicador, type Candidato, type ResumenPublicador } from '../publicador/runner'
import type { EnvioFila, VideoFila } from '../tipos'

/**
 * Ventana para EMPEZAR un envío. Netlify corta alrededor de 26 s y una etapa son
 * hasta 2 llamadas a Meta de 8 s como máximo cada una (TECHO_META_MS): empezando
 * antes de los 10 s, la última termina antes del corte.
 */
const PRESUPUESTO_MS = 10_000
const MAX_POR_CORRIDA = 6
/** Lo que dura la reserva de un envío: si la función muere, a los 3 minutos otra corrida lo retoma. */
const RESERVA_MS = 3 * 60_000

type FilaConVideo = EnvioFila & {
  publicacion_videos: VideoFila & { publicacion_tandas: { estado: 'borrador' | 'confirmada' } }
}

export async function candidatos(ahora: Date): Promise<Candidato[]> {
  const iso = ahora.toISOString()
  const { data, error } = await publicacionesDb()
    .from('publicacion_envios')
    .select('*, publicacion_videos!inner(*, publicacion_tandas!inner(estado))')
    .in('estado', ['programado', 'en_curso'])
    .in('plataforma', ['instagram', 'facebook'])
    .or(`proximo_intento.is.null,proximo_intento.lte.${iso}`)
    .lte('publicacion_videos.programado_para', iso)
    .eq('publicacion_videos.pausado', false)
    .eq('publicacion_videos.publicacion_tandas.estado', 'confirmada')
    // Primero los que nunca arrancaron (proximo_intento nulo): así los que esperan
    // a que Meta procese no le quitan el lugar a lo que ya tiene que salir.
    .order('proximo_intento', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(MAX_POR_CORRIDA)
  if (error) throw new Error(`DB: ${error.message}`)
  return ((data ?? []) as FilaConVideo[]).map((fila) => {
    const { publicacion_videos: v, ...envio } = fila
    const { publicacion_tandas: t, ...video } = v
    return { envio: envio as EnvioFila, video: video as VideoFila, estadoTanda: t.estado }
  })
}

export async function reservar(envio: EnvioFila, ahora: Date): Promise<boolean> {
  const { data, error } = await publicacionesDb()
    .from('publicacion_envios')
    .update({ proximo_intento: new Date(ahora.getTime() + RESERVA_MS).toISOString() })
    .eq('id', envio.id)
    .eq('updated_at', envio.updated_at)
    .in('estado', ['programado', 'en_curso'])
    .select('id')
  if (error) throw new Error(`DB: ${error.message}`)
  return (data ?? []).length > 0
}

export async function guardar(envioId: string, cambios: Record<string, unknown>): Promise<boolean> {
  // Condicional: si alguien canceló la red mientras Meta trabajaba, no se revive.
  const { data, error } = await publicacionesDb()
    .from('publicacion_envios')
    .update(cambios)
    .eq('id', envioId)
    .in('estado', ['programado', 'en_curso'])
    .select('id')
  if (error) throw new Error(`DB: ${error.message}`)
  const escribio = (data ?? []).length > 0
  if (!escribio) console.warn('[publicador] el envío cambió mientras se publicaba', envioId, cambios.estado)
  return escribio
}

async function automatica(): Promise<boolean> {
  const { data, error } = await publicacionesDb().from('publicacion_ajustes').select('publicacion_automatica').eq('id', true).maybeSingle()
  // Ante la duda, apagado: nunca se publica porque no se pudo leer el interruptor.
  if (error) {
    console.error('[publicador] no se pudo leer el interruptor', error.message)
    return false
  }
  return data?.publicacion_automatica === true
}

/** Borra los archivos de los videos que terminaron hace más de 30 días. */
export async function limpiarArchivosViejos(ahora: Date, limite = 20): Promise<number> {
  const db = publicacionesDb()
  const hace30 = new Date(ahora.getTime() - 30 * 86_400_000).toISOString()
  // El filtro fuerte lo hace la base (ver la migración 20261030000001).
  const { data, error } = await db.rpc('publicacion_videos_para_limpiar', { limite, antes: hace30 })
  if (error) throw new Error(`DB: ${error.message}`)
  let borrados = 0
  for (const v of (data ?? []) as { id: string; video_path: string; audio_path: string | null }[]) {
    // Segunda verificación, con la regla pura: borrar es lo único que no tiene vuelta atrás.
    const { data: envios } = await db.from('publicacion_envios').select('estado, updated_at').eq('video_id', v.id)
    if (!listoParaBorrar((envios ?? []) as Pick<EnvioFila, 'estado' | 'updated_at'>[], ahora)) continue
    const paths = [v.video_path, v.audio_path].filter((p): p is string => !!p)
    const { error: e1 } = await db.storage.from(BUCKET).remove(paths)
    if (e1) {
      console.warn('[publicador] no se pudo borrar el archivo', v.id, e1.message)
      continue
    }
    await db.from('publicacion_videos').update({ archivo_borrado_at: ahora.toISOString() }).eq('id', v.id)
    borrados++
  }
  return borrados
}

export async function correrPublicacion(): Promise<ResumenPublicador & { archivosBorrados: number }> {
  const inicio = Date.now()
  const resumen = await correrPublicador({
    ahora: () => new Date(),
    automatica,
    candidatos,
    reservar,
    guardar,
    urlPublica,
    presupuestoMs: PRESUPUESTO_MS,
    redes: {
      instagram: (e, p, ctx) =>
        avanzarInstagram(
          e,
          p,
          { crearContenedor: crearContenedorReel, estadoContenedor, publicarContenedor },
          ctx,
        ),
      facebook: (e, p, ctx) =>
        avanzarFacebook(
          e,
          p,
          {
            iniciar: iniciarReel,
            subir: subirPorUrl,
            publicar: publicarReel,
            videoComun: publicarVideoComun,
            estado: estadoReel,
          },
          ctx,
        ),
    },
  })
  // La limpieza solo con tiempo de sobra: publicar a horario es lo que importa.
  let archivosBorrados = 0
  if (Date.now() - inicio < PRESUPUESTO_MS / 2) {
    try {
      archivosBorrados = await limpiarArchivosViejos(new Date())
    } catch (e) {
      console.error('[publicador] limpieza', e)
    }
  }
  return { ...resumen, archivosBorrados }
}
