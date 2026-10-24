import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { correrCiclo } from '@/lib/informes/ciclo-servicio'
import { dependenciasReales } from '@/lib/informes/ciclo-real'
import { esUuid } from '@/lib/informes/acceso'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function compararEnTiempoConstante(a: string, b: string): boolean {
  return timingSafeEqual(createHash('sha256').update(a).digest(), createHash('sha256').update(b).digest())
}

/**
 * POST/GET /api/cron/informes-quincenales — el ciclo automático del informe quincenal. Lo dispara pg_cron
 * cada 2 minutos el 1, 2, 16 y 17 (migración 20261024000002, se aplica DESPUÉS del deploy). Cada corrida hace
 * un tramo (lib/informes/ciclo-servicio.ts) y devuelve qué hizo: el cuerpo se ve en `net._http_response`.
 *
 * Auth DUAL: env CRON_SECRET o cron_config('informes_quincenales'). Mismo patrón que visit-reminders.
 * `?propiedad=<id>` (repetible) corre el ciclo SOLO para esas propiedades, cualquier día: es para probarlo con una
 * ficha [TEST] sin generar tareas de las propiedades reales. Requiere el mismo secreto.
 */
async function autorizado(provisto: string | null): Promise<boolean> {
  if (!provisto) return false
  if (process.env.CRON_SECRET && compararEnTiempoConstante(provisto, process.env.CRON_SECRET)) return true
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !clave) return false
  try {
    const { data, error } = await createClient(url, clave).from('cron_config').select('value').eq('key', 'informes_quincenales').maybeSingle()
    if (error) {
      console.error('[cron/informes-quincenales] no se pudo leer cron_config', error.message)
      return false
    }
    const secretoDb = (data as { value?: string } | null)?.value
    return !!secretoDb && !secretoDb.startsWith('__') && compararEnTiempoConstante(provisto, secretoDb)
  } catch {
    return false
  }
}

async function handle(req: NextRequest): Promise<Response> {
  const url = new URL(req.url)
  if (url.searchParams.get('ping') === '1') {
    return NextResponse.json({ ok: true, route: 'informes-quincenales', auth: 'db+env' })
  }
  if (!(await autorizado(req.headers.get('x-cron-secret')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const propiedades = url.searchParams.getAll('propiedad')
  if (propiedades.some(p => !esUuid(p))) return NextResponse.json({ error: 'propiedad inválida' }, { status: 400 })
  const ahora = new Date()
  try {
    const r = await correrCiclo(dependenciasReales(ahora), ahora, { propiedades })
    if (r.errores.length) console.error('[cron/informes-quincenales] errores en la corrida', r.errores)
    if (r.email && !r.email.ok) console.error('[cron/informes-quincenales] el email a la coordinación no salió', r.email.detalle)
    return NextResponse.json({ ok: true, ...r, firedAt: ahora.toISOString() })
  } catch (e) {
    console.error('[cron/informes-quincenales] la corrida falló', e)
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error', firedAt: ahora.toISOString() }, { status: 500 })
  }
}

export const GET = handle
export const POST = handle
