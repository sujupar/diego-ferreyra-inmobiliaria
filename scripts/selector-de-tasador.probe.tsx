/**
 * Renderiza las dos tarjetas del selector de tasador en cada estado y verifica
 * que el texto clave de cada uno esté en el HTML. Existe porque los tests con
 * DOM tardan más de un minuto en arrancar en esta máquina (ver CLAUDE.md).
 *
 * Uso: node --import tsx scripts/selector-de-tasador.probe.tsx
 */
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { SelectorDeTasador, type EstadoIAEnPantalla } from '@/components/appraisal/SelectorDeTasador'
import type { ValuationResult } from '@/lib/valuation/calculator'
import type { AiValuationResult, ValuationSource } from '@/lib/valuation/ia-tipos'

const clasico = {
  publicationPrice: 100_000, saleValue: 95_000, moneyInHand: 90_000, subjectPriceM2: 2_000, currency: 'USD',
} as ValuationResult
const ia = {
  ...clasico, publicationPrice: 110_000,
  ai: { confidence: 'media', summary: 'Zona homogénea.', model: 'gpt-4o-mini' },
} as unknown as AiValuationResult

const casos: Array<[EstadoIAEnPantalla, AiValuationResult | null, ValuationSource, string]> = [
  ['sin_generar', null, 'calculator', 'Generar'],
  ['analizando', null, 'calculator', 'Analizando comparables'],
  ['fallida', null, 'calculator', 'Reintentar'],
  ['lista', ia, 'ai', '+10.0% vs. clásico'],
  ['desactualizada', ia, 'calculator', 'Desactualizada: cambiaron los datos'],
  ['no_configurado', null, 'calculator', 'no configurado'],
]

let fallas = 0
for (const [estado, snapshot, elegido, esperado] of casos) {
  const html = renderToStaticMarkup(
    <SelectorDeTasador
      clasico={clasico} ia={snapshot} estadoIA={estado} elegido={elegido}
      onElegir={() => undefined} onGenerar={() => undefined} errorIA="se cortó"
    />,
  )
  const ok = html.includes(esperado) && html.includes('Tasador clásico') && html.includes('Tasador IA') && html.includes('En uso')
  console.log(`${ok ? '✓' : '✗'} ${estado}: ${esperado}`)
  if (!ok) { fallas++; console.log(html.slice(0, 600)) }
}
// El mensaje de error real se muestra en el estado fallida.
const conError = renderToStaticMarkup(
  <SelectorDeTasador clasico={clasico} ia={null} estadoIA="fallida" elegido="calculator" errorIA="Tasador IA: el modelo tardó más de 20 segundos" onElegir={() => undefined} onGenerar={() => undefined} />,
)
const okError = conError.includes('tardó más de 20 segundos')
console.log(`${okError ? '✓' : '✗'} fallida muestra el motivo real`)
if (!okError) fallas++

if (fallas) { console.error(`${fallas} casos fallaron`); process.exit(1) }
console.log('\n✅ selector de tasador: todos los estados renderizan lo esperado')
