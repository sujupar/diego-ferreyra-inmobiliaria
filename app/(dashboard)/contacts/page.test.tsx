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
 *      directo de "la bandera de un botón no versionada" — CRM sí lo tiene
 *      ("Cargar más") y esa regla queda fijada en `crm/page.test.tsx`).
 *
 * Ronda de arreglos 1 — caso D (mover `abrir()` DESPUÉS del `if (!userInfo)
 * return`): investigado y NO se agrega un test para esto. La mutación deja
 * los 3 tests de acá en verde porque es genuinamente inobservable HOY: la
 * única condición de early-return del efecto es `!userInfo`, y `userInfo`
 * pasa de `null` a un valor UNA sola vez en toda la vida del componente (no
 * hay logout ni "reintentar" que lo vuelva a `null`) — nunca hay una
 * generación con un fetch en vuelo en el instante en que ese return se
 * ejecuta una segunda vez, así que mover `abrir()` no cambia ningún estado
 * observable en ninguna secuencia de eventos que el componente pueda producir
 * hoy. Escribir un test para esto exigiría forzar `userInfo` de vuelta a
 * `null` a mano — un camino que el componente nunca toma — o sea, un test que
 * no prueba nada real, que es justo lo que se pidió evitar. La trampa para el
 * día que esto deje de ser cierto (ej. si se agrega un "Reintentar" que
 * resetea la identidad, como en Propiedades) queda documentada en el
 * comentario del efecto en `page.tsx`, junto a `pedidos.abrir()`.
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

/** A4: permite simular un 401/404 de /api/auth/me (que igual devuelve JSON). */
let authOk = true
/** D9: idem para /api/contacts — un 500 también devuelve un body JSON válido. */
let contactsOk = true
let authDeferred: Deferred<{ id: string; role: string }>
let contactsCalls: { url: string; d: Deferred<{ data: unknown[] }> }[]

beforeEach(() => {
  busqueda = ''
  escrituras.length = 0
  authOk = true
  contactsOk = true
  authDeferred = deferred()
  contactsCalls = []
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.startsWith('/api/auth/me')) {
      return authDeferred.promise.then(data => ({ ok: authOk, json: async () => data }))
    }
    if (url.startsWith('/api/contacts')) {
      const d = deferred<{ data: unknown[] }>()
      contactsCalls.push({ url, d })
      // `contactsOk` se lee al RESOLVER, no al llamar: así un test puede
      // arreglar la API entre el pedido caído y el reintento.
      return d.promise.then(data => ({ ok: contactsOk, json: async () => data }))
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

describe('ContactsPage — identidad fail-closed (A4)', () => {
  it('un 401 de /api/auth/me (que igual devuelve JSON) NO deja salir el pedido sin assigned_to', async () => {
    // `/api/auth/me` responde JSON también en 401/404/500. Sin chequear `r.ok`,
    // `userInfo` quedaba truthy con `role` undefined → el gate `if (!userInfo)`
    // pasaba y el listado salía SIN `assigned_to`: un asesor veía los contactos
    // de todos.
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      authOk = false
      render(<ContactsPage />)
      authDeferred.resolve({ error: 'No autenticado' } as never)
      await act(async () => { await Promise.resolve() })
      await act(async () => { await Promise.resolve() })
      expect(contactsCalls.length).toBe(0)
    } finally {
      errores.mockRestore()
    }
  })

  it('un 200 sin id tampoco es una identidad', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<ContactsPage />)
      authDeferred.resolve({ role: 'asesor' } as never)
      await act(async () => { await Promise.resolve() })
      await act(async () => { await Promise.resolve() })
      expect(contactsCalls.length).toBe(0)
    } finally {
      errores.mockRestore()
    }
  })
})

/**
 * D9 y D31 — los dos fallos que la pantalla disfrazaba. Son el mismo error de
 * fondo (dos estados donde hacen falta tres) por dos puertas distintas: uno se
 * disfrazaba de "no hay nada", el otro de "todavía está cargando".
 */
