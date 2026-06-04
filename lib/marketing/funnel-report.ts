/**
 * Reporte de Embudo — DOS tablas separadas por ORIGEN del lead (clase gratuita
 * vs tasación directa). Cada tabla es un embudo completo e independiente:
 *   Inversión Embudo · Alcance · Visitas a la landing · Leads · Agendadas ·
 *   Hechas · Captaciones — con % encadenado (cada fila vs la de arriba) y costo
 *   por unidad = inversión DE ESA TABLA / cantidad (ARS y USD).
 *
 * Atribución (precisa): el `origin` del deal es FIJO (se setea al crear). Cada
 * etapa de abajo (agendada/hecha/captada) cuenta en la tabla del origin de SU
 * deal, por su propia columna de fecha:
 *   - Tabla Clase Gratuita = deals origin='clase_gratuita' (created/scheduled/delivered/captured_at)
 *   - Tabla Tasación Directa = deals origin='embudo'
 * Meta se trae a nivel CAMPAÑA y se clasifica por nombre (%clase%/%curso% → clase ;
 * %tasaci% → tasación), igual que vw_meta_ads_funnel_daily. spend/visitas son
 * atribuibles limpio; el reach se suma por campaña (caveat: posible solape entre
 * campañas del mismo origen). NO se toca get_funnel_metrics ni vw_funnel_daily
 * (los usa el dashboard /metrics) — los conteos por origin salen de queries
 * directas a `deals` (fetchCrmByOrigin), con límites UTC = a `col::date BETWEEN`.
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

/** Métricas de UN origen — su propio embudo completo (mismas claves en ambos). */
export interface OriginSlice {
  spendArs: number          // gasto de las campañas de ese origen
  reach: number             // alcance sumado por campaña (ver caveat de solape)
  landingPageViews: number  // visitas a la landing de ese origen
  leads: number             // clase: registros a clase · tasación: solicitudes de tasación (deals creados con ese origin)
  appointmentsScheduled: number
  appraisalsDelivered: number
  propertiesCaptured: number
}

/** Dos embudos separados por origen, cada uno con sus propias métricas. */
export interface FunnelData {
  clase: OriginSlice      // origin = 'clase_gratuita'
  tasacion: OriginSlice   // origin = 'embudo' (tasación directa)
}

function admin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function nextDay(d: string): string {
  const dt = new Date(d + 'T00:00:00Z'); dt.setUTCDate(dt.getUTCDate() + 1)
  return dt.toISOString().slice(0, 10)
}

type MetaSlice = Pick<OriginSlice, 'spendArs' | 'reach' | 'landingPageViews'>

/**
 * Meta a nivel CAMPAÑA, clasificando cada campaña por su nombre al origen:
 *   %clase%/%curso% → clase gratuita ; %tasaci% → tasación.
 * (Misma regla que la vista vw_meta_ads_funnel_daily.) Suma gasto/alcance/visitas
 * por origen. Caveat: el reach por campaña NO está deduplicado entre campañas —
 * la tabla tasación suma 2 campañas y puede solapar un poco. spend y visitas sí
 * son atribuibles limpio. Las campañas sin tag ('otro') se ignoran.
 */
