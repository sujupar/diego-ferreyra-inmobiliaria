/**
 * PATCH /api/properties/[id]/meta-launch-v2/[jobId]/save-input
 *
 * Guarda input del asesor en el job (avatar elegido, comentario, fotos
 * con estrella, geo preset, presupuesto, videos).
 *
 * El frontend llama esto cada vez que el asesor avanza un paso del wizard.
 *
 * body: {
 *   selectedAvatarId?: string,
 *   avatarComment?: string,
 *   optimizedAvatar?: any,        // si ya se optimizó con el comentario
 *   starredPhotoIndices?: number[], // exactamente 3
 *   geoPresetId?: string,
 *   dailyBudgetArs?: number,
 *   videosToInclude?: string[],
 *   readyToGenerate?: boolean,    // si true, transiciona a status='generating'
 * }
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

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  try {
    const user = await requireAuth()
    const { id, jobId } = await params
    const supabase = getAdmin()

    // Autorización
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

    const body = (await req.json()) as {
      selectedAvatarId?: string
      avatarComment?: string
      optimizedAvatar?: Record<string, unknown>
      starredPhotoIndices?: number[]
      geoPresetId?: string
      dailyBudgetArs?: number
      videosToInclude?: string[]
      readyToGenerate?: boolean
    }

    const update: Record<string, unknown> = {}
    if (typeof body.selectedAvatarId === 'string') update.selected_avatar_id = body.selectedAvatarId
    if (typeof body.avatarComment === 'string') update.avatar_comment = body.avatarComment.slice(0, 500)
    if (body.optimizedAvatar) update.optimized_avatar = body.optimizedAvatar
    if (Array.isArray(body.starredPhotoIndices)) {
      update.starred_photo_indices = body.starredPhotoIndices
        .filter(n => typeof n === 'number' && n >= 0)
        .slice(0, 3)
    }
    if (typeof body.geoPresetId === 'string') update.geo_preset_id = body.geoPresetId
    if (typeof body.dailyBudgetArs === 'number' && body.dailyBudgetArs >= 0) {
      update.daily_budget_ars = Math.floor(body.dailyBudgetArs)
    }
    if (Array.isArray(body.videosToInclude)) {
      update.videos_to_include = body.videosToInclude.slice(0, 5).map(String)
    }
    if (body.readyToGenerate === true) {
      update.status = 'generating'
      update.current_step = 'starting_generation'
      update.progress_percent = 0
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
    }

    const { error } = await (supabase as unknown as {
      from: (t: string) => {
        update: (f: Record<string, unknown>) => {
          eq: (a: string, b: string) => {
            eq: (a: string, b: string) => Promise<{ error: Error | null }>
          }
        }
      }
    })
      .from('meta_launch_jobs')
      .update(update)
      .eq('id', jobId)
      .eq('property_id', id)
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
