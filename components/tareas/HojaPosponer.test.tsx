// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { cuandoQueda, HojaPosponer } from './HojaPosponer'

const toastes = vi.hoisted(() => ({ toast: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(toastes.toast, { error: toastes.error }) }))

const RELOJ = () => new Date('2026-11-24T13:42:00Z') // martes 10:42 de Argentina
const pedidos: unknown[] = []
function red() {
  pedidos.length = 0
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init?: RequestInit) => {
    pedidos.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify({ success: true, anterior: { due_date: '2026-11-20', due_time: null } }))
  }))
}
afterEach(() => vi.unstubAllGlobals())
const tarea = { id: 't1', title: 'Llamar a Marcela', due_date: '2026-11-20', due_time: null, vencimiento: 'Vencida hace 4 días' }

describe('HojaPosponer', () => {
  it('en 1 hora: 11:45, aviso "Pospuesta para hoy 11:45" y "Deshacer" vuelve a la fecha anterior', async () => {
    red()
    const onHecho = vi.fn()
    render(<HojaPosponer tarea={tarea} onCerrar={() => {}} onHecho={onHecho} reloj={RELOJ} />)
    expect(screen.getByText('Posponer')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /En 1 hora/ }))
    await waitFor(() => expect(onHecho).toHaveBeenCalled())
    expect(pedidos[0]).toEqual({ action: 'posponer', due_date: '2026-11-24', due_time: '11:45' })
    expect(toastes.toast).toHaveBeenCalledWith('Pospuesta para hoy 11:45', expect.anything())
    await act(async () => toastes.toast.mock.calls.at(-1)![1].action.onClick())
    expect(pedidos[1]).toEqual({ action: 'posponer', deshacer: true, due_date: '2026-11-20', due_time: null, desde_fecha: '2026-11-24', desde_hora: '11:45' })
  })

  it('sin fecha se llama "Poner fecha"; mañana a las 9:00 → "Queda para mañana 9:00"', async () => {
    red()
    render(<HojaPosponer tarea={{ ...tarea, due_date: null, vencimiento: 'Sin fecha' }} onCerrar={() => {}} onHecho={() => {}} reloj={RELOJ} />)
    expect(screen.getByText('Poner fecha')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Mañana a las 9:00/ }))
    await waitFor(() => expect(toastes.toast).toHaveBeenCalledWith('Queda para mañana 9:00', expect.anything()))
    expect(pedidos[0]).toMatchObject({ due_date: '2026-11-25', due_time: '09:00' })
  })

  it('elegir día y hora: un momento pasado da error y no se manda', () => {
    red()
    render(<HojaPosponer tarea={tarea} onCerrar={() => {}} onHecho={() => {}} reloj={RELOJ} />)
    fireEvent.click(screen.getByRole('button', { name: /Elegir día y hora/ }))
    fireEvent.change(screen.getByLabelText('Día'), { target: { value: '2026-11-24' } })
    fireEvent.change(screen.getByLabelText('Hora'), { target: { value: '09:00' } })
    fireEvent.click(screen.getByRole('button', { name: '✓ Guardar' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Elegí un día y una hora que todavía no hayan pasado.')
    expect(pedidos).toHaveLength(0)
  })

  it('cuandoQueda', () => {
    expect(cuandoQueda('2026-11-24', '11:45', RELOJ())).toBe('hoy 11:45')
    expect(cuandoQueda('2026-11-26', '09:00', RELOJ())).toBe('jue 26 nov, 9:00')
  })
})
