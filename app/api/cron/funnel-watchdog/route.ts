import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * POST/GET /api/cron/funnel-watchdog — el VIGILANTE de la cola del embudo.
 *
 * Corre cada 10 minutos por pg_cron, SEPARADO del worker, y contesta una sola
 * pregunta: ¿hay trabajos pendientes que el worker ya debería haber tomado y no
 * tomó? El worker pasa cada minuto, así que un pendiente con más de 10 minutos
 * de atraso significa worker muerto (deploy que rompió la ruta, secreto que no
 * matchea, excepción sistemática) o cola desbordada. En ambos casos, un lead
 * pago está esperando un WhatsApp que no sale.
 *
 * Por qué existe: la cola no tenía NINGUNA alarma out-of-band. El resumen de
 * cada corrida se descarta (pg_net no lee respuestas) y la única alerta previa
 * corre DENTRO del worker — con el worker muerto, nunca suena. El 2026-08-13 un
 * deploy rompió el encolado entero y pasaron 6 horas hasta que un humano lo
 * notó. A 1000 registros/día, esas 6 horas son ~250 leads sin primer contacto.
 *
 * Límite conocido y aceptado: si pg_cron entero muere, este job muere con él
 * (mismo scheduler). Cubre los modos de fallo realistas — que son los que ya
 * pasaron: ruta rota por deploy, secreto rotado, error sistemático del worker,
 * tercero caído acumulando cola.
 *
 * La alerta se deduplica a UNA cada 6 h (`funnel_watchdog_state.last_alert_at`):
 * un incidente de una tarde son 1-2 emails, no 36.
 */

/** El worker corre cada minuto; 10 min de atraso ya no es un hipo. */
const ATRASO_MINUTOS = 10
/** Como mucho una alerta cada 6 h. */
const DEDUP_ALERTA_HORAS = 6

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Mismo esquema dual que las demás rutas de cron (env O cron_config). */
async function autorizado(provisto: string | null): Promise<boolean> {
  if (!provisto) return false
  if (process.env.CRON_SECRET && provisto === process.env.CRON_SECRET) return true
  try {
    const { data } = await admin()
      .from('cron_config')
      .select('value')
      .eq('key', 'funnel_side_effects')
      .maybeSingle()
    const secretoDb = (data as { value?: string } | null)?.value
    return !!secretoDb && provisto === secretoDb
  } catch {
    return false
  }
}

async function handle(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('ping') === '1') {
    return NextResponse.json({ ok: true, route: 'funnel-watchdog', auth: 'db+env' })
  }
  if (!(await autorizado(req.headers.get('x-cron-secret')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  try {
    const sb = admin()
    const limite = new Date(Date.now() - ATRASO_MINUTOS * 60_000).toISOString()

    // Pendientes que el worker ya debería haber tomado. Los reintentos
    // programados a futuro (next_attempt_at adelante) NO cuentan: esos están
    // esperando a propósito.
    const { count: atrasados, error: e1 } = await sb
      .from('funnel_lead_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lte('next_attempt_at', limite)
    if (e1) throw new Error(e1.message)

    const { data: masViejo } = await sb
      .from('funnel_lead_jobs')
      .select('next_attempt_at, kind')
      .eq('status', 'pending')
      .lte('next_attempt_at', limite)
      .order('next_attempt_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    const { count: fallados24h } = await sb
      .from('funnel_lead_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('updated_at', new Date(Date.now() - 24 * 3600_000).toISOString())

    const backlog = atrasados ?? 0
    const ahora = new Date().toISOString()

    let alerto = false
    if (backlog > 0) {
      const { data: estado } = await sb.from('funnel_watchdog_state').select('last_alert_at').eq('id', true).maybeSingle()
      const ultimaAlerta = (estado as { last_alert_at?: string | null } | null)?.last_alert_at
      const dedupVencido =
        !ultimaAlerta || Date.now() - new Date(ultimaAlerta).getTime() > DEDUP_ALERTA_HORAS * 3600_000

      if (dedupVencido) {
        const { data: perfiles } = await sb
          .from('profiles')
          .select('email')
          .in('role', ['admin', 'dueno'])
          .eq('is_active', true)
          .not('email', 'is', null)
        const destinatarios = (perfiles ?? []).map((p) => (p as { email: string }).email)

        if (destinatarios.length > 0) {
          const atrasoMin = masViejo?.next_attempt_at
            ? Math.round((Date.now() - new Date(masViejo.next_attempt_at as string).getTime()) / 60_000)
            : ATRASO_MINUTOS
          const { sendEmail } = await import('@/lib/email/resend-client')
          const r = await sendEmail({
            notificationType: 'funnel_watchdog_backlog',
            to: destinatarios,
            subject: `⚠️ La cola del embudo está atrasada: ${backlog} aviso(s) sin procesar`,
            html: [
              '<p>El vigilante de la cola del embudo detectó avisos pendientes que el worker ya debería haber procesado.</p>',
              `<p><b>${backlog}</b> trabajo(s) pendientes con atraso (el más viejo lleva ~<b>${atrasoMin} min</b>, tipo <code>${masViejo?.kind ?? '?'}</code>).<br/>`,
              `Fallidos definitivos en las últimas 24 h: <b>${fallados24h ?? 0}</b>.</p>`,
              '<p>Qué significa: el WhatsApp de bienvenida, el email al equipo y la conversión a Meta de los registros nuevos NO están saliendo. Causas típicas: un deploy rompió la ruta del cron, el secreto no matchea, o un tercero caído acumuló la cola.</p>',
              '<p>Diagnóstico: <code>SELECT kind, status, attempts, last_error, next_attempt_at FROM funnel_lead_jobs WHERE status = \'pending\' ORDER BY next_attempt_at LIMIT 20;</code></p>',
              `<p style="color:#888">Esta alerta se manda como mucho una vez cada ${DEDUP_ALERTA_HORAS} horas.</p>`,
            ].join('\n'),
            idempotent: false,
          })
          alerto = r.ok
          if (r.ok) {
            await sb.from('funnel_watchdog_state').update({ last_alert_at: ahora }).eq('id', true)
          }
        }
      }
    }

    await sb.from('funnel_watchdog_state').update({ last_check_at: ahora, last_backlog: backlog }).eq('id', true)

    return NextResponse.json({ ok: true, backlog, fallados24h: fallados24h ?? 0, alerto, firedAt: ahora })
  } catch (err) {
    console.error('[funnel-watchdog] la corrida falló:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<Response> { return handle(req) }
export async function GET(req: NextRequest): Promise<Response> { return handle(req) }
