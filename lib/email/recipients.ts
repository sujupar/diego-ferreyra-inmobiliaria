import 'server-only'
import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export type Role = 'admin' | 'dueno' | 'coordinador' | 'asesor' | 'abogado'

export interface UserLite {
  id: string
  email: string
  full_name: string | null
  role: Role
}

async function getActiveUsersByRole(roles: Role[]): Promise<UserLite[]> {
  if (roles.length === 0) return []
  const { data, error } = await getAdmin()
    .from('profiles')
    .select('id, email, full_name, role')
    .in('role', roles)
    .eq('is_active', true)
  if (error) {
    console.error('[recipients] getActiveUsersByRole failed:', error.message)
    return []
  }
  return (data ?? []).filter(u => !!u.email) as UserLite[]
}

export async function getEmailsByRole(role: Role): Promise<string[]> {
  const users = await getActiveUsersByRole([role])
  return users.map(u => u.email)
}

/** Admins + dueños activos (los que reciben notificaciones de pipeline). */
export async function getAdminsAndOwners(): Promise<UserLite[]> {
  return getActiveUsersByRole(['admin', 'dueno'])
}

export async function getLawyers(): Promise<UserLite[]> {
  return getActiveUsersByRole(['abogado'])
}

export async function getUserById(userId: string | null | undefined): Promise<UserLite | null> {
  if (!userId) return null
  const { data, error } = await getAdmin()
    .from('profiles')
    .select('id, email, full_name, role, is_active')
    .eq('id', userId)
    .maybeSingle()
  if (error || !data || !data.is_active || !data.email) return null
  return { id: data.id, email: data.email, full_name: data.full_name, role: data.role as Role }
}

export interface DealStakeholders {
  asesor: UserLite | null
  coordinador: UserLite | null
  adminsOwners: UserLite[]
  contact: { id: string; full_name: string | null; phone: string | null; email: string | null } | null
  dealRow: any
}

/**
 * Resuelve los stakeholders de un deal: asesor asignado, coordinador que lo creó,
 * admins/dueños, y los datos del contacto. Ninguno es requerido — cada consumidor
 * decide qué usar. Devuelve el row crudo también por conveniencia.
 */
export async function getDealStakeholders(dealId: string): Promise<DealStakeholders> {
  const { data: deal, error } = await getAdmin()
    .from('deals')
    .select('*, contacts:contact_id ( id, full_name, phone, email )')
    .eq('id', dealId)
    .maybeSingle()
  if (error || !deal) {
    console.error('[recipients] deal lookup failed:', error?.message)
    return { asesor: null, coordinador: null, adminsOwners: [], contact: null, dealRow: null }
  }
  const [asesor, coordinador, adminsOwners] = await Promise.all([
    getUserById(deal.assigned_to),
    getUserById(deal.created_by),
    getAdminsAndOwners(),
  ])
  return { asesor, coordinador, adminsOwners, contact: (deal as any).contacts ?? null, dealRow: deal }
}

export interface PropertyStakeholders {
  asesor: UserLite | null
  coordinador: UserLite | null
  adminsOwners: UserLite[]
  lawyers: UserLite[]
  propertyRow: any
  linkedDeal: any | null
}

export async function getPropertyStakeholders(propertyId: string): Promise<PropertyStakeholders> {
  const admin = getAdmin()
  const { data: property, error } = await admin
    .from('properties')
    .select('*')
    .eq('id', propertyId)
    .maybeSingle()
  if (error || !property) {
    console.error('[recipients] property lookup failed:', error?.message)
    return { asesor: null, coordinador: null, adminsOwners: [], lawyers: [], propertyRow: null, linkedDeal: null }
  }
  // Look up the deal that links to this property so we can find its coordinador.
  const { data: linkedDeal } = await admin
    .from('deals')
    .select('id, created_by, assigned_to, contact_id')
    .eq('property_id', propertyId)
    .maybeSingle()

  const asesorId = property.assigned_to ?? linkedDeal?.assigned_to ?? null
  const coordinadorId = linkedDeal?.created_by ?? null

  const [asesor, coordinador, adminsOwners, lawyers] = await Promise.all([
    getUserById(asesorId),
    getUserById(coordinadorId),
    getAdminsAndOwners(),
    getLawyers(),
  ])

  return { asesor, coordinador, adminsOwners, lawyers, propertyRow: property, linkedDeal: linkedDeal ?? null }
}

/**
 * Dedup a list of emails case-insensitive, preserving order.
 */
export function dedupEmails(...lists: (string | null | undefined)[][]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const raw of list) {
      if (!raw) continue
      const key = raw.trim().toLowerCase()
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(raw.trim())
    }
  }
  return out
}

export function emailsOf(users: (UserLite | null | undefined)[]): string[] {
  return users.filter((u): u is UserLite => !!u && !!u.email).map(u => u.email)
}
