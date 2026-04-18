import { NextRequest, NextResponse } from 'next/server'
import { reviewProperty, getProperty } from '@/lib/supabase/properties'
import { createTask } from '@/lib/supabase/tasks'
import { requireAuth } from '@/lib/auth/require-role'
import { logLegalEvent } from '@/lib/supabase/legal-events'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const { approved, notes } = await request.json()

    if (typeof approved !== 'boolean') {
      return NextResponse.json({ error: 'Missing approved' }, { status: 400 })
    }

    await reviewProperty(id, approved, user.id, notes)

    // If rejected, create task for the assigned asesor
    if (!approved) {
      try {
        const prop = await getProperty(id)
        if (prop.assigned_to) {
          await createTask({
            type: 'rejected_docs',
            title: `Documentacion rechazada: ${prop.address}`,
            description: notes ? `Observaciones: ${notes}` : 'Revisar y corregir documentacion.',
            assigned_to: prop.assigned_to,
            property_id: id,
          })
        }
      } catch (e) { console.error('Task creation error:', e) }
    }

    try {
      await logLegalEvent({
        property_id: id,
        actor_id: user.id,
        actor_role: user.profile.role,
        action: approved ? 'approved_all' : 'rejected_all',
        item_key: null,
        notes: notes || null,
      })
    } catch (e) { console.error('logLegalEvent error:', e) }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
