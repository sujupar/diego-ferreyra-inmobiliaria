import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { leerInicio } from '@/lib/supabase/inicio'

// El Inicio (crm-inicio, D3). Lee con service role: el alcance lo da el rol de quien pide
// (cada bloque filtra por su vista o su id). El abogado y los roles sin Inicio: 403.
export const dynamic = 'force-dynamic'

export async function GET() {
  const user = await requireAuth()
  try {
    const r = await leerInicio({ id: user.profile.id || user.id, role: user.profile.role, nombre: user.profile.full_name ?? null }, new Date())
    if (!r) return NextResponse.json({ error: 'No tenés un Inicio.' }, { status: 403 })
    return NextResponse.json(r)
  } catch (error) {
    console.error('GET /api/inicio error:', error)
    return NextResponse.json({ error: 'No se pudo cargar el Inicio. Probá de nuevo.' }, { status: 500 })
  }
}
