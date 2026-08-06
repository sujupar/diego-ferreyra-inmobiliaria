import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { groupUnidentified, type UnidentifiedInquiryRow } from '@/lib/portals/unidentified'

export const dynamic = 'force-dynamic'

// Cliente service-role sin tipar: las tablas portal_* no están en
// database.types (misma convención que app/api/portal-inquiries/route.ts).
function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED_ROLES = ['admin', 'dueno', 'coordinador']

/**
 * GET /api/portal-inquiries/unidentified
 *
 * Los avisos cuyas consultas llegaron sin propiedad identificada, agrupados
 * (un ítem por aviso, no por consulta). Alimenta la pantalla "Avisos por
 * identificar" y el cartel del inicio.
 */
export async function GET() {
  try {
    const user = await requireAuth()
    if (!ALLOWED_ROLES.includes(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const supabase = getAdmin()
    const { data, error } = await supabase
      .from('portal_inquiries')
      .select('portal, property_external_code, raw_subject, lead_name, created_at, received_at')
      .is('property_id', null)
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data: groupUnidentified((data ?? []) as UnidentifiedInquiryRow[]) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
