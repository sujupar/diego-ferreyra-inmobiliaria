import { describe, it, expect, vi, beforeEach } from 'vitest'

const { enviados, resultado } = vi.hoisted(() => ({
  enviados: [] as Array<Record<string, unknown>>,
  resultado: { ok: true, sent: 1, skipped: 0, failed: 0, errors: [] as string[] },
}))
vi.mock('@/lib/email/resend-client', () => ({
  sendEmail: vi.fn(async (input: Record<string, unknown>) => { enviados.push(input); return resultado }),
}))
// El componente del email devuelve sus props: así la prueba ve exactamente qué se le pasó.
vi.mock('@/emails/VisitReminderAdvisorEmail', () => ({ default: (p: unknown) => p }))
vi.mock('@/lib/email/render', () => ({ renderEmail: vi.fn(async (p: unknown) => JSON.stringify(p)) }))

import { enviarRecordatorioDeVisita } from './visit-reminder-advisor'

const datos = {
  visitaId: '66666666-6666-4666-8666-666666666666', scheduledAt: '2099-01-12T14:00:00Z', cliente: 'Sofía Benítez',
  direccion: 'Doblas 248', asesor: { nombre: 'Lucas', email: 'lucas@inmodf.com.ar' },
}

beforeEach(() => { enviados.length = 0; vi.unstubAllEnvs() })

describe('enviarRecordatorioDeVisita', () => {
  it('hora ARGENTINA, link a la ficha en inmodf.com.ar, asunto con la dirección', async () => {
    const r = await enviarRecordatorioDeVisita(datos)
    expect(r).toEqual(resultado)
    const e = enviados[0]
    expect(e).toMatchObject({ notificationType: 'visit_reminder_advisor', entityId: datos.visitaId, to: 'lucas@inmodf.com.ar',
      subject: '¿Se realizó la visita? Doblas 248', idempotent: false })
    const props = JSON.parse(String(e.html))
    expect(props).toEqual({ advisorName: 'Lucas', propertyAddress: 'Doblas 248', clientName: 'Sofía Benítez',
      scheduledAt: 'lunes 12 de enero, 11:00', visitUrl: `https://inmodf.com.ar/visits/${datos.visitaId}` })
  })
  it('respeta NEXT_PUBLIC_APP_URL (sin barra final)', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://deploy-preview-50--inmobiliariadiegoferreyra.netlify.app/')
    await enviarRecordatorioDeVisita(datos)
    expect(JSON.parse(String(enviados[0].html)).visitUrl).toBe(`https://deploy-preview-50--inmobiliariadiegoferreyra.netlify.app/visits/${datos.visitaId}`)
  })
  it('sin dirección no queda un asunto cortado', async () => {
    await enviarRecordatorioDeVisita({ ...datos, direccion: null })
    expect(enviados[0].subject).toBe('¿Se realizó la visita? la propiedad')
  })
})
