/**
 * /api/contacts/[id]/video-bienvenida — copiar o crear el enlace del video desde la ficha
 * (tasacion-video-bienvenida, D8). Crear NUNCA manda mensajes: Paula lo manda a mano.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({
  estado: { role: 'coordinador' as string, id: 'coord-1' },
  canAccessContact: vi.fn(),
  leerEnlacePorContacto: vi.fn(),
  datosParaCrearEnlace: vi.fn(),
  obtenerOCrearEnlace: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => ({
    id: m.estado.id,
    email: 'x@ejemplo.com',
    profile: { id: m.estado.id, role: m.estado.role, full_name: 'Paula', is_active: true },
  })),
}))
vi.mock('@/lib/auth/entity-access', () => ({ canAccessContact: m.canAccessContact }))
vi.mock('@/lib/video-bienvenida/enlaces', () => ({
  leerEnlacePorContacto: m.leerEnlacePorContacto,
  datosParaCrearEnlace: m.datosParaCrearEnlace,
  obtenerOCrearEnlace: m.obtenerOCrearEnlace,
}))
const envios = vi.hoisted(() => ({ whatsapp: vi.fn() }))
vi.mock('@/lib/integrations/whatsapp/core', () => ({ sendWhatsappTemplate: envios.whatsapp }))

import { GET, POST } from './route'

const ID = '0000000c-0000-4000-8000-000000000001'
const ENLACE = { codigo: 'k7Hq2mXb9T', url: 'https://inmodf.com.ar/t/k7Hq2mXb9T' }
const ctx = (id = ID) => ({ params: Promise.resolve({ id }) })
const req = (metodo: string, id = ID) => new Request(`http://local/api/contacts/${id}/video-bienvenida`, { method: metodo }) as never

beforeEach(() => {
  m.estado.role = 'coordinador'
  m.estado.id = 'coord-1'
  m.canAccessContact.mockReset().mockResolvedValue(true)
  m.leerEnlacePorContacto.mockReset().mockResolvedValue(null)
  m.datosParaCrearEnlace.mockReset().mockResolvedValue({ dealId: 'd-1', nombre: 'Mario' })
  m.obtenerOCrearEnlace.mockReset().mockResolvedValue(ENLACE)
  envios.whatsapp.mockReset()
})

describe('GET: qué muestra la ficha', () => {
  it('con enlace, devuelve la URL para copiar', async () => {
    m.leerEnlacePorContacto.mockResolvedValue(ENLACE)
    const r = await GET(req('GET'), ctx())
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ enlace: ENLACE, puedeCrear: false })
  })

  it('sin enlace y con proceso del embudo, ofrece crearlo', async () => {
    const r = await GET(req('GET'), ctx())
    expect(await r.json()).toEqual({ enlace: null, puedeCrear: true })
  })

  it('sin proceso del embudo, no ofrece nada', async () => {
    m.datosParaCrearEnlace.mockResolvedValue(null)
    const r = await GET(req('GET'), ctx())
    expect(await r.json()).toEqual({ enlace: null, puedeCrear: false })
  })

  it('un contacto ajeno responde 404, igual que uno inexistente', async () => {
    m.estado.role = 'asesor'
    m.canAccessContact.mockResolvedValue(false)
    const r = await GET(req('GET'), ctx())
    expect(r.status).toBe(404)
  })
})

describe('POST: crear el enlace sin mandar nada', () => {
  it('crea (o reusa) el enlace como manual, a nombre de quien lo pidió, y no manda WhatsApp', async () => {
    const r = await POST(req('POST'), ctx())
    expect(r.status).toBe(200)
    expect(await r.json()).toEqual({ enlace: ENLACE })
    expect(m.obtenerOCrearEnlace).toHaveBeenCalledWith({ contactId: ID, dealId: 'd-1', nombre: 'Mario', origen: 'manual', creadoPor: 'coord-1' })
    expect(envios.whatsapp).not.toHaveBeenCalled()
  })

  it('el abogado recibe 403 y no se crea nada', async () => {
    m.estado.role = 'abogado'
    const r = await POST(req('POST'), ctx())
    expect(r.status).toBe(403)
    expect(m.obtenerOCrearEnlace).not.toHaveBeenCalled()
  })

  it('sin proceso del embudo: 400 y no se crea nada', async () => {
    m.datosParaCrearEnlace.mockResolvedValue(null)
    const r = await POST(req('POST'), ctx())
    expect(r.status).toBe(400)
    expect(m.obtenerOCrearEnlace).not.toHaveBeenCalled()
  })

  it('un id que no es uuid es 404', async () => {
    const r = await POST(req('POST', 'pepe'), ctx('pepe'))
    expect(r.status).toBe(404)
  })

  it('si la base no crea el enlace, 500 con un mensaje que se entiende', async () => {
    m.obtenerOCrearEnlace.mockResolvedValue(null)
    const r = await POST(req('POST'), ctx())
    expect(r.status).toBe(500)
    expect((await r.json()).error).toMatch(/No se pudo crear el enlace/)
  })
})
