/**
 * Reporte de Embudo — una sola tabla tipo planilla (cantidades, % de conversión
 * y costo por unidad en ARS y USD). Reemplaza el reporte denso anterior.
 *
 * Filas del embudo y su fuente de datos:
 *   1. Inversión Embudo        → Meta Ads `spend` del período (total)
 *   2. Alcance                 → Meta Ads `reach` (account-level, deduplicado)
 *   3. Visitas a la landing    → Meta Ads action `landing_page_view`
 *   4. Descarga Guía/Prospectos→ Meta Ads leads (opt-in en la landing)
 *   5. Leads de Tasación       → CRM `appraisal_requests` (deals origin='embudo')
 *   6. Tasaciones Agendadas    → CRM `appointments_scheduled`
 *   7. Tasaciones Hechas       → CRM `appraisals_delivered`
 *   8. Captaciones             → CRM `properties_captured`
 *
 * El costo por unidad de cada fila = gasto_total / cantidad (consistente en ARS
 * y USD). Tipo de cambio: dólar blue (Bluelytics) vía getUsdToArs().
 *
 * IMPORTANTE: la misma lógica está INLINEADA en las 4 funciones
 * netlify/functions/scheduled-*-report.mts (no pueden importar @/lib en Netlify).
 * Si cambiás la tabla acá, sincronizá esos archivos.
 */
import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import { getUsdToArs } from './usd-rate'

const META_API_BASE = 'https://graph.facebook.com/v21.0'

const FROM = process.env.EMAIL_FROM_REPORTS
  ?? 'Diego Ferreyra Inmobiliaria <reportes@inmodf.com.ar>'
const REPLY_TO = process.env.EMAIL_REPLY_TO
  ?? 'contacto.julianparra@gmail.com'

export type FunnelReportType = 'daily' | 'weekly' | 'biweekly' | 'monthly'

const TYPE_TITLE: Record<FunnelReportType, string> = {
  daily: 'Reporte Diario',
  weekly: 'Reporte Semanal',
  biweekly: 'Reporte Quincenal',
  monthly: 'Reporte Mensual',
}
const TYPE_SHORT: Record<FunnelReportType, string> = {
  daily: 'Diario', weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual',
}

export interface FunnelData {
  spendArs: number
  reach: number
  landingPageViews: number
  metaLeads: number
  appraisalRequests: number
  appointmentsScheduled: number
  appraisalsDelivered: number
  propertiesCaptured: number
}

function admin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const LEAD_ACTION_TYPES = ['lead', 'complete_registration', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'offsite_conversion.fb_pixel_complete_registration']

