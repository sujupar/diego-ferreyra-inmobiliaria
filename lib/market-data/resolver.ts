import type { SupabaseClient } from '@supabase/supabase-js'
import type { MarketDataForReport, NeighborhoodPrice, PropertyTypesCounts, StockComposition, EscriturasData } from './types'
import { findBySlug } from './neighborhoods'

export function sumPropertyTypes(rows: PropertyTypesCounts[]): PropertyTypesCounts {
    const acc: PropertyTypesCounts = { departamentos: 0, terrenos: 0, locales: 0, casas: 0, ph: 0, oficinas: 0, total: 0 }
    for (const r of rows) {
        for (const k of Object.keys(acc) as (keyof PropertyTypesCounts)[]) acc[k] = (acc[k] || 0) + (r[k] || 0)
    }
    return acc
}

interface CabaRow { period: string; stock: StockComposition | null; escrituras: EscriturasData | null; price_caba: NeighborhoodPrice | null }

/** Última fila CABA con period ≤ pedido; si no hay, la última que exista. */
async function resolveCaba(supabase: SupabaseClient, period: string): Promise<CabaRow | null> {
    const { data: exact } = await supabase.from('market_snapshot_caba')
        .select('period, stock, escrituras, price_caba')
        .lte('period', period).order('period', { ascending: false }).limit(1)
    if (exact?.length) return exact[0] as unknown as CabaRow
    const { data: any } = await supabase.from('market_snapshot_caba')
        .select('period, stock, escrituras, price_caba')
        .order('period', { ascending: false }).limit(1)
    return (any?.[0] as unknown as CabaRow) ?? null
}

export async function getMarketData(
    supabase: SupabaseClient, slug: string, period: string,
): Promise<MarketDataForReport | null> {
    const canonical = findBySlug(slug)
    if (!canonical) return null

    const caba = await resolveCaba(supabase, period)
    if (!caba) return null // sin snapshots → legacy

    let barrioPrice: NeighborhoodPrice | null = null
    let barrioTipos: PropertyTypesCounts | null = null
    let resolvedPeriod = caba.period

    if (canonical.isGeneral) {
        barrioPrice = caba.price_caba
        const { data: allRows } = await supabase.from('market_snapshot_neighborhood')
            .select('property_types').eq('period', caba.period)
        const tipos = (allRows || []).map(r => r.property_types).filter(Boolean) as PropertyTypesCounts[]
        barrioTipos = tipos.length ? sumPropertyTypes(tipos) : null
    } else {
        const { data: rows } = await supabase.from('market_snapshot_neighborhood')
            .select('period, price, property_types')
            .eq('neighborhood_slug', canonical.slug)
            .lte('period', period).order('period', { ascending: false }).limit(1)
        let row = rows?.[0]
        if (!row) {
            const { data: latest } = await supabase.from('market_snapshot_neighborhood')
                .select('period, price, property_types')
                .eq('neighborhood_slug', canonical.slug)
                .order('period', { ascending: false }).limit(1)
            row = latest?.[0]
        }
        if (row) {
            barrioPrice = (row.price as NeighborhoodPrice) ?? null
            barrioTipos = (row.property_types as PropertyTypesCounts) ?? null
            resolvedPeriod = row.period as string
        }
    }

    return {
        period, resolvedPeriod, cabaResolvedPeriod: caba.period,
        neighborhood: { slug: canonical.slug, name: canonical.name, isGeneral: !!canonical.isGeneral },
        caba: { stock: caba.stock, escrituras: caba.escrituras, price: caba.price_caba },
        barrio: { price: barrioPrice, propertyTypes: barrioTipos },
    }
}
