import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'
import type { NewsScript } from '@/lib/news/scripts-repo'

// Cliente service_role: la RLS de `news_scripts` solo deja leer a `authenticated`.
// Guardamos la sesión arriba con getUser() y leemos con service_role, igual que /api/news.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// GET: piezas guionizadas (o en proceso), la más reciente primero.
export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data, error } = await admin()
    .from('news_scripts')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ scripts: (data ?? []) as NewsScript[] })
}
