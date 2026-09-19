/**
 * Lugares reales alrededor de la propiedad, con distancias CALCULADAS.
 *
 * Por qué del mapa y no de la web (medido el 2026-09-19): dos búsquedas web
 * sobre la misma dirección dieron 300 m y 800 m al mismo subte. Una distancia
 * falsa publicada en un portal es un reclamo seguro. OpenStreetMap trae las
 * estaciones, plazas, colegios y hospitales con coordenadas; la distancia sale
 * de la cuenta, no de lo que alguien escribió en un aviso.
 *
 * Es línea recta: se redondea a cuadras ("a unas 6 cuadras") y el prompt pide
 * decirlo así, aproximado, nunca como tiempo exacto de caminata.
 *
 * Overpass es un servicio público gratuito con límites de uso: `buscarLugaresCercanos`
 * nunca lanza, devuelve `null` si falla, y el paso de zona sigue sin distancias.
 */
import type { LugarCercano, TipoLugar } from './tipos'

const RADIO_ESTACIONES_M = 1500
// 1 km: los parques grandes (Centenario, a 830 m de Perón 4227) son los que
// valen la pena nombrar y quedaban afuera con 800 m.
const RADIO_PLAZAS_M = 1000
const RADIO_COLEGIOS_M = 600
const RADIO_HOSPITALES_M = 500
/** 400 m = unas 4 cuadras: "pasa cerca" de verdad, no "circula por el barrio". */
const RADIO_COLECTIVOS_M = 400

/** Cuántos de cada tipo llegan al prompt: más es ruido, no información. */
const TOPE: Record<TipoLugar, number> = {
  subte: 3, tren: 2, plaza: 4, colegio: 4, universidad: 2, hospital: 1,
}

/**
 * Lo que el mapa etiqueta como escuela pero no le sirve a un comprador que
 * elige barrio por los colegios de sus hijos (relevado en Almagro: la mitad de
 * la lista eran centros para adultos y de formación profesional).
 */
const COLEGIO_NO_RELEVANTE = /adultos|formaci[oó]n profesional|alfabetizaci|\bCENOF\b|bachillerato popular|centro educativo de nivel|\bUGEE\b|\bCESAC\b/i

export function distanciaMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000
  const rad = (x: number) => (x * Math.PI) / 180
  const dLat = rad(b.lat - a.lat)
  const dLng = rad(b.lng - a.lng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2
  return Math.round(2 * R * Math.asin(Math.sqrt(s)))
}

/**
 * Una sola consulta. El `foreach` devuelve cada estación seguida de sus rutas:
 * la línea no está en la estación sino en la relación de ruta, a la que se llega
 * por el "stop_area" (así están cargados el subte y los trenes de Buenos Aires).
 */
export function consultaOverpass(lat: number, lng: number): string {
  const p = `${lat},${lng}`
  return `[out:json][timeout:12];
node(around:${RADIO_ESTACIONES_M},${p})[railway=station]->.st;
foreach.st->.s(
  .s out;
  rel(bn.s)[public_transport=stop_area]->.sa;
  node(r.sa)->.stops;
  (rel(bn.stops)[route~"^(subway|train|light_rail|tram)$"]; rel(bn.s)[route~"^(subway|train|light_rail|tram)$"];);
  out tags;
);
(
  nwr(around:${RADIO_PLAZAS_M},${p})[leisure=park][name];
  nwr(around:${RADIO_COLEGIOS_M},${p})[amenity~"^(school|college|university)$"][name];
  nwr(around:${RADIO_HOSPITALES_M},${p})[amenity=hospital][name];
);
out center tags;
rel(around:${RADIO_COLECTIVOS_M},${p})[route=bus];
out tags;`
}

interface ElementoOverpass {
  type?: unknown
  lat?: unknown
  lon?: unknown
  center?: { lat?: unknown; lon?: unknown }
  tags?: Record<string, unknown>
}

