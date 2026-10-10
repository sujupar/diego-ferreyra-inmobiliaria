import { describe, it, expect } from 'vitest'
import { armarContexto, MAX_CONTEXTO, type EntradaContexto } from './contexto'
import { PROMPT_ASISTENTE } from './prompt'
import { calculateValuation, type ValuationProperty } from '../valuation/calculator'

const sujeto: ValuationProperty = { title: 'Paraguay 3682', location: 'Palermo', description: 'Luminoso. ' + 'x'.repeat(5000), features: { coveredArea: 72, floor: 4, age: 30 } }
const comparables: ValuationProperty[] = [
    { title: 'Thames 2100', location: 'Palermo', price: 200_000, currency: 'USD', description: 'Reciclado', features: { coveredArea: 80, floor: 4 } },
    { title: 'Gurruchaga 1800', location: 'Palermo', price: 180_000, currency: 'USD', features: { coveredArea: 75, floor: 1 } },
]
const resultado = calculateValuation({ subject: sujeto, comparables })!
const entrada = (extra: Partial<EntradaContexto> = {}): EntradaContexto => ({
    tasacion: { titulo: 'Paraguay 3682', ubicacion: 'Palermo, CABA', barrio: 'Palermo', fecha: '2026-09-20', tasadorEnUso: 'calculator' },
    sujeto, comparables, resultado,
    otras: [{ titulo: 'Thames 1186', barrio: 'Palermo', fecha: '2026-08-02', publicacion: 153000, superficie: 70, precioM2: 2185 }],
    ...extra,
})

describe('armarContexto — lo que el asistente sabe de la tasación', () => {
    it('lleva el cálculo paso a paso con los números exactos', () => {
        const c = armarContexto(entrada())
        expect(c).toContain(`USD ${resultado.publicationPrice.toLocaleString('es-AR')}`)
        expect(c).toContain('Thames 2100')
        expect(c).toContain('Coeficiente total')
    })
    it('recorta descripciones largas', () => {
        expect(armarContexto(entrada())).not.toContain('x'.repeat(1500))
    })
    it('incluye otras tasaciones del barrio para comparar', () => {
        expect(armarContexto(entrada())).toContain('Thames 1186')
    })
    it('incluye el Tasador IA con su distancia y sus correcciones si existe', () => {
        const c = armarContexto(entrada({ ia: { publicationPrice: 199000, resumen: 'Palermo homogéneo', correcciones: ['Comparable 1 — piso: 0,9 → 1'] } }))
        expect(c).toContain('USD 199.000')
        expect(c).toContain('piso: 0,9 → 1')
    })
    it('incluye los textos del informe y los precios cargados a mano', () => {
        const c = armarContexto(entrada({ informe: { textos: { 'Análisis': 'se debería publicar en USD 193.000.' }, preciosAMano: { publicationPrice: 199000 } } }))
        expect(c).toContain('se debería publicar en')
        expect(c).toContain('Precio de publicación cargado a mano: USD 199.000')
    })
    it('nunca supera el tope de tamaño', () => {
        const muchas = Array.from({ length: 500 }, (_, i) => ({ titulo: `T${i} ` + 'y'.repeat(80), barrio: 'Palermo', fecha: '2026-01-01', publicacion: 1, superficie: 1, precioM2: 1 }))
        expect(armarContexto(entrada({ otras: muchas })).length).toBeLessThanOrEqual(MAX_CONTEXTO)
    })
})

describe('PROMPT_ASISTENTE', () => {
    it('pide explicar simple sin ser infantil, primero la respuesta en una frase', () => {
        expect(PROMPT_ASISTENTE).toMatch(/cualquier persona/i)
        expect(PROMPT_ASISTENTE).toMatch(/infantil/i)
        expect(PROMPT_ASISTENTE).toMatch(/resumen/)
    })
    it('prohíbe citar números que no estén en el contexto', () => {
        expect(PROMPT_ASISTENTE).toMatch(/solo .*números.*contexto/i)
    })
    it('aclara que una propuesta nunca se aplica sola', () => {
        expect(PROMPT_ASISTENTE).toMatch(/Aplicar/)
    })
})
