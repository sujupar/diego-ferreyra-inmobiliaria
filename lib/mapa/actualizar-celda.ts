/**
 * Descargar y guardar UNA celda del mapa propio. Lo usan la carga inicial
 * (`scripts/mapa-cargar.ts`) y la actualización mensual (`/api/cron/mapa-lugares`).
 *
 * Reglas que hacen que una celda nunca quede peor que antes:
 *  - Si la descarga falla, NO se toca ningún lugar: la celda conserva sus datos
 *    y queda en 'error' para reintentar.
 *  - Una descarga "buena" que trae menos de la mitad de lo que había cuenta
 *    como fallida (`descargaSospechosa`).
 *  - Recién con la descarga buena se hace upsert de lo que vino y se borran SOLO
 *    los lugares de ESA celda que ya no vinieron (marcados con la fecha de esta
 *    actualización).
 *  - Una sola escritura por celda a la vez (`reservarCelda`): con dos a la vez,
 *    la más nueva borra lo que la más vieja re-marcó con su fecha y la celda
 *    queda vacía.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Celda } from './celdas'
import { consultaCelda, filasDesdeRespuesta, type FilaMapa } from './overpass-celda'
import { SERVIDORES_OVERPASS, consultarServidorOverpass } from '@/lib/descripcion/zona-mapa'

const LOTE_UPSERT = 500

/** Los dos servidores a la vez; gana el primero que responde bien. Lanza si fallan todos. */
export async function descargarCelda(c: Celda, signal: AbortSignal): Promise<unknown> {
  const alcanzo = new AbortController()
  const senal = AbortSignal.any([signal, alcanzo.signal])
  const cuerpo = `data=${encodeURIComponent(consultaCelda(c))}`
  try {
    return await Promise.any(SERVIDORES_OVERPASS.map(url => consultarServidorOverpass(url, cuerpo, senal)))
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

/**
 * Un espejo de Overpass desactualizado o recortado puede responder 200 con
 * `elements: []` o con media celda. Guardarlo borraría la celda y la dejaría
 * "ok" 30 días: descripciones sin mapa en silencio. Un mes de cambios reales en
 * OpenStreetMap no se lleva la mitad de una celda; si alguna vez pasa de
 * verdad, la carga desde Geofabrik (`guardarCelda` directo) lo resuelve.
 */
export function descargaSospechosa(filasAntes: number, filasAhora: number): boolean {
  return filasAntes >= 20 && filasAhora < filasAntes * 0.5
}

/** Más que lo que puede durar una actualización (Netlify corta a ~26 s). */
const RESERVA_MS = 2 * 60_000

/**
 * Reserva la celda para escribirla: pone `reservada_hasta` solo si no hay otra
 * reserva vigente. Es UN update condicional, atómico en Postgres: si dos llegan
 * juntos, el segundo ya ve la reserva del primero. También marca `intentado_en`
 * (la actualización mensual espera 1 hora antes de volver a intentar la celda).
 * Devuelve las filas que tenía la celda, o null si está ocupada. Liberar con
 * `liberarCelda`; si la función muere a mitad, la reserva vence sola.
 */
export async function reservarCelda(db: SupabaseClient, c: Celda): Promise<{ filas: number } | null> {
  const ahora = new Date()
  const { data, error } = await db.from('mapa_celdas')
    .update({ reservada_hasta: new Date(ahora.getTime() + RESERVA_MS).toISOString(), intentado_en: ahora.toISOString() })
    .eq('id', c.id).or(`reservada_hasta.is.null,reservada_hasta.lt."${ahora.toISOString()}"`).select('filas')
  if (error) throw new Error(`no se pudo reservar la celda: ${error.message}`)
  const fila = ((data ?? []) as Array<{ filas: number | null }>)[0]
  return fila ? { filas: fila.filas ?? 0 } : null
}

export async function liberarCelda(db: SupabaseClient, c: Celda): Promise<void> {
  const { error } = await db.from('mapa_celdas').update({ reservada_hasta: null }).eq('id', c.id)
  if (error) console.warn(`[mapa] no se pudo liberar la celda ${c.id} (vence sola en 2 min): ${error.message}`)
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
    const reserva = await reservarCelda(db, c)
    // Ocupada: otra corrida la está escribiendo. No es un error de la celda.
    if (!reserva) return { ok: false, filas: 0, ms: Date.now() - t, error: 'celda ocupada por otra actualización' }
    try {
      const json = await descargarCelda(c, AbortSignal.timeout(timeoutMs))
      const nuevas = filasDesdeRespuesta(json, c)
      if (descargaSospechosa(reserva.filas, nuevas.length)) {
        throw new Error(`descarga sospechosa: ${nuevas.length} filas contra ${reserva.filas} que había; no se toca la celda`)
      }
      const filas = await guardarCelda(db, c, nuevas)
      return { ok: true, filas, ms: Date.now() - t }
    } finally {
      await liberarCelda(db, c)
    }
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : String(err)
    try { await marcarError(db, c, mensaje) } catch { /* el error original es el que importa */ }
    return { ok: false, filas: 0, ms: Date.now() - t, error: mensaje }
  }
}
