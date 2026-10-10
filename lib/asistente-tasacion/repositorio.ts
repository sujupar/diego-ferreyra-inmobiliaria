/**
 * Lectura y escritura del asistente en la base. Corre SOLO en el servidor, con
 * service role, detrás de los candados de acceso de las rutas.
 *
 * REGLA (CLAUDE.md, caída del 2026-10-10): nunca se pide `property_images` ni
 * `select('*')` de `appraisals`: son fotos base64 de hasta 4,7 MB por fila.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateValuation, type ValuationFeatures, type ValuationProperty, type ValuationResult } from '../valuation/calculator'
import { completarValuacion } from '../valuation/completar-valuacion'
import { comparablesNormales, filaAPropiedad, preciosDesnormalizados, type FilaComparable } from '../valuation/valuacion-activa'
import { sanitizeValuationResultForStorage } from '../supabase/appraisals'
import type { AiValuationResult, ValuationSource } from '../valuation/ia-tipos'
import type { ReportEdits } from '../types/report-edits'
import type { BloqueRespuesta, PropuestaDeAjuste } from './respuesta'
import type { OtraTasacion } from './contexto'

export const BUCKET_ADJUNTOS = 'appraisal-chat'

const COLUMNAS_TASACION = 'id, property_title, property_location, property_description, property_price, property_currency, property_features, valuation_result, ai_valuation_result, valuation_source, report_edits, neighborhood_slug, market_period, created_at'
const COLUMNAS_COMPARABLE = 'id, title, location, url, price, currency, description, features, analysis, sort_order'

export interface FilaTasacionAsistente {
    id: string
    property_title: string | null
    property_location: string
    property_description: string | null
    property_price: number | null
    property_currency: string | null
    property_features: ValuationFeatures | null
    valuation_result: ValuationResult | null
    ai_valuation_result: AiValuationResult | null
    valuation_source: ValuationSource
    report_edits: ReportEdits | null
    neighborhood_slug: string | null
    market_period: string | null
    created_at: string
}

export type FilaComparableConId = FilaComparable & { id: string }

export interface DatosTasacion {
    fila: FilaTasacionAsistente
    sujeto: ValuationProperty
    normales: FilaComparableConId[]
}

export async function cargarTasacion(sb: SupabaseClient, id: string): Promise<DatosTasacion | null> {
    const [t, c] = await Promise.all([
        sb.from('appraisals').select(COLUMNAS_TASACION).eq('id', id).maybeSingle(),
        sb.from('appraisal_comparables').select(COLUMNAS_COMPARABLE).eq('appraisal_id', id).order('sort_order'),
    ])
    if (t.error) throw t.error
    if (c.error) throw c.error
    if (!t.data) return null
    const fila = t.data as unknown as FilaTasacionAsistente
    const sujeto: ValuationProperty = {
        title: fila.property_title ?? '', location: fila.property_location, description: fila.property_description ?? '',
        price: fila.property_price, currency: fila.property_currency, features: fila.property_features ?? {},
    }
    return { fila, sujeto, normales: comparablesNormales((c.data ?? []) as unknown as FilaComparable[]) as FilaComparableConId[] }
}

/** Otras tasaciones del mismo barrio de los últimos 12 meses, resumidas (columnas puntuales). */
export async function otrasDelBarrio(sb: SupabaseClient, fila: FilaTasacionAsistente): Promise<OtraTasacion[]> {
    if (!fila.neighborhood_slug) return []
    const desde = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString()
    const { data, error } = await sb.from('appraisals')
        .select('id, property_title, property_location, created_at, publication_price, superficie:valuation_result->subjectSurface, precio_m2:valuation_result->subjectPriceM2')
        .eq('neighborhood_slug', fila.neighborhood_slug).neq('id', fila.id).gte('created_at', desde)
        .not('property_title', 'ilike', '[TEST%').order('created_at', { ascending: false }).limit(15)
    if (error) throw error
    return ((data ?? []) as unknown as { property_title: string | null; property_location: string; created_at: string; publication_price: number | null; superficie: number | null; precio_m2: number | null }[])
        .filter(o => o.publication_price)
        .map(o => ({
            titulo: o.property_title || o.property_location, barrio: fila.neighborhood_slug, fecha: o.created_at.slice(0, 10),
            publicacion: o.publication_price ?? 0, superficie: Math.round((o.superficie ?? 0) * 10) / 10, precioM2: Math.round(o.precio_m2 ?? 0),
        }))
}

/* ------------------------------- hilos y mensajes ------------------------------- */

export interface Hilo { id: string; appraisal_id: string; title: string; created_by: string | null; created_at: string; updated_at: string; archived_at: string | null }

export interface Adjunto { path: string; tipo: 'imagen' | 'pdf'; nombre: string; tamano: number }

export interface Mensaje {
    id: string; thread_id: string; role: 'user' | 'assistant'; texto: string
    bloques: BloqueRespuesta[] | null; adjuntos: Adjunto[]
    propuesta: (PropuestaDeAjuste & { antes?: number; despues?: number }) | null
    propuesta_aplicada_at: string | null; status: 'ok' | 'failed'; error: string | null
    model: string | null; created_by: string | null; created_at: string
}

const COLUMNAS_MENSAJE = 'id, thread_id, role, texto, bloques, adjuntos, propuesta, propuesta_aplicada_at, status, error, model, created_by, created_at'

