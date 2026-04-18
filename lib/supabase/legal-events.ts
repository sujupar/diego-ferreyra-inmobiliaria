import { createClient } from '@supabase/supabase-js'

function getAdmin() { return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!) }

export interface LegalEvent {
  id: string
  property_id: string
  actor_id: string | null
  actor_role: string
  action: string
  item_key: string | null
  notes: string | null
  created_at: string
  actor_name?: string
}

export async function logLegalEvent(input: Omit<LegalEvent, 'id' | 'created_at' | 'actor_name'>) {
  const { error } = await getAdmin().from('legal_review_events').insert(input)
  if (error) throw error
}

export async function getLegalEvents(propertyId: string): Promise<LegalEvent[]> {
  const { data, error } = await getAdmin()
    .from('legal_review_events')
    .select(`
      id, property_id, actor_id, actor_role, action, item_key, notes, created_at,
      actor:actor_id ( full_name )
    `)
    .eq('property_id', propertyId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return (data || []).map((r: any) => ({ ...r, actor_name: r.actor?.full_name || 'Sistema' }))
}
