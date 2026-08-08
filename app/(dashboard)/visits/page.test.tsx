// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import VisitsPage from './page'

/**
 * Visitas absorbe `useFiltrosUrl` + `usePedidosVersionados` (task-12), mismo
 * patrón que `contacts/page.test.tsx` y `crm/page.test.tsx`.
 *
 * Diferencia clave con Contactos: acá el efecto de datos NO espera a resolver
 * la identidad antes de pedir — ya era así en la versión vieja de la pantalla
 * (`user` solo afina `advisor_id` cuando "Solo mías" está activo). Por eso no
 * hay un test análogo al de "no pide hasta identidad" de Contactos, y tampoco
 * hay uno de la regla 3 del versionado (`actual()`/bandera de botón): Visitas
 * no pagina ni tiene "cargar más"/"refrescar" — ver `crm/page.test.tsx` para
 * ese caso.
 *
 * Mutar cualquiera de las dos reglas de abajo tiene que romper el primer test:
 *   1. Un filtro nuevo mientras un pedido viaja → el viejo NO pinta.
 *   2. El spinner se apaga con la respuesta VIGENTE, no con cualquiera.
 */

let busqueda = ''
const escrituras: string[] = []

vi.mock('next/navigation', () => ({
  usePathname: () => '/visits',
  useSearchParams: () => new URLSearchParams(busqueda),
  useRouter: () => ({
    replace: (href: string) => { escrituras.push(href) },
    push: () => {},
  }),
}))

interface Deferred<T> { promise: Promise<T>; resolve: (v: T) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

let authDeferred: Deferred<{ id: string; role: string }>
let visitsCalls: { url: string; d: Deferred<{ data: unknown[] }> }[]

beforeEach(() => {
  busqueda = ''
  escrituras.length = 0
  authDeferred = deferred()
  visitsCalls = []
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.startsWith('/api/auth/me')) {
      return authDeferred.promise.then(data => ({ ok: true, json: async () => data }))
    }
    if (url.startsWith('/api/profiles')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: [{ id: 'adv1', full_name: 'Asesor Uno' }] }),
      })
    }
    if (url.startsWith('/api/visits')) {
      const d = deferred<{ data: unknown[] }>()
      visitsCalls.push({ url, d })
      return d.promise.then(data => ({ ok: true, json: async () => data }))
    }
    return Promise.reject(new Error(`fetch inesperado: ${url}`))
  }))
})

/** Simula que Next terminó de commitear una URL — mismo patrón que el hook. */
function commitear(rerender: (ui: React.ReactElement) => void, href: string) {
  const i = href.indexOf('?')
  busqueda = i === -1 ? '' : href.slice(i + 1)
  act(() => { rerender(<VisitsPage />) })
}

function visita(id: string, cliente: string, status = 'scheduled') {
  return {
    id,
    scheduled_at: '2026-08-01T15:00:00Z',
    client_name: cliente,
    status,
    property: { id: 'p1', address: `Dirección de ${cliente}`, neighborhood: 'Palermo', photos: [] },
    advisor: null,
  }
}

describe('VisitsPage — efecto de datos con filtros en la URL', () => {
  it('un filtro nuevo mientras un pedido viaja: el viejo no pinta y el spinner se apaga con el vigente', async () => {
    const { rerender } = render(<VisitsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })

    // A diferencia de Contactos, acá el efecto NO espera a la identidad para
    // pedir: dispara en el montaje (`user=null`) y otra vez apenas `user`
    // resuelve (mismo filtro, pero `user` es dependencia del efecto). Los dos
    // pedidos son de la MISMA ráfaga de filtro — el segundo es el vigente.
    await waitFor(() => expect(visitsCalls.length).toBe(2))
    visitsCalls[1].d.resolve({ data: [visita('a', 'Cliente Original')] })
    await screen.findByText('Cliente Original')

    // La URL commitea a status=scheduled (gen 3) — sin resolver todavía.
    commitear(rerender, '/visits?status=scheduled')
    await waitFor(() => expect(visitsCalls.length).toBe(3))

    // Y antes de que responda, otro commit a status=completed (gen 4).
    commitear(rerender, '/visits?status=completed')
    await waitFor(() => expect(visitsCalls.length).toBe(4))

    // Responde PRIMERO el pedido viejo (gen 3, scheduled): no tiene que pintar.
    visitsCalls[2].d.resolve({ data: [visita('b', 'Cliente Agendado Viejo', 'scheduled')] })
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByText('Cliente Agendado Viejo')).not.toBeInTheDocument()
    // Regla 2: el spinner sigue prendido — la respuesta VIGENTE (gen 4) no llegó.
    expect(screen.getByText('Cargando…')).toBeInTheDocument()

    // Responde el pedido vigente (gen 4, completed).
    visitsCalls[3].d.resolve({ data: [visita('c', 'Cliente Realizado Vigente', 'completed')] })
    await screen.findByText('Cliente Realizado Vigente')

    // El spinner se apagó con la respuesta que correspondía.
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
    // Y el listado del pedido viejo nunca llegó a pintarse, ni después.
    expect(screen.queryByText('Cliente Agendado Viejo')).not.toBeInTheDocument()
  })
})

