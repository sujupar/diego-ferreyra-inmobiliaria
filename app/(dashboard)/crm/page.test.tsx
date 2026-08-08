// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react'
import CRMPage from './page'
import type { Deal } from './_components/types'

/**
 * CRM es la ÚNICA pantalla que usa la regla 3 del versionado ("Cargar más" /
 * `pedidos.actual()`) — ronda de arreglos 1 sobre la Task 11: el revisor mutó
 * las tres reglas contra `contacts/page.test.tsx` y dos quedaron en verde
 * porque Contactos no pagina. Este archivo cierra ese hueco (I1) y de paso fija
 * los otros seis casos que el revisor verificó a mano (seguridad por rol,
 * visibilidad del desplegable, valores inventados, ráfaga, F5, "Limpiar todo").
 *
 * Mismo patrón que `contacts/page.test.tsx`: `next/navigation` mockeado con una
 * `busqueda` simulada + `commitear()` que reproduce un commit asíncrono del
 * router, y `fetch` con promesas diferidas controlables a mano.
 */

let busqueda = ''
const escrituras: string[] = []

vi.mock('next/navigation', () => ({
  usePathname: () => '/crm',
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

/** A4: permite simular un 401/404 de /api/auth/me (que igual devuelve JSON). */
let authOk = true
let authDeferred: Deferred<{ id: string; role: string }>
let dealsCalls: { url: string; d: Deferred<Record<string, unknown>> }[]

beforeEach(() => {
  busqueda = ''
  escrituras.length = 0
  authOk = true
  authDeferred = deferred()
  dealsCalls = []
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.startsWith('/api/auth/me')) {
      return authDeferred.promise.then(data => ({ ok: authOk, json: async () => data }))
    }
    if (url.startsWith('/api/users/advisors')) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ data: [{ id: 'adv1', full_name: 'Asesor Uno' }, { id: 'adv2', full_name: 'Asesor Dos' }] }),
      })
    }
    if (url.startsWith('/api/deals')) {
      const d = deferred<Record<string, unknown>>()
      dealsCalls.push({ url, d })
      return d.promise.then(data => ({ ok: true, json: async () => data }))
    }
    return Promise.reject(new Error(`fetch inesperado: ${url}`))
  }))
})

/** Simula que Next terminó de commitear una URL — mismo patrón que el hook. */
function commitear(rerender: (ui: React.ReactElement) => void, href: string) {
  const i = href.indexOf('?')
  busqueda = i === -1 ? '' : href.slice(i + 1)
  act(() => { rerender(<CRMPage />) })
}

function fakeDeal(i: number): Deal {
  return {
    id: `d${i}`,
    stage: 'captada',
    property_address: `Calle Falsa ${i}`,
    scheduled_date: null,
    origin: null,
    assigned_to: null,
    assigned_to_name: '',
    contact_name: `Contacto ${i}`,
    contact_phone: '',
    contact_email: '',
    appraisal_id: null,
    property_id: null,
    stage_changed_at: '2026-08-01T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
    tags: [],
  }
}

function dealsPage(n: number, total: number) {
  return {
    data: Array.from({ length: n }, (_, i) => fakeDeal(i)),
    total,
    stageCounts: {},
    crmStageCounts: {},
  }
}

/** Una página con UN deal cuyo `property_address` es reconocible en pantalla —
 * para el test de carrera, que necesita distinguir "pintó el pedido viejo" de
 * "pintó el vigente" por el TEXTO visible, no solo por la URL pedida. */
function dealsPageLabeled(label: string) {
  return {
    data: [{ ...fakeDeal(0), id: label, property_address: label }],
    total: 1,
    stageCounts: {},
    crmStageCounts: {},
  }
}

describe('CRMPage — seguridad por rol', () => {
  it('un asesor con ?asesor=<otro> en la URL igual solo pide sus propios deals', async () => {
    // UUID sintácticamente válido (sobrevive a `normalizarFiltros`) pero de
    // OTRO asesor — el caso real que la seguridad tiene que resistir.
    busqueda = 'asesor=00000000-0000-0000-0000-000000000099'
    render(<CRMPage />)
    authDeferred.resolve({ id: 'u1', role: 'asesor' })
    await waitFor(() => expect(dealsCalls.length).toBeGreaterThanOrEqual(1))

    // TODOS los pedidos a /api/deals (incluido uno eventual por la limpieza
    // del `?asesor=` huérfano, M3) tienen que llevar el id PROPIO — nunca el
    // ajeno de la URL.
    for (const c of dealsCalls) {
      expect(c.url).toContain('assigned_to=u1')
      expect(c.url).not.toContain('000000000099')
    }
  })
})

