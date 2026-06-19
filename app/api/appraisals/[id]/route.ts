import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { replaceAppraisalComparables } from '@/lib/supabase/appraisals-write'
import type { SaveAppraisalInput } from '@/lib/supabase/appraisals'

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

/**
 * Actualiza una tasación existente SERVER-SIDE (service role): update de la row
 * principal + replace de los comparables. Mismo patrón confiable que el POST.
 */
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // requireAuth() puede llamar redirect() (throw NEXT_REDIRECT). Va FUERA del
  // try para que el redirect propague a Next.js en vez de convertirse en 500.
  await requireAuth()
  try {
    const { id } = await params
    const input = (await req.json()) as SaveAppraisalInput

    if (!input?.subject || !input?.valuationResult) {
      return NextResponse.json({ error: 'Faltan datos: subject y valuationResult son requeridos' }, { status: 400 })
    }
    if (!Array.isArray(input.comparables)) {
      return NextResponse.json({ error: 'comparables debe ser un array' }, { status: 400 })
    }

    const supabase = getAdmin()
    await replaceAppraisalComparables(supabase, id, input)

    return NextResponse.json({ success: true })
  } catch (error) {
    const e = error as { message?: string; code?: string; details?: string; hint?: string }
    console.error('[PUT /api/appraisals/[id]] update failed', { message: e?.message, code: e?.code, details: e?.details, hint: e?.hint, raw: error })
    return NextResponse.json(
      { error: e?.message || 'Error al actualizar la tasación', code: e?.code, detail: e?.details, hint: e?.hint },
      { status: 500 },
    )
  }
}

/**
 * Actualiza SOLO `report_edits` (textos, overrides de precio, layout de páginas del PDF).
 * NO toca comparables ni el valuation_result — a diferencia del PUT, no borra/reinserta
 * nada. Es el camino seguro para guardar ajustes de presentación desde el modal de preview.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth()
  try {
    const { id } = await params
    const body = (await req.json()) as { reportEdits?: unknown }
    if (body?.reportEdits === undefined) {
      return NextResponse.json({ error: 'reportEdits es requerido' }, { status: 400 })
    }
    const supabase = getAdmin()
    const { error } = await supabase
      .from('appraisals')
      .update({ report_edits: body.reportEdits } as never)
      .eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    const e = error as { message?: string }
    console.error('[PATCH /api/appraisals/[id]] report_edits update failed', error)
    return NextResponse.json({ error: e?.message || 'Error al guardar los ajustes del informe' }, { status: 500 })
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
