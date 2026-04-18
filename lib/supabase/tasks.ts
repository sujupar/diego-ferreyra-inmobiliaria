import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export type TaskType = 'update_contact' | 'new_assignment' | 'review_property' | 'rejected_docs'

export interface CreateTaskInput {
  type: TaskType
  title: string
  description?: string
  assigned_to: string
  deal_id?: string
  appraisal_id?: string
  property_id?: string
  contact_id?: string
}

/**
 * Pick the entity reference to use for idempotency. We assume one task per
 * (assignee, type, primary entity). The first non-null wins, in this priority:
 * deal_id > appraisal_id > property_id > contact_id. If none present, we treat
 * the task as non-deduplicable and always insert.
 */
function pickEntityFilter(input: Pick<CreateTaskInput, 'deal_id' | 'appraisal_id' | 'property_id' | 'contact_id'>):
  | { column: 'deal_id' | 'appraisal_id' | 'property_id' | 'contact_id'; value: string }
  | null {
  if (input.deal_id) return { column: 'deal_id', value: input.deal_id }
  if (input.appraisal_id) return { column: 'appraisal_id', value: input.appraisal_id }
  if (input.property_id) return { column: 'property_id', value: input.property_id }
  if (input.contact_id) return { column: 'contact_id', value: input.contact_id }
  return null
}

/**
 * True if a pending task already exists for this (assigned_to, type, entity).
 * Used to prevent the auto-creators from inserting duplicates when their
 * caller fires multiple times (which was the root cause of the 16-pendientes
 * bug after the appraisal-duplication issue).
 */
async function pendingTaskExists(assignedTo: string, type: TaskType, entity: ReturnType<typeof pickEntityFilter>): Promise<boolean> {
  if (!entity) return false
  const { count, error } = await getAdmin()
    .from('tasks')
    .select('id', { count: 'exact', head: true })
    .eq('assigned_to', assignedTo)
    .eq('type', type)
    .eq('status', 'pending')
    .eq(entity.column, entity.value)
  // Throw on error: silently returning false would let callers insert duplicates
  // during transient DB issues, recreating the original 16-pendientes bug. The
  // callers in advance/route.ts and deals/route.ts already wrap createTask*
  // calls in try/catch + console.error, so a thrown error here just makes the
  // task creation fail-loudly rather than fail-open.
  if (error) throw new Error(`pendingTaskExists check failed: ${error.message}`)
  return (count ?? 0) > 0
}

export async function createTask(input: CreateTaskInput) {
  const entity = pickEntityFilter(input)
  // Skip if an equivalent pending task already exists — keeps the creators
  // idempotent against retries / multi-fires.
  if (await pendingTaskExists(input.assigned_to, input.type, entity)) {
    return null
  }
  const { data, error } = await getAdmin().from('tasks').insert(input).select('id').single()
  if (error) throw error
  return data.id
}

/** Create a task for ALL active users with a specific role (idempotent per recipient). */
export async function createTaskForRole(role: string, input: Omit<CreateTaskInput, 'assigned_to'>) {
  const supabase = getAdmin()
  const { data: profiles } = await supabase.from('profiles').select('id').eq('role', role).eq('is_active', true)
  const entity = pickEntityFilter(input)
  for (const p of profiles || []) {
    if (await pendingTaskExists(p.id, input.type, entity)) continue
    await supabase.from('tasks').insert({ ...input, assigned_to: p.id })
  }
}

export async function getMyTasks(userId: string, status?: string) {
  let query = getAdmin()
    .from('tasks')
    .select('*')
    .eq('assigned_to', userId)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)
  else query = query.eq('status', 'pending')

  const { data, error } = await query.limit(50)
  if (error) throw error
  return data || []
}

export async function completeTask(id: string) {
  const { error } = await getAdmin()
    .from('tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

export async function dismissTask(id: string) {
  const { error } = await getAdmin()
    .from('tasks')
    .update({ status: 'dismissed', completed_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}