describe('CRMPage — visibilidad del desplegable Asesor', () => {
  it('no aparece mientras no se conoce el rol, ni para el rol asesor una vez resuelto', async () => {
    render(<CRMPage />)
    // M4: antes de resolver identidad, `esAsesor` es `false` por defecto — si
    // el desplegable se gatillara solo con `!esAsesor` aparecería acá y
    // desaparecería al resolver el rol real (parpadeo).
    expect(screen.queryByLabelText('Asesor')).not.toBeInTheDocument()

    authDeferred.resolve({ id: 'u1', role: 'asesor' })
    await waitFor(() => expect(dealsCalls.length).toBeGreaterThanOrEqual(1))
    expect(screen.queryByLabelText('Asesor')).not.toBeInTheDocument()
  })

  it('aparece para un rol no-asesor una vez resuelta la identidad', async () => {
    render(<CRMPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(screen.getByLabelText('Asesor')).toBeInTheDocument())
  })
})

describe('CRMPage — valores inventados en la URL', () => {
  it('no rompen la pantalla: caen al defecto y no viajan a la API', async () => {
    busqueda = 'etapa=no-existe&asesor=no-es-un-uuid&origin=marciano'
    render(<CRMPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(dealsCalls.length).toBe(1))
    expect(dealsCalls[0].url).not.toContain('crm_stage=')
    expect(dealsCalls[0].url).not.toContain('origin=')
    expect(dealsCalls[0].url).not.toContain('assigned_to=no-es-un-uuid')

    dealsCalls[0].d.resolve(dealsPage(0, 0))
    await screen.findByText('Sin procesos')
  })
})

describe('CRMPage — ráfaga', () => {
  it('dos filtros tocados sin esperar el commit sobreviven los dos', async () => {
    render(<CRMPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(dealsCalls.length).toBe(1))
    dealsCalls[0].d.resolve(dealsPage(0, 0))
    await screen.findByText('Sin procesos')

    fireEvent.change(screen.getByLabelText('Origen'), { target: { value: 'embudo' } })
    fireEvent.change(screen.getByLabelText('Etapa'), { target: { value: 'captada' } })

    const ultima = escrituras[escrituras.length - 1]
    expect(ultima).toContain('etapa=captada')
    expect(ultima).toContain('origin=embudo')
  })
})

describe('CRMPage — F5 (montar con filtros ya en la URL)', () => {
  it('los controles y el primer pedido reflejan los filtros de la URL', async () => {
    busqueda = 'etapa=captada&origin=embudo'
    render(<CRMPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(dealsCalls.length).toBe(1))
    expect(dealsCalls[0].url).toContain('crm_stage=captada')
    expect(dealsCalls[0].url).toContain('origin=embudo')
    expect(screen.getByLabelText('Etapa')).toHaveValue('captada')
    expect(screen.getByLabelText('Origen')).toHaveValue('embudo')
  })
})

describe('CRMPage — "Limpiar todo"', () => {
  it('limpia etapa/origin/asesor y también el rango de fechas', async () => {
    busqueda = 'etapa=captada&from=2026-08-01&to=2026-08-08'
    render(<CRMPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(dealsCalls.length).toBe(1))
    dealsCalls[0].d.resolve(dealsPage(0, 0))
    await screen.findByText('Sin procesos')

    fireEvent.click(screen.getByText('Limpiar todo'))
    expect(escrituras[escrituras.length - 1]).toBe('/crm')
  })
})

