/**
 * Los dos mails de captación se renderizan de verdad (react-email) y se mira el
 * HTML que sale.
 *
 * Hasta 2026-08-09 estas piezas afirmaban en texto fijo que la documentación
 * estaba aprobada — era la única forma de llegar a una captación. Con la regla
 * nueva una propiedad se capta con fotos y sin papeles: sin este arreglo los
 * mails salían diciendo algo FALSO. Es el mismo error ya documentado con
 * "Solicitud de tasación" ≠ "Tasación agendada".
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { estado } = vi.hoisted(() => ({
  estado: {
    propertyRow: {} as Record<string, unknown>,
    enviados: [] as Array<{ notificationType: string; subject: string; html: string }>,
  },
}))

vi.mock('server-only', () => ({}))

vi.mock('../resend-client', () => ({
  sendEmail: vi.fn(async (args: { notificationType: string; subject: string; html: string }) => {
    estado.enviados.push(args)
  }),
}))

vi.mock('../test-mode', () => ({
  applyTestMode: vi.fn(async (to: string | string[], subject: string) => ({
    to: Array.isArray(to) ? to : [to], subject, testModeOn: false,
    originalTo: Array.isArray(to) ? to : [to],
  })),
}))

vi.mock('../recipients', async (importOriginal) => {
  const real = await importOriginal<typeof import('../recipients')>()
  return {
    ...real,
    getPropertyStakeholders: vi.fn(async () => ({
      asesor: { id: 'a1', email: 'asesor@x.com', full_name: 'Carla Gómez', role: 'asesor' },
      coordinador: { id: 'c1', email: 'coord@x.com', full_name: 'Coord', role: 'coordinador' },
      adminsOwners: [],
      lawyers: [],
      propertyRow: estado.propertyRow,
      linkedDeal: null,
    })),
    getUserById: vi.fn(async () => ({ id: 'l1', email: 'abogado@x.com', full_name: 'Dra. Suárez', role: 'abogado' })),
  }
})

import { notifyPropertyCaptured } from './property-captured'

function sembrarPropiedad(extra: Record<string, unknown> = {}) {
  estado.propertyRow = {
    id: 'p1', address: 'Rivadavia 4820', neighborhood: 'Caballito',
    property_type: 'departamento', asking_price: 180000, currency: 'USD',
    commission_percentage: 3, legal_status: 'pending', legal_reviewer_id: null,
    legal_reviewed_at: null, captured_at: '2026-08-09T12:00:00Z',
    updated_at: '2026-08-09T12:00:00Z', ...extra,
  }
}

const alAsesor = () => estado.enviados.find(e => e.notificationType === 'property_captured_advisor')!
const alEquipo = () => estado.enviados.find(e => e.notificationType === 'property_captured_admins')!

beforeEach(() => { estado.enviados = [] })

describe('notifyPropertyCaptured — SIN documentación aprobada', () => {
  beforeEach(async () => {
    sembrarPropiedad({ legal_status: 'pending' })
    await notifyPropertyCaptured('p1')
  })

  it('manda las dos piezas', () => {
    expect(estado.enviados).toHaveLength(2)
  })

  it('ninguna afirma que se aprobó la documentación', () => {
    for (const mail of estado.enviados) {
      expect(mail.html).not.toMatch(/documentación (legal )?(quedó )?aprobada/i)
      expect(mail.html).not.toMatch(/aprobó toda la documentación/i)
    }
  })

  it('dicen que la documentación está pendiente y que no bloquea', () => {
    expect(alAsesor().html).toMatch(/Pendiente \(no bloquea la captación\)/)
    expect(alEquipo().html).toMatch(/Pendiente \(no bloquea la captación\)/)
  })

  it('el asunto al equipo no dice "100%" y avisa que faltan papeles', () => {
    expect(alEquipo().subject).not.toContain('100%')
    expect(alEquipo().subject).toContain('documentación pendiente')
  })

  it('al asesor le recuerda subir la documentación, y va ANTES que publicar', () => {
    const html = alAsesor().html
    const recordatorio = html.indexOf('Cuando tengas la documentación')
    const publicar = html.indexOf('Publicá la propiedad en los portales')
    expect(recordatorio).toBeGreaterThan(-1)
    expect(recordatorio).toBeLessThan(publicar)
  })
})

describe('notifyPropertyCaptured — CON documentación aprobada', () => {
  beforeEach(async () => {
    sembrarPropiedad({ legal_status: 'approved', legal_reviewer_id: 'l1', legal_reviewed_at: '2026-08-09T11:00:00Z' })
    await notifyPropertyCaptured('p1')
  })

  it('sí nombra al abogado que aprobó y mantiene el "100%"', () => {
    expect(alAsesor().html).toMatch(/Dra. Suárez aprobó/)
    expect(alEquipo().subject).toContain('100%')
    expect(alEquipo().html).toMatch(/Aprobada/)
  })
})

describe('notifyPropertyCaptured — el abogado del rechazo no se cuelga el logro', () => {
  it('con la documentación rechazada NO se nombra a quien revisó', async () => {
    // `legal_reviewer_id` también queda escrito cuando el abogado RECHAZÓ.
    sembrarPropiedad({ legal_status: 'rejected', legal_reviewer_id: 'l1' })
    await notifyPropertyCaptured('p1')
    expect(alAsesor().html).not.toContain('Suárez')
  })
})
