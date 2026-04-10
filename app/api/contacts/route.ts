import { NextRequest, NextResponse } from 'next/server'
import { createContact, getContacts } from '@/lib/supabase/contacts'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const assigned_to = searchParams.get('assigned_to') || undefined
    const origin = searchParams.get('origin') || undefined
    const data = await getContacts({ assigned_to, origin })
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const id = await createContact(body)
    return NextResponse.json({ success: true, id })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
