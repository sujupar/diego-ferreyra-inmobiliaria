import { NextRequest, NextResponse } from 'next/server'
import { createDeal, getDeals } from '@/lib/supabase/deals'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const data = await getDeals({
      stage: searchParams.get('stage') || undefined,
      origin: searchParams.get('origin') || undefined,
      assigned_to: searchParams.get('assigned_to') || undefined,
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
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

    return NextResponse.json({ data: enriched })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { contact_name, contact_phone, contact_email, property_address, scheduled_date, scheduled_time, origin, assigned_to, notes } = body

    if (!contact_name || !property_address) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const supabase = getAdmin()

    // Create or find contact
    let contactId: string | null = null
    if (contact_email) {
      const { data: existing } = await supabase.from('contacts').select('id').eq('email', contact_email).single()
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

    // Create deal
    const dealId = await createDeal({
      contact_id: contactId,
      property_address,
      scheduled_date: scheduled_date || null,
      scheduled_time: scheduled_time || null,
      origin: origin || null,
      assigned_to: assigned_to || null,
      notes: notes || null,
    })

    return NextResponse.json({ success: true, id: dealId, contact_id: contactId })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
