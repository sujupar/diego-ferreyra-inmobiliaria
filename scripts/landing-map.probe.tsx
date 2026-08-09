/**
 * Probe de render del mapa estático (Task 8 del plan landing-alta-conversion).
 * Correr: node --import tsx scripts/landing-map.probe.tsx
 *
 * Verifica contra el HTML real: (1) roundtrip geométrico — el tile CENTRAL del
 * mosaico, invertido con la fórmula inversa slippy-map, tiene que contener la
 * coordenada pedida; (2) el tile central existe de verdad en OSM (HTTP 200);
 * (3) pin, atribución y las ramas de LocationShowcase.
 */
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement as h } from 'react'
import { StaticMapTiles } from '../components/landing/luxury/StaticMapTiles'
import { LocationShowcase } from '../components/landing/luxury/LocationShowcase'

/** Inversa slippy-map (fórmula de la wiki OSM): esquina NW del tile. */
function tileToLatLng(x: number, y: number, zoom: number) {
  const n = 2 ** zoom
  const lng = (x / n) * 360 - 180
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
  return { lat, lng }
}

async function main() {
  // Obelisco de Buenos Aires
  const LAT = -34.6037, LNG = -58.3816, ZOOM = 15
  const html = renderToStaticMarkup(h(StaticMapTiles, { lat: LAT, lng: LNG }))
  if (!html.includes('tile.openstreetmap.org/15/')) throw new Error('sin tiles de zoom 15')
  if (!html.includes('© OpenStreetMap')) throw new Error('sin atribución OSM')
  if (!html.includes('<svg')) throw new Error('sin pin')

  const coords = [...html.matchAll(/openstreetmap\.org\/\d+\/(\d+)\/(\d+)\.png/g)]
    .map(m => ({ x: Number(m[1]), y: Number(m[2]) }))
  if (coords.length !== 15) throw new Error(`esperaba 15 tiles (5x3), hay ${coords.length}`)

  // Tile central = mediana de x e y del mosaico.
  const xs = [...new Set(coords.map(c => c.x))].sort((a, b) => a - b)
  const ys = [...new Set(coords.map(c => c.y))].sort((a, b) => a - b)
  const cx = xs[Math.floor(xs.length / 2)], cy = ys[Math.floor(ys.length / 2)]

  // Roundtrip: la coordenada tiene que caer DENTRO del tile central.
  const nw = tileToLatLng(cx, cy, ZOOM)
  const se = tileToLatLng(cx + 1, cy + 1, ZOOM)
  if (!(LNG >= nw.lng && LNG < se.lng)) throw new Error(`lng fuera del tile central: ${nw.lng}..${se.lng}`)
  if (!(LAT <= nw.lat && LAT > se.lat)) throw new Error(`lat fuera del tile central: ${se.lat}..${nw.lat}`)

  // El tile central existe de verdad (validación real contra OSM).
  const res = await fetch(`https://tile.openstreetmap.org/${ZOOM}/${cx}/${cy}.png`, {
    headers: { 'User-Agent': 'diego-ferreyra-inmobiliaria-qa/1.0' },
  })
  if (!res.ok) throw new Error(`el tile central respondió ${res.status}`)

  const conMapa = renderToStaticMarkup(h(LocationShowcase, {
    neighborhood: 'Martínez', city: 'Buenos Aires', body: 'Texto de zona',
    showMap: true, lat: -34.49, lng: -58.5,
  }))
  if (!conMapa.includes('tile.openstreetmap.org')) throw new Error('LocationShowcase no muestra el mapa')
  if (!conMapa.includes('Texto de zona')) throw new Error('LocationShowcase perdió el body')

  const sinCoords = renderToStaticMarkup(h(LocationShowcase, {
    neighborhood: 'Martínez', city: 'Buenos Aires', body: 'Texto',
    showMap: true, lat: null, lng: null,
  }))
  if (sinCoords.includes('tile.openstreetmap.org')) throw new Error('mapa sin coordenadas (no debería)')

  const apagado = renderToStaticMarkup(h(LocationShowcase, {
    neighborhood: 'Martínez', city: 'Buenos Aires', body: 'Texto',
    showMap: false, lat: -34.49, lng: -58.5,
  }))
  if (apagado.includes('tile.openstreetmap.org')) throw new Error('showMap=false debe apagar el mapa')

  console.log('OK mapa estático — 15 tiles, roundtrip del tile central, tile real en OSM (200), pin, atribución, y las 3 ramas de LocationShowcase')
}

main().catch(e => { console.error(e); process.exit(1) })
