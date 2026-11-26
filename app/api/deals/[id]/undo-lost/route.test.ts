/**
 * POST /api/deals/[id]/undo-lost (crm-ficha-y-llamadas, tarea 8.5; design.md D9).
 * Deshace un "perdido" recién marcado sin pasar por `advance`: `advance` deja `lost_at`
 * cargado (el embudo lo seguiría contando como perdido) y puede pedir datos del cliente.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({
  usuario: { id: 'coord-1', email: 'c@x.com', profile: { id: 'coord-1', role: 'coordinador' as string } },
  proceso: null as { id: string; stage: string; lost_at: string | null; assigned_to: string | null } | null,
  ultimo: null as { from_stage: string | null; to_stage: string; changed_at: string } | null,
  cambia: true,
  leerProcesoParaDeshacer: vi.fn(),
  ultimoCambioDeEtapa: vi.fn(),
  deshacerPerdido: vi.fn(),
  syncMailchimpBestEffort: vi.fn(),
  leerDatosDelProceso: vi.fn(),
}))

vi.mock('@/lib/auth/require-role', () => ({
  requireAuth: vi.fn(async () => m.usuario),
  // No se usa: redirige (un 200 para el fetch). Si la ruta lo llamara, el test lo nota.
  requirePermission: vi.fn(async () => {
    throw new Error('undo-lost no tiene que usar requirePermission')
  }),
}))
vi.mock('@/lib/supabase/deals', () => ({
  leerProcesoParaDeshacer: m.leerProcesoParaDeshacer,
  ultimoCambioDeEtapa: m.ultimoCambioDeEtapa,
  deshacerPerdido: m.deshacerPerdido,
  syncMailchimpBestEffort: m.syncMailchimpBestEffort,
}))
vi.mock('@/lib/deals/datos-cliente', () => ({ leerDatosDelProceso: m.leerDatosDelProceso }))

import { POST } from './route'

const hace = (minutos: number) => new Date(Date.now() - minutos * 60_000).toISOString()
const post = (id = 'd-1') =>
  POST(new Request(`http://local/api/deals/${id}/undo-lost`, { method: 'POST' }) as never, { params: Promise.resolve({ id }) })
const como = (role: string, id: string) => {
  m.usuario = { id, email: `${id}@x.com`, profile: { id, role } }
}

beforeEach(() => {
  vi.clearAllMocks()
  como('coordinador', 'coord-1')
  const cuando = hace(2)
  m.proceso = { id: 'd-1', stage: 'lost', lost_at: cuando, assigned_to: 'asesor-1' }
  m.ultimo = { from_stage: 'request', to_stage: 'lost', changed_at: cuando }
  m.cambia = true
  m.leerProcesoParaDeshacer.mockImplementation(async () => m.proceso)
  m.ultimoCambioDeEtapa.mockImplementation(async () => m.ultimo)
  m.deshacerPerdido.mockImplementation(async () => m.cambia)
  m.syncMailchimpBestEffort.mockResolvedValue(undefined)
  m.leerDatosDelProceso.mockResolvedValue({ stage: 'lost', faltan: ['email', 'teléfono'] })
})

describe('POST /api/deals/[id]/undo-lost', () => {
  it('recién marcado → vuelve la etapa, limpia lost_at y sincroniza Mailchimp una sola vez', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, stage: 'request' })
    expect(m.deshacerPerdido).toHaveBeenCalledWith('d-1', { volverA: 'request', limpiarLostAt: true })
    expect(m.syncMailchimpBestEffort).toHaveBeenCalledTimes(1)
    expect(m.syncMailchimpBestEffort).toHaveBeenCalledWith('d-1')
  })

  it('a una solicitud a la que le faltan datos no le pide completarlos', async () => {
    const res = await post()
    expect(res.status).toBe(200)
    expect(m.leerDatosDelProceso).not.toHaveBeenCalled()
  })

  it('un lost_at viejo (de otro descarte) no se limpia', async () => {
    m.proceso = { ...m.proceso!, lost_at: hace(60 * 24 * 30) }
    await post()
    expect(m.deshacerPerdido).toHaveBeenCalledWith('d-1', { volverA: 'request', limpiarLostAt: false })
  })

  it('fuera de tiempo (hace 11 minutos) → 409, sin update y sin Mailchimp', async () => {
    const cuando = hace(11)
    m.proceso = { ...m.proceso!, lost_at: cuando }
    m.ultimo = { ...m.ultimo!, changed_at: cuando }
    const res = await post()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/Ya no se puede deshacer/)
    expect(m.deshacerPerdido).not.toHaveBeenCalled()
    expect(m.syncMailchimpBestEffort).not.toHaveBeenCalled()
  })

  it('proceso que no está en lost → 409, sin update y sin Mailchimp', async () => {
    m.proceso = { ...m.proceso!, stage: 'request' }
    const res = await post()
    expect(res.status).toBe(409)
    expect(m.deshacerPerdido).not.toHaveBeenCalled()
    expect(m.syncMailchimpBestEffort).not.toHaveBeenCalled()
  })

  it('la carrera: el update no cambia ninguna fila → 409 sin Mailchimp', async () => {
    m.cambia = false
    const res = await post()
    expect(res.status).toBe(409)
    expect(m.syncMailchimpBestEffort).not.toHaveBeenCalled()
  })

  it('proceso inexistente → 404', async () => {
    m.proceso = null
    expect((await post()).status).toBe(404)
    expect(m.deshacerPerdido).not.toHaveBeenCalled()
  })

  it('asesor dueño del proceso → 200', async () => {
    como('asesor', 'asesor-1')
    expect((await post()).status).toBe(200)
  })

  it('asesor sobre un proceso ajeno → 404, sin leer el historial', async () => {
    como('asesor', 'asesor-2')
    const res = await post()
    expect(res.status).toBe(404)
    expect(m.ultimoCambioDeEtapa).not.toHaveBeenCalled()
    expect(m.deshacerPerdido).not.toHaveBeenCalled()
  })

  it('asesor sobre un proceso sin asesor → 404', async () => {
    como('asesor', 'asesor-1')
    m.proceso = { ...m.proceso!, assigned_to: null }
    expect((await post()).status).toBe(404)
  })

  it('rol viejo `agent` (tiene pipeline.advance) → 404', async () => {
    como('agent', 'agent-1')
    m.proceso = { ...m.proceso!, assigned_to: 'agent-1' }
    const res = await post()
    expect(res.status).toBe(404)
    expect(m.deshacerPerdido).not.toHaveBeenCalled()
  })

  it('abogado, sin pipeline.advance → 403 con { error } (no redirección ni 500)', async () => {
    como('abogado', 'abog-1')
    const res = await post()
    expect(res.status).toBe(403)
    const body = await res.json()
    expect(typeof body.error).toBe('string')
    expect(m.leerProcesoParaDeshacer).not.toHaveBeenCalled()
  })

  it('si la sincronización de Mailchimp falla, la respuesta sigue siendo 200', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.syncMailchimpBestEffort.mockRejectedValueOnce(new Error('caído'))
    expect((await post()).status).toBe(200)
    err.mockRestore()
  })

  it('falla la base → 500 legible', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    m.leerProcesoParaDeshacer.mockRejectedValueOnce(new Error('x'))
    const res = await post()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toMatch(/Probá de nuevo/)
    err.mockRestore()
  })
})
