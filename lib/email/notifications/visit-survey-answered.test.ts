import { describe, it, expect, vi, beforeEach } from 'vitest'

const { envio, receptores } = vi.hoisted(() => ({
  envio: vi.fn(),
  receptores: { getUserById: vi.fn(), getEmailsByRole: vi.fn(), getAdminsAndOwners: vi.fn() },
}))
vi.mock('@/lib/email/resend-client', () => ({ sendEmail: envio }))
vi.mock('@/lib/email/recipients', async () => {
  const real = await vi.importActual<typeof import('@/lib/email/recipients')>('@/lib/email/recipients')
  return { ...receptores, dedupEmails: real.dedupEmails, emailsOf: real.emailsOf }
})

import { notificarEncuestaRespondida, TECHO_POR_DESTINATARIO_MS } from './visit-survey-answered'
import type { RespuestasParaFicha } from '@/lib/visitas/encuesta/ficha'

const RESPUESTAS: RespuestasParaFicha = {
  completa: true, leGusto: true, masGusto: ['La luz'], menosGusto: ['Nada en especial'], precio: 'Le parece alto',
  oferta: 'US$ 135.000', quiereSimilares: true, telefono: '5491158234521', email: null,
}
const DATOS = { visitaId: 'v1', asesorId: 'a1', direccion: 'Doblas 248', persona: 'Mariana Gómez', scheduledAt: '2026-10-14T13:30:00Z', respuestas: RESPUESTAS }

beforeEach(() => {
  envio.mockReset().mockResolvedValue({ ok: true, sent: 3, skipped: 0, failed: 0, errors: [] })
  receptores.getUserById.mockReset().mockResolvedValue({ id: 'a1', email: 'lucas@inmodf.com.ar', full_name: 'Lucas', role: 'asesor' })
  receptores.getEmailsByRole.mockReset().mockResolvedValue(['coordi@inmodf.com.ar', 'LUCAS@inmodf.com.ar'])
  receptores.getAdminsAndOwners.mockReset().mockResolvedValue([{ id: 'd', email: 'diego@inmodf.com.ar', full_name: 'Diego', role: 'dueno' }])
})

describe('notificarEncuestaRespondida', () => {
  it('asesor + coordinadores + admins/dueños, sin repetidos, con techo de 3 s por destinatario', async () => {
    await notificarEncuestaRespondida(DATOS)
    expect(receptores.getEmailsByRole).toHaveBeenCalledWith('coordinador')
    const pedido = envio.mock.calls[0][0]
    expect(pedido.to).toEqual(['lucas@inmodf.com.ar', 'coordi@inmodf.com.ar', 'diego@inmodf.com.ar'])
    expect(pedido).toMatchObject({ notificationType: 'visit_survey_answered', entityId: 'v1', idempotent: true, timeoutMs: TECHO_POR_DESTINATARIO_MS })
    expect(pedido.subject).toBe('Respondieron la encuesta: Doblas 248')
    expect(pedido.html).toContain('https://inmodf.com.ar/visits/v1')
  })
  it('sin nadie activo: null (el aviso no corresponde, no es un error)', async () => {
    receptores.getUserById.mockResolvedValue(null); receptores.getEmailsByRole.mockResolvedValue([]); receptores.getAdminsAndOwners.mockResolvedValue([])
    expect(await notificarEncuestaRespondida(DATOS)).toBeNull()
    expect(envio).not.toHaveBeenCalled()
  })
  it('lo que escribió la persona viaja como TEXTO (escapado)', async () => {
    await notificarEncuestaRespondida({ ...DATOS, persona: '<script>alert(1)</script>', respuestas: { ...RESPUESTAS, masGusto: ['Otra: <b>todo</b>'] } })
    const html: string = envio.mock.calls[0][0].html
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).not.toContain('<b>todo</b>')
  })
  it('las respuestas van en palabras (las mismas filas que la ficha)', async () => {
    await notificarEncuestaRespondida(DATOS)
    const html: string = envio.mock.calls[0][0].html
    expect(html).toContain('Le parece alto')
    expect(html).toContain('US$ 135.000')
  })
})
