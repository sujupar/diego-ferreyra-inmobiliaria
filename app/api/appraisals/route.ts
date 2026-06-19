import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { getUser } from '@/lib/auth/get-user'
import { insertAppraisalWithComparables } from '@/lib/supabase/appraisals-write'
import type { SaveAppraisalInput } from '@/lib/supabase/appraisals'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(request: NextRequest) {
  try {
    // Usuario EFECTIVO (impersonation-aware: si un admin está "viendo como" un asesor,
    // me.id es el del asesor). El scope del asesor se decide acá en el server, no en el
    // cliente — así no se puede falsear el query param para ver tasaciones ajenas.
    const me = await getUser()
    if (!me) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

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

    // El asesor SOLO ve sus tasaciones: las que creó (user_id) O las que tiene asignadas
    // (assigned_to). Antes filtraba solo por assigned_to → si la tasación no se asignaba
    // explícitamente, no aparecía (mostraba 0). Coordinador/admin ven todo (o filtrado).
    if (me.profile.role === 'asesor') {
      query = query.or(`assigned_to.eq.${me.id},user_id.eq.${me.id}`)
    } else if (assignedTo) {
      query = query.eq('assigned_to', assignedTo)
    }

    const { data, error, count } = await query.range(rangeFrom, rangeTo)

    if (error) throw error

    return NextResponse.json({ data: data || [], count: count || 0 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

/**
 * Crea una tasación de forma confiable: SERVER-SIDE con service role (bypassa
 * RLS), inserción atómica (cleanup compensatorio si falla un comparable) y, si
 * viene `dealId`, vincula la tasación al proceso en la misma request.
 *
 * Reemplaza el guardado client-side (browser client + RLS) que fallaba en
 * silencio y no persistía. Cualquier error se devuelve con código HTTP y
 * detalle real (code/detail/hint), y se loguea server-side (Netlify logs).
 */
export async function POST(request: NextRequest) {
  // requireAuth() puede llamar redirect() (throw NEXT_REDIRECT). Va FUERA del
  // try para que el redirect propague a Next.js en vez de convertirse en 500.
  const user = await requireAuth()
  try {
    const input = (await request.json()) as SaveAppraisalInput & { dealId?: string }

    // Validaciones mínimas — el subject y un valuationResult válido son NOT NULL en DB.
    if (!input?.subject || !input?.valuationResult) {
      return NextResponse.json({ error: 'Faltan datos: subject y valuationResult son requeridos' }, { status: 400 })
    }
    if (!Array.isArray(input.comparables)) {
      return NextResponse.json({ error: 'comparables debe ser un array' }, { status: 400 })
    }

    // Atribuir la tasación al usuario autenticado (el browser no manda userId).
    // Mejora la trazabilidad y la visibilidad por RLS (user_id = auth.uid()).
    if (!input.userId) input.userId = user.id

    // Si un ASESOR crea la tasación y no eligió asignado, se la asignamos a él mismo
    // (user vía requireAuth → impersonation-aware). Así aparece en SU historial y su
    // foto sale en el informe (la foto del asesor se resuelve por assigned_to).
    if (!input.assignedTo && user.profile.role === 'asesor') input.assignedTo = user.id

    const supabase = getAdmin()
    const appraisalId = await insertAppraisalWithComparables(supabase, input)

    // Vínculo con el proceso (deal) — best-effort, pero ahora con service role
    // (confiable) y logueado. NO bloquea el éxito del guardado de la tasación:
    // la tasación ya quedó persistida en el historial.
    let linkWarning: string | null = null
    if (input.dealId) {
      const { error: linkError } = await supabase
        .from('deals')
        .update({ appraisal_id: appraisalId, updated_at: new Date().toISOString() })
        .eq('id', input.dealId)
      if (linkError) {
        linkWarning = linkError.message
        console.error('[POST /api/appraisals] link-to-deal failed', { dealId: input.dealId, appraisalId, error: linkError })
      }
    }

    return NextResponse.json({ id: appraisalId, linkWarning })
  } catch (error) {
    const e = error as { message?: string; code?: string; details?: string; hint?: string }
    console.error('[POST /api/appraisals] save failed', { message: e?.message, code: e?.code, details: e?.details, hint: e?.hint, raw: error })
    return NextResponse.json(
      { error: e?.message || 'Error al guardar la tasación', code: e?.code, detail: e?.details, hint: e?.hint },
      { status: 500 },
    )
  }
}
