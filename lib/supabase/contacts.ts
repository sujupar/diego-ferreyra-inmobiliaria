import { createClient } from '@supabase/supabase-js'
import { inicioDelDiaArgentina, finDelDiaArgentina } from '@/lib/filters/rango-fechas'
import type { DatosContacto } from '@/lib/crm/datos-contacto'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export interface ContactInput {
  full_name: string
  phone?: string | null
  email?: string | null
  origin?: string | null
  assigned_to?: string | null
  notes?: string | null
  created_by?: string | null
}

export async function createContact(input: ContactInput) {
  const { data, error } = await getAdmin().from('contacts').insert(input).select('id').single()
  if (error) throw error
  return data.id as string
}

export async function getContacts(filters?: { assigned_to?: string; origin?: string; from?: string; to?: string }) {
  let query = getAdmin().from('contacts').select('*').order('created_at', { ascending: false })
  if (filters?.assigned_to) query = query.eq('assigned_to', filters.assigned_to)
  if (filters?.origin) query = query.eq('origin', filters.origin)
  // Día ARGENTINO, no UTC — ver lib/filters/rango-fechas.ts.
  if (filters?.from) query = query.gte('created_at', inicioDelDiaArgentina(filters.from))
  if (filters?.to) query = query.lte('created_at', finDelDiaArgentina(filters.to))
  const { data, error } = await query.limit(200)
  if (error) throw error
  return data || []
}

/**
 * El contacto con sus procesos, tasaciones, propiedades y tasaciones agendadas (tabla
 * vieja). Trae las columnas de dueño (`assigned_to`, `user_id`) para que la ruta le
 * recorte a un asesor lo que no es suyo (`soloLoPropio`). Devuelve `null` si el contacto
 * no existe (la ruta responde 404, no 500). Columnas explícitas en `appraisals`: nunca
 * `select('*')` ahí (las fotos en base64 tumbaron la base el 2026-10-10).
 */
export async function getContact(id: string) {
  const supabase = getAdmin()
  const [contactRes, appraisalsRes, propertiesRes, scheduledRes, dealsRes] = await Promise.all([
    supabase.from('contacts').select('*').eq('id', id).maybeSingle(),
    supabase.from('appraisals').select('id, property_title, property_location, publication_price, currency, created_at, origin, assigned_to, user_id').eq('contact_id', id).order('created_at', { ascending: false }),
    supabase.from('properties').select('id, address, neighborhood, asking_price, currency, status, created_at, assigned_to').eq('contact_id', id).order('created_at', { ascending: false }),
    supabase.from('scheduled_appraisals').select('id, property_address, scheduled_date, status, origin, created_at, assigned_to').eq('contact_id', id).order('created_at', { ascending: false }),
    supabase.from('deals').select(`
      id, stage, property_address, scheduled_date, origin,
      appraisal_id, property_id, stage_changed_at, created_at, assigned_to,
      profiles:assigned_to ( id, full_name )
    `).eq('contact_id', id).order('created_at', { ascending: false }),
  ])

  if (contactRes.error) throw contactRes.error
  if (!contactRes.data) return null
  // Una lista que no se pudo leer no puede llegar vacía como si no hubiera nada.
  for (const r of [appraisalsRes, propertiesRes, scheduledRes, dealsRes]) {
    if (r.error) throw r.error
  }

  return {
    contact: contactRes.data,
    appraisals: appraisalsRes.data || [],
    properties: propertiesRes.data || [],
    scheduled: scheduledRes.data || [],
    deals: dealsRes.data || [],
  }
}

/** Devuelve `false` si el contacto no existe (no se actualizó ninguna fila). */
export async function updateContact(id: string, updates: DatosContacto): Promise<boolean> {
  const { data, error } = await getAdmin()
    .from('contacts')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
  if (error) throw error
  return (data ?? []).length > 0
}

/** ¿Existe un perfil con ese id? Para no mandar a la FK un `assigned_to` inventado. */
export async function existePerfil(id: string): Promise<boolean> {
  const { data, error } = await getAdmin().from('profiles').select('id').eq('id', id).maybeSingle()
  if (error) throw error
  return !!data
}

/** Borra el contacto. Devuelve `false` si no existía. */
export async function deleteContact(id: string): Promise<boolean> {
  const { data, error } = await getAdmin().from('contacts').delete().eq('id', id).select('id')
  if (error) throw error
  return (data ?? []).length > 0
}
