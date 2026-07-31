import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'

/**
 * GET /api/leads/tags
 *
 * Catálogo de etiquetas activas (`lead_tags`, 12 sembradas por la migración
 * `20260801000001`), para poblar selectores/filtros en la UI. Gate: mismo
 * criterio que el resto de `/api/leads` — operaciones + asesor, el abogado
 * queda afuera con 403.
 *
 * `lead_tags` no está en `types/database.types.ts` (ver comentario en
 * `lib/leads/tags.ts`): cliente sin el genérico `<Database>`.
 *
 * Respuesta: `{ data: Array<{ slug, label, color, sort_order }> }`, ordenado
 * por `sort_order`.
 */
function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const ALLOWED_ROLES = ['admin', 'dueno', 'coordinador', 'asesor']

export async function GET() {
  try {
    const user = await requireAuth()
    if (!ALLOWED_ROLES.includes(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { data, error } = await admin()
      .from('lead_tags')
      .select('slug, label, color, sort_order')
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ data: data ?? [] })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Error' }, { status: 500 })
  }
}
