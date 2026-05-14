import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth/get-user'

export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const sp = req.nextUrl.searchParams
  const propertyId = sp.get('propertyId')
  const appraisalId = sp.get('appraisalId')

  if (!propertyId && !appraisalId) {
    return NextResponse.json({ error: 'propertyId or appraisalId required' }, { status: 400 })
  }

  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)

  // Resolve the appraisal_id from properties if needed
  let resolvedAppraisalId: string | null = appraisalId

  if (propertyId) {
    const { data: property } = await supabase
      .from('properties')
      .select('appraisal_id')
      .eq('id', propertyId)
      .maybeSingle()
    resolvedAppraisalId = property?.appraisal_id ?? null
  }

  // Find the most relevant deal: prefer matching by property_id or appraisal_id
  let deal: {
    id: string
    visit_data: unknown
    visit_completed_at: string | null
    scheduled_appraisal_id: string | null
  } | null = null

  if (propertyId) {
    const { data } = await supabase
      .from('deals')
      .select('id, visit_data, visit_completed_at, scheduled_appraisal_id')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    deal = data
  }

  // Fallback: look up by appraisal_id on deals (covers the appraisalId param case
  // and also the case where propertyId produced no deal)
  if (!deal && resolvedAppraisalId) {
    const { data } = await supabase
      .from('deals')
      .select('id, visit_data, visit_completed_at, scheduled_appraisal_id')
      .eq('appraisal_id', resolvedAppraisalId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    deal = data
  }

  // Load scheduled_appraisal if linked
  let scheduledAppraisal: {
    id: string
    scheduling_notes: string | null
    buyer_interest: unknown
  } | null = null

  if (deal?.scheduled_appraisal_id) {
    const { data } = await supabase
      .from('scheduled_appraisals')
      .select('id, scheduling_notes, buyer_interest')
      .eq('id', deal.scheduled_appraisal_id)
      .maybeSingle()
    scheduledAppraisal = data
  }

  return NextResponse.json({
    data: {
      scheduledAppraisalId: scheduledAppraisal?.id ?? null,
      appraisalId: resolvedAppraisalId,
      schedulingNotes: scheduledAppraisal?.scheduling_notes ?? null,
      buyerInterest: (scheduledAppraisal?.buyer_interest as Record<string, unknown> | null) ?? null,
      visitData: (deal?.visit_data as Record<string, unknown> | null) ?? null,
      visitCompletedAt: deal?.visit_completed_at ?? null,
    },
  })
}
