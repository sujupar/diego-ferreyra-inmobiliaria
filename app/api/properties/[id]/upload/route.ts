import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { updateProperty, checkAndAdvanceProperty } from '@/lib/supabase/properties'

// Límites razonables. Si los superamos, devolvemos 400 con mensaje claro
// en vez de dejar que Supabase Storage devuelva un error genérico.
const MAX_PHOTO_BYTES = 15 * 1024 * 1024 // 15 MB
const MAX_DOC_BYTES = 25 * 1024 * 1024 // 25 MB
const ALLOWED_PHOTO_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif']
const ALLOWED_DOC_EXT = ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'webp']

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const type = formData.get('type') as string | null

    if (!file || !type) {
      return NextResponse.json({ error: 'Falta archivo o tipo (file/type).' }, { status: 400 })
    }
    if (type !== 'photo' && type !== 'document') {
      return NextResponse.json({ error: `Tipo inválido: ${type}` }, { status: 400 })
    }

    const rawExt = (file.name.split('.').pop() || '').toLowerCase().trim()
    const ext = rawExt.replace(/[^a-z0-9]/g, '')

    const allowed = type === 'photo' ? ALLOWED_PHOTO_EXT : ALLOWED_DOC_EXT
    if (!ext || !allowed.includes(ext)) {
      return NextResponse.json(
        { error: `Formato no permitido (.${ext || '?'}). Permitidos: ${allowed.join(', ')}` },
        { status: 400 },
      )
    }

    const maxBytes = type === 'photo' ? MAX_PHOTO_BYTES : MAX_DOC_BYTES
    if (file.size > maxBytes) {
      const mb = (maxBytes / 1024 / 1024).toFixed(0)
      return NextResponse.json(
        { error: `El archivo supera el máximo de ${mb} MB (subiste ${(file.size / 1024 / 1024).toFixed(1)} MB).` },
        { status: 400 },
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )

    // Path con UUID — evita colisiones por clicks rápidos consecutivos.
    const path = `properties/${id}/${type}s/${randomUUID()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { error: uploadError } = await supabase.storage
      .from('property-files')
      .upload(path, buffer, { contentType: file.type || 'application/octet-stream' })

    if (uploadError) {
      console.error('[properties/upload] Storage upload failed', {
        propertyId: id, type, path, fileSize: file.size, mime: file.type, error: uploadError.message,
      })
      return NextResponse.json(
        { error: `Error en Storage: ${uploadError.message}` },
        { status: 500 },
      )
    }

    const { data: { publicUrl } } = supabase.storage.from('property-files').getPublicUrl(path)

    const { data: property, error: fetchError } = await supabase
      .from('properties')
      .select('photos, documents')
      .eq('id', id)
      .single()

    if (fetchError) {
      console.error('[properties/upload] Failed to fetch property after upload', { propertyId: id, error: fetchError.message })
      return NextResponse.json({ error: `No se pudo leer la propiedad: ${fetchError.message}` }, { status: 500 })
    }

    if (type === 'photo') {
      const photos = [...(property?.photos || []), publicUrl]
      await updateProperty(id, { photos })
    } else {
      const docs = [...(Array.isArray(property?.documents) ? property.documents : []), { name: file.name, url: publicUrl, uploaded_at: new Date().toISOString() }]
      await updateProperty(id, { documents: docs } as any)
    }

    if (type === 'photo') {
      try { await checkAndAdvanceProperty(id) } catch (e) { console.error('[properties/upload] Auto-advance error:', e) }
    }

    return NextResponse.json({ success: true, url: publicUrl })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido'
    console.error('[properties/upload] Unhandled error', { propertyId: id, error: message })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
