import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { updateProperty, checkAndAdvanceProperty } from '@/lib/supabase/properties'

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const formData = await request.formData()
    const file = formData.get('file') as File
    const type = formData.get('type') as string // 'photo' or 'document'

    if (!file || !type) {
      return NextResponse.json({ error: 'Missing file or type' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const ext = file.name.split('.').pop()
    const path = `properties/${id}/${type}s/${Date.now()}.${ext}`

    const buffer = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage
      .from('property-files')
      .upload(path, buffer, { contentType: file.type })

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage.from('property-files').getPublicUrl(path)

    // Get current property to append to photos/documents
    const { data: property } = await supabase.from('properties').select('photos, documents').eq('id', id).single()

    if (type === 'photo') {
      const photos = [...(property?.photos || []), publicUrl]
      await updateProperty(id, { photos })
    } else {
      const docs = [...(Array.isArray(property?.documents) ? property.documents : []), { name: file.name, url: publicUrl, uploaded_at: new Date().toISOString() }]
      await updateProperty(id, { documents: docs } as any)
    }

    // Auto-advance if both legal approved + photos now exist
    if (type === 'photo') {
      try { await checkAndAdvanceProperty(id) } catch (e) { console.error('Auto-advance error:', e) }
    }

    return NextResponse.json({ success: true, url: publicUrl })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
