import { describe, it, expect } from 'vitest'
import { validarRespuesta } from './respuesta'
import { aplicarPropuesta, precioConPropuesta } from './propuesta'
import { recortarHistorial } from './historial'
import { tituloDelHilo } from './titulo'
import type { ValuationProperty } from '../valuation/calculator'

const ok = () => ({
    bloques: [
        { tipo: 'resumen', texto: 'Sale de 4 comparables parecidos.' },
        { tipo: 'pasos', items: [{ titulo: 'Superficie', texto: '75 m²' }] },
        { tipo: 'tabla', columnas: ['A', 'B'], filas: [['1', '2']] },
        { tipo: 'borrador', destinatario: 'Propietaria', texto: 'Hola...' },
    ],
    propuesta: { objetivo: 'sujeto', campo: 'locationCoefficient', valor: 1.05, motivo: 'Frente a plaza' },
})

describe('validarRespuesta — lo que devuelve el modelo, siempre con estructura', () => {
    it('acepta bloques y una propuesta válida', () => {
        const r = validarRespuesta(ok())
        expect(r.bloques).toHaveLength(4)
        expect(r.propuesta?.valor).toBe(1.05)
    })
    it('exige que el primer bloque sea el resumen en una frase', () => {
        const r = ok(); r.bloques.reverse()
        expect(() => validarRespuesta(r)).toThrow(/resumen/i)
    })
    it('rechaza un tipo de bloque inventado', () => {
        const r = ok() as { bloques: unknown[] }; r.bloques.push({ tipo: 'video', url: 'x' })
        expect(() => validarRespuesta(r)).toThrow()
    })
    it('rechaza una ubicación propuesta fuera del rango del método (0,85–1,15)', () => {
        const r = ok(); r.propuesta.valor = 1.3
        expect(() => validarRespuesta(r)).toThrow(/rango|ubicación/i)
    })
    it('rechaza una calidad que no existe en el método', () => {
        const r = { ...ok(), propuesta: { objetivo: 'sujeto', campo: 'quality', valor: 'LUJO', motivo: 'x' } }
        expect(() => validarRespuesta(r)).toThrow()
    })
    it('una propuesta sobre un comparable necesita su índice', () => {
        const r = { ...ok(), propuesta: { objetivo: 'comparable', campo: 'floor', valor: 3, motivo: 'x' } }
        expect(() => validarRespuesta(r)).toThrow(/índice|indice/i)
    })
    it('la propuesta es opcional', () => {
        const { propuesta: _p, ...sin } = ok()
        expect(validarRespuesta(sin).propuesta).toBeUndefined()
    })
})

const sujeto: ValuationProperty = { features: { coveredArea: 70, floor: 4, locationCoefficient: 1 } }
const comparables: ValuationProperty[] = [
    { price: 150_000, features: { coveredArea: 70, floor: 4 } },
    { price: 160_000, features: { coveredArea: 72, floor: 2 } },
]

describe('propuesta — el precio antes/después lo calcula la calculadora', () => {
    it('aplica un coeficiente al sujeto sin tocar lo demás', () => {
        const r = aplicarPropuesta({ sujeto, comparables }, { objetivo: 'sujeto', campo: 'locationCoefficient', valor: 1.05, motivo: '' })
        expect(r.sujeto.features.locationCoefficient).toBe(1.05)
        expect(r.sujeto.features.coveredArea).toBe(70)
        expect(r.comparables).toBe(comparables)
    })
    it('aplica sobre el comparable indicado', () => {
        const r = aplicarPropuesta({ sujeto, comparables }, { objetivo: 'comparable', indice: 1, campo: 'floor', valor: 5, motivo: '' })
        expect(r.comparables[1].features.floor).toBe(5)
        expect(r.comparables[0]).toBe(comparables[0])
    })
    it('da el precio de publicación antes y después', () => {
        const p = precioConPropuesta({ sujeto, comparables }, { objetivo: 'sujeto', campo: 'locationCoefficient', valor: 1.05, motivo: '' })
        expect(p).not.toBeNull()
        expect(p!.despues).toBeGreaterThan(p!.antes)
    })
    it('un índice de comparable que no existe no aplica nada', () => {
        expect(precioConPropuesta({ sujeto, comparables }, { objetivo: 'comparable', indice: 9, campo: 'floor', valor: 5, motivo: '' })).toBeNull()
    })
})

describe('recortarHistorial — sin segunda llamada de IA', () => {
    const msgs = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' as const : 'user' as const, texto: `m${i} ` + 'x'.repeat(500) }))
    it('se queda con los últimos mensajes dentro del presupuesto', () => {
        const r = recortarHistorial(msgs, 3000)
        expect(r.at(-1)!.texto.startsWith('m29')).toBe(true)
        expect(r.reduce((n, m) => n + m.texto.length, 0)).toBeLessThanOrEqual(3000)
    })
    it('nunca deja un historial que empiece con una respuesta del asistente', () => {
        expect(recortarHistorial(msgs, 3000)[0].role).toBe('user')
    })
})

describe('tituloDelHilo', () => {
    it('usa la primera pregunta, recortada a 60 caracteres sin cortar palabras', () => {
        const t = tituloDelHilo('¿Cómo llegó a este precio? La propietaria dice que es bajo porque la cuadra está frente a la plaza')
        expect(t.length).toBeLessThanOrEqual(61)
        expect(t.endsWith('…')).toBe(true)
        expect(t.startsWith('¿Cómo llegó a este precio?')).toBe(true)
    })
    it('si no hay texto (solo adjuntos), un título genérico', () => {
        expect(tituloDelHilo('   ')).toBe('Consulta con adjuntos')
    })
})
