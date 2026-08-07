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

/** Argentina en el catálogo de países. Solo operamos acá. Verificado en vivo 2026-08-06. */
export const PAIS_ARGENTINA_ID = 'PAIS_1'

/**
 * Jerarquía de localización COMPLETA, verificada contra la API en vivo el
 * 2026-08-06 (probe con las credenciales reales):
 *   /v1/localizacion/paises                      → 19 (PAIS_1 = Argentina)
 *   /v1/localizacion/paises/PAIS_1/provincias    → 24 (PROVINCIA_1 = Buenos Aires,
 *                                                      PROVINCIA_2 = Capital Federal)
 *   /v1/localizacion/provincias/{id}/partidos    → 135 en BsAs (ej. PARTIDO_107
 *                                                  "Partido de Roque Pérez")
 *   /v1/localizacion/partidos/{id}/localidades   → 12 en Roque Pérez
 *   /v1/localizacion/localidades/{id}/barrios    → ya en uso (CABA)
 */
export function getProvincias(creds: ApCredentials) {
  return cached('provincias', () => apGet<CatalogItem[]>(creds, `/v1/localizacion/paises/${PAIS_ARGENTINA_ID}/provincias`))
}
export function getPartidos(creds: ApCredentials, provinciaId: string) {
  return cached(`partidos:${provinciaId}`, () => apGet<CatalogItem[]>(creds, `/v1/localizacion/provincias/${provinciaId}/partidos`))
}
export function getLocalidadesDePartido(creds: ApCredentials, partidoId: string) {
  return cached(`localidades:${partidoId}`, () => apGet<CatalogItem[]>(creds, `/v1/localizacion/partidos/${partidoId}/localidades`))
}
export function getBarrios(creds: ApCredentials, localidadId: string) {
  return cached(`barrios:${localidadId}`, () => apGet<CatalogItem[]>(creds, `/v1/localizacion/localidades/${localidadId}/barrios`))
}

/** Barrios de CABA (LOCALIDAD_2102). */
export function getBarriosCaba(creds: ApCredentials) {
  return getBarrios(creds, CABA_LOCALIDAD_ID)
}

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

/**
 * Matchea un nombre humano ("Roque Pérez", "buenos aires", "Palermo Soho")
 * contra un catálogo de localización. PURA — testeable sin red.
 *
 * Orden de preferencia:
 *   1. Exacto normalizado (sin tildes/mayúsculas, y sin el prefijo "Partido de "
 *      que la API pone en todos los partidos).
 *   2. Nombre del catálogo CONTENIDO en el input — pero SOLO si el candidato es
 *      ÚNICO (el input es más específico: "Palermo Soho" → "Palermo"). NO se
 *      usa la dirección inversa para que un sub-item ("Palermo Chico") no le
 *      robe el match al exacto.
 *   3. null — nunca un parecido dudoso: publicar en la localidad equivocada es
 *      el mismo modo de falla silencioso que la categoría equivocada de ML.
 *
 * Por qué la regla 2 exige candidato ÚNICO y no "el más largo": con el catálogo
 * real, "San Miguel del Monte" (cabecera del Partido de Monte) contiene tanto
 * "san miguel" como "monte"; elegir el más largo publicaba en el Partido de San
 * Miguel (GBA), a ~90 km, sin error. Reproducido en vivo por el review
 * adversarial del 2026-08-06. Ante ambigüedad se devuelve null y el caller da
 * un error claro pidiendo revisar la ficha.
 */
export function matchLocalizacion(items: CatalogItem[], query: string): CatalogItem | null {
  const target = norm(query)
  if (!target) return null
  // Los items de localización usan `Nombre` (el catálogo de categorías usa `Descripcion`).
  const nameOf = (i: CatalogItem) => norm(i.Nombre ?? i.Descripcion ?? '').replace(/^partido de /, '')
  const exact = items.find(i => nameOf(i) === target)
  if (exact) return exact
  const nombresContenidos = new Set(
    items.map(nameOf).filter(n => n.length > 2 && target.includes(n)),
  )
  if (nombresContenidos.size !== 1) return null
  const [unico] = nombresContenidos
  return items.find(i => nameOf(i) === unico) ?? null
}

/**
 * Resuelve el nombre de barrio (ej. "Palermo") al Id de Argenprop (ej.
 * "BARRIO_20") dentro de una localidad. Devuelve null si no se encuentra
 * (el caller decide: en CABA es error, fuera de CABA se publica sin barrio).
 */
export async function resolveBarrioId(
  creds: ApCredentials,
  localidadId: string,
  neighborhood: string | null | undefined,
): Promise<string | null> {
  if (!neighborhood) return null
  const barrios = await getBarrios(creds, localidadId)
  return matchLocalizacion(barrios, neighborhood)?.Id ?? null
}

/** Compatibilidad: el resolver histórico de barrios de CABA. */
export async function resolveCabaBarrioId(creds: ApCredentials, neighborhood: string | null | undefined): Promise<string | null> {
  return resolveBarrioId(creds, CABA_LOCALIDAD_ID, neighborhood)
}
