import { redirect } from 'next/navigation'
import { getUser } from './get-user'
import { Role, UserWithProfile } from '@/types/auth.types'
import { Permission, hasPermission, hasAnyPermission } from './roles'

/**
 * Server-side guard that requires authentication.
 * Redirects to /login if not authenticated.
 */
export async function requireAuth(): Promise<UserWithProfile> {
  const user = await getUser()
  if (!user) redirect('/login')
  if (!user.profile.is_active) redirect('/login?error=inactive')
  return user
}

/**
 * Server-side guard that requires a specific role.
 * Redirects to dashboard root if role doesn't match.
 */
export async function requireRole(...roles: Role[]): Promise<UserWithProfile> {
  const user = await requireAuth()
  if (!roles.includes(user.profile.role)) {
    redirect('/')
  }
  return user
}

/**
 * Server-side guard that requires a specific permission.
 * Redirects to dashboard root if permission not granted.
 */
export async function requirePermission(permission: Permission): Promise<UserWithProfile> {
  const user = await requireAuth()
  if (!hasPermission(user.profile.role, permission)) {
    redirect('/')
  }
  return user
}

/**
 * Server-side guard that requires any of the given permissions.
 */
export async function requireAnyPermission(...permissions: Permission[]): Promise<UserWithProfile> {
  const user = await requireAuth()
  if (!hasAnyPermission(user.profile.role, permissions)) {
    redirect('/')
  }
  return user
}
