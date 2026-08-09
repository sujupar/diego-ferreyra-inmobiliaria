// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PropertyDetailPage from './page'

/**
 * El único nivel que atrapa el bug reportado por el dueño: "toco 'Subir fotos'
 * y no pasa nada".
 *
 * `PropertyHeroGallery.test.tsx` verificaba que el callback se disparara — y se
 * disparaba. El problema era lo que el callback HACÍA: `goToTab('multimedia')`
 * estando ya en Multimedia no cambiaba nada y encima mandaba al tope de la
 * página, o sea LEJOS del control de subida. Un test de componente no puede ver
 * eso; hay que armar la ficha entera y mirar si el selector de archivos se abre.
 *
 * Las pestañas van mockeadas: arrastran Leaflet, dnd-kit y media docena de
 * fetches propios que no tienen nada que ver con lo que se prueba acá. Lo REAL
 * es lo que está bajo prueba: la página, la galería de portada y el aviso de
 * próximo paso.
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
vi.mock('@/components/properties/detail/tabs/DocsTab', () => ({
  DocsTab: () => <div data-testid="tab-documentacion" />,
}))
vi.mock('@/components/properties/detail/tabs/MarketingTab', () => ({
  MarketingTab: () => <div data-testid="tab-difusion" />,
}))
vi.mock('@/components/properties/detail/tabs/HistoryTab', () => ({
  HistoryTab: () => <div data-testid="tab-historial" />,
}))

/** Propiedad SIN fotos, con el legal ya aprobado: el caso de la captura. */
function propiedadSinFotos(extra: Record<string, unknown> = {}) {
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
    status: 'pending_photos',
    commercial_status: 'disponible', sold_price: null, sold_currency: null, sold_at: null,
    documents: [{ name: 'Escritura', url: 'https://x/e.pdf' }],
    photos: [],
    plans: [],
    video_file_url: null, video_url: null, tour_3d_url: null, video_recorrido_url: null,
    deliver_media: null,
    legal_status: 'approved', legal_notes: null, legal_reviewed_at: null,
    legal_submitted_at: '2026-08-01T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
    ...extra,
  }
}

let propiedad: Record<string, unknown>
let rol: string

beforeEach(() => {
  propiedad = propiedadSinFotos()
  rol = 'asesor'
  window.history.replaceState(null, '', '/properties/prop-1')
  // happy-dom no implementa ninguna de las dos: sin esto, `goToTab` explota.
  window.scrollTo = vi.fn()
  Element.prototype.scrollIntoView = vi.fn()
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.startsWith('/api/auth/me')) return json({ id: 'u1', role: rol })
    if (url.startsWith('/api/properties/prop-1/legal-docs')) return json({ data: { docs: {}, flags: {} } })
    if (url.startsWith('/api/properties/prop-1/feedback')) return json({ data: [] })
    if (url.startsWith('/api/flow-history')) return json({ data: null })
    if (url.startsWith('/api/properties/prop-1')) return json({ data: propiedad })
    return Promise.reject(new Error(`fetch inesperado: ${url}`))
  }))
})

function json(data: unknown) {
  return Promise.resolve({ ok: true, json: async () => data })
}

/**
 * Espera a que la ficha esté ASENTADA y devuelve su `<input type=file>` con un
 * espía de `.click()`.
 *
 * Esperar solo el texto del bloque vacío no alcanza: se pinta apenas responde
 * `/api/properties/:id`, mientras `/api/auth/me` todavía viaja — y la pestaña
 * activa recién se resuelve cuando llegaron LAS DOS. Sin esta espera el test es
 * una carrera que gana quien responda primero.
 */
async function esperarFicha(pestañaActiva: string) {
  await waitFor(() => {
    expect(screen.getByText(/todavía no hay fotos/i)).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: pestañaActiva })).toHaveAttribute('aria-selected', 'true')
  })
  const inputs = document.querySelectorAll('input[type="file"]')
  expect(inputs).toHaveLength(1)
  const input = inputs[0] as HTMLInputElement
  return { input, click: vi.spyOn(input, 'click') }
}

