import 'server-only'
import type { RangeFilter } from './types'

/**
 * Capa de datos del panel "Consultas por propiedad" (/metrics) — espejo del
 * patrón lib/metrics/funnel.ts: RPCs get_*(p_from, p_to) + mapper puro testeable.
 *
 * Cliente Supabase autenticado por cookies (RLS aplica al usuario de la sesión;
 * el gate de negocio es requirePermission('metrics.view') en la ruta). Los
 * imports de next/headers y del server-client van DIFERIDOS para que el módulo
 * sea importable bajo vitest mockeando solo `server-only`.
 */
async function getSupabase() {
  const { cookies } = await import('next/headers')
  const { createClient } = await import('@/lib/supabase/server')
  const cookieStore = await cookies()
  return createClient(cookieStore)
}

export interface PropertyInquiryCountRow {
  property_id: string
  address: string | null
  neighborhood: string | null
  assigned_to: string | null
  assigned_name: string | null
  total: number
  mercadolibre: number
  argenprop: number
  zonaprop: number
  last_inquiry_at: string | null
}

export interface InquiriesSummary {
  total: number
  matched: number
  unidentified: number
  mercadolibre: number
  argenprop: number
  zonaprop: number
}

export interface UnidentifiedInquiry {
  id: string
  seq: number
  portal: string
  received_at: string | null
  created_at: string
  lead_name: string | null
  property_external_code: string | null
  property_url: string | null
  property_address: string | null
  raw_subject: string | null
}

interface MetricRow { metric: string; value: number | string }

const SUMMARY_KEYS = ['total', 'matched', 'unidentified', 'mercadolibre', 'argenprop', 'zonaprop'] as const

/** Mapper puro (testeable sin DB): filas (metric, value) de la RPC → objeto summary. */
export function rowsToSummary(rows: MetricRow[] | null): InquiriesSummary {
  const map = Object.fromEntries((rows ?? []).map(r => [r.metric, Number(r.value)]))
  const out = { total: 0, matched: 0, unidentified: 0, mercadolibre: 0, argenprop: 0, zonaprop: 0 }
  for (const k of SUMMARY_KEYS) {
    if (Number.isFinite(map[k])) out[k] = map[k]
  }
  return out
}

/** Una fila por propiedad con >=1 consulta en el rango, con nombre del asesor hidratado. */
export async function getPropertyInquiryCounts(range: RangeFilter): Promise<PropertyInquiryCountRow[]> {
  const supabase = await getSupabase()
  const { data, error } = await (supabase as any).rpc('get_property_inquiry_counts', {
    p_from: range.from,
    p_to: range.to,
  })
  if (error) throw new Error(`get_property_inquiry_counts: ${error.message}`)

  const rows = (data ?? []) as Array<Omit<PropertyInquiryCountRow, 'assigned_name'>>

  // Hidratar el nombre del asesor (mismo patrón que /api/portal-inquiries).
  const advisorIds = Array.from(new Set(rows.map(r => r.assigned_to).filter(Boolean))) as string[]
  let nameMap = new Map<string, string | null>()
  if (advisorIds.length > 0) {
    const { data: profs } = await (supabase as any).from('profiles').select('id, full_name').in('id', advisorIds)
    nameMap = new Map(((profs ?? []) as Array<{ id: string; full_name: string | null }>).map(p => [p.id, p.full_name]))
  }

  return rows.map(r => ({
    ...r,
    total: Number(r.total),
    mercadolibre: Number(r.mercadolibre),
    argenprop: Number(r.argenprop),
    zonaprop: Number(r.zonaprop),
    assigned_name: r.assigned_to ? nameMap.get(r.assigned_to) ?? null : null,
  }))
}

/** Escalares del período para las tarjetas resumen. */
export async function getInquiriesSummary(range: RangeFilter): Promise<InquiriesSummary> {
  const supabase = await getSupabase()
  const { data, error } = await (supabase as any).rpc('get_inquiries_summary', {
    p_from: range.from,
    p_to: range.to,
  })
  if (error) throw new Error(`get_inquiries_summary: ${error.message}`)
  return rowsToSummary(data as MetricRow[] | null)
}

/**
 * Consultas SIN propiedad identificada en el rango (grupo visible del panel —
 * decisión del spec: nada se descarta en silencio; sirven para cazar avisos sin
 * mapear). Filtra por created_at (ingesta ≈ recepción); el count del summary usa
 * COALESCE(received_at, created_at) — tolerancia documentada en el spec.
 */
export async function getUnidentifiedInquiries(range: RangeFilter, limit = 50): Promise<UnidentifiedInquiry[]> {
  const supabase = await getSupabase()
  const { data, error } = await (supabase as any)
    .from('portal_inquiries')
    .select('id, seq, portal, received_at, created_at, lead_name, property_external_code, property_url, property_address, raw_subject')
    .is('property_id', null)
    .gte('created_at', `${range.from}T00:00:00Z`)
    .lte('created_at', `${range.to}T23:59:59.999Z`)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`unidentified inquiries: ${error.message}`)
  return (data ?? []) as UnidentifiedInquiry[]
}
