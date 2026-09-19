/**
 * La grilla del mapa propio: el AMBA dividido en celdas de 0,05° (~5 km).
 *
 * Por qué celdas: los lugares se descargan de OpenStreetMap y se refrescan de a
 * UNA celda por vez. La celda más densa (el centro de CABA) tarda ~11 s en
 * bajar, lo que entra en una función de Netlify; el AMBA entero de una vez son
 * minutos. Una celda que falla conserva sus datos anteriores y se reintenta.
 *
 * Todo con índices enteros para no acumular errores de coma flotante
 * (-35.25 + 12 × 0.05 da -34.650000000000006).
 */

/**
 * El AMBA con margen: CABA, conurbano, Canning/Ezeiza, San Isidro, Pilar sur y
 * el Gran La Plata (City Bell, Gonnet, La Plata, Berisso, Ensenada). Un pin
 * afuera se trata como mal puesto (la etapa de zona frena), así que el recuadro
 * tiene que incluir todo lo que la inmobiliaria puede vender.
 * Mantener igual en `scripts/mapa-extraer-osm.py`.
 */
export const AMBA = { sur: -35.25, oeste: -59.2, norte: -34.3, este: -57.8 } as const
export const TAMANO_CELDA = 0.05

export interface Celda {
  id: string
  sur: number
  oeste: number
  norte: number
  este: number
}

const FILAS = Math.round((AMBA.norte - AMBA.sur) / TAMANO_CELDA)
const COLUMNAS = Math.round((AMBA.este - AMBA.oeste) / TAMANO_CELDA)

function redondear(x: number): number {
  return Math.round(x * 1000) / 1000
}

function celdaPorIndices(i: number, j: number): Celda {
  const sur = redondear(AMBA.sur + i * TAMANO_CELDA)
  const oeste = redondear(AMBA.oeste + j * TAMANO_CELDA)
  return {
    id: `${sur.toFixed(3)}_${oeste.toFixed(3)}`,
    sur,
    oeste,
    norte: redondear(sur + TAMANO_CELDA),
    este: redondear(oeste + TAMANO_CELDA),
  }
}

export function todasLasCeldas(): Celda[] {
  const celdas: Celda[] = []
  for (let i = 0; i < FILAS; i++) for (let j = 0; j < COLUMNAS; j++) celdas.push(celdaPorIndices(i, j))
  return celdas
}

export function dentroDelAmba(lat: number, lng: number): boolean {
  return lat >= AMBA.sur && lat <= AMBA.norte && lng >= AMBA.oeste && lng <= AMBA.este
}

function indiceFila(lat: number): number {
  return Math.min(FILAS - 1, Math.floor((lat - AMBA.sur) / TAMANO_CELDA + 1e-9))
}

function indiceColumna(lng: number): number {
  return Math.min(COLUMNAS - 1, Math.floor((lng - AMBA.oeste) / TAMANO_CELDA + 1e-9))
}

export function celdaDe(lat: number, lng: number): Celda | null {
  if (!dentroDelAmba(lat, lng)) return null
  return celdaPorIndices(indiceFila(lat), indiceColumna(lng))
}

/**
 * Las celdas que tocan el cuadrado de `metros` alrededor del punto. `completo`
 * es false si ese cuadrado se sale del AMBA: ahí el mapa propio no alcanza y se
 * consulta en vivo.
 */
export function celdasCubriendo(lat: number, lng: number, metros: number): { ids: string[]; completo: boolean } {
  const dLat = metros / 111_320
  const dLng = metros / (111_320 * Math.cos((lat * Math.PI) / 180))
  const sur = lat - dLat, norte = lat + dLat, oeste = lng - dLng, este = lng + dLng
  const completo = dentroDelAmba(sur, oeste) && dentroDelAmba(norte, este)
  const i0 = indiceFila(Math.max(sur, AMBA.sur)), i1 = indiceFila(Math.min(norte, AMBA.norte))
  const j0 = indiceColumna(Math.max(oeste, AMBA.oeste)), j1 = indiceColumna(Math.min(este, AMBA.este))
  const ids: string[] = []
  if (dentroDelAmba(lat, lng)) {
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) ids.push(celdaPorIndices(i, j).id)
  }
  return { ids, completo }
}
