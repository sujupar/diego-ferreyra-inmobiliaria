/**
 * Render de prueba de la variante B. Existe porque Turbopack no arranca en esta
 * máquina (el acento de "Gestión" en la ruta), así que `next dev` no es opción:
 * esto verifica que el componente RENDERIZA y que el texto de la oferta está,
 * que es lo que un typecheck no puede decir.
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TasacionNetaClient } from '../app/(funnels)/tasacion-directa/TasacionNetaClient'

const html = renderToStaticMarkup(
  <TasacionNetaClient
    testimonials={[{
      key: 'federico', clientName: 'Federico', location: 'Zona Norte',
      title: 'Venta récord', resultBadge: 'Vendió en 25 días',
      quote: 'Vendimos 3 propiedades.', videoUrl: '/v.mp4',
      posterUrl: '/p.jpg', isVertical: true,
    }]}
    heroVideoUrl="/hero.mp4"
    heroPosterUrl="/hero.jpg"
    logoUrl="/logo.png"
    pixelId="000"
  />,
)

const debeEstar: [string, string][] = [
  ['titular', 'No es cuánto pedís por tu propiedad'],
  ['reencuadre', 'cuánto te queda'],
  ['promesa 72h', '72 horas'],
  ['el precio al que NO se vende', 'a cuánto no se vende'],
  ['caso: antes', 'US$221.000'],
  ['caso: después', 'US$237.600'],
  ['calificación', 'CABA o Zona Norte'],
  ['botón', 'SOLICITAR MI TASACIÓN GRATUITA'],
  ['testimonio', 'Federico'],
  ['cierre', 'sabé con cuánto te vas a quedar'],
  ['azul de marca', '#084898'],
  ['verde solo en el botón', 'bg-[#00BF63]'],
]
let fallas = 0
for (const [que, txt] of debeEstar) {
  const ok = html.includes(txt)
  if (!ok) fallas++
  console.log(`${ok ? '✓' : '✗'} ${que}`)
}

// Lo que NO tiene que estar: los bloques que el dueño mandó sacar.
const noDebeEstar: [string, string][] = [
  ['PASO 1', 'PASO 1'],
  ['PASO 2', 'PASO 2'],
  ['bloque "lo que recibís"', 'Lo que recibís'],
  ['la línea de colegas', 'TRABAJAMOS CON COLEGAS'],
  ['las garantías sueltas', 'Sin lapicera'],
]
for (const [que, txt] of noDebeEstar) {
  const ok = !html.includes(txt)
  if (!ok) fallas++
  console.log(`${ok ? '✓' : '✗'} sin ${que}`)
}

console.log(`\n${fallas === 0 ? '✅ la landing B renderiza completa' : `❌ ${fallas} fallas`}  (${html.length} chars)`)
process.exit(fallas === 0 ? 0 : 1)
