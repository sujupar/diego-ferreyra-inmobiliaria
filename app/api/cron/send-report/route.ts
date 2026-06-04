import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
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
 * Auth: header `x-cron-secret` debe matchear, EN ESTE ORDEN:
 *   1) env var CRON_SECRET (si existe), o
 *   2) el valor de la fila public.cron_config(key='send_report').value
 * Se usa (2) porque CRON_SECRET no está seteada en Netlify y no hay acceso al
 * panel de Netlify — así el secreto vive en Supabase (bajo control del usuario,
 * que ya corre SQL ahí) y la ruta lo lee con el service role.
 *
 * `from`/`to` opcionales: permiten forzar un rango y así re-testear el mismo día
 * (sendFunnelReport no deduplica; el reporte se envía siempre).
 */

const VALID: FunnelReportType[] = ['daily', 'weekly', 'biweekly', 'monthly']

/** Secreto esperado: env var CRON_SECRET o, si no existe, public.cron_config. */
async function isAuthorized(provided: string | null): Promise<boolean> {
  if (!provided) return false
  if (process.env.CRON_SECRET && provided === process.env.CRON_SECRET) return true
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data } = await sb.from('cron_config').select('value').eq('key', 'send_report').maybeSingle()
    const dbSecret = (data as { value?: string } | null)?.value
    return !!dbSecret && provided === dbSecret
  } catch {
    return false
  }
}

async function handle(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)

  // ?ping=1 → confirma que ESTE deploy está vivo, sin auth ni efectos (para verificar el deploy).
  if (searchParams.get('ping') === '1') {
    return NextResponse.json({ ok: true, route: 'send-report', auth: 'db+env' })
  }

  if (!(await isAuthorized(req.headers.get('x-cron-secret')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const type = (searchParams.get('type') ?? 'daily') as FunnelReportType
  if (!VALID.includes(type)) {
    return NextResponse.json({ error: 'invalid type' }, { status: 400 })
  }

  const from = searchParams.get('from') ?? undefined
  const to = searchParams.get('to') ?? from ?? undefined
  // ?email=a@b.com,c@d.com → manda SOLO a esas direcciones (para pruebas), sin tocar report_settings.
  const emailParam = searchParams.get('email')
  const recipientsOverride = emailParam ? emailParam.split(',').map(e => e.trim()).filter(Boolean) : undefined

  const result = await sendFunnelReport(type, {
    ...(from && to ? { from, to } : {}),
    ...(recipientsOverride ? { recipientsOverride } : {}),
  })

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
