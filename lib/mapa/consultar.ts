/**
 * Lugares cercanos desde el MAPA PROPIO (tabla `mapa_lugares`), sin llamar a
 * ningún servicio externo: la consulta que usa la etapa de zona de las
 * descripciones. Ver el spec 2026-09-19-mapa-propio-design.md para el porqué.
 *
 * Antes de consultar se verifica la COBERTURA: todas las celdas alrededor del
 * punto tienen que haber bajado bien al menos una vez. Sin eso, "no hay lugares"
 * podría ser "no se cargó esa zona" — y eso terminaría en un texto sin distancias
 * en silencio. Sin cobertura, quien llama consulta en vivo.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { LugarCercano, TipoLugar } from '@/lib/descripcion/tipos'
import { RADIOS_METROS, seleccionarLugares } from '@/lib/descripcion/zona-mapa'
import { celdasCubriendo } from './celdas'
import { nombreUtil, ordenarLineasColectivo } from './normalizar'

export interface FilaCercana {
  osm_id: string
  tipo: string
  nombre: string
  lineas: string[]
  metros: number
}

const TIPOS_LUGAR = new Set<TipoLugar>(['subte', 'tren', 'plaza', 'colegio', 'universidad', 'hospital'])

export function resultadoDesdeFilas(filas: FilaCercana[]): { lugares: LugarCercano[]; colectivos: string[] } {
  const lugares: LugarCercano[] = []
  const colectivos: string[] = []
  for (const f of filas) {
    // Una parada o un tramo de recorrido a menos de 400 m: la línea pasa cerca.
    if (f.tipo === 'parada' || f.tipo === 'recorrido') { colectivos.push(...f.lineas); continue }
    // El filtro de nombres corre también al leer: vale para filas cargadas antes de él.
    const nombre = nombreUtil(f.nombre)
    if (!TIPOS_LUGAR.has(f.tipo as TipoLugar) || !nombre) continue
    const lugar: LugarCercano = { nombre, tipo: f.tipo as TipoLugar, metros: f.metros, cuadras: Math.max(1, Math.round(f.metros / 100)) }
    if (f.lineas.length) lugar.linea = f.lineas.join(' y ')
    lugares.push(lugar)
  }
  return { lugares: seleccionarLugares(lugares), colectivos: ordenarLineasColectivo(colectivos) }
}

export function hayCobertura(requeridas: string[], celdas: Array<{ id: string; actualizado_en: string | null }>): boolean {
  if (!requeridas.length) return false
  const bajadas = new Set(celdas.filter(c => c.actualizado_en).map(c => c.id))
  return requeridas.every(id => bajadas.has(id))
}

export type ResultadoBase =
  | { estado: 'ok'; lugares: LugarCercano[]; colectivos: string[] }
  | { estado: 'sin_cobertura' }

/** Techo de las DOS consultas juntas: normalmente tardan milisegundos. */
const TECHO_BASE_MS = 4_000

/** Lanza si la base no responde (error real, reintentable); `sin_cobertura` si la zona no está cargada. */
export async function lugaresDesdeBase(db: SupabaseClient, lat: number, lng: number): Promise<ResultadoBase> {
  const radioMaximo = Math.max(...Object.values(RADIOS_METROS))
  const { ids, completo } = celdasCubriendo(lat, lng, radioMaximo)
  if (!completo || !ids.length) return { estado: 'sin_cobertura' }

  const senal = AbortSignal.timeout(TECHO_BASE_MS)
  const { data: celdas, error: errCeldas } = await db.from('mapa_celdas').select('id, actualizado_en').in('id', ids)
    .abortSignal(senal)
  if (errCeldas) throw new Error(`no se pudo leer la cobertura del mapa: ${errCeldas.message}`)
  if (!hayCobertura(ids, (celdas ?? []) as Array<{ id: string; actualizado_en: string | null }>)) return { estado: 'sin_cobertura' }

  const { data, error } = await db.rpc('lugares_cercanos', { p_lat: lat, p_lng: lng, p_radios: RADIOS_METROS })
    .abortSignal(senal)
  if (error) throw new Error(`no se pudo consultar el mapa: ${error.message}`)
  return { estado: 'ok', ...resultadoDesdeFilas((data ?? []) as FilaCercana[]) }
}
