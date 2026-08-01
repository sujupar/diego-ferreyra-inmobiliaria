import { describe, it, expect, vi, beforeEach } from 'vitest'

// `visit-scheduling.ts` importa `notifyVisitProposed` (lib/email/notifications/
// visit-proposed.ts), que trae `import 'server-only'` — el paquete no existe
// fuera del build de Next.js. Mismo mock que `lib/funnel/create-funnel-lead.test.ts`.
vi.mock('server-only', () => ({}))

import {
  isFranja,
  hoyEnArgentina,
  sumarDias,
  diaDeSemana,
  esDiaHabil,
  scheduledAtFor,
} from './visit-scheduling'

describe('isFranja', () => {
  it('acepta las 3 franjas válidas', () => {
    expect(isFranja('manana')).toBe(true)
    expect(isFranja('mediodia')).toBe(true)
    expect(isFranja('tarde')).toBe(true)
  })
  it('rechaza cualquier otra cosa', () => {
    expect(isFranja('noche')).toBe(false)
    expect(isFranja('')).toBe(false)
  })
})

describe('hoyEnArgentina / sumarDias', () => {
  it('hoyEnArgentina devuelve YYYY-MM-DD', () => {
    expect(hoyEnArgentina(new Date('2026-08-03T12:00:00Z'))).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
  it('sumarDias avanza el calendario sin saltos por TZ', () => {
    expect(sumarDias('2026-08-03', 1)).toBe('2026-08-04')
    expect(sumarDias('2026-08-31', 1)).toBe('2026-09-01')
    expect(sumarDias('2026-08-03', 0)).toBe('2026-08-03')
  })
})

describe('diaDeSemana / esDiaHabil', () => {
  it('2026-08-03 es lunes (dow=1)', () => {
    expect(diaDeSemana('2026-08-03')).toBe(1)
  })
  it('lunes a viernes son hábiles, sábado y domingo no', () => {
    expect(esDiaHabil('2026-08-03')).toBe(true) // lunes
    expect(esDiaHabil('2026-08-07')).toBe(true) // viernes
    expect(esDiaHabil('2026-08-08')).toBe(false) // sábado
    expect(esDiaHabil('2026-08-09')).toBe(false) // domingo
  })
})

describe('scheduledAtFor', () => {
  it('arma el instante UTC correcto para cada franja (Argentina UTC-3)', () => {
    expect(scheduledAtFor('2026-08-04', 'manana').toISOString()).toBe('2026-08-04T12:00:00.000Z')
    expect(scheduledAtFor('2026-08-04', 'mediodia').toISOString()).toBe('2026-08-04T15:00:00.000Z')
    expect(scheduledAtFor('2026-08-04', 'tarde').toISOString()).toBe('2026-08-04T18:00:00.000Z')
  })
})

// ---------------------------------------------------------------------------
// I/O — mismo patrón que lib/leads/pipeline-state.test.ts: mockeamos
// @supabase/supabase-js para probar upsertPendingVisit sin pegarle a una base
// real.
// ---------------------------------------------------------------------------

const updateMaybeSingle = vi.fn()
const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }))
const updateEqStatus = vi.fn(() => ({ select: updateSelect }))
const updateEqId = vi.fn(() => ({ eq: updateEqStatus }))
const updateFn = vi.fn(() => ({ eq: updateEqId }))

const insertSingle = vi.fn()
const insertSelect = vi.fn(() => ({ single: insertSingle }))
const insertFn = vi.fn(() => ({ select: insertSelect }))

const fromMock = vi.fn((table: string) => {
  if (table === 'property_visits') return { update: updateFn, insert: insertFn }
  throw new Error(`tabla inesperada en el mock: ${table}`)
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: fromMock }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
})

