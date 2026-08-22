/**
 * POST /api/properties/[id]/property-type — corrige el TIPO de propiedad.
 *
 * Endpoint DEDICADO (no el PUT genérico) para que cambiar el tipo NO dispare los
 * efectos secundarios del PUT (crear tarea + email al pasar a pending_review).
 * Actualiza SOLO `property_type`. Gateado igual que commercial-status (abogado 403).
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { canAccessProperty } from '@/lib/auth/entity-access'
import { isPropertyType } from '@/lib/properties/property-type'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const { id } = await params
    if (!(await canAccessProperty(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const type = body?.propertyType
    if (!isPropertyType(type)) {
      return NextResponse.json({ error: 'Tipo de propiedad inválido.' }, { status: 400 })
    }

    const { error } = await admin()
      .from('properties')
      .update({ property_type: type, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    return NextResponse.json({ ok: true, propertyType: type })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
