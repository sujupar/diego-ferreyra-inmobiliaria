// @vitest-environment happy-dom
// Humo de render de las piezas de la ficha (tarea 9.1): cada una se dibuja con su texto,
// sus marcas de accesibilidad y la clase de 44 px en táctil.
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PhoneMissed } from 'lucide-react'
import { ChipEtapa } from './ChipEtapa'
import { ChipResultado } from './ChipResultado'
import { OpcionGrande } from './OpcionGrande'
import { FiltroPastilla } from './FiltroPastilla'
import { EstadoCarga, EstadoError, EstadoVacio } from './EstadoBloque'
import { FechaRelativa } from './FechaRelativa'

const ahora = new Date('2026-11-25T13:00:00Z')

describe('ChipEtapa', () => {
  it('dibuja la etiqueta y marca la etapa', () => {
    render(<ChipEtapa clave="solicitud" etiqueta="Solicitud" />)
    const chip = screen.getByText('Solicitud')
    expect(chip).toHaveAttribute('data-etapa', 'solicitud')
    expect(chip.className).toContain('bg-brand-soft')
  })
  it('una etapa sin estilo propio usa el neutro', () => {
    render(<ChipEtapa clave="realizada" etiqueta="Realizada" />)
    expect(screen.getByText('Realizada').className).toContain('bg-secondary')
  })
})

describe('ChipResultado', () => {
  it('texto corto por defecto y largo si se pide', () => {
    const { rerender } = render(<ChipResultado resultado="volver_a_llamar" />)
    expect(screen.getByText('Volver a llamar')).toBeInTheDocument()
    rerender(<ChipResultado resultado="volver_a_llamar" largo />)
    expect(screen.getByText('Atendió · volver a llamar')).toBeInTheDocument()
  })
  it('lleva ícono además del color', () => {
    render(<ChipResultado resultado="no_atendio" />)
    expect(screen.getByText('No atendió').querySelector('svg')).not.toBeNull()
  })
})

describe('OpcionGrande', () => {
  it('es un botón con aria-pressed y 52 px en táctil', async () => {
    const onClick = vi.fn()
    render(
      <OpcionGrande Icono={PhoneMissed} presionada={false} onClick={onClick}>
        No atendió
      </OpcionGrande>,
    )
    const b = screen.getByRole('button', { name: /No atendió/ })
    expect(b).toHaveAttribute('aria-pressed', 'false')
    expect(b.className).toContain('min-h-13')
    await userEvent.setup().click(b)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('FiltroPastilla', () => {
  it('marca la elegida y avisa el cambio', async () => {
    const onCambiar = vi.fn()
    render(
      <FiltroPastilla
        etiqueta="Filtrar"
        valor="todo"
        onCambiar={onCambiar}
        opciones={[
          { valor: 'todo', etiqueta: 'Todo' },
          { valor: 'notas', etiqueta: 'Notas' },
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: 'Todo' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Notas' }).className).toContain('min-h-11')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Notas' }))
    expect(onCambiar).toHaveBeenCalledWith('notas')
  })
})

describe('EstadoBloque', () => {
  it('carga: filas grises y "Cargando…" para lectores', () => {
    render(<EstadoCarga />)
    expect(screen.getByText('Cargando…')).toHaveClass('sr-only')
  })
  it('vacío: título, texto y acción', () => {
    render(<EstadoVacio titulo="Todavía no hay notas" texto="Algo" accion={<button>Escribir una nota</button>} />)
    expect(screen.getByText('Todavía no hay notas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Escribir una nota' })).toBeInTheDocument()
  })
  it('error: "No se pudo cargar" con "Reintentar"', async () => {
    const onReintentar = vi.fn()
    render(<EstadoError onReintentar={onReintentar} />)
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudo cargar')
    await userEvent.setup().click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onReintentar).toHaveBeenCalled()
  })
})

describe('FechaRelativa', () => {
  it('muestra la relativa y al tocarla la exacta, y vuelve', async () => {
    render(<FechaRelativa iso="2026-11-24T13:15:00Z" ahora={ahora} />)
    const f = screen.getByRole('button', { name: /ayer/ })
    expect(f).toHaveTextContent('ayer')
    expect(f).toHaveAttribute('title', 'mar 24 nov 2026, 10:15')
    const u = userEvent.setup()
    await u.click(f)
    expect(f).toHaveTextContent('mar 24 nov 2026, 10:15')
    await u.click(f)
    expect(f).toHaveTextContent('ayer')
  })
})
