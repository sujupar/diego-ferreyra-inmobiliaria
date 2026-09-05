/**
 * El permiso de difusión resuelto contra la propiedad de verdad.
 *
 * Va separado de `./difusion-access.ts` porque este archivo toca Supabase y ese
 * tiene que poder importarse desde el navegador. La política vive allá; acá solo
 * se resuelve el caso `'propias'`, que es el único que necesita mirar la base.
 *
 * La firma es `(propertyId, userId, role)` a propósito, y no un objeto de
 * usuario: es la MISMA que ya tenían las veinte funciones `authorize()` que esto
 * reemplaza, así que migrarlas fue cambiar el cuerpo y no tocar una sola de sus
 * llamadas. Una migración que no toca los llamadores no puede romperlos.
 */
import { createClient } from '@supabase/supabase-js'
import { alcanceDifusion, type CapacidadDifusion } from './difusion-access'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * ¿Puede esta persona hacer esto con esta propiedad?
 *
 * `fila` es un atajo para quien YA leyó la propiedad: pasando su `assigned_to`
 * se evita una segunda consulta. Varias rutas de portales leen la propiedad
 * antes de autorizar y, sin esto, la pagarían dos veces por request.
 *
 * FALLA CERRADO en los dos extremos: un rol sin la capacidad no llega a tocar la
 * base, y si la propiedad no se puede leer se devuelve `false` — no saber de
 * quién es no puede leerse como "es tuya".
 */
export async function puedeDifundir(
  propertyId: string,
  userId: string,
  role: string | null | undefined,
  capacidad: CapacidadDifusion = 'difundir',
  fila?: { assigned_to: string | null } | null,
): Promise<boolean> {
  const alcance = alcanceDifusion(capacidad, role)
  if (alcance === 'ninguna') return false
  if (alcance === 'todas') return true

  // 'propias': hoy no lo usa ningún rol (ver la tabla de política), pero la rama
  // existe para que volver atrás sea cambiar una palabra y no reescribir esto.
  if (fila !== undefined) return !!fila && fila.assigned_to === userId
  try {
    const { data, error } = await admin()
      .from('properties')
      .select('assigned_to')
      .eq('id', propertyId)
      .maybeSingle()
    if (error || !data) return false
    return (data as { assigned_to: string | null }).assigned_to === userId
  } catch {
    return false
  }
}
