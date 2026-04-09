import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

/**
 * Daily Marketing Report - runs at 8:00 AM Argentina (UTC-3)
 *
 * This function runs independently of the Next.js app, so it cannot use
 * path aliases (@/lib/...). All logic is self-contained here.
 */

const META_API_BASE = 'https://graph.facebook.com/v21.0'
const GHL_API_BASE = 'https://services.leadconnectorhq.com'

interface ReportSettings {
  recipients: string[]
  daily_enabled: boolean
}

export default async function handler() {
  console.log(`[Daily Report] Triggered at: ${new Date().toISOString()}`)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // Check if daily reports are enabled and have recipients
  const { data: settings } = await supabase
    .from('report_settings')
    .select('recipients, daily_enabled')
    .eq('id', 'default')
    .single()

  const reportSettings = settings as ReportSettings | null
  if (!reportSettings?.daily_enabled || !reportSettings.recipients?.length) {
    console.log('Daily report disabled or no recipients configured')
    return
  }

  // Deduplication: skip if already sent today
  const { data: existingReport } = await supabase
    .from('email_report_log')
    .select('id')
    .eq('report_type', 'daily')
    .gte('sent_at', new Date().toISOString().split('T')[0] + 'T00:00:00Z')
    .eq('status', 'sent')
    .limit(1)

  if (existingReport && existingReport.length > 0) {
    console.log('[Daily Report] Already sent today, skipping duplicate')
    return
  }

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const dateStr = yesterday.toISOString().split('T')[0]

  const dayBefore = new Date(yesterday)
  dayBefore.setDate(dayBefore.getDate() - 1)
  const prevDateStr = dayBefore.toISOString().split('T')[0]

  // Data source status tracker
  const dataSourceStatus: Record<string, { ok: boolean; error?: string; count?: number }> = {
    meta_ads: { ok: false },
    ghl_pipeline: { ok: false },
    ghl_calls: { ok: false },
    ghl_commercial: { ok: false },
  }

  // Commercial actions tracking
  const commercialActions = { tasaciones_solicitadas: 0, tasaciones_coordinadas: 0, tasaciones_realizadas: 0, captaciones: 0 }

  // 1. Fetch Meta Ads data
  let metaSnapshots: Array<{
    campaign_id: string; campaign_name: string; impressions: number;
    clicks: number; ctr: number; spend: number; leads: number; cost_per_lead: number | null;
  }> = []

  try {
    const adAccountId = process.env.META_AD_ACCOUNT_ID?.startsWith('act_')
      ? process.env.META_AD_ACCOUNT_ID
      : `act_${process.env.META_AD_ACCOUNT_ID}`

    const fields = 'campaign_id,campaign_name,impressions,clicks,ctr,spend,actions,cost_per_action_type'
    const timeRange = JSON.stringify({ since: dateStr, until: dateStr })
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
          ctr: parseFloat(insight.ctr as string),
          spend,
          leads: leadCount,
          cost_per_lead: leadCount > 0 ? spend / leadCount : null,
        }
      })

      // Save to Supabase
      if (metaSnapshots.length > 0) {
        await supabase.from('meta_ads_daily').upsert(
          metaSnapshots.map(s => ({ date: dateStr, ...s })),
          { onConflict: 'date,campaign_id' }
        )
      }
      dataSourceStatus.meta_ads = { ok: true, count: metaSnapshots.length }
    } else {
      const errorBody = await res.text()
      console.error(`[Daily Report] Meta API HTTP ${res.status}:`, errorBody)
      dataSourceStatus.meta_ads = { ok: false, error: `HTTP ${res.status}: ${errorBody.substring(0, 200)}` }
    }
  } catch (err) {
    console.error('[Daily Report] Meta API error:', err)
    dataSourceStatus.meta_ads = { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }

  // 2. Fetch GHL pipeline data (filtered by creation date)
  let pipelineStages: Array<{
    pipeline_name: string; stage_name: string; contact_count: number; new_contacts: number; opportunity_value: number;
  }> = []

  try {
    const locationId = process.env.GHL_LOCATION_ID
    const ghlHeaders = {
      'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
    }

    const startOfDay = new Date(dateStr + 'T00:00:00Z')
    const endOfDay = new Date(dateStr + 'T23:59:59Z')

    const pipelinesRes = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${locationId}`, { headers: ghlHeaders })
    if (pipelinesRes.ok) {
      const { pipelines: allPipelines } = await pipelinesRes.json()
      const pipelines = allPipelines.filter((p: { name: string }) => p.name === '🟢 GESTIÓN COMERCIAL - PROPIETARIOS')

      if (pipelines.length === 0) {
        console.warn('[Daily Report] Pipeline "🟢 GESTIÓN COMERCIAL - PROPIETARIOS" not found')
        dataSourceStatus.ghl_pipeline = { ok: false, error: 'Pipeline "🟢 GESTIÓN COMERCIAL - PROPIETARIOS" no encontrado' }
      }

      for (const pipeline of pipelines) {
        // Paginated fetch of all opportunities
        let allOpportunities: Array<Record<string, unknown>> = []
        let page = 1
        let hasMore = true
        while (hasMore && page <= 50) {
          const oppsRes = await fetch(
            `${GHL_API_BASE}/opportunities/search?location_id=${locationId}&pipeline_id=${pipeline.id}&limit=100&page=${page}`,
            { headers: ghlHeaders }
          )
          if (!oppsRes.ok) {
            const errText = await oppsRes.text()
            throw new Error(`GHL opportunities HTTP ${oppsRes.status}: ${errText.substring(0, 200)}`)
          }
          const oppsData = await oppsRes.json()
          allOpportunities.push(...(oppsData.opportunities || []))
          hasMore = oppsData.meta?.nextPage != null
          page++
        }
        console.log(`[Daily Report] GHL pipeline "${pipeline.name}": ${allOpportunities.length} opportunities fetched (${page - 1} pages)`)

        const stageCounts = new Map<string, { name: string; count: number; newCount: number; value: number }>()
        for (const stage of pipeline.stages) {
          stageCounts.set(stage.id, { name: stage.name, count: 0, newCount: 0, value: 0 })
        }
        for (const opp of allOpportunities) {
          const sc = stageCounts.get(opp.pipelineStageId as string)
          if (sc) {
            sc.count++
            sc.value += (opp.monetaryValue as number) || 0
            const createdAt = new Date(opp.createdAt as string)
            if (createdAt >= startOfDay && createdAt <= endOfDay) {
              sc.newCount++
            }
          }

          // Commercial actions from custom fields
          const cf = (opp.customFields as Array<{key: string, value: string}>) || []
          for (const field of cf) {
            const dateVal = (field.value || '').substring(0, 10)
            if (dateVal !== dateStr) continue
            if (field.key.includes('fecha_solicitud_tasacin')) commercialActions.tasaciones_solicitadas++
            else if (field.key.includes('fecha_coordinacin_tasacin')) commercialActions.tasaciones_coordinadas++
            else if (field.key.includes('fecha_realizacin_tasacin')) commercialActions.tasaciones_realizadas++
            else if (field.key.includes('fecha_de_captacin_de_propiedad')) commercialActions.captaciones++
          }
        }

        const rows = Array.from(stageCounts.entries()).map(([stageId, sc]) => ({
          date: dateStr,
          pipeline_id: pipeline.id,
          pipeline_name: pipeline.name,
          stage_id: stageId,
          stage_name: sc.name,
          contact_count: sc.count,
          opportunity_value: sc.value,
        }))

        pipelineStages.push(...Array.from(stageCounts.entries()).map(([, sc]) => ({
          pipeline_name: pipeline.name,
          stage_name: sc.name,
          contact_count: sc.count,
          new_contacts: sc.newCount,
          opportunity_value: sc.value,
        })))

        await supabase.from('ghl_pipeline_daily').upsert(rows, { onConflict: 'date,pipeline_id,stage_id' })
        dataSourceStatus.ghl_pipeline = { ok: true, count: allOpportunities.length }

        // Save commercial actions
        await supabase.from('ghl_commercial_actions_daily').upsert(
          { date: dateStr, ...commercialActions },
          { onConflict: 'date' }
        )
        dataSourceStatus.ghl_commercial = { ok: true }
        console.log(`[Daily Report] Commercial actions: ${JSON.stringify(commercialActions)}`)
      }
    } else {
      const errorBody = await pipelinesRes.text()
      console.error(`[Daily Report] GHL Pipelines HTTP ${pipelinesRes.status}:`, errorBody)
      dataSourceStatus.ghl_pipeline = { ok: false, error: `HTTP ${pipelinesRes.status}: ${errorBody.substring(0, 200)}` }
    }
  } catch (err) {
    console.error('[Daily Report] GHL pipeline error:', err)
    dataSourceStatus.ghl_pipeline = { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }

  // 2a-prev. Fetch previous day pipeline for comparison
  let prevPipelineStages: Array<{
    stage_name: string; contact_count: number; new_contacts: number; opportunity_value: number;
  }> = []

  try {
    const ghlHeaders = {
      'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
    }
    const prevStartOfDay = new Date(prevDateStr + 'T00:00:00Z')
    const prevEndOfDay = new Date(prevDateStr + 'T23:59:59Z')

    const pRes = await fetch(`${GHL_API_BASE}/opportunities/pipelines?locationId=${process.env.GHL_LOCATION_ID}`, { headers: ghlHeaders })
    if (pRes.ok) {
      const { pipelines: allPipelines } = await pRes.json()
      const pipelines = allPipelines.filter((p: { name: string }) => p.name === '🟢 GESTIÓN COMERCIAL - PROPIETARIOS')
      for (const pipeline of pipelines) {
        let allOpps: Array<Record<string, unknown>> = []
        let pg = 1; let more = true
        while (more && pg <= 50) {
          const r = await fetch(`${GHL_API_BASE}/opportunities/search?location_id=${process.env.GHL_LOCATION_ID}&pipeline_id=${pipeline.id}&limit=100&page=${pg}`, { headers: ghlHeaders })
          if (!r.ok) break
          const d = await r.json()
          allOpps.push(...(d.opportunities || []))
          more = d.meta?.nextPage != null; pg++
        }
        const sc = new Map<string, { name: string; count: number; newCount: number; value: number }>()
        for (const stage of pipeline.stages) sc.set(stage.id, { name: stage.name, count: 0, newCount: 0, value: 0 })
        for (const opp of allOpps) {
          const s = sc.get(opp.pipelineStageId as string)
          if (s) {
            s.count++; s.value += (opp.monetaryValue as number) || 0
            const ca = new Date(opp.createdAt as string)
            if (ca >= prevStartOfDay && ca <= prevEndOfDay) s.newCount++
          }
        }
        prevPipelineStages.push(...Array.from(sc.values()).map(s => ({
          stage_name: s.name, contact_count: s.count, new_contacts: s.newCount, opportunity_value: s.value,
        })))
      }
    }
  } catch (err) {
    console.error('[Daily Report] Previous pipeline fetch error:', err)
  }

  // 2b. Fetch GHL call stats
  // GHL conversations: type=TYPE_PHONE, calls identified by lastMessageType=TYPE_CALL
  // Dates are epoch milliseconds, not ISO strings
  let callStats = { total: 0, answered: 0, missed: 0, totalDuration: 0, avgDuration: 0 }
  try {
    const ghlHeaders = {
      'Authorization': `Bearer ${process.env.GHL_API_KEY}`,
      'Version': '2021-07-28',
      'Content-Type': 'application/json',
    }
    const startEpoch = new Date(dateStr + 'T00:00:00Z').getTime()
    const endEpoch = new Date(dateStr + 'T23:59:59Z').getTime()

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
        if (msgDate >= startEpoch && msgDate <= endEpoch) {
          callCount++
        }
      }

      // Stop if we've gone past our date range
      const oldestInBatch = conversations[conversations.length - 1]
      const oldestDate = (oldestInBatch.lastMessageDate as number) || (oldestInBatch.dateAdded as number) || 0
      if (oldestDate < startEpoch) break

      // Cursor-based pagination
      const lastConv = conversations[conversations.length - 1]
      const sortArr = lastConv.sort as number[] | undefined
      if (sortArr && sortArr.length > 0) {
        startAfterCursor = sortArr[0]
        startAfterIdCursor = lastConv.id as string
      } else {
        break
      }

      hasMore = conversations.length >= 100
      pagesScanned++
    }

    callStats.total = callCount
    callStats.answered = callCount // GHL API v2021-07-28 doesn't provide call status details
    dataSourceStatus.ghl_calls = { ok: true, count: callStats.total }
    console.log(`[Daily Report] GHL calls: ${callStats.total} call conversations found (${pagesScanned + 1} pages scanned)`)
  } catch (err) {
    console.error('[Daily Report] GHL calls error:', err)
    dataSourceStatus.ghl_calls = { ok: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }

  // 3. Check Meta token expiry
  let tokenWarning = ''
  try {
    const appId = process.env.META_APP_ID
    const appSecret = process.env.META_APP_SECRET
    if (appId && appSecret) {
      const debugRes = await fetch(`${META_API_BASE}/debug_token?input_token=${process.env.META_ACCESS_TOKEN}&access_token=${appId}|${appSecret}`)
      if (debugRes.ok) {
        const debugData = await debugRes.json()
        const expiresAt = debugData.data?.expires_at
        if (expiresAt) {
          const daysLeft = Math.floor((expiresAt - Date.now() / 1000) / 86400)
          if (daysLeft <= 7) {
            const color = daysLeft <= 3 ? '#dc2626' : '#f59e0b'
            tokenWarning = `<div style="background-color: ${color}15; border: 1px solid ${color}; border-radius: 8px; padding: 12px 16px; margin-bottom: 24px;"><strong style="color: ${color};">Atencion:</strong> El token de Meta Ads expira en <strong>${daysLeft} dias</strong>. Renovarlo para evitar interrupciones.</div>`
          }
        }
      }
    }
  } catch { /* ignore */ }

  // 4. Build health banner
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

  // 5. Build email
  const totalLeads = metaSnapshots.reduce((s, c) => s + c.leads, 0)
  const totalSpend = metaSnapshots.reduce((s, c) => s + c.spend, 0)
  const totalClicks = metaSnapshots.reduce((s, c) => s + c.clicks, 0)
  const totalImpressions = metaSnapshots.reduce((s, c) => s + c.impressions, 0)
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : null

  const fmt = (v: number) => `$${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtDate = new Date(dateStr + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const campaignRows = metaSnapshots.map(c => `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">${c.campaign_name}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${c.impressions.toLocaleString('es-AR')}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${c.clicks.toLocaleString('es-AR')}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${(c.impressions > 0 ? (c.clicks/c.impressions)*100 : 0).toFixed(2)}%</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${c.leads}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${fmt(c.spend)}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${c.cost_per_lead !== null ? fmt(c.cost_per_lead) : '—'}</td>
  </tr>`).join('')

  // Build pipeline comparison HTML with delta indicators
  const changeBadge = (current: number, prev: number, isCurrency = false) => {
    const diff = current - prev
    if (diff === 0 || prev === 0) return ''
    const color = diff > 0 ? '#15803d' : '#dc2626'
    const arrow = diff > 0 ? '&#9650;' : '&#9660;'
    const val = isCurrency ? fmt(Math.abs(diff)) : Math.abs(diff).toString()
    return ` <span style="color:${color};font-size:11px;font-weight:600;">${arrow}${val}</span>`
  }

  const pipelineHtml = pipelineStages.length > 0 ? `<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f3f4f6;">
    <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Etapa</th>
    <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;">Contactos</th>
    <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;">Nuevos</th>
    <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;">Valor</th>
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
  }).join('')}</tbody></table>${prevPipelineStages.length > 0 ? `<p style="color:#9ca3af;font-size:11px;margin:8px 0 0;">Comparado con el dia anterior</p>` : ''}` : (
    dataSourceStatus.ghl_pipeline.ok
      ? '<p style="color:#9ca3af;font-size:14px;">Sin datos de pipeline para este periodo.</p>'
      : '<p style="color:#9ca3af;font-size:14px;">No hay datos de pipeline.</p>'
  )

  // Calls section - simplified (GHL API doesn't provide duration/status details)
  let callsHtml = ''
  if (dataSourceStatus.ghl_calls.ok && callStats.total > 0) {
    callsHtml = `
    <h2 style="color:#1f2937;font-size:18px;margin:24px 0 12px;">Llamadas</h2>
    <div style="background:#eff6ff;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px;">
      <p style="color:#6b7280;font-size:12px;margin:0;text-transform:uppercase;">Total de llamadas</p>
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

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:32px 16px;">
  <div style="background:#111827;border-radius:12px 12px 0 0;padding:24px 32px;">
    <img src="https://meek-belekoy-dcf620.netlify.app/pdf-assets/logos/Logo%20Diego%20Ferreyra.png" alt="Diego Ferreyra Inmobiliaria" style="height:44px;margin-bottom:12px;" />
    <p style="color:#9ca3af;font-size:14px;margin:4px 0 0;">Reporte Diario de Marketing</p>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:32px;">
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Fecha: <strong style="color:#374151;">${fmtDate}</strong></p>
    ${tokenWarning}
    ${healthBanner}
    <div style="display:flex;gap:12px;margin-bottom:32px;flex-wrap:wrap;">
      <div style="flex:1;min-width:140px;background:#eff6ff;border-radius:8px;padding:16px;">
        <p style="color:#6b7280;font-size:12px;margin:0;text-transform:uppercase;">Leads</p>
        <p style="color:#1d4ed8;font-size:28px;font-weight:700;margin:4px 0 0;">${totalLeads}</p>
      </div>
      <div style="flex:1;min-width:140px;background:#f0fdf4;border-radius:8px;padding:16px;">
        <p style="color:#6b7280;font-size:12px;margin:0;text-transform:uppercase;">Costo/Lead</p>
        <p style="color:#15803d;font-size:28px;font-weight:700;margin:4px 0 0;">${avgCpl !== null ? fmt(avgCpl) : '—'}</p>
      </div>
      <div style="flex:1;min-width:140px;background:#fefce8;border-radius:8px;padding:16px;">
        <p style="color:#6b7280;font-size:12px;margin:0;text-transform:uppercase;">Gasto</p>
        <p style="color:#a16207;font-size:28px;font-weight:700;margin:4px 0 0;">${fmt(totalSpend)}</p>
      </div>
      <div style="flex:1;min-width:140px;background:#faf5ff;border-radius:8px;padding:16px;">
        <p style="color:#6b7280;font-size:12px;margin:0;text-transform:uppercase;">CTR</p>
        <p style="color:#7e22ce;font-size:28px;font-weight:700;margin:4px 0 0;">${avgCtr.toFixed(2)}%</p>
      </div>
    </div>
    <div style="border-top:2px solid #f3f4f6;margin:0 0 24px;"></div>
    <h2 style="color:#1f2937;font-size:18px;margin:0 0 12px;">&#9733; Acciones Comerciales</h2>
    <div style="display:flex;gap:12px;margin-bottom:32px;flex-wrap:wrap;">
      <div style="flex:1;min-width:140px;background:#eff6ff;border-radius:8px;padding:16px;text-align:center;">
        <p style="color:#6b7280;font-size:11px;margin:0;text-transform:uppercase;">Tasaciones Solicitadas</p>
        <p style="color:#1d4ed8;font-size:28px;font-weight:700;margin:4px 0 0;">${commercialActions.tasaciones_solicitadas}</p>
      </div>
      <div style="flex:1;min-width:140px;background:#fefce8;border-radius:8px;padding:16px;text-align:center;">
        <p style="color:#6b7280;font-size:11px;margin:0;text-transform:uppercase;">Tasaciones Coordinadas</p>
        <p style="color:#d97706;font-size:28px;font-weight:700;margin:4px 0 0;">${commercialActions.tasaciones_coordinadas}</p>
      </div>
      <div style="flex:1;min-width:140px;background:#f0fdf4;border-radius:8px;padding:16px;text-align:center;">
        <p style="color:#6b7280;font-size:11px;margin:0;text-transform:uppercase;">Tasaciones Realizadas</p>
        <p style="color:#15803d;font-size:28px;font-weight:700;margin:4px 0 0;">${commercialActions.tasaciones_realizadas}</p>
      </div>
      <div style="flex:1;min-width:140px;background:#faf5ff;border-radius:8px;padding:16px;text-align:center;">
        <p style="color:#6b7280;font-size:11px;margin:0;text-transform:uppercase;">Captaciones</p>
        <p style="color:#7c3aed;font-size:28px;font-weight:700;margin:4px 0 0;">${commercialActions.captaciones}</p>
      </div>
    </div>
    <div style="border-top:2px solid #f3f4f6;margin:0 0 24px;"></div>
    <h2 style="color:#1f2937;font-size:18px;margin:0 0 12px;">Meta Ads</h2>
    ${metaSnapshots.length > 0 ? `<table style="width:100%;border-collapse:collapse;margin-bottom:32px;"><thead><tr style="background:#f3f4f6;">
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;text-transform:uppercase;">Campana</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;">Impresiones</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;">Clicks</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;">CTR</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;">Leads</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;">Gasto</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;text-transform:uppercase;">CPL</th>
    </tr></thead><tbody>${campaignRows}</tbody></table>` : (
      dataSourceStatus.meta_ads.ok
        ? '<p style="color:#9ca3af;font-size:14px;margin-bottom:32px;">Sin campanas activas en este periodo.</p>'
        : '<p style="color:#9ca3af;font-size:14px;margin-bottom:32px;">No hay datos de campanas.</p>'
    )}
    <h2 style="color:#1f2937;font-size:18px;margin:0 0 12px;">Pipeline CRM</h2>
    ${pipelineHtml}
    ${callsHtml}
  </div>
  <div style="text-align:center;padding:16px;"><p style="color:#9ca3af;font-size:12px;margin:0;">Reporte generado automaticamente</p></div>
</div></body></html>`

  const caSubjectParts = []
  if (commercialActions.tasaciones_coordinadas > 0) caSubjectParts.push(`${commercialActions.tasaciones_coordinadas} tasac. coord.`)
  if (commercialActions.tasaciones_realizadas > 0) caSubjectParts.push(`${commercialActions.tasaciones_realizadas} tasac. realiz.`)
  if (commercialActions.captaciones > 0) caSubjectParts.push(`${commercialActions.captaciones} captac.`)
  const caSubject = caSubjectParts.length > 0 ? ` | ${caSubjectParts.join(' | ')}` : ''
  const subject = `${subjectPrefix}Diario Marketing — ${totalLeads} leads${caSubject} | CPL ${avgCpl !== null ? fmt(avgCpl) : 'N/A'} | ${fmtDate}`

  // 6. Send email via Gmail SMTP
  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD },
    })
    await transporter.sendMail({
      from: `Diego Ferreyra Inmobiliaria <${process.env.GMAIL_USER}>`,
      to: reportSettings.recipients.join(', '),
      subject,
      html,
    })

    await supabase.from('email_report_log').insert({
      report_type: 'daily',
      recipients: reportSettings.recipients,
      subject,
      status: 'sent',
      data_snapshot: {
        total_leads: totalLeads,
        total_spend: totalSpend,
        avg_ctr: avgCtr,
        avg_cpl: avgCpl,
        data_sources: dataSourceStatus,
        pipeline_stages_count: pipelineStages.length,
        call_stats: callStats,
      },
    })
    console.log('[Daily Report] Sent successfully')
  } catch (err) {
    console.error('[Daily Report] Send email error:', err)
    await supabase.from('email_report_log').insert({
      report_type: 'daily',
      recipients: reportSettings.recipients,
      subject,
      status: 'failed',
      error_message: err instanceof Error ? err.message : 'Unknown error',
      data_snapshot: { data_sources: dataSourceStatus },
    })
  }
}

export const config: Config = {
  schedule: '0 9 * * *', // 09:00 UTC = 6:00 AM Argentina (UTC-3)
}
