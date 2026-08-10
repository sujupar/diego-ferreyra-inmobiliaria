// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react'
import PropertiesPage from './page'

/**
 * A3 de la revisión final de la Fase 2. Propiedades es de donde salió TODO el
 * patrón de filtros (`useFiltrosUrl` + `usePedidosVersionados`) y era la única
 * de las cinco pantallas SIN un solo test propio — con la suite entera en
 * verde, la revisión pudo mutar dos líneas del código real sin que nada se
 * pusiera rojo:
 *
 *   1. `pedidos.abrir()` → `pedidos.actual()` en el efecto de datos. Es la
 *      línea cuya ausencia produjo el bug MEDIDO de "21 propiedades bajo el
 *      rótulo Activa, para siempre".
 *   2. Borrar `assigned_to` del filtro "Solo mías" — o sea, cada asesor viendo
 *      las propiedades de todos.
 *
 * Los tests de acá abajo son exactamente esos dos casos más el spinner y el
 * reset de selección. Mismo patrón que sus hermanas (`contacts/page.test.tsx`,
 * `crm/page.test.tsx`): `next/navigation` mockeado con una `busqueda` simulada
 * + `commitear()` que reproduce el commit asíncrono del router, y `fetch` con
 * promesas diferidas que se resuelven A MANO — nunca `sleep`, porque la carrera
 * se reproduce controlando el ORDEN de las respuestas, no esperando.
 */

let busqueda = ''
const escrituras: string[] = []
const push = vi.fn()

vi.mock('next/navigation', () => ({
  usePathname: () => '/properties',
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

interface Pagina { data: unknown[]; total: number; hasMore: boolean }

/** Permite simular un 401/404 de /api/auth/me (que igual devuelve JSON). */
let authOk = true
let authDeferred: Deferred<{ id: string; role: string }>
let propsCalls: { url: string; d: Deferred<Pagina> }[]

beforeEach(() => {
  busqueda = ''
  escrituras.length = 0
  push.mockClear()
  authOk = true
  authDeferred = deferred()
  propsCalls = []
  // El modo de vista se persiste en localStorage: sin limpiarlo, el test que
  // pasa a "tabla" se lo dejaría puesto a los que corren después.
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.startsWith('/api/auth/me')) {
      return authDeferred.promise.then(data => ({ ok: authOk, json: async () => data }))
    }
    if (url.startsWith('/api/properties')) {
      const d = deferred<Pagina>()
      propsCalls.push({ url, d })
      return d.promise.then(data => ({ ok: true, json: async () => data }))
    }
    return Promise.reject(new Error(`fetch inesperado: ${url}`))
  }))
})

/** Simula que Next terminó de commitear una URL — mismo patrón que el hook. */
function commitear(rerender: (ui: React.ReactElement) => void, href: string) {
  const i = href.indexOf('?')
  busqueda = i === -1 ? '' : href.slice(i + 1)
  act(() => { rerender(<PropertiesPage />) })
}

function propiedad(id: string, direccion: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    address: direccion,
    neighborhood: 'Palermo',
    city: 'CABA',
    property_type: 'departamento',
    asking_price: 150000,
    currency: 'USD',
    status: 'active',
    origin: null,
    thumbnail: null,
    photo_count: 0,
    thumbnail_is_legacy_base64: false,
    created_at: '2026-08-01T12:00:00Z',
    assigned_to: null,
    ...extra,
  }
}

function pagina(items: unknown[], total = items.length): Pagina {
  return { data: items, total, hasMore: false }
}

