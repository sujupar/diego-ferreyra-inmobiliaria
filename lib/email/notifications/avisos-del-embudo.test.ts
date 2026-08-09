/**
 * A4 — los dos avisos del embudo tienen que DEVOLVER el resultado del envío.
 *
 * `sendEmail` no tira nunca: devuelve `{ok,sent,failed,errors}` y sigue. Mientras
 * estas dos funciones lo ignoraron, un vencimiento de Resend —el incidente del
 * 2026-08-08 que originó la cola— era indistinguible de un envío perfecto: el
 * trabajo `notify` terminaba en 'done', no se reintentaba, no escalaba, y la
 * tabla afirmaba que el equipo estaba avisado.
 *
 * Lo que se protege acá es el ESLABÓN: que el resultado llegue de `sendEmail` a
 * quien llama. Que el handler tire con ese resultado se prueba en
 * `lib/funnel/side-effect-handlers.test.ts`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))

const espias = vi.hoisted(() => ({
  enviados: [] as Array<Record<string, unknown>>,
  resultado: { ok: true, sent: 2, skipped: 0, failed: 0, errors: [] as string[] },
  deal: null as Record<string, unknown> | null,
  adminsOwners: [{ id: 'u1', email: 'admin@ejemplo.com', full_name: 'Admin', role: 'admin' }] as Array<Record<string, unknown>>,
}))

vi.mock('../resend-client', () => ({
  sendEmail: async (input: Record<string, unknown>) => {
    espias.enviados.push(input)
    return espias.resultado
  },
}))
vi.mock('../render', () => ({ renderEmail: async () => '<html></html>' }))
vi.mock('../test-mode', () => ({
  applyTestMode: async (to: string[], subject: string) => ({
    to, subject, testModeOn: false, originalTo: to,
  }),
}))
vi.mock('../recipients', () => ({
  getDealStakeholders: async () => ({
    asesor: null,
    coordinador: null,
    adminsOwners: espias.adminsOwners,
    contact: { id: 'c1', full_name: 'Ana Pérez', phone: null, email: 'ana@ejemplo.com' },
    dealRow: espias.deal,
  }),
  dedupEmails: (...listas: Array<Array<string | null | undefined>>) => {
    const vistos = new Set<string>()
    const salida: string[] = []
    for (const lista of listas) {
      for (const e of lista) {
        const k = (e ?? '').trim().toLowerCase()
        if (!k || vistos.has(k)) continue
        vistos.add(k)
        salida.push((e as string).trim())
      }
    }
    return salida
  },
  emailsOf: (us: Array<{ email: string }>) => us.map(u => u.email),
}))
vi.mock('@/emails/AppraisalRequestAdminsEmail', () => ({ AppraisalRequestAdminsEmail: () => ({}) }))
vi.mock('@/emails/ClassRegistrationAdminsEmail', () => ({ ClassRegistrationAdminsEmail: () => ({}) }))

import { notifyAppraisalRequest } from './appraisal-request'
import { notifyClassRegistration } from './class-registration'

const VENCIMIENTO = {
  ok: false, sent: 0, skipped: 0, failed: 2,
  errors: ['Tiempo de espera agotado: Resend no respondió en 8000 ms'],
}

beforeEach(() => {
  espias.enviados = []
  espias.resultado = { ok: true, sent: 2, skipped: 0, failed: 0, errors: [] }
  espias.adminsOwners = [{ id: 'u1', email: 'admin@ejemplo.com', full_name: 'Admin', role: 'admin' }]
  espias.deal = {
    id: 'deal-1',
    origin: 'embudo',
    property_address: 'Av. Siempreviva 742',
    notes: null,
    created_at: '2026-08-08T12:00:00.000Z',
  }
})

describe('notifyAppraisalRequest', () => {
  it('devuelve el resultado del envío cuando todo salió bien', async () => {
    const r = await notifyAppraisalRequest({ dealId: 'deal-1' })
    expect(r).toMatchObject({ ok: true, failed: 0 })
    expect(espias.enviados).toHaveLength(1)
  })

  it('un vencimiento de Resend LLEGA a quien llama en vez de perderse', async () => {
    espias.resultado = { ...VENCIMIENTO }
    const r = await notifyAppraisalRequest({ dealId: 'deal-1' })
    expect(r?.ok).toBe(false)
    expect(r?.failed).toBe(2)
    expect(r?.errors[0]).toContain('Tiempo de espera agotado')
  })

  it('sin deal legible devuelve null (nunca se intentó), no un resultado en verde', async () => {
    espias.deal = null
    expect(await notifyAppraisalRequest({ dealId: 'deal-1' })).toBeNull()
    expect(espias.enviados).toEqual([])
  })

  it('sin un solo destinatario activo devuelve null y no llama a Resend', async () => {
    espias.adminsOwners = []
    expect(await notifyAppraisalRequest({ dealId: 'deal-1' })).toBeNull()
    expect(espias.enviados).toEqual([])
  })

  it('sigue rechazando un deal que no es del embudo', async () => {
    espias.deal = { ...espias.deal, origin: 'referido' }
    await expect(notifyAppraisalRequest({ dealId: 'deal-1' })).rejects.toThrow('expected "embudo"')
  })
})

describe('notifyClassRegistration', () => {
  beforeEach(() => {
    espias.deal = { ...espias.deal, origin: 'clase_gratuita' }
  })

  it('devuelve el resultado del envío', async () => {
    const r = await notifyClassRegistration({ dealId: 'deal-2' })
    expect(r).toMatchObject({ ok: true, sent: 2 })
  })

  it('un vencimiento de Resend LLEGA a quien llama', async () => {
    espias.resultado = { ...VENCIMIENTO }
    const r = await notifyClassRegistration({ dealId: 'deal-2' })
    expect(r?.ok).toBe(false)
    expect(r?.failed).toBe(2)
  })

  it('sin destinatarios devuelve null', async () => {
    espias.adminsOwners = []
    expect(await notifyClassRegistration({ dealId: 'deal-2' })).toBeNull()
  })

  it('sigue rechazando un deal que no es de la clase gratuita', async () => {
    espias.deal = { ...espias.deal, origin: 'embudo' }
    await expect(notifyClassRegistration({ dealId: 'deal-2' })).rejects.toThrow('expected "clase_gratuita"')
  })
})
