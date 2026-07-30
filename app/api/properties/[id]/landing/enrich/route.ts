/**
 * POST /api/properties/[id]/landing/enrich
 *
 * Corre UNA etapa del enriquecimiento con IA de la landing (Vision → avatares →
 * copy) y devuelve la landing actualizada más la etapa que sigue. El cliente
 * llama en loop hasta `stage === 'done'`.
 *
 * Existe porque hacer las tres etapas en el POST de creación sumaba ~30s y
 * Netlify mataba la función con un 504 (detalle en `lib/landing/enrich.ts`).
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { authorizeLanding, runEnrichStage } from '@/lib/landing/landing-service'
import { nextEnrichStage, enrichLabel, enrichPercent } from '@/lib/landing/enrich'

export const maxDuration = 60

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorizeLanding(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const landing = await runEnrichStage(id)
    const stage = nextEnrichStage(landing.wizard_state ?? {})
    return NextResponse.json({
      landing,
      stage,
      label: enrichLabel(stage),
      percent: enrichPercent(stage),
      done: stage === 'done',
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
