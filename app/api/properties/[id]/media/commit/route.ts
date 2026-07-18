import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { canAccessProperty } from '@/lib/auth/entity-access'
import { getProperty, updateProperty, checkAndAdvanceProperty } from '@/lib/supabase/properties'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    const { id } = await params
    if (!(await canAccessProperty(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const body = await req.json().catch(() => ({}))

    if (body.kind === 'photo') {
      const urls: string[] = Array.isArray(body.urls) ? body.urls.filter((u: unknown) => typeof u === 'string') : []
      if (urls.length === 0) {
        return NextResponse.json({ error: 'No se enviaron URLs' }, { status: 400 })
      }
      const storageBase = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
      const photoPrefix = `${storageBase}/storage/v1/object/public/property-files/properties/${id}/photos/`
      if (!urls.every((u) => u.startsWith(photoPrefix))) {
        return NextResponse.json({ error: 'URL de foto inválida' }, { status: 400 })
      }
      const prop = await getProperty(id)
      const existing = Array.isArray(prop.photos) ? prop.photos : []
      await updateProperty(id, { photos: [...existing, ...urls] })
      // Auto-avance UNA sola vez tras el lote (no por archivo).
      try { await checkAndAdvanceProperty(id) } catch (e) { console.error('[media/commit] auto-advance:', e) }
      return NextResponse.json({ success: true })
    }

    if (body.kind === 'plan') {
      const urls: string[] = Array.isArray(body.urls) ? body.urls.filter((u: unknown) => typeof u === 'string') : []
      if (urls.length === 0) {
        return NextResponse.json({ error: 'No se enviaron URLs' }, { status: 400 })
      }
      const storageBase = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
      const planPrefix = `${storageBase}/storage/v1/object/public/property-files/properties/${id}/plans/`
      if (!urls.every((u) => u.startsWith(planPrefix))) {
        return NextResponse.json({ error: 'URL de plano inválida' }, { status: 400 })
      }
      const prop = await getProperty(id)
      const existing = Array.isArray(prop.plans) ? prop.plans : []
      // Los planos NO participan del auto-avance de captación — no llamar
      // a checkAndAdvanceProperty acá.
      await updateProperty(id, { plans: [...existing, ...urls] })
      return NextResponse.json({ success: true })
    }

    if (body.kind === 'video') {
      if (typeof body.url !== 'string' || !body.url) {
        return NextResponse.json({ error: 'url de video requerida' }, { status: 400 })
      }
      const storageBase = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
      const videoPrefix = `${storageBase}/storage/v1/object/public/property-files/properties/${id}/video/`
      if (!body.url.startsWith(videoPrefix)) {
        return NextResponse.json({ error: 'URL de video inválida' }, { status: 400 })
      }
      await updateProperty(id, { video_file_url: body.url })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'kind inválido (photo|video|plan)' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
