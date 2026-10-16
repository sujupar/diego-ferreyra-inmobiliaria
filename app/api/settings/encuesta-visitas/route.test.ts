import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado, datosMock } = vi.hoisted(() => ({
  estado: { role: 'admin', logueado: true },
  datosMock: { leerAjustesEncuesta: vi.fn(), guardarAjustesEncuesta: vi.fn() },
}))
vi.mock('@/lib/auth/get-user', () => ({
  getUser: vi.fn(async () => estado.logueado ? { id: 'u1', email: 'a@b.c', profile: { id: 'u1', role: estado.role, is_active: true } } : null),
}))
vi.mock('@/lib/visitas/encuesta/datos', () => datosMock)
vi.mock('@/lib/integrations/whatsapp/core', () => ({ whatsappTestMode: () => true }))
vi.mock('@/lib/integrations/whatsapp/phone', () => ({
  normalizeWhatsappPhone: (v: string | null | undefined) => {
    const d = (v ?? '').replace(/\D/g, '')
    return d.length >= 10 ? `549${d.slice(-10)}` : null
  },
}))

import { GET, PATCH } from './route'

const AJUSTES = { envio_automatico: false, solo_con_regalo: true, regalo_por_whatsapp: false, telefonos_prueba: [] }
const patch = (body: unknown) => PATCH(new Request('http://local', { method: 'PATCH', body: JSON.stringify(body) }) as never)

beforeEach(() => {
  estado.role = 'admin'; estado.logueado = true
  datosMock.leerAjustesEncuesta.mockReset().mockResolvedValue(AJUSTES)
  datosMock.guardarAjustesEncuesta.mockReset().mockResolvedValue({ ...AJUSTES, envio_automatico: true })
  vi.stubEnv('WHATSAPP_TEMPLATE_ENCUESTA_VISITA', 'encuesta_visita_v1')
})

describe('/api/settings/encuesta-visitas', () => {
  it('admin y dueño leen ajustes, plantillas y el modo prueba de WhatsApp', async () => {
    for (const rol of ['admin', 'dueno']) {
      estado.role = rol
      const body = await (await GET()).json()
      expect(body.data.ajustes).toEqual(AJUSTES)
      expect(body.data.whatsappModoPrueba).toBe(true)
      expect(body.data.plantillas[0]).toMatchObject({ configurada: 'encuesta_visita_v1', conocida: true })
    }
  })
  it('coordinador, asesor y abogado: 403 sin tocar la base; sin sesión: 401', async () => {
    for (const rol of ['coordinador', 'asesor', 'abogado']) {
      estado.role = rol
      expect((await GET()).status).toBe(403)
      expect((await patch({ envio_automatico: true })).status).toBe(403)
    }
    expect(datosMock.leerAjustesEncuesta).not.toHaveBeenCalled()
    estado.logueado = false
    expect((await GET()).status).toBe(401)
  })
  it('PATCH guarda con el autor y devuelve lo que quedó', async () => {
    const body = await (await patch({ envio_automatico: true })).json()
    expect(datosMock.guardarAjustesEncuesta).toHaveBeenCalledWith({ envio_automatico: true }, 'u1')
    expect(body.data.ajustes.envio_automatico).toBe(true)
  })
  it('PATCH inválido: 400 con el motivo; ajustes ilegibles: 500 (no se inventan)', async () => {
    const res = await patch({ telefonos_prueba: ['123'] })
    expect([res.status, (await res.json()).error]).toEqual([400, 'Revisá estos teléfonos: 123'])
    datosMock.leerAjustesEncuesta.mockResolvedValue(null)
    expect((await GET()).status).toBe(500)
  })
})
