import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { canAccessAppraisal } from '@/lib/auth/entity-access'
import {
  alcanceTasaciones, proyeccionDeTasacion, puedeBorrarTasacion, puedeEditarTasacion,
} from '@/lib/auth/appraisal-access'
import { replaceAppraisalComparables } from '@/lib/supabase/appraisals-write'
import type { SaveAppraisalInput } from '@/lib/supabase/appraisals'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Guard fuera del try para que el NEXT_REDIRECT de requireAuth propague a Next
  // en vez de convertirse en un 500. Cierra el acceso anónimo (data de cliente + valuación).
  const user = await requireAuth()
  try {
    const { id } = await params
    if (!(await canAccessAppraisal(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const supabase = getAdmin()

    // Cuánto de la tasación viaja, según el alcance del rol. El abogado
    // (alcance `vinculadas`) recibe la ficha RESUMIDA: el servidor selecciona
    // menos columnas y no toca los comparables — no es la pantalla la que
    // esconde. Ver `proyeccionDeTasacion`.
    const proyeccion = proyeccionDeTasacion(alcanceTasaciones(user.profile.role))

    const [appraisalRes, comparablesRes] = await Promise.all([
      supabase.from('appraisals').select(proyeccion.columnas).eq('id', id).single(),
      proyeccion.comparables
        ? supabase.from('appraisal_comparables').select('*').eq('appraisal_id', id).order('sort_order')
        : Promise.resolve({ data: [] as unknown[], error: null }),
    ])

    if (appraisalRes.error) {
      if (appraisalRes.error.code === 'PGRST116') return NextResponse.json({ error: 'Not found' }, { status: 404 })
      throw appraisalRes.error
    }

    // El `select` ahora recibe una variable, no un literal: supabase-js deduce
    // la forma de la fila del texto del `select`, así que sin literal el tipo
    // de `data` deja de ser un objeto y el spread no compila. La fila es la que
    // pidió la proyección; el cast lo dice de una vez.
    const fila = appraisalRes.data as unknown as Record<string, unknown>

    return NextResponse.json({
      data: { ...fila, comparables: comparablesRes.data || [] },
      // Le avisa a la pantalla de la tasación que esto NO alcanza para armar el
      // informe. Ver `ProyeccionTasacion.resumida`.
      resumida: proyeccion.resumida,
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
  const user = await requireAuth()
  try {
    const { id } = await params
    // DOS candados, como en el DELETE. `canAccessAppraisal` dice si la tasación
    // cae en su alcance; este dice si ese alcance ESCRIBE. Sin él, la lectura
    // acotada del abogado (alcance `vinculadas`) sería permiso para reescribir
    // la valuación de la propiedad que está revisando.
    if (!puedeEditarTasacion(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (!(await canAccessAppraisal(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
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
  const user = await requireAuth()
  try {
    const { id } = await params
    // Mismo par de candados que el PUT: guardar los ajustes del informe también
    // es escribir la tasación.
    if (!puedeEditarTasacion(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (!(await canAccessAppraisal(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
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
  const user = await requireAuth()
  try {
    const { id } = await params
    // D1: DOS candados, no uno. El de abajo (`canAccessAppraisal`) responde
    // "¿esta tasación es suya?"; este responde "¿este rol borra tasaciones?".
    // Van separados a propósito: si alguna vez se ensancha el acceso de
    // lectura, el borrado —que es duro e irreversible, sin papelera— no se
    // ensancha solo de arrastre. Roles: admin/dueño/coordinador borran
    // cualquiera, asesor solo las suyas, abogado ninguna.
    if (!puedeBorrarTasacion(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (!(await canAccessAppraisal(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const supabase = getAdmin()
    const { error } = await supabase.from('appraisals').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
