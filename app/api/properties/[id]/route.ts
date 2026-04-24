import { NextRequest, NextResponse } from 'next/server'
import { getProperty, updateProperty } from '@/lib/supabase/properties'
import { createTaskForRole } from '@/lib/supabase/tasks'
import { requireAuth } from '@/lib/auth/require-role'
import { logLegalEvent } from '@/lib/supabase/legal-events'
import { notifyDocsReadyForLawyer } from '@/lib/email/notifications/docs-ready-for-lawyer'
import { notifyAdminEmailFailure } from '@/lib/email/notifications/admin-failure-alert'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await params
    const data = await getProperty(id)
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const body = await request.json()
    await updateProperty(id, body)

    // Auto-create task for abogados when property sent for review
    if (body.status === 'pending_review') {
      try {
        const prop = await getProperty(id)
        await createTaskForRole('abogado', {
          type: 'review_property',
          title: `Revisar documentacion: ${prop.address}`,
          description: `Propiedad en ${prop.neighborhood} enviada a revision legal.`,
          property_id: id,
        })
      } catch (e) { console.error('Task creation error:', e) }

      try {
        await logLegalEvent({
          property_id: id,
          actor_id: user.id,
          actor_role: user.profile.role,
          action: 'submitted',
          item_key: null,
          notes: null,
        })
      } catch (e) { console.error('logLegalEvent error:', e) }

      // N5: notificar a TODOS los abogados activos. Repetible por ciclo — el
      // entity_id lleva el número de submissions previas del property para que
      // cada ciclo re-dispare aunque el property-id sea el mismo. Si falla,
      // alertamos al admin porque este email es crítico (sin él, el abogado
      // no sabe que tiene trabajo).
      try {
        await notifyDocsReadyForLawyer(id)
      } catch (err) {
        console.error('[notify] docs-ready-for-lawyer:', err)
        try {
          await notifyAdminEmailFailure({
            failedNotificationType: 'docs_ready_for_lawyer',
            entityType: 'property',
            entityId: id,
            errors: [err instanceof Error ? err.message : String(err)],
          })
        } catch { /* swallow — never recurse on failure alerts */ }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