describe('ficha de propiedad — subir fotos', () => {
  it('el botón del bloque vacío abre el selector estando YA en Multimedia', async () => {
    window.history.replaceState(null, '', '/properties/prop-1?tab=multimedia')
    const user = userEvent.setup()
    render(<PropertyDetailPage />)

    // La pestaña activa es Multimedia: el escenario exacto del reporte.
    const { click } = await esperarFicha('Multimedia')

    // Dos botones "Subir fotos": el del bloque vacío (primero en el DOM) y el
    // del aviso de próximo paso. Los dos tienen que abrir el mismo selector.
    const botones = screen.getAllByRole('button', { name: /subir fotos/i })
    expect(botones).toHaveLength(2)

    await user.click(botones[0])
    expect(click).toHaveBeenCalledTimes(1)

    await user.click(botones[1])
    expect(click).toHaveBeenCalledTimes(2)

    // Y no se movió de pestaña ni de lugar: no hay adónde ir.
    expect(screen.getByRole('tab', { name: 'Multimedia' })).toHaveAttribute('aria-selected', 'true')
  })

  it('el selector sigue montado desde cualquier otra pestaña', async () => {
    // Si el input viviera adentro del bloque de pestañas, acá sería `null`:
    // radix desmonta el `TabsContent` inactivo.
    window.history.replaceState(null, '', '/properties/prop-1?tab=historial')
    const user = userEvent.setup()
    render(<PropertyDetailPage />)

    const { click } = await esperarFicha('Historial')
    expect(screen.getByTestId('tab-historial')).toBeInTheDocument()
    expect(screen.queryByTestId('tab-multimedia')).not.toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /subir fotos/i })[0])
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('el input acepta varias imágenes de una', async () => {
    render(<PropertyDetailPage />)
    const { input } = await esperarFicha('Propiedad')
    expect(input).toHaveAttribute('accept', 'image/*')
    expect(input).toHaveAttribute('multiple')
  })

  it('al abogado no le ofrece subir fotos', async () => {
    rol = 'abogado'
    render(<PropertyDetailPage />)

    // Que desaparezca Multimedia de la barra prueba que el rol ya llegó: antes
    // de eso la ficha todavía se dibuja con los permisos por defecto.
    await waitFor(() => {
      expect(screen.getByText(/todavía no hay fotos/i)).toBeInTheDocument()
      expect(screen.queryByRole('tab', { name: 'Multimedia' })).not.toBeInTheDocument()
    })
    expect(screen.queryByRole('button', { name: /subir fotos/i })).not.toBeInTheDocument()
    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(1)
  })

  it('un aviso que SÍ cambia de pestaña deja la vista en el contenido, no en el tope', async () => {
    // Propiedad YA CAPTADA (tiene fotos) y sin documentación enviada: el
    // próximo paso es el recordatorio opcional "Ir a Documentación". Ahí el
    // destino es otro lugar de la ficha y el salto sí tiene sentido.
    propiedad = propiedadSinFotos({
      status: 'approved', photos: ['https://x/1.jpg'],
      legal_status: 'pending', legal_submitted_at: null, documents: [],
    })
    const user = userEvent.setup()
    render(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Propiedad' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByText('Documentación legal pendiente')).toBeInTheDocument()
    })
    // El aviso ya no acusa una falta: la propiedad está captada y se difunde.
    expect(screen.getByText(/no es obligatoria/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /ir a documentación/i }))

    expect(screen.getByTestId('tab-documentacion')).toBeInTheDocument()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    expect(window.scrollTo).not.toHaveBeenCalled()
  })

  /**
   * El bug (A) de la revisión adversarial: "enviar a revisión legal" pisaba
   * `properties.status`, y sobre una propiedad captada eso apagaba la pestaña
   * Difusión, la landing pública (404 con tráfico pago encima), las consultas
   * entrantes y el agendamiento del recorrido, todo de una.
   */
  it('enviar a revisión legal NO toca el estado de la propiedad', async () => {
    propiedad = propiedadSinFotos({
      status: 'approved', photos: ['https://x/1.jpg'],
      legal_status: 'pending', legal_submitted_at: null,
      documents: [{ name: 'Escritura', url: 'https://x/e.pdf' }],
    })
    const user = userEvent.setup()
    render(<PropertyDetailPage />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /enviar a revisión legal/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /enviar a revisión legal/i }))

    const llamadas = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(llamadas.some(([url]) => url === '/api/properties/prop-1/legal-submit')).toBe(true)
    // Ni un PUT: la columna de captación no se toca.
    expect(llamadas.some(([, init]) => (init as RequestInit | undefined)?.method === 'PUT')).toBe(false)
  })

  it('elegir una pestaña desde la barra sí vuelve al tope', async () => {
    const user = userEvent.setup()
    render(<PropertyDetailPage />)

    await esperarFicha('Propiedad')
    await user.click(screen.getByRole('tab', { name: 'Historial' }))

    expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
  })
})
