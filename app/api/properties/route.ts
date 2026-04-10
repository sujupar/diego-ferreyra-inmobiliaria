import { NextRequest, NextResponse } from 'next/server'
import { createProperty, getProperties } from '@/lib/supabase/properties'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined
    const origin = searchParams.get('origin') || undefined
    const data = await getProperties({ status, origin })
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const id = await createProperty(body)
    return NextResponse.json({ success: true, id })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
