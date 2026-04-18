import { NextRequest, NextResponse } from 'next/server'
import { getProperty, updateProperty } from '@/lib/supabase/properties'
import { createTaskForRole } from '@/lib/supabase/tasks'
import { requireAuth } from '@/lib/auth/require-role'
import { logLegalEvent } from '@/lib/supabase/legal-events'

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
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
