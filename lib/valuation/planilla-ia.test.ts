import { describe, it, expect } from 'vitest'
import { planillaDelMetodo, verificarPlanilla, type PlanillaCoeficientes } from './planilla-ia'
import { calculateValuation, type ValuationFeatures } from './calculator'

const depto: ValuationFeatures = {
    coveredArea: 60, uncoveredArea: 8, floor: 4, age: 30,
    quality: 'GOOD', conservationState: 'STATE_2', disposition: 'BACK', locationCoefficient: 1,
}

describe('planillaDelMetodo — cada coeficiente como lo calcula el tasador clásico', () => {
    it('calcula superficie, piso, disposición, calidad, vida, tabla, edad-estado, ubicación y total', () => {
        const p = planillaDelMetodo(depto)
        expect(p.superficieHomologada).toBe(64)
        expect(p.kPiso).toBe(1)
        expect(p.kDisposicion).toBe(0.95)
        expect(p.mCalidad).toBe(1.075)
        expect(p.porcentajeVida).toBe(43)
        expect(p.kTabla).toBe(32.49) // fila 43 % de vida, Estado 2
        expect(p.wEdadEstado).toBeCloseTo(1 - 32.49 / 200, 10)
        expect(p.jUbicacion).toBe(1)
        expect(p.nTotal).toBeCloseTo(1 * 0.95 * 1.075 * (1 - 32.49 / 200) * 1, 10)
    })

    it('da el MISMO coeficiente total que la calculadora para la propiedad a tasar', () => {
        const r = calculateValuation({
            subject: { features: depto },
            comparables: [{ price: 100_000, features: { coveredArea: 50 } }],
        })
        expect(planillaDelMetodo(depto).nTotal).toBeCloseTo(r!.subjectTotalCoef, 12)
    })

    it('trata los datos vacíos igual que la calculadora (piso vacío = planta baja, sin ubicación = 1)', () => {
        const p = planillaDelMetodo({ coveredArea: 50 })
        expect(p.kPiso).toBe(0.9)
        expect(p.jUbicacion).toBe(1)
        expect(p.porcentajeVida).toBe(0)
    })
})

describe('verificarPlanilla — la tabla del método manda sobre la cuenta del modelo', () => {
    it('no corrige nada si el modelo calculó igual que el método', () => {
        expect(verificarPlanilla(depto, planillaDelMetodo(depto))).toEqual([])
    })

    it('acepta diferencias de redondeo', () => {
        const p: PlanillaCoeficientes = { ...planillaDelMetodo(depto), wEdadEstado: 0.838, nTotal: 0.855 }
        expect(verificarPlanilla(depto, p)).toEqual([])
    })

    it('registra la corrección cuando el modelo usa otro coeficiente de piso', () => {
        const p = { ...planillaDelMetodo(depto), kPiso: 1.05 }
        expect(verificarPlanilla(depto, p)).toContainEqual({ coeficiente: 'kPiso', ia: 1.05, metodo: 1 })
    })

    it('registra la corrección cuando el modelo leyó mal la tabla Ross-Heidecke', () => {
        const p = { ...planillaDelMetodo(depto), kTabla: 18.1 }
        const c = verificarPlanilla(depto, p)
        expect(c.map(x => x.coeficiente)).toContain('kTabla')
    })

    it('registra la corrección de la superficie homologada', () => {
        const p = { ...planillaDelMetodo(depto), superficieHomologada: 68 }
        expect(verificarPlanilla(depto, p)).toContainEqual({ coeficiente: 'superficieHomologada', ia: 68, metodo: 64 })
    })
})
