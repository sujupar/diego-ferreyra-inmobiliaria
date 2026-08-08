// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, fireEvent, act } from '@testing-library/react'
import ContactsPage from './page'

/**
 * Contactos es la pantalla PILOTO de `useFiltrosUrl` + `usePedidosVersionados`
 * fuera de Propiedades — task-11-brief.md la marca como la que tiene que
 * traer, como mínimo, un test de integración del EFECTO DE DATOS que fije
 * las reglas del versionado EN EL USO (la máquina en sí ya está probada en
 * `use-filtros-url.test.ts` / `use-pedidos-versionados.test.ts`, pero nada
 * impedía romper el USO que hace la pantalla y seguir en verde).
 *
 * Mutar cualquiera de las tres reglas de la guía de adopción tiene que
 * romper alguno de los tests de acá:
 *   1. Un filtro nuevo mientras un pedido viaja → el viejo NO pinta.
 *   2. El spinner del listado se apaga con la respuesta VIGENTE, no con
 *      cualquiera.
 *   3. La pantalla no pide nada hasta saber quién es el usuario — es la
 *      variante de Contactos de "abrir() como primera línea, antes de
 *      cualquier return temprano" (acá el return temprano es el gate de
 *      identidad, no un `loadMore`/`actual()`: Contactos no pagina y no
 *      tiene botón que use `pedidos.actual()`, así que no hay un análogo
 *      directo de "la bandera de un botón no versionada" — ver el reporte
 *      de la tarea).
 */

let busqueda = ''
const escrituras: string[] = []

vi.mock('next/navigation', () => ({
  usePathname: () => '/contacts',
  useSearchParams: () => new URLSearchParams(busqueda),
  // Ojo: NO mueve `busqueda`, igual que en `use-filtros-url.test.ts`. El
  // commit real de Next es asíncrono; acá se simula con `commitear`.
  useRouter: () => ({ replace: (href: string) => { escrituras.push(href) } }),
}))

interface Deferred<T> { promise: Promise<T>; resolve: (v: T) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

let authDeferred: Deferred<{ id: string; role: string }>
let contactsCalls: { url: string; d: Deferred<{ data: unknown[] }> }[]

beforeEach(() => {
  busqueda = ''
  escrituras.length = 0
  authDeferred = deferred()
  contactsCalls = []
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.startsWith('/api/auth/me')) {
      return authDeferred.promise.then(data => ({ ok: true, json: async () => data }))
    }
    if (url.startsWith('/api/contacts')) {
      const d = deferred<{ data: unknown[] }>()
      contactsCalls.push({ url, d })
      return d.promise.then(data => ({ ok: true, json: async () => data }))
    }
    return Promise.reject(new Error(`fetch inesperado: ${url}`))
  }))
})

/** Simula que Next terminó de commitear una URL — mismo patrón que el hook. */
function commitear(rerender: (ui: React.ReactElement) => void, href: string) {
  const i = href.indexOf('?')
  busqueda = i === -1 ? '' : href.slice(i + 1)
  act(() => { rerender(<ContactsPage />) })
}

function contacto(id: string, nombre: string, origin: string | null = null) {
  return { id, full_name: nombre, phone: null, email: null, origin, created_at: '2026-08-01' }
}

describe('ContactsPage — efecto de datos con filtros en la URL', () => {
  it('un filtro nuevo mientras un pedido viaja: el viejo no pinta y el spinner se apaga con el vigente', async () => {
    const { rerender } = render(<ContactsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })

    // Primer pedido (origin='').
    await waitFor(() => expect(contactsCalls.length).toBe(1))
    contactsCalls[0].d.resolve({ data: [contacto('a', 'Contacto Original')] })
    await screen.findByText('Contacto Original')

    // La URL commitea a origin=embudo (gen 2) — sin resolver todavía.
    commitear(rerender, '/contacts?origin=embudo')
    await waitFor(() => expect(contactsCalls.length).toBe(2))

    // Y antes de que responda, otro commit a origin=historico (gen 3).
    commitear(rerender, '/contacts?origin=historico')
    await waitFor(() => expect(contactsCalls.length).toBe(3))

    // Responde PRIMERO el pedido viejo (gen 2, embudo): no tiene que pintar.
    contactsCalls[1].d.resolve({ data: [contacto('b', 'Contacto Embudo Viejo', 'embudo')] })
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByText('Contacto Embudo Viejo')).not.toBeInTheDocument()
    // Regla 2: el spinner sigue prendido — la respuesta VIGENTE (gen 3) no llegó.
    expect(screen.getByText('Cargando…')).toBeInTheDocument()

    // Responde el pedido vigente (gen 3, historico).
    contactsCalls[2].d.resolve({ data: [contacto('c', 'Contacto Historico Vigente', 'historico')] })
    await screen.findByText('Contacto Historico Vigente')

    // El spinner se apagó con la respuesta que correspondía.
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
    // Y el listado del pedido viejo nunca llegó a pintarse, ni después.
    expect(screen.queryByText('Contacto Embudo Viejo')).not.toBeInTheDocument()
  })

  it('no pide contactos hasta resolver la identidad (assigned_to depende del rol)', async () => {
    render(<ContactsPage />)

    // Sin identidad resuelta todavía, la pantalla NO pide nada — si el
    // `pedidos.abrir()` quedara después del gate, esto seguiría en verde por
    // casualidad; lo que fija la regla es el assert de abajo.
    await act(async () => { await Promise.resolve() })
    expect(contactsCalls.length).toBe(0)

    // Como asesor, `assigned_to` tiene que viajar apenas se conoce el id —
    // nunca un primer pedido "todas las filas" seguido de uno corregido.
    authDeferred.resolve({ id: 'u1', role: 'asesor' })
    await waitFor(() => expect(contactsCalls.length).toBe(1))
    expect(contactsCalls[0].url).toContain('assigned_to=u1')
  })

  it('el buscador sigue filtrando AL INSTANTE (no pasa por la URL) y el selector de origen sí la escribe', async () => {
    render(<ContactsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(contactsCalls.length).toBe(1))
    contactsCalls[0].d.resolve({
      data: [contacto('a', 'Juan Perez'), contacto('b', 'Maria Lopez')],
    })
    await screen.findByText('Juan Perez')
    expect(screen.getByText('Maria Lopez')).toBeInTheDocument()

    // Filtra sin pasar por `aplicar()`: ni dispara un nuevo pedido a
    // /api/contacts ni tapa la lista con el spinner de `escribiendo`.
    fireEvent.change(screen.getByPlaceholderText('Buscar...'), { target: { value: 'perez' } })
    expect(screen.getByText('Juan Perez')).toBeInTheDocument()
    expect(screen.queryByText('Maria Lopez')).not.toBeInTheDocument()
    expect(contactsCalls.length).toBe(1)
    expect(escrituras.length).toBe(0)

    fireEvent.change(screen.getByLabelText('Origen'), { target: { value: 'embudo' } })
    expect(escrituras[escrituras.length - 1]).toContain('origin=embudo')
  })
})
