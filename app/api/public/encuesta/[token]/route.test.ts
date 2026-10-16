import { describe, it, expect, vi, beforeEach } from 'vitest'

const { datosMock } = vi.hoisted(() => ({
  datosMock: {
    leerEncuestaConVisita: vi.fn(), registrarUso: vi.fn(), guardarPaso: vi.fn(), completarEncuesta: vi.fn(), leerRegalo: vi.fn(),
  },
}))
vi.mock('@/lib/visitas/encuesta/datos', () => datosMock)
vi.mock('@/lib/integrations/whatsapp/phone', () => ({
  normalizeWhatsappPhone: (v: string | null | undefined) => {
    const d = (v ?? '').replace(/\D/g, '')
    return d.length >= 10 ? `549${d.slice(-10)}` : null
  },
}))

import { PATCH, POST } from './route'
import { encuestaConVisitaDePrueba, encuestaDePrueba, TOKEN_DE_PRUEBA, ENCUESTA_DE_PRUEBA } from '@/test/visitas/encuesta-de-prueba'

const ctx = (token = TOKEN_DE_PRUEBA) => ({ params: Promise.resolve({ token }) })
const patch = (body: unknown, token?: string) => PATCH(new Request('http://local', { method: 'PATCH', body: JSON.stringify(body) }) as never, ctx(token))
const post = (body: unknown, token?: string) => POST(new Request('http://local', { method: 'POST', body: JSON.stringify(body) }) as never, ctx(token))
const TODO = { liked: true, most_liked_tags: ['luz'], least_liked_tags: ['nada'], price_opinion: 'correcto' as const, offer_declined: true }
const REGALO = { propertyId: 'p', titulo: 'Guía de Caballito', archivoPath: 'x', archivoNombre: 'g.pdf', archivoBytes: 10, portadaPath: null, actualizadoEl: '' }

beforeEach(() => {
  Object.values(datosMock).forEach(m => m.mockReset())
  datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba())
  datosMock.registrarUso.mockResolvedValue(true)
  datosMock.guardarPaso.mockResolvedValue(true)
  datosMock.leerRegalo.mockResolvedValue(REGALO)
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-15T15:00:00Z'))
})

describe('PATCH (guardado pregunta a pregunta)', () => {
  it('un token inventado o con otra forma: 404 sin tocar la base', async () => {
    expect((await patch({ paso: 'gusto', valor: true }, 'x')).status).toBe(404)
    expect(datosMock.leerEncuestaConVisita).not.toHaveBeenCalled()
    datosMock.leerEncuestaConVisita.mockResolvedValue(null)
    expect((await patch({ paso: 'gusto', valor: true })).status).toBe(404)
  })
  it('cuerpo inválido: 400 sin tocar la base', async () => {
    expect((await patch({ paso: 'gusto', valor: 'si' })).status).toBe(400)
    expect(datosMock.leerEncuestaConVisita).not.toHaveBeenCalled()
  })
  it('una visita reabierta deja el link sin efecto (404)', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba({}, { status: 'scheduled' }))
    expect((await patch({ paso: 'gusto', valor: true })).status).toBe(404)
  })
  it('terminada: 409 COMPLETA; vencida: 410; tope: 429', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba({ completed_at: '2026-10-15T14:00:00Z' }))
    const r1 = await patch({ paso: 'gusto', valor: true })
    expect([r1.status, (await r1.json()).code]).toEqual([409, 'COMPLETA'])
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba({ expires_at: '2026-10-01T00:00:00Z' }))
    expect((await patch({ paso: 'gusto', valor: true })).status).toBe(410)
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba())
    datosMock.registrarUso.mockResolvedValue(false)
    expect((await patch({ paso: 'gusto', valor: true })).status).toBe(429)
    expect(datosMock.guardarPaso).not.toHaveBeenCalled()
  })
  it('"abierta" marca la apertura y no guarda respuestas', async () => {
    expect((await patch({ paso: 'abierta' })).status).toBe(200)
    expect(datosMock.registrarUso).toHaveBeenCalledWith(TOKEN_DE_PRUEBA, 'abierta')
    expect(datosMock.guardarPaso).not.toHaveBeenCalled()
  })
  it('guarda la respuesta del paso', async () => {
    expect((await patch({ paso: 'gusto', valor: true })).status).toBe(200)
    expect(datosMock.registrarUso).toHaveBeenCalledWith(TOKEN_DE_PRUEBA, 'escritura')
    expect(datosMock.guardarPaso).toHaveBeenCalledWith(ENCUESTA_DE_PRUEBA, { liked: true, last_step: 'gusto' }, expect.any(Date))
  })
  it('una opción que ESA propiedad no ofrece: 400 en castellano', async () => {
    const res = await patch({ paso: 'mas_gusto', etiquetas: ['vista'] })
    expect([res.status, (await res.json()).error]).toEqual([400, 'Elegí una de las opciones'])
  })
  it('si otro pedido la terminó en el medio: 409', async () => {
    datosMock.guardarPaso.mockResolvedValue(false)
    expect((await patch({ paso: 'gusto', valor: true })).status).toBe(409)
  })
})

