import { describe, it, expect, vi } from 'vitest'
import { responder, textoDeBloques, type DependenciasResponder } from './responder'
import { calculateValuation, type ValuationProperty } from '../valuation/calculator'
import type { DatosTasacion, Mensaje } from './repositorio'

const sujeto: ValuationProperty = { title: 'Paraguay 3682', location: 'Palermo', features: { coveredArea: 70, floor: 4 } }
const comps = [
    { id: 'c1', title: 'Thames', location: 'Palermo', url: null, price: 150_000, currency: 'USD', description: null, images: null, features: { coveredArea: 70, floor: 4 }, analysis: null, sort_order: 0 },
    { id: 'c2', title: 'Gurruchaga', location: 'Palermo', url: null, price: 160_000, currency: 'USD', description: null, images: null, features: { coveredArea: 72, floor: 2 }, analysis: null, sort_order: 1 },
]
const resultado = calculateValuation({ subject: sujeto, comparables: comps.map(c => ({ ...c, title: c.title, features: c.features })) })!
const datos: DatosTasacion = {
    fila: {
        id: 't1', property_title: 'Paraguay 3682', property_location: 'Palermo', property_description: null, property_price: null,
        property_currency: 'USD', property_features: sujeto.features, valuation_result: resultado, ai_valuation_result: null,
        valuation_source: 'calculator', report_edits: { semaphoreOverrides: {}, analysisText: 'se debería publicar en {precio}.' },
        neighborhood_slug: 'palermo', market_period: '2026-10-01', created_at: '2026-10-01T10:00:00Z',
    },
    sujeto,
    normales: comps as DatosTasacion['normales'],
}

const respuestaOk = (extra: Record<string, unknown> = {}) => JSON.stringify({
    bloques: [{ tipo: 'resumen', texto: 'Sale de 2 comparables.' }], propuesta: null, ...extra,
})
const deps = (contenido: string, espia?: (e: Parameters<DependenciasResponder['pedir']>[0]) => void): DependenciasResponder => ({
    pedir: vi.fn(async (e) => { espia?.(e); return { content: contenido, model: 'gpt-4.1' } }),
    descargarAdjunto: vi.fn(async (a) => ({ tipo: a.tipo, nombre: a.nombre, mime: 'image/png', base64: 'AAA' })),
})

describe('responder', () => {
    it('hace UNA sola llamada al modelo, con el cálculo exacto y el texto del informe resuelto en el contexto', async () => {
        let system = ''
        const d = deps(respuestaOk(), e => { system = e.system })
        await responder(datos, [], [], { texto: '¿Cómo llegó al precio?', adjuntos: [] }, d)
        expect(d.pedir).toHaveBeenCalledTimes(1)
        expect(system).toContain(`USD ${resultado.publicationPrice.toLocaleString('es-AR')}`)
        expect(system).toContain(`se debería publicar en USD ${resultado.publicationPrice.toLocaleString('es-AR')}`)
    })

    it('baja los adjuntos y se los pasa al modelo', async () => {
        let adj: unknown[] = []
        const d = deps(respuestaOk(), e => { adj = e.adjuntos })
        await responder(datos, [], [], { texto: 'mirá', adjuntos: [{ path: 't1/h/x.png', tipo: 'imagen', nombre: 'x.png', tamano: 10 }] }, d)
        expect(d.descargarAdjunto).toHaveBeenCalledTimes(1)
        expect(adj).toHaveLength(1)
    })

    it('calcula con la calculadora el efecto de una propuesta', async () => {
        const r = await responder(datos, [], [], { texto: 'está frente a la plaza', adjuntos: [] },
            deps(respuestaOk({ propuesta: { objetivo: 'sujeto', campo: 'locationCoefficient', valor: 1.05, motivo: 'plaza' } })))
        expect(r.propuesta?.antes).toBe(resultado.publicationPrice)
        expect(r.propuesta!.despues).toBeGreaterThan(r.propuesta!.antes)
    })

    it('descarta una propuesta sobre un comparable que no existe', async () => {
        const r = await responder(datos, [], [], { texto: 'x', adjuntos: [] },
            deps(respuestaOk({ propuesta: { objetivo: 'comparable', indice: 7, campo: 'floor', valor: 3, motivo: 'x' } })))
        expect(r.propuesta).toBeNull()
    })

    it('manda el historial con el texto de las respuestas anteriores, no su JSON, y sin los mensajes fallidos', async () => {
        let historial: { role: string; texto: string }[] = []
        const anteriores = [
            { role: 'user', texto: 'hola', adjuntos: [], status: 'ok', bloques: null },
            { role: 'assistant', texto: '', adjuntos: [], status: 'ok', bloques: [{ tipo: 'resumen', texto: 'Sale de 2 comparables.' }] },
            { role: 'user', texto: 'otra', adjuntos: [], status: 'failed', bloques: null },
        ] as unknown as Mensaje[]
        await responder(datos, [], anteriores, { texto: 'y?', adjuntos: [] }, deps(respuestaOk(), e => { historial = e.historial }))
        expect(historial).toEqual([{ role: 'user', texto: 'hola' }, { role: 'assistant', texto: 'Sale de 2 comparables.' }])
    })

    it('una respuesta que no es JSON da un error legible', async () => {
        await expect(responder(datos, [], [], { texto: 'x', adjuntos: [] }, deps('no puedo'))).rejects.toThrow(/JSON/)
    })

    it('sin resultado calculado avisa qué hacer', async () => {
        const sin = { ...datos, fila: { ...datos.fila, valuation_result: null } }
        await expect(responder(sin, [], [], { texto: 'x', adjuntos: [] }, deps(respuestaOk()))).rejects.toThrow(/Calcular/)
    })
})

describe('textoDeBloques', () => {
    it('convierte pasos y borradores en texto legible', () => {
        expect(textoDeBloques([
            { tipo: 'pasos', items: [{ titulo: 'A', texto: 'a' }] },
            { tipo: 'borrador', destinatario: 'Propietaria', texto: 'Hola' },
        ])).toBe('1. A: a\nBorrador para Propietaria: Hola')
    })
})
