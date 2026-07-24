/**
 * E1.4 — POST /api/properties/[id]/landing/answers
 *
 * Guarda las respuestas del asesor a las preguntas de co-creación y REGENERA
 * los avatares con ese contexto. Devuelve la landing actualizada.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { authorizeLanding, getLanding, updateLanding } from '@/lib/landing/landing-service'
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
    const body = (await req.json()) as { answers?: Record<string, string> }
    const answers = body.answers ?? {}

    const landing = await getLanding(id)
    if (!landing) return NextResponse.json({ error: 'landing not found' }, { status: 404 })

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
      wizardState: { answers, avatarCandidates: avatars, selectedAvatarIndex: 0, step: 'avatar' },
    })
    return NextResponse.json({ landing: updated })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
