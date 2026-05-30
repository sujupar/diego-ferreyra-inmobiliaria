import { NextRequest, NextResponse } from 'next/server'
import { updateDealStage, linkAppraisalToDeal, linkPropertyToDeal, getDeal, DealStage } from '@/lib/supabase/deals'
import { createTaskForRole } from '@/lib/supabase/tasks'
import { requirePermission } from '@/lib/auth/require-role'
import { notifyAppraisalSent } from '@/lib/email/notifications/appraisal-sent'
import { notifyVisitCompleted } from '@/lib/email/notifications/visit-completed'
import { notifyWithEscalation } from '@/lib/email/notify-with-escalation'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('pipeline.advance')
    const { id } = await params
    const { stage, notes, appraisal_id, property_id } = await request.json()

    if (!stage) return NextResponse.json({ error: 'Missing stage' }, { status: 400 })

    const validStages: DealStage[] = ['clase_gratuita', 'request', 'scheduled', 'not_visited', 'visited', 'appraisal_sent', 'followup', 'captured', 'lost']
    if (!validStages.includes(stage)) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })

    // VINCULAR la tasación al proceso (esto pasa al CREAR el documento, NO al
    // entregarlo). Solo enlaza + crea la tarea de coordinación. NO avanza el
    // stage y NO envía el email "Tasación entregada": crear ≠ entregar.
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

      return NextResponse.json({ success: true })
    }

    // If linking a property, use the dedicated function
    if (property_id && stage === 'captured') {
      await linkPropertyToDeal(id, property_id)
      return NextResponse.json({ success: true })
    }

    // Capturamos el estado PREVIO antes de actualizar, para disparar emails solo
    // en una TRANSICIÓN real de stage (evita reenviar la notificación si se vuelve
    // a marcar el mismo stage — p.ej. doble click en "Marcar Tasación Entregada").
    let priorStage: string | null = null
    let linkedAppraisalId: string | null = null
    try {
      const prev = await getDeal(id)
      priorStage = prev?.stage ?? null
      linkedAppraisalId = prev?.appraisal_id ?? null
    } catch (e) { console.error('advance: prior-state fetch error:', e) }

    // Otherwise just update the stage
    await updateDealStage(id, stage, notes)

    // N2: visita realizada — notificar coordinador+admins+dueños (solo en transición).
    if (stage === 'visited' && priorStage !== 'visited') {
      await notifyWithEscalation(
        () => notifyVisitCompleted(id),
        { failedNotificationType: 'visit_completed', entityType: 'deal', entityId: id },
      )
    }

    // N3: TASACIÓN ENTREGADA — momento correcto: el asesor marcó manualmente
    // "Marcar Tasación Entregada" (avanza a appraisal_sent SIN appraisal_id en el
    // request; la tasación ya estaba vinculada al crearla). Enviamos el email con
    // el PDF SOLO si: (a) es una transición real (no estaba ya en appraisal_sent)
    // y (b) hay una tasación vinculada que entregar.
    if (stage === 'appraisal_sent' && priorStage !== 'appraisal_sent' && linkedAppraisalId) {
      await notifyWithEscalation(
        () => notifyAppraisalSent(id, linkedAppraisalId!),
        { failedNotificationType: 'appraisal_sent', entityType: 'deal', entityId: id },
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
