import { apGet } from './client'
import type { ApCredentials } from '../credentials'

/**
 * Catálogos de referencia + localización de Argenprop (sección 12/13 de la doc).
 * Cambian con muy poca frecuencia → cache en memoria por proceso (TTL 24h), tal
 * como recomienda la doc para no consumir cuota diaria (REQ001/REQ002).
 */

const TTL_MS = 24 * 60 * 60 * 1000
const cache = new Map<string, { at: number; value: unknown }>()

async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value as T
  const value = await fn()
  cache.set(key, { at: Date.now(), value })
  return value
}

export interface CatalogItem { Id: string; Descripcion?: string; Nombre?: string; Tipo?: string }
export interface CaracteristicaMeta {
  Id: string
  Tipo: 'Texto' | 'Booleano' | 'Numerico' | 'Fecha' | string
  Valor?: string          // si es Texto enumerada: ref a /v1/Catalogo/Caracteristicas/{Id}
  Minimo?: number
  Maximo?: number
}

/** Localidad de Capital Federal (CABA). Para CABA el Barrio es obligatorio al publicar. */
export const CABA_LOCALIDAD_ID = 'LOCALIDAD_2102'

export function getCategorias(creds: ApCredentials) {
  return cached('categorias', () => apGet<CatalogItem[]>(creds, '/v1/catalogo/categorias'))
}
export function getSubtipos(creds: ApCredentials, categoria: string) {
  return cached(`subtipos:${categoria}`, () => apGet<CatalogItem[]>(creds, `/v1/catalogo/categorias/${categoria}/subtipos`))
}
export function getCaracteristicas(creds: ApCredentials, categoria: string) {
  return cached(`caracteristicas:${categoria}`, () => apGet<CaracteristicaMeta[]>(creds, `/v1/catalogo/categorias/${categoria}/caracteristicas`))
}
export function getCaracteristicaValores(creds: ApCredentials, caracteristica: string) {
  return cached(`carvalores:${caracteristica}`, () => apGet<CatalogItem[]>(creds, `/v1/catalogo/caracteristicas/${caracteristica}`))
}
export function getMonedas(creds: ApCredentials) {
  return cached('monedas', () => apGet<CatalogItem[]>(creds, '/v1/catalogo/propiedad/monedas'))
}
export function getTipoOperacion(creds: ApCredentials) {
  return cached('tipooperacion', () => apGet<CatalogItem[]>(creds, '/v1/catalogo/propiedad/tipooperacion'))
}
export function getEstadosPropiedad(creds: ApCredentials) {
  return cached('estados', () => apGet<CatalogItem[]>(creds, '/v1/catalogo/propiedad/estados'))
}

/** Barrios de CABA (LOCALIDAD_2102). */
export function getBarriosCaba(creds: ApCredentials) {
  return cached(`barrios:${CABA_LOCALIDAD_ID}`, () => apGet<CatalogItem[]>(creds, `/v1/localizacion/localidades/${CABA_LOCALIDAD_ID}/barrios`))
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/**
 * Resuelve el nombre de barrio (ej. "Palermo") al Id de Argenprop (ej. "BARRIO_20")
 * dentro de CABA. Match exacto normalizado y, si no, por inclusión. Devuelve null si
 * no se encuentra (el caller decide: error o publicar sin barrio en no-CABA).
 */
export async function resolveCabaBarrioId(creds: ApCredentials, neighborhood: string | null | undefined): Promise<string | null> {
  if (!neighborhood) return null
  const target = norm(neighborhood)
  if (!target) return null
  const barrios = await getBarriosCaba(creds)
  // Los items de localización usan `Nombre` (el catálogo de categorías usa `Descripcion`).
  const nameOf = (b: CatalogItem) => norm(b.Nombre ?? b.Descripcion ?? '')
  const exact = barrios.find(b => nameOf(b) === target)
  if (exact) return exact.Id
  const partial = barrios.find(b => {
    const n = nameOf(b)
    return n.length > 2 && (n.includes(target) || target.includes(n))
  })
  return partial?.Id ?? null
}
