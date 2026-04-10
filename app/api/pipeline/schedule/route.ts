import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { contact_name, contact_phone, contact_email, property_address, scheduled_date, scheduled_time, origin, assigned_to, notes } = body

    if (!contact_name || !property_address || !scheduled_date) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Create or find contact
    let contactId: string | null = null
    if (contact_email) {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('email', contact_email)
        .single()

      if (existing) {
        contactId = existing.id
      }
    }

    if (!contactId) {
      const { data: newContact, error: contactErr } = await supabase
        .from('contacts')
        .insert({
          full_name: contact_name,
          phone: contact_phone || null,
          email: contact_email || null,
          origin: origin || null,
          assigned_to: assigned_to || null,
        })
        .select('id')
        .single()

      if (contactErr) throw contactErr
      contactId = newContact.id
    }

    // Create scheduled appraisal
    const { data, error } = await supabase
      .from('scheduled_appraisals')
      .insert({
        contact_name,
        contact_phone: contact_phone || null,
        contact_email: contact_email || null,
        contact_id: contactId,
        property_address,
        scheduled_date,
        scheduled_time: scheduled_time || null,
        origin: origin || null,
        assigned_to: assigned_to || null,
        notes: notes || null,
      })
      .select('id')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, id: data.id, contact_id: contactId })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
