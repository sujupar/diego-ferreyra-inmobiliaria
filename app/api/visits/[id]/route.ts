import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getUser } from '@/lib/auth/get-user'
import { getVisit, updateVisit } from '@/lib/supabase/visits'
import { advancePipelineState } from '@/lib/leads/pipeline-state'
import { resolveLeadIdForVisitWithFallback } from '@/lib/leads/resolve-crm-visit-lead'

const patchSchema = z.object({
  scheduled_at: z.string().datetime().optional(),
  client_name: z.string().min(1).optional(),
  client_email: z.string().email().optional(),
  client_phone: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['pending_confirmation', 'scheduled', 'completed', 'no_show', 'cancelled']).optional(),
  completion_notes: z.string().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const visit = await getVisit(id)
  if (!visit) return NextResponse.json({ error: 'not_found' }, { status: 404 })
  return NextResponse.json({ data: visit })
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const body = await req.json()
  const parsed = patchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_input', details: parsed.error.flatten() }, { status: 400 })
  }

  try {
    const updated = await updateVisit(id, {
      ...parsed.data,
      ...(parsed.data.status === 'completed' ? { completed_at: new Date().toISOString() } : {}),
    })

    // Mismo hecho que en `POST /api/visits/[id]/complete`: `→ visito` cuando
    // esta ruta también deja la visita en 'completed' (edición directa desde
    // la ficha de la visita, no solo el flujo "completar"). Best-effort;
    // `resolveLeadIdForVisitWithFallback` también cubre visitas cargadas a
    // mano desde el CRM (sin `lead_access_tokens`), ver ese módulo.
    if (parsed.data.status === 'completed') {
      const leadId = await resolveLeadIdForVisitWithFallback(id)
      if (leadId) await advancePipelineState(leadId, 'visit_completed')
    }

    return NextResponse.json({ data: updated })
  } catch (err) {
    console.error('[PUT /api/visits/[id]]', err)
    return NextResponse.json({ error: 'update_failed' }, { status: 500 })
  }
}
