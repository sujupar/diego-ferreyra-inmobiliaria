import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'
import type { VideoRef } from '@/lib/video-refs/repo'
import { calcularEstadoRadar } from '@/lib/video-refs/estado-radar'
import { leerCorridas } from '@/lib/video-refs/corridas'

export const dynamic = 'force-dynamic'

// service_role: la RLS de `video_refs` solo deja leer a `authenticated`.
// Guardamos la sesión con getUser() y leemos con service_role, igual que /api/news/scripts.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

const BUCKET = 'video-refs'

// GET: referencias de video, la más reciente primero.
// Sin ?archivo: las del radar visibles. Con ?archivo=1: las de OpenClaw (archivo anterior).
export async function GET(req: Request) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const archivo = new URL(req.url).searchParams.get('archivo') === '1'
  const db = admin()

  let q = db.from('video_refs').select('*').eq('fuente', archivo ? 'openclaw' : 'radar')
  if (!archivo) q = q.eq('oculta', false)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const filas = (data ?? []) as VideoRef[]

  // URLs firmadas (1 h) de video y portada, en un solo llamado.
  const paths = [...new Set(filas.flatMap((r) => [r.video_storage_path, r.portada_storage_path]).filter((p): p is string => !!p))]
  const firmas = new Map<string, string>()
  if (paths.length > 0) {
    const { data: s } = await db.storage.from(BUCKET).createSignedUrls(paths, 3600)
    for (const x of s ?? []) if (x.path && x.signedUrl) firmas.set(x.path, x.signedUrl)
  }
  const refs = filas.map((r) => ({
    ...r,
    video_url: r.video_storage_path ? firmas.get(r.video_storage_path) ?? null : null,
    portada_url: (r.portada_storage_path ? firmas.get(r.portada_storage_path) : null) ?? r.thumbnail_url,
  }))

  let radar = null
  if (!archivo) {
    const { ultima, ultimaOk } = await leerCorridas(db)
    radar = calcularEstadoRadar(ultimaOk, ultima, new Date())
  }

  return NextResponse.json({ refs, radar })
}
