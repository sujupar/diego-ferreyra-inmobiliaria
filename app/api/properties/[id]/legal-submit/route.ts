import { NextRequest, NextResponse } from 'next/server'
import { getProperty, submitPropertyForLegalReview } from '@/lib/supabase/properties'
import { createTaskForRole } from '@/lib/supabase/tasks'
import { requireAuth } from '@/lib/auth/require-role'
import { canAccessProperty } from '@/lib/auth/entity-access'
import { logLegalEvent } from '@/lib/supabase/legal-events'
import { notifyDocsReadyForLawyer } from '@/lib/email/notifications/docs-ready-for-lawyer'
import { notifyAdminEmailFailure } from '@/lib/email/notifications/admin-failure-alert'

/**
 * POST /api/properties/[id]/legal-submit — mandarle la documentación al abogado.
 *
 * Salió del `PUT /api/properties/[id]` con `status:'pending_review'`. Ese
 * camino escribía la columna de CAPTACIÓN para expresar algo del circuito
 * LEGAL, así que enviar los papeles de una propiedad publicada la apagaba
 * entera: se caía la pestaña Difusión, la landing pública daba 404 (filtra por
 * status='approved') con tráfico pago encima, las consultas entrantes se
 * rechazaban con 410 y el link del recorrido dejaba de permitir agendar.
 *
 * Acá solo se escribe el carril legal. La propiedad sigue captada y difundida
 * mientras el abogado revisa.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await canAccessProperty(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    await submitPropertyForLegalReview(id)

    try {
      const prop = await getProperty(id)
      await createTaskForRole('abogado', {
        type: 'review_property',
        title: `Revisar documentacion: ${prop.address}`,
        description: `Propiedad en ${prop.neighborhood} enviada a revision legal.`,
        property_id: id,
      })
    } catch (e) { console.error('[legal-submit] Task creation error:', e) }

    try {
      await logLegalEvent({
        property_id: id,
        actor_id: user.id,
        actor_role: user.profile.role,
        action: 'submitted',
        item_key: null,
        notes: null,
      })
    } catch (e) { console.error('[legal-submit] logLegalEvent error:', e) }

    // N5: notificar a TODOS los abogados activos. Si falla, alertamos al admin
    // porque este email es crítico: sin él el abogado no sabe que tiene trabajo.
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

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
