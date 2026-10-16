import { describe, it, expect, vi, beforeEach } from 'vitest'

const { envio } = vi.hoisted(() => ({ envio: vi.fn() }))
vi.mock('@/lib/email/resend-client', () => ({ sendEmail: envio }))

import { enviarRegaloPorEmail } from './visit-survey-gift'

beforeEach(() => { envio.mockReset().mockResolvedValue({ ok: true, sent: 1, skipped: 0, failed: 0, errors: [] }) })

describe('enviarRegaloPorEmail', () => {
  it('a la persona, una sola vez por encuesta, con el link de descarga', async () => {
    await enviarRegaloPorEmail({ encuestaId: 'e1', email: 'ana@mail.com', nombre: 'Ana', direccion: 'Doblas 248', titulo: 'Guía de Caballito', urlDescarga: 'https://inmodf.com.ar/api/public/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y/regalo' })
    const pedido = envio.mock.calls[0][0]
    expect(pedido).toMatchObject({ notificationType: 'visit_survey_gift_client', entityId: 'e1', to: 'ana@mail.com', subject: 'Tu material de Doblas 248' })
    expect(pedido.idempotent).not.toBe(false)
    expect(pedido.html).toContain('https://inmodf.com.ar/api/public/encuesta/Ab3xK9pQ2rTz8LmN4vWq1Y/regalo')
    expect(pedido.html).toContain('Guía de Caballito')
  })
})
