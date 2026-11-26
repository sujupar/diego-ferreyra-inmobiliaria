export interface Deal {
  id: string
  stage: string
  property_address: string
  scheduled_date: string | null
  origin: string | null
  assigned_to: string | null
  assigned_to_name: string
  contact_name: string
  contact_phone: string
  contact_email: string
  appraisal_id: string | null
  property_id: string | null
  stage_changed_at: string
  created_at: string
  tags?: string[] | null
  /** El contacto embebido de `GET /api/deals` (`contacts:contact_id (id, …)`); null si no tiene. */
  contacts?: { id: string } | null
}
