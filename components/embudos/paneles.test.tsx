// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { CuelloDeBotellaPanel } from './CuelloDeBotellaPanel'
import { CostosPanel } from './CostosPanel'
import { CoberturaAsesoresPanel } from './CoberturaAsesoresPanel'
import type { StageTiming, FunnelCosts } from '@/lib/metrics/funnel-insights'

const timings: StageTiming[] = [
  { desde: 'request', hasta: 'scheduled', n: 30, mediana_dias: 1, p75_dias: 2 },
  { desde: 'visited', hasta: 'appraisal_sent', n: 7, mediana_dias: 6, p75_dias: 9 },
]

const costsOk: FunnelCosts = {
  inversion: 1019737, solicitudes: 225, tasaciones: 40, captaciones: 11,
  costo_solicitud: 4532, costo_tasacion: 25493, costo_captacion: 92703,
  dias_con_dato: 92, dias_del_periodo: 92,
}

describe('CuelloDeBotellaPanel', () => {
  // Ojo: las etapas aparecen DOS veces a propósito — en la frase que resume el
  // cuello de botella y en la fila del listado. Por eso se usa getAllByText.
  it('nombra el paso más lento en castellano', () => {
    render(<CuelloDeBotellaPanel timings={timings} />)
    expect(screen.getAllByText(/Visita realizada/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Tasación entregada/).length).toBeGreaterThan(0)
    // Y la frase de resumen nombra el paso lento, no el rápido.
    expect(screen.getByText(/El paso más lento es de Visita realizada a Tasación entregada/)).toBeInTheDocument()
  })

  it('marca la muestra chica del paso que la tiene', () => {
    render(<CuelloDeBotellaPanel timings={timings} />)
    expect(screen.getAllByText(/7 casos/).length).toBeGreaterThan(0)
    // El paso con 30 casos no lleva el aviso de muestra chica.
    expect(screen.getByLabelText('muestra chica')).toBeInTheDocument()
  })

  it('sin datos no inventa un cuello de botella', () => {
    render(<CuelloDeBotellaPanel timings={[]} />)
    expect(screen.getByText(/sin datos suficientes/i)).toBeInTheDocument()
  })
})

describe('CostosPanel', () => {
  it('con cobertura completa muestra los costos sin advertencia', () => {
    render(<CostosPanel costs={costsOk} />)
    expect(screen.getByText(/92\.703/)).toBeInTheDocument()
    expect(screen.queryByText(/Ojo:/)).not.toBeInTheDocument()
  })

  it('con cobertura parcial advierte que el costo real es mayor', () => {
    render(<CostosPanel costs={{ ...costsOk, dias_con_dato: 24, dias_del_periodo: 88 }} />)
    expect(screen.getByText(/24 de 88/)).toBeInTheDocument()
    expect(screen.getByText(/mayor que el que se muestra/i)).toBeInTheDocument()
  })

  it('sin inversión cargada dice que no hay datos, no cero', () => {
    render(<CostosPanel costs={{ ...costsOk, inversion: 0, dias_con_dato: 0, costo_captacion: null, costo_tasacion: null, costo_solicitud: null }} />)
    expect(screen.getByText(/sin datos de inversión/i)).toBeInTheDocument()
  })

  it('sin respuesta del servidor no rompe', () => {
    render(<CostosPanel costs={null} />)
    expect(screen.getByText(/sin datos/i)).toBeInTheDocument()
  })

  it('compara lo pago contra el referido cuando hay datos por origen', () => {
    render(<CostosPanel costs={costsOk} porOrigen={[
      { origen: 'embudo', solicitudes: 225, captaciones: 8 },
      { origen: 'referido', solicitudes: 3, captaciones: 3 },
    ]} />)
    expect(screen.getByText('Embudo (pago)')).toBeInTheDocument()
    expect(screen.getByText('Referido')).toBeInTheDocument()
    expect(screen.getByText(/3 solicitudes · 3 captadas/)).toBeInTheDocument()
  })
})

describe('CoberturaAsesoresPanel', () => {
  it('muestra el problema en vez de una métrica falsa', () => {
    render(<CoberturaAsesoresPanel data={{
      total: 815, con_asesor: 28,
      por_mes: [{ mes: '2026-07', total: 50, con_asesor: 5 }],
    }} />)
    expect(screen.getByText(/28 de 815/)).toBeInTheDocument()
    expect(screen.getByText(/no puede medir/i)).toBeInTheDocument()
  })
})
