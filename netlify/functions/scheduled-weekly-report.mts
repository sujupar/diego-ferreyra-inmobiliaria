import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

/**
 * Reporte Semanal de Marketing — corre cada sábado 06:00 AM Argentina (09:00 UTC).
 * Ventana: últimos 7 días (de hace 7 hasta ayer).
 *
 * Contenido: UNA sola tabla de embudo (cantidades, % conversión, costo ARS/USD).
 * Fuentes: Meta Ads (account-level) + Embudo CRM (RPC get_funnel_metrics).
 * Helpers inlineados (no se puede importar @/lib en Netlify). Mantener
 * sincronizado con lib/marketing/funnel-report.ts y las otras 3 funciones.
 */

const META_API_BASE = 'https://graph.facebook.com/v21.0'
const RESEND_FROM = process.env.EMAIL_FROM_REPORTS ?? 'Diego Ferreyra Inmobiliaria <reportes@inmodf.com.ar>'
const RESEND_REPLY_TO = process.env.EMAIL_REPLY_TO ?? 'contacto.julianparra@gmail.com'

// ===================== Helpers compartidos (sincronizar entre las 4) =====================
async function sendViaResend(opts: { to: string[]; subject: string; html: string }) {
  if (!process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY not set')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to: opts.to, replyTo: RESEND_REPLY_TO, subject: opts.subject, html: opts.html }),
  })
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`)
}

async function _getUsdToArs(): Promise<number> {
  const env = process.env.USD_TO_ARS
  if (env) { const n = parseFloat(env); if (Number.isFinite(n) && n > 0) return n }
  try {
    const res = await fetch('https://api.bluelytics.com.ar/v2/latest', { signal: AbortSignal.timeout(5000), headers: { accept: 'application/json' } })
    if (res.ok) {
      const d = await res.json()
      const blue = d.blue?.value_avg
      if (blue && Number.isFinite(blue) && blue > 0) return blue
      const oficial = d.oficial?.value_avg
      if (oficial && Number.isFinite(oficial) && oficial > 0) return oficial
    }
  } catch { /* fallback abajo */ }
  return 1200
}

const _ars = (v: number) => '$' + Math.round(v).toLocaleString('es-AR')
const _usd = (v: number) => 'US$' + v.toLocaleString('es-AR', v > 0 && v < 1 ? { minimumFractionDigits: 2, maximumFractionDigits: 4 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const _int = (v: number) => v.toLocaleString('es-AR')
const _pct = (num: number, den: number) => den > 0 ? (num / den * 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%' : '—'
const _fmtDate = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

interface FunnelData {
  spendArs: number; reach: number; landingPageViews: number; metaLeads: number
  appraisalRequests: number; appointmentsScheduled: number; appraisalsDelivered: number; propertiesCaptured: number
}

const LEAD_ACTION_TYPES = ['lead', 'complete_registration', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'offsite_conversion.fb_pixel_complete_registration']

async function _fetchMetaAccount(from: string, to: string): Promise<{ spendArs: number; reach: number; landingPageViews: number; metaLeads: number }> {
  const raw = process.env.META_AD_ACCOUNT_ID
  const token = process.env.META_ACCESS_TOKEN
  if (!raw || !token) throw new Error('Falta META_AD_ACCOUNT_ID o META_ACCESS_TOKEN')
  const accountId = raw.startsWith('act_') ? raw : `act_${raw}`
  const timeRange = JSON.stringify({ since: from, until: to })
  const url = `${META_API_BASE}/${accountId}/insights?fields=spend,impressions,reach,actions&time_range=${encodeURIComponent(timeRange)}&access_token=${token}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Meta API HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  const row = json.data?.[0]
  if (!row) return { spendArs: 0, reach: 0, landingPageViews: 0, metaLeads: 0 }
  const actions = (row.actions ?? []) as Array<{ action_type: string; value: string }>
  let metaLeads = 0
  for (const t of LEAD_ACTION_TYPES) { const m = actions.find(a => a.action_type === t); if (m) { metaLeads = parseInt(m.value, 10) || 0; if (metaLeads > 0) break } }
  const lpv = actions.find(a => a.action_type === 'landing_page_view')
  return {
    spendArs: parseFloat(row.spend ?? '0') || 0,
    reach: parseInt(row.reach ?? '0', 10) || 0,
    landingPageViews: lpv ? (parseInt(lpv.value, 10) || 0) : 0,
    metaLeads,
  }
}