function coordenadas(e: ElementoOverpass): { lat: number; lng: number } | null {
  const lat = typeof e.lat === 'number' ? e.lat : typeof e.center?.lat === 'number' ? e.center.lat : null
  const lng = typeof e.lon === 'number' ? e.lon : typeof e.center?.lon === 'number' ? e.center.lon : null
  return lat === null || lng === null ? null : { lat, lng }
}

function tipoDeLugar(tags: Record<string, unknown>): TipoLugar | null {
  if (tags.amenity === 'hospital') return 'hospital'
  if (tags.amenity === 'university' || tags.amenity === 'college') return 'universidad'
  if (tags.amenity === 'school') return 'colegio'
  if (tags.leisure === 'park') return 'plaza'
  return null
}

/** "Línea B: Leandro N. Alem → Juan Manuel de Rosas" → "Línea B". */
function lineaDeRuta(tags: Record<string, unknown>): string | undefined {
  const nombre = typeof tags.name === 'string' ? tags.name.split(':')[0].trim() : ''
  if (nombre) return nombre
  return typeof tags.ref === 'string' && tags.ref.trim() ? `Línea ${tags.ref.trim()}` : undefined
}

export function lugaresDesdeOverpass(json: unknown, origen: { lat: number; lng: number }): LugarCercano[] {
  const elementos = (json as { elements?: unknown } | null)?.elements
  if (!Array.isArray(elementos)) return []

  const lugares: LugarCercano[] = []
  let estacionActual: LugarCercano | null = null

  for (const crudo of elementos as ElementoOverpass[]) {
    const tags = crudo?.tags && typeof crudo.tags === 'object' ? crudo.tags : {}

    if (crudo?.type === 'relation' && tags.route === 'bus') continue // van por colectivosDesdeOverpass
    if (crudo?.type === 'relation' && typeof tags.route === 'string') {
      // Una ruta pertenece a la última estación leída (orden del foreach).
      if (estacionActual && !estacionActual.linea) {
        estacionActual.linea = lineaDeRuta(tags)
        estacionActual.tipo = tags.route === 'subway' ? 'subte' : 'tren'
      }
      continue
    }

    // Cualquier otro elemento corta la racha de rutas de la estación anterior.
    estacionActual = null
    const nombre = typeof tags.name === 'string' ? tags.name.trim() : ''
    const punto = coordenadas(crudo)
    if (!nombre || !punto) continue
    const metros = distanciaMetros(origen, punto)
    const cuadras = Math.max(1, Math.round(metros / 100))

    if (tags.railway === 'station') {
      const esSubte = tags.station === 'subway' || /subte/i.test(String(tags.network ?? ''))
      estacionActual = { nombre, tipo: esSubte ? 'subte' : 'tren', metros, cuadras }
      lugares.push(estacionActual)
      continue
    }

    const tipo = tipoDeLugar(tags)
    if (!tipo) continue
    if (tipo === 'colegio' && COLEGIO_NO_RELEVANTE.test(nombre)) continue
    lugares.push({ nombre, tipo, metros, cuadras })
  }

  // Dedupe por nombre+tipo quedándose con el más cercano; después tope por tipo.
  const porClave = new Map<string, LugarCercano>()
  for (const l of lugares) {
    const clave = `${l.tipo}|${l.nombre.toLowerCase()}`
    const previo = porClave.get(clave)
    if (!previo || l.metros < previo.metros) porClave.set(clave, l)
  }
  const ordenados = [...porClave.values()].sort((a, b) => a.metros - b.metros)
  const usados: Partial<Record<TipoLugar, number>> = {}
  return ordenados.filter(l => {
    const n = (usados[l.tipo] ?? 0) + 1
    usados[l.tipo] = n
    return n <= TOPE[l.tipo]
  })
}

