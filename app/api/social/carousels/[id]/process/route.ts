import { NextResponse } from 'next/server'
import { socialAuth, canAccessCarousel } from '@/lib/social/route-auth'
import { processNextSlide } from '@/lib/social/generate'
import { admin } from '@/lib/social/storage'

export const maxDuration = 60

// POST: procesa UN slide pendiente (trabajo pesado, desacoplado del GET status).
// El cliente lo llama en loop mientras el carrusel genera. Con { retry: true }
// resetea los slides fallidos a pendiente y reanuda.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await socialAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id } = await params
  const db = admin()

  const { data: carousel } = await db.from('social_carousels').select('created_by, status').eq('id', id).single()
  if (!carousel) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  if (!canAccessCarousel(carousel as any, auth.user.id, auth.isOps)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  if (body.retry) {
    await db.from('social_carousel_slides').update({ status: 'pending', error_message: null }).eq('carousel_id', id).eq('status', 'failed')
    await db.from('social_carousels').update({ status: 'generating_images', error_message: null, updated_at: new Date().toISOString() }).eq('id', id)
  } else if ((carousel as any).status === 'ready') {
    return NextResponse.json({ done: true, progress: 100 })
  } else if ((carousel as any).status === 'failed') {
    return NextResponse.json({ done: false, failed: true })
  }

  try {
    const r = await processNextSlide(id)
    return NextResponse.json(r)
  } catch (e: any) {
    // processNextSlide ya marcó el slide + carrusel como 'failed' con el mensaje.
    return NextResponse.json({ done: false, failed: true, error: String(e?.message).slice(0, 300) })
  }
}
