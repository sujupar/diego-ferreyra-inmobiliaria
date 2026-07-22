/**
 * Auth para las rutas API de Redes Sociales. Devuelve JSON 401/403 (no redirige,
 * a diferencia de requireAuth que es para páginas). El abogado no tiene acceso.
 */
import { getUser } from '@/lib/auth/get-user'

const OPS_ROLES = ['admin', 'dueno', 'coordinador']

export async function socialAuth() {
  const user = await getUser()
  if (!user || user.profile?.is_active === false) {
    return { user: null, error: 'No autenticado', status: 401 as const, isOps: false }
  }
  if (user.profile.role === 'abogado') {
    return { user: null, error: 'Sin acceso a esta sección', status: 403 as const, isOps: false }
  }
  return { user, error: null as string | null, status: 200 as const, isOps: OPS_ROLES.includes(user.profile.role) }
}

/** ¿Puede este usuario ver/editar este carrusel? (ops = todos; asesor = solo los suyos). */
export function canAccessCarousel(carousel: { created_by: string | null }, userId: string, isOps: boolean): boolean {
  return isOps || carousel.created_by === userId
}
