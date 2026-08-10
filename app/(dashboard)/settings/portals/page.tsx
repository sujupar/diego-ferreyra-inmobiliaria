import { requireRole } from '@/lib/auth/require-role'
import { PortalsClient } from './PortalsClient'

/**
 * Guard de servidor: la pantalla era `'use client'` pelada y no había ningún
 * `layout.tsx` bajo `app/(dashboard)/settings/`, así que un coordinador o un
 * asesor que escribiera la URL a mano LLEGABA a renderizarla. No veía datos
 * (la API sí está blindada con `requireRole`), pero se quedaba mirando una
 * pantalla que nunca iba a poder cargar. Mismo par de roles que exige
 * `app/api/admin/portal-credentials/route.ts`.
 */
export default async function PortalsSettingsPage() {
  await requireRole('admin', 'dueno')
  return <PortalsClient />
}
