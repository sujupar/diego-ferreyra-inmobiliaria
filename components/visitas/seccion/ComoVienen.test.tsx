// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { ComoVienen } from './ComoVienen'
import { calcularMetricas } from '@/lib/visitas/metricas'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

const AHORA = new Date('2026-10-15T15:00:00Z')
const conDatos = () => calcularMetricas([
  ...Array.from({ length: 10 }, () => v({ status: 'pending_confirmation', confirmed_at: null })),
  ...Array.from({ length: 6 }, () => v({ status: 'scheduled' })),
  ...Array.from({ length: 4 }, () => v({ status: 'completed', origin: 'portal', origin_detail: 'zonaprop' })),
], AHORA)

describe('ComoVienen', () => {
  it('el embudo tiene los 5 pasos y resalta UN solo salto', () => {
    const { container } = render(<ComoVienen metricas={conDatos()} mostrarAsesor opiniones={[]} />)
    expect(container.querySelectorAll('[data-salto="true"]')).toHaveLength(1)
    expect(container.querySelector('[data-salto="true"]')).toHaveTextContent('Se realizaron')
    expect(screen.getByText('Respondieron la encuesta')).toBeInTheDocument()
    expect(screen.getByText('Dijeron cuánto ofertarían')).toBeInTheDocument()
  })
  it('por origen con el % realizado y su base', () => {
    render(<ComoVienen metricas={conDatos()} mostrarAsesor opiniones={[]} />)
    expect(screen.getByText('Consulta de portal')).toBeInTheDocument()
    expect(screen.getByText('4 visitas · 100 % se realizó (de 4 · orientativo)')).toBeInTheDocument()
  })
  it('sin visitas: sin datos en todo, y "Qué opinan" espera a la encuesta', () => {
    render(<ComoVienen metricas={calcularMetricas([], AHORA)} mostrarAsesor opiniones={[]} />)
    expect(screen.getByText('Todavía no hay visitas en este período.')).toBeInTheDocument()
    expect(screen.getByText('Sin datos — todavía nadie respondió la encuesta')).toBeInTheDocument()
  })
  it('el asesor no ve "Por asesor"', () => {
    render(<ComoVienen metricas={conDatos()} mostrarAsesor={false} opiniones={[]} />)
    expect(screen.queryByRole('heading', { name: 'Por asesor' })).not.toBeInTheDocument()
  })
})
