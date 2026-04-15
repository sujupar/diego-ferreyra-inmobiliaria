import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export interface PropertyInput {
  appraisal_id?: string
  address: string
  neighborhood: string
  city?: string
  property_type?: string
  rooms?: number
  bedrooms?: number
  bathrooms?: number
  garages?: number
  covered_area?: number
  total_area?: number
  floor?: number
  age?: number
  asking_price: number
  currency?: string
  commission_percentage?: number
  contract_start_date?: string
  contract_end_date?: string
  origin?: string
  created_by?: string
  assigned_to?: string
}

export async function createProperty(input: PropertyInput) {
  const supabase = getAdmin()
  const { data, error } = await supabase
    .from('properties')
    .insert(input)
    .select('id')
    .single()
  if (error) throw error
  return data.id as string
}

export async function getProperties(filters?: { status?: string; origin?: string; from?: string; to?: string; assigned_to?: string }) {
  const supabase = getAdmin()
  let query = supabase
    .from('properties')
    .select('*')
    .order('created_at', { ascending: false })

  if (filters?.status) query = query.eq('status', filters.status)
  if (filters?.origin) query = query.eq('origin', filters.origin)
  if (filters?.from) query = query.gte('created_at', filters.from + 'T00:00:00Z')
  if (filters?.to) query = query.lte('created_at', filters.to + 'T23:59:59Z')
  if (filters?.assigned_to) query = query.eq('assigned_to', filters.assigned_to)

  const { data, error } = await query.limit(200)
  if (error) throw error
  return data || []
}

export async function getProperty(id: string) {
  const supabase = getAdmin()
  const { data, error } = await supabase
    .from('properties')
    .select('*')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function updateProperty(id: string, updates: Partial<PropertyInput> & { status?: string; documents?: any; photos?: string[] }) {
  const supabase = getAdmin()
  const { error } = await supabase
    .from('properties')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function reviewProperty(id: string, approved: boolean, reviewerId: string, notes?: string) {
  const supabase = getAdmin()

  if (!approved) {
    // Rejected — set both legal and property status to rejected
    const { error } = await supabase
      .from('properties')
      .update({
        legal_status: 'rejected',
        legal_reviewer_id: reviewerId,
        legal_notes: notes || null,
        legal_reviewed_at: new Date().toISOString(),
        status: 'rejected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
    if (error) throw error
    return
  }

  // Approved — check if photos are uploaded before setting final status
  const prop = await getProperty(id)
  const hasPhotos = Array.isArray(prop.photos) && prop.photos.length > 0
  const finalStatus = hasPhotos ? 'approved' : 'pending_review'

  const { error } = await supabase
    .from('properties')
    .update({
      legal_status: 'approved',
      legal_reviewer_id: reviewerId,
      legal_notes: notes || null,
      legal_reviewed_at: new Date().toISOString(),
      status: finalStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw error
}

/** Check if property should auto-advance to approved (both legal + photos done) */
export async function checkAndAdvanceProperty(id: string) {
  const supabase = getAdmin()
  const prop = await getProperty(id)
  const hasPhotos = Array.isArray(prop.photos) && prop.photos.length > 0
  const legalApproved = prop.legal_status === 'approved'

  if (hasPhotos && legalApproved && prop.status !== 'approved') {
    const { error } = await supabase
      .from('properties')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    return true
  }
  return false
}
