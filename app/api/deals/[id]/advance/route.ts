import { NextRequest, NextResponse } from 'next/server'
import { updateDealStage, linkAppraisalToDeal, linkPropertyToDeal, DealStage } from '@/lib/supabase/deals'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { stage, notes, appraisal_id, property_id } = await request.json()

    if (!stage) return NextResponse.json({ error: 'Missing stage' }, { status: 400 })

    const validStages: DealStage[] = ['scheduled', 'visited', 'appraisal_sent', 'followup', 'captured', 'lost']
    if (!validStages.includes(stage)) return NextResponse.json({ error: 'Invalid stage' }, { status: 400 })

    // If linking an appraisal, use the dedicated function
    if (appraisal_id && stage === 'appraisal_sent') {
      await linkAppraisalToDeal(id, appraisal_id)
      return NextResponse.json({ success: true })
    }

    // If linking a property, use the dedicated function
    if (property_id && stage === 'captured') {
      await linkPropertyToDeal(id, property_id)
      return NextResponse.json({ success: true })
    }

    // Otherwise just update the stage
    await updateDealStage(id, stage, notes)
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
