// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SelectorDiaHora } from './SelectorDiaHora'

describe('SelectorDiaHora', () => {
  it('ofrece Hoy y Mañana como botones y avisa la elección', () => {
    const onFecha = vi.fn()
    render(<SelectorDiaHora hoy="2026-10-10" fecha={null} hora={null} onFecha={onFecha} onHora={vi.fn()} avisos={[]} />)
    fireEvent.click(screen.getByRole('button', { name: /Mañana/ }))
    expect(onFecha).toHaveBeenCalledWith('2026-10-11')
  })
  it('marca el horario elegido con aria-pressed', () => {
    render(<SelectorDiaHora hoy="2026-10-10" fecha="2026-10-12" hora="11:00" onFecha={vi.fn()} onHora={vi.fn()} avisos={[]} />)
    expect(screen.getByRole('button', { name: '11:00' })).toHaveAttribute('aria-pressed', 'true')
  })
  it('muestra los avisos en una región anunciada', () => {
    render(<SelectorDiaHora hoy="2026-10-10" fecha="2026-10-12" hora="11:00" onFecha={vi.fn()} onHora={vi.fn()} avisos={['El asesor ya tiene una visita a las 11:30']} />)
    expect(screen.getByRole('status')).toHaveTextContent('El asesor ya tiene una visita a las 11:30')
  })
  it('si el padre cambia a fecha/hora fuera de las listas DESPUÉS del montaje, abre el campo libre', () => {
    const { rerender } = render(<SelectorDiaHora hoy="2026-10-10" fecha={null} hora={null} onFecha={vi.fn()} onHora={vi.fn()} avisos={[]} />)
    rerender(<SelectorDiaHora hoy="2026-10-10" fecha="2026-12-25" hora="07:15" onFecha={vi.fn()} onHora={vi.fn()} avisos={[]} />)
    expect(screen.getByLabelText('Otro día')).toHaveValue('2026-12-25')
    expect(screen.getByLabelText('Otro horario')).toHaveValue('07:15')
  })
})
