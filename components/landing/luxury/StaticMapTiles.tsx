/**
 * Mapa ESTÁTICO no interactivo (decisión del usuario 2026-08-06): mosaico de
 * tiles OSM calculado server-side + pin SVG centrado. Sin Leaflet, sin JS y sin
 * API key — el mismo proveedor de tiles que ya usa GeoPinMap en los wizards.
 * No interactivo por construcción: son <img> planas, no hay handlers.
 * La atribución © OpenStreetMap es obligatoria por la licencia de los tiles.
 *
 * Geometría: el mosaico de COLS×ROWS tiles se desplaza para que el punto
 * (lat,lng) quede EXACTO en el centro del contenedor; el pin se dibuja aparte,
 * anclado al centro del contenedor. Verificado con scripts/landing-map.probe.tsx.
 */
const TILE = 256
const COLS = 5 // 1280 px de ancho cubierto
const ROWS = 3 // 768 px de alto cubierto

function tileXY(lat: number, lng: number, zoom: number) {
  const n = 2 ** zoom
  const x = ((lng + 180) / 360) * n
  const rad = (lat * Math.PI) / 180
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
  return { x, y }
}

export function StaticMapTiles({ lat, lng, zoom = 15 }: { lat: number; lng: number; zoom?: number }) {
  const { x, y } = tileXY(lat, lng, zoom)
  const cx = Math.floor(x)
  const cy = Math.floor(y)
  const firstCol = cx - Math.floor(COLS / 2)
  const firstRow = cy - Math.floor(ROWS / 2)
  // Píxel del punto DENTRO del mosaico (origen = esquina del primer tile).
  const pointPx = { x: (x - firstCol) * TILE, y: (y - firstRow) * TILE }

  const tiles: { tx: number; ty: number; left: number; top: number }[] = []
  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      tiles.push({ tx: firstCol + c, ty: firstRow + r, left: c * TILE, top: r * TILE })
    }
  }

  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border"
      style={{ aspectRatio: '16 / 9', borderColor: 'var(--lx-line)' }}
      aria-hidden
    >
      {/* El mosaico entero se corre para que (lat,lng) caiga en el centro. */}
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: COLS * TILE,
          height: ROWS * TILE,
          transform: `translate(${-pointPx.x}px, ${-pointPx.y}px)`,
        }}
      >
        {tiles.map(t => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${t.tx}-${t.ty}`}
            src={`https://tile.openstreetmap.org/${zoom}/${t.tx}/${t.ty}.png`}
            alt=""
            loading="lazy"
            className="absolute max-w-none"
            style={{ width: TILE, height: TILE, left: t.left, top: t.top }}
          />
        ))}
      </div>
      <svg
        viewBox="0 0 24 24"
        className="absolute"
        style={{ width: 36, height: 36, left: '50%', top: '50%', transform: 'translate(-50%, -100%)' }}
      >
        <path d="M12 0C7 0 3 4 3 9c0 6.5 9 15 9 15s9-8.5 9-15c0-5-4-9-9-9z" fill="var(--lx-navy, #1d2d44)" />
        <circle cx="12" cy="9" r="3.4" fill="#fff" />
      </svg>
      <p
        className="absolute bottom-1 right-2 text-[10px]"
        style={{ color: 'rgba(0,0,0,0.55)', textShadow: '0 0 3px rgba(255,255,255,0.9)' }}
      >
        © OpenStreetMap
      </p>
    </div>
  )
}
