/**
 * Filas tal como las leen las rutas de visitas. Se escriben a mano porque
 * `types/database.types.ts` está desactualizado (no tiene las columnas de
 * 2026-10-10 ni `property_leads.pipeline_state`).
 */
import type { EstadoVisita, MotivoNoRealizada, Interes } from './transiciones'
import type { OrigenVisita } from './origen'

export interface ConsultaR {
  id: string
  lead_name: string | null
  lead_phone: string | null
  lead_email: string | null
  portal: string
  received_at: string | null
  created_at: string
}

export interface RegistroR {
  id: string
  name: string
  phone: string | null
  email: string | null
  source: string | null
  utm: unknown
  created_at: string
  suspected_bot: boolean | null
  deleted_at: string | null
}

export interface VisitaActivaR {
  id: string
  lead_id: string | null
  client_phone: string | null
  scheduled_at: string
  status: EstadoVisita
}

export interface VisitaAgendaR {
  id: string
  scheduled_at: string
  property_id: string
  advisor_id: string | null
  address: string | null
}

export interface EventoVisitaR {
  id: string
  kind: string
  from_status: string | null
  to_status: string | null
  from_scheduled_at: string | null
  to_scheduled_at: string | null
  reason: string | null
  note: string | null
  created_at: string
  actor: string | null
  desde_asesor: string | null
  hacia_asesor: string | null
}

export interface VisitaDetalle {
  id: string
  property_id: string
  advisor_id: string | null
  created_by: string | null
  lead_id: string | null
  portal_inquiry_id: string | null
  client_name: string
  client_email: string | null
  client_phone: string | null
  scheduled_at: string
  status: EstadoVisita
  origin: OrigenVisita | null
  origin_detail: string | null
  notes: string | null
  completion_notes: string | null
  outcome_reason: MotivoNoRealizada | null
  advisor_interest: Interes | null
  confirmed_at: string | null
  outcome_at: string | null
  reschedule_count: number
  created_at: string
  /** La mantiene el trigger `trg_property_visits_updated_at`. Es la versión para la
   *  concurrencia optimista de `actualizarVisita` (lib/visitas/datos.ts). */
  updated_at: string
  created_by_ai: boolean
  propiedad: { id: string; address: string; neighborhood: string | null; foto: string | null } | null
  asesor: { id: string; full_name: string } | null
  comprador: { id: string; name: string; lead_number: number | null } | null
  consulta: { id: string; portal: string; received_at: string | null } | null
}

/**
 * Una visita tal como la leen la sección Visitas, su lista, la pestaña de la ficha y
 * las métricas (lib/visitas/datos.ts → `listarVisitas` / `todasLasVisitas`). Plana a
 * propósito: los joins de PostgREST se aplanan en `datos.ts` y nada más los ve.
 */
export interface VisitaListado {
  id: string
  property_id: string
  direccion: string | null
  barrio: string | null
  advisor_id: string | null
  asesor_nombre: string | null
  created_by: string | null
  client_name: string
  client_phone: string | null
  status: EstadoVisita
  origin: OrigenVisita | null
  origin_detail: string | null
  outcome_reason: MotivoNoRealizada | null
  scheduled_at: string
  created_at: string
  /** Versión para la concurrencia optimista de POST /api/visits/[id]/estado (texto EXACTO). */
  updated_at: string
  confirmed_at: string | null
  outcome_at: string | null
  /** De la consulta de portal vinculada: `received_at`, o su `created_at` si el portal no trajo fecha. */
  consulta_recibida_at: string | null
  /** `created_at` del registro de comprador vinculado (`property_leads`). */
  registro_creado_at: string | null
}

/** Lo que necesita el recordatorio "¿se realizó?" (lib/visitas/recordatorio.ts + cron). */
export interface VisitaParaRecordar {
  id: string
  scheduled_at: string
  status: EstadoVisita
  reminder_sent_at: string | null
  client_name: string
  direccion: string | null
  /** `activo` = `profiles.is_active`: un asesor desactivado no tiene que recibir avisos (ronda 1). */
  asesor: { nombre: string; email: string | null; activo: boolean } | null
}
