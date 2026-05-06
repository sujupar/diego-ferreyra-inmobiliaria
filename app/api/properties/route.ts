import { NextRequest, NextResponse } from 'next/server'
import { createProperty, getProperties } from '@/lib/supabase/properties'
import { requireAuth } from '@/lib/auth/require-role'
import { notifyPropertyCreated } from '@/lib/email/notifications/property-created'
import { notifyWithEscalation } from '@/lib/email/notify-with-escalation'

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined
    const origin = searchParams.get('origin') || undefined
    const from = searchParams.get('from') || undefined
    const to = searchParams.get('to') || undefined
    const assigned_to = searchParams.get('assigned_to') || undefined
    const data = await getProperties({ status, origin, from, to, assigned_to })
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth()
    const body = await request.json()
    // Default assigned_to / created_by to current user unless the caller
    // explicitly overrides (e.g., admin creating on behalf of an asesor).
    const payload = {
      ...body,
      created_by: body.created_by ?? user.id,
      assigned_to: body.assigned_to ?? user.id,
    }
    const id = await createProperty(payload)

    // N4: notificar coordinador+admins+dueños (y asesor como CC).
    // Si falla, escala a admins.
    await notifyWithEscalation(
      () => notifyPropertyCreated(id),
      { failedNotificationType: 'property_created', entityType: 'property', entityId: id },
    )

    return NextResponse.json({ success: true, id })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
