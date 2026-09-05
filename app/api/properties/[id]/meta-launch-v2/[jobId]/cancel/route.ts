/**
 * POST /api/properties/[id]/meta-launch-v2/[jobId]/cancel
 *
 * Cancela un job activo. Si ya generó piezas, no las borra (quedan en DB
 * para auditoría) — solo marca el job como cancelado.
 */
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

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  try {
    const user = await requireAuth()
    const { id, jobId } = await params
    const supabase = getAdmin()

    // El abogado no participa de marketing
    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    // La política de difusión vive en UNA tabla:
    // `lib/properties/difusion-access.ts`. Antes este chequeo estaba
    // copiado a mano en cada ruta.
    if (!(await puedeDifundir(id, user.id, user.profile.role, 'difundir'))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    await (supabase as unknown as {
      from: (t: string) => {
        update: (f: Record<string, unknown>) => {
          eq: (a: string, b: string) => {
            eq: (a: string, b: string) => Promise<unknown>
          }
        }
      }
    })
      .from('meta_launch_jobs')
      .update({
        status: 'cancelled',
        current_step: 'cancelled_by_user',
      })
      .eq('id', jobId)
      .eq('property_id', id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
