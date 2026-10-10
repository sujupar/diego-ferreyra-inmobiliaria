import { describe, it, expect } from 'vitest'
import { huellaDeEdicion, cambioPorReglasActuales, type EstadoDeEdicion } from './hidratacion'

const base: EstadoDeEdicion = {
    subject: { title: 'Paraguay 3682', features: { coveredArea: 70, floor: 4 } },
    comparables: [{ price: 180000, features: { coveredArea: 72 } }],
    overpriced: [],
    purchaseProperties: [],
    expenseRates: { saleDiscountPercent: 5 },
    purchaseScenarios: [],
    selectedScenarioIds: [],
    reportEdits: { semaphoreOverrides: {} },
    ownerSharePercent: 100,
}

describe('huellaDeEdicion', () => {
    it('da lo mismo para el mismo estado', () => {
        expect(huellaDeEdicion(base)).toBe(huellaDeEdicion(structuredClone(base)))
    })

    it('cambia si cambia un dato de un comparable', () => {
        const otro = structuredClone(base)
        otro.comparables[0].price = 181000
        expect(huellaDeEdicion(otro)).not.toBe(huellaDeEdicion(base))
    })

    it('cambia si cambia la parte del propietario', () => {
        expect(huellaDeEdicion({ ...base, ownerSharePercent: 50 })).not.toBe(huellaDeEdicion(base))
    })

    it('cambia si cambia un texto del informe', () => {
        const otro = { ...base, reportEdits: { semaphoreOverrides: {}, feesText: 'x' } }
        expect(huellaDeEdicion(otro)).not.toBe(huellaDeEdicion(base))
    })

    it('no depende del orden de las claves de un objeto', () => {
        const reordenado = { ...base, subject: { features: { floor: 4, coveredArea: 70 }, title: 'Paraguay 3682' } }
        expect(huellaDeEdicion(reordenado)).toBe(huellaDeEdicion(base))
    })
})

describe('cambioPorReglasActuales', () => {
    it('avisa cuando las reglas de hoy dan otro precio de publicación', () => {
        expect(cambioPorReglasActuales({ publicationPrice: 131000 }, { publicationPrice: 154000 }))
            .toEqual({ antes: 131000, despues: 154000 })
    })

    it('no avisa si el precio es el mismo', () => {
        expect(cambioPorReglasActuales({ publicationPrice: 193000 }, { publicationPrice: 193000 })).toBeNull()
    })

    it('no avisa si hoy no se puede calcular', () => {
        expect(cambioPorReglasActuales({ publicationPrice: 193000 }, null)).toBeNull()
    })
})
