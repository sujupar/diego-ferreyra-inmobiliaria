// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import CarruselDetailPage from './page'

/**
 * Las dos acciones sobre un slide —regenerar la imagen (↻) y "Guardar y
 * re-renderizar"— fallaban EN SILENCIO: hacían el PATCH y pasaban derecho a
 * recargar el estado sin mirar `res.ok`. Como `fetch` no rechaza ante un 500, el
 * error se perdía entero, y del lado del servidor la generación TIRA antes de
 * escribir nada, así que la fila vuelve intacta: ni "failed", ni banner rojo, ni
 * imagen nueva. El asesor veía apagarse el spinner y todo igual que antes.
 *
 * Y el camino silencioso es el frecuente, no el raro: el límite de facturación
 * de OpenAI agotado, o el corte por tiempo del gateway cuando la imagen tarda
 * más que la función (que igual consume una imagen paga). Reintentar "viendo
 * nada" quema plata.
 *
 * Mutar el chequeo de `res.ok` en `patchSlide` tiene que poner estos tests en rojo.
 */

vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'car-1' }) }))

const DETALLE = {
  id: 'car-1', status: 'ready', progress: 100, title: 'Carrusel de prueba', topic: 'tema',
  cta_type: 'organic', caption: 'hola', hashtags: ['#a'], error: null, step: null,
  slides: [
    {
      position: 1, role: 'hook', layout: 'x', status: 'composed', image_kind: 'photo',
      copy: { eyebrow: 'Antes', title: 'Título viejo', body: 'Cuerpo viejo' },
      url: 'https://ejemplo/1.jpg', error: null,
    },
  ],
}

function respuesta(body: unknown, ok = true, status = 200) {
  return { ok, status, text: async () => JSON.stringify(body), json: async () => body } as unknown as Response
}

let avisos: string[]
let patchs: number

beforeEach(() => {
  avisos = []
  patchs = 0
  vi.stubGlobal('alert', (m: string) => { avisos.push(m) })
})

afterEach(() => { vi.unstubAllGlobals() })

function stubFetch(patchRes: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if ((init?.method ?? 'GET') === 'PATCH') { patchs++; return patchRes() }
    if (url.includes('/api/social/carousels/car-1') && !init?.method) return respuesta(DETALLE)
    return respuesta(DETALLE)
  }))
}

describe('Detalle de carrusel — el error del slide se ve', () => {
  it('regenerar (↻) avisa cuando el PATCH falla, en vez de quedar mudo', async () => {
    stubFetch(async () => respuesta({ error: 'billing_hard_limit_reached' }, false, 500))
    render(<CarruselDetailPage />)

    const boton = await screen.findByRole('button', { name: '↻' })
    fireEvent.click(boton)

    await waitFor(() => expect(patchs).toBe(1))
    await waitFor(() => expect(avisos.length).toBe(1))
    expect(avisos[0]).toMatch(/billing_hard_limit_reached/)
    // Y el botón vuelve a estar disponible (no queda "regenerando…" para siempre).
    await waitFor(() => expect(screen.getByRole('button', { name: '↻' })).toBeEnabled())
  })

  it('regenerar traduce el corte por tiempo del gateway (cuerpo HTML, no JSON)', async () => {
    stubFetch(async () => ({
      ok: false, status: 504, text: async () => '<HTML>Gateway Timeout</HTML>',
    } as unknown as Response))
    render(<CarruselDetailPage />)

    fireEvent.click(await screen.findByRole('button', { name: '↻' }))

    await waitFor(() => expect(avisos.length).toBe(1))
    expect(avisos[0]).toMatch(/tardó demasiado/i)
    expect(avisos[0]).not.toMatch(/Unexpected token/i)
  })

  it('"Guardar y re-renderizar" NO cierra el diálogo si el guardado falló', async () => {
    stubFetch(async () => respuesta({ error: 'No se pudo re-renderizar' }, false, 500))
    render(<CarruselDetailPage />)

    fireEvent.click(await screen.findByRole('button', { name: /Editar/i }))
    const guardar = await screen.findByRole('button', { name: /Guardar y re-renderizar/i })
    fireEvent.click(guardar)

    await waitFor(() => expect(avisos.length).toBe(1))
    expect(avisos[0]).toMatch(/No se pudo re-renderizar/)
    // El diálogo sigue abierto con lo tipeado, y el botón vuelve a estar activo.
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Guardar y re-renderizar/i })).toBeEnabled()
    })
  })

  it('cuando el guardado sale bien, el diálogo se cierra', async () => {
    stubFetch(async () => respuesta({ ok: true }, true, 200))
    render(<CarruselDetailPage />)

    fireEvent.click(await screen.findByRole('button', { name: /Editar/i }))
    fireEvent.click(await screen.findByRole('button', { name: /Guardar y re-renderizar/i }))

    await waitFor(() => expect(patchs).toBe(1))
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /Guardar y re-renderizar/i })).not.toBeInTheDocument()
    })
    expect(avisos).toEqual([])
  })
})
