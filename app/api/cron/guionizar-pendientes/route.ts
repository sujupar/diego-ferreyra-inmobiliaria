import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPendingScripts, markListo, markError, expireStaleScripts } from '@/lib/news/scripts-repo'
import { guionizarPieza, sanitizeError } from '@/lib/news/guionizar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Techo real de Netlify ~26s (maxDuration no aplica): cortamos el loop antes para que
// markListo/markError corran y ninguna pieza quede colgada en 'guionizando'.
const PRESUPUESTO_MS = 22_000
const MAX_EDAD_HORAS = 6

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
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Piezas que llevan demasiado 'guionizando' (corridas muertas) -> error, no reintentar infinito.
  try {
    await expireStaleScripts(MAX_EDAD_HORAS, 'guionizado no completado a tiempo')
  } catch {
    // no bloquea el procesamiento
  }

  const inicio = Date.now()
  const pendientes = await getPendingScripts() // created_at asc
  let procesadas = 0
  let ok = 0
  let error = 0
  for (const p of pendientes) {
    if (Date.now() - inicio >= PRESUPUESTO_MS) break // el resto se toma en la próxima corrida
    procesadas++
    try {
      const guion = await guionizarPieza(p)
      await markListo(p.id, guion)
      ok++
    } catch (e) {
      error++
      try {
        await markError(p.id, sanitizeError(e))
      } catch {
        // si ni siquiera se puede marcar el error, seguimos con la siguiente
      }
    }
  }
  return NextResponse.json({ procesadas, ok, error, pendientes: pendientes.length - procesadas })
}
