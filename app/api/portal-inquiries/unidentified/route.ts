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
 * Los avisos cuyas consultas llegaron SIN RUTA —nadie sabe quién las atiende—,
 * agrupados (un ítem por aviso, no por consulta). Alimenta la pantalla "Avisos
 * por identificar" y el cartel del inicio.
 *
 * EL CRITERIO ES "SIN ASESOR", NO "SIN FICHA EN EL CRM". Antes filtraba
 * `property_id IS NULL` y por eso la cola no se vaciaba nunca justo en el caso
 * para el que se hizo la pantalla: cuando la propiedad NO está cargada en el
 * sistema, `POST /identify` guarda dirección + asesor pero deja `property_id`
 * en null a propósito (`IdentifyAvisoDialog` lo permite y el schema lo acepta).
 * El aviso reaparecía idéntico, y cada consulta nueva del mismo aviso volvía a
 * entrar con `property_id` null: el contador SUBÍA. La coordinadora
 * identificaba una y otra vez sin efecto visible.
 *
 * Lo que `identify` SÍ escribe siempre es `assigned_to` (uuid obligatorio) e
 * `is_unmatched = false`; y el cron deriva `is_unmatched = !match.assignedTo`,
 * o sea la misma pregunta. Se filtra por las dos con OR —y no por una sola—
 * para que ninguna combinación rara esconda trabajo pendiente: de los dos
 * errores posibles, mostrar de más se resuelve con un clic (identificar es
 * idempotente) y mostrar de menos deja consultas sin dueño y sin ninguna señal.
 *
 * "Identificada pero sin ficha en el CRM" es OTRA cosa (se pierde el vínculo
 * que usa `get_property_inquiry_counts`); si alguna vez hace falta señalarlo,
 * va en una marca aparte — nunca de vuelta en esta cola.
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
      .or('assigned_to.is.null,is_unmatched.eq.true')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data: groupUnidentified((data ?? []) as UnidentifiedInquiryRow[]) })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
