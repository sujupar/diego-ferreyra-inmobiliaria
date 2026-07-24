/**
 * E1.4 — POST /api/properties/[id]/landing/avatar-refine
 *
 * Refina un avatar candidato con un comentario del asesor (preserva el mapa de
 * empatía). Reemplaza el candidato en wizard_state y lo deja seleccionado.
 * body: { avatarIndex: number, comment: string }
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { authorizeLanding, getLanding, updateLanding } from '@/lib/landing/landing-service'
import { refineEmpathyAvatar } from '@/lib/marketing/empathy-avatar-generator'
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
    const body = (await req.json()) as { avatarIndex?: number; comment?: string }
    const idx = typeof body.avatarIndex === 'number' ? body.avatarIndex : 0
    const comment = (body.comment ?? '').slice(0, 500)
    if (!comment) return NextResponse.json({ error: 'comentario vacío' }, { status: 400 })

    const landing = await getLanding(id)
    if (!landing) return NextResponse.json({ error: 'landing not found' }, { status: 404 })
    const candidates = [...(landing.wizard_state?.avatarCandidates ?? [])]
    const target = candidates[idx]
    if (!target) return NextResponse.json({ error: 'avatar no encontrado' }, { status: 404 })

    const supabase = createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data: property } = await supabase.from('properties').select('*').eq('id', id).single()
    if (!property) return NextResponse.json({ error: 'property not found' }, { status: 404 })

    const refined = await refineEmpathyAvatar({ avatar: target, comment, property: property as LandingProperty })
    candidates[idx] = refined

    const updated = await updateLanding(id, {
      wizardState: { avatarCandidates: candidates, selectedAvatarIndex: idx },
    })
    return NextResponse.json({ landing: updated })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
