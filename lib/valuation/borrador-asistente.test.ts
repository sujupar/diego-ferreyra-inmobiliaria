import { describe, it, expect } from 'vitest'
import { CLAVE_BORRADOR_LEGACY, claveDeBorrador, leerBorrador } from './borrador-asistente'

function almacen(inicial: Record<string, string> = {}) {
    const datos = new Map(Object.entries(inicial))
    return {
        datos,
        getItem: (k: string) => datos.get(k) ?? null,
        removeItem: (k: string) => { datos.delete(k) },
    }
}

describe('claveDeBorrador', () => {
    it('cada proceso tiene su propio borrador', () => {
        expect(claveDeBorrador('deal-1')).not.toBe(claveDeBorrador('deal-2'))
    })

    it('sin proceso no hay borrador', () => {
        expect(claveDeBorrador(null)).toBeNull()
        expect(claveDeBorrador(undefined)).toBeNull()
    })
})

describe('leerBorrador', () => {
    it('una nueva tasación nunca lee el borrador global de otra (el de antes)', () => {
        const s = almacen({ [CLAVE_BORRADOR_LEGACY]: JSON.stringify({ address: 'Otra 123' }) })
        expect(leerBorrador(s, claveDeBorrador('deal-1'), false)).toBeNull()
        expect(s.datos.has(CLAVE_BORRADOR_LEGACY)).toBe(false)
    })

    it('el borrador de OTRO proceso no se restaura', () => {
        const s = almacen({ [claveDeBorrador('deal-2') as string]: JSON.stringify({ address: 'Otra 123' }) })
        expect(leerBorrador(s, claveDeBorrador('deal-1'), false)).toBeNull()
    })

    it('el borrador del MISMO proceso se restaura (recarga a mitad del asistente)', () => {
        const clave = claveDeBorrador('deal-1')
        const s = almacen({ [clave as string]: JSON.stringify({ address: 'Mía 456' }) })
        expect(leerBorrador(s, clave, false)).toEqual({ address: 'Mía 456' })
    })

    it('con datos iniciales (edición o visita) no se restaura y se limpia', () => {
        const clave = claveDeBorrador('deal-1') as string
        const s = almacen({ [clave]: JSON.stringify({ address: 'Mía 456' }) })
        expect(leerBorrador(s, clave, true)).toBeNull()
        expect(s.datos.has(clave)).toBe(false)
    })

    it('un borrador corrupto se descarta', () => {
        const clave = claveDeBorrador('deal-1') as string
        const s = almacen({ [clave]: '{roto' })
        expect(leerBorrador(s, clave, false)).toBeNull()
        expect(s.datos.has(clave)).toBe(false)
    })
})
