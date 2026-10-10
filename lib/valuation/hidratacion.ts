/**
 * Abrir una tasación NO la cambia.
 *
 * POR QUÉ EXISTE: el editor recalcula y autoguarda cada vez que cambia un dato.
 * Al abrir una tasación, cargar sus datos también "cambia" el estado, así que se
 * recalculaba con las reglas de HOY y se guardaba sola en menos de un segundo.
 * En la auditoría del 2026-10-03, 6 tasaciones de abril cambiaban de precio con
 * solo abrirlas (+7 % a +18 %) por un arreglo posterior del coeficiente de
 * calidad: un precio ya entregado al propietario se movía sin que nadie lo
 * decidiera.
 *
 * Con la huella, el editor sabe si lo que tiene es exactamente lo que cargó. Si
 * lo es, no recalcula ni guarda; solo avisa si las reglas de hoy darían otro
 * precio, y el asesor decide.
 */
import { cyrb53 } from './huella-insumos'

/** Todo lo que el efecto de recálculo del editor mira. */
export interface EstadoDeEdicion {
    subject: unknown
    comparables: { price?: number | null; features?: unknown }[]
    overpriced: unknown[]
    purchaseProperties: unknown[]
    expenseRates: unknown
    purchaseScenarios: unknown[]
    selectedScenarioIds: unknown[]
    reportEdits: unknown
    ownerSharePercent: number
}

/** JSON con las claves ordenadas: el mismo estado da la misma huella venga en el orden que venga. */
function canonico(valor: unknown): unknown {
    if (Array.isArray(valor)) return valor.map(canonico)
    if (valor && typeof valor === 'object') {
        return Object.fromEntries(
            Object.keys(valor as Record<string, unknown>).sort()
                .map(k => [k, canonico((valor as Record<string, unknown>)[k])]),
        )
    }
    return valor
}

export function huellaDeEdicion(estado: EstadoDeEdicion): string {
    return cyrb53(JSON.stringify(canonico(estado)))
}

export interface CambioDePrecio { antes: number; despues: number }

/** Si las reglas de hoy dan otro precio de publicación que el guardado, cuánto. */
export function cambioPorReglasActuales(
    guardado: { publicationPrice: number },
    recalculado: { publicationPrice: number } | null,
): CambioDePrecio | null {
    if (!recalculado || recalculado.publicationPrice === guardado.publicationPrice) return null
    return { antes: guardado.publicationPrice, despues: recalculado.publicationPrice }
}
