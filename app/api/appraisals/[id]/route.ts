import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = getAdmin()

    const [appraisalRes, comparablesRes] = await Promise.all([
      supabase.from('appraisals').select('*').eq('id', id).single(),
      supabase.from('appraisal_comparables').select('*').eq('appraisal_id', id).order('sort_order'),
    ])

    if (appraisalRes.error) {
      if (appraisalRes.error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
      throw appraisalRes.error
    }

    return NextResponse.json({
      data: { ...appraisalRes.data, comparables: comparablesRes.data || [] },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = getAdmin()
    const { error } = await supabase.from('appraisals').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
