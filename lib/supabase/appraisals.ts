import { createClient } from '@/lib/supabase/client'
import { ValuationResult, ValuationProperty } from '@/lib/valuation/calculator'
import { ScrapedProperty } from '@/lib/scraper/types'

// ---- Input/Output Types ----

export interface SaveAppraisalInput {
    subject: ScrapedProperty
    comparables: ScrapedProperty[]
    valuationResult: ValuationResult
    overpriced?: ScrapedProperty[]
    purchaseProperties?: ScrapedProperty[]
    notes?: string
    userId?: string
    origin?: string
    assignedTo?: string
}

export interface AppraisalSummary {
    id: string
    property_title: string | null
    property_location: string
    property_images: string[] | null
    publication_price: number
    currency: string | null
    comparable_count: number
    created_at: string
}

export interface AppraisalDetail {
    id: string
    property_title: string | null
    property_location: string
    property_description: string | null
    property_url: string | null
    property_price: number | null
    property_currency: string | null
    property_images: string[] | null
    property_features: any
    valuation_result: ValuationResult
    publication_price: number
    sale_value: number | null
    money_in_hand: number | null
    currency: string | null
    comparable_count: number
    created_at: string
    updated_at: string
    notes: string | null
    comparables: ComparableRow[]
}

interface ComparableRow {
    id: string
    title: string | null
    location: string | null
    url: string | null
    price: number | null
    currency: string | null
    description: string | null
    images: string[] | null
    features: any
    analysis: any
    sort_order: number
}

// ---- Helpers ----

/**
 * Sanitiza el ValuationResult para guardar en DB.
 *
 * El ValuationResult de runtime contiene `comparableAnalysis[i].property` con
 * el ScrapedProperty COMPLETO (incluyendo arrays de imágenes — URLs de portales
 * o data-URLs base64 si fueron cargadas localmente). Esos datos YA están
 * persistidos en la tabla `appraisal_comparables` (columna `images`/`features`/etc).
 *
 * Si guardamos el valuation_result tal cual:
 *   - Duplicamos todos los datos del comparable (varios MB potenciales con base64).
 *   - El payload del PATCH `appraisals` puede superar el límite del REST API
 *     de Supabase (default ~6MB) y devolver 500.
 *
 * Este helper devuelve un valuation_result "lean" sin el campo `property`
 * dentro de comparableAnalysis. Al cargar la tasación, el `property` se
 * reconstruye desde la tabla `appraisal_comparables` (ver getAppraisal).
 *
 * También elimina cualquier valor NaN/Infinity numérico que rompería JSONB.
 */
export function sanitizeValuationResultForStorage(vr: ValuationResult): ValuationResult {
    const lean: ValuationResult = {
        ...vr,
        comparableAnalysis: (vr.comparableAnalysis || []).map(a => {
            // Strip the nested `property` (ya está en appraisal_comparables).
            const { property: _property, ...rest } = a as unknown as Record<string, unknown>
            return rest as unknown as typeof a
        }),
    }
    // Sanear NaN/Infinity en campos numéricos
    return JSON.parse(JSON.stringify(lean, (_k, v) => {
        if (typeof v === 'number' && !Number.isFinite(v)) return null
        return v
    })) as ValuationResult
}

// ---- CRUD Functions ----

