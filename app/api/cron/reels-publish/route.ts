/**
 * Publica los reels programados. Lo llama `pg_cron` cada 5 minutos.
 *
 * ## Por qué la autorización es DOBLE
 *
 * En este proyecto conviven dos secretos de cron: uno en las variables de
 * Netlify y otro en la tabla `cron_config`. Validar contra uno solo deja el job
 * en 403 **en silencio** — le pasó a `publish-listings`, que estuvo muerto
 * dándose contra la pared cada minuto sin que nadie lo notara. Mismo patrón que
 * `app/api/cron/mapa-lugares`.
 *
 * `?ping=1` responde sin autenticación y sin efectos: sirve para confirmar que
 * ESTE deploy ya está sirviendo la ruta ANTES de programar el job. Programarlo
 * antes deja un job pegándole a un 404.
 */
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { correrPublicacionDeReels } from '@/lib/social/reels/publicador'

export const maxDuration = 60

async function autorizado(provisto: string | null): Promise<boolean> {
  if (!provisto) return false
  if (process.env.CRON_SECRET && provisto === process.env.CRON_SECRET) return true
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data } = await sb
      .from('cron_config')
      .select('value')
      .eq('key', 'reels_publish')
      .maybeSingle()
    const secretoDb = (data as { value?: string } | null)?.value
    // Un marcador sin reemplazar ('__SECRETO__', que está público en el repo)
    // nunca es un secreto válido.
    return !!secretoDb && !secretoDb.startsWith('__') && provisto === secretoDb
  } catch {
    return false
  }
}

async function manejar(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('ping') === '1') {
    return NextResponse.json({ ok: true, ruta: 'reels-publish', auth: 'db+env' })
  }

  if (!(await autorizado(req.headers.get('x-cron-secret')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  try {
    const resumen = await correrPublicacionDeReels()
    console.log('[cron/reels-publish]', JSON.stringify(resumen))
    return NextResponse.json({ ok: true, ...resumen })
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error'
    // Falla ruidoso: un cron que se cae callado es indistinguible de uno que no
    // tenía nada que hacer.
    console.error('[cron/reels-publish] falló', mensaje)
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return manejar(req)
}

export async function POST(req: NextRequest) {
  // pg_net solo sabe hacer POST. GET queda para probar a mano desde el navegador.
  return manejar(req)
}
