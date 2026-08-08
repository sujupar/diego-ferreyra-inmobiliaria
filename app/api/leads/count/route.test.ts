/**
 * Ronda de arreglos 1 (task-15, autorización puntual del coordinador). Antes,
 * un fallo de la consulta a `property_leads` (RLS, timeout, lo que sea)
 * quedaba atrapado por un `try/catch` que respondía `200 {new:0}` — un cero
 * indistinguible de "no hay ninguna consulta sin responder". La tarjeta
 * "Consultas sin responder" de `/inicio` (y el badge del Inbox en
 * `AppSidebar`) dependen de poder distinguir eso: ambos ya chequean
 * `res.ok`, así que el arreglo es que la ruta deje de mentir con un 200.
 */
import { describe, it, expect, vi } from 'vitest'

const { state } = vi.hoisted(() => ({
  state: { role: 'admin' as string, propertiesError: null as unknown, countError: null as unknown, count: 0 },
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: 'user-1', profile: { role: state.role } })),
}))

vi.mock('@supabase/supabase-js', () => {
  function builder(table: string) {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.is = () => q
    q.or = () => q
    q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) => {
      const result = table === 'properties'
        ? { data: [], error: state.propertiesError }
        : { count: state.count, error: state.countError }
      return Promise.resolve(result).then(resolve, reject)
    }
    return q
  }
  return { createClient: () => ({ from: (table: string) => builder(table) }) }
})

import { GET } from './route'

describe('GET /api/leads/count', () => {
  it('cuenta OK: responde 200 con el número real', async () => {
    state.role = 'admin'
    state.propertiesError = null
    state.countError = null
    state.count = 7
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ new: 7 })
  })

  it('la consulta de conteo falla (RLS/timeout): NO responde 200 {new:0} — responde un status de error', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      state.role = 'admin'
      state.propertiesError = null
      state.countError = { message: 'RLS denied' }
      state.count = 0
      const res = await GET()
      expect(res.ok).toBe(false)
      const body = await res.json()
      expect(body).not.toEqual({ new: 0 })
    } finally {
      errores.mockRestore()
    }
  })

  it('para un asesor, si falla la consulta de propiedades (previa al conteo) también responde error, no {new:0}', async () => {
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      state.role = 'asesor'
      state.propertiesError = { message: 'timeout' }
      state.countError = null
      state.count = 0
      const res = await GET()
      expect(res.ok).toBe(false)
      const body = await res.json()
      expect(body).not.toEqual({ new: 0 })
    } finally {
      errores.mockRestore()
    }
  })

  it('un rol sin badge (ej. legacy) sigue respondiendo {new:0} con 200 — ese cero SÍ es legítimo', async () => {
    state.role = 'viewer'
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ new: 0 })
  })
})
