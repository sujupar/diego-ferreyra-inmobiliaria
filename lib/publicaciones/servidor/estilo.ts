/**
 * Aprender el estilo, UNA etapa por llamada (el cliente loopea):
 *   empezar   → lee hasta 400 reels del Instagram (solo lectura, sin IA)
 *   clasificar → una llamada de IA por lote de 50
 *   redactar  → una llamada de IA que escribe la guía
 *
 * La escritura es condicional al `updated_at` leído: dos pestañas apretando a la
 * vez no procesan dos veces el mismo lote.
 */
import { cuentaInstagram, instagramFetch, mensajeLegible } from '@/lib/integrations/instagram/client'
import { openaiText } from '@/lib/social/openai'
import { publicacionesDb } from '../db'
import {
  MAX_REELS_A_LEER,
  SCHEMA_CLASIFICACION,
  SCHEMA_GUIA,
  aplicarClasificacion,
  candidatosDeMedia,
  estiloVigente,
  promptClasificacion,
  promptGuia,
  siguienteLote,
  type EstadoEstilo,
  type MediaInstagram,
} from '../estilo'
import { ErrorHttp } from './http'
import { TARDO_DEMASIADO, TECHO_IA_MS } from './transcribir'

async function conTecho<T>(llamada: () => Promise<T>): Promise<T> {
  try {
    return await llamada()
  } catch (e) {
    if (e instanceof Error && e.name === 'TimeoutError') throw new ErrorHttp(504, TARDO_DEMASIADO)
    throw e
  }
}

async function leerEstado(): Promise<{ estilo: EstadoEstilo; updated_at: string }> {
  const { data, error } = await publicacionesDb()
    .from('publicacion_ajustes')
    .select('estilo, updated_at')
    .eq('id', true)
    .single()
  if (error) throw new Error(`DB: ${error.message}`)
  return { estilo: data.estilo as EstadoEstilo, updated_at: data.updated_at as string }
}

async function guardar(nuevo: EstadoEstilo, leidoEn: string): Promise<EstadoEstilo> {
  const { data, error } = await publicacionesDb()
    .from('publicacion_ajustes')
    .update({ estilo: nuevo })
    .eq('id', true)
    .eq('updated_at', leidoEn)
    .select('estilo')
  if (error) throw new Error(`DB: ${error.message}`)
  // Otra pestaña avanzó primero: se devuelve lo que quedó, sin pisar.
  if (!data || data.length === 0) return (await leerEstado()).estilo
  return data[0].estilo as EstadoEstilo
}

async function leerReels(): Promise<MediaInstagram[]> {
  const { igId } = await cuentaInstagram()
  const media: MediaInstagram[] = []
  let after: string | undefined
  while (media.length < MAX_REELS_A_LEER) {
    const cursor = after ? `&after=${encodeURIComponent(after)}` : ''
    const pagina = await instagramFetch<{ data?: MediaInstagram[]; paging?: { cursors?: { after?: string }; next?: string } }>(
      `/${igId}/media?fields=id,caption,media_product_type,timestamp&limit=100${cursor}`,
    )
    media.push(...(pagina.data ?? []))
    after = pagina.paging?.cursors?.after
    if (!pagina.paging?.next || !after) break
  }
  return media
}

export async function avanzarAprendizaje(empezar = false): Promise<EstadoEstilo> {
  const { estilo, updated_at } = await leerEstado()

  // `empezar` desde CUALQUIER etapa: si un aprendizaje quedó trabado a mitad (la IA
  // falló siempre en el mismo paso), "Volver a aprender" es la salida.
  if (estilo.etapa === 'sin_aprender' || empezar) {
    let media: MediaInstagram[]
    try {
      media = await leerReels()
    } catch (e) {
      throw new ErrorHttp(502, `No se pudo leer el Instagram: ${mensajeLegible(e)}`)
    }
    const candidatos = candidatosDeMedia(media)
    if (candidatos.length === 0) throw new ErrorHttp(422, 'No encontré reels con descripción en el Instagram')
    return guardar(
      { etapa: 'clasificando', candidatos, cursor: 0, elegidos: [], anterior: estiloVigente(estilo) },
      updated_at,
    )
  }

  if (estilo.etapa === 'clasificando') {
    const lote = siguienteLote(estilo)
    const { system, user } = promptClasificacion(lote)
    const r = await conTecho(() =>
      openaiText<{ resultados: { id: string; es_diego_hablando: boolean }[] }>(system, user, SCHEMA_CLASIFICACION, {
        timeoutMs: TECHO_IA_MS,
      }),
    )
    return guardar(aplicarClasificacion(estilo, r.resultados ?? []), updated_at)
  }

  if (estilo.etapa === 'redactando') {
    if (estilo.ejemplos.length === 0) {
      // Nada que aprender: se vuelve al documento anterior si lo había.
      return guardar(estilo.anterior ?? { etapa: 'sin_aprender' }, updated_at)
    }
    const { system, user } = promptGuia(estilo.ejemplos)
    const r = await conTecho(() => openaiText<{ guia: string }>(system, user, SCHEMA_GUIA, { timeoutMs: TECHO_IA_MS }))
    return guardar(
      { etapa: 'listo', guia: r.guia.trim(), ejemplos: estilo.ejemplos, aprendido_en: new Date().toISOString(), anterior: null },
      updated_at,
    )
  }

  return estilo
}

/** Lo que ve la pantalla: sin los ~400 candidatos (pesan y no le sirven a nadie). */
export function resumenEstilo(e: EstadoEstilo):
  | { etapa: 'sin_aprender' | 'redactando'; vigente: boolean }
  | { etapa: 'clasificando'; elegidos: number; revisados: number; total: number; vigente: boolean }
  | { etapa: 'listo'; guia: string; ejemplos: { caption: string; fecha: string }[]; aprendido_en: string; vigente: true } {
  const vigente = estiloVigente(e) !== null
  if (e.etapa === 'listo') return { etapa: 'listo', guia: e.guia, ejemplos: e.ejemplos, aprendido_en: e.aprendido_en, vigente: true }
  if (e.etapa === 'clasificando') {
    return {
      etapa: 'clasificando',
      elegidos: e.elegidos.length,
      revisados: Math.min(e.cursor, e.candidatos.length),
      total: e.candidatos.length,
      vigente,
    }
  }
  return { etapa: e.etapa, vigente }
}
