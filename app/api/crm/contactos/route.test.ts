/**
 * GET /api/crm/contactos (tarea 5.2, design.md D6). Servicio REAL (`cargarContactos`)
 * sobre la base simulada: lo que se verifica es lo que viaja por la red.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { baseSimulada, type OpcionesBaseSimulada } from '@/lib/supabase/cartera.simulada'
import { ABOGADO, ADMIN, ASESOR_A, C_A, C_B, C_COMP, C_SIN, COORD_1, DUENO, escenario, ultimosDelEscenario } from '../datos-de-prueba'

const m = vi.hoisted(() => ({
  cliente: null as unknown,
  usuario: null as null | { id: string; role: string; activo: boolean },
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: () => m.cliente }))
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () =>
    m.usuario
      ? { id: m.usuario.id, email: 'x@ejemplo.com', profile: { id: m.usuario.id, role: m.usuario.role, full_name: 'Quien mira', is_active: m.usuario.activo } }
      : null,
  ),
}))

import { GET } from './route'

let base: ReturnType<typeof baseSimulada>
function usar(opciones: OpcionesBaseSimulada = {}) {
  base = baseSimulada(escenario(), { ...opciones, rpcs: { crm_ultimos_contactos: ultimosDelEscenario } })
  m.cliente = base.cliente
}
function como(role: string, id: string) {
  m.usuario = { id, role, activo: true }
}
const pedir = () => GET()
const ids = (d: { filas: { id: string }[] }) => d.filas.map((f) => f.id).sort()

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ejemplo.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave'
  vi.spyOn(console, 'error').mockImplementation(() => {})
  usar()
})

describe('GET /api/crm/contactos — cada rol', () => {
  it.each([['coordinador', COORD_1], ['admin', ADMIN], ['dueno', DUENO]])('%s → 200 con todas las personas y la lista de asesores', async (role, id) => {
    como(role, id)
    const r = await pedir()
    expect(r.status).toBe(200)
    const d = await r.json()
    expect(ids(d)).toEqual([C_A, C_B, C_SIN, C_COMP].sort())
    expect(Array.isArray(d.asesores)).toBe(true)
    expect(d.fuentes).toEqual({ ultimoContacto: 'ok', tareas: 'ok' })
    expect(d.truncado).toBe(false)
    expect(typeof d.generadoEn).toBe('string')
  })

  it('asesor → 200 solo con sus contactos (asignado y por proceso), sin columna de asesores', async () => {
    como('asesor', ASESOR_A)
    const d = await (await pedir()).json()
    expect(ids(d)).toEqual([C_A, C_COMP].sort())
    expect(d.asesores).toBeNull()
  })

  it.each(['abogado', 'agent', 'viewer'])('%s → 403 sin filas y sin leer nada', async (role) => {
    como(role, ABOGADO)
    const r = await pedir()
    expect(r.status).toBe(403)
    expect(await r.json()).toEqual({ error: 'No tenés acceso a los contactos.' })
    expect(base.consultas).toEqual([])
  })

  it('sin sesión o desactivado → 401 en JSON', async () => {
    m.usuario = null
    expect((await pedir()).status).toBe(401)
    m.usuario = { id: ASESOR_A, role: 'asesor', activo: false }
    expect((await pedir()).status).toBe(401)
  })
})

describe('GET /api/crm/contactos — fallas de cada fuente', () => {
  it.each(['contacts', 'deals', 'profiles'])('falla %s → 500 con { error }', async (tabla) => {
    usar({ fallar: [tabla] })
    como('coordinador', COORD_1)
    const r = await pedir()
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'No se pudo cargar la lista de contactos.' })
  })

  it('fallan las tasaciones del asesor → 500 (sin ellas no se sabe a quién mostrar)', async () => {
    usar({ fallar: ['appraisals'] })
    como('asesor', ASESOR_A)
    expect((await pedir()).status).toBe(500)
  })

  it('fallan las tareas → 200 con fuentes.tareas "error"', async () => {
    usar({ fallar: ['tasks'] })
    como('coordinador', COORD_1)
    const r = await pedir()
    expect(r.status).toBe(200)
    expect((await r.json()).fuentes).toEqual({ ultimoContacto: 'ok', tareas: 'error' })
  })

  it('falla la RPC → 200 con fuentes.ultimoContacto "error"', async () => {
    usar({ fallar: ['rpc:crm_ultimos_contactos'] })
    como('asesor', ASESOR_A)
    const r = await pedir()
    expect(r.status).toBe(200)
    expect((await r.json()).fuentes).toEqual({ ultimoContacto: 'error', tareas: 'ok' })
  })
})
