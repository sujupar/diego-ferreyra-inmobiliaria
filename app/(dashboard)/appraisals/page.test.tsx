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
/** D6: el status importa — un 401 manda a re-loguearse, un 500 a reintentar. */
let authStatus = 200
let authCalls = 0
/**
 * Reemplaza el cuerpo de /api/auth/me a partir del pedido siguiente. Hace falta
 * para el caso de «Reintentar»: el deferred ya está resuelto con el cuerpo del
 * intento FALLIDO, y el segundo pedido tiene que traer un perfil de verdad.
 */
let authPayload: unknown
let authDeferred: Deferred<{ id: string; role: string }>
let appraisalsCalls: { url: string; d: Deferred<{ data: unknown[]; count: number }> }[]
/** D8: permite simular que el LISTADO falla (500/403), no la identidad. */
let listadoOk = true
let listadoStatus = 200
/** D7: los DELETE que salieron y qué contestó el servidor. */
let deleteCalls: string[]
let deleteOk = true
let deleteStatus = 200
let alertas: string[]

beforeEach(() => {
  busqueda = ''
  escrituras.length = 0
  push.mockClear()
  authOk = true
  authStatus = 200
  authCalls = 0
  authPayload = undefined
  authDeferred = deferred()
  appraisalsCalls = []
  listadoOk = true
  listadoStatus = 200
  deleteCalls = []
  deleteOk = true
  deleteStatus = 200
  alertas = []
  vi.stubGlobal('confirm', vi.fn(() => true))
  vi.stubGlobal('prompt', vi.fn(() => 'ELIMINAR'))
  vi.stubGlobal('alert', vi.fn((m: string) => { alertas.push(m) }))
  vi.stubGlobal('fetch', vi.fn((url: string, init?: { method?: string }) => {
    if (url.startsWith('/api/auth/me')) {
      authCalls += 1
      return authDeferred.promise.then(data => ({
        ok: authOk,
        status: authStatus,
        json: async () => (authPayload !== undefined ? authPayload : data),
      }))
    }
    if (init?.method === 'DELETE') {
      deleteCalls.push(url)
      return Promise.resolve({ ok: deleteOk, status: deleteStatus })
    }
    if (url.startsWith('/api/appraisals')) {
      const d = deferred<{ data: unknown[]; count: number }>()
      appraisalsCalls.push({ url, d })
      return d.promise.then(data => ({ ok: listadoOk, status: listadoStatus, json: async () => data }))
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

  it('el texto buscado y el rango de precio viajan en el pedido', async () => {
    const { rerender } = render(<AppraisalsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(appraisalsCalls.length).toBe(1))
    appraisalsCalls[0].d.resolve({ data: [], count: 0 })

    commitear(rerender, '/appraisals?q=almagro&min=100000&max=300000')
    await waitFor(() => expect(appraisalsCalls.length).toBe(2))

    const url = appraisalsCalls[1].url
    expect(url).toContain('q=almagro')
    expect(url).toContain('min=100000')
    expect(url).toContain('max=300000')
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

  it('"Editar" tiene nombre, y dice DE QUÉ tasación', async () => {
    // El control es solo un ícono: sin nombre un lector de pantalla anuncia
    // "enlace" y nada más — justo al lado del de borrar, que sí lo tiene. Y el
    // nombre lleva la propiedad porque en un listado hay uno por fila: veinte
    // "Editar" idénticos no distinguen ninguna.
    render(<AppraisalsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(appraisalsCalls.length).toBe(1))
    appraisalsCalls[0].d.resolve({ data: [tasacion('a', 'Tasación Con Acciones')], count: 1 })
    await screen.findByText('Tasación Con Acciones')

    const editar = screen.getByRole('link', { name: /editar la tasación de Tasación Con Acciones/i })
    expect(editar.getAttribute('href')).toContain('editId=a')
  })

  it('el editar es UN control, no un botón anidado adentro de un enlace', async () => {
    // Anidados son dos paradas de tabulador para una sola acción, y el <a> de
    // afuera se queda igual sin nombre (su único contenido es el ícono). El
    // "Nueva tasación" de la cabecera también anida, pero ese SÍ tiene texto:
    // el problema de nombre es de este, así que el test mira este.
    const { container } = render(<AppraisalsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(appraisalsCalls.length).toBe(1))
    appraisalsCalls[0].d.resolve({ data: [tasacion('a', 'Tasación Con Acciones')], count: 1 })
    await screen.findByText('Tasación Con Acciones')

    const editar = container.querySelector('a[href*="editId=a"]') as HTMLAnchorElement
    expect(editar.querySelector('button')).toBeNull()
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

/**
 * D6 — no pedir nada es correcto (el asesor solo ve las suyas); quedarse
 * callado no. Los dos casos de arriba se detienen en "no salió el pedido" y
 * nunca miran QUÉ VE el usuario: veía «Cargando…» para siempre, sin error, sin
 * reintento, y la única salida era recargar a mano.
 */
describe('AppraisalsPage — identidad que falla: la pantalla lo DICE (D6)', () => {
  async function montarConIdentidadRota() {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<AppraisalsPage />)
    authDeferred.resolve({ error: 'nope' } as never)
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    return errores
  }

  it('un 401 no deja el spinner girando: manda a entrar de nuevo', async () => {
    authOk = false
    authStatus = 401
    const errores = await montarConIdentidadRota()
    try {
      expect(screen.getByText('Tu sesión venció')).toBeInTheDocument()
      const entrar = screen.getByText('Iniciar sesión').closest('a') as HTMLAnchorElement
      expect(entrar).toHaveAttribute('href', '/login')
      // Lo que estaba roto: el spinner eterno.
      expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
      // Y sigue sin pedirse el listado sin identidad (fail-closed intacto).
      expect(appraisalsCalls.length).toBe(0)
    } finally {
      errores.mockRestore()
    }
  })

  it('un 500 ofrece Reintentar, y Reintentar vuelve a preguntar quién sos', async () => {
    authOk = false
    authStatus = 500
    const errores = await montarConIdentidadRota()
    try {
      expect(screen.getByText('No pudimos confirmar quién sos')).toBeInTheDocument()
      expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
      expect(authCalls).toBe(1)

      // Se recupera la identidad y el usuario reintenta.
      authOk = true
      authStatus = 200
      authPayload = { id: 'u1', role: 'admin' }
      fireEvent.click(screen.getByText('Reintentar'))
      await act(async () => { await Promise.resolve() })

      expect(authCalls).toBe(2)
      await waitFor(() => expect(appraisalsCalls.length).toBe(1))
      appraisalsCalls[0].d.resolve({ data: [tasacion('a', 'Tasación Recuperada')], count: 1 })
      await screen.findByText('Tasación Recuperada')
      expect(screen.queryByText('No pudimos confirmar quién sos')).not.toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })
})

/**
 * D8 — un fallo del listado se mostraba como «Sin tasaciones — Crea tu primera
 * tasacion», con el subtítulo «0 tasaciones». Un asesor con 30 tasaciones veía,
 * con toda confianza, que no tenía ninguna.
 */
describe('AppraisalsPage — el listado que falla NO es un listado vacío (D8)', () => {
  async function montarConListadoRoto(status: number) {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    listadoOk = false
    listadoStatus = status
    render(<AppraisalsPage />)
    authDeferred.resolve({ id: 'u1', role: 'asesor' })
    await waitFor(() => expect(appraisalsCalls.length).toBe(1))
    appraisalsCalls[0].d.resolve({ data: [], count: 0 })
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    return errores
  }

  it('un 500 muestra el error, no el cartel de «todavía no cargaste nada»', async () => {
    const errores = await montarConListadoRoto(500)
    try {
      expect(await screen.findByText('No se pudo cargar el historial')).toBeInTheDocument()
      expect(screen.queryByText('Sin tasaciones')).not.toBeInTheDocument()
      expect(screen.queryByText('Crea tu primera tasacion.')).not.toBeInTheDocument()
      // El subtítulo tampoco puede contar lo que no pudo leer.
      expect(screen.getByText('No se pudo consultar')).toBeInTheDocument()
      expect(screen.queryByText('0 tasaciones')).not.toBeInTheDocument()
      expect(screen.getByText('Reintentar')).toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })

  it('un 403 dice que el rol no alcanza y NO ofrece reintentar (reintentar no arregla un permiso)', async () => {
    const errores = await montarConListadoRoto(403)
    try {
      expect(await screen.findByText('No tenés acceso a las tasaciones')).toBeInTheDocument()
      expect(screen.queryByText('Sin tasaciones')).not.toBeInTheDocument()
      expect(screen.queryByText('Reintentar')).not.toBeInTheDocument()
      // Y tampoco se le ofrece crear una: el POST también lo rechaza.
      expect(screen.queryByText('Nueva')).not.toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })

  it('un 401 del listado manda a entrar de nuevo', async () => {
    const errores = await montarConListadoRoto(401)
    try {
      expect(await screen.findByText('Tu sesión venció')).toBeInTheDocument()
      expect(screen.queryByText('Sin tasaciones')).not.toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })

  it('un listado vacío DE VERDAD sigue mostrando «Sin tasaciones»', async () => {
    render(<AppraisalsPage />)
    authDeferred.resolve({ id: 'u1', role: 'asesor' })
    await waitFor(() => expect(appraisalsCalls.length).toBe(1))
    appraisalsCalls[0].d.resolve({ data: [], count: 0 })
    expect(await screen.findByText('Sin tasaciones')).toBeInTheDocument()
    expect(screen.getByText('0 tasaciones')).toBeInTheDocument()
  })
})

/**
 * D7 — borrar «funcionaba» en pantalla aunque el servidor lo hubiera
 * rechazado: la fila desaparecía y el contador bajaba sobre una tasación que
 * seguía viva. El caso más común es el 500 por clave foránea (cualquier
 * tasación vinculada a un proceso).
 */
describe('AppraisalsPage — un borrado rechazado NO saca la fila (D7)', () => {
  async function montarConDos() {
    render(<AppraisalsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(appraisalsCalls.length).toBe(1))
    appraisalsCalls[0].d.resolve({
      data: [tasacion('a', 'Tasación Uno'), tasacion('b', 'Tasación Dos')],
      count: 2,
    })
    await screen.findByText('Tasación Uno')
  }

  it('un 500 deja la fila, el contador intacto y avisa el motivo', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await montarConDos()
      deleteOk = false
      deleteStatus = 500

      fireEvent.click(screen.getAllByLabelText('Eliminar tasación')[0])
      await act(async () => { await Promise.resolve() })
      await act(async () => { await Promise.resolve() })

      expect(deleteCalls).toEqual(['/api/appraisals/a'])
      expect(screen.getByText('Tasación Uno')).toBeInTheDocument()
      expect(screen.getByText('2 tasaciones')).toBeInTheDocument()
      expect(alertas).toHaveLength(1)
      expect(alertas[0]).toContain('No se pudo eliminar')
      // El motivo más útil del 500: la FK del pipeline.
      expect(alertas[0]).toContain('vinculada')
    } finally {
      errores.mockRestore()
    }
  })

  it('un 401 avisa que la sesión venció', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      await montarConDos()
      deleteOk = false
      deleteStatus = 401
      fireEvent.click(screen.getAllByLabelText('Eliminar tasación')[0])
      await act(async () => { await Promise.resolve() })
      await act(async () => { await Promise.resolve() })
      expect(screen.getByText('Tasación Uno')).toBeInTheDocument()
      expect(alertas[0]).toContain('sesión venció')
    } finally {
      errores.mockRestore()
    }
  })

  it('un borrado ACEPTADO sí saca la fila y baja el contador', async () => {
    await montarConDos()
    fireEvent.click(screen.getAllByLabelText('Eliminar tasación')[0])
    await act(async () => { await Promise.resolve() })
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByText('Tasación Uno')).not.toBeInTheDocument()
    expect(screen.getByText('1 tasacion')).toBeInTheDocument()
    expect(alertas).toHaveLength(0)
  })
})

/**
 * D1 (crítico) — la papelera se dibujaba para CUALQUIER rol. El abogado, que no
 * tiene ni un permiso de tasación, la tenía a un clic (y la acción masiva, que
 * borra 12 de un saque). El servidor ahora rechaza, pero ofrecerle el botón a
 * quien no puede es media parte del defecto.
 */
describe('AppraisalsPage — quién ve la papelera (D1)', () => {
  async function montarComo(rol: string) {
    render(<AppraisalsPage />)
    authDeferred.resolve({ id: 'u1', role: rol })
    await waitFor(() => expect(appraisalsCalls.length).toBe(1))
    appraisalsCalls[0].d.resolve({ data: [tasacion('a', 'Tasación Visible')], count: 1 })
    await screen.findByText('Tasación Visible')
  }

  it('al abogado no se le dibuja ni la papelera ni el tilde de selección', async () => {
    await montarComo('abogado')
    expect(screen.queryAllByLabelText('Eliminar tasación')).toHaveLength(0)
    expect(screen.queryByLabelText('Seleccionar fila')).not.toBeInTheDocument()
  })

  it('al admin sí', async () => {
    await montarComo('admin')
    expect(screen.getAllByLabelText('Eliminar tasación')).toHaveLength(1)
    expect(screen.getByLabelText('Seleccionar fila')).toBeInTheDocument()
  })

  it('al asesor también (borra las suyas: es la única forma de sacar una equivocada)', async () => {
    await montarComo('asesor')
    expect(screen.getAllByLabelText('Eliminar tasación')).toHaveLength(1)
  })
})

/**
 * D29 — la tabla ordenaba en memoria las 12 filas de la página y dejaba la
 * flecha del encabezado puesta como si el orden fuera de todas las tasaciones.
 */
describe('AppraisalsPage — el orden se resuelve en el servidor (D29)', () => {
  it('clickear «Precio» pide el listado ordenado por precio, desde la página 1', async () => {
    render(<AppraisalsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(appraisalsCalls.length).toBe(1))
    appraisalsCalls[0].d.resolve({ data: [tasacion('a', 'Página 1')], count: 25 })
    await screen.findByText('Página 1')

    // Primero se pasa a la página 3, para verificar que el orden nuevo vuelve
    // a la 1: con otro orden, las 12 primeras filas son otras.
    const paginacion = screen.getByText(/Pagina \d+ de \d+/).closest('div') as HTMLElement
    const siguiente = within(paginacion).getAllByRole('button')[1]
    fireEvent.click(siguiente)
    await waitFor(() => expect(appraisalsCalls.length).toBe(2))
    fireEvent.click(siguiente)
    await waitFor(() => expect(appraisalsCalls.length).toBe(3))
    expect(appraisalsCalls[2].url).toContain('page=3')
    appraisalsCalls[2].d.resolve({ data: [tasacion('c', 'Página 3')], count: 25 })
    await screen.findByText('Página 3')

    fireEvent.click(screen.getByText('Precio'))
    await waitFor(() => expect(appraisalsCalls.length).toBe(4))
    expect(appraisalsCalls[3].url).toContain('sort=publication_price')
    expect(appraisalsCalls[3].url).toContain('dir=desc')
    expect(appraisalsCalls[3].url).toContain('page=1')
    // Un solo pedido: el reset de página y el orden nuevo viajan juntos.
    await act(async () => { await Promise.resolve() })
    expect(appraisalsCalls.length).toBe(4)

    // Segundo click: invierte la dirección, sigue siendo server-side.
    appraisalsCalls[3].d.resolve({ data: [tasacion('d', 'Más cara')], count: 25 })
    await screen.findByText('Más cara')
    fireEvent.click(screen.getByText('Precio'))
    await waitFor(() => expect(appraisalsCalls.length).toBe(5))
    expect(appraisalsCalls[4].url).toContain('dir=asc')
  })

  it('sin tocar ningún encabezado, el listado no manda orden (el del servidor es el correcto por defecto)', async () => {
    render(<AppraisalsPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(appraisalsCalls.length).toBe(1))
    expect(appraisalsCalls[0].url).not.toContain('sort=')
  })
})
