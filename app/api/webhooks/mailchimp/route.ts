import { NextRequest, NextResponse } from 'next/server'
import { parseWebhook, recordSuppression } from '@/lib/integrations/mailchimp/suppressions'

export const dynamic = 'force-dynamic'

function authorized(req: NextRequest): boolean {
  const secret = new URL(req.url).searchParams.get('s')
  return !!process.env.MAILCHIMP_WEBHOOK_SECRET && secret === process.env.MAILCHIMP_WEBHOOK_SECRET
}

// Mailchimp verifica el endpoint con un GET → debe responder 200.
export async function GET(req: NextRequest): Promise<Response> {
  return NextResponse.json({ ok: authorized(req) })
}

export async function POST(req: NextRequest): Promise<Response> {
  if (!authorized(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  try {
    const form = new URLSearchParams(await req.text())
    const { type, email } = parseWebhook(form)
    if (email && (type === 'unsubscribe' || type === 'cleaned')) {
      await recordSuppression(email, type)
    }
  } catch (err) {
    console.warn('[mailchimp] webhook parse failed (ignored):', err instanceof Error ? err.message : err)
  }
  // Siempre 200: no queremos que Mailchimp reintente por un error nuestro.
  return NextResponse.json({ ok: true })
}