describe('PropertiesPage — la carrera de respuestas (regla 1 del versionado)', () => {
  it('un filtro nuevo mientras un pedido viaja: el viejo NO pinta y el spinner se apaga con el vigente', async () => {
    const { rerender } = render(<PropertiesPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })

    // Un solo pedido en el montaje: el efecto no pide nada hasta que la
    // identidad está resuelta (con éxito o no).
    await waitFor(() => expect(propsCalls.length).toBe(1))
    propsCalls[0].d.resolve(pagina([propiedad('a', 'Calle Original 100')]))
    await screen.findByText('Calle Original 100')

    // La URL commitea a status=approved (gen 2) — sin resolver todavía.
    commitear(rerender, '/properties?status=approved')
    await waitFor(() => expect(propsCalls.length).toBe(2))

    // Y antes de que responda, otro commit a status=active (gen 3). Es la
    // secuencia exacta del bug medido: "Aprobada" y enseguida "Activa".
    commitear(rerender, '/properties?status=active')
    await waitFor(() => expect(propsCalls.length).toBe(3))

    // Responde PRIMERO el pedido viejo (gen 2, approved): no tiene que pintar.
    propsCalls[1].d.resolve(pagina([propiedad('b', 'Calle Vieja 200', { status: 'approved' })]))
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByText('Calle Vieja 200')).not.toBeInTheDocument()
    // Y el spinner sigue prendido: la respuesta VIGENTE (gen 3) no llegó.
    expect(screen.getByText('Cargando…')).toBeInTheDocument()

    // Responde el pedido vigente (gen 3, active).
    propsCalls[2].d.resolve(pagina([propiedad('c', 'Calle Vigente 300')]))
    await screen.findByText('Calle Vigente 300')

    // El spinner se apagó con la respuesta que correspondía…
    expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
    // …y el listado del pedido viejo nunca llegó a pintarse, ni después.
    expect(screen.queryByText('Calle Vieja 200')).not.toBeInTheDocument()
    // Tampoco su conteo: el rótulo tiene que ser el del listado vigente.
    expect(screen.getByText('1 propiedad')).toBeInTheDocument()
  })
})

describe('PropertiesPage — "Solo mías"', () => {
  it('con ?mios=1 en la URL (F5) el pedido lleva assigned_to = el id propio', async () => {
    busqueda = 'mios=1'
    render(<PropertiesPage />)
    authDeferred.resolve({ id: 'u1', role: 'asesor' })

    await waitFor(() => expect(propsCalls.length).toBe(1))
    // Sin esto, un asesor con "Solo mías" tildado ve las propiedades de todos.
    expect(propsCalls[0].url).toContain('assigned_to=u1')
  })

  it('tildar "Solo mías" escribe mios=1 en la URL', async () => {
    render(<PropertiesPage />)
    authDeferred.resolve({ id: 'u1', role: 'asesor' })
    await waitFor(() => expect(propsCalls.length).toBe(1))
    propsCalls[0].d.resolve(pagina([propiedad('a', 'Calle Original 100')]))
    await screen.findByText('Calle Original 100')

    fireEvent.click(screen.getByLabelText('Solo mías'))
    expect(escrituras[escrituras.length - 1]).toContain('mios=1')
  })

  it('con "Solo mías" pedido y la identidad caída, NO se pide el listado (fail-closed)', async () => {
    // Omitir `assigned_to` acá sería mostrar MÁS de lo que corresponde: el
    // filtro "solo mías" fallando hacia el lado inseguro.
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      busqueda = 'mios=1'
      authOk = false
      render(<PropertiesPage />)
      authDeferred.resolve({ error: 'No autenticado' } as never)
      await waitFor(() => expect(screen.getByText('No pudimos confirmar quién sos')).toBeInTheDocument())
      expect(propsCalls.length).toBe(0)
    } finally {
      errores.mockRestore()
    }
  })
})

