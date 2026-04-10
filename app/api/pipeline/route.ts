import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const from = searchParams.get('from')
    const to = searchParams.get('to')

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch appraisals with assigned user name
    let appraisalQuery = supabase
      .from('appraisals')
      .select('id, property_title, property_location, origin, assigned_to, created_at, publication_price, currency')
      .order('created_at', { ascending: false })
      .limit(200)

    if (from) appraisalQuery = appraisalQuery.gte('created_at', from + 'T00:00:00Z')
    if (to) appraisalQuery = appraisalQuery.lte('created_at', to + 'T23:59:59Z')

    const { data: appraisalsRaw, error: apprErr } = await appraisalQuery

    if (apprErr) throw apprErr

    // Get assigned user names
    const assignedIds = [...new Set((appraisalsRaw || []).map(a => a.assigned_to).filter(Boolean))]
    let profileMap: Record<string, string> = {}
    if (assignedIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', assignedIds)
      for (const p of profiles || []) {
        profileMap[p.id] = p.full_name
      }
    }

    const appraisals = (appraisalsRaw || []).map(a => ({
      id: a.id,
      type: 'appraisal' as const,
      title: a.property_title || 'Sin titulo',
      location: a.property_location,
      status: 'completed',
      origin: a.origin,
      assigned_to_name: a.assigned_to ? profileMap[a.assigned_to] || null : null,
      created_at: a.created_at,
      price: a.publication_price,
      currency: a.currency,
    }))

    // Fetch properties
    let propQuery = supabase
      .from('properties')
      .select('id, address, neighborhood, origin, status, created_at, asking_price, currency, assigned_to')
      .order('created_at', { ascending: false })
      .limit(200)

    if (from) propQuery = propQuery.gte('created_at', from + 'T00:00:00Z')
    if (to) propQuery = propQuery.lte('created_at', to + 'T23:59:59Z')

    const { data: propertiesRaw, error: propErr } = await propQuery

    if (propErr) throw propErr

    const propAssignedIds = [...new Set((propertiesRaw || []).map(p => p.assigned_to).filter(Boolean))]
    if (propAssignedIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', propAssignedIds)
      for (const p of profiles || []) {
        profileMap[p.id] = p.full_name
      }
    }

    const properties = (propertiesRaw || []).map(p => ({
      id: p.id,
      type: 'property' as const,
      title: p.address,
      location: p.neighborhood,
      status: p.status,
      origin: p.origin,
      assigned_to_name: p.assigned_to ? profileMap[p.assigned_to] || null : null,
      created_at: p.created_at,
      price: p.asking_price,
      currency: p.currency,
    }))

    return NextResponse.json({ appraisals, properties })
  } catch (error) {
    console.error('Pipeline API error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error' },
      { status: 500 }
    )
  }
}
