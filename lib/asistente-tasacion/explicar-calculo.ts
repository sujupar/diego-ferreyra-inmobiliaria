/**
 * El cálculo de una tasación, paso a paso, con los números EXACTOS del resultado.
 *
 * POR QUÉ LO ARMA EL CÓDIGO Y NO LA IA: el asistente tiene que poder explicar
 * "cómo llegó a este precio" sin inventar ni redondear mal. El modelo recibe
 * esta explicación ya calculada y la cuenta en lenguaje simple; las cifras salen
 * de acá (spec del asistente, 2026-10-03: "la IA narra esos números, no los
 * recalcula").
 */
import type { ComparableAnalysis, ValuationResult } from '../valuation/calculator'
import { formatCurrency } from '../valuation/utils'

export interface PasoExplicado { titulo: string; texto: string }

export interface ExplicacionDelCalculo {
    pasos: PasoExplicado[]
    tablaComparables: { columnas: string[]; filas: string[][] }
    /** Por comparable, los coeficientes que lo ajustan, legibles. */
    coeficientesPorComparable: string[]
}

const m2 = (n: number) => `${n.toLocaleString('es-AR', { maximumFractionDigits: 2 })} m²`
const coef = (n: number) => n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })
const usd = (n: number, moneda: string) => formatCurrency(n, moneda)

function coeficientesLegibles(c: ComparableAnalysis): string {
    return [
        `ubicación ${coef(c.locationCoefficient)}`,
        `piso ${coef(c.floorCoefficient)}`,
        `disposición ${coef(c.dispositionCoefficient)}`,
        `calidad ${coef(c.qualityCoefficient)}`,
        `edad y estado ${coef(c.ageCoefficient)}`,
    ].join(' · ')
}

export function explicarCalculo(r: ValuationResult): ExplicacionDelCalculo {
    const moneda = r.currency || 'USD'
    const comps = r.comparableAnalysis
    const pasos: PasoExplicado[] = [
        {
            titulo: 'Superficie que cuenta',
            texto: `La superficie cubierta cuenta entera y la semicubierta y la descubierta, por la mitad. La propiedad tiene ${m2(r.subjectSurface)} homologados.`,
        },
        {
            titulo: 'Precio por m² de cada comparable',
            texto: `Se divide el precio de cada uno de los ${comps.length} comparables por su superficie homologada (tabla de comparables).`,
        },
        {
            titulo: 'Llevar cada comparable a igualdad de condiciones',
            texto: 'Cada precio por m² se divide por el coeficiente total del comparable (ubicación × piso × disposición × calidad × edad y estado), para saber cuánto valdría en condiciones estándar.',
        },
        {
            titulo: 'Promedio',
            texto: `El promedio de los precios por m² ajustados es ${usd(r.averagePriceM2, moneda)} por m².`,
        },
        {
            titulo: 'Ajustarlo a esta propiedad',
            texto: `Ese promedio se multiplica por el coeficiente total de la propiedad tasada, ${r.subjectTotalCoef.toLocaleString('es-AR', { maximumFractionDigits: 3 })} (ubicación ${coef(r.subjectLocationCoef)} · piso ${coef(r.subjectFloorCoef)} · disposición ${coef(r.subjectDispositionCoef)} · calidad ${coef(r.subjectQualityCoef)} · edad y estado ${coef(r.subjectAgeCoef)}): da ${usd(r.subjectPriceM2, moneda)} por m².`,
        },
        {
            titulo: 'Valor de la propiedad',
            texto: `${m2(r.subjectSurface)} × ${usd(r.subjectPriceM2, moneda)} = ${usd(r.finalValue, moneda)}.`,
        },
        {
            titulo: 'Precio de publicación',
            texto: `Se redondea al millar: ${usd(r.publicationPrice, moneda)}. Por encima de ${usd(r.noSaleZonePrice, moneda)} (5 % más) está la Zona de No Venta.`,
        },
    ]
    return {
        pasos,
        tablaComparables: {
            columnas: ['Comparable', 'Precio', 'M² homologados', 'USD/m²', 'Coeficiente total', 'USD/m² ajustado'],
            filas: comps.map((c, i) => [
                // `property` puede faltar si el resultado no se rehidrató: nunca romper la explicación.
                c.property?.title || `Comparable ${i + 1}`,
                usd(c.property?.price ?? 0, c.property?.currency || moneda),
                m2(c.homogenizedSurface),
                usd(c.originalPriceM2, moneda),
                coef(c.totalCoefficient),
                usd(c.adjustedPriceM2, moneda),
            ]),
        },
        coeficientesPorComparable: comps.map(coeficientesLegibles),
    }
}