describe('PropertiesPage — la selección no sobrevive al cambio de listado', () => {
  it('tildar una fila y cambiar el filtro deja la selección vacía', async () => {
    const { rerender } = render(<PropertiesPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(propsCalls.length).toBe(1))
    propsCalls[0].d.resolve(pagina([propiedad('a', 'Calle Tildada 100')]))
    await screen.findByText('Calle Tildada 100')

    // La selección solo existe en la vista tabla.
    fireEvent.click(screen.getByTitle('Vista tabla'))
    fireEvent.click(await screen.findByLabelText('Seleccionar fila'))
    expect(screen.getByText('1 propiedades seleccionado')).toBeInTheDocument()

    // Llega OTRO listado, que puede no contener la fila tildada — y las dos
    // acciones masivas de esta pantalla (Descartar / Eliminar) operan sobre
    // los ids seleccionados, se vean o no.
    commitear(rerender, '/properties?status=approved')
    await waitFor(() => expect(propsCalls.length).toBe(2))
    expect(screen.queryByText(/seleccionado/)).not.toBeInTheDocument()

    propsCalls[1].d.resolve(pagina([propiedad('b', 'Otra Calle 200', { status: 'approved' })]))
    await screen.findByText('Otra Calle 200')
    expect(screen.queryByText(/seleccionado/)).not.toBeInTheDocument()
  })

  it('cambiar el ORDEN de la tabla (refetch de página 0) también limpia la selección', async () => {
    render(<PropertiesPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(propsCalls.length).toBe(1))
    propsCalls[0].d.resolve(pagina([propiedad('a', 'Calle Tildada 100')]))
    await screen.findByText('Calle Tildada 100')

    fireEvent.click(screen.getByTitle('Vista tabla'))
    fireEvent.click(await screen.findByLabelText('Seleccionar fila'))
    expect(screen.getByText('1 propiedades seleccionado')).toBeInTheDocument()

    // El orden se resuelve en el SERVIDOR: clickear un encabezado re-pide la
    // página 0, o sea otro listado.
    fireEvent.click(screen.getByText('Precio'))
    await waitFor(() => expect(propsCalls.length).toBe(2))
    expect(propsCalls[1].url).toContain('sort=asking_price')
    expect(screen.queryByText(/seleccionado/)).not.toBeInTheDocument()
  })
})

describe('PropertiesPage — tarjetas de números (task 16)', () => {
  it('muestran el total y lo cargado en pantalla, con el contexto de "sin filtros"', async () => {
    render(<PropertiesPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(propsCalls.length).toBe(1))
    propsCalls[0].d.resolve(pagina([propiedad('a', 'Calle Uno 100'), propiedad('b', 'Calle Dos 200')], 5))
    await screen.findByText('Calle Uno 100')

    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('en el sistema')).toBeInTheDocument()

    expect(screen.getByText('En pantalla')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('de 5')).toBeInTheDocument()
  })

  it('con un filtro puesto, el contexto dice "con los filtros puestos" — no "en el sistema"', async () => {
    busqueda = 'status=approved'
    render(<PropertiesPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(propsCalls.length).toBe(1))
    propsCalls[0].d.resolve(pagina([propiedad('a', 'Calle Filtrada 100', { status: 'approved' })], 1))
    await screen.findByText('Calle Filtrada 100')

    expect(screen.getByText('con los filtros puestos')).toBeInTheDocument()
    expect(screen.queryByText('en el sistema')).not.toBeInTheDocument()
  })

  it('agregar las tarjetas no dispara ninguna llamada de más', async () => {
    render(<PropertiesPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(propsCalls.length).toBe(1))
    propsCalls[0].d.resolve(pagina([propiedad('a', 'Calle Uno 100')]))
    await screen.findByText('Calle Uno 100')

    // Solo /api/auth/me (identidad) y /api/properties (listado) — ni un fetch más.
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2)
  })

  // Ronda 1 de la revisión — el revisor mutó `value={loadError ? null : total}`
  // a `value={total}` y ningún test se puso en rojo: faltaba este caso.
  it('un /api/properties caído apaga las tarjetas a "Sin datos" — no al 0 que deja el catch', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      vi.stubGlobal('fetch', vi.fn((url: string) => {
        if (url.startsWith('/api/auth/me')) return authDeferred.promise.then(data => ({ ok: authOk, json: async () => data }))
        if (url.startsWith('/api/properties')) return Promise.reject(new Error('caído'))
        return Promise.reject(new Error(`fetch inesperado: ${url}`))
      }))
      render(<PropertiesPage />)
      authDeferred.resolve({ id: 'u1', role: 'admin' })

      const tarjetas = within(screen.getByTestId('tarjetas-numeros'))
      // Se espera el CONTEXTO de error, no el "Sin datos": desde el arreglo C1
      // el "Sin datos" ya está puesto mientras carga, así que anclar el
      // `waitFor` ahí lo daría por cumplido antes de que el fallo llegue.
      await waitFor(() => expect(tarjetas.getAllByText('No se pudo consultar').length).toBe(2))
      expect(tarjetas.getAllByText('Sin datos').length).toBe(2)
      // Ninguna tarjeta puede quedar mostrando el 0 que `loadError` deja en
      // `total`/`properties` — ni como número suelto en su lugar.
      expect(tarjetas.queryByText('0')).not.toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })

  // Revisión final Fase 3 — C1. Ninguno de los tests de arriba mira la tarjeta
  // ANTES de resolver el fetch, y ahí es donde estaba el defecto: la carga de
  // esta pantalla está medida en 2308ms y 2849ms, o sea casi tres segundos
  // afirmando que la inmobiliaria no tiene propiedades.
  it('mientras la respuesta viaja, las tarjetas dicen "Sin datos" — nunca 0', async () => {
    render(<PropertiesPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(propsCalls.length).toBe(1))

    // Pedido en vuelo, a propósito sin resolver.
    const tarjetas = within(screen.getByTestId('tarjetas-numeros'))
    expect(tarjetas.getAllByText('Sin datos').length).toBe(2)
    expect(tarjetas.getAllByText('todavía cargando').length).toBe(2)
    expect(tarjetas.queryByText('0')).not.toBeInTheDocument()
    expect(tarjetas.queryByText('en el sistema')).not.toBeInTheDocument()
    // El renglón de prosa de arriba ya decía la verdad: la tarjeta ahora coincide.
    expect(screen.getByText('Cargando…')).toBeInTheDocument()

    // Y al llegar el dato, sí afirma.
    propsCalls[0].d.resolve(pagina([propiedad('a', 'Calle Uno 100')], 7))
    await screen.findByText('Calle Uno 100')
    expect(tarjetas.getByText('7')).toBeInTheDocument()
    expect(tarjetas.getByText('en el sistema')).toBeInTheDocument()
  })

  it('al cambiar de filtro, el total VIEJO no queda bajo el rótulo "con los filtros puestos"', async () => {
    const { rerender } = render(<PropertiesPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(propsCalls.length).toBe(1))
    propsCalls[0].d.resolve(pagina([propiedad('a', 'Calle Uno 100')], 31))
    await screen.findByText('Calle Uno 100')

    const tarjetas = within(screen.getByTestId('tarjetas-numeros'))
    expect(tarjetas.getByText('31')).toBeInTheDocument()

    // Filtro nuevo, respuesta todavía en vuelo: el 31 es de la base ANTERIOR.
    commitear(rerender, '/properties?status=approved')
    await waitFor(() => expect(propsCalls.length).toBe(2))
    expect(tarjetas.queryByText('31')).not.toBeInTheDocument()
    expect(tarjetas.queryByText('con los filtros puestos')).not.toBeInTheDocument()
    expect(tarjetas.getAllByText('Sin datos').length).toBe(2)

    propsCalls[1].d.resolve(pagina([propiedad('b', 'Calle Filtrada 200', { status: 'approved' })], 4))
    await screen.findByText('Calle Filtrada 200')
    expect(tarjetas.getByText('4')).toBeInTheDocument()
    expect(tarjetas.getByText('con los filtros puestos')).toBeInTheDocument()
  })
})

