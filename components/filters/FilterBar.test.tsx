// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FilterBar } from './FilterBar'

const SELECTS = [
  { key: 'status', label: 'Estado', options: [
    { value: '', label: 'Todos los estados' },
    { value: 'approved', label: 'Publicada' },
  ]},
]

describe('FilterBar', () => {
  it('sin nada aplicado no muestra fichas ni "Limpiar todo"', () => {
    render(<FilterBar selects={SELECTS} values={{ status: '' }} onChange={() => {}} onClear={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Limpiar todo' })).not.toBeInTheDocument()
  })

  it('con un filtro puesto muestra su ficha y el botón de limpiar', () => {
    render(<FilterBar selects={SELECTS} values={{ status: 'approved' }} onChange={() => {}} onClear={() => {}} />)
    const fichaElements = screen.queryAllByText('Publicada')
    expect(fichaElements.some(el => el.closest('.rounded-full'))).toBe(true)
    expect(screen.getByRole('button', { name: 'Limpiar todo' })).toBeInTheDocument()
  })

  it('la ficha muestra la etiqueta legible, nunca el valor crudo de la base', () => {
    render(<FilterBar selects={SELECTS} values={{ status: 'approved' }} onChange={() => {}} onClear={() => {}} />)
    expect(screen.queryByText('approved')).not.toBeInTheDocument()
  })

  it('quitar una ficha avisa con el valor vacío', async () => {
    const onChange = vi.fn()
    render(<FilterBar selects={SELECTS} values={{ status: 'approved' }} onChange={onChange} onClear={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtro Estado' }))
    expect(onChange).toHaveBeenCalledWith('status', '')
  })

  it('el desplegable avisa al elegir una opción', async () => {
    const onChange = vi.fn()
    render(<FilterBar selects={SELECTS} values={{ status: '' }} onChange={onChange} onClear={() => {}} />)
    await userEvent.selectOptions(screen.getByLabelText('Estado'), 'approved')
    expect(onChange).toHaveBeenCalledWith('status', 'approved')
  })

  it('renderiza los controles que le pasan por children (rango de fechas, "solo míos")', () => {
    render(
      <FilterBar selects={SELECTS} values={{ status: '' }} onChange={() => {}} onClear={() => {}}>
        <button>Solo míos</button>
      </FilterBar>,
    )
    expect(screen.getByRole('button', { name: 'Solo míos' })).toBeInTheDocument()
  })

  // Sin esto, poner "solo míos" o un rango de fechas no ofrecería "Limpiar todo",
  // y el usuario se queda sin forma de volver atrás de un solo golpe.
  it('un control de children aplicado también habilita "Limpiar todo"', () => {
    render(
      <FilterBar selects={SELECTS} values={{ status: '' }} onChange={() => {}} onClear={() => {}} extraActivo>
        <button>Solo míos</button>
      </FilterBar>,
    )
    expect(screen.getByRole('button', { name: 'Limpiar todo' })).toBeInTheDocument()
  })

  it('un valor huérfano (no en opciones) se muestra como ficha y habilita "Limpiar todo"', () => {
    render(<FilterBar selects={SELECTS} values={{ status: 'archived_legacy' }} onChange={() => {}} onClear={() => {}} />)
    // La ficha debe mostrar el valor crudo
    expect(screen.getByText('archived_legacy')).toBeInTheDocument()
    // Debe aparecer "Limpiar todo"
    expect(screen.getByRole('button', { name: 'Limpiar todo' })).toBeInTheDocument()
  })

  it('quitar una ficha huérfana avisa con el valor vacío', async () => {
    const onChange = vi.fn()
    render(<FilterBar selects={SELECTS} values={{ status: 'archived_legacy' }} onChange={onChange} onClear={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Quitar filtro Estado (valor no reconocido)' }))
    expect(onChange).toHaveBeenCalledWith('status', '')
  })
})
