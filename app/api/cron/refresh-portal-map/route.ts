import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refreshZonaPropMap } from '@/lib/portals/refresh-zonaprop-map'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * Cron: refresca el mapa de ZonaProp (CÓD↔dirección↔asesor) leyendo el directorio
 * público de la inmobiliaria. Cubre los avisos publicados A MANO en ZonaProp (cuyas
 * consultas llegan solo con el CÓD, sin dirección). Auth: x-cron-secret == CRON_SECRET.
 * Programado por pg_cron (ver migración) — las scheduled functions de Netlify no
 * disparan en este sitio.
 */
async function run(req: Request) {
  const secret = req.headers.get('x-cron-secret')
  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const stats = await refreshZonaPropMap(supabase, { commit: true })
  return NextResponse.json({ ok: !stats.error, ...stats })
}

export async function POST(req: Request) { return run(req) }
export async function GET(req: Request) { return run(req) }
