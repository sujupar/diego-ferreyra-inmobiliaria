import { describe, it, expect } from 'vitest'
import { featuresDelFormulario, type FormularioSujeto } from './formulario-sujeto'
import { calculateHomogenizedSurface } from './calculator'

const base: FormularioSujeto = {
    coveredArea: 60,
    semiCoveredArea: 10,
    uncoveredArea: 8,
    totalArea: '',
    rooms: 3,
    bedrooms: 2,
    bathrooms: 1,
    garages: '',
    floor: 4,
    totalFloors: 10,
    age: 20,
    disposition: 'FRONT',
    quality: 'GOOD',
    conservationState: 'STATE_2',
}

describe('featuresDelFormulario', () => {
    it('lleva la semicubierta al cálculo (antes se perdía al terminar el asistente)', () => {
        const f = featuresDelFormulario(base)
        expect(f.semiCoveredArea).toBe(10)
    })

    it('la superficie homologada cuenta la semicubierta al 50 %', () => {
        const f = featuresDelFormulario(base)
        expect(calculateHomogenizedSurface({
            coveredArea: f.coveredArea ?? undefined,
            semiCoveredArea: f.semiCoveredArea ?? undefined,
            uncoveredArea: f.uncoveredArea ?? undefined,
        })).toBe(60 + 5 + 4)
    })

    it('una semicubierta vacía queda null, no cero inventado', () => {
        expect(featuresDelFormulario({ ...base, semiCoveredArea: '' }).semiCoveredArea).toBeNull()
    })

    it('el total guardado es la superficie homologada que vio el asesor', () => {
        expect(featuresDelFormulario(base).totalArea).toBe(69)
    })

    it('piso 0 (planta baja) y antigüedad 0 (a estrenar) son valores reales', () => {
        const f = featuresDelFormulario({ ...base, floor: 0, age: 0 })
        expect(f.floor).toBe(0)
        expect(f.age).toBe(0)
    })

    it('piso y antigüedad vacíos quedan null', () => {
        const f = featuresDelFormulario({ ...base, floor: '', age: '' })
        expect(f.floor).toBeNull()
        expect(f.age).toBeNull()
    })

    it('los juicios vacíos (disposición, calidad, estado) quedan sin definir', () => {
        const f = featuresDelFormulario({ ...base, disposition: '', quality: '', conservationState: '' })
        expect(f.disposition).toBeUndefined()
        expect(f.quality).toBeUndefined()
        expect(f.conservationState).toBeUndefined()
    })
})
