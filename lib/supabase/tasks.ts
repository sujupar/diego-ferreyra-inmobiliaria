import { createClient } from '@supabase/supabase-js'
import type { TaskChannel } from '@/lib/tasks/validate-task-input'
import type { TareaPendiente } from '@/lib/crm/cadencia'

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
  // Lo crea el ciclo del informe quincenal (lib/informes/ciclo-real.ts). Va JUNTO con el CHECK `tasks_type_check`
  // (migración 20261024000001): un tipo que el CHECK no conoce hace fallar el INSERT con 23514.
  | 'informe_quincenal'

// Los 3 canales de contacto originales del modal de Seguimiento. Se conserva por
// compatibilidad (lo importa el pipeline). El set completo de "tipos" de tarea de
// usuario es TaskChannel (call/email/message/visit/document/other).
export type FollowUpChannel = 'call' | 'email' | 'message'

export interface CreateTaskInput {
  type: TaskType
  title: string
  description?: string | null
  assigned_to: string
  deal_id?: string | null
  appraisal_id?: string | null
  property_id?: string | null
  contact_id?: string | null
  // Follow-up specific (used when type === 'follow_up')
  channel?: TaskChannel
  due_date?: string // YYYY-MM-DD
  due_time?: string | null // HH:MM (24h), null si all_day
  all_day?: boolean
  created_by?: string | null
  // La tarea la creó la cadencia de llamadas a partir de esta actividad
  // (`contact_activities.id`). Tiene índice único: una tarea por intento. Una tarea
  // creada a mano no lo manda y la fila queda sin esa columna.
  source_activity_id?: string | null
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

// ---------------------------------------------------------------------------
// Cadencia de llamadas y ficha de contacto (change crm-ficha-y-llamadas, design.md D3)
// ---------------------------------------------------------------------------

/**
 * Una tarea pendiente tal como la usan la ficha (bloque Tareas) y la cadencia
 * (`tareasACerrar`): `TareaPendiente` de `lib/crm/cadencia.ts` más lo que dibuja el
 * bloque. `assigned_role` y `assigned_name` NO son columnas de `tasks`: salen del perfil
 * del asignado (`profiles.role` / `full_name`), `null` si no hay asignado o el perfil ya
 * no existe.
 */
export interface TareaDeFicha extends TareaPendiente {
  assigned_name: string | null
  description: string | null
  due_date: string | null
  due_time: string | null // columna `time`: llega como "09:00:00"
  all_day: boolean | null
  status: string
}

type FilaTarea = Omit<TareaDeFicha, 'assigned_role' | 'assigned_name'>

const COLUMNAS_TAREA_FICHA =
  'id, title, type, channel, assigned_to, created_at, deal_id, contact_id, appraisal_id, ' +
  'source_activity_id, description, due_date, due_time, all_day, status'

// Los ids van dentro de un filtro `or()` de PostgREST: una coma o un paréntesis
// cambiarían el filtro. Los ids reales son uuid; se exige solo letras, números y guiones.
const RE_ID_SEGURO = /^[A-Za-z0-9-]+$/
function exigirIdSeguro(id: string): string {
  if (!RE_ID_SEGURO.test(id)) throw new Error(`Id con caracteres no permitidos: ${JSON.stringify(id)}`)
  return id
}

/**
 * Pendientes del contacto (ligadas a él) o de cualquiera de sus procesos, de cualquier
 * usuario. Sin el filtro de fecha de `getMyTasks` (que esconde las futuras). El nombre y
 * el rol del asignado se traen con una segunda consulta: `tasks` se creó a mano y no hay
 * constancia de una FK a `profiles`, así que un embed de PostgREST podría fallar.
 * Tira ante cualquier error: un rol vacío por un fallo cambiaría qué tareas se cierran.
 */
export async function getPendingTasksForContact(contactId: string, dealIds: string[]): Promise<TareaDeFicha[]> {
  exigirIdSeguro(contactId)
  dealIds.forEach(exigirIdSeguro)
  const supabase = getAdmin()
  let query = supabase.from('tasks').select(COLUMNAS_TAREA_FICHA).eq('status', 'pending')
  query =
    dealIds.length > 0
      ? query.or(`contact_id.eq.${contactId},deal_id.in.(${dealIds.join(',')})`)
      : query.eq('contact_id', contactId)
  const { data, error } = await query.order('created_at', { ascending: true })
  if (error) throw new Error(`getPendingTasksForContact: ${error.message}`)
  const filas = (data ?? []) as unknown as FilaTarea[]
  if (filas.length === 0) return []

  const asignados = [...new Set(filas.map((t) => t.assigned_to).filter((x): x is string => !!x))]
  const perfiles = new Map<string, { full_name: string | null; role: string | null }>()
  if (asignados.length > 0) {
    const { data: perfilesData, error: perfilesError } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .in('id', asignados)
    if (perfilesError) throw new Error(`getPendingTasksForContact (perfiles): ${perfilesError.message}`)
    for (const p of (perfilesData ?? []) as { id: string; full_name: string | null; role: string | null }[]) {
      perfiles.set(p.id, { full_name: p.full_name, role: p.role })
    }
  }
  return filas.map((t) => {
    const perfil = t.assigned_to ? perfiles.get(t.assigned_to) : undefined
    return { ...t, assigned_role: perfil?.role ?? null, assigned_name: perfil?.full_name ?? null }
  })
}

/**
 * Crea la tarea de la cadencia. Si ya existe una para esa actividad (choque 23505 con
 * `uq_tasks_source_activity`), devuelve esa: así el guardado repetido y "Reintentar" no
 * duplican. No pasa por el dedupe de `createTask` ni por `createTaskForRole`.
 */
export async function createCadenceTask(
  input: CreateTaskInput & { source_activity_id: string },
): Promise<{ id: string; yaExistia: boolean }> {
  const supabase = getAdmin()
  const { data, error } = await supabase.from('tasks').insert(input).select('id').single()
  if (!error) return { id: (data as { id: string }).id, yaExistia: false }
  if (error.code !== '23505') throw new Error(`createCadenceTask: ${error.message}`)
  const { data: existente, error: errorLectura } = await supabase
    .from('tasks')
    .select('id')
    .eq('source_activity_id', input.source_activity_id)
    .maybeSingle()
  if (errorLectura) throw new Error(`createCadenceTask (lectura tras choque): ${errorLectura.message}`)
  if (!existente) throw new Error('createCadenceTask: chocó con el índice único pero no se encontró la tarea')
  return { id: (existente as { id: string }).id, yaExistia: true }
}

/**
 * Completa las tareas elegidas por `tareasACerrar` y anota qué actividad las cerró.
 * Solo toca las que siguen pendientes: correrlo dos veces no cambia nada la segunda.
 * Devuelve los ids que cerró de verdad.
 */
export async function closeTasksByActivity(ids: string[], activityId: string): Promise<string[]> {
  if (ids.length === 0) return []
  const { data, error } = await getAdmin()
    .from('tasks')
    .update({ status: 'completed', completed_at: new Date().toISOString(), closed_by_activity_id: activityId })
    .in('id', ids)
    .eq('status', 'pending')
    .select('id')
  if (error) throw new Error(`closeTasksByActivity: ${error.message}`)
  return ((data ?? []) as { id: string }[]).map((t) => t.id)
}

/**
 * Deshace lo que la cadencia hizo por una actividad (al anularla, D8): la tarea que
 * creó y sigue pendiente pasa a `dismissed` (no se borra nada) y las que cerró vuelven a
 * `pending` de a una. Al reabrir se vacían `completed_at` y `closed_by_activity_id`: una
 * tarea pendiente no puede seguir diciendo que una llamada la cerró. La que choca con un
 * índice único de pendientes (23505) se saltea. Se puede correr dos veces: la segunda
 * encuentra solo lo que la primera no llegó a hacer.
 */
export async function undoTasksOfActivity(activityId: string): Promise<{ descartadas: number; reabiertas: number }> {
  const supabase = getAdmin()
  const { data: descartadas, error: errorDescarte } = await supabase
    .from('tasks')
    .update({ status: 'dismissed', completed_at: new Date().toISOString() })
    .eq('source_activity_id', activityId)
    .eq('status', 'pending')
    .select('id')
  if (errorDescarte) throw new Error(`undoTasksOfActivity (descartar): ${errorDescarte.message}`)

  const { data: cerradas, error: errorCerradas } = await supabase
    .from('tasks')
    .select('id')
    .eq('closed_by_activity_id', activityId)
    .eq('status', 'completed')
  if (errorCerradas) throw new Error(`undoTasksOfActivity (leer cerradas): ${errorCerradas.message}`)

  let reabiertas = 0
  for (const { id } of (cerradas ?? []) as { id: string }[]) {
    const { data, error } = await supabase
      .from('tasks')
      .update({ status: 'pending', completed_at: null, closed_by_activity_id: null })
      .eq('id', id)
      .eq('status', 'completed')
      .select('id')
    if (error?.code === '23505') {
      console.warn('[undoTasksOfActivity] no se reabre una tarea que chocaría con otra pendiente', { id, activityId })
      continue
    }
    if (error) throw new Error(`undoTasksOfActivity (reabrir): ${error.message}`)
    reabiertas += ((data ?? []) as unknown[]).length
  }
  return { descartadas: ((descartadas ?? []) as unknown[]).length, reabiertas }
}

/**
 * Lo que la cadencia hizo por una actividad, leído de la base. Las respuestas de las
 * rutas se arman con esto y no con lo que devolvió cada escritura: así el guardado
 * repetido y el reintento responden lo mismo. Una tarea descartada no figura como creada
 * y una reabierta no figura como cerrada.
 */
export async function getTasksOfActivity(activityId: string): Promise<{
  creada: { id: string; title: string; due_date: string; due_time: string; channel: string } | null
  cerradas: { id: string; title: string }[]
}> {
  const supabase = getAdmin()
  const { data: creada, error: errorCreada } = await supabase
    .from('tasks')
    .select('id, title, due_date, due_time, channel')
    .eq('source_activity_id', activityId)
    .neq('status', 'dismissed')
    .maybeSingle()
  if (errorCreada) throw new Error(`getTasksOfActivity (creada): ${errorCreada.message}`)
  const { data: cerradas, error: errorCerradas } = await supabase
    .from('tasks')
    .select('id, title')
    .eq('closed_by_activity_id', activityId)
    .eq('status', 'completed')
  if (errorCerradas) throw new Error(`getTasksOfActivity (cerradas): ${errorCerradas.message}`)
  return {
    creada: (creada as { id: string; title: string; due_date: string; due_time: string; channel: string } | null) ?? null,
    cerradas: (cerradas ?? []) as { id: string; title: string }[],
  }
}
