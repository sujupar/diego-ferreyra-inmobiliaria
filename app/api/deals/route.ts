import { NextRequest, NextResponse } from 'next/server'
import { createDeal, getDeals } from '@/lib/supabase/deals'
import { createTask, createTaskForRole } from '@/lib/supabase/tasks'
import { createClient } from '@supabase/supabase-js'
import { requireAuth, requirePermission } from '@/lib/auth/require-role'
import { notifyDealCreated } from '@/lib/email/notifications/deal-created'
import { notifyWithEscalation } from '@/lib/email/notify-with-escalation'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth()
    const { searchParams } = new URL(request.url)
    const limitParam = searchParams.get('limit')
    const offsetParam = searchParams.get('offset')
    const { data, total, stageCounts } = await getDeals({
      stage: searchParams.get('stage') || undefined,
      origin: searchParams.get('origin') || undefined,
      assigned_to: searchParams.get('assigned_to') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      limit: limitParam ? parseInt(limitParam, 10) : undefined,
      offset: offsetParam ? parseInt(offsetParam, 10) : undefined,
    })

    // Get advisor names
    const assignedIds = [...new Set(data.map((d: any) => d.assigned_to).filter(Boolean))]
    let profileMap: Record<string, string> = {}
    if (assignedIds.length > 0) {
      const { data: profiles } = await getAdmin().from('profiles').select('id, full_name').in('id', assignedIds)
      for (const p of profiles || []) profileMap[p.id] = p.full_name
    }

    const enriched = data.map((d: any) => ({
      ...d,
      contact_name: d.contacts?.full_name || '',
      contact_phone: d.contacts?.phone || '',
      contact_email: d.contacts?.email || '',
      assigned_to_name: d.assigned_to ? profileMap[d.assigned_to] || '' : '',
    }))

    return NextResponse.json({ data: enriched, total, stageCounts })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requirePermission('pipeline.schedule')
    const body = await request.json()
    const { contact_name, contact_phone, contact_email, property_address, scheduled_date, scheduled_time, origin, assigned_to, notes, property_type, property_type_other, neighborhood, rooms, covered_area } = body

    if (!contact_name || !property_address) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }
    if (!property_type || !['departamento','casa','ph','otro'].includes(property_type)) {
      return NextResponse.json({ error: 'property_type inválido' }, { status: 400 })
    }
    if (property_type === 'otro' && !property_type_other?.trim()) {
      return NextResponse.json({ error: 'property_type_other requerido' }, { status: 400 })
    }
    if (!neighborhood?.trim()) return NextResponse.json({ error: 'neighborhood requerido' }, { status: 400 })
    if (!rooms || rooms < 1) return NextResponse.json({ error: 'rooms requerido' }, { status: 400 })

    const supabase = getAdmin()

    // Create or find contact — dedupe by email first, then phone. The original
    // bug surfaced this gap: when only phone was provided, every coordinar
    // produced a brand-new contact, leaving the contacts table littered.
    let contactId: string | null = null
    if (contact_email) {
      const { data: existing } = await supabase.from('contacts').select('id').eq('email', contact_email).maybeSingle()
      if (existing) contactId = existing.id
    }
    if (!contactId && contact_phone) {
      const { data: existing } = await supabase.from('contacts').select('id').eq('phone', contact_phone).maybeSingle()
      if (existing) contactId = existing.id
    }

    if (!contactId) {
      const { data: newContact, error: cErr } = await supabase
        .from('contacts')
        .insert({ full_name: contact_name, phone: contact_phone || null, email: contact_email || null, origin: origin || null, assigned_to: assigned_to || null })
        .select('id').single()
      if (cErr) throw cErr
      contactId = newContact.id
    }

    if (!contactId) throw new Error('No se pudo crear/encontrar el contacto')

    // Create deal. created_by persists who coordinated so notifyDealCreated
    // can resolve the coordinador later even if the cookie session changes.
    const dealId = await createDeal({
      contact_id: contactId,
      property_address,
      scheduled_date: scheduled_date || null,
      scheduled_time: scheduled_time || null,
      origin: origin || null,
      assigned_to: assigned_to || null,
      created_by: user.id,
      notes: notes || null,
      property_type,
      property_type_other: property_type === 'otro' ? property_type_other : null,
      neighborhood,
      rooms: typeof rooms === 'number' ? rooms : parseInt(rooms, 10),
      covered_area: covered_area != null && covered_area !== '' ? Number(covered_area) : null,
    } as any)

    // Auto-create tasks
    if (assigned_to) {
      try {
        // Task for asesor: new assignment
        await createTask({
          type: 'new_assignment',
          title: `Tasación coordinada: ${property_address}`,
          description: `Contacto: ${contact_name}. ${scheduled_date ? 'Fecha: ' + scheduled_date : ''}`,
          assigned_to,
          deal_id: dealId,
          contact_id: contactId,
        })
      } catch (err) {
        console.error('Failed to create task:', err)
        // Don't fail the whole request if task creation fails
      }
    }

    // N1: notificar al asesor asignado y a admins+dueños.
    // Si el envío falla, escala a admins via notifyAdminEmailFailure.
    await notifyWithEscalation(
      () => notifyDealCreated({ dealId }),
      { failedNotificationType: 'deal_created', entityType: 'deal', entityId: dealId },
    )

    return NextResponse.json({ success: true, id: dealId, contact_id: contactId })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
