/**
 * Probe de render de los tres paneles nuevos del tablero del embudo.
 * Correr: npx tsx scripts/embudo-insights.probe.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { CuelloDeBotellaPanel } from '@/components/embudos/CuelloDeBotellaPanel'
import { CostosPanel } from '@/components/embudos/CostosPanel'
import { CoberturaAsesoresPanel } from '@/components/embudos/CoberturaAsesoresPanel'
import type { StageTiming, FunnelCosts } from '@/lib/metrics/funnel-insights'

function check(nombre: string, html: string, textos: string[]) {
  for (const t of textos) {
    if (!html.includes(t)) throw new Error(`[${nombre}] falta en el render: ${t}`)
  }
  console.log(`✓ ${nombre}`)
}

const timings: StageTiming[] = [
  { desde: 'request', hasta: 'scheduled', n: 30, mediana_dias: 1, p75_dias: 2 },
  { desde: 'visited', hasta: 'appraisal_sent', n: 7, mediana_dias: 6, p75_dias: 9 },
]
const costs: FunnelCosts = {
  inversion: 1019737, solicitudes: 225, tasaciones: 40, captaciones: 11,
  costo_solicitud: 4532, costo_tasacion: 25493, costo_captacion: 92703,
  dias_con_dato: 24, dias_del_periodo: 88,
}

check('cuello de botella', renderToStaticMarkup(<CuelloDeBotellaPanel timings={timings} />),
  ['¿Dónde se traba?', 'Visita realizada', 'Tasación entregada', '7 casos'])

check('cuello de botella sin datos', renderToStaticMarkup(<CuelloDeBotellaPanel timings={[]} />),
  ['Sin datos suficientes'])

check('costos con cobertura parcial', renderToStaticMarkup(<CostosPanel costs={costs} />),
  ['¿Cuánto cuesta?', '24 de 88', 'mayor que el que se muestra'])

check('costos sin datos', renderToStaticMarkup(<CostosPanel costs={null} />),
  ['Sin datos para este período'])

check('comparación por origen', renderToStaticMarkup(
  <CostosPanel costs={costs} porOrigen={[
    { origen: 'embudo', solicitudes: 225, captaciones: 8 },
    { origen: 'referido', solicitudes: 3, captaciones: 3 },
  ]} />),
  ['De dónde vienen', 'Embudo (pago)', 'Referido'])

check('cobertura de asesores', renderToStaticMarkup(
  <CoberturaAsesoresPanel data={{ total: 815, con_asesor: 28, por_mes: [{ mes: '2026-07', total: 50, con_asesor: 5 }] }} />),
  ['Por asesor', '28', '815', 'no puede medir'])

console.log('\nLos tres paneles renderizan.')
