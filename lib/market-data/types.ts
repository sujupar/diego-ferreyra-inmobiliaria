/** Contrato central de Datos de Mercado. Las fuentes (sources/*) PRODUCEN estas
 *  estructuras; el resolver las SIRVE; el PDF y la UI las CONSUMEN. Los jsonb de
 *  las tablas market_snapshot_* guardan exactamente estas formas (camelCase). */

export interface CompositionSlice { label: string; pct: number; count?: number | null }

export interface StockComposition {
    stockDeptos: number | null        // kpis.stock_deptos
    stockVm: number | null            // kpis.stock_vm (decimal, ej 0.0297)
    absorcion: number | null          // kpis.absorcion (meses)
    totalInmuebles: number | null     // total tabla tipos (si el Infogram lo trae)
    tipos: CompositionSlice[]         // 9 tipos (Casa, Departamentos, ..., Otros)
    antiguedad: CompositionSlice[]
    vendedor: CompositionSlice[]
    antPublicacion: CompositionSlice[]
}

export interface EscriturasData {
    mesLabel: string                  // "Mayo 2026" (del título del artículo)
    cantidad: number | null           // 5435
    varInteranual: number | null      // decimal, ej -0.031
    montoTexto: string | null         // "$848.932 millones"
    hipotecas: number | null
    articleUrl: string
    imageUrl: string | null           // publicUrl en Storage (bucket market-data)
    summary: string                   // resumen listo para el PDF
}

export interface NeighborhoodPrice {
    prom: number | null; vm: number | null; via: number | null
    usado: number | null; pozo: number | null; estrenar: number | null
    alq2amb: number | null; renta: number | null; deptos: number | null
}

export interface PropertyTypesCounts {
    departamentos: number | null; terrenos: number | null; locales: number | null
    casas: number | null; ph: number | null; oficinas: number | null
    total: number | null
}

/** Lo que recibe el PDF/UI para UNA tasación. */
export interface MarketDataForReport {
    /** Período pedido (congelado en la tasación) y el efectivamente servido. */
    period: string
    resolvedPeriod: string
    neighborhood: { slug: string; name: string; isGeneral: boolean }
    caba: {
        stock: StockComposition | null
        escrituras: EscriturasData | null
        price: NeighborhoodPrice | null   // panel de precios CABA-wide (para General)
    }
    barrio: {
        price: NeighborhoodPrice | null
        propertyTypes: PropertyTypesCounts | null
    }
}

/** Resultado uniforme de cada fuente en la ingesta. */
export type SourceResult<T> =
    | { ok: true; data: T }
    | { ok: false; error: string }

export interface BrynBarrioRow { slug: string; name: string; price: NeighborhoodPrice }
export interface BrynParsed {
    actualizado: string | null
    cabaPrice: NeighborhoodPrice
    stockKpis: Pick<StockComposition, 'stockDeptos' | 'stockVm' | 'absorcion'>
    extraOferta: { terrenos: number | null; locales: number | null; oficinas: number | null }
    barrios: BrynBarrioRow[]
}
