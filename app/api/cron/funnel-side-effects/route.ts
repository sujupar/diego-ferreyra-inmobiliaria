import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { runFunnelSideEffectsWorker } from '@/lib/funnel/side-effects-worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST/GET /api/cron/funnel-side-effects
 *
 * Ejecuta los avisos diferidos de los envíos del embudo (tarea de coordinación,
 * email al equipo, Mailchimp, stitching de la sesión anónima y el evento de
 * conversión a Meta). La dispara pg_cron cada minuto — el scheduler de Netlify
 * NO invoca las scheduled functions de este sitio (ver CLAUDE.md).
 *
 * Auth DUAL, en este orden:
 *   1) la env var CRON_SECRET, si existe; o
 *   2) la fila public.cron_config(key='funnel_side_effects').
 * En este proyecto conviven DOS secretos de cron (uno en Netlify y otro en
 * `cron_config`), así que validar contra uno solo deja el job dando 403 en
 * silencio. Mismo patrón que `app/api/cron/send-report`.
 */
async function autorizado(provisto: string | null): Promise<boolean> {
  if (!provisto) return false
  if (process.env.CRON_SECRET && provisto === process.env.CRON_SECRET) return true
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data } = await sb.from('cron_config').select('value').eq('key', 'funnel_side_effects').maybeSingle()
    const secretoDb = (data as { value?: string } | null)?.value
    return !!secretoDb && provisto === secretoDb
  } catch {
    return false
  }
}

async function handle(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)

  // ?ping=1 → confirma que ESTE deploy está vivo, sin auth ni efectos. Se usa
  // para verificar el deploy ANTES de programar el job en pg_cron.
  if (searchParams.get('ping') === '1') {
    return NextResponse.json({ ok: true, route: 'funnel-side-effects', auth: 'db+env' })
  }

  if (!(await autorizado(req.headers.get('x-cron-secret')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  try {
    const resumen = await runFunnelSideEffectsWorker()
    return NextResponse.json({ ...resumen, firedAt: new Date().toISOString() })
  } catch (err) {
    console.error('[funnel-side-effects] la corrida falló entera:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<Response> { return handle(req) }
export async function GET(req: NextRequest): Promise<Response> { return handle(req) }
