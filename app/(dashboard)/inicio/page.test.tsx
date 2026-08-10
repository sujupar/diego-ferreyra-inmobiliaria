// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import InicioPage from './page'

/**
 * Task 15 — Inicio. Mismo patrón de deferreds a mano que las pantallas de la
 * Fase 2 (`contacts/page.test.tsx`, `visits/page.test.tsx`): nunca `sleep`,
 * se controla cuándo responde cada ruta.
 *
 * Cubre las tres reglas del brief:
 *   1. Una ruta que falla no le saca el número a las demás (StatTile "Sin
 *      datos" para esa sola, números reales para el resto).
 *   2. La identidad que no resuelve no dispara NINGÚN pedido de número, y deja
 *      una salida visible ("Reintentar").
 *   3. Las tarjetas mostradas dependen del rol — un asesor no ve "Propiedades
 *      por revisar" (no tiene `properties.review`) y ni siquiera se pide.
 */

interface Deferred<T> { promise: Promise<T>; resolve: (v: T) => void }
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

interface Respuesta { ok: boolean; body: unknown }

let authDeferred: Deferred<Respuesta>
let tasksDeferred: Deferred<Respuesta>
let leadsDeferred: Deferred<Respuesta>
let propertiesDeferred: Deferred<Respuesta>
let visitsDeferred: Deferred<Respuesta>
let avisosDeferred: Deferred<Respuesta>
let calls: string[]

beforeEach(() => {
  authDeferred = deferred()
  tasksDeferred = deferred()
  leadsDeferred = deferred()
  propertiesDeferred = deferred()
  visitsDeferred = deferred()
  avisosDeferred = deferred()
  calls = []
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    calls.push(url)
    if (url.startsWith('/api/portal-inquiries/unidentified')) {
      return avisosDeferred.promise.then(r => ({ ok: r.ok, json: async () => r.body }))
    }
    if (url.startsWith('/api/auth/me')) {
      return authDeferred.promise.then(r => ({ ok: r.ok, json: async () => r.body }))
    }
    if (url.startsWith('/api/tasks')) {
      return tasksDeferred.promise.then(r => ({ ok: r.ok, json: async () => r.body }))
    }
    if (url.startsWith('/api/leads/count')) {
      return leadsDeferred.promise.then(r => ({ ok: r.ok, json: async () => r.body }))
    }
    if (url.startsWith('/api/properties')) {
      return propertiesDeferred.promise.then(r => ({ ok: r.ok, json: async () => r.body }))
    }
    if (url.startsWith('/api/visits')) {
      return visitsDeferred.promise.then(r => ({ ok: r.ok, json: async () => r.body }))
    }
    return Promise.reject(new Error(`fetch inesperado: ${url}`))
  }))
})

describe('InicioPage — cada número falla por su cuenta', () => {
  it('una ruta caída dice "Sin datos" en su tarjeta; las demás muestran su número real', async () => {
    render(<InicioPage />)
    authDeferred.resolve({ ok: true, body: { id: 'u1', role: 'admin' } })

    await waitFor(() => expect(calls.some(c => c.startsWith('/api/tasks'))).toBe(true))
    tasksDeferred.resolve({ ok: true, body: { data: [{ id: '1' }, { id: '2' }, { id: '3' }] } })
    leadsDeferred.resolve({ ok: true, body: { new: 5 } })
    // Esta ruta cae (500) — su tarjeta, y solo la suya, debe decir "Sin datos".
    propertiesDeferred.resolve({ ok: false, body: {} })
    visitsDeferred.resolve({ ok: true, body: { data: [{ id: 'v1' }] } })

    await screen.findByText('3') // Pendientes
    expect(screen.getByText('5')).toBeInTheDocument() // Consultas sin responder
    expect(screen.getByText('1')).toBeInTheDocument() // Visitas de hoy
    expect(screen.getByText('Sin datos')).toBeInTheDocument() // Propiedades por revisar

    // El "Sin datos" es exactamente uno: las otras tres SÍ tienen número.
    expect(screen.getAllByText('Sin datos')).toHaveLength(1)
  })
})

