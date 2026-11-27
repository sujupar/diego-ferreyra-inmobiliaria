// @vitest-environment happy-dom
// crm-cartera-por-rol, tarea 6.4: "Seleccionar" y "Eliminar" en "Todos los procesos" del
// dueño, igual que la pantalla vieja (BulkActionsBar + DELETE /api/deals/[id]). Todo con
// `fetch` y `prompt` simulados: acá nunca se borra nada real.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CarteraCRM } from './CarteraCRM'
import { datosPrueba, filaPrueba, FLORENCIA, pasoPrueba, TOMAS } from './datos-prueba'

vi.mock('next/navigation', () => ({
  usePathname: () => window.location.pathname,
  useSearchParams: () => new URLSearchParams(window.location.search),
  useRouter: () => ({ replace: () => {}, push: () => {} }),
}))

const datos = () =>
  datosPrueba({
    filas: ['a', 'b', 'c'].map((id) =>
      filaPrueba({ id: `deal-${id}`, nombre: `Persona ${id.toUpperCase()}`, etapa: 'seguimiento', asesor: { ...TOMAS, activo: true }, proximo: pasoPrueba('2026-12-05', '10:00') }),
    ),
  })

beforeEach(() => {
  window.history.replaceState(null, '', '/crm')
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Seleccionar', () => {
  it('con la selección activa, tocar una fila la marca y no abre la ficha', async () => {
    render(<CarteraCRM inicial={datos()} rol="dueno" opcionesVerComo={[]} avisoInicial={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar' }))
    expect(screen.queryAllByRole('link', { name: /^Abrir la ficha de/ })).toHaveLength(0)
    const fila = screen.getByRole('button', { name: 'Seleccionar a Persona B' })
    await userEvent.click(fila)
    expect(fila).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('1 procesos seleccionado')).toBeInTheDocument()
    expect(window.location.pathname).toBe('/crm')
  })

  it('"Eliminar" pide escribir ELIMINAR; sin eso no borra nada', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const prompt = vi.fn(() => 'eliminar')
    vi.stubGlobal('prompt', prompt)
    render(<CarteraCRM inicial={datos()} rol="dueno" opcionesVerComo={[]} avisoInicial={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar a Persona A' }))
    await userEvent.click(screen.getByRole('button', { name: /Eliminar/ }))
    expect(prompt).toHaveBeenCalledTimes(1)
    expect(String(prompt.mock.calls[0])).toContain('Para confirmar, escribí ELIMINAR:')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('con ELIMINAR borra SOLO los marcados por la ruta de hoy y vuelve a pedir la lista', async () => {
    const pedidos: { url: string; metodo: string }[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        pedidos.push({ url, metodo: init?.method ?? 'GET' })
        if (init?.method === 'DELETE') return new Response('{}', { status: 200 })
        return new Response(JSON.stringify(datos()), { status: 200 })
      }),
    )
    vi.stubGlobal('prompt', vi.fn(() => 'ELIMINAR'))
    render(<CarteraCRM inicial={datos()} rol="dueno" opcionesVerComo={[]} avisoInicial={null} />)
    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar' }))
    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar a Persona A' }))
    await userEvent.click(screen.getByRole('button', { name: 'Seleccionar a Persona C' }))
    await userEvent.click(screen.getByRole('button', { name: /Eliminar/ }))
    await waitFor(() => expect(pedidos.some((p) => p.url === '/api/crm/cartera')).toBe(true))
    expect(pedidos.filter((p) => p.metodo === 'DELETE').map((p) => p.url)).toEqual(['/api/deals/deal-a', '/api/deals/deal-c'])
  })

  it('no está para el asesor, la coordinación ni en "Ver como"', async () => {
    const { unmount } = render(
      <CarteraCRM
        inicial={{ ...datos(), vista: { tipo: 'asesor', persona: { id: TOMAS.id, nombre: TOMAS.nombre, rol: 'asesor' }, mirando: false }, asesores: null }}
        rol="asesor"
        opcionesVerComo={null}
        avisoInicial={null}
      />,
    )
    expect(screen.queryByRole('button', { name: 'Seleccionar' })).toBeNull()
    unmount()
    render(
      <CarteraCRM
        inicial={{ ...datos(), vista: { tipo: 'asesor', persona: { id: FLORENCIA.id, nombre: FLORENCIA.nombre, rol: 'asesor' }, mirando: true }, asesores: null }}
        rol="dueno"
        opcionesVerComo={[{ id: FLORENCIA.id, etiqueta: 'Florencia Ledesma · asesor' }]}
        avisoInicial={null}
      />,
    )
    expect(within(document.body).queryByRole('button', { name: 'Seleccionar' })).toBeNull()
  })
})
