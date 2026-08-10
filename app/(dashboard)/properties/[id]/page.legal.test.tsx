// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PropertyDetailPage from './page'

/**
 * La COSTURA del circuito legal, con `DocsTab` DE VERDAD.
 *
 * `page.test.tsx` mockea la pestaña entera, así que nadie mira el cable entre
 * la página y ella. La revisión adversarial mutó dos líneas de `page.tsx` y las
 * 2071 pruebas de la suite quedaron verdes:
 *
 *   1. `legalSubmittedAt: null` en la llamada a `nextStep` → el asesor nunca ve
 *      "En revisión legal": sigue viendo el botón de enviar, y CADA clic crea
 *      otra tarea al abogado y manda otro mail.
 *   2. `<DocsTab legalSubmittedAt={null}>` → el abogado pierde Aprobar y
 *      Rechazar en TODAS las propiedades.
 *
 * Acá se mockean las demás pestañas (arrastran Leaflet, dnd-kit y fetches
 * propios) pero NUNCA `DocsTab`: es justamente lo que se está probando.
 */

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'prop-1' }),
  useRouter: () => ({ back: vi.fn(), push: vi.fn() }),
}))

vi.mock('@/components/tasks/AddTaskDialog', () => ({ AddTaskDialog: () => null }))
vi.mock('@/components/properties/detail/tabs/OverviewTab', () => ({
  OverviewTab: () => <div data-testid="tab-propiedad" />,
}))
vi.mock('@/components/properties/detail/tabs/MediaTab', () => ({
  MediaTab: () => <div data-testid="tab-multimedia" />,
}))
vi.mock('@/components/properties/detail/tabs/MarketingTab', () => ({
  MarketingTab: () => <div data-testid="tab-difusion" />,
}))
vi.mock('@/components/properties/detail/tabs/HistoryTab', () => ({
  HistoryTab: () => <div data-testid="tab-historial" />,
}))

const ENVIADA = '2026-08-01T00:00:00Z'

function propiedad(extra: Record<string, unknown> = {}) {
  return {
    id: 'prop-1',
    address: 'Rivadavia 4820',
    neighborhood: 'Caballito',
    city: 'CABA',
    property_type: 'departamento',
    operation_type: 'venta',
    rooms: 3, bedrooms: 2, bathrooms: 1, garages: 0,
    covered_area: 78, total_area: 92, floor: 4, age: 20, expensas: null,
    amenities: null, description: null, latitude: null, longitude: null,
    asking_price: 180000, currency: 'USD', commission_percentage: 3,
    contract_start_date: null, contract_end_date: null, origin: 'embudo',
    status: 'approved',
    commercial_status: 'disponible', sold_price: null, sold_currency: null, sold_at: null,
    // La columna MUERTA. Va vacía a propósito en TODOS los casos: así ningún
    // test puede pasar leyéndola. La cuenta real sale de `legal_docs`.
    documents: [],
    photos: ['https://x/1.jpg'],
    plans: [],
    video_file_url: null, video_url: null, tour_3d_url: null, video_recorrido_url: null,
    deliver_media: null,
    legal_status: 'pending', legal_notes: null, legal_reviewed_at: null,
    legal_submitted_at: ENVIADA,
    created_at: '2026-08-01T00:00:00Z',
    ...extra,
  }
}

const FLAGS = { has_succession: false, has_divorce: false, has_powers: false, is_credit_purchase: false }

let ficha: Record<string, unknown>
let legalDocs: Record<string, unknown>
let rol: string
let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  ficha = propiedad()
  legalDocs = {}
  rol = 'asesor'
  window.history.replaceState(null, '', '/properties/prop-1?tab=documentacion')
  window.scrollTo = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
  fetchMock = vi.fn((url: string) => {
    if (url.startsWith('/api/auth/me')) return json({ id: 'u1', role: rol })
    if (url.startsWith('/api/properties/prop-1/legal-docs')) return json({ data: { docs: legalDocs, flags: FLAGS } })
    if (url.startsWith('/api/properties/prop-1/feedback')) return json({ data: [] })
    if (url.startsWith('/api/properties/prop-1/legal-submit')) return json({ success: true })
    if (url.startsWith('/api/flow-history')) return json({ data: null })
    if (url.startsWith('/api/properties/prop-1')) return json({ data: ficha })
    return Promise.reject(new Error(`fetch inesperado: ${url}`))
  })
  vi.stubGlobal('fetch', fetchMock)
})

