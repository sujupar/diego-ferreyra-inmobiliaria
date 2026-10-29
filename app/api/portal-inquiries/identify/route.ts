import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { requireAuth } from '@/lib/auth/require-role'
import { identificarAviso } from '@/lib/consultas/identificar'

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

    // Mapa + corrección hacia atrás: la misma pieza que usa la sección Consultas
    // al conectar una consulta "recordando el aviso".
    const { actualizadas } = await identificarAviso(getAdmin(), {
      portal: d.portal,
      externalCode: d.externalCode,
      address: d.address,
      assignedTo: d.assignedTo,
      propertyId: d.propertyId ?? null,
      externalUrl: d.externalUrl ?? null,
    })

    return NextResponse.json({ updatedInquiries: actualizadas })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
