// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import InicioPage from './page'

/**
 * Piso móvil de Inicio.
 *
 * Inicio existe para mirarse DE UN VISTAZO: es la primera pantalla del día y su
 * único trabajo es decir cuánto hay esperando. Con una tarjeta por fila, las
 * cuatro ocupan ~448px de los ~640px útiles de un iPhone con la barra de
 * Safari; con dos por fila, 276px. Esos 172px son la diferencia entre ver
 * "Visitas de hoy" y tener que scrollear para enterarse de que hay visitas.
 *
 * Los dos invariantes de acá se rompen solos si alguien "ordena" las clases:
 *  1. la grilla arranca en DOS columnas (no en `grid-cols-1 sm:grid-cols-2`);
 *  2. el esqueleto de carga lleva las etiquetas de verdad — es lo que hace que
 *     mida lo mismo que la tarjeta terminada y no haya salto de layout, que era
 *     una virtud de la versión anterior y no se podía perder al pasar a dos
 *     columnas (con la tarjeta más angosta las etiquetas parten en dos
 *     renglones y una caja fija de 92px se quedaba corta).
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/inicio',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

/** Resuelve cuando se le dice: sirve para congelar la pantalla en "cargando". */
function promesaManual<T>() {
  let resolver!: (v: T) => void
  const promesa = new Promise<T>(r => { resolver = r })
  return { promesa, resolver }
}

let numerosCongelados: { promesa: Promise<unknown>; resolver: (v: unknown) => void } | null

beforeEach(() => {
  numerosCongelados = null
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.startsWith('/api/auth/me')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ id: 'u1', role: 'admin' }) })
    }
    if (numerosCongelados) return numerosCongelados.promesa
    if (url.startsWith('/api/leads/count')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ new: 4 }) })
    }
    if (url.startsWith('/api/properties/revision-legal')) {
      return Promise.resolve({ ok: true, status: 200, json: async () => ({ total: 2 }) })
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ data: [] }) })
  }))
})

/** La grilla de tarjetas: el contenedor directo de la primera tarjeta. */
function grillaDe(tarjeta: HTMLElement): HTMLElement {
  const grilla = tarjeta.parentElement
  if (!grilla) throw new Error('la tarjeta no tiene contenedor')
  return grilla
}

describe('/inicio — las cuatro tarjetas entran en una pantalla de teléfono', () => {
  it('la grilla arranca en dos columnas, sin pasar por una', async () => {
    render(<InicioPage />)
    const etiqueta = await screen.findByText('Pendientes')
    const grilla = grillaDe(etiqueta.closest('a, div[class*="rounded-xl"]') as HTMLElement)

    expect(grilla.className).toContain('grid-cols-2')
    expect(grilla.className, 'volvió a una columna en celular').not.toContain('grid-cols-1')
    // En escritorio ancho siguen siendo cuatro en fila, como antes.
    expect(grilla.className).toContain('lg:grid-cols-4')
  })

  it('las cuatro tarjetas se muestran (ninguna quedó fuera del recorte)', async () => {
    render(<InicioPage />)
    for (const etiqueta of ['Pendientes', 'Consultas sin responder', 'Propiedades por revisar', 'Visitas de hoy']) {
      expect(await screen.findByText(etiqueta)).toBeInTheDocument()
    }
  })
})

describe('/inicio — el esqueleto de carga no provoca un salto de layout', () => {
  it('mientras carga muestra las etiquetas reales, no cuatro rectángulos mudos', async () => {
    numerosCongelados = promesaManual<unknown>()
    render(<InicioPage />)

    // Con los números en el aire, la pantalla ya declara qué está viniendo.
    await waitFor(() => expect(screen.getAllByTestId('tarjeta-esqueleto').length).toBeGreaterThan(0))
    expect(screen.getByText('Visitas de hoy')).toBeInTheDocument()
    expect(screen.getByText('Cargando…')).toBeInTheDocument()

    const esqueleto = screen.getAllByTestId('tarjeta-esqueleto')[0]
    // Sin alto FIJO: la caja la define el contenido, igual que la tarjeta real.
    expect(esqueleto.className).not.toContain('h-[92px]')
    // Y no se anuncia: el "Cargando…" de arriba ya lo dice una vez.
    expect(esqueleto).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('/inicio — el enlace al embudo se puede tocar con el pulgar', () => {
  it('tiene 44px de alto en celular sin dejar de ser un enlace de texto', async () => {
    render(<InicioPage />)
    const enlace = await screen.findByRole('link', { name: 'Ver el estado del embudo' })
    expect(enlace.className).toContain('max-md:min-h-11')
    expect(enlace.className).toContain('underline')
  })
})
