/**
 * Probe de render del estado de resultados del embudo y los paneles de apoyo.
 * Correr: npx tsx scripts/estado-resultados.probe.tsx
 */
import { renderToStaticMarkup } from 'react-dom/server'
import React from 'react'
import { EstadoResultadosEmbudo } from '@/components/metrics/EstadoResultadosEmbudo'
import { CostosPanel } from '@/components/embudos/CostosPanel'
import { CoberturaAsesoresPanel } from '@/components/embudos/CoberturaAsesoresPanel'
import type { StatementStage, FunnelCosts } from '@/lib/metrics/funnel-insights'

function check(nombre: string, html: string, textos: string[]) {
  for (const t of textos) {
    if (!html.includes(t)) throw new Error(`[${nombre}] falta en el render: ${t}`)
  }
  console.log(`✓ ${nombre}`)
}

// Los números reales del embudo 2026.
const etapas: StatementStage[] = [
  { etapa: 'request', orden: 1, cantidad: 109, mediana_dias: null },
  { etapa: 'scheduled', orden: 2, cantidad: 26, mediana_dias: 0 },
  { etapa: 'visited', orden: 3, cantidad: 14, mediana_dias: 4.1 },
  { etapa: 'appraisal_sent', orden: 4, cantidad: 7, mediana_dias: 13.4 },
  { etapa: 'captured', orden: 5, cantidad: 1, mediana_dias: 0 },
]
const inversion = [
  { campana: 'Tasación Gratuita', gasto: 2732588 },
  { campana: 'Clase Gratuita', gasto: 629465 },
]
const costs: FunnelCosts = {
  inversion: 3362053, solicitudes: 109, tasaciones: 16, captaciones: 8,
  costo_solicitud: 30845, costo_tasacion: 210128, costo_captacion: 420257,
  dias_con_dato: 211, dias_del_periodo: 218,
}

check('estado de resultados', renderToStaticMarkup(
  <EstadoResultadosEmbudo etapas={etapas} inversion={inversion} costs={costs} />),
  ['Estado de resultados del embudo', 'Inversión publicitaria', 'Tasación Gratuita',
   'Solicitud', 'Captada', 'acá se traba', 'se pierden'])

check('estado de resultados sin datos', renderToStaticMarkup(
  <EstadoResultadosEmbudo etapas={[]} inversion={[]} costs={null} />),
  ['Sin datos para este período'])

check('costos y origen', renderToStaticMarkup(
  <CostosPanel costs={costs} porOrigen={[{ origen: 'referido', solicitudes: 3, captaciones: 3 }]} />),
  ['¿Cuánto cuesta?', 'Referido'])

check('cobertura de asesores', renderToStaticMarkup(
  <CoberturaAsesoresPanel data={{ total: 815, con_asesor: 28, por_mes: [] }} />),
  ['Por asesor', 'no puede medir'])

console.log('\nEl estado de resultados renderiza.')
