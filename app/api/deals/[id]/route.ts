import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getDeal, updateDealNotes, updateDealSchedule } from '@/lib/supabase/deals'
import { requireAuth, requireRole } from '@/lib/auth/require-role'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/

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

    const hasNotes = typeof body?.notes === 'string'
    const hasSchedule = 'scheduled_date' in (body ?? {}) || 'scheduled_time' in (body ?? {})

    if (!hasNotes && !hasSchedule) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    if (hasNotes) {
      await updateDealNotes(id, body.notes)
    }

    if (hasSchedule) {
      const rawDate = body.scheduled_date
      const rawTime = body.scheduled_time

      const scheduledDate =
        rawDate === undefined || rawDate === null || rawDate === '' ? null : String(rawDate)
      const scheduledTime =
        rawTime === undefined || rawTime === null || rawTime === '' ? null : String(rawTime)

      if (scheduledDate !== null && !DATE_RE.test(scheduledDate)) {
        return NextResponse.json({ error: 'scheduled_date inválida (YYYY-MM-DD)' }, { status: 400 })
      }
      if (scheduledTime !== null && !TIME_RE.test(scheduledTime)) {
        return NextResponse.json({ error: 'scheduled_time inválida (HH:MM)' }, { status: 400 })
      }

      await updateDealSchedule(id, {
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
      })
    }

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
