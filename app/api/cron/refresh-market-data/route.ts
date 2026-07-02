import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { refreshCore, refreshZonaprop } from '@/lib/market-data/ingest'
import { currentPeriod } from '@/lib/market-data/period'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function admin() {
    return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Auth DUAL: env CRON_SECRET O el secreto de cron_config (los jobs de pg_cron
 *  mandan este último — ver CLAUDE.md "2 secretos coexisten"). */
async function isAuthorized(req: NextRequest): Promise<boolean> {
    const secret = req.headers.get('x-cron-secret')
    if (!secret) return false
    if (process.env.CRON_SECRET && secret === process.env.CRON_SECRET) return true
    try {
        const { data } = await admin().from('cron_config').select('value').eq('key', 'send_report').maybeSingle()
        return !!data?.value && secret === data.value
    } catch { return false }
}

async function run(req: NextRequest) {
    if (!(await isAuthorized(req))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const { searchParams } = new URL(req.url)
    const part = searchParams.get('part') || 'all'
    const period = searchParams.get('period') || currentPeriod()
    if (!/^\d{4}-\d{2}-01$/.test(period)) return NextResponse.json({ error: 'period inválido (YYYY-MM-01)' }, { status: 400 })

    const supabase = admin()
    const out: Record<string, unknown> = { period, part }
    if (part === 'core' || part === 'all') out.core = await refreshCore(supabase, period)
    if (part === 'zonaprop' || part === 'all') out.zonaprop = await refreshZonaprop(supabase, period, 12)
    return NextResponse.json(out)
}

export async function POST(req: NextRequest) { return run(req) }
export async function GET(req: NextRequest) { return run(req) }