export async function saveAppraisal(input: SaveAppraisalInput): Promise<string> {
    const supabase = createClient()
    const { subject, comparables, valuationResult, notes, userId, origin, assignedTo } = input

    // Lean valuation_result para evitar payload gigante (ver helper).
    const leanValuation = sanitizeValuationResultForStorage(valuationResult)

    // Insert main appraisal
    const { data: appraisal, error: appraisalError } = await supabase
        .from('appraisals')
        .insert({
            user_id: userId || null,
            property_title: subject.title,
            property_location: subject.location,
            property_description: subject.description,
            property_url: subject.url,
            property_price: subject.price,
            property_currency: subject.currency,
            property_images: subject.images,
            property_features: subject.features as any,
            valuation_result: leanValuation as any,
            publication_price: leanValuation.publicationPrice,
            sale_value: leanValuation.saleValue,
            money_in_hand: leanValuation.moneyInHand,
            currency: leanValuation.currency,
            comparable_count: comparables.length,
            notes,
            origin: origin || null,
            assigned_to: assignedTo || null,
        })
        .select('id')
        .single()

    if (appraisalError) throw appraisalError

    // Insert comparables with their analysis data
    const comparableRows = comparables.map((comp, index) => {
        const analysis = valuationResult.comparableAnalysis[index]
        // Strip the nested property from analysis to avoid data duplication
        const { property: _property, ...analysisData } = analysis || {} as any

        return {
            appraisal_id: appraisal.id,
            title: comp.title,
            location: comp.location,
            url: comp.url,
            price: comp.price,
            currency: comp.currency,
            description: comp.description,
            images: comp.images,
            features: comp.features as any,
            analysis: analysisData as any,
            sort_order: index,
        }
    })

    if (comparableRows.length > 0) {
        const { error: compError } = await supabase
            .from('appraisal_comparables')
            .insert(comparableRows)
        if (compError) throw compError
    }

    // Insert overpriced properties (same table, marked via analysis field)
    const overpricedRows = (input.overpriced || []).map((prop, index) => ({
        appraisal_id: appraisal.id,
        title: prop.title,
        location: prop.location,
        url: prop.url,
        price: prop.price,
        currency: prop.currency,
        description: prop.description,
        images: prop.images,
        features: prop.features as any,
        analysis: { propertyType: 'overpriced' } as any,
        sort_order: 1000 + index,
    }))

    if (overpricedRows.length > 0) {
        const { error: opError } = await supabase
            .from('appraisal_comparables')
            .insert(overpricedRows)
        if (opError) throw opError
    }

    // Insert purchase properties (same table, marked via analysis field)
    const purchaseRows = (input.purchaseProperties || []).map((prop, index) => ({
        appraisal_id: appraisal.id,
        title: prop.title,
        location: prop.location,
        url: prop.url,
        price: prop.price,
        currency: prop.currency,
        description: prop.description,
        images: prop.images,
        features: prop.features as any,
        analysis: { propertyType: 'purchase' } as any,
        sort_order: 2000 + index,
    }))

    if (purchaseRows.length > 0) {
        const { error: purchaseError } = await supabase
            .from('appraisal_comparables')
            .insert(purchaseRows)
        if (purchaseError) throw purchaseError
    }

    return appraisal.id
}

export async function getAppraisals(
    page: number = 1,
    pageSize: number = 12,
    filters?: { from?: string; to?: string; assignedTo?: string }
): Promise<{ data: AppraisalSummary[]; count: number }> {
    const supabase = createClient()
    const rangeFrom = (page - 1) * pageSize
    const rangeTo = rangeFrom + pageSize - 1

    let query = supabase
        .from('appraisals')
        .select(
            'id, property_title, property_location, property_images, publication_price, currency, comparable_count, created_at',
            { count: 'exact' }
        )
        .order('created_at', { ascending: false })

    if (filters?.from) query = query.gte('created_at', filters.from + 'T00:00:00Z')
    if (filters?.to) query = query.lte('created_at', filters.to + 'T23:59:59Z')
    if (filters?.assignedTo) query = query.eq('assigned_to', filters.assignedTo)

    const { data, error, count } = await query.range(rangeFrom, rangeTo)

    if (error) throw error
    return { data: (data || []) as AppraisalSummary[], count: count || 0 }
}

export async function getAppraisal(id: string): Promise<AppraisalDetail | null> {
    const supabase = createClient()

    const [appraisalRes, comparablesRes] = await Promise.all([
        supabase.from('appraisals').select('*').eq('id', id).single(),
        supabase.from('appraisal_comparables').select('*').eq('appraisal_id', id).order('sort_order'),
    ])

    if (appraisalRes.error) {
        if (appraisalRes.error.code === 'PGRST116') return null // Not found
        throw appraisalRes.error
    }
    if (!appraisalRes.data) return null

    const allComparableRows = (comparablesRes.data || []) as ComparableRow[]
    const valuationResult = appraisalRes.data.valuation_result as unknown as ValuationResult

    // Rehidratar `comparableAnalysis[i].property` desde los rows correspondientes.
    // Como guardamos lean (sin `property`), el render del PDF/UI necesita la
    // referencia para mostrar título/imagen/etc. Match por sort_order: rows
    // 0..999 son comparables normales en orden.
    if (valuationResult?.comparableAnalysis?.length) {
        const normalRows = allComparableRows
            .filter(r => {
                const a = r.analysis as Record<string, unknown> | null
                return a?.propertyType !== 'overpriced' && a?.propertyType !== 'purchase'
            })
            .sort((a, b) => a.sort_order - b.sort_order)
        valuationResult.comparableAnalysis = valuationResult.comparableAnalysis.map((analysis, i) => {
            const row = normalRows[i]
            // CRÍTICO: si no hay row matching, devolver un property "vacío" en lugar
            // de undefined — algunos consumidores (ValuationReport) acceden a
            // `analysis.property.features` sin guard y crashearían.
            const property: ValuationProperty = row
                ? {
                    title: row.title || '',
                    location: row.location || '',
                    description: row.description || '',
                    url: row.url || '',
                    price: row.price ?? null,
                    currency: (row.currency as 'USD' | 'ARS' | null) ?? null,
                    images: row.images ?? [],
                    features: row.features || {},
                } as ValuationProperty
                : {
                    title: '',
                    location: '',
                    description: '',
                    url: '',
                    price: null,
                    currency: null,
                    images: [],
                    features: {},
                } as ValuationProperty
            return { ...analysis, property }
        })
    }

    return {
        ...appraisalRes.data,
        valuation_result: valuationResult,
        comparables: allComparableRows,
    } as AppraisalDetail
}

