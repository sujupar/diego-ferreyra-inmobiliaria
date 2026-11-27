/**
 * Autor de los cambios de etapa (crm-linea-de-tiempo, design.md D1). Las SEIS funciones que
 * escriben `deals.stage` escriben también `stage_changed_by` en el MISMO insert/update: si
 * una lo olvidara, el historial le atribuiría el cambio a la persona del cambio anterior
 * (el valor queda en el proceso). El sistema pasa null, y null también se escribe.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const c = vi.hoisted(() => ({ escrituras: [] as Record<string, unknown>[] }))

vi.mock('@/lib/integrations/mailchimp/sync-deal', () => ({ syncDealToMailchimp: vi.fn() }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {}
      const encadenar = () => q
      Object.assign(q, {
        insert: (p: Record<string, unknown>) => (c.escrituras.push(p), q),
        update: (p: Record<string, unknown>) => (c.escrituras.push(p), q),
        eq: encadenar,
        in: encadenar,
        or: encadenar,
        select: () => q,
        single: async () => ({ data: { id: 'd-1' }, error: null }),
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [{ id: 'd-1' }], error: null }).then(ok),
      })
      return q
    },
  }),
}))

import { convertirSolicitud, createDeal, deshacerPerdido, linkPropertyToDeal, updateDealStage } from './deals'
import { markVisitCompleted } from './visit-data'

const PAULA = '00000000-0000-4000-8000-0000000000a1'

beforeEach(() => {
  c.escrituras = []
})

const casos: [string, (autor: string | null) => Promise<unknown>][] = [
  ['createDeal', (a) => createDeal({ contact_id: null, stage: 'request' } as never, a)],
  ['updateDealStage', (a) => updateDealStage('d-1', 'scheduled', { autorId: a })],
  ['deshacerPerdido', (a) => deshacerPerdido('d-1', { volverA: 'request', limpiarLostAt: false, autorId: a })],
  ['convertirSolicitud', (a) => convertirSolicitud('d-1', {} as never, a)],
  ['linkPropertyToDeal', (a) => linkPropertyToDeal('d-1', 'p-1', a)],
  ['markVisitCompleted', (a) => markVisitCompleted('d-1', a)],
]

describe('cada escritura de etapa lleva su autor', () => {
  it.each(casos)('%s escribe stage_changed_by junto con stage', async (_n, llamar) => {
    await llamar(PAULA)
    const conEtapa = c.escrituras.filter((e) => 'stage' in e)
    expect(conEtapa).toHaveLength(1)
    expect(conEtapa[0].stage_changed_by).toBe(PAULA)
  })

  it.each(casos)('%s escribe null explícito cuando lo hace el sistema', async (_n, llamar) => {
    await llamar(null)
    const [e] = c.escrituras.filter((x) => 'stage' in x)
    expect(e).toHaveProperty('stage_changed_by', null)
  })
})
