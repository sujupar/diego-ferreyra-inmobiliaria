import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { parsePortalLink } from '@/lib/portals/portal-link'

export const dynamic = 'force-dynamic'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED_ROLES = ['admin', 'dueno', 'coordinador']

/**
 * GET /api/portal-inquiries/resolve-link?url=<link del aviso>
 *
 * Traduce el link pegado a la propiedad del CRM: del link sale el id del aviso,
 * y ese id es `properties.import_external_id`. Si aparece, devolvemos su
 * dirección y su asesor para autocompletar el formulario; si no, `property:null`
 * (no es un error: la propiedad puede no estar cargada, que es el caso que esta
 * feature vino a resolver). NO scrapea el portal.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireAuth()
    if (!ALLOWED_ROLES.includes(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const link = parsePortalLink(req.nextUrl.searchParams.get('url'))
    if (!link) return NextResponse.json({ error: 'link_invalido' }, { status: 400 })

    const supabase = getAdmin()
    const { data: prop } = await supabase
      .from('properties')
      .select('id, address, assigned_to')
      .eq('import_external_id', link.externalId)
      .neq('status', 'descartada')
      .limit(1)
      .maybeSingle()

    let assignedName: string | null = null
    if (prop?.assigned_to) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', prop.assigned_to)
        .maybeSingle()
      assignedName = (profile as { full_name?: string | null } | null)?.full_name ?? null
    }

    return NextResponse.json({
      portal: link.portal,
      externalId: link.externalId,
      property: prop
        ? { id: prop.id, address: prop.address, assignedTo: prop.assigned_to, assignedName }
        : null,
    })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
