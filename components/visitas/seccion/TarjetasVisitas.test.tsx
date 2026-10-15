// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import { TarjetasVisitas } from './TarjetasVisitas'
import { calcularMetricas } from '@/lib/visitas/metricas'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

const AHORA = new Date('2026-10-15T15:00:00Z')
const tarjeta = (nombre: string) => screen.getByText(nombre).parentElement as HTMLElement

describe('TarjetasVisitas', () => {
  it('período vacío: las cinco tarjetas dicen "Sin datos", ninguna 0', () => {
    render(<TarjetasVisitas metricas={calcularMetricas([], AHORA)} etiquetaPeriodo="Últimos 30 días" />)
    expect(screen.getAllByText('Sin datos')).toHaveLength(5)
    expect(screen.queryByText('0')).not.toBeInTheDocument()
    expect(screen.queryByText('0 %')).not.toBeInTheDocument()
  })
  it('con datos: cantidad, % con su base, orientativo y las sin marcar', () => {
    const metricas = calcularMetricas([
      v({ status: 'completed', scheduled_at: '2026-10-14T13:00:00Z' }),
      v({ status: 'no_show', outcome_reason: 'no_vino', scheduled_at: '2026-10-14T13:00:00Z' }),
      v({ status: 'scheduled', scheduled_at: '2026-10-14T13:00:00Z' }),
    ], AHORA)
    render(<TarjetasVisitas metricas={metricas} etiquetaPeriodo="Últimos 30 días" />)
    expect(within(tarjeta('Agendadas')).getByText('3')).toBeInTheDocument()
    expect(within(tarjeta('Se realizaron')).getByText('50 %')).toBeInTheDocument()
    expect(within(tarjeta('Se realizaron')).getByText('de 2 con resultado · orientativo · 1 sin marcar')).toBeInTheDocument()
    expect(within(tarjeta('No se hicieron')).getByText('1 no se realizó · 0 canceladas')).toBeInTheDocument()
    expect(within(tarjeta('Encuestas respondidas')).getByText('0 %')).toBeInTheDocument()
    expect(within(tarjeta('Encuestas respondidas')).getByText('de 1 realizada · orientativo')).toBeInTheDocument()
  })
})
