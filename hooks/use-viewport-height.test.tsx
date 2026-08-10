// @vitest-environment happy-dom
/**
 * `--app-vh` es la pieza que hace que el teclado deje de tapar cosas. Si el hook
 * no publica el valor, todo lo que mide con `h-app` / `max-h-[calc(var(--app-vh)…)]`
 * cae al `100dvh` de globals.css y volvemos al bug: en iOS el compositor del
 * chat y el pie de los diálogos quedan debajo del teclado.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { useViewportHeight } from './use-viewport-height'

function Sonda() {
    useViewportHeight()
    return null
}

type Escucha = { tipo: string; fn: () => void }

/** Un `visualViewport` de mentira con alto controlable. */
function montarVisualViewport(alto: number) {
    const escuchas: Escucha[] = []
    const vv = {
        height: alto,
        addEventListener: (tipo: string, fn: () => void) => escuchas.push({ tipo, fn }),
        removeEventListener: (tipo: string, fn: () => void) => {
            const i = escuchas.findIndex(e => e.tipo === tipo && e.fn === fn)
            if (i >= 0) escuchas.splice(i, 1)
        },
    }
    Object.defineProperty(window, 'visualViewport', { writable: true, configurable: true, value: vv })
    return {
        escuchas,
        /** Simula que el teclado subió / bajó. */
        cambiarAlto(nuevo: number) {
            vv.height = nuevo
            act(() => { escuchas.filter(e => e.tipo === 'resize').forEach(e => e.fn()) })
        },
        dispararScroll() {
            act(() => { escuchas.filter(e => e.tipo === 'scroll').forEach(e => e.fn()) })
        },
    }
}

const alto = () => document.documentElement.style.getPropertyValue('--app-vh')

beforeEach(() => {
    document.documentElement.style.removeProperty('--app-vh')
})

afterEach(() => {
    Object.defineProperty(window, 'visualViewport', { writable: true, configurable: true, value: undefined })
})

describe('useViewportHeight', () => {
    it('publica el alto visible apenas monta', () => {
        montarVisualViewport(844)
        render(<Sonda />)
        expect(alto()).toBe('844px')
    })

    it('sigue al teclado: cuando el viewport visual se achica, el valor baja', () => {
        const vv = montarVisualViewport(844)
        render(<Sonda />)

        vv.cambiarAlto(520) // teclado abierto
        expect(alto()).toBe('520px')

        vv.cambiarAlto(844) // teclado cerrado
        expect(alto()).toBe('844px')
    })

    it('redondea (el visual viewport devuelve fracciones y ensuciaría el estilo en cada cuadro)', () => {
        const vv = montarVisualViewport(844)
        render(<Sonda />)
        vv.cambiarAlto(643.328125)
        expect(alto()).toBe('643px')
    })

    it('no reescribe el estilo si el alto no cambió (el evento `scroll` llega en cada cuadro)', () => {
        const vv = montarVisualViewport(844)
        render(<Sonda />)
        const espia = vi.spyOn(document.documentElement.style, 'setProperty')

        vv.dispararScroll()
        vv.dispararScroll()

        expect(espia).not.toHaveBeenCalled()
        espia.mockRestore()
    })

    it('al desmontar suelta los dos oyentes y devuelve el valor por defecto de globals.css', () => {
        const vv = montarVisualViewport(844)
        const { unmount } = render(<Sonda />)
        expect(vv.escuchas.map(e => e.tipo).sort()).toEqual(['resize', 'scroll'])

        unmount()

        expect(vv.escuchas).toHaveLength(0)
        expect(alto()).toBe('')
    })

    it('sin `visualViewport` no explota (navegador viejo): se queda con el 100dvh de globals.css', () => {
        Object.defineProperty(window, 'visualViewport', { writable: true, configurable: true, value: undefined })
        expect(() => render(<Sonda />)).not.toThrow()
        expect(alto()).toBe('')
    })
})