describe('ContactsPage — la pantalla no puede afirmar lo que no sabe', () => {
  it('D9: con /api/contacts caído dice que no se pudo consultar — nunca "Sin contactos"', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      contactsOk = false
      render(<ContactsPage />)
      authDeferred.resolve({ id: 'u1', role: 'admin' })
      await waitFor(() => expect(contactsCalls.length).toBe(1))
      contactsCalls[0].d.resolve({ data: [] })

      await screen.findByText('No se pudieron cargar los contactos')
      // Lo que NO puede aparecer: la tarjeta vacía ni el conteo.
      expect(screen.queryByText('Sin contactos')).not.toBeInTheDocument()
      expect(screen.queryByText('0 contactos')).not.toBeInTheDocument()
      expect(screen.getByText('No se pudo consultar')).toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })

  it('D9: con un filtro puesto tampoco culpa al filtro ("ningún contacto coincide") — ofrece limpiarlo', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      contactsOk = false
      busqueda = 'origin=embudo'
      render(<ContactsPage />)
      authDeferred.resolve({ id: 'u1', role: 'admin' })
      await waitFor(() => expect(contactsCalls.length).toBe(1))
      contactsCalls[0].d.resolve({ data: [] })

      await screen.findByText('No se pudieron cargar los contactos')
      expect(screen.queryByText('Ningún contacto coincide con los filtros.')).not.toBeInTheDocument()
      expect(screen.getByText('Limpiar filtros')).toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })

  it('D9: "Reintentar" vuelve a pedir el listado y la pantalla se recupera', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      contactsOk = false
      render(<ContactsPage />)
      authDeferred.resolve({ id: 'u1', role: 'admin' })
      await waitFor(() => expect(contactsCalls.length).toBe(1))
      contactsCalls[0].d.resolve({ data: [] })
      await screen.findByText('No se pudieron cargar los contactos')

      // La URL no cambió: sin el contador de reintentos, `filtros` conserva la
      // misma referencia y el efecto de datos ni se entera del click.
      contactsOk = true
      fireEvent.click(screen.getByText('Reintentar'))
      await waitFor(() => expect(contactsCalls.length).toBe(2))
      contactsCalls[1].d.resolve({ data: [contacto('a', 'Juan Perez')] })

      await screen.findByText('Juan Perez')
      expect(screen.queryByText('No se pudieron cargar los contactos')).not.toBeInTheDocument()
      expect(screen.getByText('1 contacto')).toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })

  it('D9: el cartel de error no se queda pegado — un filtro nuevo que sí carga lo borra', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      contactsOk = false
      const { rerender } = render(<ContactsPage />)
      authDeferred.resolve({ id: 'u1', role: 'admin' })
      await waitFor(() => expect(contactsCalls.length).toBe(1))
      contactsCalls[0].d.resolve({ data: [] })
      await screen.findByText('No se pudieron cargar los contactos')

      contactsOk = true
      commitear(rerender, '/contacts?origin=embudo')
      await waitFor(() => expect(contactsCalls.length).toBe(2))
      contactsCalls[1].d.resolve({ data: [contacto('a', 'Juan Perez', 'embudo')] })

      await screen.findByText('Juan Perez')
      expect(screen.queryByText('No se pudieron cargar los contactos')).not.toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })

  it('D31: con /api/auth/me caído dice "No pudimos confirmar quién sos" en vez de girar para siempre', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      authOk = false
      render(<ContactsPage />)
      authDeferred.resolve({ error: 'No autenticado' } as never)

      await screen.findByText('No pudimos confirmar quién sos')
      // El spinner y el "Cargando…" del encabezado se apagaron: la pantalla
      // terminó de cargar (mal, pero terminó) y lo dice.
      expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
      // Y el fail-closed sigue intacto: no se pidió ningún contacto.
      expect(contactsCalls.length).toBe(0)
    } finally {
      errores.mockRestore()
    }
  })

  it('D31: el "Reintentar" del cartel de identidad vuelve a preguntar quién sos', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      authOk = false
      render(<ContactsPage />)
      authDeferred.resolve({ error: 'No autenticado' } as never)
      await screen.findByText('No pudimos confirmar quién sos')

      const llamadasAuth = () => (global.fetch as ReturnType<typeof vi.fn>).mock.calls
        .filter(c => String(c[0]).startsWith('/api/auth/me')).length
      expect(llamadasAuth()).toBe(1)

      // La identidad se vuelve a preguntar de verdad (no solo el listado).
      authOk = true
      authDeferred = deferred()
      fireEvent.click(screen.getByText('Reintentar'))
      await waitFor(() => expect(llamadasAuth()).toBe(2))

      authDeferred.resolve({ id: 'u1', role: 'admin' })
      await waitFor(() => expect(contactsCalls.length).toBe(1))
      contactsCalls[0].d.resolve({ data: [contacto('a', 'Juan Perez')] })
      await screen.findByText('Juan Perez')
    } finally {
      errores.mockRestore()
    }
  })
})

describe('ContactsPage — "Limpiar todo" y el buscador (D34)', () => {
  it('"Limpiar todo" vacía también el buscador, que la pantalla cuenta como filtro', async () => {
    busqueda = 'origin=embudo'
    render(<ContactsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(contactsCalls.length).toBe(1))
    contactsCalls[0].d.resolve({
      data: [contacto('a', 'Juan Perez', 'embudo'), contacto('b', 'Maria Lopez', 'embudo')],
    })
    await screen.findByText('Juan Perez')

    const buscador = screen.getByPlaceholderText('Buscar...')
    fireEvent.change(buscador, { target: { value: 'perez' } })
    expect(screen.queryByText('Maria Lopez')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('Limpiar todo'))
    expect(buscador).toHaveValue('')
  })

  it('con el buscador como único filtro, "Limpiar todo" igual aparece', async () => {
    render(<ContactsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(contactsCalls.length).toBe(1))
    contactsCalls[0].d.resolve({ data: [contacto('a', 'Juan Perez')] })
    await screen.findByText('Juan Perez')

    expect(screen.queryByText('Limpiar todo')).not.toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('Buscar...'), { target: { value: 'perez' } })
    expect(screen.getByText('Limpiar todo')).toBeInTheDocument()
  })
})
