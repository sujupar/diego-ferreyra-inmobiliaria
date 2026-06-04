import { NextRequest, NextResponse } from 'next/server'
import { sendFunnelReport, type FunnelReportType } from '@/lib/marketing/funnel-report'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // el reporte pega a Meta + Supabase + Resend; necesita aire

/**
 * POST/GET /api/cron/send-report?type=daily|weekly|biweekly|monthly[&from=YYYY-MM-DD&to=YYYY-MM-DD]
 *
 * Disparador SEGURO del reporte de embudo. Pensado para ser llamado por un
 * scheduler externo a Netlify (Supabase pg_cron vía net.http_post) porque el
 * scheduler nativo de Netlify NO está invocando las scheduled functions de este
 * sitio (bug @netlify/plugin-nextjs + Next 16 — ver CLAUDE.md). Reutiliza la
 * MISMA función que la ruta manual: sendFunnelReport() — cero duplicación.
 *
 * Auth: header `x-cron-secret` debe matchear env var CRON_SECRET (misma
 * convención que /api/cron/ghl-poll, /api/cron/portal-inquiries, /api/cron/visit-reminders).
 *
 * `from`/`to` opcionales: permiten forzar un rango y así re-testear el mismo día
 * (sendFunnelReport no deduplica; el reporte se envía siempre).
 */

const VALID: FunnelReportType[] = ['daily', 'weekly', 'biweekly', 'monthly']

async function handle(req: NextRequest): Promise<Response> {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const type = (searchParams.get('type') ?? 'daily') as FunnelReportType
  if (!VALID.includes(type)) {
    return NextResponse.json({ error: 'invalid type' }, { status: 400 })
  }

  const from = searchParams.get('from') ?? undefined
  const to = searchParams.get('to') ?? from ?? undefined

  const result = await sendFunnelReport(type, from && to ? { from, to } : {})

  return NextResponse.json(
    {
      ok: result.success,
      skipped: result.skipped ?? false,
      error: result.error,
      type,
      from: result.from,
      to: result.to,
      subject: result.subject,
      recipients: result.recipients,
      firedAt: new Date().toISOString(),
    },
    { status: result.success || result.skipped ? 200 : 500 }
  )
}

export async function POST(req: NextRequest): Promise<Response> { return handle(req) }
export async function GET(req: NextRequest): Promise<Response> { return handle(req) }
