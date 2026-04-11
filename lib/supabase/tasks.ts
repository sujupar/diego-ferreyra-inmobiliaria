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

export async function createTask(input: CreateTaskInput) {
  const { data, error } = await getAdmin().from('tasks').insert(input).select('id').single()
  if (error) throw error
  return data.id
}

/** Create a task for ALL users with a specific role */
export async function createTaskForRole(role: string, input: Omit<CreateTaskInput, 'assigned_to'>) {
  const supabase = getAdmin()
  const { data: profiles } = await supabase.from('profiles').select('id').eq('role', role).eq('is_active', true)
  for (const p of profiles || []) {
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
