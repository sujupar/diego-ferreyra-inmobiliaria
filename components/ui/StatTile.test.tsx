// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
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

  // I1: tone='alerta' debe tener un segundo canal (ícono) además del color
  it('tone=alerta muestra un ícono de alerta', () => {
    const { container } = render(<StatTile label="Crítico" value={12} context="sobre 100" tone="alerta" />)
    const icon = container.querySelector('svg')
    expect(icon).toBeInTheDocument()
    expect(icon).toHaveClass('lucide-circle-alert')
  })

  it('tone=neutral no muestra ícono de alerta', () => {
    const { container } = render(<StatTile label="Normal" value={12} context="sobre 100" tone="neutral" />)
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBe(0)
  })

  // M1: context vacío o solo espacios debe dispara console.warn
  it('context vacío dispara console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<StatTile label="Test" value={5} context="" />)
    expect(warnSpy).toHaveBeenCalledWith('StatTile: context no puede estar vacío. Pasó una cadena en blanco.')
    warnSpy.mockRestore()
  })

  it('context solo espacios dispara console.warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<StatTile label="Test" value={5} context="   " />)
    expect(warnSpy).toHaveBeenCalledWith('StatTile: context no puede estar vacío. Pasó una cadena en blanco.')
    warnSpy.mockRestore()
  })

  // M2: NaN debe tratarse como null (sin dato)
  it('NaN se muestra como "Sin datos"', () => {
    render(<StatTile label="Promedio" value={NaN} context="0 de 5 disponibles" />)
    expect(screen.getByText('Sin datos')).toBeInTheDocument()
    expect(screen.queryByText('NaN')).not.toBeInTheDocument()
  })

  // I1-accesibilidad: texto accesible para lectores de pantalla
  it('tone=alerta tiene texto accesible "Alerta:"', () => {
    render(<StatTile label="Crítico" value={12} context="sobre 100" tone="alerta" />)
    expect(screen.getByText('Alerta:')).toBeInTheDocument()
  })

  it('tone=neutral no tiene texto accesible de alerta', () => {
    render(<StatTile label="Normal" value={12} context="sobre 100" tone="neutral" />)
    expect(screen.queryByText('Alerta:')).not.toBeInTheDocument()
  })

  // M3: Infinity debe tratarse como null (sin dato)
  it('Infinity se muestra como "Sin datos"', () => {
    render(<StatTile label="Ratio" value={Infinity} context="0 de 5 disponibles" />)
    expect(screen.getByText('Sin datos')).toBeInTheDocument()
    expect(screen.queryByText('Infinity')).not.toBeInTheDocument()
  })

  it('-Infinity se muestra como "Sin datos"', () => {
    render(<StatTile label="Ratio" value={-Infinity} context="0 de 5 disponibles" />)
    expect(screen.getByText('Sin datos')).toBeInTheDocument()
    expect(screen.queryByText('Infinity')).not.toBeInTheDocument()
  })
})
