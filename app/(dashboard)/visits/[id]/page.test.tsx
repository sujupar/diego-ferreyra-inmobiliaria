// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import VisitDetailPage from './page'

/**
 * D30 — la ficha nunca se queda en "Cargando…": 404, 500, cuerpo no-JSON (504
 * con HTML del gateway) y 200 sin datos tienen su pantalla, con salida a /visits.
 * Más: las acciones de etapa piden lo que tienen que pedir antes de guardar, y
 * la concurrencia optimista (versión en cada acción, 409 CAMBIO_CONCURRENTE,
 * 200 con `data: null`) no rompe la pantalla.
 */
const ID = '66666666-6666-4666-8666-666666666666'
const VERSION = '2026-10-10T13:00:00.123456+00:00'
vi.mock('next/navigation', () => ({ useParams: () => ({ id: '66666666-6666-4666-8666-666666666666' }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

function visita(p: Record<string, unknown> = {}) {
  return {
    id: ID, scheduled_at: '2026-08-05T15:00:00Z', status: 'scheduled', client_name: 'Cliente Uno',
    client_email: 'cliente@example.com', client_phone: '11-1111-1111', origin: 'portal', origin_detail: 'zonaprop',
    propiedad: { id: 'p1', address: 'Calle Falsa 123', neighborhood: 'Palermo', foto: null },
    asesor: { id: 'a1', full_name: 'Lucas' }, comprador: null, consulta: null, notes: null, completion_notes: null,
    outcome_reason: null, advisor_interest: null, reschedule_count: 0, created_by_ai: false,
    updated_at: VERSION,
    eventos: [{ id: 'e1', kind: 'creada', from_status: null, to_status: 'scheduled', from_scheduled_at: null,
      to_scheduled_at: null, reason: null, note: null, created_at: '2026-08-01T12:00:00Z', actor: 'Lucas',
      desde_asesor: null, hacia_asesor: null }],
    acciones: ['realizada', 'no_realizada', 'reprogramar', 'cambiar_asesor'],
    ...p,
  }
}
const ok = (data: unknown) => ({ ok: true, status: 200, json: async () => ({ data }) })
let respuesta: () => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
let posteos: Array<{ url: string; body: unknown }> = []

beforeEach(() => {
  respuesta = async () => ok(visita())
  posteos = []
  vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posteos.push({ url, body: JSON.parse(String(init.body)) })
      return Promise.resolve(ok(visita({ status: 'no_show', outcome_reason: 'no_vino', acciones: ['reabrir'] })))
    }
    if (url.startsWith('/api/users/advisors')) return Promise.resolve(ok([]))
    if (url.startsWith('/api/visits/')) return respuesta()
    return Promise.reject(new Error(`fetch inesperado: ${url}`))
  }))
})

describe('VisitDetailPage — la pantalla no se queda en "Cargando…" ante un fallo', () => {
  it('el camino feliz muestra propiedad, persona, origen e historial', async () => {
    render(<VisitDetailPage />)
    await screen.findByText('Calle Falsa 123')
    expect(screen.getByText('Cliente Uno')).toBeInTheDocument()
    expect(screen.getByText(/Consulta de portal · zonaprop/)).toBeInTheDocument()
    expect(screen.getByText('Creada')).toBeInTheDocument()
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
  })
  it('un 404 dice que no se encontró la visita, con salida a /visits', async () => {
    respuesta = async () => ({ ok: false, status: 404, json: async () => ({ error: 'No encontramos la visita' }) })
    render(<VisitDetailPage />)
    await screen.findByText('No encontramos esta visita')
    expect(screen.getByText('← Volver a visitas')).toBeInTheDocument()
    expect(screen.getByText('Ver todas las visitas')).toBeInTheDocument()
  })
  it('un 500 dice que no se pudo cargar, y "Reintentar" la trae', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      respuesta = async () => ({ ok: false, status: 500, json: async () => ({ error: 'boom' }) })
      render(<VisitDetailPage />)
      await screen.findByText('No pudimos cargar la visita')
      respuesta = async () => ok(visita())
      fireEvent.click(screen.getByText('Reintentar'))
      await screen.findByText('Calle Falsa 123')
    } finally { errores.mockRestore() }
  })
  it('un cuerpo que no es JSON (el 504 con HTML del gateway) tampoco la cuelga', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      respuesta = async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError("Unexpected token '<'") } })
      render(<VisitDetailPage />)
      await screen.findByText('No pudimos cargar la visita')
    } finally { errores.mockRestore() }
  })
  it('un 200 sin la visita adentro es un fallo, no una pantalla vacía', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      respuesta = async () => ok(null)
      render(<VisitDetailPage />)
      await screen.findByText('No pudimos cargar la visita')
    } finally { errores.mockRestore() }
  })
})

