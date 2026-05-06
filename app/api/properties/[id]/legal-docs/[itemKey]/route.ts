import { NextRequest, NextResponse } from 'next/server'
import { upsertLegalDocItem, getLegalDocs } from '@/lib/supabase/legal-docs'
import { requireAuth } from '@/lib/auth/require-role'
import { createClient } from '@supabase/supabase-js'
import { notifyDocsResubmitted } from '@/lib/email/notifications/docs-resubmitted'
import { notifyWithEscalation } from '@/lib/email/notify-with-escalation'

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

  // Capture previous state BEFORE upsert so we can detect rejected→pending
  // transitions and fire N7 only on genuine resubmissions.
  let previousStatus: string | null = null
  let previousReviewerId: string | null = null
  try {
    const { docs } = await getLegalDocs(id)
    previousStatus = docs[itemKey]?.status ?? null
    previousReviewerId = docs[itemKey]?.reviewed_by ?? null
  } catch (e) { console.error('[legal-docs upload] previous-state check failed:', e) }

  const item = await upsertLegalDocItem(id, itemKey, {
    file_url: publicUrl,
    file_name: file.name,
    uploaded_at: new Date().toISOString(),
    status: 'pending',
    reviewed_at: null,
    reviewer_notes: null,
    reviewed_by: null,
  })

  // N7: asesor resube tras rechazo — notificar al abogado original si lo tenemos,
  // fallback a todos los abogados activos. Idempotente=false: cada ciclo debe avisar.
  // Si falla, escala a admins.
  if (previousStatus === 'rejected') {
    await notifyWithEscalation(
      () => notifyDocsResubmitted({ propertyId: id, itemKey, previousReviewerId }),
      { failedNotificationType: 'docs_resubmitted', entityType: 'property', entityId: id },
    )
  }

  return NextResponse.json({ data: item })
}