describe('InicioPage — identidad fail-closed', () => {
  it('si /api/auth/me no resuelve, no se pide ningún número y queda una salida visible', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<InicioPage />)
      // /api/auth/me responde JSON también en error — el body no trae id.
      authDeferred.resolve({ ok: false, body: { error: 'No autenticado' } })

      await screen.findByText('No pudimos confirmar quién sos.')
      expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()

      expect(calls.some(c => c.startsWith('/api/tasks'))).toBe(false)
      expect(calls.some(c => c.startsWith('/api/leads/count'))).toBe(false)
      expect(calls.some(c => c.startsWith('/api/properties'))).toBe(false)
      expect(calls.some(c => c.startsWith('/api/visits'))).toBe(false)
    } finally {
      errores.mockRestore()
    }
  })

  it('un cuerpo con id pero r.ok=false NO se acepta como identidad (chequeo de r.ok, no solo del id)', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<InicioPage />)
      // Cuerpo con forma válida de perfil, pero la respuesta HTTP no es ok.
      // Si el gate solo mirara "¿hay id?" sin mirar r.ok, esto pasaría.
      authDeferred.resolve({ ok: false, body: { id: 'u1', role: 'admin' } })
      await screen.findByText('No pudimos confirmar quién sos.')
      expect(calls.some(c => c.startsWith('/api/tasks'))).toBe(false)
    } finally {
      errores.mockRestore()
    }
  })

  it('un 200 sin id tampoco es una identidad', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<InicioPage />)
      authDeferred.resolve({ ok: true, body: { role: 'admin' } })
      await screen.findByText('No pudimos confirmar quién sos.')
      expect(calls.some(c => c.startsWith('/api/tasks'))).toBe(false)
    } finally {
      errores.mockRestore()
    }
  })
})

describe('InicioPage — las tarjetas dependen del rol', () => {
  it('un asesor no ve "Propiedades por revisar" (no tiene properties.review) y ni se pide', async () => {
    render(<InicioPage />)
    authDeferred.resolve({ ok: true, body: { id: 'u1', role: 'asesor' } })

    await waitFor(() => expect(calls.some(c => c.startsWith('/api/tasks'))).toBe(true))
    tasksDeferred.resolve({ ok: true, body: { data: [] } })
    leadsDeferred.resolve({ ok: true, body: { new: 0 } })
    visitsDeferred.resolve({ ok: true, body: { data: [] } })

    await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument())

    expect(screen.queryByText('Propiedades por revisar')).not.toBeInTheDocument()
    expect(calls.some(c => c.startsWith('/api/properties'))).toBe(false)

    // Y sí ve las otras tres, scopeadas a lo suyo en Visitas.
    expect(screen.getByText('Pendientes')).toBeInTheDocument()
    expect(screen.getByText('Consultas sin responder')).toBeInTheDocument()
    expect(screen.getByText('Visitas de hoy')).toBeInTheDocument()
    expect(calls.find(c => c.startsWith('/api/visits'))).toContain('advisor_id=u1')
  })
})