interface FunnelRpcRow { metric: string; value: number | string }
async function _fetchCrmFunnel(supabase: unknown, from: string, to: string): Promise<{ appraisalRequests: number; appointmentsScheduled: number; appraisalsDelivered: number; propertiesCaptured: number }> {
  const { data, error } = await (supabase as { rpc: (n: string, a: unknown) => Promise<{ data: unknown; error: { message: string } | null }> }).rpc('get_funnel_metrics', { p_from: from, p_to: to })
  if (error) throw new Error(`get_funnel_metrics: ${error.message}`)
  const map = Object.fromEntries(((data ?? []) as FunnelRpcRow[]).map(r => [r.metric, Number(r.value)]))
  return {
    appraisalRequests: map.appraisal_requests ?? 0,
    appointmentsScheduled: map.appointments_scheduled ?? 0,
    appraisalsDelivered: map.appraisals_delivered ?? 0,
    propertiesCaptured: map.properties_captured ?? 0,
  }
}

const _TH = 'padding:8px 12px;border:1px solid #9ca3af;background:#111827;color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;'
const _TD = 'padding:8px 12px;border:1px solid #d1d5db;font-size:13px;color:#1f2937;'
const _TITLE: Record<string, string> = { daily: 'Reporte Diario', weekly: 'Reporte Semanal', biweekly: 'Reporte Quincenal', monthly: 'Reporte Mensual' }
const _SHORT: Record<string, string> = { daily: 'Diario', weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }

function _buildFunnelEmail(type: string, from: string, to: string, data: FunnelData, rate: number, warnings: string[]): { subject: string; html: string } {
  const spendUsd = rate > 0 ? data.spendArs / rate : 0
  const cost = (n: number) => n > 0 ? { ars: _ars(data.spendArs / n), usd: _usd(spendUsd / n) } : { ars: '—', usd: '—' }
  const period = from === to ? _fmtDate(to) : `${_fmtDate(from)} — ${_fmtDate(to)}`

  const head = '<tr>' + ['Etapa', 'Cantidad', 'Conversión', 'Costo ARS', 'Costo USD'].map((c, i) => `<th style="${_TH}text-align:${i === 0 ? 'left' : 'right'};">${c}</th>`).join('') + '</tr>'
  const row = (cells: string[], opts: { bold?: boolean; hi?: boolean } = {}) => '<tr>' + cells.map((v, i) => {
    const align = i === 0 ? 'left' : 'right'
    const weight = (i === 0 || opts.bold) ? 'font-weight:700;' : ''
    const bg = opts.hi ? 'background:#f9fafb;' : ''
    return `<td style="${_TD}${bg}text-align:${align};${weight}">${v}</td>`
  }).join('') + '</tr>'

  const steps: Array<{ label: string; count: number; prev: number | null }> = [
    { label: 'Alcance', count: data.reach, prev: null },
    { label: 'Visitas a la landing', count: data.landingPageViews, prev: data.reach },
    { label: 'Descarga Guía / Prospectos', count: data.metaLeads, prev: data.landingPageViews },
    { label: 'Leads de Tasación', count: data.appraisalRequests, prev: data.metaLeads },
    { label: 'Tasaciones Agendadas', count: data.appointmentsScheduled, prev: data.appraisalRequests },
    { label: 'Tasaciones Hechas', count: data.appraisalsDelivered, prev: data.appointmentsScheduled },
    { label: 'Captaciones', count: data.propertiesCaptured, prev: data.appraisalsDelivered },
  ]
  const invRow = row(['Inversión Embudo', '—', '—', _ars(data.spendArs), _usd(spendUsd)], { bold: true, hi: true })
  const stepRows = steps.map(s => { const c = cost(s.count); return row([s.label, _int(s.count), s.prev === null ? '—' : _pct(s.count, s.prev), c.ars, c.usd]) }).join('')

  const warnBanner = warnings.length === 0 ? '' : `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-bottom:20px;"><p style="color:#991b1b;font-weight:600;font-size:13px;margin:0 0 4px;">Algunas fuentes de datos fallaron (valores posiblemente incompletos):</p><ul style="margin:0;padding-left:18px;">${warnings.map(w => `<li style="color:#dc2626;font-size:12px;">${w}</li>`).join('')}</ul></div>`

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:32px 16px;">
  <div style="background:#111827;border-radius:12px 12px 0 0;padding:24px 32px;">
    <img src="https://inmodf.com.ar/pdf-assets/logos/Logo%20Diego%20Ferreyra.png" alt="Diego Ferreyra Inmobiliaria" style="height:44px;margin-bottom:12px;" />
    <p style="color:#9ca3af;font-size:14px;margin:4px 0 0;">${_TITLE[type]} de Marketing</p>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:32px;">
    <p style="color:#6b7280;font-size:14px;margin:0 0 20px;">Período: <strong style="color:#374151;">${period}</strong></p>
    ${warnBanner}
    <h2 style="color:#111827;font-size:18px;margin:0 0 12px;">Embudo de Captación</h2>
    <table style="border-collapse:collapse;width:100%;max-width:680px;"><thead>${head}</thead><tbody>${invRow}${stepRows}</tbody></table>
    <p style="color:#9ca3af;font-size:12px;margin:14px 0 0;">El costo de cada etapa es la inversión total dividida por la cantidad de esa etapa. Tipo de cambio: dólar blue.</p>
  </div>
  <div style="text-align:center;padding:16px;"><p style="color:#9ca3af;font-size:12px;margin:0;">Reporte generado automáticamente</p></div>
</div></body></html>`

  const subject = `Embudo ${_SHORT[type]} — ${data.propertiesCaptured} captac. · ${data.appraisalRequests} leads tasación · ${period}`
  return { subject, html }
}

async function _logRow(supabase: unknown, type: string, recipients: string[], subject: string, status: string, errorMessage: string | null, snapshot?: Record<string, unknown>) {
  try {
    await (supabase as { from: (t: string) => { insert: (v: unknown) => Promise<unknown> } }).from('email_report_log').insert({
      report_type: type, recipients, subject, status, error_message: errorMessage, data_snapshot: snapshot ?? null,
    })
  } catch (e) {
    console.error('[Report] no se pudo loguear en email_report_log:', e)
  }
}
// =========================================================================================

const REPORT_TYPE = 'weekly'

export default async function handler() {
  console.log(`[Weekly Report] Triggered at: ${new Date().toISOString()}`)
  let supabase: ReturnType<typeof createClient>
  try {
    supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  } catch (err) {
    console.error('[Weekly Report] No se pudo crear el cliente Supabase:', err)
    return
  }

  try {
    const { data: settings } = await supabase
      .from('report_settings')
      .select('recipients, weekly_enabled')
      .eq('id', 'default')
      .maybeSingle()
    const s = settings as { recipients?: string[]; weekly_enabled?: boolean } | null
    const recipients = s?.recipients ?? []
    if (!s || s.weekly_enabled !== true || recipients.length === 0) {
      const reason = !s ? 'no existe la fila report_settings (id=default)' : s.weekly_enabled !== true ? 'reporte semanal deshabilitado' : 'no hay destinatarios configurados'
      console.log(`[Weekly Report] Omitido: ${reason}`)
      await _logRow(supabase, REPORT_TYPE, recipients, '(weekly) omitido', 'skipped', reason)
      return
    }

    const { data: existing } = await supabase
      .from('email_report_log')
      .select('id')
      .eq('report_type', REPORT_TYPE)
      .gte('sent_at', new Date().toISOString().split('T')[0] + 'T00:00:00Z')
      .eq('status', 'sent')
      .limit(1)
    if (existing && existing.length > 0) {
      console.log('[Weekly Report] Ya enviado hoy, se omite duplicado')
      await _logRow(supabase, REPORT_TYPE, recipients, '(weekly) duplicado', 'skipped', 'ya enviado hoy')
      return
    }

    // Rango: últimos 7 días (de hace 7 hasta ayer).
    const toD = new Date(); toD.setUTCDate(toD.getUTCDate() - 1)
    const fromD = new Date(toD); fromD.setUTCDate(fromD.getUTCDate() - 6)
    const from = fromD.toISOString().split('T')[0]
    const to = toD.toISOString().split('T')[0]

    const warnings: string[] = []
    let meta = { spendArs: 0, reach: 0, landingPageViews: 0, metaLeads: 0 }
    try { meta = await _fetchMetaAccount(from, to) } catch (e) { warnings.push('Meta Ads: ' + (e instanceof Error ? e.message : 'error')) }
    let crm = { appraisalRequests: 0, appointmentsScheduled: 0, appraisalsDelivered: 0, propertiesCaptured: 0 }
    try { crm = await _fetchCrmFunnel(supabase, from, to) } catch (e) { warnings.push('Embudo CRM: ' + (e instanceof Error ? e.message : 'error')) }
    const data: FunnelData = { ...meta, ...crm }
    const rate = await _getUsdToArs()

    const { subject, html } = _buildFunnelEmail(REPORT_TYPE, from, to, data, rate, warnings)
    try {
      await sendViaResend({ to: recipients, subject, html })
      await _logRow(supabase, REPORT_TYPE, recipients, subject, 'sent', warnings.length ? warnings.join(' | ') : null, { from, to, rate, ...data })
      console.log('[Weekly Report] Enviado OK')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[Weekly Report] Error al enviar:', msg)
      await _logRow(supabase, REPORT_TYPE, recipients, subject, 'failed', msg, { from, to, ...data })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Weekly Report] Error inesperado:', msg)
    await _logRow(supabase, REPORT_TYPE, [], '(weekly) error', 'failed', msg)
  }
}

export const config: Config = {
  schedule: '0 9 * * 6', // Sábado 09:00 UTC = 06:00 AM Argentina (UTC-3)
}