describe('CRMPage — regla 1 del versionado (abrir() en el efecto principal)', () => {
  it('un filtro nuevo mientras un pedido viaja: el listado viejo NO pinta, gana el vigente', async () => {
    // Ronda de arreglos 2: análogo del test 1 de contacts/page.test.tsx
    // ("la carrera real"), pero para el efecto PRINCIPAL de CRM. Ninguno de
    // los 8 tests anteriores dejaba un segundo pedido a /api/deals en vuelo
    // y miraba el LISTADO — así que cambiar `abrir()` por `actual()` en ese
    // efecto (la generación queda clavada para siempre, `vigente(gen)` da
    // `true` para cualquier respuesta) pasaba los 8 en verde. Este test lo
    // ejercita: tres pedidos en ráfaga, el de en medio se resuelve DESPUÉS
    // del último, y su contenido no puede llegar a pintarse nunca.
    const { rerender } = render(<CRMPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })

    // Primer pedido (origin='').
    await waitFor(() => expect(dealsCalls.length).toBe(1))
    dealsCalls[0].d.resolve(dealsPageLabeled('Deal Original'))
    await screen.findByText('Deal Original')

    // La URL commitea a origin=embudo (gen 2) — sin resolver todavía.
    commitear(rerender, '/crm?origin=embudo')
    await waitFor(() => expect(dealsCalls.length).toBe(2))

    // Y antes de que responda, otro commit a origin=historico (gen 3).
    commitear(rerender, '/crm?origin=historico')
    await waitFor(() => expect(dealsCalls.length).toBe(3))

    // Responde PRIMERO el pedido viejo (gen 2, embudo): no tiene que pintar.
    dealsCalls[1].d.resolve(dealsPageLabeled('Deal Embudo Viejo'))
    await act(async () => { await Promise.resolve() })
    expect(screen.queryByText('Deal Embudo Viejo')).not.toBeInTheDocument()
    // El spinner del listado sigue prendido: la respuesta VIGENTE (gen 3) no llegó.
    expect(screen.getByText('Cargando procesos...')).toBeInTheDocument()

    // Responde el pedido vigente (gen 3, historico).
    dealsCalls[2].d.resolve(dealsPageLabeled('Deal Historico Vigente'))
    await screen.findByText('Deal Historico Vigente')

    // El listado del pedido viejo nunca llegó a pintarse, ni después.
    expect(screen.queryByText('Deal Embudo Viejo')).not.toBeInTheDocument()
    expect(screen.queryByText('Cargando procesos...')).not.toBeInTheDocument()
  })
})

describe('CRMPage — regla 3 del versionado ("Cargar más")', () => {
  it('la bandera del botón se apaga con la respuesta VIEJA, aunque su generación haya caducado', async () => {
    const { rerender } = render(<CRMPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(dealsCalls.length).toBe(1))
    dealsCalls[0].d.resolve(dealsPage(50, 120))
    await screen.findByRole('button', { name: /Cargar más/ })

    fireEvent.click(screen.getByRole('button', { name: /Cargar más/ }))
    await waitFor(() => expect(dealsCalls.length).toBe(2))
    expect(screen.getByRole('button', { name: /Cargando/ })).toBeDisabled()

    // Antes de que responda "cargar más", cambia un filtro real: abre una
    // generación NUEVA (pedidos.abrir()) — la de "cargar más" queda caduca.
    commitear(rerender, '/crm?origin=embudo')
    await waitFor(() => expect(dealsCalls.length).toBe(3))

    // Responde el pedido VIEJO de "cargar más" (gen caducada).
    dealsCalls[1].d.resolve(dealsPage(50, 120))
    await act(async () => { await Promise.resolve() })

    // Responde el pedido del filtro nuevo — recién ahí la sección "Cargar
    // más" vuelve a estar visible (el spinner del listado la tapaba).
    dealsCalls[2].d.resolve(dealsPage(50, 120))

    // Si la bandera del botón estuviera versionada (mutación), acá seguiría
    // "Cargando…"/deshabilitado para siempre — este find falla (rojo).
    const boton = await screen.findByRole('button', { name: /Cargar más/ })
    expect(boton).not.toBeDisabled()
  })
})