/** Insights a nivel CUENTA (no por campaña) para tener un `reach` deduplicado. */
export async function fetchMetaAccountInsights(from: string, to: string): Promise<Pick<FunnelData, 'spendArs' | 'reach' | 'landingPageViews' | 'metaLeads'>> {
  const raw = process.env.META_AD_ACCOUNT_ID
  const token = process.env.META_ACCESS_TOKEN
  if (!raw || !token) throw new Error('Falta META_AD_ACCOUNT_ID o META_ACCESS_TOKEN')
  const accountId = raw.startsWith('act_') ? raw : `act_${raw}`
  const fields = 'spend,impressions,reach,actions'
  const timeRange = JSON.stringify({ since: from, until: to })
  const url = `${META_API_BASE}/${accountId}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&access_token=${token}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Meta API HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  const row = json.data?.[0]
  if (!row) return { spendArs: 0, reach: 0, landingPageViews: 0, metaLeads: 0 }
  const actions = (row.actions ?? []) as Array<{ action_type: string; value: string }>
  let metaLeads = 0
  for (const t of LEAD_ACTION_TYPES) {
    const m = actions.find(a => a.action_type === t)
    if (m) { metaLeads = parseInt(m.value, 10) || 0; if (metaLeads > 0) break }
  }
  const lpv = actions.find(a => a.action_type === 'landing_page_view')
  return {
    spendArs: parseFloat(row.spend ?? '0') || 0,
    reach: parseInt(row.reach ?? '0', 10) || 0,
    landingPageViews: lpv ? (parseInt(lpv.value, 10) || 0) : 0,
    metaLeads,
  }
}

interface FunnelRpcRow { metric: string; value: number | string }
export async function fetchCrmFunnel(from: string, to: string): Promise<Pick<FunnelData, 'appraisalRequests' | 'appointmentsScheduled' | 'appraisalsDelivered' | 'propertiesCaptured'>> {
  const supabase = admin()
  const { data, error } = await supabase.rpc('get_funnel_metrics' as never, { p_from: from, p_to: to } as never)
  if (error) throw new Error(`get_funnel_metrics: ${error.message}`)
  const map = Object.fromEntries(((data ?? []) as FunnelRpcRow[]).map(r => [r.metric, Number(r.value)]))
  return {
    appraisalRequests: map.appraisal_requests ?? 0,
    appointmentsScheduled: map.appointments_scheduled ?? 0,
    appraisalsDelivered: map.appraisals_delivered ?? 0,
    propertiesCaptured: map.properties_captured ?? 0,
  }
}

/** Trae Meta + CRM de forma resiliente (si una fuente falla, devuelve 0 + warning). */
export async function gatherFunnelData(from: string, to: string): Promise<{ data: FunnelData; warnings: string[] }> {
  const warnings: string[] = []
  let meta = { spendArs: 0, reach: 0, landingPageViews: 0, metaLeads: 0 }
  try { meta = await fetchMetaAccountInsights(from, to) }
  catch (e) { warnings.push('Meta Ads: ' + (e instanceof Error ? e.message : 'error')) }
  let crm = { appraisalRequests: 0, appointmentsScheduled: 0, appraisalsDelivered: 0, propertiesCaptured: 0 }
  try { crm = await fetchCrmFunnel(from, to) }
  catch (e) { warnings.push('Embudo CRM: ' + (e instanceof Error ? e.message : 'error')) }
  return { data: { ...meta, ...crm }, warnings }
}

// ===== Formato (es-AR) =====
const _ars = (v: number) => '$' + Math.round(v).toLocaleString('es-AR')
const _usd = (v: number) => 'US$' + v.toLocaleString('es-AR', v > 0 && v < 1
  ? { minimumFractionDigits: 2, maximumFractionDigits: 4 }
  : { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const _int = (v: number) => v.toLocaleString('es-AR')
const _pct = (num: number, den: number) => den > 0
  ? (num / den * 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%'
  : '—'
const _fmtDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

function periodLabel(type: FunnelReportType, from: string, to: string): string {
  return from === to ? _fmtDate(to) : `${_fmtDate(from)} — ${_fmtDate(to)}`
}

/** Rango por defecto según tipo (hasta ayer, en UTC). */
export function computeRange(type: FunnelReportType): { from: string; to: string } {
  const to = new Date(); to.setUTCDate(to.getUTCDate() - 1)
  const span = type === 'daily' ? 0 : type === 'weekly' ? 6 : type === 'biweekly' ? 13 : 29
  const from = new Date(to); from.setUTCDate(from.getUTCDate() - span)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

const _TH = 'padding:8px 12px;border:1px solid #9ca3af;background:#111827;color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;'
const _TD = 'padding:8px 12px;border:1px solid #d1d5db;font-size:13px;color:#1f2937;'

function headHtml(cells: string[]): string {
  return '<tr>' + cells.map((c, i) =>
    `<th style="${_TH}text-align:${i === 0 ? 'left' : 'right'};">${c}</th>`
  ).join('') + '</tr>'
}

function rowHtml(cells: string[], opts: { bold?: boolean; highlight?: boolean } = {}): string {
  const bg = opts.highlight ? 'background:#f9fafb;' : ''
  return '<tr>' + cells.map((v, i) => {
    const align = i === 0 ? 'left' : 'right'
    const weight = (i === 0 || opts.bold) ? 'font-weight:700;' : ''
    return `<td style="${_TD}${bg}text-align:${align};${weight}">${v}</td>`
  }).join('') + '</tr>'
}

/** Devuelve { subject, html } con la tabla del embudo. */
export function renderFunnelEmail(type: FunnelReportType, from: string, to: string, data: FunnelData, rate: number, warnings: string[] = []): { subject: string; html: string } {
  const spendUsd = rate > 0 ? data.spendArs / rate : 0
  const cost = (n: number) => n > 0
    ? { ars: _ars(data.spendArs / n), usd: _usd(spendUsd / n) }
    : { ars: '—', usd: '—' }

  // Cadena del embudo: cantidad + conversión vs fila anterior.
  const steps: Array<{ label: string; count: number; prev: number | null }> = [
    { label: 'Alcance', count: data.reach, prev: null },
    { label: 'Visitas a la landing', count: data.landingPageViews, prev: data.reach },
    { label: 'Descarga Guía / Prospectos', count: data.metaLeads, prev: data.landingPageViews },
    { label: 'Leads de Tasación', count: data.appraisalRequests, prev: data.metaLeads },
    { label: 'Tasaciones Agendadas', count: data.appointmentsScheduled, prev: data.appraisalRequests },
    { label: 'Tasaciones Hechas', count: data.appraisalsDelivered, prev: data.appointmentsScheduled },
    { label: 'Captaciones', count: data.propertiesCaptured, prev: data.appraisalsDelivered },
  ]

  const head = headHtml(['Etapa', 'Cantidad', 'Conversión', 'Costo ARS', 'Costo USD'])

  const invRow = rowHtml(['Inversión Embudo', '—', '—', _ars(data.spendArs), _usd(spendUsd)], { bold: true, highlight: true })
  const stepRows = steps.map(s => {
    const c = cost(s.count)
    const conv = s.prev === null ? '—' : _pct(s.count, s.prev)
    return rowHtml([s.label, _int(s.count), conv, c.ars, c.usd])
  }).join('')

  const warnBanner = warnings.length === 0 ? '' : `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <p style="color:#991b1b;font-weight:600;font-size:13px;margin:0 0 4px;">Algunas fuentes de datos fallaron (los valores pueden estar incompletos):</p>
      <ul style="margin:0;padding-left:18px;">${warnings.map(w => `<li style="color:#dc2626;font-size:12px;">${w}</li>`).join('')}</ul>
    </div>`

  const period = periodLabel(type, from, to)
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:32px 16px;">
  <div style="background:#111827;border-radius:12px 12px 0 0;padding:24px 32px;">
    <img src="https://meek-belekoy-dcf620.netlify.app/pdf-assets/logos/Logo%20Diego%20Ferreyra.png" alt="Diego Ferreyra Inmobiliaria" style="height:44px;margin-bottom:12px;" />
    <p style="color:#9ca3af;font-size:14px;margin:4px 0 0;">${TYPE_TITLE[type]} de Marketing</p>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:32px;">
    <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">Período: <strong style="color:#374151;">${period}</strong></p>
    ${warnBanner}
    <h2 style="color:#111827;font-size:18px;margin:0 0 12px;">Embudo de Captación</h2>
    <table style="border-collapse:collapse;width:100%;max-width:680px;">
      <thead>${head}</thead>
      <tbody>${invRow}${stepRows}</tbody>
    </table>
    <p style="color:#9ca3af;font-size:12px;margin:14px 0 0;">El costo de cada etapa es la inversión total dividida por la cantidad de esa etapa. Tipo de cambio: dólar blue.</p>
  </div>
  <div style="text-align:center;padding:16px;"><p style="color:#9ca3af;font-size:12px;margin:0;">Reporte generado automáticamente</p></div>
</div></body></html>`

  const subject = `Embudo ${TYPE_SHORT[type]} — ${data.propertiesCaptured} captac. · ${data.appraisalRequests} leads tasación · ${period}`
  return { subject, html }
}

