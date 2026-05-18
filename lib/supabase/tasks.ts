import { createClient } from '@supabase/supabase-js'

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export type TaskType =
  | 'update_contact'
  | 'new_assignment'
  | 'review_property'
  | 'rejected_docs'
  | 'complete_imported_property'
  | 'follow_up'

export type FollowUpChannel = 'call' | 'email' | 'message'

export interface CreateTaskInput {
  type: TaskType
  title: string
  description?: string
  assigned_to: string
  deal_id?: string
  appraisal_id?: string
  property_id?: string
  contact_id?: string
  // Follow-up specific (used when type === 'follow_up')
  channel?: FollowUpChannel
  due_date?: string // YYYY-MM-DD
  due_time?: string | null // HH:MM (24h), null si all_day
  all_day?: boolean
  created_by?: string
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
  // Follow-ups son agendados manualmente y pueden coexistir múltiples por entidad
  // (uno hoy, otro la próxima semana, etc.) — saltar el dedupe.
  if (input.type !== 'follow_up' && await pendingTaskExists(input.assigned_to, input.type, entity)) {
    return null
  }
  const { data, error } = await getAdmin().from('tasks').insert(input).select('id').single()
  if (error) throw error
  return data.id
}

/** Create a task for ALL active users with a specific role (idempotent per recipient). */
export async function createTaskForRole(role: string, input: Omit<CreateTaskInput, 'assigned_to'>) {
  const supabase = getAdmin()
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id')
    .eq('role', role)
    .eq('is_active', true)
  if (profilesError) {
    console.error(`[createTaskForRole] failed to load profiles for role=${role}:`, profilesError.message)
    return
  }
  const entity = pickEntityFilter(input)
  for (const p of profiles || []) {
    try {
      if (await pendingTaskExists(p.id, input.type, entity)) continue
      const { error } = await supabase.from('tasks').insert({ ...input, assigned_to: p.id })
      if (error) {
        console.error(`[createTaskForRole] insert failed for assignee=${p.id} type=${input.type}:`, error.message)
      }
    } catch (err) {
      console.error(`[createTaskForRole] unexpected error for assignee=${p.id}:`, err)
    }
  }
}

export async function getMyTasks(userId: string, status?: string) {
  let query = getAdmin()
    .from('tasks')
    .select('*')
    .eq('assigned_to', userId)
    .order('created_at', { ascending: false })

  const effectiveStatus = status ?? 'pending'
  query = query.eq('status', effectiveStatus)

  // Para tareas pending, ocultar las que están agendadas a futuro: solo se ven
  // las que vencen hoy o antes (atrasadas), o las legacy sin due_date.
  if (effectiveStatus === 'pending') {
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
    query = query.or(`due_date.is.null,due_date.lte.${today}`)
  }

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
