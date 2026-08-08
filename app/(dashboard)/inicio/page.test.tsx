// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
let calls: string[]

beforeEach(() => {
  authDeferred = deferred()
  tasksDeferred = deferred()
  leadsDeferred = deferred()
  propertiesDeferred = deferred()
  visitsDeferred = deferred()
  calls = []
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    calls.push(url)
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
