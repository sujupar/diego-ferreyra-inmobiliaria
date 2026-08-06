import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { reconcileMailchimp } from '@/lib/integrations/mailchimp/reconcile'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Secreto: env CRON_SECRET o, si no existe, public.cron_config(key='mailchimp_sync'). */
async function isAuthorized(provided: string | null): Promise<boolean> {
  if (!provided) return false
  if (process.env.CRON_SECRET && provided === process.env.CRON_SECRET) return true
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const { data } = await sb.from('cron_config').select('value').eq('key', 'mailchimp_sync').maybeSingle()
    const dbSecret = (data as { value?: string } | null)?.value
    return !!dbSecret && provided === dbSecret
  } catch { return false }
}

async function handle(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url)
  if (searchParams.get('ping') === '1') {
    return NextResponse.json({ ok: true, route: 'mailchimp-sync', auth: 'db+env' })
  }
  if (!(await isAuthorized(req.headers.get('x-cron-secret')))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
  const result = await reconcileMailchimp()
  return NextResponse.json({ ok: true, ...result, firedAt: new Date().toISOString() })
}

export async function POST(req: NextRequest): Promise<Response> { return handle(req) }
export async function GET(req: NextRequest): Promise<Response> { return handle(req) }
