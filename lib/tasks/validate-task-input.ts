export type TaskChannel = 'call' | 'email' | 'message' | 'visit' | 'document' | 'other'

const CHANNELS: TaskChannel[] = ['call', 'email', 'message', 'visit', 'document', 'other']
const ASSIGN_OTHERS_ROLES = ['admin', 'dueno', 'coordinador']
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/

export interface RawTaskInput {
  type?: string
  title?: unknown
  description?: unknown
  channel?: unknown
  due_date?: unknown
  due_time?: unknown
  all_day?: unknown
  deal_id?: unknown
  property_id?: unknown
  appraisal_id?: unknown
  contact_id?: unknown
  assigned_to?: unknown
}

export interface NormalizedTask {
  type: 'follow_up'
  title: string
  description: string | null
  channel: TaskChannel
  due_date: string
  due_time: string | null
  all_day: boolean
  deal_id: string | null
  property_id: string | null
  appraisal_id: string | null
  contact_id: string | null
  assigned_to: string
  created_by: string
}

type Result =
  | { ok: true; value: NormalizedTask }
  | { ok: false; error: string; status: number }

function asStr(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

/**
 * Valida y normaliza el input de creación de una tarea de usuario (type='follow_up').
 * Función PURA (sin Supabase) para poder testearla y para centralizar la regla de
 * autorización de asignación. El route la usa y, si asigna a otro, verifica en DB
 * que el destinatario exista/esté activo.
 */
export function validateTaskInput(
  raw: RawTaskInput,
  user: { id: string; role: string },
  today: string,
): Result {
  const title = (asStr(raw.title) ?? '').trim()
  if (!title || title.length > 200) {
    return { ok: false, error: 'El título es obligatorio (máx. 200).', status: 400 }
  }

  const channel = asStr(raw.channel) as TaskChannel | null
  if (!channel || !CHANNELS.includes(channel)) {
    return { ok: false, error: 'Tipo de tarea inválido.', status: 400 }
  }

  const due_date = asStr(raw.due_date)
  if (!due_date || !DATE_RE.test(due_date)) {
    return { ok: false, error: 'Fecha requerida (YYYY-MM-DD).', status: 400 }
  }
  if (due_date < today) {
    return { ok: false, error: 'La fecha no puede ser anterior a hoy.', status: 400 }
  }

  const all_day = raw.all_day !== false
  let due_time: string | null = null
  if (!all_day) {
    const t = asStr(raw.due_time)
    if (!t || !TIME_RE.test(t)) {
      return { ok: false, error: 'Si no es todo el día, indicá una hora (HH:MM).', status: 400 }
    }
    due_time = t
  }

  // Entidad: a lo sumo una
  const entities = {
    deal_id: asStr(raw.deal_id),
    property_id: asStr(raw.property_id),
    appraisal_id: asStr(raw.appraisal_id),
    contact_id: asStr(raw.contact_id),
  }
  const present = Object.values(entities).filter((v) => v && v.length > 0)
  if (present.length > 1) {
    return { ok: false, error: 'Una tarea puede ligarse a una sola entidad.', status: 400 }
  }

  // Asignación
  let assigned_to = user.id
  const rawAssignee = asStr(raw.assigned_to)
  if (rawAssignee && rawAssignee !== user.id) {
    if (!ASSIGN_OTHERS_ROLES.includes(user.role)) {
      return { ok: false, error: 'No podés asignar tareas a otro usuario.', status: 403 }
    }
    assigned_to = rawAssignee
  }

  const description = asStr(raw.description)?.trim() || null

  return {
    ok: true,
    value: {
      type: 'follow_up',
      title,
      description,
      channel,
      due_date,
      due_time,
      all_day,
      deal_id: entities.deal_id || null,
      property_id: entities.property_id || null,
      appraisal_id: entities.appraisal_id || null,
      contact_id: entities.contact_id || null,
      assigned_to,
      created_by: user.id,
    },
  }
}
