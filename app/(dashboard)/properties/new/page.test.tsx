// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import NewPropertyPage from './page'

/**
 * D25 — el alta afirmaba «Datos precargados desde la tasación» sobre un
 * formulario VACÍO cuando la lectura de la tasación había fallado.
 *
 * `const appr = aj.data || aj` lavaba el cuerpo de error: `{error:'…'}` es un
 * objeto truthy, así que pasaba el guard, todos los campos quedaban `undefined`
 * (caían al valor previo) y sin embargo se guardaba el `appraisalId`, que es lo
 * que enciende el cartel azul Y lo que viaja en el POST.
 */

let busqueda = ''

vi.mock('next/navigation', () => ({
  useRouter: () => ({ back: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(busqueda),
}))

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() } }))
vi.mock('next/image', () => ({ default: (p: Record<string, unknown>) => <img {...p} /> }))
vi.mock('@/components/properties/alta/GenerarDescripcion', () => ({
  GenerarDescripcion: () => <div data-testid="generar-descripcion" />,
}))
vi.mock('@/lib/properties/upload-plans', () => ({
  uploadPlans: vi.fn(async () => {}),
  validatePlanFile: () => null,
}))

/** Respuesta de `GET /api/appraisals/:id`. */
let tasacion: { ok: boolean; body: unknown }

beforeEach(() => {
  busqueda = 'appraisalId=tas-1'
  tasacion = {
    ok: true,
    body: {
      data: {
        property_title: 'Rivadavia 4820',
        property_location: 'CABA, Caballito',
        publication_price: 180000,
        property_currency: 'USD',
        property_features: { rooms: 3, coveredArea: 78 },
      },
    },
  }
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.startsWith('/api/users/advisors')) {
      return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
    }
    if (url.startsWith('/api/appraisals/')) {
      return Promise.resolve({ ok: tasacion.ok, json: async () => tasacion.body })
    }
    // El selector de ubicación pide el catálogo al montar. Devolverle una lista
    // vacía lo deja quieto; sin esta rama caería en la rama de abajo y el test
    // estaría ejercitando, sin querer, el camino de "catálogo caído".
    if (url.startsWith('/api/locations/argenprop')) {
      return Promise.resolve({ ok: true, text: async () => JSON.stringify({ items: [] }) })
    }
    return Promise.reject(new Error(`fetch inesperado: ${url}`))
  }))
})

describe('alta de propiedad — precarga desde la tasación', () => {
  it('cuando la tasación se lee bien, avisa que precargó y los datos están', async () => {
    render(<NewPropertyPage />)

    await waitFor(() => expect(screen.getByText(/datos precargados desde la tasación/i)).toBeInTheDocument())
    expect(screen.getByDisplayValue('Rivadavia 4820')).toBeInTheDocument()
  })

  it('si la tasación no se pudo leer, NO afirma haber precargado nada', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      // El cuerpo de error es JSON válido: es exactamente lo que se colaba.
      tasacion = { ok: false, body: { error: 'No autenticado' } }
      render(<NewPropertyPage />)

      await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
      expect(screen.getByText(/no pudimos traer los datos de la tasación/i)).toBeInTheDocument()
      expect(screen.queryByText(/datos precargados desde la tasación/i)).not.toBeInTheDocument()
      // Y el formulario quedó vacío, como corresponde.
      expect(screen.queryByDisplayValue('Rivadavia 4820')).not.toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })

  /** `aj.data || aj` devolvía el cuerpo entero: un `{error:'…'}` con 200 se
   *  hacía pasar por tasación y encendía el cartel igual. */
  it('un 200 sin `data` tampoco cuenta como precarga', async () => {
    tasacion = { ok: true, body: { error: 'vacío' } }
    render(<NewPropertyPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: /volver/i })).toBeInTheDocument())
    expect(screen.queryByText(/datos precargados desde la tasación/i)).not.toBeInTheDocument()
  })

  it('sin ningún parámetro no muestra ni cartel ni aviso', async () => {
    busqueda = ''
    render(<NewPropertyPage />)

    await waitFor(() => expect(screen.getByRole('button', { name: /volver/i })).toBeInTheDocument())
    expect(screen.queryByText(/datos precargados desde la tasación/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
