import { NextResponse } from 'next/server'
import { socialAuth, canAccessCarousel } from '@/lib/social/route-auth'
import { regenerateSlideImage, recomposeSlideText } from '@/lib/social/generate'
import { admin, signedUrl } from '@/lib/social/storage'

export const maxDuration = 60

// PATCH: editar copy (re-render de texto, gratis) o regenerar imagen (regenerate:true).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const auth = await socialAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id, n } = await params
  const position = Number(n)
  if (!Number.isInteger(position)) return NextResponse.json({ error: 'Slide inválido' }, { status: 400 })

  const db = admin()
  const { data: carousel } = await db.from('social_carousels').select('created_by').eq('id', id).single()
  if (!carousel) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  if (!canAccessCarousel(carousel as any, auth.user.id, auth.isOps)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  try {
    if (body.regenerate) {
      await regenerateSlideImage(id, position, typeof body.image_prompt === 'string' ? body.image_prompt : undefined)
    } else if (body.copy && typeof body.copy === 'object') {
      await recomposeSlideText(id, position, body.copy)
    } else {
      return NextResponse.json({ error: 'Nada para actualizar' }, { status: 400 })
    }
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message).slice(0, 300) }, { status: 500 })
  }

  const { data: slide } = await db.from('social_carousel_slides').select('*').eq('carousel_id', id).eq('position', position).single()
  return NextResponse.json({ position, copy: (slide as any)?.copy, url: await signedUrl((slide as any)?.storage_url) })
}
