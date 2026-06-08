import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { createClient } from '@supabase/supabase-js'
import { getProperty, updateProperty } from '@/lib/supabase/properties'
import { storagePathFromPublicUrl } from '@/lib/properties/media'

function getStorage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage
}

async function removeFromStorage(publicUrl: string | null | undefined) {
  if (!publicUrl) return
  const path = storagePathFromPublicUrl(publicUrl)
  if (!path) return
  try { await getStorage().from('property-files').remove([path]) }
  catch (e) { console.error('[media PATCH] no se pudo borrar de Storage:', e) }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    // Reordenar / elegir portada: setea el array completo (un solo write).
    if (Array.isArray(body.photos)) {
      const photos = body.photos.filter((u: unknown) => typeof u === 'string')
      await updateProperty(id, { photos })
      return NextResponse.json({ success: true })
    }

    // Borrar una foto: saca del array + borra de Storage.
    if (typeof body.deletePhoto === 'string') {
      const prop = await getProperty(id)
      const existing = Array.isArray(prop.photos) ? prop.photos : []
      const photos = existing.filter((u: string) => u !== body.deletePhoto)
      await updateProperty(id, { photos })
      await removeFromStorage(body.deletePhoto)
      return NextResponse.json({ success: true })
    }

    // Setear o limpiar el video subido.
    if ('video_file_url' in body) {
      const val: string | null = typeof body.video_file_url === 'string' && body.video_file_url ? body.video_file_url : null
      if (val === null) {
        const prop = await getProperty(id)
        await removeFromStorage(prop.video_file_url)
      }
      await updateProperty(id, { video_file_url: val })
      return NextResponse.json({ success: true })
    }

    // Setear o limpiar el recorrido virtual (enlace).
    if ('tour_3d_url' in body) {
      const val: string | null = typeof body.tour_3d_url === 'string' && body.tour_3d_url.trim() ? body.tour_3d_url.trim() : null
      await updateProperty(id, { tour_3d_url: val })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Operación no reconocida' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
