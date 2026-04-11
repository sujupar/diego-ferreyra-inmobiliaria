import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '12')
    const from = searchParams.get('from')
    const to = searchParams.get('to')
    const assignedTo = searchParams.get('assigned_to')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const rangeFrom = (page - 1) * limit
    const rangeTo = rangeFrom + limit - 1

    let query = supabase
      .from('appraisals')
      .select(
        'id, property_title, property_location, publication_price, currency, comparable_count, created_at, origin, assigned_to',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })

    if (from) query = query.gte('created_at', from + 'T00:00:00Z')
    if (to) query = query.lte('created_at', to + 'T23:59:59Z')
    if (assignedTo) query = query.eq('assigned_to', assignedTo)

    const { data, error, count } = await query.range(rangeFrom, rangeTo)

    if (error) throw error

    return NextResponse.json({ data: data || [], count: count || 0 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
