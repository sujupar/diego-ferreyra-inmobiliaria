import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  nextStateFor,
  isPipelineState,
  PIPELINE_STATES,
  PIPELINE_STATE_LABELS,
  setPipelineStateManually,
} from './pipeline-state'

// Mismo patrón que `lib/marketing/meta-sync.test.ts` / `lib/leads/authorize-lead-access.test.ts`:
// mockeamos `@supabase/supabase-js` para probar `setPipelineStateManually`
// (I/O real) sin pegarle a la base. Usado más abajo por el describe de H10.
const leadMaybeSingle = vi.fn()
const updateMaybeSingle = vi.fn()
const historyInsert = vi.fn().mockResolvedValue({ error: null })

const leadEq = vi.fn(() => ({ maybeSingle: leadMaybeSingle }))
const leadSelect = vi.fn(() => ({ eq: leadEq }))

// `.update(...).eq('id', x).eq('pipeline_state', current).select('id').maybeSingle()`
const updateSelect = vi.fn(() => ({ maybeSingle: updateMaybeSingle }))
const updateEqState = vi.fn(() => ({ select: updateSelect }))
const updateEqId = vi.fn(() => ({ eq: updateEqState }))
const updateFn = vi.fn(() => ({ eq: updateEqId }))

const fromMock = vi.fn((table: string) => {
  if (table === 'property_leads') return { select: leadSelect, update: updateFn }
  if (table === 'lead_state_history') return { insert: historyInsert }
  throw new Error(`tabla inesperada en el mock: ${table}`)
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ from: fromMock }),
}))

describe('nextStateFor — avance', () => {
  it('nuevo + first_outbound_message → contactado', () => {
    expect(nextStateFor('nuevo', 'first_outbound_message')).toBe('contactado')
  })

  it('nuevo + visit_scheduled → visita_agendada (puede agendarse una visita sin haber mandado mensaje)', () => {
    expect(nextStateFor('nuevo', 'visit_scheduled')).toBe('visita_agendada')
  })

  it('contactado + visit_scheduled → visita_agendada', () => {
    expect(nextStateFor('contactado', 'visit_scheduled')).toBe('visita_agendada')
  })

  it('visita_agendada + visit_completed → visito', () => {
    expect(nextStateFor('visita_agendada', 'visit_completed')).toBe('visito')
  })

  it('nuevo + visit_completed → visito (salto directo, la escalera no exige pasar por todos los escalones)', () => {
    expect(nextStateFor('nuevo', 'visit_completed')).toBe('visito')
  })
})

describe('nextStateFor — nunca retrocede', () => {
  it('visito + first_outbound_message no lo devuelve a contactado', () => {
    expect(nextStateFor('visito', 'first_outbound_message')).toBeNull()
  })

  it('visito + visit_scheduled no lo devuelve a visita_agendada', () => {
    expect(nextStateFor('visito', 'visit_scheduled')).toBeNull()
  })

  it('visita_agendada + first_outbound_message no lo devuelve a contactado', () => {
    expect(nextStateFor('visita_agendada', 'first_outbound_message')).toBeNull()
  })
})

describe('nextStateFor — idempotencia', () => {
  it('contactado + first_outbound_message (segunda vez) no cambia nada', () => {
    expect(nextStateFor('contactado', 'first_outbound_message')).toBeNull()
  })

  it('visita_agendada + visit_scheduled (segunda vez, ej. reprogramación) no cambia nada', () => {
    expect(nextStateFor('visita_agendada', 'visit_scheduled')).toBeNull()
  })

  it('visito + visit_completed (segunda vez) no cambia nada', () => {
    expect(nextStateFor('visito', 'visit_completed')).toBeNull()
  })
})

describe('nextStateFor — estados manuales quedan fuera de la escalera automática', () => {
  it('negociando no se mueve con ningún evento automático', () => {
    expect(nextStateFor('negociando', 'first_outbound_message')).toBeNull()
    expect(nextStateFor('negociando', 'visit_scheduled')).toBeNull()
    expect(nextStateFor('negociando', 'visit_completed')).toBeNull()
  })

  it('cerrado no se mueve con ningún evento automático', () => {
    expect(nextStateFor('cerrado', 'first_outbound_message')).toBeNull()
    expect(nextStateFor('cerrado', 'visit_scheduled')).toBeNull()
    expect(nextStateFor('cerrado', 'visit_completed')).toBeNull()
  })

  it('perdido no se mueve con ningún evento automático (ni un mensaje nuevo lo "reabre")', () => {
    expect(nextStateFor('perdido', 'first_outbound_message')).toBeNull()
    expect(nextStateFor('perdido', 'visit_scheduled')).toBeNull()
    expect(nextStateFor('perdido', 'visit_completed')).toBeNull()
  })
})

