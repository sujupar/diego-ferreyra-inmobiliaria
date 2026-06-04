import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'

/**
 * Reporte Diario de Marketing — corre 06:00 AM Argentina (09:00 UTC).
 *
 * Contenido: DOS tablas de embudo (una por origen: clase gratuita y tasación) (cantidades, % de conversión y costo por
 * unidad en ARS y USD). Fuentes: Meta Ads (account-level) + Embudo CRM (RPC
 * get_funnel_metrics, tabla deals). No usa GoHighLevel.
 *
 * Esta función corre fuera de Next.js (no puede importar @/lib). La lógica de la
 * tabla está INLINEADA acá y replicada en lib/marketing/funnel-report.ts —
 * mantener sincronizadas. Las otras 3 funciones scheduled-*-report.mts comparten
 * el mismo bloque de helpers (solo cambian rango, flag enabled y schedule).
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

interface OriginSlice {
  spendArs: number; reach: number; landingPageViews: number
  leads: number; appointmentsScheduled: number; appraisalsDelivered: number; propertiesCaptured: number
}
interface FunnelData { clase: OriginSlice; tasacion: OriginSlice }

function _nextDay(d: string): string {
  const dt = new Date(d + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

const LEAD_ACTION_TYPES = ['lead', 'complete_registration', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'offsite_conversion.fb_pixel_complete_registration']

// Meta a nivel CAMPAÑA, clasificando por nombre: %clase%/%curso% → clase ;
// %tasaci% → tasación (igual que vw_meta_ads_funnel_daily). spend/visitas se
// atribuyen limpio; reach se suma por campaña (puede solapar; aceptado).
async function _fetchMetaByOrigin(from: string, to: string): Promise<{ clase: { spendArs: number; reach: number; landingPageViews: number }; tasacion: { spendArs: number; reach: number; landingPageViews: number } }> {
  const raw = process.env.META_AD_ACCOUNT_ID
  const token = process.env.META_ACCESS_TOKEN
  if (!raw || !token) throw new Error('Falta META_AD_ACCOUNT_ID o META_ACCESS_TOKEN')
  const accountId = raw.startsWith('act_') ? raw : `act_${raw}`
  const timeRange = JSON.stringify({ since: from, until: to })
  const url = `${META_API_BASE}/${accountId}/insights?fields=campaign_name,spend,reach,actions&time_range=${encodeURIComponent(timeRange)}&level=campaign&access_token=${token}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Meta API HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  const clase = { spendArs: 0, reach: 0, landingPageViews: 0 }
  const tasacion = { spendArs: 0, reach: 0, landingPageViews: 0 }
  for (const row of (json.data ?? []) as Array<Record<string, unknown>>) {
    const name = String(row.campaign_name ?? '').toLowerCase()
    const slice = (name.includes('clase') || name.includes('curso')) ? clase : (name.includes('tasaci') ? tasacion : null)
    if (!slice) continue
    slice.spendArs += parseFloat(String(row.spend ?? '0')) || 0
    slice.reach += parseInt(String(row.reach ?? '0'), 10) || 0
    const actions = (row.actions ?? []) as Array<{ action_type: string; value: string }>
    const lpv = actions.find(a => a.action_type === 'landing_page_view')
    slice.landingPageViews += lpv ? (parseInt(lpv.value, 10) || 0) : 0
  }
  return { clase, tasacion }
}

// Embudo CRM POR ORIGEN: cada etapa atribuida al origin FIJO del deal, por su
// propia columna de fecha en [from, to] (límites UTC = a col::date BETWEEN).
async function _fetchCrmByOrigin(supabase: unknown, from: string, to: string): Promise<{ clase: { leads: number; appointmentsScheduled: number; appraisalsDelivered: number; propertiesCaptured: number }; tasacion: { leads: number; appointmentsScheduled: number; appraisalsDelivered: number; propertiesCaptured: number } }> {
  const sb = supabase as { from: (t: string) => { select: (c: string, o: unknown) => { eq: (k: string, v: string) => { gte: (k: string, v: string) => { lt: (k: string, v: string) => Promise<{ count: number | null }> } } } } }
  const toNext = _nextDay(to)
  const count = async (origin: string, col: string): Promise<number> => {
    const { count } = await sb.from('deals').select('id', { count: 'exact', head: true }).eq('origin', origin).gte(col, from).lt(col, toNext)
    return count ?? 0
  }
  const sliceFor = async (origin: string) => {
    const [leads, appointmentsScheduled, appraisalsDelivered, propertiesCaptured] = await Promise.all([
      count(origin, 'created_at'), count(origin, 'scheduled_at'), count(origin, 'delivered_at'), count(origin, 'captured_at'),
    ])
    return { leads, appointmentsScheduled, appraisalsDelivered, propertiesCaptured }
  }
  const [clase, tasacion] = await Promise.all([sliceFor('clase_gratuita'), sliceFor('embudo')])
  return { clase, tasacion }
}

const _TH = 'padding:8px 12px;border:1px solid #9ca3af;background:#111827;color:#fff;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.3px;'
const _TD = 'padding:8px 12px;border:1px solid #d1d5db;font-size:13px;color:#1f2937;'
const _TITLE: Record<string, string> = { daily: 'Reporte Diario', weekly: 'Reporte Semanal', biweekly: 'Reporte Quincenal', monthly: 'Reporte Mensual' }
const _SHORT: Record<string, string> = { daily: 'Diario', weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }

function _buildFunnelEmail(type: string, from: string, to: string, data: FunnelData, rate: number, warnings: string[]): { subject: string; html: string } {
  const period = from === to ? _fmtDate(to) : `${_fmtDate(from)} — ${_fmtDate(to)}`
  const head = '<tr>' + ['Etapa', 'Cantidad', 'Conversión', 'Costo ARS', 'Costo USD'].map((c, i) => `<th style="${_TH}text-align:${i === 0 ? 'left' : 'right'};">${c}</th>`).join('') + '</tr>'
  const row = (cells: string[], opts: { bold?: boolean; hi?: boolean } = {}) => '<tr>' + cells.map((v, i) => {
    const align = i === 0 ? 'left' : 'right'
    const weight = (i === 0 || opts.bold) ? 'font-weight:700;' : ''
    const bg = opts.hi ? 'background:#f9fafb;' : ''
    return `<td style="${_TD}${bg}text-align:${align};${weight}">${v}</td>`
  }).join('') + '</tr>'

  // Una tabla por origen, encadenada: cada % vs la fila de arriba (Agendadas vs Leads de ESA tabla).
  const table = (title: string, leadLabel: string, s: OriginSlice): string => {
    const spendUsd = rate > 0 ? s.spendArs / rate : 0
    const cost = (n: number) => n > 0 ? { ars: _ars(s.spendArs / n), usd: _usd(spendUsd / n) } : { ars: '—', usd: '—' }
    const steps: Array<{ label: string; count: number; convNum: number | null; convDen: number | null }> = [
      { label: 'Alcance', count: s.reach, convNum: null, convDen: null },
      { label: 'Visitas a la landing', count: s.landingPageViews, convNum: s.landingPageViews, convDen: s.reach },
      { label: leadLabel, count: s.leads, convNum: s.leads, convDen: s.landingPageViews },
      { label: 'Tasaciones Agendadas', count: s.appointmentsScheduled, convNum: s.appointmentsScheduled, convDen: s.leads },
      { label: 'Tasaciones Hechas', count: s.appraisalsDelivered, convNum: s.appraisalsDelivered, convDen: s.appointmentsScheduled },
      { label: 'Captaciones', count: s.propertiesCaptured, convNum: s.propertiesCaptured, convDen: s.appraisalsDelivered },
    ]
    const invRow = row(['Inversión Embudo', '—', '—', _ars(s.spendArs), _usd(spendUsd)], { bold: true, hi: true })
    const stepRows = steps.map(st => { const c = cost(st.count); return row([st.label, _int(st.count), st.convDen === null ? '—' : _pct(st.convNum as number, st.convDen), c.ars, c.usd]) }).join('')
    return `<h2 style="color:#111827;font-size:17px;margin:24px 0 10px;">${title}</h2><table style="border-collapse:collapse;width:100%;max-width:680px;"><thead>${head}</thead><tbody>${invRow}${stepRows}</tbody></table>`
  }
  const tablaClase = table('Embudo — Clase Gratuita', 'Leads Clase Gratuita', data.clase)
  const tablaTasacion = table('Embudo — Tasación Directa', 'Leads de Tasación', data.tasacion)

  const warnBanner = warnings.length === 0 ? '' : `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-bottom:20px;"><p style="color:#991b1b;font-weight:600;font-size:13px;margin:0 0 4px;">Algunas fuentes de datos fallaron (valores posiblemente incompletos):</p><ul style="margin:0;padding-left:18px;">${warnings.map(w => `<li style="color:#dc2626;font-size:12px;">${w}</li>`).join('')}</ul></div>`

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:32px 16px;">
  <div style="background:#111827;border-radius:12px 12px 0 0;padding:24px 32px;">
    <img src="https://inmodf.com.ar/pdf-assets/logos/Logo%20Diego%20Ferreyra.png" alt="Diego Ferreyra Inmobiliaria" style="height:44px;margin-bottom:12px;" />
    <p style="color:#9ca3af;font-size:14px;margin:4px 0 0;">${_TITLE[type]} de Marketing</p>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:32px;">
    <p style="color:#6b7280;font-size:14px;margin:0 0 4px;">Período: <strong style="color:#374151;">${period}</strong></p>
    <p style="color:#9ca3af;font-size:12px;margin:0 0 16px;">Dos embudos separados por origen del lead. Cada etapa (agendada/hecha/captación) cuenta en la tabla del origen del que provino ese lead.</p>
    ${warnBanner}
    ${tablaClase}
    ${tablaTasacion}
    <p style="color:#9ca3af;font-size:12px;margin:16px 0 0;">El costo de cada etapa = inversión de ESA tabla / cantidad. Tipo de cambio: dólar blue. Alcance: sumado por campaña del embudo (puede solapar levemente entre campañas del mismo origen).</p>
  </div>
  <div style="text-align:center;padding:16px;"><p style="color:#9ca3af;font-size:12px;margin:0;">Reporte generado automáticamente</p></div>
</div></body></html>`

  const subject = `Embudo ${_SHORT[type]} — Tasación ${data.tasacion.leads}L/${data.tasacion.propertiesCaptured}C · Clase ${data.clase.leads}L/${data.clase.propertiesCaptured}C · ${period}`
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

const REPORT_TYPE = 'daily'

export default async function handler() {
  console.log(`[Daily Report] Triggered at: ${new Date().toISOString()}`)
  let supabase: ReturnType<typeof createClient>
  try {
    supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  } catch (err) {
    console.error('[Daily Report] No se pudo crear el cliente Supabase:', err)
    return
  }

  try {
    // 1) Settings (maybeSingle → no tira si hay 0 filas). Loguea el motivo si se omite.
    const { data: settings } = await supabase
      .from('report_settings')
      .select('recipients, daily_enabled')
      .eq('id', 'default')
      .maybeSingle()
    const s = settings as { recipients?: string[]; daily_enabled?: boolean } | null
    const recipients = s?.recipients ?? []
    if (!s || s.daily_enabled !== true || recipients.length === 0) {
      const reason = !s ? 'no existe la fila report_settings (id=default)' : s.daily_enabled !== true ? 'reporte diario deshabilitado' : 'no hay destinatarios configurados'
      console.log(`[Daily Report] Omitido: ${reason}`)
      await _logRow(supabase, REPORT_TYPE, recipients, '(daily) omitido', 'skipped', reason)
      return
    }

    // 2) Dedup: si ya se envió un diario hoy, no duplicar.
    const { data: existing } = await supabase
      .from('email_report_log')
      .select('id')
      .eq('report_type', REPORT_TYPE)
      .gte('sent_at', new Date().toISOString().split('T')[0] + 'T00:00:00Z')
      .eq('status', 'sent')
      .limit(1)
    if (existing && existing.length > 0) {
      console.log('[Daily Report] Ya enviado hoy, se omite duplicado')
      await _logRow(supabase, REPORT_TYPE, recipients, '(daily) duplicado', 'skipped', 'ya enviado hoy')
      return
    }

    // 3) Rango: ayer.
    const y = new Date(); y.setUTCDate(y.getUTCDate() - 1)
    const dateStr = y.toISOString().split('T')[0]
    const from = dateStr, to = dateStr

    // 4) Datos (resiliente) + tipo de cambio.
    const warnings: string[] = []
    let meta = { clase: { spendArs: 0, reach: 0, landingPageViews: 0 }, tasacion: { spendArs: 0, reach: 0, landingPageViews: 0 } }
    try { meta = await _fetchMetaByOrigin(from, to) } catch (e) { warnings.push('Meta Ads: ' + (e instanceof Error ? e.message : 'error')) }
    let crm = { clase: { leads: 0, appointmentsScheduled: 0, appraisalsDelivered: 0, propertiesCaptured: 0 }, tasacion: { leads: 0, appointmentsScheduled: 0, appraisalsDelivered: 0, propertiesCaptured: 0 } }
    try { crm = await _fetchCrmByOrigin(supabase, from, to) } catch (e) { warnings.push('Embudo CRM: ' + (e instanceof Error ? e.message : 'error')) }
    const data: FunnelData = { clase: { ...meta.clase, ...crm.clase }, tasacion: { ...meta.tasacion, ...crm.tasacion } }
    const rate = await _getUsdToArs()

    // 4b) Solo el diario: poblar meta_ads_daily a nivel campaña (storage del dashboard).
    try {
      const raw = process.env.META_AD_ACCOUNT_ID
      const accountId = raw?.startsWith('act_') ? raw : `act_${raw}`
      const timeRange = JSON.stringify({ since: dateStr, until: dateStr })
      const url = `${META_API_BASE}/${accountId}/insights?fields=campaign_id,campaign_name,impressions,clicks,ctr,spend,actions&time_range=${encodeURIComponent(timeRange)}&level=campaign&access_token=${process.env.META_ACCESS_TOKEN}`
      const res = await fetch(url)
      if (res.ok) {
        const json = await res.json()
        const rows = (json.data || []).map((insight: Record<string, unknown>) => {
          const actions = insight.actions as Array<{ action_type: string; value: string }> | undefined
          let leadCount = 0
          if (actions) for (const lt of LEAD_ACTION_TYPES) { const m = actions.find(a => a.action_type === lt); if (m) { leadCount = parseInt(m.value, 10); if (leadCount > 0) break } }
          const lpv = actions?.find(a => a.action_type === 'landing_page_view')
          const spend = parseFloat(insight.spend as string)
          return {
            date: dateStr,
            campaign_id: insight.campaign_id as string,
            campaign_name: insight.campaign_name as string,
            impressions: parseInt(insight.impressions as string, 10),
            clicks: parseInt(insight.clicks as string, 10),
            landing_page_views: lpv ? (parseInt(lpv.value, 10) || 0) : 0,
            ctr: parseFloat(insight.ctr as string),
            spend,
            leads: leadCount,
            cost_per_lead: leadCount > 0 ? spend / leadCount : null,
          }
        })
        if (rows.length > 0) await supabase.from('meta_ads_daily').upsert(rows, { onConflict: 'date,campaign_id' })
      }
    } catch (e) { console.error('[Daily Report] upsert meta_ads_daily falló (no bloquea):', e) }

    // 5) Render + envío + log.
    const { subject, html } = _buildFunnelEmail(REPORT_TYPE, from, to, data, rate, warnings)
    try {
      await sendViaResend({ to: recipients, subject, html })
      await _logRow(supabase, REPORT_TYPE, recipients, subject, 'sent', warnings.length ? warnings.join(' | ') : null, { from, to, rate, ...data })
      console.log('[Daily Report] Enviado OK')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error'
      console.error('[Daily Report] Error al enviar:', msg)
      await _logRow(supabase, REPORT_TYPE, recipients, subject, 'failed', msg, { from, to, ...data })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Daily Report] Error inesperado:', msg)
    await _logRow(supabase, REPORT_TYPE, [], '(daily) error', 'failed', msg)
  }
}

export const config: Config = {
  schedule: '0 9 * * *', // 09:00 UTC = 06:00 Argentina (UTC-3, sin horario de verano)
}
