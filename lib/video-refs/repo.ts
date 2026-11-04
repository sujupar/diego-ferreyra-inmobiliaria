import { createClient } from '@supabase/supabase-js'

// Fila de `video_refs` (coincide con supabase/migrations/20261104000001_video_refs.sql).
export type VideoRef = {
  id: string
  created_at: string
  updated_at: string
  cuenta: string | null
  plataforma: string | null
  url_video: string | null
  fecha_video: string | null
  vistas: number | null
  likes: number | null
  comentarios: number | null
  multiplicador: number | null
  baseline_cuenta: string | null
  seguidores: number | null
  tema: string
  por_que: string | null
  gancho: string | null
  adaptacion_diego: string | null
  tipo: 'video_cuenta' | 'tema_tendencia' | 'hipotesis_prensa'
  estado_uso: 'sin_usar' | 'guionizando' | 'usada' | 'error'
  thumbnail_url: string | null
  ficha_slug: string
  guion: string | null
  guion_error: string | null
  avisado_at: string | null
  creado_por: string | null
}

// service_role: la RLS de video_refs solo da SELECT a `authenticated`.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function listVideoRefs(): Promise<VideoRef[]> {
  const { data, error } = await admin()
    .from('video_refs')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as VideoRef[]
}

export async function getVideoRef(id: string): Promise<VideoRef | null> {
  const { data, error } = await admin()
    .from('video_refs')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data ?? null) as VideoRef | null
}

export async function getPendingRefs(): Promise<VideoRef[]> {
  const { data, error } = await admin()
    .from('video_refs')
    .select('*')
    .eq('estado_uso', 'guionizando')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as VideoRef[]
}

// Claim atómico: solo transiciona sin_usar -> guionizando. false si ya no estaba
// en sin_usar (o no existe).
export async function claimForGuionizado(id: string, _userId: string): Promise<boolean> {
  const { data, error } = await admin()
    .from('video_refs')
    .update({ estado_uso: 'guionizando', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('estado_uso', 'sin_usar')
    .select('id')
  if (error) throw new Error(error.message)
  return (data ?? []).length > 0
}

export async function markUsada(id: string, guion: string): Promise<void> {
  const { error } = await admin()
    .from('video_refs')
    .update({ guion, estado_uso: 'usada', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('estado_uso', 'guionizando')
  if (error) throw new Error(error.message)
}

export async function markRefError(id: string, msg: string): Promise<void> {
  const { error } = await admin()
    .from('video_refs')
    .update({ estado_uso: 'error', guion_error: msg, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('estado_uso', 'guionizando')
  if (error) throw new Error(error.message)
}

export async function expireStaleRefs(maxAgeHours: number, msg: string): Promise<void> {
  const cutoff = new Date(Date.now() - maxAgeHours * 3600_000).toISOString()
  const { error } = await admin()
    .from('video_refs')
    .update({ estado_uso: 'error', guion_error: msg, updated_at: new Date().toISOString() })
    .eq('estado_uso', 'guionizando')
    .lt('updated_at', cutoff)
  if (error) throw new Error(error.message)
}
