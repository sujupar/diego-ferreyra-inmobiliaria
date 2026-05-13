import type { Database } from './database.types'

export type VisitStatus = 'scheduled' | 'completed' | 'no_show' | 'cancelled'

export type PropertyVisit = Database['public']['Tables']['property_visits']['Row']
export type PropertyVisitInsert = Database['public']['Tables']['property_visits']['Insert']
export type PropertyVisitUpdate = Database['public']['Tables']['property_visits']['Update']

export interface PropertyVisitWithRelations extends PropertyVisit {
  property: { id: string; address: string; neighborhood: string; photos: string[] } | null
  advisor: { id: string; full_name: string; email: string } | null
}

export interface ScheduleVisitInput {
  property_id: string
  advisor_id?: string
  client_name: string
  client_email: string
  client_phone?: string
  scheduled_at: string
  duration_minutes?: number
  notes?: string
}