async function logRow(type: FunnelReportType, recipients: string[], subject: string, status: string, errorMessage: string | null, snapshot?: Record<string, unknown>) {
  try {
    await admin().from('email_report_log').insert({
      report_type: type,
      recipients,
      subject,
      status,
      error_message: errorMessage,
      data_snapshot: snapshot ?? null,
    } as never)
  } catch (e) {
    console.error('[funnel-report] no se pudo loguear en email_report_log:', e)
  }
}

/**
 * Genera y envía el reporte de embudo. Usado por la ruta manual
 * (/api/marketing/reports). Las funciones scheduled inlinean esta misma lógica.
 */
export async function sendFunnelReport(
  type: FunnelReportType,
  opts: { from?: string; to?: string; recipientsOverride?: string[] } = {}
): Promise<{ success: boolean; error?: string; skipped?: boolean; subject?: string; recipients?: string[]; from?: string; to?: string }> {
  // recipientsOverride: para pruebas (ej. mandar solo a vos sin tocar report_settings).
  // Si viene, se ignora el gate de settings (enabled/recipients) y se usa esa lista.
  const override = (opts.recipientsOverride ?? []).filter(Boolean)
  let recipients: string[]

  if (override.length > 0) {
    recipients = override
  } else {
    // 1) Settings (recipients + enabled). maybeSingle → no tira si hay 0 filas.
    let settings: Record<string, unknown> | null = null
    try {
      const { data } = await admin().from('report_settings').select('*').eq('id', 'default').maybeSingle()
      settings = (data ?? null) as Record<string, unknown> | null
    } catch (e) {
      const reason = 'No se pudo leer report_settings: ' + (e instanceof Error ? e.message : 'error')
      await logRow(type, [], `(${type}) sin enviar`, 'failed', reason)
      return { success: false, error: reason }
    }

    const enabledKey = `${type}_enabled`
    recipients = (settings?.recipients as string[] | undefined) ?? []
    if (!settings || settings[enabledKey] !== true || recipients.length === 0) {
      const reason = !settings ? 'no existe la fila report_settings (id=default)'
        : settings[enabledKey] !== true ? `el reporte ${type} está deshabilitado`
        : 'no hay destinatarios configurados'
      await logRow(type, recipients, `(${type}) omitido`, 'skipped', reason)
      return { success: false, skipped: true, error: reason, recipients }
    }
  }

  // 2) Datos + tipo de cambio
  const { from, to } = opts.from && opts.to ? { from: opts.from, to: opts.to } : computeRange(type)
  const { data, warnings } = await gatherFunnelData(from, to)
  const { rate } = await getUsdToArs()
  const { subject, html } = renderFunnelEmail(type, from, to, data, rate, warnings)

  // 3) Enviar
  if (!process.env.RESEND_API_KEY) {
    const reason = 'RESEND_API_KEY no configurada'
    await logRow(type, recipients, subject, 'failed', reason, { from, to, ...data })
    return { success: false, error: reason, recipients, from, to }
  }
  const resend = new Resend(process.env.RESEND_API_KEY)
  try {
    const { error } = await resend.emails.send({ from: FROM, to: recipients, replyTo: REPLY_TO, subject, html })
    if (error) throw new Error(error.message)
    await logRow(type, recipients, subject, 'sent', warnings.length ? warnings.join(' | ') : null, { from, to, rate, ...data })
    return { success: true, subject, recipients, from, to }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    await logRow(type, recipients, subject, 'failed', msg, { from, to, ...data })
    return { success: false, error: msg, recipients, from, to }
  }
}
