import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchBryn } from './sources/bryn'
import { fetchInfogramComposition } from './sources/infogram'
import { fetchColegio } from './sources/colegio'
import { fetchZonapropTipos } from './sources/zonaprop'
import { CABA_BARRIOS, ALL_CABA_SLUGS } from './neighborhoods'
import type { StockComposition } from './types'

/** Merge superficial por clave: el patch pisa SOLO sus claves con valor no-nulo.
 *  Así un fallo parcial de fuentes nunca borra datos ya capturados del período. */
export function mergeJsonb<T extends Record<string, unknown>>(
    existing: T | null | undefined,
    patch: Record<string, unknown>,
): Record<string, unknown> {
    const base: Record<string, unknown> = { ...(existing || {}) }
    for (const [k, v] of Object.entries(patch)) {
        if (v !== null && v !== undefined) base[k] = v
    }
    return base
}

export function pickPendingSlugs(done: Set<string>, all: string[], limit: number): string[] {
    return all.filter(s => !done.has(s)).slice(0, limit)
}

/** true si el objeto es null/undefined/vacío o TODOS sus valores son null/undefined.
 *  Usado para detectar sub-objetos "degradados" (ej. fallback sin esa data) que
 *  NO deben pisar un sub-objeto ya capturado a nivel de clave superior. */
export function allNull(obj: Record<string, unknown> | null | undefined): boolean {
    if (!obj) return true
    return Object.values(obj).every(v => v === null || v === undefined)
}

async function writeState(
    supabase: SupabaseClient, id: 'core' | 'zonaprop', period: string,
    status: 'ok' | 'partial' | 'failed', error: string | null, stats: Record<string, unknown>,
) {
    const { error: e } = await supabase.from('market_data_refresh_state').upsert({
        id, period, last_run_at: new Date().toISOString(),
        last_status: status, last_error: error, last_stats: stats,
        updated_at: new Date().toISOString(),
    })
    if (e) console.error('[market-data] writeState falló', e)
}

export interface CoreStats {
    bryn: boolean; infogram: boolean; colegio: boolean; barriosUpserted: number; errors: string[]
    /** true cuando Bryn respondió OK pero cabaPrice llegó todo-null (fallback del
     *  mapa sin kpis) — se omitió el patch de price_caba a propósito para no pisar
     *  un valor bueno ya capturado. No es un error. */
    priceCabaSkipped?: boolean
}

/** Fuentes baratas: Bryn (precio 48 barrios + kpis) + Infogram (composición) +
 *  Colegio (escrituras: baja el JPEG a Storage). Corre diario (idempotente). */