function json(data: unknown) {
  return Promise.resolve({ ok: true, json: async () => data })
}

/** El rol ya llegó cuando la barra de pestañas refleja sus permisos. */
async function esperarFicha(pestañaActiva: string) {
  await waitFor(() => {
    expect(screen.getByRole('tab', { name: pestañaActiva })).toHaveAttribute('aria-selected', 'true')
  })
}

describe('ficha de propiedad — el cable con la pestaña Documentación', () => {
  /** Mutación 2 de la revisión: `<DocsTab legalSubmittedAt={null}>`. */
  it('al abogado, con la documentación enviada, le llegan Aprobar y Rechazar', async () => {
    rol = 'abogado'
    render(<PropertyDetailPage />)
    await esperarFicha('Documentación')

    expect(await screen.findByRole('button', { name: /aprobar/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /rechazar/i })).toBeInTheDocument()
  })

  it('y si nunca se la enviaron, no le ofrece firmar nada', async () => {
    rol = 'abogado'
    ficha = propiedad({ legal_submitted_at: null })
    render(<PropertyDetailPage />)
    await esperarFicha('Documentación')

    expect(screen.getByTestId('barra-secciones')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^aprobar$/i })).not.toBeInTheDocument()
  })

  /** Mutación 1 de la revisión: `legalSubmittedAt: null` hacia `nextStep`. */
  it('al asesor, con la documentación ya enviada, le dice que está en revisión y NO le ofrece reenviarla', async () => {
    legalDocs = { escritura: { file_url: 'https://x/e.pdf', status: 'pending' } }
    render(<PropertyDetailPage />)
    await esperarFicha('Documentación')

    await waitFor(() => expect(screen.getByText('En revisión legal')).toBeInTheDocument())
    // Ni en el aviso ni en la pestaña: cada clic de más crea otra tarea al
    // abogado y manda otro mail.
    expect(screen.queryByRole('button', { name: /enviar a revisión legal/i })).not.toBeInTheDocument()
  })

  /**
   * H1 + D2 de punta a punta: la propiedad NO tiene fotos (así el aviso de la
   * cabecera muestra "Fotos pendientes", que es lo que gana) y sin embargo la
   * documentación se puede mandar. Y la cuenta de documentos sale de
   * `legal_docs` — `documents` está vacío en esta ficha, como en las 32 filas
   * de producción.
   */
  it('sin fotos y con la escritura cargada, el asesor puede mandarle la documentación al abogado', async () => {
    ficha = propiedad({ status: 'pending_photos', photos: [], legal_submitted_at: null })
    legalDocs = { escritura: { file_url: 'https://x/e.pdf', status: 'pending' } }
    const user = userEvent.setup()
    render(<PropertyDetailPage />)
    await esperarFicha('Documentación')

    // El aviso de la cabecera está mostrando OTRO paso: el envío no cuelga de él.
    await waitFor(() => expect(screen.getByText('Fotos pendientes')).toBeInTheDocument())

    const boton = await screen.findByRole('button', { name: /enviar a revisión legal/i })
    expect(boton).toBeEnabled()
    await user.click(boton)

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url, init]) =>
        url === '/api/properties/prop-1/legal-submit' && (init as RequestInit | undefined)?.method === 'POST',
      )).toBe(true)
    })
  })

  it('sin ningún archivo cargado el botón está apagado: no se le manda una carpeta vacía al abogado', async () => {
    ficha = propiedad({ status: 'pending_photos', photos: [], legal_submitted_at: null })
    legalDocs = {}
    render(<PropertyDetailPage />)
    await esperarFicha('Documentación')

    expect(await screen.findByRole('button', { name: /enviar a revisión legal/i })).toBeDisabled()
  })

  /** H2: el aviso invita a reenviar y ahora el botón existe donde manda. */
  it('una rechazada se puede volver a enviar desde la pestaña', async () => {
    ficha = propiedad({ legal_status: 'rejected', legal_notes: 'Escritura vencida' })
    legalDocs = { escritura: { file_url: 'https://x/e.pdf', status: 'rejected' } }
    const user = userEvent.setup()
    render(<PropertyDetailPage />)
    await esperarFicha('Documentación')

    await user.click(await screen.findByRole('button', { name: /volver a enviar/i }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => url === '/api/properties/prop-1/legal-submit')).toBe(true)
    })
  })
})