describe('InicioPage — cada tarjeta declara su propia base (revisión final Fase 3)', () => {
  // I1: el pedido es `/api/visits?from&to` SIN `status`, y `listVisits` no
  // filtra por estado — o sea que el número incluye canceladas y no-shows.
  // Decir "agendadas para hoy" ahí es afirmar algo falso sobre el día del
  // asesor (3 visitas de las que 2 se cayeron seguía diciendo "3 · agendadas").
  it('"Visitas de hoy" declara que cuenta todos los estados, no solo las agendadas', async () => {
    render(<InicioPage />)
    authDeferred.resolve({ ok: true, body: { id: 'u1', role: 'admin' } })

    await waitFor(() => expect(calls.some(c => c.startsWith('/api/visits'))).toBe(true))
    tasksDeferred.resolve({ ok: true, body: { data: [] } })
    leadsDeferred.resolve({ ok: true, body: { new: 0 } })
    propertiesDeferred.resolve({ ok: true, body: { total: 0 } })
    // Tres visitas de hoy, de las cuales dos están canceladas: el número que
    // devuelve la ruta es 3 igual, porque nadie filtra por estado.
    visitsDeferred.resolve({
      ok: true,
      body: { data: [{ id: 'v1', status: 'scheduled' }, { id: 'v2', status: 'cancelled' }, { id: 'v3', status: 'cancelled' }] },
    })
    await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument())

    const visitas = within(screen.getByText('Visitas de hoy').parentElement as HTMLElement)
    expect(visitas.getByText('3')).toBeInTheDocument()
    expect(visitas.getByText('en la agenda de hoy, todos los estados')).toBeInTheDocument()
    // El contexto viejo afirmaba que las 3 estaban agendadas.
    expect(visitas.queryByText('agendadas para hoy')).not.toBeInTheDocument()

    // Y el pedido sigue siendo UNO solo, sin parámetro de estado: la ruta
    // aplica `status` con un `.eq()` de un valor y los estados vivos son dos.
    const visitsUrls = calls.filter(c => c.startsWith('/api/visits'))
    expect(visitsUrls).toHaveLength(1)
    expect(visitsUrls[0]).not.toContain('status=')
  })

  // M1: `getMyTasks` corta con `.limit(50)`. Con 63 pendientes la tarjeta
  // decía "50 · cosas esperándote", como si fueran todas. El techo NO se
  // levanta (es una ruta de producción): lo declara el contexto.
  it('"Pendientes" declara el techo de 50 cuando el número llega al tope', async () => {
    render(<InicioPage />)
    authDeferred.resolve({ ok: true, body: { id: 'u1', role: 'admin' } })

    await waitFor(() => expect(calls.some(c => c.startsWith('/api/tasks'))).toBe(true))
    // La ruta devuelve 50 porque ese es su techo — no porque haya 50.
    tasksDeferred.resolve({ ok: true, body: { data: Array.from({ length: 50 }, (_, i) => ({ id: String(i) })) } })
    leadsDeferred.resolve({ ok: true, body: { new: 0 } })
    propertiesDeferred.resolve({ ok: true, body: { total: 0 } })
    visitsDeferred.resolve({ ok: true, body: { data: [] } })
    await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument())

    const pendientes = within(screen.getByText('Pendientes').parentElement as HTMLElement)
    expect(pendientes.getByText('50')).toBeInTheDocument()
    expect(pendientes.getByText('las primeras 50 — puede haber más')).toBeInTheDocument()
    expect(pendientes.queryByText('cosas esperándote')).not.toBeInTheDocument()
  })

  it('por debajo del techo, "Pendientes" no declara nada raro', async () => {
    render(<InicioPage />)
    authDeferred.resolve({ ok: true, body: { id: 'u1', role: 'admin' } })

    await waitFor(() => expect(calls.some(c => c.startsWith('/api/tasks'))).toBe(true))
    tasksDeferred.resolve({ ok: true, body: { data: Array.from({ length: 49 }, (_, i) => ({ id: String(i) })) } })
    leadsDeferred.resolve({ ok: true, body: { new: 0 } })
    propertiesDeferred.resolve({ ok: true, body: { total: 0 } })
    visitsDeferred.resolve({ ok: true, body: { data: [] } })
    await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument())

    const pendientes = within(screen.getByText('Pendientes').parentElement as HTMLElement)
    expect(pendientes.getByText('49')).toBeInTheDocument()
    expect(pendientes.getByText('cosas esperándote')).toBeInTheDocument()
  })
})

