/**
 * E1.4 → v2 (2026-08-06) — POST /api/properties/[id]/landing/answers
 *
 * Guarda las respuestas del asesor (exige TODAS respondidas), regenera los
 * avatares con ese contexto y RE-ARMA la etapa 'copy' del enrich: el loop del
 * cliente genera después los textos de la landing con esas respuestas. Este
 * request hace UNA sola llamada de IA (avatares); el copy va en la llamada
 * siguiente del loop (REGLA DURA de CLAUDE.md).
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { authorizeLanding, getLanding, updateLanding } from '@/lib/landing/landing-service'
import { faltanRespuestas } from '@/lib/landing/answers-gate'
import { generateEmpathyAvatars } from '@/lib/marketing/empathy-avatar-generator'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { LandingProperty } from '@/lib/landing/registry'

export const maxDuration = 60

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorizeLanding(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const body = (await req.json()) as { answers?: Record<string, unknown> }

    const landing = await getLanding(id)
    if (!landing) return NextResponse.json({ error: 'landing not found' }, { status: 404 })

    // Solo se aceptan respuestas string para los ids de las preguntas GUARDADAS
    // (review 2026-08-06): claves ajenas irían crudas al prompt del copy y un
    // valor no-string trabaría la etapa de textos.
    const questionIds = new Set((landing.wizard_state?.questions ?? []).map(q => q.id))
    const answers: Record<string, string> = {}
    for (const [k, v] of Object.entries(body.answers ?? {})) {
      if (questionIds.has(k) && typeof v === 'string') answers[k] = v.trim().slice(0, 1500)
    }

    // Gate (2026-08-06): sin TODAS las respuestas no se generan los textos.
    const faltantes = faltanRespuestas({ questions: landing.wizard_state?.questions, answers })
    if (faltantes.length > 0) {
      return NextResponse.json(
        { error: 'Respondé todas las preguntas antes de generar los textos.', faltantes },
        { status: 400 },
      )
    }

    const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: property } = await supabase.from('properties').select('*').eq('id', id).single()
    if (!property) return NextResponse.json({ error: 'property not found' }, { status: 404 })

    const { avatars } = await generateEmpathyAvatars({
      property: property as LandingProperty,
      count: 3,
      visionSummary: landing.wizard_state?.visionSummary,
      description: landing.wizard_state?.descriptionUsed,
      answers,
    })

    const updated = await updateLanding(id, {
      wizardState: {
        answers,
        avatarCandidates: avatars,
        selectedAvatarIndex: 0,
        step: 'avatar',
        // Re-arma la etapa de textos: el loop del cliente la ejecuta a
        // continuación con estas respuestas. Hasta que corra, el copy vigente
        // NO salió de las respuestas → el gate de publicación sigue cerrado.
        enrich: 'copy',
        copyFromAnswers: false,
      },
    })
    return NextResponse.json({ landing: updated })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