describe('PropertiesPage — identidad fail-closed sin "Solo mías" (A4, ya vigente acá)', () => {
  it('un 401 de /api/auth/me (que igual devuelve JSON) no frena el listado sin filtrar', async () => {
    // Sin `mios`, no saber quién sos no cambia QUÉ se pide: el listado sale
    // igual. Lo que no puede pasar es quedarse colgado en el spinner.
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      authOk = false
      render(<PropertiesPage />)
      authDeferred.resolve({ error: 'No autenticado' } as never)
      await waitFor(() => expect(propsCalls.length).toBe(1))
      expect(propsCalls[0].url).not.toContain('assigned_to')
    } finally {
      errores.mockRestore()
    }
  })
})

describe('PropertiesPage — el desplegable de Estado dice la verdad (D5)', () => {
  /**
   * El badge «Pend. Fotos» se CALCULA (captación abierta + sin fotos) y el
   * desplegable listaba los valores CRUDOS de `properties.status`, así que la
   * opción con ese mismo nombre consultaba `status='pending_photos'` — un valor
   * que ningún camino de la app escribe. Devolvía SIEMPRE vacío mientras la
   * pantalla mostraba fichas rotuladas «Pend. Fotos»: un coordinador filtraba,
   * veía cero y concluía que no había backlog de fotos.
   */
  it('elegir «Pend. Fotos» pide la cohorte derivada, no un status que nadie escribe', async () => {
    const { rerender } = render(<PropertiesPage />)
    authDeferred.resolve({ id: 'u1', role: 'coordinador' })
    await waitFor(() => expect(propsCalls.length).toBe(1))
    propsCalls[0].d.resolve(pagina([]))
    await waitFor(() => expect(screen.getByText('Sin propiedades')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'cohorte:sin_fotos' } })
    await waitFor(() => expect(escrituras.length).toBeGreaterThan(0))
    commitear(rerender, escrituras[escrituras.length - 1])

    await waitFor(() => expect(propsCalls.length).toBe(2))
    expect(propsCalls[1].url).toContain('cohorte=sin_fotos')
    expect(propsCalls[1].url).not.toContain('status=')
  })

  it('una ficha en captación sin fotos se rotula igual que la opción que la trae', async () => {
    render(<PropertiesPage />)
    authDeferred.resolve({ id: 'u1', role: 'coordinador' })
    await waitFor(() => expect(propsCalls.length).toBe(1))
    propsCalls[0].d.resolve(pagina([
      propiedad('a', 'Calle Sin Fotos 100', { status: 'pending_docs', photo_count: 0 }),
    ]))

    await screen.findByText('Calle Sin Fotos 100')
    // La opción del desplegable y el badge de la ficha llevan la MISMA
    // etiqueta: dos apariciones del texto, una de cada lado. Ese era todo el
    // problema — el mismo nombre para dos criterios distintos.
    expect(screen.getByRole('option', { name: 'Pend. Fotos' })).toBeInTheDocument()
    expect(screen.getAllByText('Pend. Fotos')).toHaveLength(2)
  })

  it('los estados crudos siguen viajando como status', async () => {
    const { rerender } = render(<PropertiesPage />)
    authDeferred.resolve({ id: 'u1', role: 'coordinador' })
    await waitFor(() => expect(propsCalls.length).toBe(1))
    propsCalls[0].d.resolve(pagina([]))
    await waitFor(() => expect(screen.getByText('Sin propiedades')).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'approved' } })
    await waitFor(() => expect(escrituras.length).toBeGreaterThan(0))
    commitear(rerender, escrituras[escrituras.length - 1])

    await waitFor(() => expect(propsCalls.length).toBe(2))
    expect(propsCalls[1].url).toContain('status=approved')
    expect(propsCalls[1].url).not.toContain('cohorte=')
  })
})

