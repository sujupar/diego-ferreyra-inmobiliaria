import { createClient } from '@/lib/supabase/client'
import { ValuationResult, ValuationProperty } from '@/lib/valuation/calculator'
import { ScrapedProperty } from '@/lib/scraper/types'
import type { ReportEdits } from '@/lib/types/report-edits'

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
    reportEdits?: ReportEdits
    /** Si se provee, el endpoint POST vincula la tasación a este proceso (deal)
     *  en la misma request (sin avanzar el stage). Solo aplica al primer insert. */
    dealId?: string
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
    contact_id: string | null
    assigned_to: string | null
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
    report_edits: ReportEdits | null
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

/**
 * Construye un Error enriquecido con code/details/hint a partir de la respuesta
 * de los endpoints, para que los consumidores (banner del wizard) muestren el
 * detalle real del fallo igual que antes (cuando el error venía de PostgREST).
 */
function buildApiError(data: Record<string, unknown> | null, fallback: string): Error {
    const err = new Error((data?.error as string) || fallback) as Error & {
        code?: string; details?: string; hint?: string
    }
    if (data?.code) err.code = String(data.code)
    if (data?.detail) err.details = String(data.detail)
    if (data?.hint) err.hint = String(data.hint)
    return err
}

/**
 * Crea una tasación. Persiste SERVER-SIDE vía `POST /api/appraisals`
 * (service role, atómico con cleanup compensatorio). Si `input.dealId` está
 * presente, el endpoint vincula la tasación al proceso en la misma request.
 *
 * Mantiene la firma original (`Promise<string>` con el id) para no romper a los
 * consumidores existentes.
 */
export async function saveAppraisal(input: SaveAppraisalInput): Promise<string> {
    const res = await fetch('/api/appraisals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.id) {
        throw buildApiError(data, 'No se pudo guardar la tasación')
    }
    return data.id as string
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

    // Cast via unknown porque los tipos generados de Supabase aún no incluyen
    // `report_edits` (se agrega vía migración). El runtime ya devuelve el campo
    // si la columna existe; si no, queda undefined y el consumer lo trata como null.
    const row = appraisalRes.data as Record<string, unknown>
    return {
        ...appraisalRes.data,
        valuation_result: valuationResult,
        report_edits: (row.report_edits as ReportEdits | null | undefined) ?? null,
        comparables: allComparableRows,
    } as unknown as AppraisalDetail
}

export async function deleteAppraisal(id: string): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase.from('appraisals').delete().eq('id', id)
    if (error) throw error
}

/**
 * Actualiza una tasación existente. Persiste SERVER-SIDE vía
 * `PUT /api/appraisals/[id]` (service role: update row + replace comparables).
 * Mantiene la firma original (`Promise<void>`).
 */
export async function updateAppraisal(id: string, input: SaveAppraisalInput): Promise<void> {
    const res = await fetch(`/api/appraisals/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
    })
    if (!res.ok) {
        const data = await res.json().catch(() => null)
        throw buildApiError(data, 'No se pudo actualizar la tasación')
    }
}