describe('VisitsPage — visibilidad del desplegable Asesor', () => {
  it('no aparece mientras no se conoce el rol, ni para el rol asesor una vez resuelto', async () => {
    render(<VisitsPage />)
    // Antes de resolver identidad no se muestra — si el gate fuera solo
    // `!isAsesor`, acá aparecería (parpadeo, la lección de CRM).
    expect(screen.queryByLabelText('Asesor')).not.toBeInTheDocument()

    authDeferred.resolve({ id: 'u1', role: 'asesor' })
    await waitFor(() => expect(visitsCalls.length).toBeGreaterThanOrEqual(1))
    expect(screen.queryByLabelText('Asesor')).not.toBeInTheDocument()
  })

  it('aparece para un rol admin/dueño/coordinador una vez resuelta la identidad', async () => {
    render(<VisitsPage />)
    authDeferred.resolve({ id: 'u1', role: 'coordinador' })
    await waitFor(() => expect(screen.getByLabelText('Asesor')).toBeInTheDocument())
  })
})

describe('VisitsPage — "Solo mías"', () => {
  it('escribe onlyMine=true en la URL al tocarlo', async () => {
    render(<VisitsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    // Dos pedidos por el mismo motivo que en el test de la carrera (montaje
    // sin identidad + identidad resuelta); el vigente es el segundo.
    await waitFor(() => expect(visitsCalls.length).toBe(2))
    visitsCalls[1].d.resolve({ data: [] })
    await screen.findByText('No hay visitas')

    fireEvent.click(screen.getByText('Solo mías'))
    expect(escrituras[escrituras.length - 1]).toContain('onlyMine=true')
  })

  it('con onlyMine=true ya en la URL (F5), el pedido lleva advisor_id = el id propio', async () => {
    busqueda = 'onlyMine=true'
    render(<VisitsPage />)
    authDeferred.resolve({ id: 'u1', role: 'asesor' })
    // El primer pedido (montaje, sin identidad) no puede llevarlo — recién el
    // que sigue a la identidad resuelta.
    await waitFor(() => expect(visitsCalls.length).toBe(2))
    expect(visitsCalls[1].url).toContain('advisor_id=u1')
  })
})

describe('VisitsPage — "Limpiar todo"', () => {
  it('limpia estado, fechas y "solo mías"', async () => {
    busqueda = 'status=scheduled&from=2026-08-01&to=2026-08-08&onlyMine=true'
    render(<VisitsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(visitsCalls.length).toBe(2))
    visitsCalls[1].d.resolve({ data: [] })
    await screen.findByText('No hay visitas')

    fireEvent.click(screen.getByText('Limpiar todo'))
    expect(escrituras[escrituras.length - 1]).toBe('/visits')
  })
})

describe('VisitsPage — el rango de fechas se interpreta en hora LOCAL (A5)', () => {
  // Se fija la zona horaria del proceso para que el test valga igual en
  // cualquier máquina (y en CI): con TZ=UTC el bug es invisible, porque la
  // medianoche local y la UTC coinciden.
  const tzOriginal = process.env.TZ

  beforeEach(() => { process.env.TZ = 'America/Argentina/Buenos_Aires' })
  afterEach(() => { process.env.TZ = tzOriginal })

  it('un rango de UN solo día no incluye nada del día anterior', async () => {
    busqueda = 'from=2026-08-05&to=2026-08-05'
    render(<VisitsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(visitsCalls.length).toBe(2))

    const params = new URLSearchParams(visitsCalls[1].url.split('?')[1])
    const desde = new Date(params.get('from') as string)
    const hasta = new Date(params.get('to') as string)

    // El "desde" es la medianoche LOCAL del 5, no las 21:00 del 4.
    expect(desde.getFullYear()).toBe(2026)
    expect(desde.getMonth()).toBe(7) // agosto
    expect(desde.getDate()).toBe(5)
    expect(desde.getHours()).toBe(0)
    expect(desde.getMinutes()).toBe(0)

    // Y el "hasta" sigue cerrando al final del MISMO día local (no cambió).
    expect(hasta.getDate()).toBe(5)
    expect(hasta.getHours()).toBe(23)
    expect(hasta.getMinutes()).toBe(59)
  })
})
