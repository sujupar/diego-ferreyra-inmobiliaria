import type { Config } from '@netlify/functions'
import { createClient } from '@supabase/supabase-js'
import nodemailer from 'nodemailer'

/**
 * Weekly Marketing Report - runs Monday 8:00 AM Argentina (UTC-3)
 * Aggregates data from the past 7 days.
 */

const META_API_BASE = 'https://graph.facebook.com/v21.0'
const GHL_API_BASE = 'https://services.leadconnectorhq.com'

export default async function handler() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: settings } = await supabase
    .from('report_settings')
    .select('recipients, weekly_enabled')
    .eq('id', 'default')
    .single()

  if (!settings?.weekly_enabled || !settings.recipients?.length) {
    console.log('Weekly report disabled or no recipients')
    return
  }

  const today = new Date()
  const dateTo = new Date(today); dateTo.setDate(today.getDate() - 1)
  const dateFrom = new Date(dateTo); dateFrom.setDate(dateTo.getDate() - 6)
  const dateToStr = dateTo.toISOString().split('T')[0]
  const dateFromStr = dateFrom.toISOString().split('T')[0]

  // Fetch Meta Ads for the week
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
    }
  } catch (err) {
    console.error('Meta API error:', err)
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
      const pipelines = allPipelines.filter((p: { name: string }) => p.name === 'Embudo Propietarios LP')
      for (const pipeline of pipelines) {
        const oRes = await fetch(`${GHL_API_BASE}/opportunities/search?location_id=${process.env.GHL_LOCATION_ID}&pipeline_id=${pipeline.id}&limit=100`, { headers: ghlHeaders })
        const oData = oRes.ok ? await oRes.json() : { opportunities: [] }

        const stageCounts = new Map<string, { name: string; count: number; newCount: number; value: number }>()
        for (const stage of pipeline.stages) stageCounts.set(stage.id, { name: stage.name, count: 0, newCount: 0, value: 0 })
        for (const opp of oData.opportunities) {
          const sc = stageCounts.get(opp.pipelineStageId)
          if (sc) {
            sc.count++
            sc.value += opp.monetaryValue || 0
            const createdAt = new Date(opp.createdAt)
            if (createdAt >= startOfRange && createdAt <= endOfRange) sc.newCount++
          }
        }

        pipelineStages.push(...Array.from(stageCounts.values()).map(sc => ({
          stage_name: sc.name, contact_count: sc.count, new_contacts: sc.newCount, opportunity_value: sc.value,
        })))
      }
    }
  } catch (err) {
    console.error('GHL error:', err)
  }

  // Fetch GHL call stats
  let callStats = { total: 0, answered: 0, missed: 0, totalDuration: 0, avgDuration: 0 }
  try {
    const ghlHeaders = { 'Authorization': `Bearer ${process.env.GHL_API_KEY}`, 'Version': '2021-07-28', 'Content-Type': 'application/json' }
    const startAfter = new Date(dateFromStr + 'T00:00:00Z').toISOString()
    const callsRes = await fetch(`${GHL_API_BASE}/conversations/search?locationId=${process.env.GHL_LOCATION_ID}&type=TYPE_CALL&startAfterDate=${encodeURIComponent(startAfter)}&limit=100`, { headers: ghlHeaders })
    if (callsRes.ok) {
      const callsData = await callsRes.json()
      const startDate = new Date(dateFromStr + 'T00:00:00Z'), endDate = new Date(dateToStr + 'T23:59:59Z')
      for (const conv of (callsData.conversations || [])) {
        const convDate = new Date(conv.dateAdded || conv.createdAt)
        if (convDate < startDate || convDate > endDate) continue
        callStats.total++
        const status = conv.callStatus || conv.status || ''
        if (status === 'completed' || status === 'answered') { callStats.answered++; callStats.totalDuration += conv.callDuration || conv.duration || 0 }
        else if (status === 'missed' || status === 'no-answer' || status === 'busy') { callStats.missed++ }
        else if (conv.callDuration || conv.duration) { callStats.answered++; callStats.totalDuration += conv.callDuration || conv.duration || 0 }
        else { callStats.missed++ }
      }
      if (callStats.answered > 0) callStats.avgDuration = Math.round(callStats.totalDuration / callStats.answered)
    }
  } catch (err) { console.error('GHL calls error:', err) }

  // Build email
  const totalLeads = metaSnapshots.reduce((s, c) => s + c.leads, 0)
  const totalSpend = metaSnapshots.reduce((s, c) => s + c.spend, 0)
  const totalClicks = metaSnapshots.reduce((s, c) => s + c.clicks, 0)
  const totalImpressions = metaSnapshots.reduce((s, c) => s + c.impressions, 0)
  const avgCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0
  const avgCpl = totalLeads > 0 ? totalSpend / totalLeads : null

  const fmt = (v: number) => `$${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const fmtD = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const campaignRows = metaSnapshots.map(c => `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">${c.campaign_name}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${c.impressions.toLocaleString('es-AR')}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${c.clicks.toLocaleString('es-AR')}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${c.leads}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${fmt(c.spend)}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${c.cost_per_lead !== null ? fmt(c.cost_per_lead) : '—'}</td>
  </tr>`).join('')

  const pipelineHtml = pipelineStages.length > 0 ? `<table style="width:100%;border-collapse:collapse;"><thead><tr style="background:#f3f4f6;">
    <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">ETAPA</th>
    <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">NUEVOS</th>
    <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">TOTAL</th>
    <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">VALOR</th>
  </tr></thead><tbody>${pipelineStages.map(s => `<tr>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;">${s.stage_name}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;font-weight:600;color:#7c3aed;">${s.new_contacts}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;color:#6b7280;">${s.contact_count}</td>
    <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;font-size:14px;text-align:right;">${fmt(s.opportunity_value)}</td>
  </tr>`).join('')}</tbody></table>` : '<p style="color:#9ca3af;">No hay datos de pipeline.</p>'

  const callsHtml = callStats.total > 0 ? `
    <h2 style="color:#1f2937;font-size:18px;margin:24px 0 12px;">Llamadas</h2>
    <div style="display:flex;gap:12px;margin-bottom:24px;flex-wrap:wrap;">
      <div style="flex:1;min-width:120px;background:#eff6ff;border-radius:8px;padding:16px;text-align:center;">
        <p style="color:#6b7280;font-size:12px;margin:0;text-transform:uppercase;">Total</p>
        <p style="color:#1d4ed8;font-size:28px;font-weight:700;margin:4px 0 0;">${callStats.total}</p>
      </div>
      <div style="flex:1;min-width:120px;background:#f0fdf4;border-radius:8px;padding:16px;text-align:center;">
        <p style="color:#6b7280;font-size:12px;margin:0;text-transform:uppercase;">Contestadas</p>
        <p style="color:#15803d;font-size:28px;font-weight:700;margin:4px 0 0;">${callStats.answered}</p>
      </div>
      <div style="flex:1;min-width:120px;background:#fef2f2;border-radius:8px;padding:16px;text-align:center;">
        <p style="color:#6b7280;font-size:12px;margin:0;text-transform:uppercase;">Perdidas</p>
        <p style="color:#dc2626;font-size:28px;font-weight:700;margin:4px 0 0;">${callStats.missed}</p>
      </div>
      <div style="flex:1;min-width:120px;background:#faf5ff;border-radius:8px;padding:16px;text-align:center;">
        <p style="color:#6b7280;font-size:12px;margin:0;text-transform:uppercase;">Duracion Prom.</p>
        <p style="color:#7e22ce;font-size:28px;font-weight:700;margin:4px 0 0;">${callStats.avgDuration > 0 ? `${Math.floor(callStats.avgDuration / 60)}m ${callStats.avgDuration % 60}s` : '—'}</p>
      </div>
    </div>` : ''

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:680px;margin:0 auto;padding:32px 16px;">
  <div style="background:#111827;border-radius:12px 12px 0 0;padding:24px 32px;">
    <h1 style="color:#fff;font-size:20px;margin:0;">Diego Ferreyra Inmobiliaria</h1>
    <p style="color:#9ca3af;font-size:14px;margin:4px 0 0;">Reporte Semanal de Marketing</p>
  </div>
  <div style="background:#fff;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:32px;">
    <p style="color:#6b7280;font-size:14px;margin:0 0 24px;">Periodo: <strong>${fmtD(dateFromStr)} — ${fmtD(dateToStr)}</strong></p>
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
    <h2 style="color:#1f2937;font-size:18px;margin:0 0 12px;">Meta Ads</h2>
    ${metaSnapshots.length > 0 ? `<table style="width:100%;border-collapse:collapse;margin-bottom:32px;"><thead><tr style="background:#f3f4f6;">
      <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;">CAMPANA</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">IMPRESIONES</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">CLICKS</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">LEADS</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">GASTO</th>
      <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;">CPL</th>
    </tr></thead><tbody>${campaignRows}</tbody></table>` : '<p style="color:#9ca3af;">No hay datos de campanas.</p>'}
    <h2 style="color:#1f2937;font-size:18px;margin:0 0 12px;">Pipeline CRM</h2>
    ${pipelineHtml}
    ${callsHtml}
  </div>
  <div style="text-align:center;padding:16px;"><p style="color:#9ca3af;font-size:12px;">Reporte generado automaticamente</p></div>
</div></body></html>`

  const subject = `Semanal Marketing — ${totalLeads} leads | CPL ${avgCpl !== null ? fmt(avgCpl) : 'N/A'} | ${fmtD(dateFromStr)} - ${fmtD(dateToStr)}`

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
      report_type: 'weekly',
      recipients: settings.recipients,
      subject,
      status: 'sent',
      data_snapshot: { total_leads: totalLeads, total_spend: totalSpend, avg_ctr: avgCtr, avg_cpl: avgCpl },
    })
    console.log('Weekly report sent')
  } catch (err) {
    console.error('Send error:', err)
    await supabase.from('email_report_log').insert({
      report_type: 'weekly',
      recipients: settings.recipients,
      subject,
      status: 'failed',
      error_message: err instanceof Error ? err.message : 'Unknown error',
    })
  }
}

export const config: Config = {
  schedule: '0 11 * * 1', // Monday 11:00 UTC = 8:00 AM Argentina
}
