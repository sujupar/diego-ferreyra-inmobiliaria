import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { canAccessProperty } from '@/lib/auth/entity-access'
import {
  buildStatusPatch, estadoComercialEfectivo, isCommercialStatus, validateStatusChange,
} from '@/lib/properties/commercial-status'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Historial de cambios de estado, del más nuevo al más viejo. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const { id } = await params
    const { data, error } = await admin()
      .from('property_status_events')
      .select('id, from_status, to_status, reason, sold_price, sold_currency, sold_at, created_at, profiles:changed_by(full_name)')
      .eq('property_id', id)
      .order('created_at', { ascending: false })
      .limit(50)
    if (error) throw error

    const events = (data ?? []).map(e => {
      const { profiles, ...rest } = e as typeof e & { profiles?: { full_name?: string } | null }
      return { ...rest, changed_by_name: profiles?.full_name ?? null }
    })
    return NextResponse.json({ events })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    // El abogado no ve ni toca datos comerciales.
    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const { id } = await params
    if (!(await canAccessProperty(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const to = body?.status
    if (!isCommercialStatus(to)) {
      return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 })
    }

    const db = admin()
    const { data: prop, error: readErr } = await db
      .from('properties')
      .select('commercial_status, currency, status')
      .eq('id', id)
      .maybeSingle()
    if (readErr) throw readErr
    if (!prop) return NextResponse.json({ error: 'Propiedad no encontrada.' }, { status: 404 })

    // El estado de origen NO se lee del cliente (se re-deriva acá) y contempla
    // el espejo heredado: una propiedad descartada en masa desde el listado
    // tiene `status='descartada'` con `commercial_status='disponible'`. Sin
    // esto, `buildStatusPatch` nunca entraba en la rama `from==='descartada'` y
    // marcarla "Disponible" dejaba `status='descartada'` intacto en la base:
    // el botón de recuperarla existía y no recuperaba nada.
    const from = estadoComercialEfectivo({
      commercialStatus: prop.commercial_status,
      status: prop.status,
    })

    const input = {
      from,
      to,
      reason: typeof body.reason === 'string' ? body.reason : null,
      soldPrice: typeof body.soldPrice === 'number' ? body.soldPrice : null,
      soldCurrency: typeof body.soldCurrency === 'string' ? body.soldCurrency : (to === 'vendida' ? prop.currency : null),
      soldAt: typeof body.soldAt === 'string' ? body.soldAt : null,
    }

    const check = validateStatusChange(input)
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 })
    }

    const patch = buildStatusPatch(input)
    const { error: updErr } = await db
      .from('properties')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (updErr) throw updErr

    // El evento va DESPUÉS del update, con un reintento. Son dos escrituras sin
    // transacción (el cliente de Supabase no expone transacciones multi-tabla):
    // preferimos perder el registro histórico antes que dejar al usuario sin
    // poder cambiar el estado. Si esto se vuelve frecuente, mover a una RPC.
    const evento = {
      property_id: id,
      from_status: from,
      to_status: to,
      reason: input.reason,
      sold_price: patch.sold_price,
      sold_currency: patch.sold_currency,
      sold_at: patch.sold_at,
      changed_by: user.id,
    }
    let warning: string | undefined
    const primero = await db.from('property_status_events').insert(evento)
    if (primero.error) {
      const segundo = await db.from('property_status_events').insert(evento)
      if (segundo.error) {
        console.error('[commercial-status] el estado se guardó pero el evento no:', segundo.error)
        warning = 'El estado se guardó, pero no se pudo registrar en el historial.'
      }
    }

    return NextResponse.json({ ok: true, ...(warning ? { warning } : {}) })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
