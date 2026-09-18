/**
 * Proceso creado a mano (tasación o captación que el asesor carga después de
 * hacer el trabajo).
 *
 * Lo que fija este test es lo que salió mal en producción: el proceso se creaba
 * desde el navegador sin asesor, con la dirección como cliente, en la etapa
 * equivocada y mandando un email falso de "Tasación agendada".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, createDealMock, contactoMock, notificarMock } = vi.hoisted(() => ({
  estado: { role: 'admin' as string, id: 'yo-1' },
  createDealMock: vi.fn(),
  contactoMock: vi.fn(),
  notificarMock: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({ id: estado.id, email: 'x@y.com', profile: { id: estado.id, role: estado.role } })),
  requirePermission: vi.fn(async () => ({ id: estado.id, email: 'x@y.com', profile: { id: estado.id, role: estado.role } })),
}))
vi.mock('@/lib/supabase/deals', () => ({ createDeal: createDealMock }))
vi.mock('@/lib/supabase/contactos', () => ({ encontrarOCrearContacto: contactoMock }))
vi.mock('@/lib/email/notifications/deal-created', () => ({ notifyDealCreated: notificarMock }))
vi.mock('@/lib/email/notify-with-escalation', () => ({ notifyWithEscalation: notificarMock }))

import { POST } from './route'

const cliente = {
  nombre: 'Marta Gómez',
  telefono: '+54 9 11 5555-4444',
  email: 'marta@example.com',
  origen: 'referido',
  asesorId: 'asesor-diego',
  direccion: 'Av. Belgrano 1500',
  tipo: 'departamento',
  barrio: 'Monserrat',
  ambientes: 2,
  fechaVisita: '2026-09-17',
}

function pedir(body: unknown) {
  return POST(new Request('http://local/api/deals/manual', { method: 'POST', body: JSON.stringify(body) }) as never)
}

beforeEach(() => {
  createDealMock.mockReset().mockResolvedValue('deal-nuevo')
  contactoMock.mockReset().mockResolvedValue('contacto-1')
  notificarMock.mockReset()
  estado.role = 'admin'
  estado.id = 'yo-1'
})

describe('POST /api/deals/manual', () => {
  it('crea el proceso de una tasación manual en Coordinada, con su fecha, cliente y asesor', async () => {
    const res = await pedir({ motivo: 'tasacion', cliente })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ dealId: 'deal-nuevo' })

    const arg = createDealMock.mock.calls[0][0]
    expect(arg.stage).toBe('scheduled')
    expect(arg.scheduled_date).toBe('2026-09-17')
    expect(arg.assigned_to).toBe('asesor-diego')
    expect(arg.origin).toBe('referido')
    expect(arg.contact_id).toBe('contacto-1')
    expect(arg.property_address).toBe('Av. Belgrano 1500')
    expect(arg.created_by).toBe('yo-1')
    // El contacto se guarda con el NOMBRE del propietario, no con la dirección.
    expect(contactoMock.mock.calls[0][0]).toMatchObject({ nombre: 'Marta Gómez', telefono: '+54 9 11 5555-4444' })
  })

  it('una captación manual nace Captada', async () => {
    await pedir({ motivo: 'captacion', cliente })
    expect(createDealMock.mock.calls[0][0].stage).toBe('captured')
  })

  it('NUNCA manda el email de "Tasación agendada"', async () => {
    await pedir({ motivo: 'tasacion', cliente })
    expect(notificarMock).not.toHaveBeenCalled()
  })

  it('un asesor solo puede crear procesos para sí mismo', async () => {
    estado.role = 'asesor'
    estado.id = 'asesor-lucas'
    const res = await pedir({ motivo: 'tasacion', cliente: { ...cliente, asesorId: 'asesor-diego' } })
    expect(res.status).toBe(200)
    expect(createDealMock.mock.calls[0][0].assigned_to).toBe('asesor-lucas')
  })

  it('sin nombre, sin teléfono o con un origen inventado no crea nada y explica por qué', async () => {
    const res = await pedir({ motivo: 'tasacion', cliente: { ...cliente, nombre: '', telefono: '123', origen: 'contacto_directo' } })
    expect(res.status).toBe(400)
    const j = await res.json()
    expect(j.errores.length).toBeGreaterThanOrEqual(3)
    expect(createDealMock).not.toHaveBeenCalled()
    expect(contactoMock).not.toHaveBeenCalled()
  })

  it('sin email no crea nada: es obligatorio (decisión del dueño, 2026-09-18)', async () => {
    const res = await pedir({ motivo: 'tasacion', cliente: { ...cliente, email: '' } })
    expect(res.status).toBe(400)
    expect((await res.json()).errores).toContain('Falta el email.')
    expect(createDealMock).not.toHaveBeenCalled()
  })

  it('un motivo desconocido se trata como tasación, no rompe', async () => {
    const res = await pedir({ motivo: 'cualquiera', cliente })
    expect(res.status).toBe(200)
    expect(createDealMock.mock.calls[0][0].stage).toBe('scheduled')
  })

  it('si falla la base, responde error y no inventa un id', async () => {
    createDealMock.mockRejectedValueOnce(new Error('cayó la base'))
    const res = await pedir({ motivo: 'tasacion', cliente })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/cayó la base/)
  })
})
