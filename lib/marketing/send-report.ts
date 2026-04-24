import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { ReportData, ReportSettings } from './types'
import { buildReportHtml, buildReportSubject } from './email-templates'

function getSupabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

let resend: Resend | null = null
function getResend(): Resend | null {
  if (resend) return resend
  if (!process.env.RESEND_API_KEY) return null
  resend = new Resend(process.env.RESEND_API_KEY)
  return resend
}

const FROM = process.env.EMAIL_FROM_REPORTS
  ?? 'Diego Ferreyra Inmobiliaria <reportes@inmodf.com.ar>'
const REPLY_TO = process.env.EMAIL_REPLY_TO
  ?? 'contacto.julianparra@gmail.com'

/**
 * Get report settings (recipients, enabled flags) from Supabase
 */
export async function getReportSettings(): Promise<ReportSettings> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('report_settings')
    .select('*')
    .eq('id', 'default')
    .single()

  if (error || !data) {
    return {
      id: 'default',
      recipients: [],
      daily_enabled: true,
      weekly_enabled: true,
      monthly_enabled: true,
      updated_at: new Date().toISOString(),
    }
  }

  return data as ReportSettings
}

/**
 * Update report settings
 */
export async function updateReportSettings(
  settings: Partial<Pick<ReportSettings, 'recipients' | 'daily_enabled' | 'weekly_enabled' | 'monthly_enabled'>>
): Promise<ReportSettings> {
  const supabase = getSupabaseAdmin()

  const { data, error } = await supabase
    .from('report_settings')
    .upsert({
      id: 'default',
      ...settings,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to update report settings: ${error.message}`)
  }

  return data as ReportSettings
}

/**
 * Send a marketing report email via Resend. Logs result to email_report_log.
 */
export async function sendReport(reportData: ReportData): Promise<{ success: boolean; error?: string }> {
  const client = getResend()
  if (!client) {
    const msg = 'RESEND_API_KEY not set; cannot send report'
    console.error(`[send-report] ${msg}`)
    return { success: false, error: msg }
  }

  // Get recipients from settings
  const settings = await getReportSettings()

  // Check if this report type is enabled
  const enabledKey = `${reportData.type}_enabled` as keyof ReportSettings
  if (!settings[enabledKey]) {
    return { success: false, error: `${reportData.type} reports are disabled` }
  }

  if (settings.recipients.length === 0) {
    return { success: false, error: 'No recipients configured' }
  }

  const html = buildReportHtml(reportData)
  const subject = buildReportSubject(reportData)

  try {
    const { data, error } = await client.emails.send({
      from: FROM,
      to: settings.recipients,
      replyTo: REPLY_TO,
      subject,
      html,
    })
    if (error) throw new Error(error.message)

    await logReport(reportData, settings.recipients, subject, 'sent')
    return { success: true }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Unknown error'
    await logReport(reportData, settings.recipients, subject, 'failed', errorMsg)
    return { success: false, error: errorMsg }
  }
}

/**
 * Log sent report to email_report_log
 */
async function logReport(
  data: ReportData,
  recipients: string[],
  subject: string,
  status: 'sent' | 'failed',
  errorMessage?: string
) {
  try {
    const supabase = getSupabaseAdmin()

    await supabase.from('email_report_log').insert({
      report_type: data.type,
      recipients,
      subject,
      status,
      error_message: errorMessage || null,
      data_snapshot: {
        meta_summary: {
          total_leads: data.meta.total_leads,
          total_spend: data.meta.total_spend,
          average_ctr: data.meta.average_ctr,
          average_cost_per_lead: data.meta.average_cost_per_lead,
        },
        pipeline_totals: data.pipelines.map(p => ({
          name: p.pipeline_name,
          contacts: p.total_contacts,
          value: p.total_value,
        })),
        date_from: data.date_from,
        date_to: data.date_to,
      } as unknown as Database['public']['Tables']['email_report_log']['Insert']['data_snapshot'],
    })
  } catch (err) {
    console.error('Failed to log report:', err)
  }
}
