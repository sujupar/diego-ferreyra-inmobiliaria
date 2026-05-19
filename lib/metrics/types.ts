/**
 * Tipos compartidos del sistema de métricas (Fase 4).
 *
 * Ver vistas/RPCs:
 *   supabase/migrations/20260518000003_metrics_views.sql
 *   supabase/migrations/20260518000004_metrics_rpcs.sql
 */

export type FunnelMetricKey =
  | 'class_registrations'
  | 'appraisal_requests'
  | 'appointments_scheduled'
  | 'visits_completed'
  | 'appraisals_delivered'
  | 'properties_captured'
  | 'deals_lost'

export interface FunnelMetrics {
  class_registrations: number
  appraisal_requests: number
  appointments_scheduled: number
  visits_completed: number
  appraisals_delivered: number
  properties_captured: number
  deals_lost: number
}

export const FUNNEL_METRIC_KEYS: FunnelMetricKey[] = [
  'class_registrations',
  'appraisal_requests',
  'appointments_scheduled',
  'visits_completed',
  'appraisals_delivered',
  'properties_captured',
  'deals_lost',
]

export const FUNNEL_METRIC_LABELS: Record<FunnelMetricKey, string> = {
  class_registrations:    'Registros a clase gratuita',
  appraisal_requests:     'Solicitudes de tasación',
  appointments_scheduled: 'Tasaciones agendadas',
  visits_completed:       'Visitas realizadas',
  appraisals_delivered:   'Tasaciones entregadas',
  properties_captured:    'Propiedades captadas',
  deals_lost:             'Deals perdidos',
}

export interface RangeFilter {
  from: string // YYYY-MM-DD
  to: string   // YYYY-MM-DD
}

export type FunnelType = 'clase_gratuita' | 'tasacion' | 'otro'

export interface CampaignFunnelRow {
  campaign_id: string
  campaign_name: string | null
  funnel_type: FunnelType
  impressions: number
  clicks: number
  ctr: number
  spend: number
  registrations: number
  cost_per_registration: number | null
}

export interface FunnelDayRow {
  day: string
  class_registrations: number
  appraisal_requests: number
  appointments_scheduled: number
  visits_completed: number
  appraisals_delivered: number
  properties_captured: number
  deals_lost: number
}

export interface MetricsComparison<T> {
  current: T
  previous: T
  delta_pct: Partial<Record<keyof T, number>>
}
