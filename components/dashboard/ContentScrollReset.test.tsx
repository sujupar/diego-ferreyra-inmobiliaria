// @vitest-environment happy-dom
/**
 * Contracara obligatoria de la cadena de alto: desde que el scroller es
 * `#contenido` y no el documento, el navegador ya no tiene nada que llevar al
 * tope al cambiar de ruta. Sin esto, entrar a una propiedad desde el medio del
 * listado te deja mirando la mitad de la ficha nueva.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render } from '@testing-library/react'

let rutaActual = '/properties'
vi.mock('next/navigation', () => ({
    usePathname: () => rutaActual,
}))

import { ContentScrollReset } from './ContentScrollReset'

function montarPanel(scrollInicial: number) {
    const panel = document.createElement('div')
    panel.id = 'contenido'
    document.body.appendChild(panel)
    panel.scrollTop = scrollInicial
    return panel
}

beforeEach(() => {
    document.body.innerHTML = ''
    rutaActual = '/properties'
})

describe('ContentScrollReset', () => {
    it('lleva el área de contenido al tope al montar', () => {
        const panel = montarPanel(1200)
        render(<ContentScrollReset />)
        expect(panel.scrollTop).toBe(0)
    })

    it('vuelve al tope cada vez que cambia la ruta', () => {
        const panel = montarPanel(0)
        const { rerender } = render(<ContentScrollReset />)

        panel.scrollTop = 900
        rutaActual = '/properties/abc-123'
        rerender(<ContentScrollReset />)

        expect(panel.scrollTop).toBe(0)
    })

    it('no toca el scroll si la ruta no cambió (un re-render no te tira arriba mientras leés)', () => {
        const panel = montarPanel(0)
        const { rerender } = render(<ContentScrollReset />)

        panel.scrollTop = 900
        rerender(<ContentScrollReset />)

        expect(panel.scrollTop).toBe(900)
    })

    it('sin `#contenido` en el DOM no explota (páginas fuera del dashboard)', () => {
        expect(() => render(<ContentScrollReset />)).not.toThrow()
    })

    it('no dibuja nada', () => {
        const { container } = render(<ContentScrollReset />)
        expect(container.innerHTML).toBe('')
    })
})
