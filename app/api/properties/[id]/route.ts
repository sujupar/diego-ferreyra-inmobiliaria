import { NextRequest, NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getProperty, updateProperty } from '@/lib/supabase/properties'
import { requireAuth, requireRole } from '@/lib/auth/require-role'
import { canAccessProperty } from '@/lib/auth/entity-access'

/** URL de media → <iframe src> en landing pública: solo https:// (anti XSS almacenado). */
function sanitizeHttpsUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  if (!s || s.length > 2000) return null
  return /^https:\/\//i.test(s) ? s : null
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Solo requireAuth en la LECTURA: el listado de propiedades (properties/page.tsx)
    // muestra TODAS a cualquier staff autenticado por diseño (toggle "solo mías" off por
    // default), así que un asesor puede abrir el detalle de cualquiera. El IDOR severo
    // (editar/borrar/media/marketing ajeno) se cierra en las MUTACIONES, no en el read.
    await requireAuth()
    const { id } = await params
    const data = await getProperty(id)
    return NextResponse.json({ data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await canAccessProperty(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const body = await request.json()
    // Anti XSS almacenado: si por esta ruta genérica llegan URLs de media, forzar https://.
    if (body && typeof body === 'object') {
      if ('tour_3d_url' in body) body.tour_3d_url = sanitizeHttpsUrl(body.tour_3d_url)
      if ('video_url' in body) body.video_url = sanitizeHttpsUrl(body.video_url)
    }
    // El circuito legal ya NO vive en `status` (2026-08-09, ver
    // lib/properties/captacion.ts). Este PUT pisa `status` sin mirar el estado
    // previo, así que dejarlo aceptar 'pending_review' era poder degradar una
    // propiedad publicada: landing en 404 con tráfico pago encima, consultas
    // rechazadas con 410, agendamiento del recorrido apagado — y el aviso igual
    // de vivo en MercadoLibre, porque el trigger de despublicación solo
    // reacciona a 'sold'/'withdrawn'. Se cierra en la puerta.
    if (body?.status === 'pending_review') {
      return NextResponse.json(
        { error: 'La revisión legal ya no se pide cambiando el estado. Usá POST /api/properties/[id]/legal-submit.' },
        { status: 400 },
      )
    }

    // El precio tiene UNA sola puerta: PATCH /api/properties/[id]/details, que
    // compara contra el precio real de la base y frena un cambio brusco sin
    // confirmar. Este PUT acepta el body entero sin mirar nada, así que
    // dejarlo tocar el precio sería un desvío alrededor de ese freno — y este
    // número se publica solo en una landing con pauta encima.
    if (body && typeof body === 'object' && ('asking_price' in body || 'currency' in body)) {
      return NextResponse.json(
        { error: 'El precio y la moneda se cambian en PATCH /api/properties/[id]/details, que valida el cambio antes de publicarlo.' },
        { status: 400 },
      )
    }

    await updateProperty(id, body)

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}

/**
 * DELETE /api/properties/[id]
 *
 * Borra la propiedad definitivamente. Sus FKs descendientes (property_listings,
 * legal_review_events, property_metrics_daily, property_publish_events) caen
 * por CASCADE; FKs externas (deals, tasks, etc.) quedan con NULL gracias a la
 * migración 20260512000004 (ON DELETE SET NULL).
 *
 * Solo admin/dueño. Para descartar sin borrar histórico, usar PUT con
 * `status: 'descartada'`.
 */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole('admin', 'dueno')
    const { id } = await params

    const supabase = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { error } = await supabase.from('properties').delete().eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('DELETE /api/properties/[id] error:', error)
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