describe('isPipelineState', () => {
  it('acepta los 7 estados del enum', () => {
    for (const s of PIPELINE_STATES) expect(isPipelineState(s)).toBe(true)
  })

  it('rechaza texto arbitrario', () => {
    expect(isPipelineState('en_negociacion')).toBe(false)
    expect(isPipelineState('')).toBe(false)
    expect(isPipelineState('Nuevo')).toBe(false) // case-sensitive: el enum de la base es minúsculas
  })
})

describe('PIPELINE_STATE_LABELS', () => {
  it('tiene un rótulo para cada estado, sin huecos', () => {
    for (const s of PIPELINE_STATES) {
      expect(typeof PIPELINE_STATE_LABELS[s]).toBe('string')
      expect(PIPELINE_STATE_LABELS[s].length).toBeGreaterThan(0)
    }
  })
})

// Hallazgo H10 (revisión adversarial 2026-08-01): `setPipelineStateManually`
// actualizaba `pipeline_state` sin `WHERE pipeline_state = current` — a
// diferencia de `advancePipelineState`, que sí lo hace. Dos cambios
// concurrentes sobre el mismo lead podían dejar un `lead_state_history` con
// un `from_state` que ya no era el real. Estas pruebas verifican el UPDATE
// condicional + el corte explícito cuando la carrera se detecta.
describe('setPipelineStateManually — UPDATE condicional (H10)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role'
    historyInsert.mockResolvedValue({ error: null })
  })

  it('camino feliz: lee el estado actual, hace el UPDATE condicional a ESE estado, y registra el historial', async () => {
    leadMaybeSingle.mockResolvedValueOnce({ data: { pipeline_state: 'contactado', deleted_at: null } })
    updateMaybeSingle.mockResolvedValueOnce({ data: { id: 'lead-1' }, error: null })

    const result = await setPipelineStateManually('lead-1', 'perdido', 'user-1', 'no contesta hace 3 semanas')

    expect(result).toEqual({ changed: true, from: 'contactado', to: 'perdido' })
    // El UPDATE se condicionó al estado que se acababa de leer.
    expect(updateEqId).toHaveBeenCalledWith('id', 'lead-1')
    expect(updateEqState).toHaveBeenCalledWith('pipeline_state', 'contactado')
    expect(historyInsert).toHaveBeenCalledWith(
      expect.objectContaining({ lead_id: 'lead-1', from_state: 'contactado', to_state: 'perdido', reason: 'no contesta hace 3 semanas', changed_by: 'user-1' }),
    )
  })

  it('carrera: el UPDATE condicional no encuentra fila (otro cambio ganó en el medio) → lanza CONFLICT y NO escribe historial', async () => {
    leadMaybeSingle.mockResolvedValueOnce({ data: { pipeline_state: 'contactado', deleted_at: null } })
    // Nadie matcheó el WHERE (pipeline_state ya no era 'contactado' cuando llegó el UPDATE).
    updateMaybeSingle.mockResolvedValueOnce({ data: null, error: null })

    await expect(
      setPipelineStateManually('lead-1', 'perdido', 'user-1', 'motivo válido'),
    ).rejects.toThrow(/CONFLICT/)
    expect(historyInsert).not.toHaveBeenCalled()
  })

  it('lead inexistente → lanza antes de tocar el UPDATE', async () => {
    leadMaybeSingle.mockResolvedValueOnce({ data: null })
    await expect(
      setPipelineStateManually('no-existe', 'perdido', 'user-1', 'motivo'),
    ).rejects.toThrow('Lead no encontrado')
    expect(updateFn).not.toHaveBeenCalled()
  })

  it('lead en la papelera → lanza sin tocar el UPDATE', async () => {
    leadMaybeSingle.mockResolvedValueOnce({ data: { pipeline_state: 'contactado', deleted_at: '2026-08-01T00:00:00Z' } })
    await expect(
      setPipelineStateManually('lead-1', 'perdido', 'user-1', 'motivo'),
    ).rejects.toThrow('papelera')
    expect(updateFn).not.toHaveBeenCalled()
  })

  it('motivo vacío → lanza sin leer la base', async () => {
    await expect(setPipelineStateManually('lead-1', 'perdido', 'user-1', '   ')).rejects.toThrow(/motivo/i)
    expect(fromMock).not.toHaveBeenCalled()
  })

  it('mismo estado (current === toState) → no cambia nada, no llega a actualizar', async () => {
    leadMaybeSingle.mockResolvedValueOnce({ data: { pipeline_state: 'perdido', deleted_at: null } })
    const result = await setPipelineStateManually('lead-1', 'perdido', 'user-1', 'motivo')
    expect(result).toEqual({ changed: false, from: null, to: null })
    expect(updateFn).not.toHaveBeenCalled()
  })
})
