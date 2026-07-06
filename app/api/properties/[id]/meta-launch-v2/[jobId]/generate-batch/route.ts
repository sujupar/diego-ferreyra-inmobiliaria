/**
 * POST /api/properties/[id]/meta-launch-v2/[jobId]/generate-batch
 *
 * Genera el siguiente batch de piezas gráficas. El frontend llama esto N
 * veces hasta que el job alcanza progress=100%.
 *
 * Cada llamada genera 3 piezas (~30-45s). Se queda dentro del timeout de
 * Netlify (60s con maxDuration).
 *
 * body: { batchSize?: number } // default 3
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { runBatch } from '@/lib/marketing/ad-image-async-runner'
import type { Database } from '@/types/database.types'

export const maxDuration = 60 // segundos — Netlify Pro lo permite

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  try {
    const user = await requireAuth()
    const { id, jobId } = await params
    const supabase = getAdmin()

    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    if (user.profile.role === 'asesor') {
      const { data: prop } = await supabase
        .from('properties')
        .select('assigned_to')
        .eq('id', id)
        .single()
      if (!prop || prop.assigned_to !== user.id) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
    }

    // Anti-IDOR: el jobId de la URL DEBE pertenecer a esta propiedad. Sin esto, un
    // asesor con acceso a la propiedad A podría pasar el jobId de la propiedad B y
    // generar piezas (quemar costo Gemini) contra el job ajeno.
    // meta_launch_jobs no está en los tipos generados → cast puntual (patrón del resto
    // de las rutas meta-launch-v2, p.ej. cancel/route.ts).
    const jobRes = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (a: string, b: string) => {
            maybeSingle: () => Promise<{ data: { property_id?: string } | null }>
          }
        }
      }
    })
      .from('meta_launch_jobs')
      .select('property_id')
      .eq('id', jobId)
      .maybeSingle()
    if (!jobRes.data || jobRes.data.property_id !== id) {
      return NextResponse.json({ error: 'job no pertenece a la propiedad' }, { status: 403 })
    }

    const body = (await req.json().catch(() => ({}))) as { batchSize?: number }
    const batchSize = Math.max(1, Math.min(body.batchSize ?? 3, 5))

    const result = await runBatch({ jobId, batchSize })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
