import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { createClient } from '@supabase/supabase-js'

const MAX_FILE_BYTES = 200 * 1024 * 1024 // 200 MB
const ALLOWED_EXT = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'tif', 'tiff']

function getStorage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage
}

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120)
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemKey: string }> }) {
  try {
    await requireAuth()
    const { id, itemKey } = await params
    const body = await req.json().catch(() => ({}))
    const { fileName, fileSize, contentType } = body as { fileName?: string; fileSize?: number; contentType?: string }

    if (!fileName || typeof fileSize !== 'number') {
      return NextResponse.json({ error: 'fileName y fileSize son requeridos' }, { status: 400 })
    }
    if (fileSize > MAX_FILE_BYTES) {
      return NextResponse.json({
        error: `Archivo demasiado grande (${(fileSize / 1024 / 1024).toFixed(1)} MB). Máximo permitido: ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
      }, { status: 413 })
    }
    if (fileSize <= 0) {
      return NextResponse.json({ error: 'Archivo vacío' }, { status: 400 })
    }
    const ext = (fileName.split('.').pop() || '').toLowerCase()
    if (!ALLOWED_EXT.includes(ext)) {
      return NextResponse.json({ error: `Extensión no permitida (.${ext}). Permitidas: ${ALLOWED_EXT.join(', ')}` }, { status: 400 })
    }

    const safeName = sanitizeFileName(fileName)
    const path = `properties/${id}/legal/${itemKey}-${Date.now()}-${safeName}`

    const bucket = getStorage().from('property-files')
    const { data, error } = await bucket.createSignedUploadUrl(path)
    if (error || !data) {
      return NextResponse.json({ error: error?.message || 'No se pudo generar URL de subida' }, { status: 500 })
    }

    const { data: { publicUrl } } = bucket.getPublicUrl(path)

    return NextResponse.json({
      token: data.token,
      signedUrl: data.signedUrl,
      path: data.path,
      publicUrl,
      contentType: contentType || 'application/octet-stream',
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
