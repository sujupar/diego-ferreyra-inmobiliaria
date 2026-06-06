/**
 * POST /api/properties/[id]/meta-launch-v2/[jobId]/optimize-avatar
 *
 * Optimiza un avatar con un comentario del asesor (Gemini Text).
 * No reemplaza el avatar — lo refina manteniendo la esencia.
 *
 * body: { avatarId: string, comment: string }
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { optimizeAvatarWithComment, type BuyerAvatar } from '@/lib/marketing/buyer-avatar-generator'
import type { Database } from '@/types/database.types'

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

    const body = (await req.json()) as { avatarId?: string; comment?: string }
    if (!body.avatarId || !body.comment || body.comment.trim().length < 5) {
      return NextResponse.json(
        { error: 'avatarId y comment (≥5 chars) requeridos' },
        { status: 400 },
      )
    }

    // CRÍTICO: filtrar por id + property_id para evitar cross-tenant access
    // (un asesor de propiedad A no debe poder modificar jobs de propiedad B
    //  pasando jobId arbitrario).
    const { data: job } = await (supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (a: string, b: string) => {
            eq: (a: string, b: string) => {
              maybeSingle: () => Promise<{ data: { generated_avatars: { avatars?: BuyerAvatar[] } } | null }>
            }
          }
        }
      }
    })
      .from('meta_launch_jobs')
      .select('generated_avatars')
      .eq('id', jobId)
      .eq('property_id', id)
      .maybeSingle()
    if (!job?.generated_avatars?.avatars) {
      return NextResponse.json({ error: 'Job no tiene avatares' }, { status: 404 })
    }

    const targetAvatar = job.generated_avatars.avatars.find(
      (a: BuyerAvatar) => a.id === body.avatarId,
    )
    if (!targetAvatar) {
      return NextResponse.json({ error: 'Avatar no encontrado' }, { status: 404 })
    }

    const { data: property } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single()
    if (!property) {
      return NextResponse.json({ error: 'property not found' }, { status: 404 })
    }

    const optimized = await optimizeAvatarWithComment({
      avatar: targetAvatar,
      comment: body.comment.trim(),
      property: property as never,
    })
    if (!optimized) {
      return NextResponse.json(
        { error: 'No se pudo optimizar el avatar (Gemini)' },
        { status: 502 },
      )
    }

    // Guardar en el job (también filtrando por property_id por defensa)
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
        selected_avatar_id: body.avatarId,
        avatar_comment: body.comment.trim(),
        optimized_avatar: optimized,
      })
      .eq('id', jobId)
      .eq('property_id', id)

    return NextResponse.json({ optimized })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
