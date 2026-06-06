/**
 * GET /api/properties/[id]/meta-launch-v2/[jobId]/status
 *
 * Devuelve el estado actual del job de lanzamiento. Lectura pura (no avanza
 * el job). El frontend hace polling cada 3s mientras el job está en estados
 * "analyzing" o "generating".
 *
 * Devuelve también las piezas ya generadas (con storage_url de Meta) para
 * mostrar previews progresivos en el wizard.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface JobRow {
  id: string
  property_id: string
  status: string
  current_step: string | null
  progress_percent: number | null
  description_used: string | null
  detected_strengths: Record<string, unknown> | null
  generated_avatars: Record<string, unknown> | null
  selected_avatar_id: string | null
  optimized_avatar: Record<string, unknown> | null
  starred_photo_indices: number[] | null
  geo_preset_id: string | null
  daily_budget_ars: number | null
  result_campaign_id: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

interface AssetRow {
  id: string
  highlight_id: string
  format: string
  storage_url: string | null
  meta_image_hash: string | null
  photo_source_index: number | null
  composition_variant: number | null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  try {
    const user = await requireAuth()
    const { id, jobId } = await params
    const supabase = getAdmin()

    // Autorización
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

    // Job
    const { data: job } = await (supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (a: string, b: string) => {
            eq: (a: string, b: string) => { maybeSingle: () => Promise<{ data: JobRow | null }> }
          }
        }
      }
    })
      .from('meta_launch_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('property_id', id)
      .maybeSingle()

    if (!job) {
      return NextResponse.json({ error: 'Job no encontrado' }, { status: 404 })
    }

    // Assets generados hasta ahora
    const { data: assets } = await (supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (a: string, b: string) => {
            order: (
              a: string,
              opts: { ascending: boolean },
            ) => Promise<{ data: AssetRow[] | null }>
          }
        }
      }
    })
      .from('property_ad_assets')
      .select('id, highlight_id, format, storage_url, meta_image_hash, photo_source_index, composition_variant')
      .eq('launch_job_id', jobId)
      .order('created_at', { ascending: true })

    return NextResponse.json({
      job,
      assets: assets ?? [],
      assetCount: (assets ?? []).length,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
