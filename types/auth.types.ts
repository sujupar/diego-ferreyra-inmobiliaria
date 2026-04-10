// Maps to Postgres enum `app_role`. Includes legacy values (agent, viewer) from original schema.
export type Role = 'admin' | 'dueno' | 'coordinador' | 'asesor' | 'abogado' | 'agent' | 'viewer'

export interface Profile {
  id: string
  email: string
  full_name: string
  role: Role
  phone: string | null
  avatar_url: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Invitation {
  id: string
  email: string
  role: Exclude<Role, 'admin'>
  invited_by: string | null
  token: string
  accepted_at: string | null
  expires_at: string
  created_at: string
}

export interface UserWithProfile {
  id: string
  email: string
  profile: Profile
}
