/**
 * Descarga de UNA celda del mapa propio desde OpenStreetMap (Overpass) y su
 * conversión a filas de `mapa_lugares`.
 *
 * La consulta trae las rutas de colectivo con sus miembros (`out body`) y las
 * paradas sin tags (`out skel`), y la membresía se cruza acá. Preguntar parada
 * por parada con `foreach` tardaba 94 s en la celda más densa (centro de CABA,
 * 880 paradas); así tarda ~11 s (medido 2026-09-19).
 *
 * Los TRAMOS de esas rutas vienen con su trazado (`out geom`): así "pasa a
 * 400 m" da lo mismo que la consulta en vivo (`rel(around:400)[route=bus]`),
 * que cuenta toda ruta con algún miembro cerca. A muchas rutas de OpenStreetMap
 * les faltan las paradas pero nunca el trazado: solo con paradas, Perón 4227
 * perdía las líneas 19 y 109 (medido 2026-09-19).
 *
 * Solo se guardan filas DE la celda: cada fila pertenece a una sola celda y la
 * actualización de una celda puede borrar sin miedo lo que ya no vino. Un tramo
 * es de la celda donde está su primer punto dentro del AMBA (la misma regla que
 * `scripts/mapa-extraer-osm.py`).
 */
import { celdaDe, dentroDelAmba, type Celda } from './celdas'
import { lineaDeColectivo, lineaDeRuta, nombreUtil, ordenarLineasColectivo, tipoDeEstacion } from './normalizar'

export type TipoFila = 'subte' | 'tren' | 'plaza' | 'colegio' | 'universidad' | 'hospital' | 'parada' | 'recorrido'

export interface FilaMapa {
  osm_id: string
  tipo: TipoFila
  nombre: string
  lineas: string[]
  /** El punto de la fila; en un recorrido, su primer punto dentro del AMBA (define la celda). */
  lat: number
  lng: number
  celda: string
  /** Solo recorridos: el trazado completo, en [lng, lat] (el orden de WKT y GeoJSON). */
  trazo?: Array<[number, number]>
}

export function consultaCelda(c: Celda): string {
  const b = `(${c.sur},${c.oeste},${c.norte},${c.este})`
  return `[out:json][timeout:60];
node${b}[railway=station]->.estaciones;
foreach.estaciones->.s(
  .s out;
  rel(bn.s)[public_transport=stop_area]->.sa;
  node(r.sa)->.andenes;
  (rel(bn.andenes)[route~"^(subway|train|light_rail|tram)$"]; rel(bn.s)[route~"^(subway|train|light_rail|tram)$"];);
  out tags;
);
(
  nwr${b}[leisure=park][name];
  nwr${b}[amenity~"^(school|college|university|hospital)$"][name];
);
out center tags;
node${b}[highway=bus_stop]->.paradas;
rel(bn.paradas)[route=bus]->.rutasParadas;
rel${b}[route=bus]->.rutasCelda;
way(r.rutasCelda)${b}->.tramos;
rel(bw.tramos)[route=bus]->.rutasTramos;
(.rutasParadas; .rutasTramos;)->.rutas;
.rutas out body;
.paradas out skel;
.tramos out geom;`
}

interface Elemento {
  type?: unknown
  id?: unknown
  lat?: unknown
  lon?: unknown
  center?: { lat?: unknown; lon?: unknown }
  tags?: Record<string, unknown>
  members?: Array<{ type?: unknown; ref?: unknown }>
  geometry?: Array<{ lat?: unknown; lon?: unknown } | null>
}

const PREFIJO: Record<string, string> = { node: 'n', way: 'w', relation: 'r' }

/** Una coordenada que Postgres acepta: el JSON de un servicio público puede traer cualquier cosa. */
function coordenadaValida(lat: unknown, lng: unknown): lat is number {
  return typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)
    && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
}

function punto(e: Elemento): { lat: number; lng: number } | null {
  const lat = e.lat ?? e.center?.lat
  const lng = e.lon ?? e.center?.lon
  return coordenadaValida(lat, lng) ? { lat, lng: lng as number } : null
}

function tipoDeLugar(tags: Record<string, unknown>): TipoFila | null {
  if (tags.amenity === 'hospital') return 'hospital'
  if (tags.amenity === 'university' || tags.amenity === 'college') return 'universidad'
  if (tags.amenity === 'school') return 'colegio'
  if (tags.leisure === 'park') return 'plaza'
  return null
}

/** La MISMA asignación que la carga desde el archivo (`celdaDe`), incluso en los bordes del AMBA. */
function deLaCelda(c: Celda, p: { lat: number; lng: number }): boolean {
  return celdaDe(p.lat, p.lng)?.id === c.id
}

