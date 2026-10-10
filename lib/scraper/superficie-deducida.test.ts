import { describe, it, expect } from 'vitest'
import { completarDescubiertaDeducida, confirmarDescubierta, type SuperficiesDeAviso } from './superficie-deducida'

const aviso = (s: SuperficiesDeAviso): SuperficiesDeAviso => s

describe('completarDescubiertaDeducida', () => {
    it('si el portal solo da total y cubierta, deduce la descubierta y lo marca', () => {
        const f = completarDescubiertaDeducida(aviso({ coveredArea: 50, totalArea: 62, uncoveredArea: null }))
        expect(f.uncoveredArea).toBe(12)
        expect(f.uncoveredAreaDeducida).toBe(true)
    })

    it('si la diferencia es negativa deduce 0, igual marcada para revisar', () => {
        const f = completarDescubiertaDeducida(aviso({ coveredArea: 70, totalArea: 62, uncoveredArea: null }))
        expect(f.uncoveredArea).toBe(0)
        expect(f.uncoveredAreaDeducida).toBe(true)
    })

    it('si el portal informó la descubierta, no la toca ni la marca', () => {
        const f = completarDescubiertaDeducida(aviso({ coveredArea: 50, totalArea: 62, uncoveredArea: 5 }))
        expect(f.uncoveredArea).toBe(5)
        expect(f.uncoveredAreaDeducida).toBeUndefined()
    })

    it('sin total o sin cubierta no deduce nada', () => {
        expect(completarDescubiertaDeducida(aviso({ coveredArea: 50, totalArea: null, uncoveredArea: null })).uncoveredArea).toBeNull()
        expect(completarDescubiertaDeducida(aviso({ coveredArea: null, totalArea: 62, uncoveredArea: null })).uncoveredArea).toBeNull()
    })

    it('no muta el objeto recibido', () => {
        const original = aviso({ coveredArea: 50, totalArea: 62, uncoveredArea: null })
        completarDescubiertaDeducida(original)
        expect(original.uncoveredArea).toBeNull()
    })
})

describe('confirmarDescubierta', () => {
    it('cargar o confirmar la descubierta quita la marca de deducida', () => {
        const f = confirmarDescubierta({ coveredArea: 50, totalArea: 62, uncoveredArea: 12, uncoveredAreaDeducida: true }, 8)
        expect(f.uncoveredArea).toBe(8)
        expect(f.uncoveredAreaDeducida).toBeUndefined()
    })

    it('confirmar sin valor deja la deducida como buena', () => {
        const f = confirmarDescubierta({ coveredArea: 50, totalArea: 62, uncoveredArea: 12, uncoveredAreaDeducida: true })
        expect(f.uncoveredArea).toBe(12)
        expect(f.uncoveredAreaDeducida).toBeUndefined()
        expect(JSON.parse(JSON.stringify(f))).not.toHaveProperty('uncoveredAreaDeducida')
    })
})
