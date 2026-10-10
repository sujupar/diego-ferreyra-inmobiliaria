import { describe, it, expect } from 'vitest'
import {
    MARCADOR_PRECIO,
    buildDefaultEdits,
    completarEdiciones,
    conMarcadorDePrecio,
    textoConPrecio,
    type ReportEdits,
} from './report-edits'

const sujeto = { title: 'Depto', location: 'Paraguay 3682', description: 'Lindo' }

describe('buildDefaultEdits', () => {
    it('escribe el marcador de precio, no el número, en los dos textos con precio', () => {
        const e = buildDefaultEdits(sujeto, { publicationPrice: 193000, currency: 'USD' })
        expect(e.analysisText).toContain(MARCADOR_PRECIO)
        expect(e.strategyPriceText).toContain(MARCADOR_PRECIO)
        expect(e.analysisText).not.toContain('193.000')
        expect(e.strategyPriceText).not.toContain('193.000')
    })
})

describe('conMarcadorDePrecio', () => {
    it('convierte la frase de fábrica del análisis con un precio viejo', () => {
        const viejo = 'la propiedad se debería publicar en USD 252.000.\n\nUna buena tasación...'
        expect(conMarcadorDePrecio(viejo)).toBe(`la propiedad se debería publicar en ${MARCADOR_PRECIO}.\n\nUna buena tasación...`)
    })

    it('convierte la frase de fábrica de la estrategia con un precio viejo', () => {
        const viejo = 'El valor de publicación recomendado es: USD 1.250.000.\n\nHoy...'
        expect(conMarcadorDePrecio(viejo)).toBe(`El valor de publicación recomendado es: ${MARCADOR_PRECIO}.\n\nHoy...`)
    })

    it('reconoce el precio en pesos con el formato que generaba el sistema', () => {
        expect(conMarcadorDePrecio('se debería publicar en ARS 95.000.000.'))
            .toBe(`se debería publicar en ${MARCADOR_PRECIO}.`)
    })

    it('no toca un precio que el asesor escribió en otra frase', () => {
        const propio = 'La otra inmobiliaria la tasó en USD 225.000, nosotros no coincidimos.'
        expect(conMarcadorDePrecio(propio)).toBe(propio)
    })

    it('devuelve vacío para un texto ausente', () => {
        expect(conMarcadorDePrecio(undefined)).toBe('')
    })
})

describe('textoConPrecio', () => {
    it('reemplaza el marcador por el precio formateado', () => {
        expect(textoConPrecio(`publicar en ${MARCADOR_PRECIO}.`, 'USD 193.000')).toBe('publicar en USD 193.000.')
    })

    it('corrige un texto viejo con precio desactualizado al precio vigente', () => {
        expect(textoConPrecio('se debería publicar en USD 252.000.', 'USD 193.000'))
            .toBe('se debería publicar en USD 193.000.')
    })

    it('reemplaza todas las apariciones del marcador', () => {
        expect(textoConPrecio(`${MARCADOR_PRECIO} y ${MARCADOR_PRECIO}`, 'USD 1')).toBe('USD 1 y USD 1')
    })
})

describe('completarEdiciones', () => {
    const porDefecto = buildDefaultEdits(sujeto, { publicationPrice: 193000, currency: 'USD' })

    it('conserva un texto que el asesor editó', () => {
        const actual: ReportEdits = { semaphoreOverrides: {}, strategyDiffusionText: 'Texto mío' }
        expect(completarEdiciones(actual, porDefecto).strategyDiffusionText).toBe('Texto mío')
    })

    it('completa los textos que estaban vacíos', () => {
        const actual: ReportEdits = { semaphoreOverrides: {}, feesText: '' }
        const r = completarEdiciones(actual, porDefecto)
        expect(r.feesText).toBe(porDefecto.feesText)
        expect(r.analysisText).toBe(porDefecto.analysisText)
    })

    it('conserva los precios cargados a mano', () => {
        const actual: ReportEdits = { semaphoreOverrides: {}, priceOverrides: { noSaleZonePrice: 210000 } }
        expect(completarEdiciones(actual, porDefecto).priceOverrides).toEqual({ noSaleZonePrice: 210000 })
    })

    it('conserva el orden y las páginas ocultas del PDF', () => {
        const pdfLayout = { order: [1, 0], hidden: [2], pageCount: 3 }
        expect(completarEdiciones({ semaphoreOverrides: {}, pdfLayout }, porDefecto).pdfLayout).toEqual(pdfLayout)
    })

    it('conserva semáforos y títulos editados de comparables', () => {
        const actual: ReportEdits = {
            semaphoreOverrides: { 'comparable-0': 'red' },
            comparableOverrides: { 0: { title: 'Thames' } },
        }
        const r = completarEdiciones(actual, porDefecto)
        expect(r.semaphoreOverrides).toEqual({ 'comparable-0': 'red' })
        expect(r.comparableOverrides).toEqual({ 0: { title: 'Thames' } })
    })

    it('pasa al marcador un texto de fábrica que traía un precio viejo', () => {
        const actual: ReportEdits = { semaphoreOverrides: {}, analysisText: 'se debería publicar en USD 252.000.' }
        expect(completarEdiciones(actual, porDefecto).analysisText).toBe(`se debería publicar en ${MARCADOR_PRECIO}.`)
    })
})
