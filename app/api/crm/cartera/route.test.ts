/**
 * GET /api/crm/cartera (tarea 5.1, design.md D6). La ruta llama al servicio REAL
 * (`cargarCartera`) sobre la base simulada: lo que se verifica es lo que viaja por la red.
 * Qué dice cada fila está probado en lib/crm; la lectura, en lib/supabase/cartera.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { baseSimulada, type OpcionesBaseSimulada } from '@/lib/supabase/cartera.simulada'
import {
  ABOGADO, ADMIN, ASESOR_A, ASESOR_B, COORD_1, DUENO, INACTIVO, P_A, P_B, P_COMP_B, P_SIN, PERFILES, escenario, ultimosDelEscenario, uuid,
} from '../datos-de-prueba'

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
const pedir = (consulta = '') => GET(new Request(`http://local/api/crm/cartera${consulta}`) as never)

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://ejemplo.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave'
  vi.spyOn(console, 'error').mockImplementation(() => {})
  usar()
})

describe('GET /api/crm/cartera — cada rol', () => {
  it('coordinador → 200 con la vista de la coordinación', async () => {
    como('coordinador', COORD_1)
    const r = await pedir()
    expect(r.status).toBe(200)
    const d = await r.json()
    expect(d.vista).toEqual({ tipo: 'coordinacion', persona: { id: COORD_1, nombre: 'Paula Coord', rol: 'coordinador' }, mirando: false })
    // La solicitud sin asesor y la Coordinada (aunque ya tenga asesor): las etapas de la coordinación.
    expect(d.filas.map((f: { id: string }) => f.id)).toEqual([P_SIN, P_COMP_B])
    expect(d.opcionesVerComo).toBeNull()
    expect(Array.isArray(d.asesores)).toBe(true)
    expect(d).toHaveProperty('fuentes')
    expect(d).toHaveProperty('truncado', false)
    expect(typeof d.generadoEn).toBe('string')
  })

  it('asesor → 200 con sus procesos, sin columna de asesores ni "Ver como"', async () => {
    como('asesor', ASESOR_A)
    const d = await (await pedir()).json()
    expect(d.vista.tipo).toBe('asesor')
    expect(d.filas.every((f: { asesor: { id: string } | null }) => f.asesor?.id === ASESOR_A)).toBe(true)
    expect(d.asesores).toBeNull()
    expect(d.opcionesVerComo).toBeNull()
  })

  it.each([['admin', ADMIN], ['dueno', DUENO]])('%s → 200 con la vista del dueño y las opciones de "Ver como"', async (role, id) => {
    como(role, id)
    const r = await pedir()
    expect(r.status).toBe(200)
    const d = await r.json()
    expect(d.vista).toEqual({ tipo: 'dueno', persona: null, mirando: false })
    expect(d.filas.length).toBe(5)
    expect(d.opcionesVerComo.map((o: { etiqueta: string }) => o.etiqueta)).toEqual([
      'Ana Asesora · asesor', 'Bruno Asesor · asesor', 'Julian Coord · coordinación', 'Paula Coord · coordinación',
    ])
  })

  it.each(['abogado', 'agent', 'viewer'])('%s → 403 sin filas y sin leer procesos', async (role) => {
    como(role, ABOGADO)
    const r = await pedir()
    expect(r.status).toBe(403)
    const d = await r.json()
    expect(d).toEqual({ error: 'No tenés acceso al CRM.' })
    expect(base.consultas.filter((q) => q.tabla === 'deals')).toEqual([])
  })

  it('sin sesión o con el usuario desactivado → 401 en JSON (no una redirección)', async () => {
    m.usuario = null
    expect((await pedir()).status).toBe(401)
    m.usuario = { id: ASESOR_A, role: 'asesor', activo: false }
    const r = await pedir()
    expect(r.status).toBe(401)
    expect(await r.json()).toHaveProperty('error')
  })
})

describe('GET /api/crm/cartera — "Ver como"', () => {
  it.each([['admin', ADMIN], ['dueno', DUENO]])('%s a un asesor → 200 con la vista de ese asesor, mirando, sin opciones', async (role, id) => {
    como(role, id)
    const r = await pedir(`?ver_como=${ASESOR_B}`)
    expect(r.status).toBe(200)
    const d = await r.json()
    expect(d.vista).toEqual({ tipo: 'asesor', persona: { id: ASESOR_B, nombre: 'Bruno Asesor', rol: 'asesor' }, mirando: true })
    expect(d.filas.map((f: { id: string }) => f.id)).toContain(P_B)
    expect(d.filas.map((f: { id: string }) => f.id)).not.toContain(P_A)
    expect(d.opcionesVerComo).toBeNull()
  })

  it('el dueño a una coordinadora → 200 con la vista de la coordinación', async () => {
    como('dueno', DUENO)
    const d = await (await pedir(`?ver_como=${COORD_1}`)).json()
    expect(d.vista).toMatchObject({ tipo: 'coordinacion', persona: { id: COORD_1 }, mirando: true })
    expect(d.filas.map((f: { id: string }) => f.id)).toEqual([P_SIN, P_COMP_B])
  })

  it.each([['asesor', ASESOR_A], ['coordinador', COORD_1]])('pedido por un %s → 403 sin datos de la otra persona', async (role, id) => {
    como(role, id)
    const r = await pedir(`?ver_como=${ASESOR_B}`)
    expect(r.status).toBe(403)
    const texto = await r.text()
    expect(texto).not.toContain(P_B)
    expect(base.consultas.filter((q) => q.tabla === 'deals')).toEqual([])
  })

  it.each([['un abogado', ABOGADO], ['un inactivo', INACTIVO], ['un inexistente', uuid(999)]])(
    'a %s → 400 con "Esa persona no tiene una vista del CRM."',
    async (_que, verComo) => {
      como('dueno', DUENO)
      const r = await pedir(`?ver_como=${verComo}`)
      expect(r.status).toBe(400)
      expect(await r.json()).toEqual({ error: 'Esa persona no tiene una vista del CRM.' })
      expect(base.consultas.filter((q) => q.tabla === 'deals')).toEqual([])
    },
  )

  it('ver_como que no es un uuid → 400 sin leer nada', async () => {
    como('dueno', DUENO)
    const r = await pedir('?ver_como=1%27%20or%201=1')
    expect(r.status).toBe(400)
    expect(base.consultas).toEqual([])
  })
})

describe('GET /api/crm/cartera — fallas', () => {
  it('falla la lectura de procesos → 500 con { error }', async () => {
    usar({ fallar: ['deals'] })
    como('dueno', DUENO)
    const r = await pedir()
    expect(r.status).toBe(500)
    expect(await r.json()).toEqual({ error: 'No se pudo cargar la lista de procesos.' })
  })

  it('fallan las tareas → 200 con fuentes.tareas "error"', async () => {
    usar({ fallar: ['tasks'] })
    como('dueno', DUENO)
    const r = await pedir()
    expect(r.status).toBe(200)
    expect((await r.json()).fuentes).toEqual({ ultimoContacto: 'ok', tareas: 'error' })
  })

  it('falla la RPC del último contacto → 200 con fuentes.ultimoContacto "error"', async () => {
    usar({ fallar: ['rpc:crm_ultimos_contactos'] })
    como('dueno', DUENO)
    const r = await pedir()
    expect(r.status).toBe(200)
    expect((await r.json()).fuentes).toEqual({ ultimoContacto: 'error', tareas: 'ok' })
  })
})

// Que la lista de perfiles del escenario siga teniendo lo que estas pruebas suponen.
it('el escenario tiene los perfiles que las pruebas usan', () => {
  expect(PERFILES.map((p) => p.role)).toEqual(['dueno', 'admin', 'coordinador', 'coordinador', 'asesor', 'asesor', 'abogado', 'asesor'])
})
