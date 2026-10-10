// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import VisitDetailPage from './page'

/**
 * La ficha de visita en un teléfono (es la pantalla que el asesor abre parado
 * en la puerta de la propiedad, con una mano). Se fijan clases y nombres
 * accesibles porque estos problemas no los atrapa un test de comportamiento.
 */
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('next/navigation', () => ({ useParams: () => ({ id: '66666666-6666-4666-8666-666666666666' }) }))

const VISITA = {
  id: '66666666-6666-4666-8666-666666666666', status: 'pending_confirmation', scheduled_at: '2026-08-01T15:30:45Z',
  client_name: 'Juliana Rodríguez', client_email: 'juliana.rodriguez@gmail.com', client_phone: '+54 9 11 5555-5555',
  origin: 'cartel', origin_detail: null,
  propiedad: { id: 'p1', address: 'Av. Rivadavia 5400, piso 8 A, Caballito', neighborhood: null, foto: null },
  asesor: null, comprador: null, consulta: null, notes: null, completion_notes: null, outcome_reason: null,
  advisor_interest: null, reschedule_count: 0, created_by_ai: false, eventos: [],
  updated_at: '2026-10-10T13:00:00.123456+00:00',
  acciones: ['confirmar', 'reprogramar', 'cancelar', 'cambiar_asesor'],
}
let visita: Record<string, unknown>

beforeEach(() => {
  visita = { ...VISITA }
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, status: 200, json: async () => ({ data: visita }) })))
})

describe('ficha de visita — el encabezado no aplasta al estado', () => {
  it('el título y el badge se apilan en celular y vuelven a fila desde sm', async () => {
    render(<VisitDetailPage />)
    const titulo = await screen.findByRole('heading', { name: VISITA.propiedad.address })
    const cabecera = titulo.closest('header') as HTMLElement
    expect(cabecera.className).toContain('flex-col')
    expect(cabecera.className).toContain('gap-2')
    expect(cabecera.className).toContain('sm:flex-row')
  })
  it('el bloque del título puede encogerse y el badge no', async () => {
    render(<VisitDetailPage />)
    const titulo = await screen.findByRole('heading', { name: VISITA.propiedad.address })
    expect(titulo.closest('.min-w-0')).toBeTruthy()
    expect(titulo.className).toContain('break-words')
    expect(screen.getByText('A confirmar').className).toContain('shrink-0')
  })
})

describe('ficha de visita — el cliente se puede llamar desde el teléfono', () => {
  it('el número es un enlace tel: con los separadores fuera', async () => {
    render(<VisitDetailPage />)
    const tel = await screen.findByRole('link', { name: VISITA.client_phone })
    expect(tel).toHaveAttribute('href', 'tel:+5491155555555')
    expect(tel.className).toContain('max-md:min-h-11')
  })
  it('el mail es un enlace mailto: y parte si no entra', async () => {
    render(<VisitDetailPage />)
    const mail = await screen.findByRole('link', { name: VISITA.client_email })
    expect(mail).toHaveAttribute('href', `mailto:${VISITA.client_email}`)
    expect(mail.className).toContain('break-all')
  })
  it('sin teléfono ni mail no dibuja enlaces vacíos', async () => {
    visita = { ...VISITA, client_email: null, client_phone: null }
    render(<VisitDetailPage />)
    await screen.findByRole('heading', { name: VISITA.propiedad.address })
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument()
    expect(document.querySelector('a[href^="tel:"]')).toBeNull()
  })
})

describe('ficha de visita — la fecha se lee, no se descifra', () => {
  it('día de la semana y hora argentina en 24 h, sin segundos', async () => {
    render(<VisitDetailPage />)
    await screen.findByRole('heading', { name: VISITA.propiedad.address })
    expect(screen.getByText('sábado 1 de agosto, 12:30')).toBeInTheDocument()
  })
})

describe('ficha de visita — la acción principal ocupa el ancho en celular', () => {
  it('"Confirmar visita" es una barra de lado a lado por debajo de md', async () => {
    render(<VisitDetailPage />)
    expect((await screen.findByRole('button', { name: 'Confirmar visita' })).className).toContain('max-md:w-full')
  })
  it('con la visita pasada, "Se realizó" también', async () => {
    visita = { ...VISITA, status: 'scheduled', acciones: ['realizada', 'no_realizada', 'reprogramar', 'cambiar_asesor'] }
    render(<VisitDetailPage />)
    expect((await screen.findByRole('button', { name: 'Se realizó' })).className).toContain('max-md:w-full')
  })
})

describe('ficha de visita — el marco es el del resto de las pantallas', () => {
  it('no vuelve a envolver el contenido en `container mx-auto py-6`', async () => {
    const { container } = render(<VisitDetailPage />)
    await screen.findByRole('heading', { name: VISITA.propiedad.address })
    const raiz = container.firstElementChild as HTMLElement
    expect(raiz.className).not.toContain('container')
    expect(raiz.className).not.toContain('py-6')
  })
})
