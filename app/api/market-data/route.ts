import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'
import { getMarketData } from '@/lib/market-data/resolver'
import { currentPeriod } from '@/lib/market-data/period'

export const dynamic = 'force-dynamic'

/** Datos de mercado resueltos para una tasación. Lee con service role (RLS ya
 *  restringe por SELECT authenticated, pero el service role simplifica; el gate
 *  de acceso es getUser()). */
export async function GET(req: NextRequest) {
    const me = await getUser()
    if (!me) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const slug = searchParams.get('neighborhood') || ''
    const period = searchParams.get('period') || currentPeriod()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(period)) return NextResponse.json({ error: 'period inválido' }, { status: 400 })
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const data = await getMarketData(supabase, slug, period)
    return NextResponse.json({ data })
}
