import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/require-role'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED_ROLES = ['admin', 'dueno', 'coordinador']

const Schema = z.object({
  portal: z.string().trim().min(1).max(40),
  externalCode: z.string().trim().min(1).max(60),
  address: z.string().trim().min(3).max(200), // obligatoria por decisión de producto
  assignedTo: z.string().uuid(),
  propertyId: z.string().uuid().nullable().optional(),
  externalUrl: z.string().trim().max(500).nullable().optional(),
})

/**
 * POST /api/portal-inquiries/identify
 *
 * Identifica un aviso: completa su fila en portal_property_map y corrige HACIA
 * ATRÁS todas las consultas de ese código (asesor, propiedad, dirección). Las
 * consultas futuras del mismo aviso rutean solas por código.
 *
 * Idempotente: volver a identificar el mismo aviso pisa los valores anteriores
 * (así se corrige una identificación equivocada).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireAuth()
    if (!ALLOWED_ROLES.includes(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await req.json().catch(() => null)
    const parsed = Schema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json({ error: 'datos_invalidos' }, { status: 400 })
    }
    const d = parsed.data
    const supabase = getAdmin()

    // 1) Completar (o crear) la fila del mapa de ese aviso.
    const record = {
      portal: d.portal,
      external_code: d.externalCode,
      address: d.address,
      assigned_to: d.assignedTo,
      property_id: d.propertyId ?? null,
      external_url: d.externalUrl || null,
      active: true,
    }
    const { data: existing } = await supabase
      .from('portal_property_map')
      .select('id')
      .eq('portal', d.portal)
      .eq('external_code', d.externalCode)
      .maybeSingle()

    let mapId: string | null = (existing as { id?: string } | null)?.id ?? null
    if (mapId) {
      const { error } = await supabase.from('portal_property_map').update(record).eq('id', mapId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    } else {
      const { data: created, error } = await supabase
        .from('portal_property_map')
        .insert(record)
        .select('id')
        .single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      mapId = (created as { id: string }).id
    }

    // 2) Corregir hacia atrás las consultas de ese aviso.
    const { data: updated, error: updErr } = await supabase
      .from('portal_inquiries')
      .update({
        assigned_to: d.assignedTo,
        property_id: d.propertyId ?? null,
        property_address: d.address,
        matched_map_id: mapId,
        is_unmatched: false,
      })
      .eq('portal', d.portal)
      .eq('property_external_code', d.externalCode)
      .select('id')
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

    return NextResponse.json({ updatedInquiries: (updated ?? []).length })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
