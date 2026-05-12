import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/types/database.types'
import type { PortalName } from './types'

export type AuditEventType =
  | 'created'
  | 'updated'
  | 'published'
  | 'failed'
  | 'retried'
  | 'unpublished'
  | 'skipped_disabled'

export interface AuditEvent {
  listingId?: string | null
  propertyId: string
  portal: PortalName
  eventType: AuditEventType
  payload?: Record<string, unknown>
  errorMessage?: string
  actor?: string
}

export async function writeAudit(
  supabase: SupabaseClient<Database>,
  event: AuditEvent,
): Promise<void> {
  const { error } = await supabase.from('property_publish_events').insert({
    listing_id: event.listingId ?? null,
    property_id: event.propertyId,
    portal: event.portal,
    event_type: event.eventType,
    payload: (event.payload ?? null) as Json | null,
    error_message: event.errorMessage ?? null,
    actor: event.actor ?? 'system',
  })
  if (error) console.error('[audit] failed to insert event', error)
}
