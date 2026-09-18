/**
 * Vincular una tasación a un proceso NO es entregarla.
 *
 * `linkAppraisalToDeal` también movía el proceso a "Tasación Entregada", contra
 * lo que dice el comentario de la ruta que la llama ("crear ≠ entregar"). Por
 * eso cada tasación manual aparecía entregada sin que nadie la entregara, y el
 * email real de entrega no salía nunca. Entregar es un acto del asesor, con su
 * botón.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { capturado } = vi.hoisted(() => ({ capturado: { update: null as Record<string, unknown> | null } }))

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        capturado.update = payload
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))
vi.mock('@/lib/integrations/mailchimp/sync-deal', () => ({ syncDealToMailchimp: vi.fn() }))

import { linkAppraisalToDeal, linkPropertyToDeal } from './deals'

beforeEach(() => { capturado.update = null })

describe('linkAppraisalToDeal', () => {
  it('guarda la tasación y NO toca la etapa', async () => {
    await linkAppraisalToDeal('deal-1', 'tasacion-1')
    expect(capturado.update).toMatchObject({ appraisal_id: 'tasacion-1' })
    expect(capturado.update).not.toHaveProperty('stage')
    expect(capturado.update).not.toHaveProperty('stage_changed_at')
  })
})

describe('linkPropertyToDeal', () => {
  it('captar SÍ mueve el proceso a Captada: ahí la propiedad ya es de la agencia', async () => {
    await linkPropertyToDeal('deal-1', 'prop-1')
    expect(capturado.update).toMatchObject({ property_id: 'prop-1', stage: 'captured' })
  })
})
