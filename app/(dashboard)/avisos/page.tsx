import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth/require-role'
import { AvisosClient } from './AvisosClient'

export const metadata = { title: 'Avisos por identificar' }

/**
 * Gate de rol EN EL SERVIDOR, igual que `app/(dashboard)/inbox/page.tsx`.
 *
 * Antes esta pantalla era `'use client'` sin ninguna guarda: el middleware
 * valida sesión pero no rol, así que un asesor que tipeaba /avisos entraba,
 * recibía el 403 del endpoint y la pantalla se lo mostraba como la tarjeta
 * verde "Todas las consultas están identificadas". La misma lista de roles que
 * `ALLOWED_ROLES` en las tres rutas de `app/api/portal-inquiries/*` — si
 * cambia una, cambian las dos.
 */
const ROLES_PERMITIDOS = ['admin', 'dueno', 'coordinador']

export default async function AvisosPage() {
  const user = await requireAuth()
  if (!ROLES_PERMITIDOS.includes(user.profile.role)) redirect('/')
  return <AvisosClient />
}