describe('POST (final)', () => {
  beforeEach(() => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba(TODO))
    datosMock.completarEncuesta.mockResolvedValue(encuestaDePrueba({ ...TODO, completed_at: '2026-10-15T15:00:00Z' }))
  })
  it('honeypot lleno: éxito falso sin tocar la base', async () => {
    const res = await post({ similares: false, hp_campo_x: 'ACME' })
    expect(await res.json()).toEqual({ data: { completa: true, regalo: null } })
    expect(datosMock.leerEncuestaConVisita).not.toHaveBeenCalled()
  })
  it('si falta una respuesta: 409 con el paso al que hay que volver', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba({ liked: true }))
    const res = await post({ similares: false })
    expect([res.status, (await res.json()).paso]).toEqual([409, 'mas_gusto'])
  })
  it('termina con el WhatsApp de la visita y devuelve el regalo para descargar', async () => {
    const res = await post({ email: 'Ana@Mail.com', similares: true })
    expect(datosMock.completarEncuesta).toHaveBeenCalledWith(ENCUESTA_DE_PRUEBA,
      { contact_phone: '5491158234521', contact_email: 'ana@mail.com', wants_similar: true }, expect.any(Date))
    expect(await res.json()).toEqual({ data: { completa: true, regalo: { titulo: 'Guía de Caballito', descarga: `/api/public/encuesta/${TOKEN_DE_PRUEBA}/regalo` } } })
  })
  it('doble toque: el segundo no completa de nuevo y recibe el mismo éxito', async () => {
    datosMock.completarEncuesta.mockResolvedValue(null)
    datosMock.leerEncuestaConVisita
      .mockResolvedValueOnce(encuestaConVisitaDePrueba(TODO))
      .mockResolvedValueOnce(encuestaConVisitaDePrueba({ ...TODO, completed_at: '2026-10-15T15:00:00Z' }))
    const res = await post({ similares: false })
    expect(res.status).toBe(200)
    expect((await res.json()).data.completa).toBe(true)
  })
  it('ya terminada: éxito sin volver a completar', async () => {
    datosMock.leerEncuestaConVisita.mockResolvedValue(encuestaConVisitaDePrueba({ ...TODO, completed_at: '2026-10-15T14:00:00Z' }))
    expect((await post({ similares: false })).status).toBe(200)
    expect(datosMock.completarEncuesta).not.toHaveBeenCalled()
  })
  it('un WhatsApp nuevo mal escrito: 400', async () => {
    const res = await post({ telefono: '123', similares: false })
    expect([res.status, (await res.json()).error]).toEqual([400, 'Revisá tu WhatsApp: no parece un número válido'])
  })
  it('sin regalo en la propiedad: completa sin regalo', async () => {
    datosMock.leerRegalo.mockResolvedValue(null)
    expect((await (await post({ similares: false })).json()).data.regalo).toBeNull()
  })
})
