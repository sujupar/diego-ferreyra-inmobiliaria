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
  try {
    await requireAuth()
    const { id, itemKey } = await params
    const body = await req.json().catch(() => ({}))
    const { path, fileName } = body as { path?: string; fileName?: string }

    if (!path || !fileName) {
      return NextResponse.json({ error: 'path y fileName son requeridos' }, { status: 400 })
    }

    // Confirmar que el archivo llegó a Storage. Si el cliente reporta "subí ok"
    // pero el archivo no está, abortamos para no dejar metadata huérfana.
    const bucket = getStorage().from('property-files')
    const folder = path.substring(0, path.lastIndexOf('/'))
    const fileLeaf = path.substring(path.lastIndexOf('/') + 1)
    const { data: list, error: listErr } = await bucket.list(folder, { search: fileLeaf, limit: 1 })
    if (listErr) {
      return NextResponse.json({ error: `No se pudo verificar el archivo: ${listErr.message}` }, { status: 500 })
    }
    if (!list || list.length === 0) {
      return NextResponse.json({ error: 'El archivo no llegó a Storage. Reintentá la subida.' }, { status: 400 })
    }

    const { data: { publicUrl } } = bucket.getPublicUrl(path)

    let previousStatus: string | null = null
    let previousReviewerId: string | null = null
    try {
      const { docs } = await getLegalDocs(id)
      previousStatus = docs[itemKey]?.status ?? null
      previousReviewerId = docs[itemKey]?.reviewed_by ?? null
    } catch (e) { console.error('[legal-docs upload-commit] previous-state check failed:', e) }

    const item = await upsertLegalDocItem(id, itemKey, {
      file_url: publicUrl,
      file_name: fileName,
      uploaded_at: new Date().toISOString(),
      status: 'pending',
      reviewed_at: null,
      reviewer_notes: null,
      reviewed_by: null,
    })

    if (previousStatus === 'rejected') {
      await notifyWithEscalation(
        () => notifyDocsResubmitted({ propertyId: id, itemKey, previousReviewerId }),
        { failedNotificationType: 'docs_resubmitted', entityType: 'property', entityId: id },
      )
    }

    return NextResponse.json({ data: item })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Error' }, { status: 500 })
  }
}
