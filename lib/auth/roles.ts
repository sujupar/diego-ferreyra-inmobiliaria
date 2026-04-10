import { Role } from '@/types/auth.types'

export const ROLES: Role[] = ['admin', 'dueno', 'coordinador', 'asesor', 'abogado']

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  dueno: 'Dueño',
  coordinador: 'Coordinador',
  asesor: 'Asesor',
  abogado: 'Abogado',
  agent: 'Agente (legacy)',
  viewer: 'Viewer (legacy)',
}

export type Permission =
  | 'pipeline.create'
  | 'pipeline.view_all'
  | 'pipeline.view_own'
  | 'pipeline.advance'
  | 'appraisal.create'
  | 'appraisal.view_all'
  | 'properties.view_all'
  | 'properties.manage'
  | 'properties.create'
  | 'properties.review'
  | 'properties.upload'
  | 'metrics.view'
  | 'settings.manage'
  | 'users.manage'

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: [
    'pipeline.create', 'pipeline.view_all', 'pipeline.advance',
    'appraisal.create', 'appraisal.view_all',
    'properties.view_all', 'properties.manage', 'properties.create', 'properties.review', 'properties.upload',
    'metrics.view', 'settings.manage', 'users.manage',
  ],
  dueno: [
    'pipeline.view_all', 'pipeline.advance',
    'appraisal.view_all',
    'properties.view_all', 'properties.create',
    'metrics.view', 'users.manage',
  ],
  coordinador: [
    'pipeline.create', 'pipeline.view_all', 'pipeline.advance',
    'properties.view_all', 'properties.create',
  ],
  asesor: [
    'pipeline.view_own', 'pipeline.advance',
    'appraisal.create',
    'properties.manage', 'properties.create', 'properties.upload',
  ],
  abogado: [
    'properties.view_all', 'properties.review',
  ],
  // Legacy roles — minimal permissions
  agent: [
    'pipeline.view_own', 'pipeline.advance',
    'appraisal.create',
  ],
  viewer: [],
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some(p => ROLE_PERMISSIONS[role].includes(p))
}
