import { NextRequest, NextResponse } from 'next/server'
import { createContact, getContacts } from '@/lib/supabase/contacts'
import { requireAuth } from '@/lib/auth/require-role'
import { resolverAlcanceAsignado } from '@/lib/auth/scope'

export async function GET(request: NextRequest) {
  // Cierra el dump anónimo de PII de contactos (service-role bypassa RLS).
  const user = await requireAuth()
  try {
    const { searchParams } = new URL(request.url)
    // El alcance NO se decide en el navegador: quien no tiene `pipeline.view_all`
    // queda forzado a sus propios contactos, se ignore lo que venga en la dirección.
    const assigned_to = resolverAlcanceAsignado(
      user.profile.role,
      user.profile.id || user.id,
      searchParams.get('assigned_to'),
    )
    const origin = searchParams.get('origin') || undefined
    const from = searchParams.get('from') || undefined
    const to = searchParams.get('to') || undefined
    const data = await getContacts({ assigned_to, origin, from, to })
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // Cierra la inyección anónima de contactos.
  await requireAuth()
  try {
    const body = await request.json()
    const id = await createContact(body)
    return NextResponse.json({ success: true, id })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
