import { NextResponse } from 'next/server'
import { socialAuth } from '@/lib/social/route-auth'
import { generateScript } from '@/lib/social/narrative'
import { slideToRow } from '@/lib/social/generate'
import { admin, signedUrl } from '@/lib/social/storage'

export const maxDuration = 60

// POST: crea un carrusel, genera el guion y encola los slides (status generating_images).
export async function POST(req: Request) {
  const auth = await socialAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const body = await req.json().catch(() => ({}))
  const topic = String(body.topic || '').trim()
  if (!topic) return NextResponse.json({ error: 'Falta el tema' }, { status: 400 })

  const input = {
    topic,
    structure: (['aversion', 'errores', 'momento', 'auto'].includes(body.structure) ? body.structure : 'auto') as any,
    targetLength: body.targetLength ? Math.max(4, Math.min(12, Number(body.targetLength))) : null,
    ctaType: (body.ctaType === 'organic' ? 'organic' : 'campaign') as 'campaign' | 'organic',
    diegoEnabled: body.diegoEnabled !== false,
  }

  let script
  try {
    script = await generateScript(input)
  } catch (e: any) {
    return NextResponse.json({ error: 'No se pudo generar el guion: ' + String(e?.message).slice(0, 200) }, { status: 502 })
  }

  const db = admin()
  const { data: carousel, error: e1 } = await db.from('social_carousels').insert({
    created_by: auth.user.id,
    topic: input.topic,
    structure: input.structure,
    target_length: input.targetLength,
    cta_type: input.ctaType,
    diego_enabled: input.diegoEnabled,
    status: 'generating_images',
    progress_percent: 0,
    title: script.title,
    script,
    caption: script.caption,
    hashtags: script.hashtags,
  }).select('id').single()
  if (e1 || !carousel) return NextResponse.json({ error: 'DB: ' + e1?.message }, { status: 500 })

  const id = (carousel as any).id
  const rows = script.slides.map((s, i) => ({ carousel_id: id, ...slideToRow(s, i + 1) }))
  const { error: e2 } = await db.from('social_carousel_slides').insert(rows)
  if (e2) return NextResponse.json({ error: 'DB slides: ' + e2.message }, { status: 500 })

  return NextResponse.json({ id, slides: script.slides.length })
}

// GET: lista de carruseles del usuario (ops ven todos; asesor solo los suyos), con thumbnail.
export async function GET() {
  const auth = await socialAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = admin()
  let q = db.from('social_carousels')
    .select('id, title, topic, status, progress_percent, cta_type, created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (!auth.isOps) q = q.eq('created_by', auth.user.id)
  const { data: carousels, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (carousels || []).map((c: any) => c.id)
  const thumbs: Record<string, string | null> = {}
  if (ids.length) {
    const { data: firstSlides } = await db.from('social_carousel_slides')
      .select('carousel_id, storage_url').eq('position', 1).in('carousel_id', ids)
    await Promise.all((firstSlides || []).map(async (s: any) => {
      thumbs[s.carousel_id] = await signedUrl(s.storage_url)
    }))
  }

  return NextResponse.json({
    carousels: (carousels || []).map((c: any) => ({ ...c, thumb: thumbs[c.id] || null })),
  })
}
