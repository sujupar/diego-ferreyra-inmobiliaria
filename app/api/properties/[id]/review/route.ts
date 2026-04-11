import { NextRequest, NextResponse } from 'next/server'
import { reviewProperty, getProperty } from '@/lib/supabase/properties'
import { createTask } from '@/lib/supabase/tasks'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { approved, reviewer_id, notes } = await request.json()

    if (typeof approved !== 'boolean' || !reviewer_id) {
      return NextResponse.json({ error: 'Missing approved or reviewer_id' }, { status: 400 })
    }

    await reviewProperty(id, approved, reviewer_id, notes)

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

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
