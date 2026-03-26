import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

/**
 * Monthly Marketing Report - runs 1st of each month at 8:00 AM Argentina (UTC-3)
 * Aggregates data from the previous calendar month.
 */

const META_API_BASE = 'https://graph.facebook.com/v21.0'
const GHL_API_BASE = 'https://services.leadconnectorhq.com'

export default async function handler() {
  console.log(`[Monthly Report] Triggered at: ${new Date().toISOString()}`)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: settings } = await supabase
    .from('report_settings')
    .select('recipients, monthly_enabled')
    .eq('id', 'default')
    .single()

  if (!settings?.monthly_enabled || !settings.recipients?.length) {
    console.log('Monthly report disabled or no recipients')
    return
  }

  // Deduplication: skip if already sent this month
  const { data: existingReport } = await supabase
    .from('email_report_log')
    .select('id')
    .eq('report_type', 'monthly')
    .gte('sent_at', new Date().toISOString().split('T')[0] + 'T00:00:00Z')
    .eq('status', 'sent')
    .limit(1)

  if (existingReport && existingReport.length > 0) {
    console.log('[Monthly Report] Already sent today, skipping duplicate')
    return
  }

  // Previous calendar month
  const today = new Date()
  const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
  const lastOfPrevMonth = new Date(firstOfThisMonth.getTime() - 86400000)
  const firstOfPrevMonth = new Date(lastOfPrevMonth.getFullYear(), lastOfPrevMonth.getMonth(), 1)

  const dateFromStr = firstOfPrevMonth.toISOString().split('T')[0]
  const dateToStr = lastOfPrevMonth.toISOString().split('T')[0]

  // Previous month for comparison
  const prevMonthLast = new Date(firstOfPrevMonth.getTime() - 86400000)
  const prevMonthFirst = new Date(prevMonthLast.getFullYear(), prevMonthLast.getMonth(), 1)
  const prevFromStr = prevMonthFirst.toISOString().split('T')[0]
  const prevToStr = prevMonthLast.toISOString().split('T')[0]

  // Data source status tracker
  const dataSourceStatus: Record<string, { ok: boolean; error?: string; count?: number }> = {
    meta_ads: { ok: false },
    ghl_pipeline: { ok: false },
    ghl_calls: { ok: false },
  }

  // Fetch Meta Ads for the month
  let metaSnapshots: Array<{
    campaign_id: string; campaign_name: string; impressions: number;
    clicks: number; spend: number; leads: number; cost_per_lead: number | null;
  }> = []

  try {
    const adAccountId = process.env.META_AD_ACCOUNT_ID?.startsWith('act_')
      ? process.env.META_AD_ACCOUNT_ID
      : `act_${process.env.META_AD_ACCOUNT_ID}`

    const fields = 'campaign_id,campaign_name,impressions,clicks,ctr,spend,actions'
    const timeRange = JSON.stringify({ since: dateFromStr, until: dateToStr })
    const url = `${META_API_BASE}/${adAccountId}/insights?fields=${fields}&time_range=${encodeURIComponent(timeRange)}&level=campaign&access_token=${process.env.META_ACCESS_TOKEN}`

    const res = await fetch(url)
    if (res.ok) {
      const data = await res.json()
      metaSnapshots = (data.data || []).map((insight: Record<string, unknown>) => {
        const actions = insight.actions as Array<{ action_type: string; value: string }> | undefined
        const LEAD_TYPES = ['lead', 'complete_registration', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead', 'offsite_conversion.fb_pixel_complete_registration']
        let leadCount = 0
        if (actions) {
          for (const lt of LEAD_TYPES) {
            const match = actions.find(a => a.action_type === lt)
            if (match) { leadCount = parseInt(match.value, 10); if (leadCount > 0) break }
          }
        }
        const spend = parseFloat(insight.spend as string)
        return {
          campaign_id: insight.campaign_id as string,
          campaign_name: insight.campaign_name as string,
          impressions: parseInt(insight.impressions as string, 10),
          clicks: parseInt(insight.clicks as string, 10),
          spend,
          leads: leadCount,
          cost_per_lead: leadCount > 0 ? spend / leadCount : null,
        }
      })
      dataSourceStatus.meta_ads = { ok: true, count: metaSnapshots.length }
    } else {
      const errorBody = await res.text()
      console.error(`[Monthly Report] Meta API HTTP ${res.status}:`, errorBody)
      dataSourceStatus.meta_ads = { ok: false, error: `HTTP ${res.status}: ${errorBody.substring(0, 200)}` }
    }
  } catch (err) {
    console.error('[Monthly Report] Meta API error:', err)
    dataSourceStatus.meta_ads = { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }

  // Fetch GHL pipeline (filtered by creation date)
  let pipelineStages: Array<{ stage_name: string; contact_count: number; new_contacts: number; opportunity_value: number }> = []

  try {
    const ghlHeaders = {
      'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
    }
    const startOfRange = new Date(dateFromStr + 'T00:00:00Z')
    const endOfRange = new Date(dateToStr + 'T23:59:59Z')

    const pRes = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${process.env.GHL_LOCATION_ID}`, { headers: ghlHeaders })
    if (pRes.ok) {
      const { pipelines: allPipelines } = await pRes.json()
      const pipelines = allPipelines.filter((p: { name: string }) => p.name === '🟢 GESTIÓN COMERCIAL - PROPIETARIOS')

      if (pipelines.length === 0) {
        console.warn('[Monthly Report] Pipeline "🟢 GESTIÓN COMERCIAL - PROPIETARIOS" not found')
        dataSourceStatus.ghl_pipeline = { ok: false, error: 'Pipeline "🟢 GESTIÓN COMERCIAL - PROPIETARIOS" no encontrado' }
      }

      for (const pipeline of pipelines) {
        // Paginated fetch of all opportunities
        let allOpportunities: Array<Record<string, unknown>> = []
        let page = 1
        let hasMore = true
        while (hasMore && page <= 50) {
          const oRes = await fetch(
            `${GHL_API_BASE}/opportunities/search?location_id=${process.env.GHL_LOCATION_ID}&pipeline_id=${pipeline.id}&limit=100&page=${page}`,
            { headers: ghlHeaders }
          )
          if (!oRes.ok) {
            const errText = await oRes.text()
            throw new Error(`GHL opportunities HTTP ${oRes.status}: ${errText.substring(0, 200)}`)
          }
          const oData = await oRes.json()
          allOpportunities.push(...(oData.opportunities || []))
          hasMore = oData.meta?.nextPage != null
          page++
        }
        console.log(`[Monthly Report] GHL pipeline "${pipeline.name}": ${allOpportunities.length} opportunities fetched (${page - 1} pages)`)

        const stageCounts = new Map<string, { name: string; count: number; newCount: number; value: number }>()
        for (const stage of pipeline.stages) stageCounts.set(stage.id, { name: stage.name, count: 0, newCount: 0, value: 0 })
        for (const opp of allOpportunities) {
          const sc = stageCounts.get(opp.pipelineStageId as string)
          if (sc) {
            sc.count++
            sc.value += (opp.monetaryValue as number) || 0
            const createdAt = new Date(opp.createdAt as string)
            if (createdAt >= startOfRange && createdAt <= endOfRange) sc.newCount++
          }
        }

        pipelineStages.push(...Array.from(stageCounts.values()).map(sc => ({
          stage_name: sc.name, contact_count: sc.count, new_contacts: sc.newCount, opportunity_value: sc.value,
        })))
        dataSourceStatus.ghl_pipeline = { ok: true, count: allOpportunities.length }
      }
    } else {
      const errorBody = await pRes.text()
      console.error(`[Monthly Report] GHL Pipelines HTTP ${pRes.status}:`, errorBody)
      dataSourceStatus.ghl_pipeline = { ok: false, error: `HTTP ${pRes.status}: ${errorBody.substring(0, 200)}` }
    }
  } catch (err) {
    console.error('[Monthly Report] GHL pipeline error:', err)
    dataSourceStatus.ghl_pipeline = { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }

  // Fetch previous period pipeline for comparison
  let prevPipelineStages: Array<{ stage_name: string; contact_count: number; new_contacts: number; opportunity_value: number }> = []

  try {
    const ghlHeaders = {
      'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
    }
    const prevStartOfRange = new Date(prevFromStr + 'T00:00:00Z')
    const prevEndOfRange = new Date(prevToStr + 'T23:59:59Z')

    const pRes = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${process.env.GHL_LOCATION_ID}`, { headers: ghlHeaders })
    if (pRes.ok) {
      const { pipelines: allPipelines } = await pRes.json()
      const pipelines = allPipelines.filter((p: { name: string }) => p.name === '🟢 GESTIÓN COMERCIAL - PROPIETARIOS')

      for (const pipeline of pipelines) {
        let allOpportunities: Array<Record<string, unknown>> = []
        let page = 1
        let hasMore = true
        while (hasMore && page <= 50) {
          const oRes = await fetch(
            `${GHL_API_BASE}/opportunities/search?location_id=${process.env.GHL_LOCATION_ID}&pipeline_id=${pipeline.id}&limit=100&page=${page}`,
            { headers: ghlHeaders }
          )
          if (!oRes.ok) break
          const oData = await oRes.json()
          allOpportunities.push(...(oData.opportunities || []))
          hasMore = oData.meta?.nextPage != null
          page++
        }
        console.log(`[Monthly Report] GHL prev period pipeline: ${allOpportunities.length} opportunities fetched`)

        const stageCounts = new Map<string, { name: string; count: number; newCount: number; value: number }>()
        for (const stage of pipeline.stages) stageCounts.set(stage.id, { name: stage.name, count: 0, newCount: 0, value: 0 })
        for (const opp of allOpportunities) {
          const sc = stageCounts.get(opp.pipelineStageId as string)
          if (sc) {
            sc.count++
            sc.value += (opp.monetaryValue as number) || 0
            const createdAt = new Date(opp.createdAt as string)
            if (createdAt >= prevStartOfRange && createdAt <= prevEndOfRange) sc.newCount++
          }
        }

        prevPipelineStages.push(...Array.from(stageCounts.values()).map(sc => ({
          stage_name: sc.name, contact_count: sc.count, new_contacts: sc.newCount, opportunity_value: sc.value,
        })))
      }
    }
  } catch (err) {
    console.error('[Monthly Report] GHL prev period pipeline error:', err)
  }

  // Fetch GHL call stats
  // GHL conversations: type=TYPE_PHONE, calls identified by lastMessageType=TYPE_CALL, dates are epoch millis
  let callStats = { total: 0, answered: 0, missed: 0, totalDuration: 0, avgDuration: 0 }
  try {
    const ghlHeaders = { 'Authorization': `Bearer ${process.env.GHL_API_KEY}`, 'Version': '2021-07-28', 'Content-Type': 'application/json' }
    const startEpoch = new Date(dateFromStr + 'T00:00:00Z').getTime()
    const endEpoch = new Date(dateToStr + 'T23:59:59Z').getTime()

    let callCount = 0
    let hasMore = true
    let startAfterCursor: number | null = null
    let startAfterIdCursor: string | null = null
    let pagesScanned = 0

    while (hasMore && pagesScanned < 40) {
      let callsUrl = `${GHL_API_BASE}/conversations/search?locationId=${process.env.GHL_LOCATION_ID}&limit=100`
      if (startAfterCursor !== null && startAfterIdCursor !== null) {
        callsUrl += `&startAfter=${startAfterCursor}&startAfterId=${startAfterIdCursor}`
      }
      const callsRes = await fetch(callsUrl, { headers: ghlHeaders })
      if (!callsRes.ok) {
        const errBody = await callsRes.text()
        throw new Error(`GHL conversations HTTP ${callsRes.status}: ${errBody.substring(0, 200)}`)
      }
      const callsData = await callsRes.json()
      const conversations: Array<Record<string, unknown>> = callsData.conversations || []
      if (conversations.length === 0) break

      for (const conv of conversations) {
        if (conv.lastMessageType !== 'TYPE_CALL') continue
        const msgDate = (conv.lastMessageDate as number) || 0
        if (msgDate >= startEpoch && msgDate <= endEpoch) callCount++
      }

      const oldestInBatch = conversations[conversations.length - 1]
      const oldestDate = (oldestInBatch.lastMessageDate as number) || (oldestInBatch.dateAdded as number) || 0
      if (oldestDate < startEpoch) break

      const lastConv = conversations[conversations.length - 1]
      const sortArr = lastConv.sort as number[] | undefined
      if (sortArr && sortArr.length > 0) {
        startAfterCursor = sortArr[0]
        startAfterIdCursor = lastConv.id as string
      } else break

      hasMore = conversations.length >= 100
      pagesScanned++
    }

    callStats.total = callCount
    callStats.answered = callCount
    dataSourceStatus.ghl_calls = { ok: true, count: callStats.total }
    console.log(`[Monthly Report] GHL calls: ${callStats.total} call conversations found (${pagesScanned + 1} pages scanned)`)
  } catch (err) {
    console.error('[Monthly Report] GHL calls error:', err)
    dataSourceStatus.ghl_calls = { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }

  // Build health banner
  const failedSources = Object.entries(dataSourceStatus).filter(([, s]) => !s.ok)
  let healthBanner = ''
  if (failedSources.length > 0) {
    const labels: Record<string, string> = { meta_ads: 'Meta Ads', ghl_pipeline: 'Pipeline CRM', ghl_calls: 'Llamadas GHL' }
    const failedList = failedSources.map(([name, s]) =>
      `<li style="color:#dc2626;font-size:13px;margin-bottom:4px;">${labels[name] || name}: ${s.error || 'Sin datos'}</li>`
    ).join('')
    healthBanner = `<div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="color:#991b1b;font-weight:600;font-size:14px;margin:0 0 8px;">Advertencia: Algunas fuentes de datos fallaron</p>
      <ul style="margin:0;padding-left:20px;">${failedList}</ul>
    </div>`
  }

  // Build email
  const totalLeads = metaSnapshots.reduce((s, c) => s + c.leads, 0)
  const totalSpend = metaSnapshots.reduce((s, c) => s + c.spend, 0)
  const totalClicks = metaSnapshots.reduce((s, c) => s + c.clicks, 0)
  const totalImpressions = metaSnapshots.reduce((s, c) => s + c.impressions, 0)
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : null

  const fmt = (v: number) => `$${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtD = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const monthName = firstOfPrevMonth.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
  const totalNewContacts = pipelineStages.reduce((s, st) => s + st.new_contacts, 0)

  const campaignRows = metaSnapshots.map(c => `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">${c.campaign_name}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${c.impressions.toLocaleString('es-AR')}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${c.clicks.toLocaleString('es-AR')}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${c.leads}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${fmt(c.spend)}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${c.cost_per_lead !== null ? fmt(c.cost_per_lead) : '—'}</td>
  </tr>`).join('')

  const changeBadge = (current: number, prev: number, isCurrency = false) => {
    const diff = current - prev
    if (diff === 0 || prev === 0) return ''
    const color = diff > 0 ? '#15803d' : '#dc2626'
    const arrow = diff > 0 ? '&#9650;' : '&#9660;'
    const val = isCurrency ? fmt(Math.abs(diff)) : Math.abs(diff).toString()
    return ` <span style="color:${color};font-size:11px;font-weight:600;">${arrow}${val}</span>`
  }

  const pipelineHtml = pipelineStages.length > 0 ? `<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f3f4f6;">
    <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">ETAPA</th>
    <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">CONTACTOS</th>
    <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">NUEVOS</th>
    <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">VALOR</th>
  </tr></thead><tbody>${pipelineStages.map(s => {
    const prev = prevPipelineStages.find(p => p.stage_name === s.stage_name)
    const prevCount = prev?.contact_count ?? 0
    const prevValue = prev?.opportunity_value ?? 0
    return `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">${s.stage_name}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${s.contact_count}${changeBadge(s.contact_count, prevCount)}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;font-weight:600;color:#7c3aed;">${s.new_contacts}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${fmt(s.opportunity_value)}${changeBadge(s.opportunity_value, prevValue, true)}</td>
  </tr>`
  }).join('')}</tbody></table>
  <p style="color:#9ca3af;font-size:11px;margin:4px 0 0;">Comparado con el mes anterior</p>` : (
    dataSourceStatus.ghl_pipeline.ok
      ? '<p style="color:#9ca3af;">Sin datos de pipeline para este periodo.</p>'
      : '<p style="color:#9ca3af;">No hay datos de pipeline.</p>'
  )

  // Always show calls section
  let callsHtml = ''
  if (dataSourceStatus.ghl_calls.ok && callStats.total > 0) {
    callsHtml = `
    <h2 style="color:#1f2937;font-size:18px;margin:24px 0 12px;">Llamadas</h2>
    <div style="background:#eff6ff;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px;">
      <p style="color:#6b7280;font-size:12px;margin:0;text-transform:uppercase;">Total Llamadas</p>
      <p style="color:#1d4ed8;font-size:28px;font-weight:700;margin:4px 0 0;">${callStats.total}</p>
    </div>`
  } else if (!dataSourceStatus.ghl_calls.ok) {
    callsHtml = `
    <h2 style="color:#1f2937;font-size:18px;margin:24px 0 12px;">Llamadas</h2>
    <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin-bottom:24px;">
      <p style="color:#dc2626;font-size:14px;margin:0;">Error al obtener datos de llamadas: ${dataSourceStatus.ghl_calls.error || 'Error desconocido'}</p>
    </div>`
  } else {
    callsHtml = `
    <h2 style="color:#1f2937;font-size:18px;margin:24px 0 12px;">Llamadas</h2>
    <p style="color:#9ca3af;font-size:14px;">Sin llamadas registradas en este periodo.</p>`
  }

  const subjectPrefix = failedSources.length > 0 ? '[DATOS INCOMPLETOS] ' : ''
  const totalPipelineContacts = pipelineStages.reduce((s, st) => s + st.contact_count, 0)

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:32px 16px;">
  <div style="background:#111827;border-radius:12px 12px 0 0;padding:24px 32px;">
    <img src="https://meek-belekoy-dcf620.netlify.app/pdf-assets/logos/Logo%20Diego%20Ferreyra.png" alt="Diego Ferreyra Inmobiliaria" style="height:44px;margin-bottom:12px;" />
    <p style="color:#9ca3af;font-size:14px;margin:4px 0 0;">Reporte Mensual de Marketing — ${monthName}</p>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:32px;">
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Periodo: <strong>${fmtD(dateFromStr)} — ${fmtD(dateToStr)}</strong></p>
    ${healthBanner}
    <div style="display:flex;gap:12px;margin-bottom:32px;flex-wrap:wrap;">
      <div style="flex:1;min-width:140px;background:#eff6ff;border-radius:8px;padding:16px;">
        <p style="color:#6b7280;font-size:12px;margin:0;text-transform:uppercase;">Leads del Mes</p>
        <p style="color:#1d4ed8;font-size:28px;font-weight:700;margin:4px 0 0;">${totalLeads}</p>
      </div>
      <div style="flex:1;min-width:140px;background:#f0fdf4;border-radius:8px;padding:16px;">
        <p style="color:#6b7280;font-size:12px;margin:0;text-transform:uppercase;">Costo/Lead</p>
        <p style="color:#15803d;font-size:28px;font-weight:700;margin:4px 0 0;">${avgCpl !== null ? fmt(avgCpl) : '—'}</p>
      </div>
      <div style="flex:1;min-width:140px;background:#fefce8;border-radius:8px;padding:16px;">
        <p style="color:#6b7280;font-size:12px;margin:0;text-transform:uppercase;">Gasto Total</p>
        <p style="color:#a16207;font-size:28px;font-weight:700;margin:4px 0 0;">${fmt(totalSpend)}</p>
      </div>
      <div style="flex:1;min-width:140px;background:#faf5ff;border-radius:8px;padding:16px;">
        <p style="color:#6b7280;font-size:12px;margin:0;text-transform:uppercase;">Nuevos Pipeline</p>
        <p style="color:#7e22ce;font-size:28px;font-weight:700;margin:4px 0 0;">${totalNewContacts}</p>
      </div>
    </div>
    <h2 style="color:#1f2937;font-size:18px;margin:0 0 12px;">Meta Ads — Resumen del Mes</h2>
    ${metaSnapshots.length > 0 ? `<table style="width:100%;border-collapse:collapse;margin-bottom:32px;"><thead><tr style="background:#f3f4f6;">
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">CAMPANA</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">IMPRESIONES</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">CLICKS</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">LEADS</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">GASTO</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">CPL</th>
    </tr></thead><tbody>${campaignRows}</tbody></table>` : (
      dataSourceStatus.meta_ads.ok
        ? '<p style="color:#9ca3af;margin-bottom:32px;">Sin campanas activas en este periodo.</p>'
        : '<p style="color:#9ca3af;margin-bottom:32px;">No hay datos de campanas.</p>'
    )}
    <h2 style="color:#1f2937;font-size:18px;margin:0 0 12px;">Pipeline CRM</h2>
    ${pipelineHtml}
    ${callsHtml}
  </div>
  <div style="text-align:center;padding:16px;"><p style="color:#9ca3af;font-size:12px;">Reporte generado automaticamente</p></div>
</div></body></html>`

  const subject = `${subjectPrefix}Mensual Marketing (${monthName}) — ${totalLeads} leads | Gasto ${fmt(totalSpend)} | CPL ${avgCpl !== null ? fmt(avgCpl) : 'N/A'}`

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    })
    await transporter.sendMail({
      from: `Diego Ferreyra Inmobiliaria <${process.env.GMAIL_USER}>`,
      to: settings.recipients.join(', '),
      subject,
      html,
    })

    await supabase.from('email_report_log').insert({
      report_type: 'monthly',
      recipients: settings.recipients,
      subject,
      status: 'sent',
      data_snapshot: {
        month: monthName,
        total_leads: totalLeads,
        total_spend: totalSpend,
        avg_ctr: avgCtr,
        avg_cpl: avgCpl,
        data_sources: dataSourceStatus,
        pipeline_stages_count: pipelineStages.length,
        call_stats: callStats,
      },
    })
    console.log('[Monthly Report] Sent successfully')
  } catch (err) {
    console.error('[Monthly Report] Send error:', err)
    await supabase.from('email_report_log').insert({
      report_type: 'monthly',
      recipients: settings.recipients,
      subject,
      status: 'failed',
      error_message: err instanceof Error ? err.message : 'Unknown error',
      data_snapshot: { data_sources: dataSourceStatus },
    })
  }
}

export const config: Config = {
  schedule: '0 11 1 * *', // 1st of month, 11:00 UTC = 8:00 AM Argentina
}
