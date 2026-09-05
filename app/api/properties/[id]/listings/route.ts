import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import type { Database } from '@/types/database.types'
import { puedeDifundir } from '@/lib/properties/difusion-access-server'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const supabase = getAdmin()

    // Manual authorization: asesor solo si está asignado
    // La política de difusión vive en UNA tabla:
    // `lib/properties/difusion-access.ts`. Antes este chequeo estaba
    // copiado a mano en cada ruta.
    if (!(await puedeDifundir(id, user.id, user.profile.role, 'ver_difusion'))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('property_listings')
      .select('*')
      .eq('property_id', id)
      .order('portal', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
