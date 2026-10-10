import { describe, it, expect } from 'vitest'
import { formatMiles, formatNumero } from './utils'

describe('formatMiles — columna "Valor" del Mapa de Valor (C4)', () => {
    it('muestra miles con k', () => {
        expect(formatMiles(125_000)).toBe('125k')
    })

    it('sin precio muestra "—", nunca "0k"', () => {
        expect(formatMiles(null)).toBe('—')
        expect(formatMiles(undefined)).toBe('—')
        expect(formatMiles(0)).toBe('—')
    })

    it('usa separador argentino en los miles de miles', () => {
        expect(formatMiles(1_250_000)).toBe('1.250k')
    })
})

describe('formatNumero — formato argentino en todo el PDF (C4)', () => {
    it('separa miles con punto', () => {
        expect(formatNumero(214_000)).toBe('214.000')
    })

    it('redondea a entero', () => {
        expect(formatNumero(1234.6)).toBe('1.235')
    })

    it('un valor no numérico se muestra como "—"', () => {
        expect(formatNumero(Number.NaN)).toBe('—')
        expect(formatNumero(undefined)).toBe('—')
    })
})
