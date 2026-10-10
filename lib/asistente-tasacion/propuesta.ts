/**
 * Aplicar una propuesta del asistente y ver su efecto en el precio.
 * El antes/después lo calcula SIEMPRE la calculadora, nunca el modelo.
 */
import { calculateValuation, type ExpenseRates, type ValuationProperty } from '../valuation/calculator'
import type { PropuestaDeAjuste } from './respuesta'

export interface DatosDeLaTasacion {
    sujeto: ValuationProperty
    comparables: ValuationProperty[]
    tasas?: ExpenseRates
}

/** Devuelve los datos con la propuesta aplicada (sin mutar los originales). */
export function aplicarPropuesta(d: DatosDeLaTasacion, p: PropuestaDeAjuste): DatosDeLaTasacion {
    const conCambio = (prop: ValuationProperty): ValuationProperty =>
        ({ ...prop, features: { ...prop.features, [p.campo]: p.valor } })
    if (p.objetivo === 'sujeto') return { ...d, sujeto: conCambio(d.sujeto) }
    return { ...d, comparables: d.comparables.map((c, i) => (i === p.indice ? conCambio(c) : c)) }
}

export interface EfectoEnPrecio { antes: number; despues: number }

export function precioConPropuesta(d: DatosDeLaTasacion, p: PropuestaDeAjuste): EfectoEnPrecio | null {
    if (p.objetivo === 'comparable' && (p.indice === undefined || p.indice >= d.comparables.length)) return null
    const antes = calculateValuation({ subject: d.sujeto, comparables: d.comparables, expenseRates: d.tasas })
    const nuevo = aplicarPropuesta(d, p)
    const despues = calculateValuation({ subject: nuevo.sujeto, comparables: nuevo.comparables, expenseRates: d.tasas })
    if (!antes || !despues) return null
    return { antes: antes.publicationPrice, despues: despues.publicationPrice }
}
