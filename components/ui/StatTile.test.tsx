// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { StatTile } from './StatTile'

describe('StatTile', () => {
  it('muestra etiqueta, número y contexto', () => {
    render(<StatTile label="Propiedades publicadas" value={41} context="7 esperando revisión" />)
    expect(screen.getByText('Propiedades publicadas')).toBeInTheDocument()
    expect(screen.getByText('41')).toBeInTheDocument()
    expect(screen.getByText('7 esperando revisión')).toBeInTheDocument()
  })

  // La regla del tablero: un período sin datos dice "sin datos", nunca "$0".
  it('sin datos dice "Sin datos", no cero', () => {
    render(<StatTile label="Inversión del mes" value={null} context="0 de 31 días con dato" />)
    expect(screen.getByText('Sin datos')).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('un cero de verdad se muestra como cero', () => {
    render(<StatTile label="Sin responder" value={0} context="sobre 63 conversaciones" />)
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.queryByText('Sin datos')).not.toBeInTheDocument()
  })

  it('con href toda la tarjeta es un link', () => {
    render(<StatTile label="Pendientes" value={3} context="2 vencen hoy" href="/tasks" />)
    expect(screen.getByRole('link', { name: /Pendientes/ })).toHaveAttribute('href', '/tasks')
  })

  it('sin href no es un link', () => {
    render(<StatTile label="Pendientes" value={3} context="2 vencen hoy" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
