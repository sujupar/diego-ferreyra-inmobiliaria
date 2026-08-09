/**
 * Alcance server-side del listado de tareas.
 *
 * Misma historia que en deals y contactos: `getMyTasks` lee con el cliente
 * service-role (RLS no aplica) y el "ver solo lo mío" vivía únicamente en la
 * pantalla, que manda `?user_id=<el propio>`. Un asesor logueado cambiaba ese
 * parámetro por consola y se llevaba la agenda de trabajo de otro — títulos,
 * descripciones y las entidades vinculadas de cada tarea.
 *
 * El permiso elegido es `pipeline.view_all` porque reproduce exactamente la
 * policy que la base ya tiene sobre ESTA tabla (`tasks_select_assigned_or_ops`:
 * `assigned_to = auth.uid() OR is_operations_user()`, con is_operations_user =
 * admin/dueño/coordinador).
 *
 * EL test es el primero: importa con QUÉ id sale la consulta, no el status.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, getMyTasksMock } = vi.hoisted(() => ({
  estado: { role: 'admin' as string, id: 'yo-1' },
  getMyTasksMock: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({
    id: estado.id,
    email: 'quien@ejemplo.com',
    profile: { id: estado.id, role: estado.role },
  })),
}))

vi.mock('@/lib/supabase/tasks', () => ({
  getMyTasks: getMyTasksMock,
  createTask: vi.fn(),
}))

// El POST de la ruta importa estos dos; el GET no los toca, pero el módulo se
// evalúa entero al importarlo.
vi.mock('@/lib/auth/get-user', () => ({ getUser: vi.fn() }))
vi.mock('@/lib/tasks/validate-task-input', () => ({ validateTaskInput: vi.fn() }))

import { GET } from './route'

const AJENO = 'otro-usuario-9'

function pedir(qs: string) {
  return GET(new Request(`http://local/api/tasks${qs}`) as never)
}

function alcanceUsado(): string | undefined {
  expect(getMyTasksMock).toHaveBeenCalledTimes(1)
  return getMyTasksMock.mock.calls[0][0]
}

beforeEach(() => {
  getMyTasksMock.mockReset()
  getMyTasksMock.mockResolvedValue([])
})

describe('GET /api/tasks — alcance forzado en el servidor', () => {
  it('un asesor que pide ?user_id=<id ajeno> recibe SOLO lo suyo: la consulta sale con SU id', async () => {
    estado.role = 'asesor'
    estado.id = 'asesor-1'
    const res = await pedir(`?user_id=${AJENO}`)
    expect(res.status).toBe(200)
    expect(alcanceUsado()).toBe('asesor-1')
    expect(alcanceUsado()).not.toBe(AJENO)
  })

  it('un asesor sin parámetro también queda acotado a lo suyo (y ya no recibe el 400)', async () => {
    estado.role = 'asesor'
    estado.id = 'asesor-1'
    const res = await pedir('')
    expect(res.status).toBe(200)
    expect(alcanceUsado()).toBe('asesor-1')
  })

  it('el legacy agent (pipeline.view_own) también queda acotado', async () => {
    estado.role = 'agent'
    estado.id = 'agente-legacy'
    await pedir(`?user_id=${AJENO}`)
    expect(alcanceUsado()).toBe('agente-legacy')
  })

  it.each(['admin', 'dueno', 'coordinador'])(
    'a un %s le sigue funcionando el filtro por usuario',
    async (role) => {
      estado.role = role
      estado.id = 'jefe-1'
      const res = await pedir(`?user_id=${AJENO}`)
      expect(res.status).toBe(200)
      expect(alcanceUsado()).toBe(AJENO)
    },
  )

  it.each(['admin', 'dueno', 'coordinador'])(
    'un %s que consulta su propia bandeja la sigue viendo (la pantalla manda su id)',
    async (role) => {
      estado.role = role
      estado.id = 'jefe-1'
      await pedir('?user_id=jefe-1')
      expect(alcanceUsado()).toBe('jefe-1')
    },
  )

  it.each(['admin', 'dueno', 'coordinador'])(
    'un %s sin user_id conserva el 400 de siempre (ve todo, pero la consulta necesita un id)',
    async (role) => {
      estado.role = role
      estado.id = 'jefe-1'
      const res = await pedir('')
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Missing user_id' })
      expect(getMyTasksMock).not.toHaveBeenCalled()
    },
  )

  it('el ABOGADO queda acotado a sus propias tareas: su pantalla de Pendientes pide su id y sigue funcionando', async () => {
    // El abogado no es `is_operations_user()` en la base ni tiene ningún permiso
    // de pipeline acá. Su pantalla (`/tasks`) manda `?user_id=<el propio>`, así
    // que forzarlo a su id devuelve exactamente lo mismo que antes.
    estado.role = 'abogado'
    estado.id = 'abogado-1'
    const res = await pedir('?user_id=abogado-1')
    expect(res.status).toBe(200)
    expect(alcanceUsado()).toBe('abogado-1')
  })

  it('el abogado tampoco puede espiar la agenda de otro', async () => {
    estado.role = 'abogado'
    estado.id = 'abogado-1'
    await pedir(`?user_id=${AJENO}`)
    expect(alcanceUsado()).toBe('abogado-1')
  })

  it('un viewer (sin ningún permiso) queda acotado — fail-closed', async () => {
    estado.role = 'viewer'
    estado.id = 'sin-crm-1'
    await pedir(`?user_id=${AJENO}`)
    expect(alcanceUsado()).toBe('sin-crm-1')
  })

  it('un rol fuera del catálogo de permisos queda acotado, no ensanchado', async () => {
    estado.role = 'rol-inventado'
    estado.id = 'raro-1'
    await pedir(`?user_id=${AJENO}`)
    expect(alcanceUsado()).toBe('raro-1')
  })

  it('el filtro por status sigue viajando igual y la respuesta conserva su forma', async () => {
    estado.role = 'asesor'
    estado.id = 'asesor-1'
    getMyTasksMock.mockResolvedValue([{ id: 't1', title: 'Llamar a Ana' }])
    const res = await pedir('?user_id=asesor-1&status=completed')
    expect(getMyTasksMock.mock.calls[0][1]).toBe('completed')
    const body = await res.json()
    expect(Object.keys(body)).toEqual(['data'])
    expect(body.data).toEqual([{ id: 't1', title: 'Llamar a Ana' }])
  })

  it('sin status, se sigue delegando el default a getMyTasks (undefined, no un valor inventado)', async () => {
    estado.role = 'asesor'
    estado.id = 'asesor-1'
    await pedir('?user_id=asesor-1')
    expect(getMyTasksMock.mock.calls[0][1]).toBeUndefined()
  })
})
