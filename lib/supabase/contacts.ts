import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export interface ContactInput {
  full_name: string
  phone?: string
  email?: string
  origin?: string
  assigned_to?: string
  notes?: string
  created_by?: string
}

export async function createContact(input: ContactInput) {
  const { data, error } = await getAdmin().from('contacts').insert(input).select('id').single()
  if (error) throw error
  return data.id as string
}

export async function getContacts(filters?: { assigned_to?: string; origin?: string }) {
  let query = getAdmin().from('contacts').select('*').order('created_at', { ascending: false })
  if (filters?.assigned_to) query = query.eq('assigned_to', filters.assigned_to)
  if (filters?.origin) query = query.eq('origin', filters.origin)
  const { data, error } = await query.limit(200)
  if (error) throw error
  return data || []
}

export async function getContact(id: string) {
  const supabase = getAdmin()
  const [contactRes, appraisalsRes, propertiesRes, scheduledRes] = await Promise.all([
    supabase.from('contacts').select('*').eq('id', id).single(),
    supabase.from('appraisals').select('id, property_title, property_location, publication_price, currency, created_at, origin').eq('contact_id', id).order('created_at', { ascending: false }),
    supabase.from('properties').select('id, address, neighborhood, asking_price, currency, status, created_at').eq('contact_id', id).order('created_at', { ascending: false }),
    supabase.from('scheduled_appraisals').select('id, property_address, scheduled_date, status, origin, created_at').eq('contact_id', id).order('created_at', { ascending: false }),
  ])

  if (contactRes.error) throw contactRes.error

  return {
    contact: contactRes.data,
    appraisals: appraisalsRes.data || [],
    properties: propertiesRes.data || [],
    scheduled: scheduledRes.data || [],
  }
}

export async function updateContact(id: string, updates: Partial<ContactInput>) {
  const { error } = await getAdmin().from('contacts').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}