export async function refreshCore(supabase: SupabaseClient, period: string): Promise<CoreStats> {
    const stats: CoreStats = { bryn: false, infogram: false, colegio: false, barriosUpserted: 0, errors: [] }
    try {
        const [bryn, infogram, colegio] = await Promise.all([fetchBryn(), fetchInfogramComposition(), fetchColegio()])

        // --- fila CABA existente (merge, no replace) ---
        const { data: existing } = await supabase.from('market_snapshot_caba')
            .select('stock, escrituras, price_caba, source_meta').eq('period', period).maybeSingle()

        const patch: Record<string, unknown> = {}
        const meta: Record<string, unknown> = { ...(existing?.source_meta || {}) }

        if (bryn.ok) {
            stats.bryn = true
            // Si Bryn cayó al fallback del mapa (sin kpis), cabaPrice viene todo-null.
            // No pisar un price_caba bueno ya capturado con un objeto degradado.
            if (!allNull(bryn.data.cabaPrice as unknown as Record<string, unknown>)) {
                patch.price_caba = bryn.data.cabaPrice
            } else {
                stats.priceCabaSkipped = true
            }
            // El stock combina kpis (Bryn) + composición (Infogram): merge sobre lo previo.
            const prevStock = (existing?.stock || {}) as Partial<StockComposition>
            patch.stock = mergeJsonb(prevStock as Record<string, unknown>, {
                stockDeptos: bryn.data.stockKpis.stockDeptos,
                stockVm: bryn.data.stockKpis.stockVm,
                absorcion: bryn.data.stockKpis.absorcion,
            })
            meta.bryn = { ok: true, actualizado: bryn.data.actualizado, at: new Date().toISOString() }
        } else { stats.errors.push(bryn.error); meta.bryn = { ok: false, error: bryn.error } }

        if (infogram.ok) {
            stats.infogram = true
            patch.stock = mergeJsonb((patch.stock || existing?.stock || {}) as Record<string, unknown>, {
                tipos: infogram.data.tipos, antiguedad: infogram.data.antiguedad,
                vendedor: infogram.data.vendedor, antPublicacion: infogram.data.antPublicacion,
                totalInmuebles: infogram.data.totalInmuebles,
            })
            meta.infogram = { ok: true, at: new Date().toISOString() }
        } else { stats.errors.push(infogram.error); meta.infogram = { ok: false, error: infogram.error } }

        if (colegio.ok) {
            stats.colegio = true
            let imageUrl: string | null = null
            if (colegio.data.imageSourceUrl) {
                try {
                    const img = await fetch(colegio.data.imageSourceUrl, { signal: AbortSignal.timeout(30_000) })
                    if (img.ok) {
                        const buf = Buffer.from(await img.arrayBuffer())
                        const path = `escrituras/${period}.jpg`
                        const { error: upErr } = await supabase.storage.from('market-data')
                            .upload(path, buf, { contentType: 'image/jpeg', upsert: true })
                        if (!upErr) imageUrl = supabase.storage.from('market-data').getPublicUrl(path).data.publicUrl
                        else stats.errors.push(`storage escrituras: ${upErr.message}`)
                    }
                } catch (e) { stats.errors.push(`descarga imagen colegio: ${(e as Error).message}`) }
            }
            const { imageSourceUrl: _drop, ...rest } = colegio.data
            // Merge campo por campo con lo ya capturado: si la descarga/upload de la
            // imagen falla en esta corrida (imageUrl null), NO pisa un imageUrl bueno
            // de una corrida anterior del mismo período.
            patch.escrituras = mergeJsonb((existing?.escrituras as Record<string, unknown>) || {}, { ...rest, imageUrl })
            meta.colegio = { ok: true, at: new Date().toISOString() }
        } else { stats.errors.push(colegio.error); meta.colegio = { ok: false, error: colegio.error } }

        if (Object.keys(patch).length > 0) {
            const { error: upErr } = await supabase.from('market_snapshot_caba')
                .upsert({ period, ...mergeJsonb(existing as Record<string, unknown> | null, patch), source_meta: meta, captured_at: new Date().toISOString() }, { onConflict: 'period' })
            if (upErr) throw new Error(`upsert caba: ${upErr.message}`)
        }

        // --- precio por barrio (48 filas) ---
        if (bryn.ok) {
            const { data: nbRows, error: nbErr } = await supabase.from('neighborhoods').select('id, slug')
            if (nbErr || !nbRows?.length) throw new Error(`neighborhoods: ${nbErr?.message || 'vacía — ¿corriste las migraciones?'}`)
            const idBySlug = new Map(nbRows.map(r => [r.slug as string, r.id as string]))

            // Fila previa del período por barrio: el fallback del mapa trae
            // usado/pozo/estrenar/alq2amb en null — merge campo por campo para no
            // pisar valores buenos ya capturados de una corrida con el JSON completo.
            const { data: existingRows } = await supabase.from('market_snapshot_neighborhood')
                .select('neighborhood_slug, price').eq('period', period)
            const prevBySlug = new Map((existingRows || []).map(r => [r.neighborhood_slug as string, r.price]))

            const rows = bryn.data.barrios
                .filter(b => idBySlug.has(b.slug))
                .map(b => ({
                    neighborhood_id: idBySlug.get(b.slug)!, neighborhood_slug: b.slug, period,
                    price: mergeJsonb(
                        (prevBySlug.get(b.slug) as Record<string, unknown> | null) || {},
                        b.price as unknown as Record<string, unknown>,
                    ),
                    captured_at: new Date().toISOString(),
                }))
            const { error: bErr } = await supabase.from('market_snapshot_neighborhood')
                .upsert(rows, { onConflict: 'neighborhood_id,period' })
            if (bErr) throw new Error(`upsert barrios: ${bErr.message}`)
            stats.barriosUpserted = rows.length
        }

        const status = stats.errors.length === 0 ? 'ok' : (stats.bryn || stats.infogram || stats.colegio) ? 'partial' : 'failed'
        await writeState(supabase, 'core', period, status, stats.errors.join(' | ') || null, stats as unknown as Record<string, unknown>)
        return stats
    } catch (e) {
        stats.errors.push((e as Error).message)
        await writeState(supabase, 'core', period, 'failed', stats.errors.join(' | '), stats as unknown as Record<string, unknown>)
        return stats
    }
}

