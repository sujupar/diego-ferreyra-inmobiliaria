import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'
import { refreshCore, refreshZonaprop } from '@/lib/market-data/ingest'
import { currentPeriod } from '@/lib/market-data/period'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(req: NextRequest) {
    const me = await getUser()
    if (!me) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    if (!['admin', 'dueno'].includes(me.profile.role)) {
        return NextResponse.json({ error: 'Solo admin/dueño' }, { status: 403 })
    }
    const { part } = await req.json().catch(() => ({ part: 'core' }))
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const period = currentPeriod()
    if (part === 'zonaprop') return NextResponse.json({ period, zonaprop: await refreshZonaprop(supabase, period, 12) })
    return NextResponse.json({ period, core: await refreshCore(supabase, period) })
}
