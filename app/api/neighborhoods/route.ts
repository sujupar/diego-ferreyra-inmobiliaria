import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'
import { CABA_BARRIOS } from '@/lib/market-data/neighborhoods'

export const dynamic = 'force-dynamic'

/** Catálogo para el combobox del wizard. DB primero (permite activar/desactivar
 *  y sumar GBA sin deploy); fallback al catálogo estático si la tabla no existe. */
export async function GET() {
    const me = await getUser()
    if (!me) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    try {
        const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
        const { data, error } = await supabase.from('neighborhoods')
            .select('slug, name, is_general').eq('active', true).order('sort_order')
        if (error || !data?.length) throw error || new Error('vacío')
        return NextResponse.json({ data: data.map(r => ({ slug: r.slug, name: r.name, isGeneral: r.is_general })) })
    } catch {
        return NextResponse.json({ data: CABA_BARRIOS.map(b => ({ slug: b.slug, name: b.name, isGeneral: !!b.isGeneral })) })
    }
}
