/**
 * Permiso de las rutas del panel. A diferencia de `requirePermission`, NO
 * redirige: una redirección a "/" la sigue el fetch del navegador, recibe el
 * HTML del inicio con status 200 y la pantalla cree que la respuesta llegó bien.
 */
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { hasPermission } from '@/lib/auth/roles'
import type { UserWithProfile } from '@/types/auth.types'

export async function conPermisoMetricas(): Promise<UserWithProfile | null> {
  const u = await requireAuth()
  return hasPermission(u.profile.role, 'metrics.view') ? u : null
}

export const prohibido = () => NextResponse.json({ error: 'No tenés permiso para ver las métricas del negocio.' }, { status: 403 })
