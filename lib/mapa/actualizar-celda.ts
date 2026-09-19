/**
 * Descargar y guardar UNA celda del mapa propio. Lo usan la carga inicial
 * (`scripts/mapa-cargar.ts`) y la actualización mensual (`/api/cron/mapa-lugares`).
 *
 * Reglas que hacen que una celda nunca quede peor que antes:
 *  - Si la descarga falla, NO se toca ningún lugar: la celda conserva sus datos
 *    y queda en 'error' para reintentar.
 *  - Recién con la descarga buena se hace upsert de lo que vino y se borran SOLO
 *    los lugares de ESA celda que ya no vinieron (marcados con la fecha de esta
 *    actualización).
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Celda } from './celdas'
import { consultaCelda, filasDesdeRespuesta, type FilaMapa } from './overpass-celda'
import { SERVIDORES_OVERPASS } from '@/lib/descripcion/zona-mapa'

const LOTE_UPSERT = 500

async function consultarServidor(url: string, cuerpo: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'user-agent': 'DiegoFerreyraInmobiliaria/1.0 (contacto@inmodf.com.ar)',
    },
    body: cuerpo,
  })
  if (!res.ok) throw new Error(`${new URL(url).host} respondió ${res.status}`)
  const json = (await res.json()) as { elements?: unknown; remark?: unknown }
  // Overpass responde 200 con un "remark" cuando corta la consulta por tiempo o
  // memoria: eso NO es una celda vacía, es una descarga fallida.
  if (typeof json.remark === 'string' && /error|timeout|out of memory/i.test(json.remark)) {
    throw new Error(`${new URL(url).host}: ${json.remark.slice(0, 120)}`)
  }
  if (!Array.isArray(json.elements)) throw new Error(`${new URL(url).host}: respuesta sin elements`)
  return json
}

/** Los dos servidores a la vez; gana el primero que responde bien. Lanza si fallan todos. */
export async function descargarCelda(c: Celda, signal: AbortSignal): Promise<unknown> {
  const alcanzo = new AbortController()
  const senal = AbortSignal.any([signal, alcanzo.signal])
  const cuerpo = `data=${encodeURIComponent(consultaCelda(c))}`
  try {
    return await Promise.any(SERVIDORES_OVERPASS.map(url => consultarServidor(url, cuerpo, senal)))
  } catch (err) {
    const motivos = err instanceof AggregateError ? err.errors.map(e => (e instanceof Error ? e.message : String(e))) : [String(err)]
    throw new Error(`ningún servidor respondió: ${motivos.join(' | ')}`)
  } finally {
    alcanzo.abort()
  }
}

/** Una misma clave dos veces en un upsert hace fallar a Postgres ("cannot affect row a second time"). */
function sinRepetidos(filas: FilaMapa[]): FilaMapa[] {
  const porClave = new Map<string, FilaMapa>()
  for (const f of filas) porClave.set(`${f.osm_id}|${f.tipo}`, f)
  return [...porClave.values()]
}

/** Cómo se guarda la ubicación: un punto, o el trazado entero si es un tramo de recorrido. */
export function ubicacionWkt(f: FilaMapa): string {
  if (f.tipo !== 'recorrido') return `SRID=4326;POINT(${f.lng} ${f.lat})`
  if (!f.trazo || f.trazo.length < 2) throw new Error(`el recorrido ${f.osm_id} no tiene trazado`)
  return `SRID=4326;LINESTRING(${f.trazo.map(([lng, lat]) => `${lng} ${lat}`).join(',')})`
}

export async function asegurarCeldas(db: SupabaseClient, celdas: Celda[]): Promise<void> {
  for (let i = 0; i < celdas.length; i += LOTE_UPSERT) {
    const lote = celdas.slice(i, i + LOTE_UPSERT).map(c => ({ id: c.id, sur: c.sur, oeste: c.oeste, norte: c.norte, este: c.este }))
    const { error } = await db.from('mapa_celdas').upsert(lote, { onConflict: 'id', ignoreDuplicates: true })
    if (error) throw new Error(`no se pudieron crear las celdas: ${error.message}`)
  }
}

export async function guardarCelda(db: SupabaseClient, c: Celda, filas: FilaMapa[]): Promise<number> {
  const inicio = new Date().toISOString()
  await asegurarCeldas(db, [c])
  const unicas = sinRepetidos(filas)
  for (let i = 0; i < unicas.length; i += LOTE_UPSERT) {
    const lote = unicas.slice(i, i + LOTE_UPSERT).map(f => ({
      osm_id: f.osm_id,
      tipo: f.tipo,
      nombre: f.nombre,
      lineas: f.lineas,
      ubicacion: ubicacionWkt(f),
      celda: f.celda,
      actualizado_en: inicio,
    }))
    const { error } = await db.from('mapa_lugares').upsert(lote, { onConflict: 'osm_id,tipo' })
    if (error) throw new Error(`no se pudieron guardar los lugares: ${error.message}`)
  }
  const { error: errBorrar } = await db.from('mapa_lugares').delete().eq('celda', c.id).lt('actualizado_en', inicio)
  if (errBorrar) throw new Error(`no se pudieron borrar los lugares viejos: ${errBorrar.message}`)
  const { error: errCelda } = await db.from('mapa_celdas').update({
    estado: 'ok', filas: unicas.length, intentos: 0, ultimo_error: null, actualizado_en: inicio, intentado_en: inicio,
  }).eq('id', c.id)
  if (errCelda) throw new Error(`no se pudo marcar la celda: ${errCelda.message}`)
  return unicas.length
}

async function marcarError(db: SupabaseClient, c: Celda, mensaje: string): Promise<void> {
  const { data } = await db.from('mapa_celdas').select('intentos').eq('id', c.id).maybeSingle()
  const intentos = ((data as { intentos?: number } | null)?.intentos ?? 0) + 1
  await db.from('mapa_celdas').update({
    estado: 'error', ultimo_error: mensaje.slice(0, 500), intentos, intentado_en: new Date().toISOString(),
  }).eq('id', c.id)
}

export interface ResultadoCelda { ok: boolean; filas: number; ms: number; error?: string }

/** Descarga y guarda una celda. Nunca lanza: devuelve el resultado y deja la celda marcada. */
export async function actualizarCelda(db: SupabaseClient, c: Celda, timeoutMs: number): Promise<ResultadoCelda> {
  const t = Date.now()
  try {
    await asegurarCeldas(db, [c])
    const json = await descargarCelda(c, AbortSignal.timeout(timeoutMs))
    const filas = await guardarCelda(db, c, filasDesdeRespuesta(json, c))
    return { ok: true, filas, ms: Date.now() - t }
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err)
    try { await marcarError(db, c, mensaje) } catch { /* el error original es el que importa */ }
    return { ok: false, filas: 0, ms: Date.now() - t, error: mensaje }
  }
}
