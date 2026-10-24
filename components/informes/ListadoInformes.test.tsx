/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ListadoInformes } from './ListadoInformes'

const fila = (id: string, estado: 'borrador' | 'listo', faltantes: number) => ({
  id, propertyId: `p-${id}`, direccion: `Calle ${id}`, desde: '2026-10-01', hasta: '2026-10-15', origen: 'ciclo', estado, faltantes, listoAt: null,
})
const ok = (informes: unknown[]) => new Response(JSON.stringify({ data: { informes, periodos: ['2026-10-15', '2026-09-30'] } }), { status: 200, headers: { 'content-type': 'application/json' } })
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn(async () => ok([fila('a', 'borrador', 2), fila('b', 'borrador', 0)]))
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe('ListadoInformes', () => {
  it('arranca mostrando los para completar, cada uno con su link y lo que le falta', async () => {
    render(<ListadoInformes />)
    expect(await screen.findByText('Calle a')).toBeInTheDocument()
    expect(String(fetchMock.mock.calls[0][0])).toContain('estado=borrador')
    expect(screen.getByText('Faltan 2 datos')).toBeInTheDocument()
    expect(screen.getByText('Para revisar y marcar listo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Calle a/ })).toHaveAttribute('href', '/informes/a')
  })

  it('cambiar el filtro y el período vuelve a pedir con esos valores', async () => {
    render(<ListadoInformes />)
    await screen.findByText('Calle a')
    await userEvent.selectOptions(screen.getByLabelText('Mostrar'), 'listo')
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('estado=listo'))
    await userEvent.selectOptions(screen.getByLabelText('Período'), '2026-09-30')
    await waitFor(() => expect(String(fetchMock.mock.calls.at(-1)?.[0])).toContain('hasta=2026-09-30'))
  })

  it('sin informes para completar lo dice y explica cómo armar uno a medida', async () => {
    fetchMock.mockImplementation(async () => ok([]))
    render(<ListadoInformes />)
    expect(await screen.findByText(/No hay informes para completar/)).toBeInTheDocument()
  })

  it('si la ruta falla muestra el motivo y deja reintentar', async () => {
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ error: 'Los informes no están disponibles para tu rol' }), { status: 403, headers: { 'content-type': 'application/json' } }))
    render(<ListadoInformes />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Los informes no están disponibles para tu rol')
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Calle a')).toBeInTheDocument()
  })
})
