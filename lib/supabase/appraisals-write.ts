// lib/supabase/appraisals-write.ts
//
// Server-side write logic for appraisals. These functions take a Supabase
// client (the API routes pass the SERVICE ROLE client, which bypasses RLS)
// and perform the inserts/updates atomically.
//
// Why this lives apart from `appraisals.ts`:
//   - `appraisals.ts` uses the BROWSER client and is imported by client
//     components. Persisting client-side proved fragile (RLS edge cases,
//     non-atomic multi-table inserts leaving orphans, fire-and-forget requests
//     aborted by navigation, errors that never surfaced).
//   - The reliable pattern in this codebase is server-side writes with the
//     service role (see app/api/deals/route.ts). These helpers implement that
//     for appraisals, with compensating cleanup so a failed comparable insert
//     never leaves an orphan appraisal row.
//
// Atomicity note: Supabase JS has no multi-statement transaction, so we get
// EFFECTIVE atomicity via try/catch + compensating DELETE. This avoids a DB
// migration (and the "migration never applied" risk). A SECURITY DEFINER RPC
// could give true transactional atomicity later if needed.

import type { SupabaseClient } from '@supabase/supabase-js'
import { sanitizeValuationResultForStorage, type SaveAppraisalInput } from './appraisals'

/** Build the appraisal_comparables rows for the normal comparables. */
function buildComparableRows(appraisalId: string, input: SaveAppraisalInput) {
    const { comparables, valuationResult } = input
    return comparables.map((comp, index) => {
        const analysis = valuationResult.comparableAnalysis[index]
        const { property: _property, ...analysisData } = (analysis || {}) as any
        return {
            appraisal_id: appraisalId,
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
}

/** Build the rows for overpriced / purchase properties (tagged via analysis). */
function buildTaggedRows(
    appraisalId: string,
    props: SaveAppraisalInput['overpriced'] | SaveAppraisalInput['purchaseProperties'],
    propertyType: 'overpriced' | 'purchase',
    sortOffset: number,
) {
    return (props || []).map((prop, index) => ({
        appraisal_id: appraisalId,
        title: prop.title,
        location: prop.location,
        url: prop.url,
        price: prop.price,
        currency: prop.currency,
        description: prop.description,
        images: prop.images,
        features: prop.features as any,
        analysis: { propertyType } as any,
        sort_order: sortOffset + index,
    }))
}

/** Insert all comparable-family rows for an appraisal in a SINGLE statement.
 *  Comparables, overpriced y purchase van a la misma tabla, así que los
 *  insertamos juntos: 1 round-trip en vez de 3 y, al ser un único INSERT,
 *  no quedan filas parciales si falla (entran todas o ninguna). */
async function insertAllComparableRows(supabase: SupabaseClient, appraisalId: string, input: SaveAppraisalInput) {
    const allRows = [
        ...buildComparableRows(appraisalId, input),
        ...buildTaggedRows(appraisalId, input.overpriced, 'overpriced', 1000),
        ...buildTaggedRows(appraisalId, input.purchaseProperties, 'purchase', 2000),
    ]
    if (allRows.length > 0) {
        const { error } = await supabase.from('appraisal_comparables').insert(allRows)
        if (error) throw error
    }
}

/**
 * Create an appraisal + all its comparable rows atomically (effective).
 * If any comparable insert fails, the orphan appraisal (and any partial
 * comparable rows) are deleted before re-throwing, so we never persist a
 * half-saved appraisal.
 *
 * @returns the new appraisal id
 */
export async function insertAppraisalWithComparables(
    supabase: SupabaseClient,
    input: SaveAppraisalInput,
): Promise<string> {
    const { subject, comparables, valuationResult, notes, userId, origin, assignedTo } = input
    const leanValuation = sanitizeValuationResultForStorage(valuationResult)

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
            report_edits: (input.reportEdits ?? null) as never,
        })
        .select('id')
        .single()

    if (appraisalError) throw appraisalError
    const appraisalId = appraisal.id as string

    try {
        await insertAllComparableRows(supabase, appraisalId, input)
    } catch (err) {
        // Compensating cleanup — remove the orphan appraisal + any partial rows.
        // Si el propio cleanup falla, lo logueamos (Netlify logs) para poder
        // detectar/limpiar el huérfano manualmente — pero igual re-lanzamos el
        // error original que causó el fallo.
        const [delComps, delAppraisal] = await Promise.allSettled([
            supabase.from('appraisal_comparables').delete().eq('appraisal_id', appraisalId),
            supabase.from('appraisals').delete().eq('id', appraisalId),
        ])
        if (delComps.status === 'rejected' || delAppraisal.status === 'rejected') {
            console.error('[insertAppraisalWithComparables] cleanup falló — puede quedar un appraisal huérfano', {
                appraisalId, delComps, delAppraisal,
            })
        }
        throw err
    }

    return appraisalId
}

/**
 * Replace an existing appraisal's data and its comparable rows.
 * Updates the main row, then deletes & re-inserts all comparable-family rows
 * (same shape as the insert path).
 */
export async function replaceAppraisalComparables(
    supabase: SupabaseClient,
    id: string,
    input: SaveAppraisalInput,
): Promise<void> {
    const { subject, comparables, valuationResult, notes, origin, assignedTo } = input
    const leanValuation = sanitizeValuationResultForStorage(valuationResult)

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
    // Solo tocamos report_edits si el caller los provee. La página de detalle
    // edita features/rates SIN pasar reportEdits — si lo seteáramos a null acá,
    // borraríamos los textos personalizados del PDF en cada edición. (Mismo
    // patrón defensivo que origin/assigned_to.)
    if (input.reportEdits !== undefined) updatePayload.report_edits = input.reportEdits
    if (origin !== undefined) updatePayload.origin = origin || null
    if (assignedTo !== undefined) updatePayload.assigned_to = assignedTo || null

    const { error: updateError } = await supabase
        .from('appraisals')
        .update(updatePayload as never)
        .eq('id', id)
    if (updateError) throw updateError

    const { error: deleteError } = await supabase
        .from('appraisal_comparables')
        .delete()
        .eq('appraisal_id', id)
    if (deleteError) throw deleteError

    await insertAllComparableRows(supabase, id, input)
}