describe('PropertiesPage — un filtro inválido en el link se avisa (D27)', () => {
  /**
   * `setAvisoFiltro` solo se escribía desde manejadores de evento, así que un
   * link con un filtro que la whitelist descarta entraba en silencio: la
   * pantalla mostraba TODAS las propiedades y el que abrió el link creía estar
   * mirando un recorte.
   */
  it('entrar con ?status=vendida lo dice, en vez de mostrar todo calladamente', async () => {
    busqueda = 'status=vendida'
    render(<PropertiesPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(propsCalls.length).toBe(1))
    propsCalls[0].d.resolve(pagina([propiedad('a', 'Calle Uno 100')], 31))
    await screen.findByText('Calle Uno 100')

    expect(screen.getByRole('status')).toHaveTextContent(/no se aplicó estado/i)
    // El filtro efectivamente no viajó: la pantalla no miente en las dos puntas.
    expect(propsCalls[0].url).not.toContain('status=')
  })

  it('un link con filtros válidos no inventa ningún aviso', async () => {
    busqueda = 'status=approved'
    render(<PropertiesPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(propsCalls.length).toBe(1))
    propsCalls[0].d.resolve(pagina([propiedad('a', 'Calle Uno 100', { status: 'approved' })], 3))
    await screen.findByText('Calle Uno 100')

    expect(screen.getByRole('status')).toHaveTextContent('')
  })

  it('entrar sin ningún filtro tampoco avisa nada', async () => {
    render(<PropertiesPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(propsCalls.length).toBe(1))
    propsCalls[0].d.resolve(pagina([propiedad('a', 'Calle Uno 100')], 31))
    await screen.findByText('Calle Uno 100')

    expect(screen.getByRole('status')).toHaveTextContent('')
  })
})
