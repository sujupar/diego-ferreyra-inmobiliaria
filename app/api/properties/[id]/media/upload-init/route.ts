import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { canAccessProperty } from '@/lib/auth/entity-access'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { PHOTO_EXTS, VIDEO_EXTS, MAX_PHOTO_BYTES, MAX_VIDEO_BYTES } from '@/lib/properties/media'

function getStorage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage
}

interface FileMeta { fileName?: string; fileSize?: number; contentType?: string }

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireAuth()
    if (user.profile.role === 'abogado') {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }
    const { id } = await params
    // Anti-IDOR: un asesor solo puede subir media a SUS propiedades (evita minar
    // signed URLs contra el prefijo de storage de una propiedad ajena).
    if (!(await canAccessProperty(user, id))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const body = await req.json().catch(() => ({}))
    const kind = body.kind as 'photo' | 'video'
    const files: FileMeta[] = Array.isArray(body.files) ? body.files : []

    if (kind !== 'photo' && kind !== 'video') {
      return NextResponse.json({ error: 'kind inválido (photo|video)' }, { status: 400 })
    }
    if (files.length === 0) {
      return NextResponse.json({ error: 'No se enviaron archivos' }, { status: 400 })
    }

    const MAX_FILES_PER_REQUEST = 30
    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json({ error: `Máximo ${MAX_FILES_PER_REQUEST} archivos por lote` }, { status: 400 })
    }

    const allowed = kind === 'photo' ? (PHOTO_EXTS as readonly string[]) : (VIDEO_EXTS as readonly string[])
    const maxBytes = kind === 'photo' ? MAX_PHOTO_BYTES : MAX_VIDEO_BYTES
    const folder = kind === 'photo' ? 'photos' : 'video'
    const bucket = getStorage().from('property-files')

    const uploads: Array<{ signedUrl: string; token: string; path: string; publicUrl: string; contentType: string }> = []
    for (const f of files) {
      const ext = (f.fileName?.split('.').pop() || '').toLowerCase().replace(/[^a-z0-9]/g, '')
      if (!ext || !allowed.includes(ext)) {
        return NextResponse.json({ error: `Formato no permitido (.${ext || '?'}). Permitidos: ${allowed.join(', ')}` }, { status: 400 })
      }
      if (typeof f.fileSize !== 'number' || f.fileSize <= 0) {
        return NextResponse.json({ error: `Archivo inválido o vacío: ${f.fileName}` }, { status: 400 })
      }
      if (f.fileSize > maxBytes) {
        return NextResponse.json({ error: `"${f.fileName}" supera el máximo de ${(maxBytes / 1024 / 1024).toFixed(0)} MB.` }, { status: 413 })
      }
      const path = `properties/${id}/${folder}/${randomUUID()}.${ext}`
      const { data, error } = await bucket.createSignedUploadUrl(path)
      if (error || !data) {
        return NextResponse.json({ error: error?.message || 'No se pudo generar URL de subida' }, { status: 500 })
      }
      const { data: { publicUrl } } = bucket.getPublicUrl(path)
      uploads.push({ signedUrl: data.signedUrl, token: data.token, path: data.path, publicUrl, contentType: f.contentType || 'application/octet-stream' })
    }

    return NextResponse.json({ uploads })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
