import { NextResponse } from 'next/server'
import { zipSync, strToU8 } from 'fflate'
import { socialAuth, canAccessCarousel } from '@/lib/social/route-auth'
import { admin, downloadPng } from '@/lib/social/storage'

export const maxDuration = 60

// POST: arma un ZIP con los PNG en alta + caption.txt.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await socialAuth()
  if (auth.error || !auth.user) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { id } = await params
  const db = admin()

  const { data: carousel } = await db.from('social_carousels').select('created_by, title, caption, hashtags').eq('id', id).single()
  if (!carousel) return NextResponse.json({ error: 'No existe' }, { status: 404 })
  if (!canAccessCarousel(carousel as any, auth.user.id, auth.isOps)) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const { data: slides } = await db.from('social_carousel_slides')
    .select('position, storage_url').eq('carousel_id', id).order('position', { ascending: true })

  const files: Record<string, Uint8Array> = {}
  for (const s of (slides || []) as any[]) {
    if (!s.storage_url) continue
    const buf = await downloadPng(s.storage_url)
    files[`slide-${String(s.position).padStart(2, '0')}.png`] = new Uint8Array(buf)
  }
  if (!Object.keys(files).length) return NextResponse.json({ error: 'Todavía no hay slides generados' }, { status: 400 })

  const c = carousel as any
  const captionTxt = [c.caption || '', '', (c.hashtags || []).join(' ')].join('\n')
  files['caption.txt'] = strToU8(captionTxt)

  const zip = zipSync(files, { level: 6 })
  const slug = (c.title || 'carrusel').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'carrusel'

  return new Response(new Uint8Array(zip), {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="${slug}.zip"`,
    },
  })
}
