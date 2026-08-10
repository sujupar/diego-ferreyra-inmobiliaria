// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import VisitDetailPage from './page'

/**
 * La ficha de visita en un teléfono.
 *
 * Es la pantalla que el asesor abre parado en la puerta de la propiedad, con
 * una mano. Tenía cuatro problemas que solo se ven angosto:
 *
 *  1. El encabezado era `flex items-start justify-between` sin `gap`, sin
 *     `min-w-0` y sin apilado: una dirección larga empujaba al Badge —que es
 *     encogible— y "A confirmar" se partía en dos renglones contra el borde.
 *  2. El teléfono y el mail del cliente eran texto plano. En la pantalla que
 *     existe para llamar al cliente, había que seleccionar el número a mano.
 *  3. La fecha salía de `toLocaleString('es-AR')`: "1/8/2026, 12:00:00".
 *  4. Los botones de acción quedaban chicos y alineados a la izquierda.
 *
 * Nada de esto lo atrapa un test de comportamiento: la pantalla "funciona"
 * igual. Por eso se fijan las clases y los nombres accesibles.
 */

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'v1' }) }))

const VISITA = {
  id: 'v1',
  status: 'pending_confirmation',
  scheduled_at: '2026-08-01T15:30:45Z',
  client_name: 'Juliana Rodríguez',
  client_email: 'juliana.rodriguez@gmail.com',
  client_phone: '+54 9 11 5555-5555',
  property: { address: 'Av. Rivadavia 5400, piso 8 A, Caballito' },
}

let visita: Record<string, unknown>

beforeEach(() => {
  visita = { ...VISITA }
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.includes('/questionnaire')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) })
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: visita }) })
  }))
})

describe('ficha de visita — el encabezado no aplasta al estado', () => {
  it('el título y el badge se apilan en celular y vuelven a fila desde sm', async () => {
    render(<VisitDetailPage />)
    const titulo = await screen.findByRole('heading', { name: VISITA.property.address })
    const cabecera = titulo.closest('header')!

    expect(cabecera.className).toContain('flex-col')
    expect(cabecera.className).toContain('gap-2')
    expect(cabecera.className).toContain('sm:flex-row')
  })

  it('el bloque del título puede encogerse y el badge no', async () => {
    render(<VisitDetailPage />)
    const titulo = await screen.findByRole('heading', { name: VISITA.property.address })
    expect(titulo.closest('.min-w-0'), 'el título no está en un contenedor encogible').toBeTruthy()
    // Una dirección de una sola palabra larga tiene que partirse, no desbordar.
    expect(titulo.className).toContain('break-words')

    const badge = screen.getByText('A confirmar')
    expect(badge.className).toContain('shrink-0')
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
    // Un mail es UN token sin espacios: sin `break-all` empuja la tarjeta entera.
    expect(mail.className).toContain('break-all')
  })

  it('sin teléfono ni mail no dibuja enlaces vacíos', async () => {
    visita = { ...VISITA, client_email: null, client_phone: null }
    render(<VisitDetailPage />)
    await screen.findByRole('heading', { name: VISITA.property.address })
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument()
    expect(document.querySelector('a[href^="tel:"]')).toBeNull()
  })
})

describe('ficha de visita — la fecha se lee, no se descifra', () => {
  it('imprime día de la semana y hora en 24h, sin segundos', async () => {
    render(<VisitDetailPage />)
    await screen.findByRole('heading', { name: VISITA.property.address })
    const fecha = screen.getByText(/de agosto de 2026/)
    expect(fecha.textContent).not.toMatch(/:\d{2}:\d{2}/)
    expect(fecha.textContent).not.toMatch(/[ap]\.\s?m\./)
  })
})

describe('ficha de visita — la acción principal ocupa el ancho en celular', () => {
  it('"Confirmar visita" es una barra de lado a lado por debajo de md', async () => {
    render(<VisitDetailPage />)
    const boton = await screen.findByRole('button', { name: 'Confirmar visita' })
    expect(boton.className).toContain('max-md:w-full')
  })

  it('con la visita agendada, "¿Se realizó?" también', async () => {
    visita = { ...VISITA, status: 'scheduled' }
    render(<VisitDetailPage />)
    const boton = await screen.findByRole('button', { name: '¿Se realizó?' })
    expect(boton.className).toContain('max-md:w-full')
  })
})

describe('ficha de visita — el marco es el del resto de las pantallas', () => {
  it('no vuelve a envolver el contenido en `container mx-auto py-6`', async () => {
    const { container } = render(<VisitDetailPage />)
    await screen.findByRole('heading', { name: VISITA.property.address })
    const raiz = container.firstElementChild as HTMLElement
    expect(raiz.className).not.toContain('container')
    expect(raiz.className).not.toContain('py-6')
  })
})
