import { NextRequest, NextResponse } from 'next/server'
import { updateDealStage, linkAppraisalToDeal, linkPropertyToDeal, getDeal, DealStage } from '@/lib/supabase/deals'
import { createTaskForRole } from '@/lib/supabase/tasks'
import { requirePermission } from '@/lib/auth/require-role'
import { notifyAppraisalSent } from '@/lib/email/notifications/appraisal-sent'
import { notifyVisitCompleted } from '@/lib/email/notifications/visit-completed'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('pipeline.advance')
    const { id } = await params
    const { stage, notes, appraisal_id, property_id } = await request.json()

    if (!stage) return NextResponse.json({ error: 'Missing stage' }, { status: 400 })

    const validStages: DealStage[] = ['scheduled', 'not_visited', 'visited', 'appraisal_sent', 'followup', 'captured', 'lost']
    if (!validStages.includes(stage)) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })

    // If linking an appraisal, use the dedicated function
    if (appraisal_id && stage === 'appraisal_sent') {
      await linkAppraisalToDeal(id, appraisal_id)

      // Create task for coordinadores to update contact data
      try {
        const deal = await getDeal(id)
        await createTaskForRole('coordinador', {
          type: 'update_contact',
          title: `Actualizar contacto: ${deal.property_address}`,
          description: `El asesor creo una tasacion. Verificar y completar datos del contacto.`,
          deal_id: id,
          contact_id: deal.contact_id,
          appraisal_id,
        })
      } catch (e) { console.error('Task creation error:', e) }

      // N3: tasación entregada — notifica coordinador+admins+dueños con PDF adjunto.
      try { await notifyAppraisalSent(id, appraisal_id) } catch (err) { console.error('[notify] appraisal-sent:', err) }

      return NextResponse.json({ success: true })
    }

    // If linking a property, use the dedicated function
    if (property_id && stage === 'captured') {
      await linkPropertyToDeal(id, property_id)
      return NextResponse.json({ success: true })
    }

    // Otherwise just update the stage
    await updateDealStage(id, stage, notes)

    // N2: visita realizada — notificar coordinador+admins+dueños.
    if (stage === 'visited') {
      try { await notifyVisitCompleted(id) } catch (err) { console.error('[notify] visit-completed:', err) }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