/**
 * Líneas de colectivo que pasan cerca, sin ramales ("24-1", "160AG" → "24",
 * "160") y en orden numérico. Salen del mapa porque la web decía "algunas
 * líneas que circulan por Almagro", que no es lo mismo que "pasan a 4 cuadras".
 */
export function colectivosDesdeOverpass(json: unknown): string[] {
  const elementos = (json as { elements?: unknown } | null)?.elements
  if (!Array.isArray(elementos)) return []
  const lineas = new Set<string>()
  for (const e of elementos as ElementoOverpass[]) {
    const tags = e?.tags && typeof e.tags === 'object' ? e.tags : {}
    if (e?.type !== 'relation' || tags.route !== 'bus') continue
    const ref = typeof tags.ref === 'string' ? tags.ref.match(/^\d+/)?.[0] : undefined
    const deNombre = typeof tags.name === 'string' ? tags.name.match(/l[ií]nea\s+(\d+)/i)?.[1] : undefined
    const linea = ref ?? deNombre
    if (linea) lineas.add(String(Number(linea)))
  }
  return [...lineas].sort((a, b) => Number(a) - Number(b))
}

const ETIQUETA: Record<TipoLugar, string> = {
  subte: 'Subte', tren: 'Tren', plaza: 'Plaza/parque', colegio: 'Colegio',
  universidad: 'Universidad/instituto', hospital: 'Hospital',
}

/** Bloque MAPA del prompt y de la pantalla "Qué tuvo en cuenta". */
export function lineasATexto(lugares: LugarCercano[]): string {
  return lugares
    .map(l => {
      const cabeza = l.tipo === 'subte' || l.tipo === 'tren'
        ? `${ETIQUETA[l.tipo]}${l.linea ? ` ${l.linea}` : ''} – Estación ${l.nombre}`
        : `${ETIQUETA[l.tipo]}: ${l.nombre}`
      const cuadras = l.cuadras === 1 ? 'a 1 cuadra' : `a unas ${l.cuadras} cuadras`
      return `- ${cabeza}: ${l.metros} m (${cuadras})`
    })
    .join('\n')
}

/**
 * Servidores públicos de Overpass que se consultan A LA VEZ; gana el primero
 * que responde bien. Medido el 2026-09-19 con la misma consulta: el principal
 * tardó 3 s y 13 s según el momento, y de los espejos solo el de mail.ru
 * respondió (kumi.systems y private.coffee no contestaron en 20 s).
 */
export const SERVIDORES_OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
]

async function consultarServidor(url: string, cuerpo: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      // Overpass pide identificarse; sin esto puede bloquear.
      'user-agent': 'DiegoFerreyraInmobiliaria/1.0 (contacto@inmodf.com.ar)',
    },
    body: cuerpo,
  })
  if (!res.ok) throw new Error(`${url} respondió ${res.status}`)
  return res.json()
}

/** Nunca lanza: `null` = el mapa no respondió y el texto sale sin distancias. */
export async function buscarLugaresCercanos(lat: number, lng: number, signal: AbortSignal): Promise<{ lugares: LugarCercano[]; colectivos: string[] } | null> {
  // Cuando uno responde, se cancelan los demás para no dejar pedidos colgados.
  const alcanzo = new AbortController()
  const senal = AbortSignal.any([signal, alcanzo.signal])
  const cuerpo = `data=${encodeURIComponent(consultaOverpass(lat, lng))}`
  try {
    const json = await Promise.any(SERVIDORES_OVERPASS.map(url => consultarServidor(url, cuerpo, senal)))
    return { lugares: lugaresDesdeOverpass(json, { lat, lng }), colectivos: colectivosDesdeOverpass(json) }
  } catch (err) {
    const motivos = err instanceof AggregateError ? err.errors.map(e => (e instanceof Error ? e.message : String(e))) : [String(err)]
    console.warn('[descripcion/zona-mapa] ningún servidor de Overpass respondió:', motivos.join(' | '))
    return null
  } finally {
    alcanzo.abort()
  }
}
