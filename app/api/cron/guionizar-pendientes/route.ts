import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPendingScripts, markListo, markError } from '@/lib/news/scripts-repo'
import { guionizarPieza } from '@/lib/news/guionizar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/cron/guionizar-pendientes
 * Guioniza (Gemini, voz de Diego) las piezas news_scripts en estado 'guionizando'.
 * Idempotente: solo toca 'guionizando'. Una pieza fallida no frena las demás.
 *
 * Auth: header `x-cron-secret` == env CRON_SECRET o cron_config(key='guionizar_pendientes').
 */
async function isAuthorized(provided: string | null): Promise<boolean> {
  if (!provided) return false
  if (process.env.CRON_SECRET && provided === process.env.CRON_SECRET) return true
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data } = await sb.from('cron_config').select('value').eq('key', 'guionizar_pendientes').maybeSingle()
    const dbSecret = (data as { value?: string } | null)?.value
    return !!dbSecret && provided === dbSecret
  } catch {
    return false
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!(await isAuthorized(req.headers.get('x-cron-secret')))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  const pendientes = await getPendingScripts()
  let ok = 0
  let error = 0
  for (const p of pendientes) {
    try {
      const guion = await guionizarPieza(p)
      await markListo(p.id, guion)
      ok++
    } catch (e) {
      error++
      try {
        await markError(p.id, e instanceof Error ? e.message : String(e))
      } catch {
        // si ni siquiera se puede marcar el error, seguimos con la siguiente
      }
    }
  }
  return NextResponse.json({ procesadas: pendientes.length, ok, error })
}
