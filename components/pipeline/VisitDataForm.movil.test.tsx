// @vitest-environment happy-dom
/**
 * `VisitDataForm` es el formulario que el asesor completa PARADO EN LA
 * PROPIEDAD: el caso de uso móvil más importante del sistema. Estos tests fijan
 * lo que en un navegador se vería de una y acá no se puede ver.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { VisitDataForm } from '@/components/pipeline/VisitDataForm'

beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })))
})

function montar() {
    return render(<VisitDataForm dealId="deal-1" initial={null} onCompleted={() => { }} />)
}

describe('VisitDataForm — piso de celular', () => {
    it('las grillas bajan a una columna en los teléfonos más angostos', () => {
        const { container } = montar()
        const grillas = container.querySelectorAll('.grid.grid-cols-2')

        expect(grillas.length).toBeGreaterThan(0)
        for (const g of grillas) {
            // Dos columnas en 320px dejan ~124px por campo: no entra ni la
            // etiqueta "Estado conservación".
            expect(g.className).toContain('max-xs:grid-cols-1')
            // Y el escritorio no se toca.
            expect(g.className).toContain('md:grid-cols-3')
        }
    })

    it('todos los desplegables crudos tienen alto de dedo en celular', () => {
        const { container } = montar()
        const selects = container.querySelectorAll('select')

        expect(selects.length).toBeGreaterThan(5)
        for (const sel of selects) {
            expect(sel.className).toContain('max-md:min-h-11')
        }
    })

    it('"Sí, refaccionado" conmuta la casilla al tocar el texto', () => {
        montar()
        const texto = screen.getByText('Sí, refaccionado')
        const fila = texto.closest('label')

        // Era un <div>: tocar el texto no hacía nada y había que acertarle al
        // cuadradito de 16px.
        expect(fila).not.toBeNull()
        expect(fila!.querySelector('input[type="checkbox"]')).not.toBeNull()
    })

    it('los chips de características constructivas son botones de verdad', () => {
        montar()
        const chip = screen.getByRole('button', { name: 'Pisos madera' })

        // Antes eran <div onClick>: sin teclado, sin estado anunciado.
        expect(chip.tagName).toBe('BUTTON')
        expect(chip.getAttribute('type')).toBe('button')
        expect(chip.getAttribute('aria-pressed')).toBe('false')
    })

    it('los campos de plata y metros piden el teclado con separador decimal', () => {
        const { container } = montar()
        const cubiertos = container.querySelector('input[type="number"]:not([readonly])')

        // Metrajes, presupuestos, sellos y honorarios: `decimal`.
        const decimales = container.querySelectorAll('input[inputmode="decimal"]')
        expect(decimales.length).toBeGreaterThan(0)
        expect(cubiertos).not.toBeNull()
    })

    it('las cantidades enteras piden el teclado de dígitos', () => {
        const { container } = montar()
        const enteros = container.querySelectorAll('input[inputmode="numeric"]')

        // Ambientes, dormitorios, baños, cocheras, antigüedad, plantas.
        expect(enteros.length).toBeGreaterThanOrEqual(6)
    })

    it('el piso NO fuerza teclado numérico: hay subsuelos y falta el signo menos', () => {
        const { container } = montar()
        const etiquetaPiso = Array.from(container.querySelectorAll('label'))
            .find(l => l.textContent?.trim() === 'Piso')
        const campoPiso = etiquetaPiso?.parentElement?.querySelector('input')

        expect(campoPiso).not.toBeNull()
        expect(campoPiso!.getAttribute('inputmode')).toBeNull()
    })
})
