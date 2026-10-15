// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { armarResumen, type ResumenVisitas } from '@/lib/visitas/resumen'
import { visitaDePrueba as v } from '@/test/visitas/visita-de-prueba'

let busqueda = ''
const escrituras: string[] = []
vi.mock('next/navigation', () => ({
  usePathname: () => '/visits',
  useSearchParams: () => new URLSearchParams(busqueda),
  useRouter: () => ({ replace: (href: string) => { escrituras.push(href) }, push: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
// La ventana de agendar tiene sus propias pruebas (Entrega 1); acá solo importa que el botón esté.
vi.mock('@/components/visitas/BotonAgendarVisita', () => ({
  BotonAgendarVisita: () => <button type="button" className="min-h-11">Agendar visita</button>,
}))

import VisitsPage from './page'

const YO = '11111111-1111-4111-8111-111111111111'
const AHORA = new Date('2026-10-15T15:00:00Z')
let rol = 'admin'
let respuestas: Array<{ status: number; body: unknown }> = []
let pedidosResumen: string[] = []

function resumen(cambios: Partial<Parameters<typeof armarResumen>[0]> = {}): ResumenVisitas {
  return armarResumen({
    periodo: { desde: '2026-09-16', hasta: '2026-10-15' }, delPeriodo: [], abiertas: [], proximas: [],
    ahora: AHORA, truncado: false, verTodo: rol !== 'asesor', ...cambios,
  })
}

beforeEach(() => {
  busqueda = ''; escrituras.length = 0; rol = 'admin'; pedidosResumen = []
  respuestas = [{ status: 200, body: { data: resumen() } }]
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(AHORA)
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
    if (url.startsWith('/api/auth/me')) return json(200, { id: YO, role: rol })
    if (url.startsWith('/api/users/advisors')) return json(200, { data: [{ id: '22222222-2222-4222-8222-222222222222', full_name: 'Lucas Pérez' }] })
    if (url.startsWith('/api/visits/resumen')) {
      pedidosResumen.push(url)
      const r = respuestas.length > 1 ? respuestas.shift() : respuestas[0]
      return json(r?.status ?? 500, r?.body ?? {})
    }
    if (url.includes('/estado') && init?.method === 'POST') return json(200, { data: null })
    throw new Error(`fetch inesperado: ${url}`)
  }))
})
afterEach(() => { vi.useRealTimers() })

describe('/visits', () => {
  it('pide el resumen de los últimos 30 días argentinos', async () => {
    render(<VisitsPage />)
    await waitFor(() => expect(pedidosResumen).toHaveLength(1))
    const qs = new URL(pedidosResumen[0], 'http://x').searchParams
    expect(qs.get('desde')).toBe('2026-09-16')
    expect(qs.get('hasta')).toBe('2026-10-15')
  })
  it('el link de Inicio (?from=hoy&to=hoy&onlyMine=true) pide HOY a nombre de quien mira', async () => {
    busqueda = 'from=2026-10-15&to=2026-10-15&onlyMine=true'
    render(<VisitsPage />)
    await waitFor(() => expect(pedidosResumen).toHaveLength(1))
    const qs = new URL(pedidosResumen[0], 'http://x').searchParams
    expect([qs.get('desde'), qs.get('hasta'), qs.get('asesor')]).toEqual(['2026-10-15', '2026-10-15', YO])
  })
  it('un período sin visitas: "Sin datos" en las tarjetas y el resumen del día', async () => {
    render(<VisitsPage />)
    expect(await screen.findByText('Sin visitas hoy · nada para resolver')).toBeInTheDocument()
    expect(screen.getAllByText('Sin datos').length).toBeGreaterThanOrEqual(5)
  })
  it('el asesor no ve el filtro de asesor ni "Por asesor", y no pide la lista de asesores', async () => {
    rol = 'asesor'
    respuestas = [{ status: 200, body: { data: resumen({ delPeriodo: [v({ status: 'completed', scheduled_at: '2026-10-14T13:00:00Z' })] }) } }]
    render(<VisitsPage />)
    await screen.findByText('Cómo vienen las visitas')
    expect(screen.queryByRole('combobox', { name: 'Asesor' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Por asesor' })).not.toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([u]) => String(u).startsWith('/api/users/advisors'))).toBe(false)
  })
  it('elegir "7 días" escribe el período en la dirección', async () => {
    render(<VisitsPage />)
    await screen.findByText('Sin visitas hoy · nada para resolver')
    await userEvent.click(screen.getByRole('button', { name: '7 días' }))
    expect(escrituras.some(h => h.includes('periodo=7d'))).toBe(true)
  })
  it('criterio 14: "Se realizó" desde "Requieren tu acción" vuelve a pedir el resumen y la visita sale de la lista', async () => {
    const pasada = v({ status: 'scheduled', scheduled_at: '2026-10-14T13:00:00Z', client_name: 'Pasada' })
    respuestas = [
      { status: 200, body: { data: resumen({ abiertas: [pasada] }) } },
      { status: 200, body: { data: resumen({ delPeriodo: [{ ...pasada, status: 'completed' }] }) } },
    ]
    render(<VisitsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Se realizó' }))
    await userEvent.click(await screen.findByRole('radio', { name: 'Alto' }))
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(pedidosResumen).toHaveLength(2))
    expect(await screen.findByText('No hay nada para resolver.')).toBeInTheDocument()
    expect(screen.getByText('100 %')).toBeInTheDocument()
  })
  it('si el servidor falla: el mensaje real y "Reintentar"', async () => {
    respuestas = [
      { status: 500, body: { error: 'No pudimos cargar el resumen de visitas' } },
      { status: 200, body: { data: resumen() } },
    ]
    render(<VisitsPage />)
    expect(await screen.findByText('No pudimos cargar el resumen de visitas')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByText('Sin visitas hoy · nada para resolver')).toBeInTheDocument()
  })
})
