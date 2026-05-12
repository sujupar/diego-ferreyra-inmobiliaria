import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getProperty, updateProperty } from '@/lib/supabase/properties'
import { createTaskForRole } from '@/lib/supabase/tasks'
import { requireAuth, requireRole } from '@/lib/auth/require-role'
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

/**
 * DELETE /api/properties/[id]
 *
 * Borra la propiedad definitivamente. Sus FKs descendientes (property_listings,
 * legal_review_events, property_metrics_daily, property_publish_events) caen
 * por CASCADE; FKs externas (deals, tasks, etc.) quedan con NULL gracias a la
 * migración 20260512000004 (ON DELETE SET NULL).
 *
 * Solo admin/dueño. Para descartar sin borrar histórico, usar PUT con
 * `status: 'descartada'`.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin', 'dueno')
    const { id } = await params

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { error } = await supabase.from('properties').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/properties/[id] error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
