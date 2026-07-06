import { NextResponse } from 'next/server'
import { sendFunnelReport, type FunnelReportType } from '@/lib/marketing/funnel-report'
import { requireAuth } from '@/lib/auth/require-role'

export const maxDuration = 60

const VALID_TYPES: FunnelReportType[] = ['daily', 'weekly', 'biweekly', 'monthly']

/**
 * POST /api/marketing/reports
 * Body: { type: "daily" | "weekly" | "biweekly" | "monthly", dateFrom?: string, dateTo?: string }
 *
 * Dispara manualmente el reporte de Embudo (la misma tabla que llega en
 * automático por cron). Trae Meta Ads + Embudo CRM, arma la tabla y envía por
 * email a los destinatarios de report_settings. Si dateFrom/dateTo vienen en el
 * body se usan; si no, se calcula el rango por defecto del tipo.
 */
export async function POST(request: Request): Promise<Response> {
  // Sin auth, cualquiera podía disparar envíos de reporte por email en loop (spam/costo).
  await requireAuth()
  try {
    const body = await request.json().catch(() => ({}))
    const type: FunnelReportType = body.type || 'daily'

    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid report type' }, { status: 400 })
    }

    // Rango opcional: si viene solo dateFrom, se usa como día único (daily).
    const from: string | undefined = body.dateFrom
    const to: string | undefined = body.dateTo ?? body.dateFrom

    const result = await sendFunnelReport(type, from && to ? { from, to } : {})

    return NextResponse.json({
      success: result.success,
      skipped: result.skipped ?? false,
      error: result.error,
      report: {
        type,
        date_from: result.from,
        date_to: result.to,
        recipients: result.recipients,
        subject: result.subject,
      },
    })
  } catch (error) {
    console.error('Report send error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal Server Error' },
      { status: 500 }
    )
  }
}
