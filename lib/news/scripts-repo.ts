import { createClient } from '@supabase/supabase-js'
import type { NewsCandidate } from './perplexity'

// Fila de `news_scripts`. OJO: NewsCandidate.fecha -> columna fecha_articulo.
export type NewsScript = {
  id: string
  created_at: string
  updated_at: string
  titulo: string
  medio: string
  fecha_articulo: string | null
  url: string
  resumen: string
  formato: string | null
  guion: string | null
  estado: 'guionizando' | 'listo' | 'error'
  error_msg: string | null
  avisado_at: string | null
  creado_por: string | null
}

// service_role: la RLS de news_scripts solo da SELECT a `authenticated`;
// INSERT/UPDATE deben hacerse desde el servidor con service_role.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

export async function createPendingScripts(
  items: NewsCandidate[],
  userId: string,
): Promise<{ ids: string[] }> {
  if (items.length === 0) return { ids: [] }
  const rows = items.map((it) => ({
    titulo: it.titulo,
    medio: it.medio,
    fecha_articulo: /^\d{4}-\d{2}-\d{2}$/.test(it.fecha ?? '') ? it.fecha : null,
    url: it.url,
    resumen: it.resumen,
    formato: (it as NewsCandidate & { formato?: string }).formato ?? null,
    estado: 'guionizando' as const,
    creado_por: userId,
  }))
  const { data, error } = await admin().from('news_scripts').insert(rows).select('id')
  if (error) throw new Error(error.message)
  return { ids: (data ?? []).map((r: { id: string }) => r.id) }
}

export async function listScripts(): Promise<NewsScript[]> {
  const { data, error } = await admin()
    .from('news_scripts')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []) as NewsScript[]
}

export async function getPendingScripts(): Promise<NewsScript[]> {
  const { data, error } = await admin()
    .from('news_scripts')
    .select('*')
    .eq('estado', 'guionizando')
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as NewsScript[]
}

// Claim: solo transiciona si la pieza sigue en 'guionizando' (evita pisar estados
// cuando dos corridas se solapan).
export async function markListo(id: string, guion: string): Promise<void> {
  const { error } = await admin()
    .from('news_scripts')
    .update({ guion, estado: 'listo', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('estado', 'guionizando')
  if (error) throw new Error(error.message)
}

export async function markError(id: string, msg: string): Promise<void> {
  const { error } = await admin()
    .from('news_scripts')
    .update({ estado: 'error', error_msg: msg, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('estado', 'guionizando')
  if (error) throw new Error(error.message)
}

// Piezas 'guionizando' demasiado viejas pasan a error para no reintentarse siempre.
export async function expireStaleScripts(maxAgeHours: number, msg: string): Promise<void> {
  const cutoff = new Date(Date.now() - maxAgeHours * 3600_000).toISOString()
  const { error } = await admin()
    .from('news_scripts')
    .update({ estado: 'error', error_msg: msg, updated_at: new Date().toISOString() })
    .eq('estado', 'guionizando')
    .lt('created_at', cutoff)
  if (error) throw new Error(error.message)
}