export function filasDesdeRespuesta(json: unknown, c: Celda): FilaMapa[] {
  const elementos = (json as { elements?: unknown } | null)?.elements
  if (!Array.isArray(elementos)) return []

  const filas: FilaMapa[] = []
  let estacionActual: FilaMapa | null = null
  const rutasDe = new Map<FilaMapa, { rutas: Set<string>; tagsDicenSubte: boolean }>()
  const lineasPorParada = new Map<number, Set<string>>()
  const puntoDeParada = new Map<number, { lat: number; lng: number }>()
  const lineasPorTramo = new Map<number, Set<string>>()
  const trazoDeTramo = new Map<number, Array<[number, number]>>()

  for (const e of elementos as Elemento[]) {
    const tags = e?.tags && typeof e.tags === 'object' ? e.tags : {}

    if (e?.type === 'relation' && tags.route === 'bus') {
      const linea = lineaDeColectivo(tags)
      if (!linea) continue
      for (const m of e.members ?? []) {
        if (typeof m?.ref !== 'number') continue
        const destino = m.type === 'node' ? lineasPorParada : m.type === 'way' ? lineasPorTramo : null
        if (!destino) continue
        const set = destino.get(m.ref) ?? new Set<string>()
        set.add(linea)
        destino.set(m.ref, set)
      }
      continue
    }
    // Tramo de `out geom`: el único elemento que trae `geometry`.
    if (e?.type === 'way' && Array.isArray(e.geometry) && typeof e.id === 'number') {
      estacionActual = null
      const trazo: Array<[number, number]> = []
      for (const g of e.geometry) {
        if (coordenadaValida(g?.lat, g?.lon)) trazo.push([g.lon as number, g.lat])
      }
      trazoDeTramo.set(e.id, trazo)
      continue
    }
    if (e?.type === 'relation' && typeof tags.route === 'string' && !e.center) {
      // Ruta de subte/tren: pertenece a la última estación (orden del foreach).
      // El tipo sale de las rutas al final (`tipoDeEstacion`): la misma regla que
      // `scripts/mapa-extraer-osm.py`, o el refresco cambiaría el tipo.
      const linea = lineaDeRuta(tags)
      if (estacionActual && linea) {
        if (!estacionActual.lineas.includes(linea)) estacionActual.lineas.push(linea)
        rutasDe.get(estacionActual)?.rutas.add(String(tags.route))
      }
      continue
    }

    // Parada de `out skel`: sin tags, solo coordenadas.
    if (e?.type === 'node' && !e.tags && typeof e.id === 'number') {
      const p = punto(e)
      if (p) puntoDeParada.set(e.id, p)
      continue
    }

    estacionActual = null
    const p = punto(e)
    const nombre = nombreUtil(tags.name) ?? ''
    const prefijo = PREFIJO[String(e?.type)]
    if (!p || !nombre || !prefijo || typeof e.id !== 'number' || !deLaCelda(c, p)) continue
    const osm_id = `${prefijo}${e.id}`

    if (tags.railway === 'station') {
      const esSubte = tags.station === 'subway' || /subte/i.test(String(tags.network ?? ''))
      estacionActual = { osm_id, tipo: esSubte ? 'subte' : 'tren', nombre, lineas: [], ...p, celda: c.id }
      rutasDe.set(estacionActual, { rutas: new Set(), tagsDicenSubte: esSubte })
      filas.push(estacionActual)
      continue
    }
    const tipo = tipoDeLugar(tags)
    // Una relación es un área solo si es multipolygon o boundary: es lo único que
    // arma osmium en `scripts/mapa-extraer-osm.py` (Plaza Herrera, r6582137, no
    // tiene type y la carga completa no la tiene).
    const esArea = e.type !== 'relation' || tags.type === 'multipolygon' || tags.type === 'boundary'
    if (tipo && esArea) filas.push({ osm_id, tipo, nombre, lineas: [], ...p, celda: c.id })
  }

  for (const [id, lineas] of lineasPorParada) {
    const p = puntoDeParada.get(id)
    if (!p || !deLaCelda(c, p)) continue
    filas.push({ osm_id: `n${id}`, tipo: 'parada', nombre: '', lineas: ordenarLineasColectivo(lineas), ...p, celda: c.id })
  }
  // Tipo por sus rutas y orden estable de sus líneas (el extractor usa `sorted`).
  for (const [estacion, { rutas, tagsDicenSubte }] of rutasDe) {
    estacion.tipo = tipoDeEstacion(rutas, tagsDicenSubte)
    estacion.lineas.sort()
  }
  for (const [id, trazo] of trazoDeTramo) {
    const lineas = lineasPorTramo.get(id)
    if (!lineas?.size || trazo.length < 2) continue
    const primero = trazo.find(([lng, lat]) => dentroDelAmba(lat, lng))
    if (!primero || celdaDe(primero[1], primero[0])?.id !== c.id) continue
    filas.push({
      osm_id: `w${id}`, tipo: 'recorrido', nombre: '', lineas: ordenarLineasColectivo(lineas),
      lat: primero[1], lng: primero[0], celda: c.id, trazo,
    })
  }
  return filas
}
