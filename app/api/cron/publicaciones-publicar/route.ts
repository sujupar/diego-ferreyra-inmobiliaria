/**
 * Publica los videos programados en Instagram y Facebook. Lo llama `pg_cron`
 * cada 2 minutos. Con la publicación automática apagada responde
 * `motivo: 'apagado'` sin tocar nada.
 *
 * Autorización DOBLE (env o `cron_config`), igual que `reels-publish`: validar
 * contra un solo secreto deja el job en 403 en silencio. `?ping=1` responde sin
 * efectos para confirmar el deploy ANTES de programar el job.
 */
import { NextRequest, NextResponse } from 'next/server'
import { publicacionesDb } from '@/lib/publicaciones/db'
import { correrPublicacion } from '@/lib/publicaciones/servidor/publicador'

async function autorizado(provisto: string | null): Promise<boolean> {
  if (!provisto) return false
  if (process.env.CRON_SECRET && provisto === process.env.CRON_SECRET) return true
  try {
    const { data } = await publicacionesDb()
      .from('cron_config')
      .select('value')
      .eq('key', 'publicaciones_publicar')
      .maybeSingle()
    const secretoDb = (data as { value?: string } | null)?.value
    // Un marcador sin reemplazar ('__SECRETO__', público en el repo) nunca vale.
    return !!secretoDb && !secretoDb.startsWith('__') && provisto === secretoDb
  } catch {
    return false
  }
}

async function manejar(req: NextRequest): Promise<Response> {
  if (new URL(req.url).searchParams.get('ping') === '1') {
    return NextResponse.json({ ok: true, ruta: 'publicaciones-publicar' })
  }
  if (!(await autorizado(req.headers.get('x-cron-secret')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  try {
    const resumen = await correrPublicacion()
    console.log('[cron/publicaciones-publicar]', JSON.stringify(resumen))
    return NextResponse.json({ ok: true, ...resumen })
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : 'Error'
    console.error('[cron/publicaciones-publicar] falló', mensaje)
    return NextResponse.json({ ok: false, error: mensaje }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return manejar(req)
}

export async function POST(req: NextRequest) {
  return manejar(req)
}
