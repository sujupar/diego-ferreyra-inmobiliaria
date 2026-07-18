import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { canAccessProperty } from '@/lib/auth/entity-access'
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
    if (!(await canAccessProperty(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const body = await req.json().catch(() => ({}))

    // Reordenar / elegir portada: el array debe ser una PERMUTACIÓN de las fotos
    // actuales (mismo conjunto) — así no se inyectan URLs arbitrarias y un
    // reorder desactualizado se rechaza en vez de pisar un borrado reciente.
    if (Array.isArray(body.photos)) {
      const photos = body.photos.filter((u: unknown) => typeof u === 'string') as string[]
      const prop = await getProperty(id)
      const existing = Array.isArray(prop.photos) ? prop.photos : []
      const sameSet =
        photos.length === existing.length &&
        [...photos].sort().join(' ') === [...existing].sort().join(' ')
      if (!sameSet) {
        return NextResponse.json({ error: 'El orden no coincide con las fotos actuales' }, { status: 400 })
      }
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

    // Borrar un plano: saca del array + borra de Storage.
    if (typeof body.deletePlan === 'string') {
      const prop = await getProperty(id)
      const existing = Array.isArray(prop.plans) ? prop.plans : []
      const plans = existing.filter((u: string) => u !== body.deletePlan)
      await updateProperty(id, { plans })
      await removeFromStorage(body.deletePlan)
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

    // Setear o limpiar el recorrido virtual (enlace). Debe ser https:// para
    // evitar javascript:/data: (XSS almacenado al embeberlo en <iframe>).
    if ('tour_3d_url' in body) {
      const raw = typeof body.tour_3d_url === 'string' ? body.tour_3d_url.trim() : ''
      let val: string | null = null
      if (raw) {
        let isHttps = false
        try { isHttps = new URL(raw).protocol === 'https:' } catch { isHttps = false }
        if (!isHttps) {
          return NextResponse.json({ error: 'El recorrido debe ser un enlace https válido' }, { status: 400 })
        }
        val = raw
      }
      await updateProperty(id, { tour_3d_url: val })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Operación no reconocida' }, { status: 400 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