describe('CRMPage — tarjetas de números (task 16)', () => {
  it('Deals y las tarjetas por etapa muestran lo que la pantalla ya guardó, con el contexto de "sin filtros"', async () => {
    render(<CRMPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(dealsCalls.length).toBe(1))
    dealsCalls[0].d.resolve({
      data: [fakeDeal(0)],
      total: 7,
      stageCounts: {},
      crmStageCounts: { captada: 3, solicitud: 2 },
    })
    await screen.findByText('Contacto 0')

    const tarjetas = within(screen.getByTestId('tarjetas-numeros'))
    const deals = within(tarjetas.getByText('Deals').parentElement as HTMLElement)
    expect(deals.getByText('7')).toBeInTheDocument()
    expect(deals.getByText('en el sistema')).toBeInTheDocument()

    const captada = within(tarjetas.getByText('Captada').parentElement as HTMLElement)
    expect(captada.getByText('3')).toBeInTheDocument()
    expect(captada.getByText('en el sistema')).toBeInTheDocument()

    const solicitud = within(tarjetas.getByText('Solicitud').parentElement as HTMLElement)
    expect(solicitud.getByText('2')).toBeInTheDocument()
  })

  it('con un filtro puesto (aunque no sea la etapa), las tarjetas por etapa dicen "con los filtros puestos"', async () => {
    // `stageCounts` ignora la etapa a propósito (el picker necesita ver el
    // total completo de cada una) pero SÍ respeta origin/asesor/fecha — la
    // tarjeta tiene que reflejar esa base real, no la de "Deals".
    busqueda = 'origin=embudo'
    render(<CRMPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(dealsCalls.length).toBe(1))
    dealsCalls[0].d.resolve({ data: [], total: 0, stageCounts: {}, crmStageCounts: { captada: 1 } })
    await screen.findByText('Sin procesos')

    const tarjetas = within(screen.getByTestId('tarjetas-numeros'))
    const captada = within(tarjetas.getByText('Captada').parentElement as HTMLElement)
    expect(captada.getByText('con los filtros puestos')).toBeInTheDocument()
  })

  it('un /api/deals caído apaga los números a "Sin datos" — no al 0 que deja el catch', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      vi.stubGlobal('fetch', vi.fn((url: string) => {
        if (url.startsWith('/api/auth/me')) return authDeferred.promise.then(data => ({ ok: authOk, json: async () => data }))
        if (url.startsWith('/api/users/advisors')) return Promise.resolve({ ok: true, json: async () => ({ data: [] }) })
        if (url.startsWith('/api/deals')) return Promise.reject(new Error('caído'))
        return Promise.reject(new Error(`fetch inesperado: ${url}`))
      }))
      render(<CRMPage />)
      authDeferred.resolve({ id: 'u1', role: 'admin' })

      const tarjetas = within(screen.getByTestId('tarjetas-numeros'))
      const deals = within(tarjetas.getByText('Deals').parentElement as HTMLElement)
      await waitFor(() => expect(deals.getByText('Sin datos')).toBeInTheDocument())
      expect(deals.getByText('No se pudo consultar')).toBeInTheDocument()
    } finally {
      errores.mockRestore()
    }
  })

  it('agregar las tarjetas no dispara ninguna llamada de más', async () => {
    render(<CRMPage />)
    authDeferred.resolve({ id: 'u1', role: 'admin' })
    await waitFor(() => expect(dealsCalls.length).toBe(1))
    dealsCalls[0].d.resolve(dealsPage(0, 0))
    await screen.findByText('Sin procesos')

    // auth + advisors + deals = 3 fetch — ni uno más por las tarjetas nuevas.
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(3)
  })
})

describe('CRMPage — identidad fail-closed (A4)', () => {
  it('un 401 de /api/auth/me (que igual devuelve JSON) NO deja salir el pedido sin assigned_to', async () => {
    // Acá el `userInfo` truthy con `role` undefined caía justo en el `else` de
    // `buildParams` — el if/else que es lo único que impide que un asesor vea
    // deals ajenos.
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      authOk = false
      render(<CRMPage />)
      authDeferred.resolve({ error: 'No autenticado' } as never)
      await act(async () => { await Promise.resolve() })
      await act(async () => { await Promise.resolve() })
      expect(dealsCalls.length).toBe(0)
    } finally {
      errores.mockRestore()
    }
  })

  it('un 200 sin id tampoco es una identidad', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<CRMPage />)
      authDeferred.resolve({ role: 'asesor' } as never)
      await act(async () => { await Promise.resolve() })
      await act(async () => { await Promise.resolve() })
      expect(dealsCalls.length).toBe(0)
    } finally {
      errores.mockRestore()
    }
  })
})