export interface ZonapropStats { processed: number; okCount: number; pending: number; errors: string[] }

/** Lote de tipos-de-propiedad: hasta `limit` barrios pendientes del período,
 *  concurrencia 4. Auto-completable corriendo cada 2h. */
export async function refreshZonaprop(supabase: SupabaseClient, period: string, limit = 12): Promise<ZonapropStats> {
    const stats: ZonapropStats = { processed: 0, okCount: 0, pending: 0, errors: [] }
    try {
        const { data: doneRows, error: qErr } = await supabase.from('market_snapshot_neighborhood')
            .select('neighborhood_slug, property_types').eq('period', period)
        if (qErr) throw new Error(qErr.message)
        const done = new Set((doneRows || []).filter(r => r.property_types).map(r => r.neighborhood_slug as string))
        const targets = pickPendingSlugs(done, ALL_CABA_SLUGS, limit)
        stats.pending = ALL_CABA_SLUGS.length - done.size - targets.length

        const { data: nbRows } = await supabase.from('neighborhoods').select('id, slug, zonaprop_slug')
        const bySlug = new Map((nbRows || []).map(r => [r.slug as string, r]))

        const CONCURRENCY = 4
        for (let i = 0; i < targets.length; i += CONCURRENCY) {
            const batch = targets.slice(i, i + CONCURRENCY)
            const results = await Promise.all(batch.map(async slug => {
                const nb = bySlug.get(slug)
                const zp = (nb?.zonaprop_slug as string) || CABA_BARRIOS.find(b => b.slug === slug)?.zonapropSlug || slug
                return { slug, nb, result: await fetchZonapropTipos(zp) }
            }))
            for (const { slug, nb, result } of results) {
                stats.processed++
                if (result.ok && nb) {
                    const { error: uErr } = await supabase.from('market_snapshot_neighborhood').upsert({
                        neighborhood_id: nb.id, neighborhood_slug: slug, period,
                        property_types: result.data, captured_at: new Date().toISOString(),
                    }, { onConflict: 'neighborhood_id,period' })
                    if (uErr) stats.errors.push(`${slug}: upsert ${uErr.message}`)
                    else stats.okCount++
                } else if (!result.ok) stats.errors.push(result.error)
            }
        }
        const status = stats.errors.length === 0 ? 'ok' : stats.okCount > 0 ? 'partial' : (stats.processed === 0 ? 'ok' : 'failed')
        await writeState(supabase, 'zonaprop', period, status, stats.errors.slice(0, 5).join(' | ') || null,
            { ...stats, doneTotal: done.size + stats.okCount, total: ALL_CABA_SLUGS.length })
        return stats
    } catch (e) {
        stats.errors.push((e as Error).message)
        await writeState(supabase, 'zonaprop', period, 'failed', stats.errors.join(' | '), stats as unknown as Record<string, unknown>)
        return stats
    }
}
