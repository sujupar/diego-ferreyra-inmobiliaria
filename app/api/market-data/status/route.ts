import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'
import { currentPeriod } from '@/lib/market-data/period'
import { ALL_CABA_SLUGS } from '@/lib/market-data/neighborhoods'

export const dynamic = 'force-dynamic'

export async function GET() {
    const me = await getUser()
    if (!me) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    const period = currentPeriod()

    const [{ data: states }, { data: nbRows }, { data: cabaRow }] = await Promise.all([
        supabase.from('market_data_refresh_state').select('*'),
        supabase.from('market_snapshot_neighborhood').select('neighborhood_slug, price, property_types').eq('period', period),
        supabase.from('market_snapshot_caba').select('period, stock, escrituras, price_caba').eq('period', period).maybeSingle(),
    ])
    const rows = nbRows || []
    return NextResponse.json({
        period,
        core: (states || []).find(s => s.id === 'core') || null,
        zonaprop: (states || []).find(s => s.id === 'zonaprop') || null,
        counts: {
            barriosConPrecio: rows.filter(r => r.price).length,
            barriosConTipos: rows.filter(r => r.property_types).length,
            total: ALL_CABA_SLUGS.length,
        },
        cabaListo: !!(cabaRow?.stock && cabaRow?.escrituras),
        // La composición del stock (Infogram) está diferida: si falta stock.tipos,
        // la sección Stock del PDF usa la imagen del override manual. El panel lo
        // dice explícito para no contradecir el estado 'partial' de core.
        stockCompleto: !!((cabaRow?.stock as { tipos?: unknown[] } | null)?.tipos?.length),
    })
}