describe('upsertPendingVisit (I/O)', () => {
  it('sin existingVisitId, inserta una fila nueva', async () => {
    const { upsertPendingVisit, admin } = await import('./visit-scheduling')
    insertSingle.mockResolvedValueOnce({ data: { id: 'visit-1' }, error: null })
    const result = await upsertPendingVisit(admin(), {
      propertyId: 'prop-1',
      advisorId: 'advisor-1',
      clientName: 'Juan Pérez',
      clientEmail: null,
      clientPhone: '+5491122334455',
      scheduledAt: new Date('2026-08-04T12:00:00Z'),
      notes: 'nota',
    })
    expect(result).toEqual({ ok: true, visitId: 'visit-1' })
    expect(insertFn).toHaveBeenCalledWith(
      expect.objectContaining({ property_id: 'prop-1', status: 'pending_confirmation' }),
    )
    expect(updateFn).not.toHaveBeenCalled()
  })

  it('sin createdByAi NO manda la columna created_by_ai (el camino del cliente funciona aunque la migración no haya corrido)', async () => {
    const { upsertPendingVisit, admin } = await import('./visit-scheduling')
    insertSingle.mockResolvedValueOnce({ data: { id: 'visit-1' }, error: null })
    await upsertPendingVisit(admin(), {
      propertyId: 'prop-1',
      advisorId: 'advisor-1',
      clientName: 'Juan Pérez',
      clientEmail: null,
      clientPhone: '+5491122334455',
      scheduledAt: new Date('2026-08-04T12:00:00Z'),
      notes: 'nota',
    })
    expect(insertFn).toHaveBeenCalledWith(expect.not.objectContaining({ created_by_ai: expect.anything() }))
  })

  it('con createdByAi:true marca la fila (así el panel de costo cuenta un hecho, no una inferencia)', async () => {
    const { upsertPendingVisit, admin } = await import('./visit-scheduling')
    insertSingle.mockResolvedValueOnce({ data: { id: 'visit-1' }, error: null })
    await upsertPendingVisit(admin(), {
      propertyId: 'prop-1',
      advisorId: 'advisor-1',
      clientName: 'Juan Pérez',
      clientEmail: null,
      clientPhone: '+5491122334455',
      scheduledAt: new Date('2026-08-04T12:00:00Z'),
      notes: 'nota',
      createdByAi: true,
    })
    expect(insertFn).toHaveBeenCalledWith(expect.objectContaining({ created_by_ai: true }))
  })

  it('con existingVisitId vigente (sigue pending_confirmation), ACTUALIZA en vez de insertar ("última propuesta gana")', async () => {
    const { upsertPendingVisit, admin } = await import('./visit-scheduling')
    updateMaybeSingle.mockResolvedValueOnce({ data: { id: 'visit-old' }, error: null })
    const result = await upsertPendingVisit(admin(), {
      propertyId: 'prop-1',
      advisorId: null,
      clientName: 'Juan Pérez',
      clientEmail: null,
      clientPhone: '+5491122334455',
      scheduledAt: new Date('2026-08-04T12:00:00Z'),
      notes: 'nota nueva',
      existingVisitId: 'visit-old',
    })
    expect(result).toEqual({ ok: true, visitId: 'visit-old' })
    expect(insertFn).not.toHaveBeenCalled()
  })

  it('con existingVisitId que YA NO está pending_confirmation, cae a insertar una nueva', async () => {
    const { upsertPendingVisit, admin } = await import('./visit-scheduling')
    updateMaybeSingle.mockResolvedValueOnce({ data: null, error: null }) // el .eq('status','pending_confirmation') no matcheó nada
    insertSingle.mockResolvedValueOnce({ data: { id: 'visit-new' }, error: null })
    const result = await upsertPendingVisit(admin(), {
      propertyId: 'prop-1',
      advisorId: null,
      clientName: 'Juan Pérez',
      clientEmail: null,
      clientPhone: '+5491122334455',
      scheduledAt: new Date('2026-08-04T12:00:00Z'),
      notes: 'nota',
      existingVisitId: 'visit-confirmada',
    })
    expect(result).toEqual({ ok: true, visitId: 'visit-new' })
    expect(insertFn).toHaveBeenCalledTimes(1)
  })

  it('error en el insert devuelve {ok:false}', async () => {
    const { upsertPendingVisit, admin } = await import('./visit-scheduling')
    insertSingle.mockResolvedValueOnce({ data: null, error: { message: 'boom' } })
    const result = await upsertPendingVisit(admin(), {
      propertyId: 'prop-1',
      advisorId: null,
      clientName: 'Juan Pérez',
      clientEmail: null,
      clientPhone: '+5491122334455',
      scheduledAt: new Date('2026-08-04T12:00:00Z'),
      notes: 'nota',
    })
    expect(result).toEqual({ ok: false, error: 'boom' })
  })
})
