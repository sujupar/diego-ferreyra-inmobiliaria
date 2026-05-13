import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getDeal, updateDealNotes } from '@/lib/supabase/deals'
import { requireAuth, requireRole } from '@/lib/auth/require-role'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await params
    const data = await getDeal(id)
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth()
    const { id } = await params
    const body = await request.json()
    const { notes } = body
    if (typeof notes !== 'string') {
      return NextResponse.json({ error: 'notes required (string)' }, { status: 400 })
    }
    await updateDealNotes(id, notes)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('PUT /api/deals/[id] error:', error)
    return NextResponse.json({ error: 'Failed to update deal' }, { status: 500 })
  }
}

/**
 * DELETE /api/deals/[id]
 *
 * Borra el proceso comercial definitivamente. Las FKs externas (tasks, etc.)
 * quedan con deal_id=NULL gracias a la migración 20260513000000.
 *
 * No toca la tasación, propiedad, ni contacto asociados — sigue existiendo
 * todo el histórico relacionado, solo desaparece el proceso comercial.
 *
 * Solo admin/dueño.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin', 'dueno')
    const { id } = await params
    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { error } = await supabase.from('deals').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/deals/[id] error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
