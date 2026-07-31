import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UserWithProfile, Role } from '@/types/auth.types'

// Mismo patrón que `lib/marketing/meta-sync.test.ts`: mockeamos
// `@supabase/supabase-js` para probar la lógica de autorización SIN pegarle a
// la base real. Dos tablas distintas ('property_leads' y 'properties'), cada
// una con su propio mock de `.select().eq().maybeSingle()`.
const leadMaybeSingle = vi.fn()
const propertyMaybeSingle = vi.fn()
const leadEq = vi.fn(() => ({ maybeSingle: leadMaybeSingle }))
const leadSelect = vi.fn(() => ({ eq: leadEq }))
const propertyEq = vi.fn(() => ({ maybeSingle: propertyMaybeSingle }))
const propertySelect = vi.fn(() => ({ eq: propertyEq }))
const fromMock = vi.fn((table: string) => {
  if (table === 'property_leads') return { select: leadSelect }
  if (table === 'properties') return { select: propertySelect }
  throw new Error(`tabla inesperada en el mock: ${table}`)
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: fromMock }),
}))

const { authorizeLeadAccess } = await import('./authorize-lead-access')

function userWith(role: Role, id = 'user-1'): UserWithProfile {
  return {
    id,
    email: 'x@example.com',
    profile: {
      id,
      email: 'x@example.com',
      full_name: 'Test User',
      role,
      phone: null,
      avatar_url: null,
      is_active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
})

describe('authorizeLeadAccess', () => {
  it('rol no permitido (abogado) → 403 sin tocar la base', async () => {
    const result = await authorizeLeadAccess('lead-1', userWith('abogado'))
    expect(result).toEqual({ ok: false, reason: 'forbidden', status: 403 })
    expect(fromMock).not.toHaveBeenCalled()
  })

  // Hallazgo H6 (revisión adversarial 2026-08-01): antes, para roles de
  // operaciones esto devolvía {ok:true} SIN consultar la base — un leadId
  // inexistente pasaba el gate y recién fallaba más abajo (500 crudo de
  // Postgres por violación de FK).
  it('admin con un leadId inexistente → 404, no {ok:true} a ciegas', async () => {
    leadMaybeSingle.mockResolvedValueOnce({ data: null })
    const result = await authorizeLeadAccess('no-existe', userWith('admin'))
    expect(result).toEqual({ ok: false, reason: 'not_found', status: 404 })
  })

  it('dueño con un lead en la papelera (deleted_at no nulo) → 404', async () => {
    leadMaybeSingle.mockResolvedValueOnce({
      data: { property_id: 'p1', assigned_to: null, deleted_at: '2026-08-01T00:00:00Z' },
    })
    const result = await authorizeLeadAccess('lead-borrado', userWith('dueno'))
    expect(result).toEqual({ ok: false, reason: 'not_found', status: 404 })
  })

  it('coordinador con un lead vigente → ok, sin chequeo de ownership', async () => {
    leadMaybeSingle.mockResolvedValueOnce({
      data: { property_id: 'p1', assigned_to: 'otro-user', deleted_at: null },
    })
    const result = await authorizeLeadAccess('lead-1', userWith('coordinador'))
    expect(result).toEqual({ ok: true })
    // Un rol de operaciones no necesita el segundo SELECT de ownership.
    expect(fromMock).not.toHaveBeenCalledWith('properties')
  })

  it('asesor dueño del lead (assigned_to directo) → ok', async () => {
    leadMaybeSingle.mockResolvedValueOnce({
      data: { property_id: 'p1', assigned_to: 'user-1', deleted_at: null },
    })
    const result = await authorizeLeadAccess('lead-1', userWith('asesor', 'user-1'))
    expect(result).toEqual({ ok: true })
  })

  it('asesor dueño de la PROPIEDAD del lead (no asignado directo) → ok', async () => {
    leadMaybeSingle.mockResolvedValueOnce({
      data: { property_id: 'p1', assigned_to: null, deleted_at: null },
    })
    propertyMaybeSingle.mockResolvedValueOnce({ data: { assigned_to: 'user-1' } })
    const result = await authorizeLeadAccess('lead-1', userWith('asesor', 'user-1'))
    expect(result).toEqual({ ok: true })
  })

  it('asesor SIN relación con el lead ni la propiedad → 403', async () => {
    leadMaybeSingle.mockResolvedValueOnce({
      data: { property_id: 'p1', assigned_to: 'otro-user', deleted_at: null },
    })
    propertyMaybeSingle.mockResolvedValueOnce({ data: { assigned_to: 'otro-user' } })
    const result = await authorizeLeadAccess('lead-1', userWith('asesor', 'user-1'))
    expect(result).toEqual({ ok: false, reason: 'forbidden', status: 403 })
  })

  it('asesor con un lead inexistente → 404 (mismo criterio que operaciones, no solo 403)', async () => {
    leadMaybeSingle.mockResolvedValueOnce({ data: null })
    const result = await authorizeLeadAccess('no-existe', userWith('asesor', 'user-1'))
    expect(result).toEqual({ ok: false, reason: 'not_found', status: 404 })
  })

  it('asesor con un lead en la papelera → 404, no llega a chequear ownership', async () => {
    leadMaybeSingle.mockResolvedValueOnce({
      data: { property_id: 'p1', assigned_to: 'user-1', deleted_at: '2026-08-01T00:00:00Z' },
    })
    const result = await authorizeLeadAccess('lead-borrado', userWith('asesor', 'user-1'))
    expect(result).toEqual({ ok: false, reason: 'not_found', status: 404 })
    expect(fromMock).not.toHaveBeenCalledWith('properties')
  })
})
