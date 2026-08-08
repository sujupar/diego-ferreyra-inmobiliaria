// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react'
import AppraisalsPage from './page'

/**
 * Tasaciones absorbe `useFiltrosUrl` + `usePedidosVersionados` (task-13),
 * mismo patrón que `visits/page.test.tsx`. A diferencia de Visitas, acá SÍ
 * hay paginación server-side (page/limit) además del rango de fechas — de
 * ahí el test extra de "cambiar el filtro resetea a la página 1 sin
 * duplicar pedidos" (lógica propia de esta pantalla, sin precedente en las
 * otras cuatro).
 *
 * Igual que Contactos, el efecto de datos NO pide nada hasta resolver la
 * identidad (`userInfo`): el asesor solo ve sus tasaciones, y pedir antes
 * mostraría (por un instante) tasaciones ajenas.
 *
 * Mutar cualquiera de las reglas de abajo tiene que romper el primer test:
 *   1. Un filtro nuevo mientras un pedido viaja → el viejo NO pinta.
 *   2. El spinner se apaga con la respuesta VIGENTE, no con cualquiera.
 */

let busqueda = ''
const escrituras: string[] = []
const push = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/appraisals',
  useSearchParams: () => new URLSearchParams(busqueda),
  useRouter: () => ({
    replace: (href: string) => { escrituras.push(href) },
    push,
  }),
}))

interface Deferred<T> { promise: Promise<T>; resolve: (v: T) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

let authDeferred: Deferred<{ id: string; role: string }>
let appraisalsCalls: { url: string; d: Deferred<{ data: unknown[]; count: number }> }[]

beforeEach(() => {
  busqueda = ''
  escrituras.length = 0
  push.mockClear()
  authDeferred = deferred()
  appraisalsCalls = []
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.startsWith('/api/auth/me')) {
      return authDeferred.promise.then(data => ({ ok: true, json: async () => data }))
    }
    if (url.startsWith('/api/appraisals')) {
      const d = deferred<{ data: unknown[]; count: number }>()
      appraisalsCalls.push({ url, d })
      return d.promise.then(data => ({ ok: true, json: async () => data }))
    }
    return Promise.reject(new Error(`fetch inesperado: ${url}`))
  }))
})

/** Simula que Next terminó de commitear una URL — mismo patrón que el hook. */
function commitear(rerender: (ui: React.ReactElement) => void, href: string) {
  const i = href.indexOf('?')
  busqueda = i === -1 ? '' : href.slice(i + 1)
  act(() => { rerender(<AppraisalsPage />) })
}

function tasacion(id: string, titulo: string) {
  return {
    id,
    property_title: titulo,
    property_location: 'Palermo',
    publication_price: 100000,
    currency: 'USD',
    comparable_count: 3,
    created_at: '2026-08-01T15:00:00Z',
  }
}

describe('AppraisalsPage — efecto de datos con filtros en la URL', () => {
  it('un filtro nuevo mientras un pedido viaja: el viejo no pinta y el spinner se apaga con el vigente', async () => {
    const { rerender } = render(<AppraisalsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })

    await waitFor(() => expect(appraisalsCalls.length).toBe(1))
    appraisalsCalls[0].d.resolve({ data: [tasacion('a', 'Tasación Original')], count: 1 })
    await screen.findByText('Tasación Original')

    // La URL commitea a from=2026-08-01 (gen 2) — sin resolver todavía.
    commitear(rerender, '/appraisals?from=2026-08-01')
    await waitFor(() => expect(appraisalsCalls.length).toBe(2))

    // Y antes de que responda, otro commit a from=2026-08-05 (gen 3).
    commitear(rerender, '/appraisals?from=2026-08-05')
    await waitFor(() => expect(appraisalsCalls.length).toBe(3))

    // Responde PRIMERO el pedido viejo (gen 2, from=08-01): no tiene que pintar.
    appraisalsCalls[1].d.resolve({ data: [tasacion('b', 'Tasación Vieja')], count: 1 })
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByText('Tasación Vieja')).not.toBeInTheDocument()
    // Regla 2: el spinner sigue prendido — la respuesta VIGENTE (gen 3) no llegó.
    expect(screen.getByText('Cargando…')).toBeInTheDocument()

    // Responde el pedido vigente (gen 3, from=08-05).
    appraisalsCalls[2].d.resolve({ data: [tasacion('c', 'Tasación Vigente')], count: 1 })
    await screen.findByText('Tasación Vigente')

    // El spinner se apagó con la respuesta que correspondía.
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
    // Y el listado del pedido viejo nunca llegó a pintarse, ni después.
    expect(screen.queryByText('Tasación Vieja')).not.toBeInTheDocument()
  })

  it('cambiar el filtro con la página en 3 vuelve a la página 1 sin duplicar el pedido', async () => {
    const { rerender } = render(<AppraisalsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })

    await waitFor(() => expect(appraisalsCalls.length).toBe(1))
    // 25 resultados con pageSize=12 → hay página 3 (Math.ceil(25/12) = 3).
    appraisalsCalls[0].d.resolve({ data: [tasacion('a', 'Página 1')], count: 25 })
    await screen.findByText('Página 1')

    const paginacion = screen.getByText(/Pagina \d+ de \d+/).closest('div') as HTMLElement
    const siguiente = within(paginacion).getAllByRole('button')[1]

    // Página 1 → 2.
    fireEvent.click(siguiente)
    await waitFor(() => expect(appraisalsCalls.length).toBe(2))
    expect(appraisalsCalls[1].url).toContain('page=2')

    // Página 2 → 3.
    fireEvent.click(siguiente)
    await waitFor(() => expect(appraisalsCalls.length).toBe(3))
    expect(appraisalsCalls[2].url).toContain('page=3')

    // Cambiar el filtro de fechas ("Hoy") con la página en 3.
    fireEvent.click(screen.getByText('Hoy'))
    const href = escrituras[escrituras.length - 1]
    expect(href).toContain('from=')
    commitear(rerender, href)

    // Un solo pedido nuevo — no dos (uno con la página 3 vieja + el filtro
    // nuevo, descartado por el reset; otro ya en la página 1). Si el reset de
    // página estuviera roto, acá habría 5 pedidos en vez de 4.
    await waitFor(() => expect(appraisalsCalls.length).toBe(4))
    expect(appraisalsCalls[3].url).toContain('page=1')
    expect(appraisalsCalls[3].url).toContain('from=')
    await act(async () => { await Promise.resolve() })
    expect(appraisalsCalls.length).toBe(4)
  })
})

describe('AppraisalsPage — acciones de fila no navegan la fila', () => {
  it('clickear "Editar" en una fila NO dispara también la navegación de la fila', async () => {
    const { container } = render(<AppraisalsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(appraisalsCalls.length).toBe(1))
    appraisalsCalls[0].d.resolve({ data: [tasacion('a', 'Tasación Con Acciones')], count: 1 })
    await screen.findByText('Tasación Con Acciones')

    const editLink = container.querySelector('a[href*="editId=a"]') as HTMLAnchorElement
    expect(editLink).toBeTruthy()
    fireEvent.click(editLink)
    // Si la celda de acciones no frenara la propagación, este click también
    // dispararía el `onRowClick` de la fila (`router.push('/appraisals/a')`).
    expect(push).not.toHaveBeenCalled()
  })
})
