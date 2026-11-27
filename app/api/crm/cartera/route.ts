import { NextRequest, NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { cargarCartera } from '@/lib/supabase/cartera'

/**
 * La cartera del CRM de quien pide, o la de la persona elegida en "Ver como" (design.md D6).
 * La pantalla filtra, agrupa y ordena en memoria: esta ruta solo se usa para "Reintentar",
 * "Ver como" y refrescar al volver a la pestaña (la primera carga viene dentro de la página).
 *
 * Service role: la ruta es la ÚNICA barrera. El único parámetro que se lee es `ver_como`,
 * validado en el servidor (`vistaPara`); cualquier otro (`asesor`, `assigned_to`…) se ignora,
 * así nada de la dirección puede ensanchar lo que un rol ve. Sesión con `getUser` y no
 * `requireAuth`/`requirePermission`: esos REDIRIGEN, y el `fetch` de la pantalla recibiría
 * el HTML del login con un 200 en vez de un error que pueda mostrar.
 */
export const dynamic = 'force-dynamic'

function error(status: number, mensaje: string) {
  return NextResponse.json({ error: mensaje }, { status })
}

export async function GET(req: NextRequest) {
  const user = await getUser()
  if (!user || !user.profile.is_active) return error(401, 'Iniciá sesión de nuevo.')

  const verComo = new URL(req.url).searchParams.get('ver_como') || null
  try {
    const r = await cargarCartera({ quien: { id: user.id, role: user.profile.role }, verComo }, new Date())
    if (!r.ok) {
      // Un asesor o coordinador que pide "Ver como" recibe lo mismo que un rol sin vista:
      // no se le confirma si la otra persona existe.
      if (r.motivo === 'persona_invalida') return error(400, 'Esa persona no tiene una vista del CRM.')
      return error(403, 'No tenés acceso al CRM.')
    }
    return NextResponse.json(r.datos)
  } catch (e) {
    console.error('[GET /api/crm/cartera]', e)
    return error(500, 'No se pudo cargar la lista de procesos.')
  }
}
