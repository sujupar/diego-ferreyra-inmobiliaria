import { NextRequest, NextResponse } from 'next/server'
import { upsertLegalDocItem } from '@/lib/supabase/legal-docs'
import { requireAuth } from '@/lib/auth/require-role'
import { createClient } from '@supabase/supabase-js'

function getStorage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string; itemKey: string }> }) {
  await requireAuth()
  const { id, itemKey } = await params
  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'file required' }, { status: 400 })

  const ext = file.name.split('.').pop() || 'bin'
  const path = `properties/${id}/legal/${itemKey}-${Date.now()}.${ext}`
  const bucket = getStorage().from('property-files')
  const buf = await file.arrayBuffer()
  const { error: upErr } = await bucket.upload(path, buf, { contentType: file.type, upsert: true })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  const { data: { publicUrl } } = bucket.getPublicUrl(path)

  const item = await upsertLegalDocItem(id, itemKey, {
    file_url: publicUrl,
    file_name: file.name,
    uploaded_at: new Date().toISOString(),
    status: 'pending',
    reviewed_at: null,
    reviewer_notes: null,
    reviewed_by: null,
  })

  return NextResponse.json({ data: item })
}
