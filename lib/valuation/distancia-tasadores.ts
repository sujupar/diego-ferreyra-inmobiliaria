/**
 * Distancia entre el Tasador IA y el clásico, y de dónde sale.
 *
 * POR QUÉ (dueño, 2026-10-10): "no puede ser que una tasación me dé 130.000 en
 * el sistema normal y 240.000 con inteligencia artificial". Más allá del
 * UMBRAL_DISTANCIA la pantalla lo marca en rojo y explica qué coeficientes la
 * separan, y elegir el IA pide confirmación.
 */
import type { ValuationResult } from './calculator'
import type { AiPropertyInterpretation } from './ia-tipos'
import type { PlanillaCoeficientes } from './planilla-ia'
import { formatCurrency } from './utils'

/** Aprobado por el dueño el 2026-10-10 (spec D3). */
export const UMBRAL_DISTANCIA = 0.15

export interface Distancia {
    /** (IA − clásico) / clásico, en %. */
    porcentaje: number
    excede: boolean
}

export function distanciaEntreTasadores(
    clasico: { publicationPrice: number },
    ia: { publicationPrice: number },
): Distancia {
    if (!clasico.publicationPrice) return { porcentaje: 0, excede: false }
    const relativa = (ia.publicationPrice - clasico.publicationPrice) / clasico.publicationPrice
    // Con 1e-9 de margen: 149.500 / 130.000 da 1,15 exacto en papel, no en punto flotante.
    return { porcentaje: relativa * 100, excede: Math.abs(relativa) > UMBRAL_DISTANCIA + 1e-9 }
}

const coef = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`

const COEFICIENTES_SUJETO: [keyof ValuationResult, string][] = [
    ['subjectLocationCoef', 'Ubicación de la propiedad'],
    ['subjectFloorCoef', 'Piso de la propiedad'],
    ['subjectDispositionCoef', 'Disposición de la propiedad'],
    ['subjectQualityCoef', 'Calidad de la propiedad'],
    ['subjectAgeCoef', 'Edad y estado de la propiedad'],
]

/** Las diferencias que explican la distancia, en lenguaje simple. Vacío si no hay ninguna. */
export function explicarDistancia(clasico: ValuationResult, ia: ValuationResult): string[] {
    const lineas: string[] = []
    for (const [k, nombre] of COEFICIENTES_SUJETO) {
        const a = Number(clasico[k]); const b = Number(ia[k])
        if (Math.abs(a - b) >= 0.005) lineas.push(`${nombre}: ${coef(a)} → ${coef(b)}`)
    }
    const pa = clasico.averagePriceM2; const pb = ia.averagePriceM2
    if (pa && Math.abs(pb - pa) / pa >= 0.005) {
        lineas.push(`Promedio por m² ajustado de los comparables: ${formatCurrency(pa, clasico.currency)} → ${formatCurrency(pb, ia.currency)} (${pct((pb / pa - 1) * 100)})`)
    }
    return lineas
}

const NOMBRE_COEFICIENTE: Record<keyof PlanillaCoeficientes, string> = {
    superficieHomologada: 'superficie homologada',
    kPiso: 'piso',
    kDisposicion: 'disposición',
    mCalidad: 'calidad',
    porcentajeVida: '% de vida',
    kTabla: 'tabla Ross-Heidecke',
    wEdadEstado: 'edad y estado',
    jUbicacion: 'ubicación',
    nTotal: 'coeficiente total',
}

const numero = (n: number) => Number(n.toFixed(4)).toString().replace('.', ',')

/** Las cuentas del modelo que corrigió la tabla del método, para mostrarlas. */
export function resumenCorrecciones(ai: { subject: AiPropertyInterpretation; comparables: AiPropertyInterpretation[] }): { total: number; lineas: string[] } {
    const propiedades: [string, AiPropertyInterpretation][] = [
        ['Propiedad tasada', ai.subject],
        ...ai.comparables.map((c, i): [string, AiPropertyInterpretation] => [`Comparable ${i + 1}`, c]),
    ]
    const lineas = propiedades.flatMap(([nombre, p]) =>
        (p.correcciones ?? []).map(c => `${nombre} — ${NOMBRE_COEFICIENTE[c.coeficiente]}: ${numero(c.ia)} → ${numero(c.metodo)}`))
    return { total: lineas.length, lineas }
}
