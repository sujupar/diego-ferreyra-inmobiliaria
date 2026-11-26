// Tipos compartidos de la ficha de contacto y la cadencia de llamadas (design.md D2).
// Sin lógica: los usan los módulos puros de `lib/crm/`, las rutas y los componentes.

export const TIPOS_ACTIVIDAD = ['note', 'call', 'whatsapp_sent'] as const
export type TipoActividad = (typeof TIPOS_ACTIVIDAD)[number]

// El orden y los valores tienen que coincidir con el CHECK
// `contact_activities_outcome_check` de la migración 20261125000001: si se agrega uno
// acá sin tocar el CHECK, la base lo rechaza con 23514.
export const RESULTADOS_LLAMADA = [
  'no_atendio',
  'agendo',
  'volver_a_llamar',
  'no_interesa',
  'numero_equivocado',
] as const
export type ResultadoLlamada = (typeof RESULTADOS_LLAMADA)[number]

export interface Actividad {
  id: string
  contact_id: string
  deal_id: string | null
  kind: TipoActividad
  call_outcome: ResultadoLlamada | null
  body: string | null
  occurred_at: string
  callback_at: string | null
  created_at: string
  updated_at: string | null
  created_by: string | null
  voided_at: string | null
  voided_by: string | null
  automatic: boolean // nota escrita por el sistema (D1)
}

export type Intento = Pick<
  Actividad,
  'id' | 'deal_id' | 'kind' | 'call_outcome' | 'occurred_at' | 'created_at'
>

export interface UsuarioMinimo {
  id: string
  role: string
}

/** La tarea que creó una actividad, tal como la dibuja la ficha ("tarea agendada sola"). */
export interface TareaCreadaPorActividad {
  id: string
  title: string
  due_date: string | null
  due_time: string | null // columna `time`: llega como "09:00:00"
}

/**
 * Un registro de la actividad tal como lo reciben la pantalla y las respuestas de las
 * rutas (design.md D4). Sin `client_token`: es un dato del guardado, no de la ficha.
 */
export interface ActividadDeFicha extends Actividad {
  intento: number | null
  titulo: string
  autor: { id: string; nombre: string } | null // null = el autor ya no existe
  editada: boolean
  tarea_creada: TareaCreadaPorActividad | null
  puede_editar: boolean
  puede_anular: boolean
}