describe('InicioPage — la tarjeta lleva al recorte que contó (D37)', () => {
  // La tarjeta contaba `/api/visits?from=<hoy>&to=<hoy>` y el link iba a
  // `/visits` PELADO: prometía 3 visitas y aterrizaba en todas las del sistema,
  // de toda la historia y de todos los asesores (la RLS de `property_visits`
  // es `USING (true)`), ordenadas por fecha DESC. Las 3 de hoy, enterradas.
  it('"Visitas de hoy" enlaza a /visits con el día puesto', async () => {
    render(<InicioPage />)
    authDeferred.resolve({ ok: true, body: { id: 'u1', role: 'admin' } })

    await waitFor(() => expect(calls.some(c => c.startsWith('/api/visits'))).toBe(true))
    tasksDeferred.resolve({ ok: true, body: { data: [] } })
    leadsDeferred.resolve({ ok: true, body: { new: 0 } })
    propertiesDeferred.resolve({ ok: true, body: { total: 0 } })
    avisosDeferred.resolve({ ok: true, body: { data: [] } })
    visitsDeferred.resolve({ ok: true, body: { data: [{ id: 'v1' }] } })
    await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument())

    const enlace = screen.getByText('Visitas de hoy').closest('a')!
    const destino = new URL(enlace.getAttribute('href')!, 'http://localhost')
    expect(destino.pathname).toBe('/visits')
    // El mismo día que se le pidió a la API para armar el número.
    const pedido = new URL(calls.find(c => c.startsWith('/api/visits'))!, 'http://localhost')
    const diaContado = new Date(pedido.searchParams.get('from')!)
    const esperado = `${diaContado.getFullYear()}-${String(diaContado.getMonth() + 1).padStart(2, '0')}-${String(diaContado.getDate()).padStart(2, '0')}`
    expect(destino.searchParams.get('from')).toBe(esperado)
    expect(destino.searchParams.get('to')).toBe(esperado)
  })

  it('para un asesor además lleva "solo mías": el número se cuenta con su advisor_id', async () => {
    render(<InicioPage />)
    authDeferred.resolve({ ok: true, body: { id: 'u1', role: 'asesor' } })

    await waitFor(() => expect(calls.some(c => c.startsWith('/api/visits'))).toBe(true))
    tasksDeferred.resolve({ ok: true, body: { data: [] } })
    leadsDeferred.resolve({ ok: true, body: { new: 0 } })
    visitsDeferred.resolve({ ok: true, body: { data: [] } })
    await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument())

    const destino = new URL(screen.getByText('Visitas de hoy').closest('a')!.getAttribute('href')!, 'http://localhost')
    expect(destino.searchParams.get('onlyMine')).toBe('true')
    // Y el pedido que armó el número también estaba scopeado a él.
    expect(calls.find(c => c.startsWith('/api/visits'))).toContain('advisor_id=u1')
  })

  it('el día del link es el LOCAL, no el UTC (a la noche argentina son días distintos)', async () => {
    vi.setSystemTime(new Date('2026-08-08T02:30:00Z')) // noche del 7 en UTC-3
    try {
      render(<InicioPage />)
      authDeferred.resolve({ ok: true, body: { id: 'u1', role: 'admin' } })

      await waitFor(() => expect(calls.some(c => c.startsWith('/api/visits'))).toBe(true))
      tasksDeferred.resolve({ ok: true, body: { data: [] } })
      leadsDeferred.resolve({ ok: true, body: { new: 0 } })
      propertiesDeferred.resolve({ ok: true, body: { total: 0 } })
      avisosDeferred.resolve({ ok: true, body: { data: [] } })
      visitsDeferred.resolve({ ok: true, body: { data: [] } })
      await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument())

      const destino = new URL(screen.getByText('Visitas de hoy').closest('a')!.getAttribute('href')!, 'http://localhost')
      expect(destino.searchParams.get('from')).toBe('2026-08-07')
      expect(destino.searchParams.get('to')).toBe('2026-08-07')
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('InicioPage — el cartel de avisos sin identificar (D39)', () => {
  // Vivía SOLO en `/tasks`, que era la pantalla de entrada hasta que el
  // rediseño mudó el landing a `/inicio`. La coordinadora entraba y no se
  // enteraba de que había consultas sin rutear.
  it('la coordinadora ve el cartel en la pantalla de entrada', async () => {
    render(<InicioPage />)
    authDeferred.resolve({ ok: true, body: { id: 'u1', role: 'coordinador' } })

    await waitFor(() => expect(calls.some(c => c.startsWith('/api/tasks'))).toBe(true))
    tasksDeferred.resolve({ ok: true, body: { data: [] } })
    leadsDeferred.resolve({ ok: true, body: { new: 0 } })
    propertiesDeferred.resolve({ ok: true, body: { total: 0 } })
    visitsDeferred.resolve({ ok: true, body: { data: [] } })
    avisosDeferred.resolve({ ok: true, body: { data: [{ id: 'a1' }, { id: 'a2' }] } })

    expect(await screen.findByText('2 avisos sin identificar')).toBeInTheDocument()
  })

  it('un asesor no tiene esa pantalla: ni cartel ni pedido', async () => {
    render(<InicioPage />)
    authDeferred.resolve({ ok: true, body: { id: 'u1', role: 'asesor' } })

    await waitFor(() => expect(calls.some(c => c.startsWith('/api/tasks'))).toBe(true))
    tasksDeferred.resolve({ ok: true, body: { data: [] } })
    leadsDeferred.resolve({ ok: true, body: { new: 0 } })
    visitsDeferred.resolve({ ok: true, body: { data: [] } })
    await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument())

    expect(calls.some(c => c.startsWith('/api/portal-inquiries/unidentified'))).toBe(false)
  })
})

describe('InicioPage — rangoDeHoy() usa el día local, no UTC', () => {
  // Ronda de arreglos 1: mismo molde que DateRangeFilter.test.tsx ("zona
  // horaria: Hoy devuelve la fecha local, no UTC"). Este error ya se cometió
  // dos veces en el proyecto (DateRangeFilter, Visitas) — nada lo hubiera
  // detectado acá sin este test.
  //
  // 2026-08-08T02:30 UTC es la noche del 7 en cualquier huso más atrasado
  // que UTC (Argentina UTC-3, y el huso de esta corrida). Si `rangoDeHoy()`
  // usara el día UTC en vez del local (ej. sacando el `setHours` y armando
  // el rango a partir de `toISOString().slice(0,10)`), el rango pedido a
  // `/api/visits` sería el 8, no el 7 — un cliente que agenda "hoy a la
  // tarde" quedaría afuera de "Visitas de hoy".
  it('el from/to que se le manda a /api/visits cubre el día LOCAL completo, no se corta a la noche anterior en UTC', async () => {
    vi.setSystemTime(new Date('2026-08-08T02:30:00Z'))
    try {
      render(<InicioPage />)
      authDeferred.resolve({ ok: true, body: { id: 'u1', role: 'admin' } })

      await waitFor(() => expect(calls.some(c => c.startsWith('/api/visits'))).toBe(true))
      tasksDeferred.resolve({ ok: true, body: { data: [] } })
      leadsDeferred.resolve({ ok: true, body: { new: 0 } })
      propertiesDeferred.resolve({ ok: true, body: { total: 0 } })
      visitsDeferred.resolve({ ok: true, body: { data: [] } })
      await waitFor(() => expect(screen.queryByText('Cargando…')).not.toBeInTheDocument())

      const visitsUrl = calls.find(c => c.startsWith('/api/visits'))!
      const params = new URL(visitsUrl, 'http://localhost').searchParams
      const from = new Date(params.get('from')!)
      const to = new Date(params.get('to')!)

      // Día local esperado: 7 de agosto (no el 8, que sería el día UTC).
      expect([from.getFullYear(), from.getMonth(), from.getDate()]).toEqual([2026, 7, 7])
      expect([from.getHours(), from.getMinutes(), from.getSeconds()]).toEqual([0, 0, 0])

      expect([to.getFullYear(), to.getMonth(), to.getDate()]).toEqual([2026, 7, 7])
      expect([to.getHours(), to.getMinutes(), to.getSeconds()]).toEqual([23, 59, 59])
    } finally {
      vi.useRealTimers()
    }
  })
})
