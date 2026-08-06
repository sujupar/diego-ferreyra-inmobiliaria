import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchDailyInsightsRange, saveDailySnapshot } from '@/lib/marketing/meta-ads'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET|POST /api/cron/meta-sync?days=7
 *
 * Trae la inversión diaria de Meta de los últimos N días y la guarda.
 * Se sincronizan 7 días por defecto y no solo el de ayer porque Meta AJUSTA
 * las cifras hasta 72 horas después: pedir una ventana y hacer upsert corrige
 * los días ya guardados en vez de dejarlos con el primer valor, incompleto.
 *
 * Lo dispara pg_cron con net.http_post — el scheduler de Netlify no invoca las
 * scheduled functions de este sitio (ver CLAUDE.md).
 */
async function isAuthorized(provided: string | null): Promise<boolean> {
  if (!provided) return false
  if (process.env.CRON_SECRET && provided === process.env.CRON_SECRET) return true
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data } = await sb.from('cron_config').select('value').eq('key', 'meta_sync').maybeSingle()
    const dbSecret = (data as { value?: string } | null)?.value
    return !!dbSecret && provided === dbSecret
  } catch {
    return false
  }
}

function diaISO(offsetDias: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - offsetDias)
  return d.toISOString().slice(0, 10)
}

async function handle(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)

  // ?ping=1 → confirma que este deploy está vivo, sin auth ni efectos.
  if (searchParams.get('ping') === '1') {
    return NextResponse.json({ ok: true, route: 'meta-sync', auth: 'db+env' })
  }

  if (!(await isAuthorized(req.headers.get('x-cron-secret')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const days = Math.min(Math.max(parseInt(searchParams.get('days') ?? '7', 10) || 7, 1), 90)
  const desde = diaISO(days)
  const hasta = diaISO(0)

  try {
    const filas = await fetchDailyInsightsRange(desde, hasta)
    await saveDailySnapshot(filas)
    return NextResponse.json({ ok: true, desde, hasta, filas: filas.length })
  } catch (err) {
    console.error('[meta-sync] falló la sincronización:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