export async function fetchMetaByOrigin(from: string, to: string): Promise<{ clase: MetaSlice; tasacion: MetaSlice }> {
  const raw = process.env.META_AD_ACCOUNT_ID
  const token = process.env.META_ACCESS_TOKEN
  if (!raw || !token) throw new Error('Falta META_AD_ACCOUNT_ID o META_ACCESS_TOKEN')
  const accountId = raw.startsWith('act_') ? raw : `act_${raw}`
  const fields = 'campaign_name,spend,reach,actions'
  const timeRange = JSON.stringify({ since: from, until: to })
  const url = `${META_API_BASE}/${accountId}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=campaign&access_token=${token}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Meta API HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const json = await res.json()
  const clase: MetaSlice = { spendArs: 0, reach: 0, landingPageViews: 0 }
  const tasacion: MetaSlice = { spendArs: 0, reach: 0, landingPageViews: 0 }
  for (const row of (json.data ?? []) as Array<Record<string, unknown>>) {
    const name = String(row.campaign_name ?? '').toLowerCase()
    const slice = (name.includes('clase') || name.includes('curso')) ? clase
      : name.includes('tasaci') ? tasacion : null
    if (!slice) continue
    slice.spendArs += parseFloat(String(row.spend ?? '0')) || 0
    slice.reach += parseInt(String(row.reach ?? '0'), 10) || 0
    const actions = (row.actions ?? []) as Array<{ action_type: string; value: string }>
    const lpv = actions.find(a => a.action_type === 'landing_page_view')
    slice.landingPageViews += lpv ? (parseInt(lpv.value, 10) || 0) : 0
  }
  return { clase, tasacion }
}

type CrmDateCol = 'created_at' | 'scheduled_at' | 'delivered_at' | 'captured_at'
type CrmSlice = Pick<OriginSlice, 'leads' | 'appointmentsScheduled' | 'appraisalsDelivered' | 'propertiesCaptured'>

/**
 * Embudo CRM POR ORIGEN: cada etapa atribuida al origin FIJO del deal (se setea
 * al crear, no cambia). Cuenta cada evento por SU propia columna de fecha en
 * [from, to] (límites UTC = a `col::date BETWEEN` de vw_funnel_daily). Una tabla
 * por origen: clase_gratuita y embudo (tasación directa); historico/referido fuera.
 */
export async function fetchCrmByOrigin(from: string, to: string): Promise<{ clase: CrmSlice; tasacion: CrmSlice }> {
  const sb = admin()
  const toNext = nextDay(to)
  const count = async (origin: string, col: CrmDateCol): Promise<number> => {
    const { count } = await sb.from('deals').select('id', { count: 'exact', head: true })
      .eq('origin', origin).gte(col, from).lt(col, toNext)
    return count ?? 0
  }
  const sliceFor = async (origin: string): Promise<CrmSlice> => {
    const [leads, appointmentsScheduled, appraisalsDelivered, propertiesCaptured] = await Promise.all([
      count(origin, 'created_at'),
      count(origin, 'scheduled_at'),
      count(origin, 'delivered_at'),
      count(origin, 'captured_at'),
    ])
    return { leads, appointmentsScheduled, appraisalsDelivered, propertiesCaptured }
  }
  const [clase, tasacion] = await Promise.all([sliceFor('clase_gratuita'), sliceFor('embudo')])
  return { clase, tasacion }
}

/** Trae Meta + CRM por origen de forma resiliente (si una fuente falla, 0 + warning). */
export async function gatherFunnelData(from: string, to: string): Promise<{ data: FunnelData; warnings: string[] }> {
  const warnings: string[] = []
  let meta = { clase: { spendArs: 0, reach: 0, landingPageViews: 0 }, tasacion: { spendArs: 0, reach: 0, landingPageViews: 0 } }
  try { meta = await fetchMetaByOrigin(from, to) }
  catch (e) { warnings.push('Meta Ads: ' + (e instanceof Error ? e.message : 'error')) }
  let crm = {
    clase: { leads: 0, appointmentsScheduled: 0, appraisalsDelivered: 0, propertiesCaptured: 0 },
    tasacion: { leads: 0, appointmentsScheduled: 0, appraisalsDelivered: 0, propertiesCaptured: 0 },
  }
  try { crm = await fetchCrmByOrigin(from, to) }
  catch (e) { warnings.push('Embudo CRM: ' + (e instanceof Error ? e.message : 'error')) }
  return {
    data: {
      clase: { ...meta.clase, ...crm.clase },
      tasacion: { ...meta.tasacion, ...crm.tasacion },
    },
    warnings,
  }
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

/**
 * Una tabla de embudo para UN origen, encadenada: cada % se calcula sobre la fila
 * de arriba (Visitas/Alcance · Leads/Visitas · Agendadas/Leads · Hechas/Agendadas
 * · Captaciones/Hechas). El costo de cada fila = inversión DE ESTA TABLA / cantidad.
 */
function buildOriginTable(title: string, leadLabel: string, s: OriginSlice, rate: number): string {
  const spendUsd = rate > 0 ? s.spendArs / rate : 0
  const cost = (n: number) => n > 0
    ? { ars: _ars(s.spendArs / n), usd: _usd(spendUsd / n) }
    : { ars: '—', usd: '—' }
  const steps: Array<{ label: string; count: number; convNum: number | null; convDen: number | null }> = [
    { label: 'Alcance', count: s.reach, convNum: null, convDen: null },
    { label: 'Visitas a la landing', count: s.landingPageViews, convNum: s.landingPageViews, convDen: s.reach },
    { label: leadLabel, count: s.leads, convNum: s.leads, convDen: s.landingPageViews },
    { label: 'Tasaciones Agendadas', count: s.appointmentsScheduled, convNum: s.appointmentsScheduled, convDen: s.leads },
    { label: 'Tasaciones Hechas', count: s.appraisalsDelivered, convNum: s.appraisalsDelivered, convDen: s.appointmentsScheduled },
    { label: 'Captaciones', count: s.propertiesCaptured, convNum: s.propertiesCaptured, convDen: s.appraisalsDelivered },
  ]
  const head = headHtml(['Etapa', 'Cantidad', 'Conversión', 'Costo ARS', 'Costo USD'])
  const invRow = rowHtml(['Inversión Embudo', '—', '—', _ars(s.spendArs), _usd(spendUsd)], { bold: true, highlight: true })
  const stepRows = steps.map(st => {
    const c = cost(st.count)
    const conv = st.convDen === null ? '—' : _pct(st.convNum as number, st.convDen)
    return rowHtml([st.label, _int(st.count), conv, c.ars, c.usd])
  }).join('')
  return `<h2 style="color:#111827;font-size:17px;margin:24px 0 10px;">${title}</h2>
    <table style="border-collapse:collapse;width:100%;max-width:680px;">
      <thead>${head}</thead><tbody>${invRow}${stepRows}</tbody>
    </table>`
}

/** Devuelve { subject, html } con DOS tablas de embudo, una por origen. */
export function renderFunnelEmail(type: FunnelReportType, from: string, to: string, data: FunnelData, rate: number, warnings: string[] = []): { subject: string; html: string } {
  const warnBanner = warnings.length === 0 ? '' : `
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;margin-bottom:20px;">
      <p style="color:#991b1b;font-weight:600;font-size:13px;margin:0 0 4px;">Algunas fuentes de datos fallaron (los valores pueden estar incompletos):</p>
      <ul style="margin:0;padding-left:18px;">${warnings.map(w => `<li style="color:#dc2626;font-size:12px;">${w}</li>`).join('')}</ul>
    </div>`

  const tablaClase = buildOriginTable('Embudo — Clase Gratuita', 'Leads Clase Gratuita', data.clase, rate)
  const tablaTasacion = buildOriginTable('Embudo — Tasación Directa', 'Leads de Tasación', data.tasacion, rate)

  const period = periodLabel(type, from, to)
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:Arial,Helvetica,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:32px 16px;">
  <div style="background:#111827;border-radius:12px 12px 0 0;padding:24px 32px;">
    <img src="https://inmodf.com.ar/pdf-assets/logos/Logo%20Diego%20Ferreyra.png" alt="Diego Ferreyra Inmobiliaria" style="height:44px;margin-bottom:12px;" />
    <p style="color:#9ca3af;font-size:14px;margin:4px 0 0;">${TYPE_TITLE[type]} de Marketing</p>
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

  const subject = `Embudo ${TYPE_SHORT[type]} — Tasación ${data.tasacion.leads}L/${data.tasacion.propertiesCaptured}C · Clase ${data.clase.leads}L/${data.clase.propertiesCaptured}C · ${period}`
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
  opts: { from?: string; to?: string; recipientsOverride?: string[]; dryRun?: boolean } = {}
): Promise<{ success: boolean; error?: string; skipped?: boolean; subject?: string; recipients?: string[]; from?: string; to?: string; dryRun?: boolean; sample?: unknown }> {
  // dryRun: arma el reporte (Meta + CRM por origen) y devuelve el subject + un
  // sample de las dos tablas, SIN enviar ni loguear. Sirve para verificar qué
  // versión está desplegada sin mandar emails.
  if (opts.dryRun) {
    const { from, to } = opts.from && opts.to ? { from: opts.from, to: opts.to } : computeRange(type)
    const { data, warnings } = await gatherFunnelData(from, to)
    const { rate } = await getUsdToArs()
    const { subject } = renderFunnelEmail(type, from, to, data, rate, warnings)
    return { success: true, dryRun: true, subject, from, to, recipients: [], sample: { clase: data.clase, tasacion: data.tasacion } }
  }

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
