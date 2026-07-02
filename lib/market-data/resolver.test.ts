import { describe, it, expect } from 'vitest'
import { getMarketData, sumPropertyTypes } from './resolver'

// Fake client: .from(t).select().eq()... — resolvemos por tabla con datos en memoria.
function fakeSupabase(cabaRows: any[], nbRows: any[]) {
    const mk = (rows: any[]) => {
        const q: any = {
            _rows: rows, _filters: [] as Array<(r: any) => boolean>,
            select() { return q },
            eq(col: string, val: any) { q._filters.push((r: any) => r[col] === val); return q },
            lte(col: string, val: any) { q._filters.push((r: any) => r[col] <= val); return q },
            order(col: string, { ascending }: any = { ascending: true }) {
                q._rows = [...q._rows].sort((a, b) => (a[col] < b[col] ? -1 : 1) * (ascending ? 1 : -1)); return q
            },
            limit(n: number) { q._limit = n; return q },
            maybeSingle() { const r = q._apply(); return Promise.resolve({ data: r[0] ?? null, error: null }) },
            then(res: any) { return Promise.resolve({ data: q._apply(), error: null }).then(res) },
            _apply() { let r = q._rows.filter((row: any) => q._filters.every((f: any) => f(row))); if (q._limit) r = r.slice(0, q._limit); return r },
        }
        return q
    }
    return { from: (t: string) => mk(t === 'market_snapshot_caba' ? cabaRows : nbRows) } as any
}

const CABA = [{ period: '2026-06-01', stock: { stockDeptos: 79000 }, escrituras: { cantidad: 5435 }, price_caba: { prom: 2462 } }]
const NB = [
    { neighborhood_slug: 'palermo', period: '2026-06-01', price: { prom: 3403, deptos: 13892 }, property_types: { departamentos: 15983, total: 18360 } },
    { neighborhood_slug: 'recoleta', period: '2026-06-01', price: { prom: 3100 }, property_types: { departamentos: 6980, total: 7800 } },
]

describe('getMarketData', () => {
    it('resuelve barrio + caba para el período exacto', async () => {
        const d = await getMarketData(fakeSupabase(CABA, NB), 'palermo', '2026-06-01')
        expect(d?.neighborhood.name).toBe('Palermo')
        expect(d?.barrio.price?.prom).toBe(3403)
        expect(d?.caba.stock?.stockDeptos).toBe(79000)
        expect(d?.resolvedPeriod).toBe('2026-06-01')
    })
    it('fallback: período pedido sin datos → sirve el último disponible', async () => {
        const d = await getMarketData(fakeSupabase(CABA, NB), 'palermo', '2026-08-01')
        expect(d?.barrio.price?.prom).toBe(3403)
        expect(d?.resolvedPeriod).toBe('2026-06-01')
        expect(d?.period).toBe('2026-08-01')
    })
    it('general: precio = CABA y tipos = suma de todos los barrios', async () => {
        const d = await getMarketData(fakeSupabase(CABA, NB), 'general', '2026-06-01')
        expect(d?.neighborhood.isGeneral).toBe(true)
        expect(d?.barrio.price?.prom).toBe(2462)
        expect(d?.barrio.propertyTypes?.departamentos).toBe(15983 + 6980)
    })
    it('sin ningún snapshot → null (caller usa legacy)', async () => {
        expect(await getMarketData(fakeSupabase([], []), 'palermo', '2026-06-01')).toBeNull()
    })
    it('slug desconocido → null', async () => {
        expect(await getMarketData(fakeSupabase(CABA, NB), 'narnia', '2026-06-01')).toBeNull()
    })
    it('períodos divergentes: caba y barrio resuelven fallbacks distintos → cabaResolvedPeriod no se pisa', async () => {
        const cabaMay = [{ period: '2026-05-01', stock: { stockDeptos: 70000 }, escrituras: { cantidad: 5000 }, price_caba: { prom: 2400 } }]
        const nbJune = [
            { neighborhood_slug: 'palermo', period: '2026-06-01', price: { prom: 3500 }, property_types: { departamentos: 16000, total: 18500 } },
        ]
        const d = await getMarketData(fakeSupabase(cabaMay, nbJune), 'palermo', '2026-06-01')
        expect(d?.resolvedPeriod).toBe('2026-06-01')
        expect(d?.cabaResolvedPeriod).toBe('2026-05-01')
        expect(d?.caba.stock?.stockDeptos).toBe(70000)
        expect(d?.barrio.price?.prom).toBe(3500)
    })
})

describe('sumPropertyTypes', () => {
    it('suma con nulls', () => {
        const s = sumPropertyTypes([{ departamentos: 10, terrenos: null, locales: 1, casas: 2, ph: null, oficinas: 3, total: 16 },
                                    { departamentos: 5, terrenos: 1, locales: null, casas: 0, ph: 2, oficinas: 0, total: 8 }])
        expect(s).toEqual({ departamentos: 15, terrenos: 1, locales: 1, casas: 2, ph: 2, oficinas: 3, total: 24 })
    })
})
