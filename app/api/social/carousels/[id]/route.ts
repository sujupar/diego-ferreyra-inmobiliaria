import { NextResponse } from 'next/server'
import { socialAuth, canAccessCarousel } from '@/lib/social/route-auth'
import { admin, signedUrl } from '@/lib/social/storage'

export const maxDuration = 60

// GET: estado del carrusel + slides. LECTURA PURA E INSTANTÁNEA — no genera nada
// (el procesamiento pesado va en POST /process, para no chocar con el límite de
// tiempo de las funciones de Netlify y dar visibilidad inmediata).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await socialAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id } = await params
  const db = admin()

  const { data: carousel } = await db.from('social_carousels').select('*').eq('id', id).single()
  if (!carousel) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  if (!canAccessCarousel(carousel as any, auth.user.id, auth.isOps)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const { data: slides } = await db.from('social_carousel_slides').select('*').eq('carousel_id', id).order('position', { ascending: true })

  const slidesOut = await Promise.all((slides || []).map(async (s: any) => ({
    position: s.position, role: s.role, layout: s.layout, accent: s.accent,
    copy: s.copy, image_kind: s.image_kind, image_prompt: s.image_prompt,
    status: s.status, error: s.error_message, url: await signedUrl(s.storage_url),
  })))

  const c = carousel as any
  const total = slidesOut.length
  const composed = slidesOut.filter((s) => s.status === 'composed').length
  const nextPending = slidesOut.find((s) => s.status === 'pending')
  const step = c.status === 'generating_images' && nextPending ? `Generando slide ${nextPending.position} de ${total}…` : null

  return NextResponse.json({
    id, status: c.status, progress: c.progress_percent ?? Math.round((composed / Math.max(total, 1)) * 100),
    title: c.title, topic: c.topic, cta_type: c.cta_type, caption: c.caption, hashtags: c.hashtags,
    error: c.error_message, step, slides: slidesOut,
  })
}

// DELETE: borra el carrusel (ops o dueño).
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await socialAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id } = await params
  const db = admin()
  const { data: carousel } = await db.from('social_carousels').select('created_by').eq('id', id).single()
  if (!carousel) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  if (!canAccessCarousel(carousel as any, auth.user.id, auth.isOps)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })
  const { error } = await db.from('social_carousels').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
