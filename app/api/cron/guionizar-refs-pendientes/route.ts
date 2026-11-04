import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPendingRefs, markUsada, markRefError, expireStaleRefs } from '@/lib/video-refs/repo'
import { sanitizeError, GEMINI_TIMEOUT_MS } from '@/lib/news/guionizar'
import { guionizarReferencia } from '@/lib/video-refs/guionizar'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Techo real de Netlify ~26s (maxDuration no aplica, ver CLAUDE.md "REGLA DURA"). Fórmula
// del repo: PRESUPUESTO_MS = 26_000 - peor_trabajo_ms - 1_000. El peor trabajo de ESTE loop
// es UNA llamada a Gemini (GEMINI_TIMEOUT_MS=18_000), así que el presupuesto da 7_000: en la
// práctica corta ANTES de arrancar una segunda referencia (una referencia por corrida, correcto y
// seguro — el resto lo toma la corrida siguiente, cada minuto).
const PRESUPUESTO_MS = 26_000 - GEMINI_TIMEOUT_MS - 1_000
const MAX_EDAD_HORAS = 6

/**
 * POST /api/cron/guionizar-refs-pendientes
 * Guioniza (Gemini, voz de Diego) las referencias video_refs en estado_uso 'guionizando'.
 * Idempotente: solo toca 'guionizando'. Una referencia fallida no frena las demás.
 *
 * Auth: header `x-cron-secret` == env CRON_SECRET o cron_config(key='guionizar_refs_pendientes').
 */
async function isAuthorized(provided: string | null): Promise<boolean> {
  if (!provided) return false
  // Un marcador sin reemplazar ('__SECRETO__', público en el repo) nunca autoriza, aunque
  // alguien pegue la migración en el SQL Editor sin reemplazar el placeholder.
  if (provided === '__SECRETO__') return false
  if (process.env.CRON_SECRET && provided === process.env.CRON_SECRET) return true
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data } = await sb.from('cron_config').select('value').eq('key', 'guionizar_refs_pendientes').maybeSingle()
    const dbSecret = (data as { value?: string } | null)?.value
    return !!dbSecret && dbSecret !== '__SECRETO__' && provided === dbSecret
  } catch {
    return false
  }
}

/** GET solo responde `?ping=1` (verificación de deploy).
 * Nunca ejecuta trabajo: un GET sin ese query param es 'forbidden', igual que un POST sin
 * secreto — así no hace falta un mecanismo de autenticación nuevo para el ping. */
export async function GET(req: NextRequest): Promise<Response> {
  if (new URL(req.url).searchParams.get('ping') === '1') {
    return NextResponse.json({ ok: true, route: 'guionizar-refs-pendientes' })
  }
  return NextResponse.json({ error: 'forbidden' }, { status: 403 })
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!(await isAuthorized(req.headers.get('x-cron-secret')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // Referencias que llevan demasiado 'guionizando' (corridas muertas) -> error, no reintentar infinito.
  try {
    await expireStaleRefs(MAX_EDAD_HORAS, 'guionizado no completado a tiempo')
  } catch {
    // no bloquea el procesamiento
  }

  const inicio = Date.now()
  const pendientes = await getPendingRefs() // created_at asc
  let procesadas = 0
  let ok = 0
  let error = 0
  for (const p of pendientes) {
    if (Date.now() - inicio >= PRESUPUESTO_MS) break // el resto se toma en la próxima corrida
    procesadas++
    try {
      const guion = await guionizarReferencia(p)
      await markUsada(p.id, guion)
      ok++
    } catch (e) {
      error++
      try {
        await markRefError(p.id, sanitizeError(e))
      } catch {
        // si ni siquiera se puede marcar el error, seguimos con la siguiente
      }
    }
  }
  return NextResponse.json({ procesadas, ok, error, pendientes: pendientes.length - procesadas })
}
