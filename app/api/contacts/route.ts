import { NextRequest, NextResponse } from 'next/server'
import { createContact, getContacts } from '@/lib/supabase/contacts'
import { requireAuth } from '@/lib/auth/require-role'

export async function GET(request: NextRequest) {
  // Cierra el dump anónimo de PII de contactos (service-role bypassa RLS).
  await requireAuth()
  try {
    const { searchParams } = new URL(request.url)
    const assigned_to = searchParams.get('assigned_to') || undefined
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
