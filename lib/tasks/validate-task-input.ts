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
  due_date: string | null
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

/** El título de la maqueta ("¿Qué hay que hacer?", 120 caracteres). */
export const MAX_TITULO = 120

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
  /** Hoy en Argentina (YYYY-MM-DD), nunca `toISOString()`: de 21 a 24 h ya es mañana en UTC. */
  today: string,
  /** La hora actual en Argentina (HH:MM), para rechazar una hora de hoy que ya pasó. */
  horaActual?: string,
): Result {
  const title = (asStr(raw.title) ?? '').trim()
  if (!title) return { ok: false, error: 'Escribí qué hay que hacer.', status: 400 }
  if (title.length > MAX_TITULO) {
    return { ok: false, error: `El título no puede pasar de ${MAX_TITULO} caracteres.`, status: 400 }
  }

  const channel = asStr(raw.channel) as TaskChannel | null
  if (!channel || !CHANNELS.includes(channel)) {
    return { ok: false, error: 'Tipo de tarea inválido.', status: 400 }
  }

  // Sin día queda en "Sin fecha" (crm-tareas-y-campanita): todo el día y sin hora.
  const due_date = asStr(raw.due_date)?.trim() || null
  if (due_date !== null && !DATE_RE.test(due_date)) {
    return { ok: false, error: 'Fecha inválida (YYYY-MM-DD).', status: 400 }
  }
  if (due_date !== null && due_date < today) {
    return { ok: false, error: 'La fecha no puede ser anterior a hoy.', status: 400 }
  }

  const all_day = due_date === null || raw.all_day !== false
  let due_time: string | null = null
  if (!all_day) {
    const t = asStr(raw.due_time)
    if (!t || !TIME_RE.test(t)) {
      return { ok: false, error: 'Si no es todo el día, indicá una hora (HH:MM).', status: 400 }
    }
    due_time = t
    if (due_date === today && horaActual && t.slice(0, 5) < horaActual.slice(0, 5)) {
      return { ok: false, error: 'Elegí un día y una hora que todavía no hayan pasado.', status: 400 }
    }
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
