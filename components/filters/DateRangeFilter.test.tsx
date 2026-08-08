// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DateRangeFilter } from './DateRangeFilter'

describe('DateRangeFilter', () => {
  it('sin value se comporta como siempre: elegir un preset avisa un rango', async () => {
    const onChange = vi.fn()
    render(<DateRangeFilter onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: '7d' }))
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ from: expect.any(String), to: expect.any(String) }),
    )
  })

  it('con value vacío no marca ningún preset', () => {
    render(<DateRangeFilter onChange={() => {}} value={{ from: '', to: '' }} />)
    for (const p of ['Hoy', '7d', '30d']) {
      expect(screen.getByRole('button', { name: p })).toHaveAttribute('aria-pressed', 'false')
    }
  })

  // Este es el caso que importa: volver de la URL después de un refresco.
  it('con un value que coincide con un preset, ese preset queda marcado', () => {
    const hoy = new Date().toISOString().split('T')[0]
    render(<DateRangeFilter onChange={() => {}} value={{ from: hoy, to: hoy }} />)
    expect(screen.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('con un rango que no coincide con ningún preset, muestra las fechas cargadas', () => {
    render(<DateRangeFilter onChange={() => {}} value={{ from: '2026-01-05', to: '2026-02-10' }} />)
    expect(screen.getByDisplayValue('2026-01-05')).toBeInTheDocument()
    expect(screen.getByDisplayValue('2026-02-10')).toBeInTheDocument()
  })
})
