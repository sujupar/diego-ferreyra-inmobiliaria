import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { correrActualizacionMensual } from '@/lib/mapa/refresco-worker'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST/GET /api/cron/mapa-lugares
 *
 * Actualización mensual del mapa propio de las descripciones: UNA celda por
 * corrida (ver lib/mapa/refresco-worker.ts). La dispara pg_cron cada 5 minutos.
 *
 * Auth DUAL, en este orden: la env var CRON_SECRET, o la fila
 * public.cron_config(key='mapa_lugares'). En este proyecto conviven dos
 * secretos de cron; validar contra uno solo deja el job en 403 en silencio.
 * Mismo patrón que `app/api/cron/funnel-side-effects`.
 */
async function autorizado(provisto: string | null): Promise<boolean> {
  if (!provisto) return false
  if (process.env.CRON_SECRET && provisto === process.env.CRON_SECRET) return true
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data } = await sb.from('cron_config').select('value').eq('key', 'mapa_lugares').maybeSingle()
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
    return NextResponse.json({ ok: true, route: 'mapa-lugares', auth: 'db+env' })
  }
  if (!(await autorizado(req.headers.get('x-cron-secret')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  try {
    const resumen = await correrActualizacionMensual()
    return NextResponse.json({ ...resumen, firedAt: new Date().toISOString() })
  } catch (err) {
    console.error('[mapa-lugares] la corrida falló entera:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<Response> { return handle(req) }
export async function GET(req: NextRequest): Promise<Response> { return handle(req) }
