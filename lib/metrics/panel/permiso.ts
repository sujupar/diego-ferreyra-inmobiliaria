/**
 * Permiso de las rutas del panel. A diferencia de `requirePermission` /
 * `requireAuth`, NO redirige: una redirección la sigue el fetch del navegador,
 * recibe el HTML del inicio o del login con status 200 y la pantalla cree que la
 * respuesta llegó bien. Acá se contesta JSON: 401 sin sesión, 403 sin permiso.
 */
import { NextResponse } from 'next/server'
import { getUser } from '@/lib/auth/get-user'
import { hasPermission } from '@/lib/auth/roles'
import type { UserWithProfile } from '@/types/auth.types'

export type Acceso = { user: UserWithProfile } | { respuesta: NextResponse }

export async function accesoMetricas(): Promise<Acceso> {
  const u = await getUser()
  if (!u || !u.profile.is_active) {
    return { respuesta: NextResponse.json({ error: 'Se venció la sesión. Volvé a entrar.' }, { status: 401 }) }
  }
  if (!hasPermission(u.profile.role, 'metrics.view')) {
    return { respuesta: NextResponse.json({ error: 'No tenés permiso para ver las métricas del negocio.' }, { status: 403 }) }
  }
  return { user: u }
}
