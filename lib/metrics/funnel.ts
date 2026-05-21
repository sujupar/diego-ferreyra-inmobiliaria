import 'server-only'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type {
  FunnelMetrics,
  RangeFilter,
  CampaignFunnelRow,
  FunnelDayRow,
  FunnelType,
} from './types'
import { FUNNEL_METRIC_KEYS } from './types'

/**
 * Cliente Supabase server-side autenticado vía cookies. RLS aplica al usuario
 * de la sesión. Para tareas server-only sin sesión (crons), pasar
 * `useServiceRole=true`.
 */
async function getSupabase(useServiceRole: boolean = false) {
  if (useServiceRole) {
    const { createClient: createAdmin } = await import('@supabase/supabase-js')
    return createAdmin(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
  }
  const cookieStore = await cookies()
  return createClient(cookieStore)
}

interface MetricRow { metric: string; value: number | string }

function rowsToFunnelMetrics(rows: MetricRow[] | null): FunnelMetrics {
  const map = Object.fromEntries((rows ?? []).map(r => [r.metric, Number(r.value)]))
  const out: FunnelMetrics = {
    class_registrations: 0,
    appraisal_requests: 0,
    appointments_scheduled: 0,
    visits_completed: 0,
    appraisals_delivered: 0,
    properties_captured: 0,
    deals_lost: 0,
  }
  for (const k of FUNNEL_METRIC_KEYS) {
    if (typeof map[k] === 'number') out[k] = map[k]
  }
  return out
}

export interface FunnelOptions {
  /** Si true, usa service role (para crons). Default false → cookies + RLS. */
  serviceRole?: boolean
}

export async function getFunnelMetrics(range: RangeFilter, opts: FunnelOptions = {}): Promise<FunnelMetrics> {
  const supabase = await getSupabase(opts.serviceRole)
  const { data, error } = await (supabase as any).rpc('get_funnel_metrics', {
    p_from: range.from,
    p_to: range.to,
  })
  if (error) throw new Error(`get_funnel_metrics: ${error.message}`)
  return rowsToFunnelMetrics(data as MetricRow[] | null)
}

export async function getFunnelByCampaign(range: RangeFilter, opts: FunnelOptions = {}): Promise<CampaignFunnelRow[]> {
  const supabase = await getSupabase(opts.serviceRole)
  const { data, error } = await (supabase as any).rpc('get_meta_funnel_by_campaign', {
    p_from: range.from,
    p_to: range.to,
  })
  if (error) throw new Error(`get_meta_funnel_by_campaign: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    campaign_id: r.campaign_id,
    campaign_name: r.campaign_name,
    funnel_type: (r.funnel_type as FunnelType) ?? 'otro',
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    landing_page_views: Number(r.landing_page_views ?? 0),
    ctr: Number(r.ctr),
    spend: Number(r.spend),
    registrations: Number(r.registrations),
    cost_per_registration: r.cost_per_registration == null ? null : Number(r.cost_per_registration),
  }))
}

export async function getFunnelByDay(range: RangeFilter, opts: FunnelOptions = {}): Promise<FunnelDayRow[]> {
  const supabase = await getSupabase(opts.serviceRole)
  const { data, error } = await (supabase as any).rpc('get_funnel_metrics_by_day', {
    p_from: range.from,
    p_to: range.to,
  })
  if (error) throw new Error(`get_funnel_metrics_by_day: ${error.message}`)
  return (data ?? []).map((r: any) => ({
    day: r.day,
    class_registrations: Number(r.class_registrations),
    appraisal_requests: Number(r.appraisal_requests),
    appointments_scheduled: Number(r.appointments_scheduled),
    visits_completed: Number(r.visits_completed),
    appraisals_delivered: Number(r.appraisals_delivered),
    properties_captured: Number(r.properties_captured),
    deals_lost: Number(r.deals_lost),
  }))
}
