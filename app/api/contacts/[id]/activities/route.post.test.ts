/**
 * POST /api/contacts/[id]/activities — notas (crm-ficha-y-llamadas, tarea 6.1).
 * Todo corre con service role: la ruta es la única barrera (design.md D4).
 * Llamadas y WhatsApp esperan a `aplicarCadencia` (tarea 6.2): hasta entonces la ruta
 * los rechaza con un error explícito y no guarda nada.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const TOKEN = '3f2b8c1e-4d5a-4b6c-9d7e-8f9a0b1c2d3e'

const m = vi.hoisted(() => ({
  estado: { role: 'coordinador' as string, id: 'coord-1', nombre: 'Cora Coordinadora' },
  canAccessContact: vi.fn(),
  leerProcesosDelContacto: vi.fn(),
  insertarActividad: vi.fn(),
  leerActividadPorToken: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({
    id: m.estado.id,
    email: 'x@ejemplo.com',
    profile: { id: m.estado.id, role: m.estado.role, full_name: m.estado.nombre, is_active: true },
  })),
}))
vi.mock('@/lib/auth/entity-access', () => ({ canAccessContact: m.canAccessContact }))
vi.mock('@/lib/supabase/actividades', () => ({
  leerProcesosDelContacto: m.leerProcesosDelContacto,
  insertarActividad: m.insertarActividad,
  leerActividadPorToken: m.leerActividadPorToken,
}))

import { POST } from './route'

const ctx = (id = 'c-1') => ({ params: Promise.resolve({ id }) })
const post = (body: unknown, id?: string) =>
  POST(
    new Request('http://local/api/contacts/c-1/activities', {
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }) as never,
    ctx(id),
  )
const como = (role: string, id = `${role}-1`) => {
  m.estado.role = role
  m.estado.id = id
}

const filaGuardada = (fila: Record<string, unknown>) => ({
  id: 'act-nueva',
  call_outcome: null,
  occurred_at: '2026-11-26T12:00:00.000Z',
  callback_at: null,
  created_at: '2026-11-26T12:00:00.000Z',
  updated_at: null,
  voided_at: null,
  voided_by: null,
  automatic: false,
  ...fila,
})

const SOLICITUD = { id: 'd-sol', stage: 'request', created_at: '2026-11-20T10:00:00Z', assigned_to: 'asesor-1', scheduled_date: null, origin: null }
const VIEJO_CERRADO = { id: 'd-viejo', stage: 'lost', created_at: '2026-11-25T10:00:00Z', assigned_to: null, scheduled_date: null, origin: null }

beforeEach(() => {
  vi.clearAllMocks()
  como('coordinador', 'coord-1')
  m.canAccessContact.mockResolvedValue(true)
  m.leerProcesosDelContacto.mockResolvedValue({ existe: true, procesos: [SOLICITUD, VIEJO_CERRADO] })
  m.insertarActividad.mockImplementation(async (fila: Record<string, unknown>) => ({ ok: true, fila: filaGuardada(fila) }))
  m.leerActividadPorToken.mockResolvedValue(null)
})

describe('POST /api/contacts/[id]/activities — notas', () => {
  it('nota válida → 201, ligada al proceso activo, con el usuario como autor y sin occurred_at', async () => {
    const res = await post({ kind: 'note', body: '  Prefiere que la llamen a la tarde  ', client_token: TOKEN })
    expect(res.status).toBe(201)
    const fila = m.insertarActividad.mock.calls[0][0]
    expect(fila).toEqual({
      contact_id: 'c-1',
      deal_id: 'd-sol',
      kind: 'note',
      body: 'Prefiere que la llamen a la tarde',
      created_by: 'coord-1',
      client_token: TOKEN,
    })
    const body = await res.json()
    expect(body.actividad).toMatchObject({
      id: 'act-nueva',
      titulo: 'Nota',
      intento: null,
      autor: { id: 'coord-1', nombre: 'Cora Coordinadora' },
      puede_editar: true,
      puede_anular: true,
    })
    expect(body.actividad).not.toHaveProperty('client_token')
    expect(body.cadencia).toBeNull()
    expect(body.pendiente).toBe(false)
  })

  it('nota vacía → 400 y no se guarda nada', async () => {
    const res = await post({ kind: 'note', body: '   ', client_token: TOKEN })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('Escribí la nota.')
    expect(m.insertarActividad).not.toHaveBeenCalled()
  })

  it('nota de 2.001 caracteres → 400 con el límite y no se guarda nada', async () => {
    const res = await post({ kind: 'note', body: 'a'.repeat(2001), client_token: TOKEN })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/2000/)
    expect(m.insertarActividad).not.toHaveBeenCalled()
  })

  it('nota de 2.000 caracteres justos → 201', async () => {
    const res = await post({ kind: 'note', body: 'a'.repeat(2000), client_token: TOKEN })
    expect(res.status).toBe(201)
  })

  it('cuerpo que no es JSON → 400', async () => {
    const res = await post('{no es json')
    expect(res.status).toBe(400)
    expect(m.insertarActividad).not.toHaveBeenCalled()
  })

  it('sin client_token → 400', async () => {
    const res = await post({ kind: 'note', body: 'Hola' })
    expect(res.status).toBe(400)
    expect(m.insertarActividad).not.toHaveBeenCalled()
  })

  it('autor forzado: un created_by, automatic u occurred_at del pedido no llegan al insert', async () => {
    const res = await post({
      kind: 'note',
      body: 'Hola',
      client_token: TOKEN,
      created_by: 'otro-usuario',
      automatic: true,
      occurred_at: '2020-01-01T00:00:00Z',
      deal_id: 'd-viejo',
    })
    expect(res.status).toBe(201)
    const fila = m.insertarActividad.mock.calls[0][0]
    expect(fila.created_by).toBe('coord-1')
    expect(fila.deal_id).toBe('d-sol')
    expect(fila).not.toHaveProperty('automatic')
    expect(fila).not.toHaveProperty('occurred_at')
  })

  it('sin proceso activo (todos cerrados) → se guarda con deal_id vacío', async () => {
    m.leerProcesosDelContacto.mockResolvedValue({ existe: true, procesos: [VIEJO_CERRADO] })
    const res = await post({ kind: 'note', body: 'Hola', client_token: TOKEN })
    expect(res.status).toBe(201)
    expect(m.insertarActividad.mock.calls[0][0].deal_id).toBeNull()
  })

  it('contacto sin procesos → se guarda con deal_id vacío', async () => {
    m.leerProcesosDelContacto.mockResolvedValue({ existe: true, procesos: [] })
    const res = await post({ kind: 'note', body: 'Hola', client_token: TOKEN })
    expect(res.status).toBe(201)
    expect(m.insertarActividad.mock.calls[0][0].deal_id).toBeNull()
  })

  it('abogado → 403 y no se guarda nada (sin leer el contacto)', async () => {
    como('abogado')
    const res = await post({ kind: 'note', body: 'Hola', client_token: TOKEN })
    expect(res.status).toBe(403)
    expect(m.insertarActividad).not.toHaveBeenCalled()
    expect(m.leerProcesosDelContacto).not.toHaveBeenCalled()
  })

  it('rol viejo `agent` → 403', async () => {
    como('agent')
    const res = await post({ kind: 'note', body: 'Hola', client_token: TOKEN })
    expect(res.status).toBe(403)
  })

  it('asesor ajeno → 404 con el mismo texto que un contacto inexistente', async () => {
    como('asesor')
    m.canAccessContact.mockResolvedValue(false)
    const res = await post({ kind: 'note', body: 'Hola', client_token: TOKEN })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No encontramos este contacto' })
    expect(m.insertarActividad).not.toHaveBeenCalled()
  })

  it('asesor con un proceso del contacto (canAccessContact da sí) → 201 con él como autor', async () => {
    como('asesor')
    const res = await post({ kind: 'note', body: 'Hola', client_token: TOKEN })
    expect(res.status).toBe(201)
    expect(m.canAccessContact).toHaveBeenCalled()
    expect(m.insertarActividad.mock.calls[0][0].created_by).toBe('asesor-1')
  })

  it('coordinadora sobre un contacto que no existe → 404', async () => {
    m.leerProcesosDelContacto.mockResolvedValue({ existe: false, procesos: [] })
    const res = await post({ kind: 'note', body: 'Hola', client_token: TOKEN })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'No encontramos este contacto' })
    expect(m.insertarActividad).not.toHaveBeenCalled()
  })

  it('falla el insert → 500 con el texto de siempre, sin el detalle', async () => {
    m.insertarActividad.mockRejectedValue(new Error('detalle interno de postgres'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await post({ kind: 'note', body: 'Hola', client_token: TOKEN })
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'No se pudo guardar. Probá de nuevo.' })
    expect(err).toHaveBeenCalled()
    err.mockRestore()
  })
})

describe('POST — client_token repetido en una nota', () => {
  it('mismo autor y contacto → 200 con la nota ya guardada, sin volver a insertar', async () => {
    m.insertarActividad.mockResolvedValue({ ok: false, motivo: 'token_repetido' })
    m.leerActividadPorToken.mockResolvedValue(
      filaGuardada({ id: 'act-vieja', contact_id: 'c-1', deal_id: 'd-sol', kind: 'note', body: 'Hola', created_by: 'coord-1', client_token: TOKEN }),
    )
    const res = await post({ kind: 'note', body: 'Hola', client_token: TOKEN })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.actividad.id).toBe('act-vieja')
    expect(body.cadencia).toBeNull()
    expect(body.pendiente).toBe(false)
  })

  it('token de otro autor → 409 sin datos del otro registro', async () => {
    m.insertarActividad.mockResolvedValue({ ok: false, motivo: 'token_repetido' })
    m.leerActividadPorToken.mockResolvedValue(
      filaGuardada({ id: 'act-ajena', contact_id: 'c-1', deal_id: null, kind: 'note', body: 'Secreto', created_by: 'otro', client_token: TOKEN }),
    )
    const res = await post({ kind: 'note', body: 'Hola', client_token: TOKEN })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'No se pudo guardar. Probá de nuevo.' })
  })

  it('token usado en otro contacto → 409 sin datos', async () => {
    m.insertarActividad.mockResolvedValue({ ok: false, motivo: 'token_repetido' })
    m.leerActividadPorToken.mockResolvedValue(
      filaGuardada({ id: 'act-ajena', contact_id: 'c-otro', deal_id: null, kind: 'note', body: 'Secreto', created_by: 'coord-1', client_token: TOKEN }),
    )
    const res = await post({ kind: 'note', body: 'Hola', client_token: TOKEN })
    expect(res.status).toBe(409)
    expect(JSON.stringify(await res.json())).not.toContain('Secreto')
  })
})

describe('POST — llamadas y WhatsApp todavía no (esperan a la cadencia, tarea 6.2)', () => {
  it('una llamada → 501 con un error explícito y no se guarda nada', async () => {
    const res = await post({ kind: 'call', call_outcome: 'no_atendio', client_token: TOKEN })
    expect(res.status).toBe(501)
    expect((await res.json()).error).toMatch(/todavía/i)
    expect(m.insertarActividad).not.toHaveBeenCalled()
  })

  it('un WhatsApp marcado → 501 y no se guarda nada', async () => {
    const res = await post({ kind: 'whatsapp_sent', client_token: TOKEN })
    expect(res.status).toBe(501)
    expect(m.insertarActividad).not.toHaveBeenCalled()
  })

  it('una llamada con resultado desconocido sigue siendo 400 (la validación va primero)', async () => {
    const res = await post({ kind: 'call', call_outcome: 'inventado', client_token: TOKEN })
    expect(res.status).toBe(400)
  })
})
