// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import VisitsPage from './page'

/**
 * Piso móvil del listado de Visitas — SOLO lo que está afuera de la tabla.
 *
 * La tabla en sí (que abajo de 48rem se convierte en fichas) la resuelve
 * `components/ui/DataTable.tsx` de una vez para todas las pantallas; acá se
 * fija el marco: el encabezado, la tarjeta del número y los filtros.
 *
 * Lo que se defiende:
 *  1. El contenedor NO vuelve a poner `container mx-auto py-6`. El layout del
 *     dashboard ya envuelve todo en `p-4 md:p-6`; esos 24px extra hacían que
 *     Visitas arrancara más abajo que Inicio, Contactos o CRM, y en un teléfono
 *     de ~640px útiles esa franja es contenido perdido.
 *  2. El esqueleto y el listado usan el MISMO marco, o la pantalla pega un
 *     salto al terminar de cargar.
 *  3. "Solo mías" declara que es un interruptor: es la única forma de que un
 *     lector de pantalla sepa si el listado está recortado (el color no le
 *     llega).
 */

let busqueda = ''

vi.mock('next/navigation', () => ({
  usePathname: () => '/visits',
  useSearchParams: () => new URLSearchParams(busqueda),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

beforeEach(() => {
  busqueda = ''
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.startsWith('/api/auth/me')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ id: 'u1', role: 'asesor' }) })
    }
    if (url.startsWith('/api/profiles')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) })
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) })
  }))
})

async function pintar() {
  const utils = render(<VisitsPage />)
  await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument())
  return utils
}

describe('/visits — el marco es el mismo que el del resto de las pantallas', () => {
  it('el listado no vuelve a envolver el contenido en `container mx-auto py-6`', async () => {
    const { container } = await pintar()
    const raiz = container.firstElementChild as HTMLElement
    expect(raiz.className).not.toContain('container')
    expect(raiz.className).not.toContain('py-6')
    expect(raiz.className).toContain('space-y-4')
  })

  it('el esqueleto de Suspense usa el mismo marco (sin salto al cargar)', () => {
    // El fallback se ve con `useSearchParams` en vuelo; acá alcanza con leer el
    // componente renderizado: los dos contenedores tienen que coincidir.
    const { container } = render(<VisitsPage />)
    const raiz = container.firstElementChild as HTMLElement
    expect(raiz.className).not.toContain('container')
    expect(raiz.className).not.toContain('py-6')
  })
})

describe('/visits — "Solo mías" es un interruptor y lo dice', () => {
  it('declara aria-pressed=false cuando el listado NO está recortado', async () => {
    await pintar()
    const boton = screen.getByRole('button', { name: 'Solo mías' })
    expect(boton).toHaveAttribute('aria-pressed', 'false')
  })

  it('declara aria-pressed=true cuando sí lo está', async () => {
    busqueda = 'onlyMine=true'
    await pintar()
    const boton = screen.getByRole('button', { name: 'Solo mías' })
    expect(boton).toHaveAttribute('aria-pressed', 'true')
  })
})