export async function deleteAppraisal(id: string): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase.from('appraisals').delete().eq('id', id)
    if (error) throw error
}

export async function updateAppraisal(id: string, input: SaveAppraisalInput): Promise<void> {
    const supabase = createClient()
    const { subject, comparables, valuationResult, notes, origin, assignedTo } = input

    // Lean valuation_result para evitar payload gigante (ver helper).
    const leanValuation = sanitizeValuationResultForStorage(valuationResult)

    // 1. Update main appraisal row.
    // origin and assigned_to are persisted on every update so the dropdowns
    // stay in sync after recalcs (otherwise a user changing the asesor and
    // clicking "Recalcular" would silently lose the change).
    const updatePayload: Record<string, unknown> = {
        property_title: subject.title,
        property_location: subject.location,
        property_description: subject.description,
        property_url: subject.url,
        property_price: subject.price,
        property_currency: subject.currency,
        property_images: subject.images,
        property_features: subject.features as any,
        valuation_result: leanValuation as any,
        publication_price: leanValuation.publicationPrice,
        sale_value: leanValuation.saleValue,
        money_in_hand: leanValuation.moneyInHand,
        currency: leanValuation.currency,
        comparable_count: comparables.length,
        notes,
    }
    if (origin !== undefined) updatePayload.origin = origin || null
    if (assignedTo !== undefined) updatePayload.assigned_to = assignedTo || null

    const { error: updateError } = await supabase
        .from('appraisals')
        .update(updatePayload)
        .eq('id', id)

    if (updateError) throw updateError

    // 2. Delete existing comparables (simpler than reconciling row-by-row)
    const { error: deleteError } = await supabase
        .from('appraisal_comparables')
        .delete()
        .eq('appraisal_id', id)

    if (deleteError) throw deleteError

    // 3. Re-insert comparables (same shape as saveAppraisal)
    const comparableRows = comparables.map((comp, index) => {
        const analysis = valuationResult.comparableAnalysis[index]
        const { property: _property, ...analysisData } = analysis || {} as any

        return {
            appraisal_id: id,
            title: comp.title,
            location: comp.location,
            url: comp.url,
            price: comp.price,
            currency: comp.currency,
            description: comp.description,
            images: comp.images,
            features: comp.features as any,
            analysis: analysisData as any,
            sort_order: index,
        }
    })

    if (comparableRows.length > 0) {
        const { error: compError } = await supabase
            .from('appraisal_comparables')
            .insert(comparableRows)
        if (compError) throw compError
    }

    // 4. Re-insert overpriced
    const overpricedRows = (input.overpriced || []).map((prop, index) => ({
        appraisal_id: id,
        title: prop.title,
        location: prop.location,
        url: prop.url,
        price: prop.price,
        currency: prop.currency,
        description: prop.description,
        images: prop.images,
        features: prop.features as any,
        analysis: { propertyType: 'overpriced' } as any,
        sort_order: 1000 + index,
    }))

    if (overpricedRows.length > 0) {
        const { error: opError } = await supabase
            .from('appraisal_comparables')
            .insert(overpricedRows)
        if (opError) throw opError
    }

    // 5. Re-insert purchase properties
    const purchaseRows = (input.purchaseProperties || []).map((prop, index) => ({
        appraisal_id: id,
        title: prop.title,
        location: prop.location,
        url: prop.url,
        price: prop.price,
        currency: prop.currency,
        description: prop.description,
        images: prop.images,
        features: prop.features as any,
        analysis: { propertyType: 'purchase' } as any,
        sort_order: 2000 + index,
    }))

    if (purchaseRows.length > 0) {
        const { error: purchaseError } = await supabase
            .from('appraisal_comparables')
            .insert(purchaseRows)
        if (purchaseError) throw purchaseError
    }
}
