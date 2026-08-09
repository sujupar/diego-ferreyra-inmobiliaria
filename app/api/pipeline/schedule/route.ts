import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'

export async function POST(request: NextRequest) {
  // Cierra la escritura ANÓNIMA en `contacts` y `scheduled_appraisals`
  // (service-role, RLS no aplica). El guard va ANTES del try a propósito:
  // `requireAuth` lanza NEXT_REDIRECT y un catch alrededor lo convertiría en
  // un 500 opaco en vez del 307 a /login.
  // NOTA: a hoy esta ruta no tiene ningún llamador conocido en el repo (ni en
  // las Netlify Functions ni en scripts/). Candidata a borrarse cuando se
  // confirme contra los logs de acceso que tampoco la usa nada externo.
  await requireAuth()
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
