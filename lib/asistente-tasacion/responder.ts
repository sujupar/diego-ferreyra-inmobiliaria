/**
 * Una respuesta del asistente: contexto de la tasación + historial + adjuntos →
 * UNA llamada al modelo (regla dura de CLAUDE.md) → bloques validados.
 *
 * Las dependencias externas (modelo, Storage, mercado) se inyectan para poder
 * probar el armado sin red.
 */
import { textoConPrecio } from '../types/report-edits'
import { formatCurrency } from '../valuation/utils'
import { filaAPropiedad, rehidratar } from '../valuation/valuacion-activa'
import { resumenCorrecciones } from '../valuation/distancia-tasadores'
import { armarContexto, type OtraTasacion } from './contexto'
import { recortarHistorial } from './historial'
import { PROMPT_ASISTENTE } from './prompt'
import { precioConPropuesta } from './propuesta'
import { validarRespuesta, ErrorRespuestaAsistente, type BloqueRespuesta, type PropuestaDeAjuste } from './respuesta'
import type { Adjunto, DatosTasacion, Mensaje } from './repositorio'
import type { AdjuntoParaModelo, RespuestaMultimodal } from '../ai/chat-multimodal'

/** Presupuesto del historial que se reenvía al modelo (caracteres). */
const MAX_HISTORIAL = 12_000

export interface DependenciasResponder {
    pedir: (e: { system: string; historial: { role: 'user' | 'assistant'; texto: string }[]; mensaje: string; adjuntos: AdjuntoParaModelo[] }) => Promise<RespuestaMultimodal>
    descargarAdjunto: (a: Adjunto) => Promise<AdjuntoParaModelo>
    mercado?: () => Promise<string | undefined>
}

export interface RespuestaArmada {
    bloques: BloqueRespuesta[]
    propuesta: (PropuestaDeAjuste & { antes: number; despues: number }) | null
    model: string
    usage?: RespuestaMultimodal['usage']
}

/** Cómo se ve una respuesta anterior del asistente en el historial: su texto, no el JSON. */
export function textoDeBloques(bloques: BloqueRespuesta[] | null): string {
    return (bloques ?? []).map(b => {
        switch (b.tipo) {
            case 'resumen': case 'texto': return b.texto
            case 'pasos': return b.items.map((it, i) => `${i + 1}. ${it.titulo}: ${it.texto}`).join('\n')
            case 'tabla': return [b.columnas.join(' | '), ...b.filas.map(f => f.join(' | '))].join('\n')
            case 'borrador': return `Borrador para ${b.destinatario}: ${b.texto}`
        }
    }).join('\n')
}

export async function responder(
    datos: DatosTasacion,
    otras: OtraTasacion[],
    anteriores: Mensaje[],
    pregunta: { texto: string; adjuntos: Adjunto[] },
    deps: DependenciasResponder,
): Promise<RespuestaArmada> {
    const { fila, sujeto, normales } = datos
    const iaEnUso = fila.valuation_source === 'ai' && fila.ai_valuation_result
    const guardado = iaEnUso ? fila.ai_valuation_result! : fila.valuation_result
    if (!guardado) throw new Error('La tasación todavía no tiene un resultado calculado: tocá "Calcular" primero.')
    const comparables = normales.map(r => filaAPropiedad(r))
    // Al guardar, el análisis de cada comparable se recorta (sin `property`: ya
    // está en appraisal_comparables). Sin rehidratar, la explicación no sabe de
    // qué comparable habla — falla encontrada en el QA del 2026-10-10.
    const resultado = rehidratar(guardado, comparables)

    const edits = fila.report_edits
    const precioTextos = formatCurrency(edits?.priceOverrides?.publicationPrice ?? resultado.publicationPrice, resultado.currency)
    const textos: Record<string, string> = {}
    if (edits?.analysisText) textos['Análisis'] = textoConPrecio(edits.analysisText, precioTextos)
    if (edits?.strategyPriceText) textos['Estrategia de precio'] = textoConPrecio(edits.strategyPriceText, precioTextos)

    const ia = fila.ai_valuation_result && !iaEnUso
        ? { publicationPrice: fila.ai_valuation_result.publicationPrice, resumen: fila.ai_valuation_result.ai.summary, correcciones: resumenCorrecciones(fila.ai_valuation_result.ai).lineas }
        : undefined

    const contexto = armarContexto({
        tasacion: {
            titulo: fila.property_title || fila.property_location, ubicacion: fila.property_location,
            barrio: fila.neighborhood_slug, fecha: fila.created_at.slice(0, 10), tasadorEnUso: iaEnUso ? 'ai' : 'calculator',
        },
        sujeto,
        comparables,
        resultado,
        ia,
        informe: { textos, preciosAMano: edits?.priceOverrides },
        mercado: deps.mercado ? await deps.mercado().catch(() => undefined) : undefined,
        otras,
    })

    const historial = recortarHistorial(
        anteriores.filter(m => m.status === 'ok').map(m => ({
            role: m.role,
            texto: m.role === 'user'
                ? `${m.texto}${m.adjuntos.length ? ` [adjuntó: ${m.adjuntos.map(a => a.nombre).join(', ')}]` : ''}`
                : textoDeBloques(m.bloques),
        })),
        MAX_HISTORIAL,
    )

    const adjuntos = await Promise.all(pregunta.adjuntos.map(deps.descargarAdjunto))
    const r = await deps.pedir({ system: `${PROMPT_ASISTENTE}\n\nCONTEXTO:\n${contexto}`, historial, mensaje: pregunta.texto, adjuntos })

    let json: unknown
    try { json = JSON.parse(r.content) } catch { throw new ErrorRespuestaAsistente('el modelo no devolvió JSON') }
    const v = validarRespuesta(json)

    let propuesta: RespuestaArmada['propuesta'] = null
    if (v.propuesta) {
        const efecto = precioConPropuesta(
            { sujeto, comparables: normales.map(n => filaAPropiedad(n)), tasas: resultado.expenseRates },
            v.propuesta,
        )
        // Una propuesta que no se puede calcular (índice inexistente) no se ofrece.
        if (efecto) propuesta = { ...v.propuesta, ...efecto }
    }
    return { bloques: v.bloques, propuesta, model: r.model, usage: r.usage }
}
