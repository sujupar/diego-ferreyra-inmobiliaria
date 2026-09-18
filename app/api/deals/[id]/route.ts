import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getDeal, updateDealNotes, updateDealSchedule } from '@/lib/supabase/deals'
import { requireAuth, requireRole } from '@/lib/auth/require-role'
import { canAccessDeal } from '@/lib/auth/entity-access'
import { puedeReasignarAsesor } from '@/lib/deals/proceso-manual'
import { esAsesorAsignable } from '@/lib/deals/asesor-asignable'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await canAccessDeal(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const data = await getDeal(id)
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await canAccessDeal(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const body = await request.json()

    const hasNotes = typeof body?.notes === 'string'
    const hasSchedule = 'scheduled_date' in (body ?? {}) || 'scheduled_time' in (body ?? {})
    const nuevoAsesor = typeof body?.assigned_to === 'string' ? body.assigned_to.trim() : null

    if (!hasNotes && !hasSchedule && !nuevoAsesor) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    // REASIGNAR EL ASESOR (2026-09-17). Los procesos creados a mano quedaron sin
    // asesor, y el CRM le muestra a cada uno solo lo asignado a él: sin esto, un
    // proceso sin asesor es invisible para siempre.
    //
    // Mover trabajo entre asesores es decisión de quien ve todo el pipeline
    // (admin, dueño, coordinador). Un asesor que pudiera hacerlo se sacaría
    // procesos de encima o se los quitaría a otro. Se decide por PERMISO y no
    // por nombre de rol (`puedeReasignarAsesor`, la misma regla que usa la
    // pantalla para no ofrecer un botón que acá respondería 403).
    if (nuevoAsesor) {
      if (!puedeReasignarAsesor(user.profile.role)) {
        return NextResponse.json(
          { error: 'Solo un coordinador, dueño o admin puede cambiar el asesor de un proceso.' },
          { status: 403 },
        )
      }

      const admin = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      if (!(await esAsesorAsignable(admin, nuevoAsesor))) {
        return NextResponse.json(
          { error: 'Ese usuario no puede tener procesos asignados (tiene que ser un asesor activo).' },
          { status: 400 },
        )
      }

      const { error } = await admin
        .from('deals')
        .update({ assigned_to: nuevoAsesor, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw new Error(error.message)
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
