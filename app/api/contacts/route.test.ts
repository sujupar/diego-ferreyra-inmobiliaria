/**
 * Alcance server-side del listado de contactos.
 *
 * Misma historia que en deals, con PII más cruda todavía: `getContacts` lee con
 * el cliente service-role (RLS no aplica) y el "ver solo mis contactos" vivía
 * únicamente en la pantalla. Un asesor logueado pedía
 * `fetch('/api/contacts?assigned_to=<id ajeno>')` y se llevaba la agenda de otro.
 *
 * EL test es el primero: importa con QUÉ id sale la consulta, no el status.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, getContactsMock } = vi.hoisted(() => ({
  estado: { role: 'admin' as string, id: 'yo-1' },
  getContactsMock: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({
    id: estado.id,
    email: 'quien@ejemplo.com',
    profile: { id: estado.id, role: estado.role },
  })),
}))

vi.mock('@/lib/supabase/contacts', () => ({
  getContacts: getContactsMock,
  createContact: vi.fn(),
}))

import { GET } from './route'

const AJENO = 'otro-asesor-9'

function pedir(qs: string) {
  return GET(new Request(`http://local/api/contacts${qs}`) as never)
}

function alcanceUsado(): string | undefined {
  expect(getContactsMock).toHaveBeenCalledTimes(1)
  return getContactsMock.mock.calls[0][0].assigned_to
}

beforeEach(() => {
  getContactsMock.mockReset()
  getContactsMock.mockResolvedValue([])
})

describe('GET /api/contacts — alcance forzado en el servidor', () => {
  it('un asesor que pide ?assigned_to=<id ajeno> recibe SOLO lo suyo: la consulta sale con SU id', async () => {
    estado.role = 'asesor'
    estado.id = 'asesor-1'
    const res = await pedir(`?assigned_to=${AJENO}`)
    expect(res.status).toBe(200)
    expect(alcanceUsado()).toBe('asesor-1')
    expect(alcanceUsado()).not.toBe(AJENO)
  })

  it('un asesor sin parámetro también queda acotado a lo suyo', async () => {
    estado.role = 'asesor'
    estado.id = 'asesor-1'
    await pedir('')
    expect(alcanceUsado()).toBe('asesor-1')
  })

  it('el legacy agent (pipeline.view_own) también queda acotado', async () => {
    estado.role = 'agent'
    estado.id = 'agente-legacy'
    await pedir(`?assigned_to=${AJENO}`)
    expect(alcanceUsado()).toBe('agente-legacy')
  })

  it.each(['admin', 'dueno', 'coordinador'])(
    'un %s sigue viendo todo cuando no filtra',
    async (role) => {
      estado.role = role
      estado.id = 'jefe-1'
      await pedir('')
      expect(alcanceUsado()).toBeUndefined()
    },
  )

  it.each(['admin', 'dueno', 'coordinador'])(
    'a un %s le sigue funcionando el filtro por asesor',
    async (role) => {
      estado.role = role
      estado.id = 'jefe-1'
      await pedir(`?assigned_to=${AJENO}`)
      expect(alcanceUsado()).toBe(AJENO)
    },
  )

  it.each(['abogado', 'viewer'])(
    'un %s queda acotado a su propio id (fail-closed: no tiene ninguno de los dos permisos)',
    async (role) => {
      estado.role = role
      estado.id = 'sin-crm-1'
      await pedir(`?assigned_to=${AJENO}`)
      expect(alcanceUsado()).toBe('sin-crm-1')
    },
  )

  it('los demás filtros siguen viajando igual y la respuesta conserva su forma', async () => {
    estado.role = 'admin'
    getContactsMock.mockResolvedValue([{ id: 'c1', full_name: 'Ana' }])
    const res = await pedir('?origin=embudo&from=2026-01-01&to=2026-01-31')
    expect(getContactsMock.mock.calls[0][0]).toMatchObject({
      origin: 'embudo',
      from: '2026-01-01',
      to: '2026-01-31',
    })
    const body = await res.json()
    expect(Object.keys(body)).toEqual(['data'])
    expect(body.data).toEqual([{ id: 'c1', full_name: 'Ana' }])
  })
})