export async function listarHilos(sb: SupabaseClient, appraisalId: string): Promise<Hilo[]> {
    const { data, error } = await sb.from('appraisal_chat_threads').select('*')
        .eq('appraisal_id', appraisalId).is('archived_at', null).order('updated_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as Hilo[]
}

export async function crearHilo(sb: SupabaseClient, appraisalId: string, usuarioId: string): Promise<Hilo> {
    const { data, error } = await sb.from('appraisal_chat_threads')
        .insert({ appraisal_id: appraisalId, created_by: usuarioId }).select('*').single()
    if (error) throw error
    return data as Hilo
}

/** El hilo, solo si pertenece a esa tasación (evita leer hilos ajenos cambiando el id). */
export async function hiloDeTasacion(sb: SupabaseClient, appraisalId: string, hiloId: string): Promise<Hilo | null> {
    const { data, error } = await sb.from('appraisal_chat_threads').select('*')
        .eq('id', hiloId).eq('appraisal_id', appraisalId).maybeSingle()
    if (error) throw error
    return (data as Hilo | null) ?? null
}

export async function actualizarHilo(sb: SupabaseClient, hiloId: string, cambios: { title?: string; archived_at?: string | null }): Promise<void> {
    const { error } = await sb.from('appraisal_chat_threads').update({ ...cambios, updated_at: new Date().toISOString() }).eq('id', hiloId)
    if (error) throw error
}

export async function listarMensajes(sb: SupabaseClient, hiloId: string): Promise<Mensaje[]> {
    const { data, error } = await sb.from('appraisal_chat_messages').select(COLUMNAS_MENSAJE)
        .eq('thread_id', hiloId).order('created_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as unknown as Mensaje[]
}

export async function mensajeDeHilo(sb: SupabaseClient, hiloId: string, mensajeId: string): Promise<Mensaje | null> {
    const { data, error } = await sb.from('appraisal_chat_messages').select(COLUMNAS_MENSAJE)
        .eq('id', mensajeId).eq('thread_id', hiloId).maybeSingle()
    if (error) throw error
    return (data as unknown as Mensaje | null) ?? null
}

export async function guardarMensaje(sb: SupabaseClient, m: Partial<Mensaje> & { thread_id: string; role: 'user' | 'assistant'; usage?: unknown }): Promise<Mensaje> {
    const { data, error } = await sb.from('appraisal_chat_messages').insert(m).select(COLUMNAS_MENSAJE).single()
    if (error) throw error
    await sb.from('appraisal_chat_threads').update({ updated_at: new Date().toISOString() }).eq('id', m.thread_id)
    return data as unknown as Mensaje
}

export async function marcarPropuestaAplicada(sb: SupabaseClient, mensajeId: string, usuarioId: string): Promise<void> {
    const { error } = await sb.from('appraisal_chat_messages')
        .update({ propuesta_aplicada_at: new Date().toISOString(), propuesta_aplicada_por: usuarioId }).eq('id', mensajeId)
    if (error) throw error
}

/* ------------------------------- aplicar propuesta ------------------------------- */

/**
 * Aplica una propuesta a la tasación: cambia SOLO ese dato (del sujeto o de un
 * comparable), recalcula con la calculadora y guarda el resultado, igual que una
 * edición en línea. No pasa por el guardado completo de la ficha porque ese
 * borra y reinserta todos los comparables y reenvía las fotos.
 */
export async function aplicarPropuestaEnTasacion(sb: SupabaseClient, d: DatosTasacion, p: PropuestaDeAjuste): Promise<{ antes: number; despues: number }> {
    const anterior = d.fila.valuation_result
    if (!anterior) throw new Error('La tasación no tiene resultado calculado')
    const comparables = d.normales.map(r => filaAPropiedad(r))
    const nuevoSujeto = p.objetivo === 'sujeto' ? { ...d.sujeto, features: { ...d.sujeto.features, [p.campo]: p.valor } } : d.sujeto
    if (p.objetivo === 'comparable') {
        const i = p.indice ?? -1
        if (!comparables[i]) throw new Error('El comparable de la propuesta no existe')
        comparables[i] = { ...comparables[i], features: { ...comparables[i].features, [p.campo]: p.valor } }
    }
    const base = calculateValuation({ subject: nuevoSujeto, comparables, expenseRates: anterior.expenseRates })
    if (!base) throw new Error('Con ese cambio la tasación no se puede calcular')
    const nuevo = sanitizeValuationResultForStorage(completarValuacion(base, {
        ownerSharePercent: anterior.ownerSharePercent ?? 100,
        purchaseScenarios: anterior.purchaseScenarios ?? [],
        selectedScenarioIds: anterior.selectedScenarioIds ?? [],
        previousPurchaseResult: anterior.purchaseResult,
    }))

    if (p.objetivo === 'comparable') {
        const fila = d.normales[p.indice ?? -1]
        const { property: _p, ...analisis } = nuevo.comparableAnalysis[p.indice ?? -1] ?? {}
        const { error } = await sb.from('appraisal_comparables')
            .update({ features: comparables[p.indice ?? -1].features, analysis: { ...(fila.analysis ?? {}), ...analisis } } as never)
            .eq('id', fila.id)
        if (error) throw error
    }
    const cambios: Record<string, unknown> = { valuation_result: nuevo }
    if (p.objetivo === 'sujeto') cambios.property_features = nuevoSujeto.features
    // Los precios del listado siguen al tasador EN USO (mismo criterio que appraisals-write).
    if (d.fila.valuation_source === 'calculator') Object.assign(cambios, preciosDesnormalizados(nuevo))
    const { error } = await sb.from('appraisals').update(cambios as never).eq('id', d.fila.id)
    if (error) throw error
    return { antes: anterior.publicationPrice, despues: nuevo.publicationPrice }
}
