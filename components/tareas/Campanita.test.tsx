// @vitest-environment happy-dom
// La campanita (crm-tareas-y-campanita): número, panel, acciones y cuándo vuelve a leer.
import { afterEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { avisarCambioTareas } from './acciones'
import { Campanita, etiquetaCampanita } from './Campanita'

const toastes = vi.hoisted(() => ({ toast: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: Object.assign(toastes.toast, { error: toastes.error }) }))
vi.mock('next/link', () => ({ default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => <a href={href} {...p}>{children}</a> }))

const tarea = (id: string, titulo: string, estado = 'vencida') => ({
  id, title: titulo, tipo: 'llamada', due_date: '2026-11-24', due_time: '10:30', todoElDia: false,
  vencimiento: { texto: estado === 'vencida' ? 'Vencida hace 30 min' : 'Hoy 15:00', estado },
  enlace: '/contacts/c1', contacto: { id: 'c1', nombre: 'Marcela' }, asignado: null,
})

let respuesta: { status: number; body: unknown } = { status: 200, body: {} }
const pedidos: { url: string; init?: RequestInit }[] = []
function red() {
  pedidos.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    pedidos.push({ url, init })
    if (url.startsWith('/api/tasks/avisos')) return new Response(JSON.stringify(respuesta.body), { status: respuesta.status })
    return new Response(JSON.stringify({ success: true }))
  }))
}
afterEach(() => vi.unstubAllGlobals())
const lecturas = () => pedidos.filter((p) => p.url.startsWith('/api/tasks/avisos')).length

describe('Campanita', () => {
  it('etiquetas', () => {
    expect(etiquetaCampanita(0)).toBe('Avisos: todo al día')
    expect(etiquetaCampanita(1)).toBe('Avisos: 1 tarea para ahora')
    expect(etiquetaCampanita(3)).toBe('Avisos: 3 tareas para ahora')
  })

  it('muestra el número, con 99+ de tope, y sin número en cero', async () => {
    respuesta = { status: 200, body: { vencidas: [], ahora: [], loQueViene: [], total: 120 } }
    red()
    const { unmount } = render(<Campanita />)
    expect(await screen.findByText('99+')).toBeInTheDocument()
    unmount()
    respuesta = { status: 200, body: { vencidas: [], ahora: [], loQueViene: [], total: 0 } }
    red()
    render(<Campanita />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Avisos: todo al día' })).toBeInTheDocument())
    expect(document.querySelector('[data-numero]')).toBeNull()
  })

  it('panel: vencidas, ahora y lo que viene sin acciones; vacío dice "Estás al día"', async () => {
    respuesta = { status: 200, body: { vencidas: [tarea('a', 'Llamar a Marcela')], ahora: [tarea('b', 'Pedir escritura', 'hoy')], loQueViene: [tarea('c', 'Visita', 'proxima')], total: 2 } }
    red()
    render(<Campanita />)
    fireEvent.click(await screen.findByRole('button', { name: 'Avisos: 2 tareas para ahora' }))
    const panel = screen.getByRole('dialog', { name: 'Avisos · 2' })
    expect(within(panel).getByText('Vencidas · 1')).toBeInTheDocument()
    expect(within(panel).getByText('Ahora · 1')).toBeInTheDocument()
    expect(within(panel).getByText('Lo que viene · avisa a su hora')).toBeInTheDocument()
    expect(within(panel).getAllByRole('button', { name: /Completar/ })).toHaveLength(2)
    expect(within(panel).getByRole('link', { name: 'Ver todos los pendientes' })).toHaveAttribute('href', '/tasks')
  })

  it('completar: pide al servidor, avisa con "Deshacer" y la campanita vuelve a leer', async () => {
    respuesta = { status: 200, body: { vencidas: [tarea('a', 'Llamar a Marcela')], ahora: [], loQueViene: [], total: 1 } }
    red()
    render(<Campanita />)
    fireEvent.click(await screen.findByRole('button', { name: 'Avisos: 1 tarea para ahora' }))
    const antes = lecturas()
    fireEvent.click(screen.getByRole('button', { name: /Completar/ }))
    await waitFor(() => expect(toastes.toast).toHaveBeenCalledWith('Tarea completada', expect.objectContaining({ action: expect.objectContaining({ label: 'Deshacer' }) })))
    expect(JSON.parse(String(pedidos.find((p) => p.url === '/api/tasks/a')!.init!.body))).toEqual({ action: 'complete' })
    await waitFor(() => expect(lecturas()).toBeGreaterThan(antes))
    // Deshacer reabre.
    await act(async () => toastes.toast.mock.calls.at(-1)![1].action.onClick())
    expect(JSON.parse(String(pedidos.filter((p) => p.url === '/api/tasks/a').at(-1)!.init!.body))).toEqual({ action: 'reopen' })
  })

  it('si la lectura falla, conserva el último número y ofrece "Reintentar"', async () => {
    respuesta = { status: 200, body: { vencidas: [], ahora: [], loQueViene: [], total: 4 } }
    red()
    render(<Campanita />)
    await screen.findByText('4')
    respuesta = { status: 500, body: { error: 'x' } }
    await act(async () => avisarCambioTareas())
    await waitFor(() => expect(lecturas()).toBe(2))
    expect(screen.getByText('4')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Avisos: 4 tareas para ahora' }))
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron actualizar los avisos')
  })

  it('vuelve a leer sola cada intervalo y al aviso de cambio', async () => {
    respuesta = { status: 200, body: { vencidas: [], ahora: [], loQueViene: [], total: 0 } }
    red()
    render(<Campanita intervaloMs={40} />)
    await waitFor(() => expect(lecturas()).toBeGreaterThanOrEqual(3), { timeout: 2000 })
  })
})