describe('VisitDetailPage — cambiar de etapa', () => {
  it('"No se realizó" exige un motivo antes de guardar, y después guarda y pinta la respuesta', async () => {
    render(<VisitDetailPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'No se realizó' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('Elegí un motivo')).toBeInTheDocument()
    expect(posteos).toHaveLength(0)

    fireEvent.click(screen.getByRole('radio', { name: 'No vino' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(posteos).toHaveLength(1))
    expect(posteos[0]).toEqual({
      url: `/api/visits/${ID}/estado`,
      body: { tipo: 'no_realizada', motivo: 'no_vino', detalle: '', version: VERSION },
    })
    expect(await screen.findByRole('button', { name: 'Reabrir' })).toBeInTheDocument()
  })
})

describe('VisitDetailPage — concurrencia optimista', () => {
  it('manda en el body la version que vio la pantalla, carácter por carácter', async () => {
    render(<VisitDetailPage />)
    // "Se realizó" no exige ningún campo: un clic en Guardar alcanza para
    // aislar que la version viaja, sin mezclarlo con la validación del motivo.
    fireEvent.click(await screen.findByRole('button', { name: 'Se realizó' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(posteos).toHaveLength(1))
    const cuerpo = posteos[0].body as Record<string, unknown>
    expect(cuerpo.version).toBe(VERSION)
  })

  it('un 409 CAMBIO_CONCURRENTE muestra el aviso, y "Recargar" vuelve a pedir la visita', async () => {
    let pedidosGet = 0
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({ error: 'La visita cambió mientras la editabas. Recargá para ver cómo quedó.', code: 'CAMBIO_CONCURRENTE' }),
        })
      }
      if (url.startsWith('/api/users/advisors')) return Promise.resolve(ok([]))
      if (url.startsWith('/api/visits/')) { pedidosGet++; return respuesta() }
      return Promise.reject(new Error(`fetch inesperado: ${url}`))
    }))
    render(<VisitDetailPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'No se realizó' }))
    fireEvent.click(screen.getByRole('radio', { name: 'No vino' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('La visita cambió mientras la editabas. Recargá para ver cómo quedó.')).toBeInTheDocument()

    const antes = pedidosGet
    fireEvent.click(screen.getByRole('button', { name: 'Recargar' }))
    await waitFor(() => expect(pedidosGet).toBeGreaterThan(antes))
    await screen.findByText('Calle Falsa 123')
  })

  it('un 200 con `data: null` no rompe la pantalla: recarga sola', async () => {
    let pedidosGet = 0
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posteos.push({ url, body: JSON.parse(String(init.body)) })
        return Promise.resolve(ok(null))
      }
      if (url.startsWith('/api/users/advisors')) return Promise.resolve(ok([]))
      if (url.startsWith('/api/visits/')) { pedidosGet++; return respuesta() }
      return Promise.reject(new Error(`fetch inesperado: ${url}`))
    }))
    render(<VisitDetailPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Se realizó' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(posteos).toHaveLength(1))
    await waitFor(() => expect(pedidosGet).toBeGreaterThan(1))
    await screen.findByText('Calle Falsa 123')
  })
})
