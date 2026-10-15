// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { visitaDePrueba } from '@/test/visitas/visita-de-prueba'

let busqueda = ''
const escrituras: string[] = []
vi.mock('next/navigation', () => ({
  usePathname: () => '/visits/todas',
  useSearchParams: () => new URLSearchParams(busqueda),
  useRouter: () => ({ replace: (h: string) => { escrituras.push(h) }, push: vi.fn() }),
}))

import TodasLasVisitasPage from './page'

let rol = 'admin'
let respuesta: { status: number; body: unknown } = { status: 200, body: { data: [], total: 0, pagina: 1, porPagina: 25 } }
const pedidos: string[] = []

beforeEach(() => {
  busqueda = ''; escrituras.length = 0; pedidos.length = 0; rol = 'admin'
  respuesta = { status: 200, body: { data: [visitaDePrueba()], total: 60, pagina: 1, porPagina: 25 } }
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (url.startsWith('/api/auth/me')) return json(200, { id: '11111111-1111-4111-8111-111111111111', role: rol })
    if (url.startsWith('/api/users/advisors')) return json(200, { data: [] })
    if (url.startsWith('/api/visits?')) { pedidos.push(url); return json(respuesta.status, respuesta.body) }
    throw new Error(`fetch inesperado: ${url}`)
  }))
})

describe('/visits/todas', () => {
  it('pide la página con los filtros de la dirección (los que manda "Ver todas")', async () => {
    busqueda = 'from=2026-10-01&to=2026-10-31&origen=portal&estado=completed'
    render(<TodasLasVisitasPage />)
    await waitFor(() => expect(pedidos).toHaveLength(1))
    const qs = new URL(pedidos[0], 'http://x').searchParams
    expect(Object.fromEntries(qs)).toMatchObject({ desde: '2026-10-01', hasta: '2026-10-31', origen: 'portal', estado: 'completed', pagina: '1', porPagina: '25' })
  })
  it('muestra el total, la página y avanza con "Siguiente"', async () => {
    render(<TodasLasVisitasPage />)
    expect(await screen.findByText('Página 1 de 3 · 60 visitas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(escrituras.some(h => h.includes('pagina=2'))).toBe(true)
  })
  it('un asesor no ve el filtro de asesor', async () => {
    rol = 'asesor'
    render(<TodasLasVisitasPage />)
    await screen.findByText('Página 1 de 3 · 60 visitas')
    expect(screen.queryByRole('combobox', { name: 'Asesor' })).not.toBeInTheDocument()
  })
  it('si el servidor falla: el mensaje real', async () => {
    respuesta = { status: 400, body: { error: 'El estado no es válido' } }
    render(<TodasLasVisitasPage />)
    expect(await screen.findByText('El estado no es válido')).toBeInTheDocument()
  })
})
