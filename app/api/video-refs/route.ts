import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'
import type { VideoRef } from '@/lib/video-refs/repo'

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

// GET: referencias de video, la más reciente primero.
export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await admin()
    .from('video_refs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ refs: (data ?? []) as VideoRef[] })
}
