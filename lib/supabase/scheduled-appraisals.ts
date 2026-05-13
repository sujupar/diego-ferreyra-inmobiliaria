// lib/supabase/scheduled-appraisals.ts
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database.types'

type Row = Database['public']['Tables']['scheduled_appraisals']['Row']

export interface ScheduledAppraisalDetail extends Row {
  contact: {
    id: string
    full_name: string
    phone: string | null
    email: string | null
  } | null
  appraisal: {
    id: string
    property_title: string | null
    valuation_result: unknown
  } | null
}

export async function getScheduledAppraisal(id: string): Promise<ScheduledAppraisalDetail | null> {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  const { data, error } = await supabase
    .from('scheduled_appraisals')
    .select(`
      *,
      contact:contacts(id, full_name, phone, email),
      appraisal:appraisals(id, property_title, valuation_result)
    `)
    .eq('id', id)
    .maybeSingle()

  if (error) {
    console.error('[getScheduledAppraisal]', error)
    return null
  }
  return data as ScheduledAppraisalDetail | null
}

export async function listScheduledAppraisals(opts: {
  assignedTo?: string
  status?: 'scheduled' | 'completed' | 'cancelled'
} = {}) {
  const cookieStore = await cookies()
  const supabase = createClient(cookieStore)
  let q = supabase
    .from('scheduled_appraisals')
    .select('*, contact:contacts(id, full_name, phone, email)')
    .order('scheduled_date', { ascending: false })

  if (opts.assignedTo) q = q.eq('assigned_to', opts.assignedTo)
  if (opts.status) q = q.eq('status', opts.status)

  const { data, error } = await q
  if (error) {
    console.error('[listScheduledAppraisals]', error)
    return []
  }
  return data
}
