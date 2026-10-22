import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'

// Cliente service_role: los barridos no son sensibles por rol, pero la RLS de
// `news_scans` solo deja leer a `authenticated`. Guardamos la sesión arriba con
// getUser() y leemos con service_role, igual que /api/social/carousels.
function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  )
}

// GET: barridos del Reportero, el día más reciente primero.
export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: scans, error } = await admin()
    .from('news_scans')
    .select('id, scan_date, items, created_at')
    .order('scan_date', { ascending: false })
    .limit(365)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ scans: scans || [] })
}
