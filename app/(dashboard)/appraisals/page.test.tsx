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

/** A4: permite simular un 401/404 de /api/auth/me (que igual devuelve JSON). */
let authOk = true
let authDeferred: Deferred<{ id: string; role: string }>
let appraisalsCalls: { url: string; d: Deferred<{ data: unknown[]; count: number }> }[]

beforeEach(() => {
  busqueda = ''
  escrituras.length = 0
  push.mockClear()
  authOk = true
  authDeferred = deferred()
  appraisalsCalls = []
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.startsWith('/api/auth/me')) {
      return authDeferred.promise.then(data => ({ ok: authOk, json: async () => data }))
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

  it('un parámetro ajeno en la URL (?tab=), con la página en 3 y el MISMO rango de fechas, no resetea la página', async () => {
    // Ronda de arreglos 1: el reset de página comparaba `filtros` por
    // IDENTIDAD (`!==`). `aplicados` cambia de identidad ante CUALQUIER
    // parámetro de la URL —propio o ajeno— porque sale de un `useMemo` que
    // depende del querystring COMPLETO, no solo de `from`/`to`. Este test
    // reproduce el caso: llega `?tab=info`, un parámetro que esta pantalla ni
    // siquiera declara como propio, y como `from`/`to` no cambiaron, la
    // página 3 tiene que seguir siendo la 3.
    const { rerender } = render(<AppraisalsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })

    await waitFor(() => expect(appraisalsCalls.length).toBe(1))
    appraisalsCalls[0].d.resolve({ data: [tasacion('a', 'Página 1')], count: 25 })
    await screen.findByText('Página 1')

    const paginacion = screen.getByText(/Pagina \d+ de \d+/).closest('div') as HTMLElement
    const siguiente = within(paginacion).getAllByRole('button')[1]

    fireEvent.click(siguiente)
    await waitFor(() => expect(appraisalsCalls.length).toBe(2))
    fireEvent.click(siguiente)
    await waitFor(() => expect(appraisalsCalls.length).toBe(3))
    expect(appraisalsCalls[2].url).toContain('page=3')

    // Un parámetro ajeno se commitea (un deep link, otro componente) — NO es
    // un filtro de esta pantalla, `from`/`to` siguen en ''.
    commitear(rerender, '/appraisals?tab=info')

    // Con la URL cambiando, el efecto vuelve a correr, pero como NINGÚN
    // filtro cambió de valor, no hay reset: el pedido nuevo pide la MISMA
    // página (3), no la 1.
    await waitFor(() => expect(appraisalsCalls.length).toBe(4))
    expect(appraisalsCalls[3].url).toContain('page=3')
    expect(appraisalsCalls[3].url).not.toContain('page=1')
  })
})

describe('AppraisalsPage — la selección no sobrevive al cambio de listado', () => {
  // A1 de la revisión final de la Fase 2. La barra de acciones masivas de esta
  // pantalla ofrece "Eliminar DEFINITIVAMENTE": una fila tildada que sobrevive
  // a un cambio de filtro (o de página) es un `DELETE` sobre algo que el
  // usuario ya no ve en pantalla.
  it('tildar una fila y cambiar el filtro deja la selección vacía', async () => {
    const { rerender } = render(<AppraisalsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })

    await waitFor(() => expect(appraisalsCalls.length).toBe(1))
    appraisalsCalls[0].d.resolve({ data: [tasacion('a', 'Tasación Tildada')], count: 1 })
    await screen.findByText('Tasación Tildada')

    fireEvent.click(screen.getByLabelText('Seleccionar fila'))
    expect(screen.getByText('1 tasaciones seleccionado')).toBeInTheDocument()

    // Cambia el rango de fechas: llega OTRO listado, que puede no contener la
    // fila tildada.
    commitear(rerender, '/appraisals?from=2026-08-05')
    await waitFor(() => expect(appraisalsCalls.length).toBe(2))

    // La barra tiene que haber desaparecido ya — sin esperar a que responda el
    // pedido nuevo: mientras tanto la fila ni siquiera está en pantalla.
    expect(screen.queryByText(/seleccionado/)).not.toBeInTheDocument()

    appraisalsCalls[1].d.resolve({ data: [tasacion('b', 'Otra Tasación')], count: 1 })
    await screen.findByText('Otra Tasación')
    expect(screen.queryByText(/seleccionado/)).not.toBeInTheDocument()
  })

  it('tildar una fila y pasar a la página 2 deja la selección vacía', async () => {
    render(<AppraisalsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })

    await waitFor(() => expect(appraisalsCalls.length).toBe(1))
    appraisalsCalls[0].d.resolve({ data: [tasacion('a', 'Página 1')], count: 25 })
    await screen.findByText('Página 1')

    fireEvent.click(screen.getByLabelText('Seleccionar fila'))
    expect(screen.getByText('1 tasaciones seleccionado')).toBeInTheDocument()

    const paginacion = screen.getByText(/Pagina \d+ de \d+/).closest('div') as HTMLElement
    const siguiente = within(paginacion).getAllByRole('button')[1]
    fireEvent.click(siguiente)

    await waitFor(() => expect(appraisalsCalls.length).toBe(2))
    expect(screen.queryByText(/seleccionado/)).not.toBeInTheDocument()
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

describe('AppraisalsPage — identidad fail-closed (A4)', () => {
  it('un 401 de /api/auth/me (que igual devuelve JSON) NO deja salir el pedido sin assigned_to', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      authOk = false
      render(<AppraisalsPage />)
      authDeferred.resolve({ error: 'No autenticado' } as never)
      await act(async () => { await Promise.resolve() })
      await act(async () => { await Promise.resolve() })
      expect(appraisalsCalls.length).toBe(0)
    } finally {
      errores.mockRestore()
    }
  })

  it('un 200 sin id tampoco es una identidad', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<AppraisalsPage />)
      authDeferred.resolve({ role: 'asesor' } as never)
      await act(async () => { await Promise.resolve() })
      await act(async () => { await Promise.resolve() })
      expect(appraisalsCalls.length).toBe(0)
    } finally {
      errores.mockRestore()
    }
  })
})
