import { createClient } from '@/lib/supabase/client'
import { ValuationResult, ValuationProperty } from '@/lib/valuation/calculator'
import { ScrapedProperty } from '@/lib/scraper/types'

// ---- Input/Output Types ----

export interface SaveAppraisalInput {
    subject: ScrapedProperty
    comparables: ScrapedProperty[]
    valuationResult: ValuationResult
    overpriced?: ScrapedProperty[]
    notes?: string
    userId?: string
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

// ---- CRUD Functions ----

export async function saveAppraisal(input: SaveAppraisalInput): Promise<string> {
    const supabase = createClient()
    const { subject, comparables, valuationResult, notes, userId } = input

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
            valuation_result: valuationResult as any,
            publication_price: valuationResult.publicationPrice,
            sale_value: valuationResult.saleValue,
            money_in_hand: valuationResult.moneyInHand,
            currency: valuationResult.currency,
            comparable_count: comparables.length,
            notes,
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

    return appraisal.id
}

export async function getAppraisals(
    page: number = 1,
    pageSize: number = 12
): Promise<{ data: AppraisalSummary[]; count: number }> {
    const supabase = createClient()
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, error, count } = await supabase
        .from('appraisals')
        .select(
            'id, property_title, property_location, property_images, publication_price, currency, comparable_count, created_at',
            { count: 'exact' }
        )
        .order('created_at', { ascending: false })
        .range(from, to)

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

    return {
        ...appraisalRes.data,
        valuation_result: appraisalRes.data.valuation_result as unknown as ValuationResult,
        comparables: (comparablesRes.data || []) as ComparableRow[],
    } as AppraisalDetail
}

export async function deleteAppraisal(id: string): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase.from('appraisals').delete().eq('id', id)
    if (error) throw error
}

export async function updateAppraisal(id: string, input: SaveAppraisalInput): Promise<void> {
    const supabase = createClient()
    const { subject, comparables, valuationResult, notes } = input

    // 1. Update main appraisal row
    const { error: updateError } = await supabase
        .from('appraisals')
        .update({
            property_title: subject.title,
            property_location: subject.location,
            property_description: subject.description,
            property_url: subject.url,
            property_price: subject.price,
            property_currency: subject.currency,
            property_images: subject.images,
            property_features: subject.features as any,
            valuation_result: valuationResult as any,
            publication_price: valuationResult.publicationPrice,
            sale_value: valuationResult.saleValue,
            money_in_hand: valuationResult.moneyInHand,
            currency: valuationResult.currency,
            comparable_count: comparables.length,
            notes,
        })
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
}
