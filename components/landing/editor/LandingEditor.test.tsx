// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import { LandingEditor } from './LandingEditor'
import type { LandingProperty } from '@/lib/landing/registry'
import type { LandingBlock, LandingDocument } from '@/lib/landing/schema'

/**
 * Dos reglas del editor de landing, las dos sobre NO perder trabajo del asesor:
 *
 *  1. Ocultar una sección y volver a mostrarla DESPUÉS DE RECARGAR devuelve su
 *     contenido. Antes lo ocultado vivía en un `useRef` (memoria del componente)
 *     y al recargar se caía al bloque por defecto: el texto de zona que había
 *     escrito la IA no estaba en ningún lado.
 *  2. "Volver" guarda lo que quedó pendiente del autosave. El debounce es de
 *     800ms: escribir y salir enseguida perdía lo último tipeado, en silencio y
 *     con el cartel diciendo "Guardado".
 */

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, refresh: () => {} }) }))
vi.mock('sonner', () => ({ toast: { error: () => {}, success: () => {} } }))

const PROPERTY = {
  id: 'prop-1',
  address: 'Gurruchaga 1234',
  neighborhood: 'Palermo',
  city: 'CABA',
  property_type: 'departamento',
  operation_type: 'venta',
  asking_price: 250000,
  currency: 'USD',
  rooms: 3,
  bedrooms: 2,
  bathrooms: 1,
  covered_area: 80,
  total_area: 95,
  photos: ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'],
  plans: [],
  description: 'Un depto lindo',
  latitude: -34.6,
  longitude: -58.4,
  video_url: null,
  video_file_url: null,
  tour_3d_url: null,
  video_recorrido_url: null,
} as unknown as LandingProperty

const UBICACION: LandingBlock = {
  id: 'location',
  type: 'location_showcase',
  eyebrow: 'Ubicación',
  title: 'Palermo Soho',
  body: 'A dos cuadras del Botánico, con el subte D a mano.',
  photoIndex: 3,
  showMap: true,
}

const CON_UBICACION: LandingDocument = {
  version: 1,
  theme: {},
  blocks: [
    { id: 'hero', type: 'hero', ctaLabel: 'Quiero verla' },
    UBICACION,
    {
      id: 'closing', type: 'closing_invite', eyebrow: 'Vení a recorrerla',
      headline: 'Conocé la propiedad por dentro', ctaLabel: 'Quiero verla',
    },
  ],
}

/** Lo que devolvería el server tras recargar con la sección ya oculta. */
const SIN_UBICACION: LandingDocument = {
  ...CON_UBICACION,
  blocks: CON_UBICACION.blocks.filter(b => b.id !== 'location'),
}

let patchs: { draftContent?: LandingDocument }[]

beforeEach(() => {
  push.mockClear()
  patchs = []
  window.localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') patchs.push(JSON.parse(String(init.body)))
    return { ok: true, status: 200, json: async () => ({}), text: async () => '{}' } as unknown as Response
  }))
})

afterEach(() => { vi.unstubAllGlobals() })

function editor(doc: LandingDocument) {
  return render(
    <LandingEditor
      propertyId="prop-1"
      property={PROPERTY}
      initialDocument={doc}
      isPublished
      publicSlug="gurruchaga-1234"
    />,
  )
}

describe('Editor de landing — ocultar y volver a mostrar una sección', () => {
  it('recupera el contenido de la sección después de recargar', async () => {
    const primera = editor(CON_UBICACION)
    const interruptor = await screen.findByRole('switch', { name: /Ubicación/i })
    expect(interruptor).toBeChecked()

    // El asesor la oculta…
    fireEvent.click(interruptor)
    await waitFor(() => expect(screen.getByRole('switch', { name: /Ubicación/i })).not.toBeChecked())

    // …y se va. Al volver, el server ya no tiene la sección en el borrador.
    primera.unmount()
    editor(SIN_UBICACION)

    const interruptor2 = await screen.findByRole('switch', { name: /Ubicación/i })
    expect(interruptor2).not.toBeChecked()
    fireEvent.click(interruptor2)

    // Lo que se vuelve a guardar tiene que traer el texto de vuelta, no un bloque pelado.
    await act(async () => { await new Promise(r => setTimeout(r, 1000)) })
    const ultimo = patchs.filter(p => p.draftContent).at(-1)
    const location = ultimo?.draftContent?.blocks.find(b => b.id === 'location') as typeof UBICACION | undefined
    expect(location).toBeDefined()
    expect(location?.body ?? '(se perdió el texto)').toContain('Botánico')
    expect(location?.title).toBe('Palermo Soho')
    expect(location?.photoIndex).toBe(3)
  })
})

describe('Editor de landing — "Volver"', () => {
  it('guarda lo pendiente antes de irse (no espera al debounce)', async () => {
    editor(CON_UBICACION)

    // Editar un campo: el autosave queda pendiente con su debounce de 800ms.
    const campo = await screen.findByLabelText(/Texto del botón/i)
    fireEvent.change(campo, { target: { value: 'Quiero conocerla' } })

    // Salir ENSEGUIDA, antes de que el debounce dispare.
    fireEvent.click(screen.getByRole('button', { name: /Volver/i }))

    await waitFor(() => expect(push).toHaveBeenCalledWith('/properties/prop-1'))
    const guardados = patchs.filter(p => p.draftContent)
    expect(guardados.length).toBeGreaterThan(0)
    const hero = guardados.at(-1)?.draftContent?.blocks.find(b => b.id === 'hero') as { ctaLabel?: string }
    expect(hero.ctaLabel).toBe('Quiero conocerla')
  })

  it('guarda lo pendiente aunque el editor se desmonte por otra vía (atrás del navegador)', async () => {
    // El editor tapa el chrome del dashboard: además del botón "Volver" están el
    // botón atrás y cerrar la pestaña, que no pasan por ningún onClick nuestro.
    const vista = editor(CON_UBICACION)
    const campo = await screen.findByLabelText(/Texto del botón/i)
    fireEvent.change(campo, { target: { value: 'Reservá tu visita' } })

    await act(async () => { vista.unmount() })

    const guardados = patchs.filter(p => p.draftContent)
    expect(guardados.length).toBeGreaterThan(0)
    const hero = guardados.at(-1)?.draftContent?.blocks.find(b => b.id === 'hero') as { ctaLabel?: string }
    expect(hero.ctaLabel).toBe('Reservá tu visita')
  })
})
