/**
 * Render de las secciones del Tablero con datos REALES (solo lectura): verifica
 * que cada sección arma su tabla y sus textos clave, y que ningún monto sale
 * "NaN" o "undefined". El look y los clics se miran en el navegador.
 *
 * Uso: node --require ./scripts/precarga-server-only.cjs --env-file=.env.local --import tsx scripts/tablero-render.probe.tsx
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { TooltipProvider } from '../components/ui/tooltip'
import { armarTablero } from '../lib/metrics/tablero/servidor'
import { SeccionTasacion } from '../components/metrics/tablero/SeccionTasacion'
import { SeccionCampanias } from '../components/metrics/tablero/SeccionCampanias'
import { SeccionConsultas, SeccionPlata } from '../components/metrics/tablero/SeccionResto'

async function main() {
  const t = await armarTablero({ rango: { desde: '2026-11-01', hasta: '2026-11-20' }, comparar: 'mes_anterior' })
  const html = [
    renderToStaticMarkup(<TooltipProvider><SeccionTasacion t={t} onCambio={() => {}} /></TooltipProvider>),
    renderToStaticMarkup(<TooltipProvider><SeccionCampanias t={t} /></TooltipProvider>),
    renderToStaticMarkup(<TooltipProvider><SeccionConsultas t={t} /></TooltipProvider>),
    renderToStaticMarkup(<TooltipProvider><SeccionPlata t={t} /></TooltipProvider>),
  ].join('\n')
  const texto = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  const esperados = [
    'Campaña de tasación · 1–20 nov 26', '1–20 oct 26', 'Costo por registro', 'USD 19,1', 'Embudo', 'Clics en el anuncio', 'Agendadas',
    'Landing de tasación', 'Versión B (Tasación Neta)', 'Anuncios activos', 'Campañas del período', 'Roque Pérez 3059',
    'Registros en páginas de propiedades', 'de 8 personas', 'Consultas de portales', 'Zonaprop', 'Cartera hoy', 'Margen neto', 'Reels de Instagram',
  ]
  let ok = true
  for (const e of esperados) {
    const hay = texto.includes(e)
    if (!hay) ok = false
    console.log(`${hay ? 'OK ' : 'FALTA'} ${e}`)
  }
  for (const malo of ['NaN', 'undefined', 'null', 'Infinity']) {
    const hay = new RegExp(`\\b${malo}\\b`).test(texto)
    if (hay) ok = false
    console.log(`${hay ? 'MAL' : 'OK '} sin "${malo}"`)
  }
  console.log(ok ? '\nTODO OK' : '\nHAY PROBLEMAS')
  process.exit(ok ? 0 : 1)
}
main().catch(e => { console.error(e); process.exit(1) })
