/**
 * La planilla del método: cada coeficiente de una propiedad, calculado como lo
 * calcula el tasador clásico.
 *
 * POR QUÉ EXISTE (pedido del dueño, 2026-10-10): el Tasador IA tiene que tasar
 * "exactamente igual" que el clásico, calculando él mismo TODOS los coeficientes.
 * El modelo devuelve su planilla completa y este módulo la verifica contra la
 * tabla del método para los datos que el propio modelo eligió: si una cuenta no
 * coincide, manda la tabla y queda registrada la corrección (visible en la
 * pantalla). El modelo decide los datos y explica; la aritmética nunca se le
 * delega — el precio final lo saca siempre `calculateValuation`.
 *
 * Usa las MISMAS funciones que la calculadora, así que no puede desincronizarse.
 */
import {
    calculateHomogenizedSurface, getDispositionCoefficient, getFloorCoefficient, getQualityCoefficient,
    type ValuationFeatures,
} from './calculator'
import { VALUATION_RULES, calculateAgeStateCoefficient, getRossHeideckeK } from './rules'

export interface PlanillaCoeficientes {
    /** cubierta + 0,5 × semicubierta + 0,5 × descubierta, en m². */
    superficieHomologada: number
    kPiso: number
    kDisposicion: number
    mCalidad: number
    /** % de la vida útil consumido: MIN(99, REDONDEAR(100 × edad / 70)). */
    porcentajeVida: number
    /** K de la tabla Ross-Heidecke para ese % de vida y ese estado. */
    kTabla: number
    /** W = 1 − K / 200. */
    wEdadEstado: number
    jUbicacion: number
    /** N = J × K_piso × K_disp × M × W. */
    nTotal: number
}

export interface CorreccionDePlanilla {
    coeficiente: keyof PlanillaCoeficientes
    /** Lo que calculó el modelo. */
    ia: number
    /** Lo que da la tabla del método (y es lo que se usa). */
    metodo: number
}

export function planillaDelMetodo(f: ValuationFeatures): PlanillaCoeficientes {
    const edad = f.age || 0
    const estado = f.conservationState || 'STATE_2'
    // Mismos defaults que calculateValuation: piso vacío = 0 (planta baja),
    // ubicación vacía = 1. Si eso cambia ahí, cambia acá solo porque son las
    // mismas funciones; los dos `|| 0` y `?? 1` de abajo deben seguir a la par.
    const porcentajeVida = Math.min(99, Math.round((100 * edad) / VALUATION_RULES.DEFAULT_LIFE_SPAN))
    const kPiso = getFloorCoefficient(f.floor || 0, f.totalFloors || null)
    const kDisposicion = getDispositionCoefficient(f.disposition)
    const mCalidad = getQualityCoefficient(f.quality)
    const wEdadEstado = calculateAgeStateCoefficient(edad, estado, VALUATION_RULES.DEFAULT_LIFE_SPAN)
    const jUbicacion = f.locationCoefficient ?? 1.0
    return {
        superficieHomologada: calculateHomogenizedSurface(f),
        kPiso,
        kDisposicion,
        mCalidad,
        porcentajeVida,
        kTabla: getRossHeideckeK(porcentajeVida, estado),
        wEdadEstado,
        jUbicacion,
        // Mismo orden de multiplicación que la calculadora (punto flotante).
        nTotal: jUbicacion * kPiso * kDisposicion * mCalidad * wEdadEstado,
    }
}

/** Cuánto puede diferir la cuenta del modelo por redondeo antes de considerarla un error. */
const TOLERANCIA: Record<keyof PlanillaCoeficientes, number> = {
    superficieHomologada: 0.5,
    kPiso: 0.006,
    kDisposicion: 0.006,
    mCalidad: 0.006,
    porcentajeVida: 1,
    kTabla: 0.05,
    wEdadEstado: 0.006,
    jUbicacion: 0.006,
    nTotal: 0.006,
}

/** Las cuentas del modelo que no coinciden con la tabla del método. */
export function verificarPlanilla(f: ValuationFeatures, deLaIA: PlanillaCoeficientes): CorreccionDePlanilla[] {
    const metodo = planillaDelMetodo(f)
    return (Object.keys(TOLERANCIA) as (keyof PlanillaCoeficientes)[])
        .filter(k => Math.abs(deLaIA[k] - metodo[k]) > TOLERANCIA[k])
        .map(k => ({ coeficiente: k, ia: deLaIA[k], metodo: metodo[k] }))
}
