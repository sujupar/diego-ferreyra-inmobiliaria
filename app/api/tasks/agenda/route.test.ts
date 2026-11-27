/** GET /api/tasks/agenda y /api/tasks/avisos: de quién son las tareas que se leen. */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  estado: { role: 'coordinador' as string, id: 'u-coord' },
  leerAgenda: vi.fn(),
  leerAvisos: vi.fn(),
}))
vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: m.estado.id, profile: { id: m.estado.id, role: m.estado.role } })),
}))
vi.mock('@/lib/supabase/agenda-tareas', () => ({
  leerAgenda: m.leerAgenda,
  leerAvisos: m.leerAvisos,
  leerPersonas: async () => [{ id: 'u-x', nombre: 'X' }, { id: '00000000-0000-4000-8000-0000000000b2', nombre: 'Otro' }],
}))

import { GET as agenda } from './route'
import { GET as avisos } from '../avisos/route'

const OTRO = '00000000-0000-4000-8000-0000000000b2'
const pedir = (qs = '') => agenda(new Request(`http://local/api/tasks/agenda${qs}`) as never)
const como = (role: string, id = `u-${role}`) => {
  m.estado.role = role
  m.estado.id = id
}

beforeEach(() => {
  vi.clearAllMocks()
  como('coordinador', 'u-coord')
  m.leerAgenda.mockResolvedValue({ grupos: { vencidas: [], hoy: [], proximas: [] }, sinFecha: { total: 0, quedan: 0, items: [] }, cantidades: {}, porTipo: {}, resumen: 'Nada pendiente' })
  m.leerAvisos.mockResolvedValue({ vencidas: [], ahora: [], loQueViene: [], total: 0 })
})

describe('GET /api/tasks/agenda', () => {
  it('por defecto, las propias', async () => {
    await pedir()
    expect(m.leerAgenda).toHaveBeenCalledWith({ asignados: ['u-coord'], tipo: null, sinFechaDesde: 0 }, expect.any(Date))
  })
  it('admin y dueño arrancan en todo el equipo; la coordinación en las suyas', async () => {
    como('admin')
    await pedir()
    como('dueno')
    await pedir()
    como('coordinador', 'u-coord')
    await pedir()
    expect(m.leerAgenda.mock.calls.map((c) => c[0].asignados)).toEqual(['todos', 'todos', ['u-coord']])
  })
  it('una persona que no está activa da la lista vacía', async () => {
    await pedir('?de=00000000-0000-4000-8000-0000000000c9')
    expect(m.leerAgenda.mock.calls[0][0].asignados).toEqual(['00000000-0000-0000-0000-000000000000'])
  })
  it('la lista de personas viaja solo a quien puede elegir', async () => {
    expect((await (await pedir()).json()).personas).toHaveLength(2)
    como('asesor')
    expect((await (await pedir()).json()).personas).toBeNull()
  })
  it.each(['coordinador', 'admin', 'dueno'])('%s puede ver a otra persona y a todo el equipo', async (rol) => {
    como(rol)
    await pedir(`?de=${OTRO}`)
    expect(m.leerAgenda.mock.calls[0][0].asignados).toEqual([OTRO])
    await pedir('?de=todos')
    expect(m.leerAgenda.mock.calls[1][0].asignados).toBe('todos')
  })
  it.each(['asesor', 'abogado'])('%s ve siempre las suyas, pida lo que pida', async (rol) => {
    como(rol)
    await pedir(`?de=${OTRO}`)
    await pedir('?de=todos')
    expect(m.leerAgenda.mock.calls.map((c) => c[0].asignados)).toEqual([[`u-${rol}`], [`u-${rol}`]])
  })
  it('tipo, página y errores de parámetros', async () => {
    await pedir('?tipo=visita&sin_fecha_desde=25')
    expect(m.leerAgenda).toHaveBeenCalledWith({ asignados: ['u-coord'], tipo: 'visita', sinFechaDesde: 25 }, expect.any(Date))
    expect((await pedir('?tipo=email')).status).toBe(400)
    expect((await pedir('?sin_fecha_desde=-1')).status).toBe(400)
    expect((await pedir('?de=no-es-uuid')).status).toBe(400)
  })
  it('si la lectura falla: 500 con texto legible, nunca una lista vacía', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.leerAgenda.mockRejectedValue(new Error('x'))
    const r = await pedir()
    expect(r.status).toBe(500)
    expect((await r.json()).error).toMatch(/Probá de nuevo/)
    err.mockRestore()
  })
})

describe('GET /api/tasks/avisos', () => {
  it('solo las de quien pide', async () => {
    como('asesor', 'u-asesor')
    await avisos()
    expect(m.leerAvisos).toHaveBeenCalledWith('u-asesor', expect.any(Date), expect.any(Date))
  })
  it('falla → 500', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.leerAvisos.mockRejectedValue(new Error('x'))
    expect((await avisos()).status).toBe(500)
    err.mockRestore()
  })
})
