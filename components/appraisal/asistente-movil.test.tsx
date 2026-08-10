// @vitest-environment happy-dom
/**
 * El layout ES la funcionalidad acá: no hay navegador para mirar, así que estos
 * tests fijan las clases de las que depende que el asistente de tasación se
 * pueda usar con una mano en un teléfono. Feo, pero es la única red que hay.
 *
 * Lo que protegen, en criollo:
 *  - la barra de pasos scrollea DENTRO de su caja en vez de arrastrar la página;
 *  - los títulos de los pasos no ocupan lugar en celular pero siguen existiendo
 *    para el lector de pantalla;
 *  - Anterior/Siguiente quedan pegados al piso de la pantalla y no al fondo del
 *    documento.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Stepper } from '@/components/ui/stepper'
import { PropertyWizard } from '@/components/appraisal/PropertyWizard'

beforeAll(() => {
    // El selector de barrio pide el catálogo al montar; sin esto el test se
    // llena de ruido de red que no tiene nada que ver con el layout.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })))
})

const PASOS = [
    { title: 'Ubicación' },
    { title: 'Superficies' },
    { title: 'Espacios' },
    { title: 'Edificio' },
    { title: 'Características' },
    { title: 'Imágenes' },
]

describe('Stepper — piso de celular', () => {
    it('scrollea dentro de su caja en vez de empujar la página de costado', () => {
        const { container } = render(<Stepper steps={PASOS} currentStep={0} />)
        const raiz = container.firstElementChild as HTMLElement

        expect(raiz.className).toContain('scroll-x-fade')
    })

    it('el scroller no le recorta el realce al paso actual (y no cuesta alto)', () => {
        // `overflow-x: auto` obliga al eje Y a `auto` también: todo lo que el
        // paso ACTUAL dibuja fuera de su caja —el `scale-110`, la `shadow-lg`
        // que llega ~18px por debajo del círculo, y sobre todo el `animate-ping`
        // que se expande al doble (24px por lado)— quedaba cortado con una línea
        // recta. En escritorio, donde no hay nada que deslizar, era puro daño.
        // El relleno le da lugar a la tinta; el margen negativo del MISMO tamaño
        // devuelve la caja a su lugar en el flujo, así que la barra mide y se
        // ubica igual que antes en todos los anchos. Suben o bajan JUNTOS.
        const { container } = render(<Stepper steps={PASOS} currentStep={0} />)
        const raiz = container.firstElementChild as HTMLElement

        expect(raiz.className).toContain('py-6')
        expect(raiz.className).toContain('-my-6')
    })

    it('la fila crece con su contenido pero nunca baja del ancho disponible', () => {
        const { container } = render(<Stepper steps={PASOS} currentStep={0} />)
        const fila = container.querySelector('.flex.items-center') as HTMLElement

        // Sin `w-max` el contenido se comprime y los círculos se deforman;
        // sin `min-w-full` los conectores se quedan sin ancho que repartir.
        expect(fila.className).toContain('w-max')
        expect(fila.className).toContain('min-w-full')
    })

    it('en celular los títulos dejan de ocupar lugar pero siguen para el lector de pantalla', () => {
        render(<Stepper steps={PASOS} currentStep={0} />)

        // Siguen en el árbol de accesibilidad: `sr-only`, no `hidden`.
        const titulo = screen.getByText('Características')
        expect(titulo.className).toContain('max-md:sr-only')
        expect(titulo.className).not.toContain('max-md:hidden')
    })

    it('los círculos se achican en celular y no se dejan aplastar', () => {
        const { container } = render(<Stepper steps={PASOS} currentStep={2} />)
        const circulos = container.querySelectorAll('.rounded-full.border-2')

        expect(circulos.length).toBe(PASOS.length)
        for (const c of circulos) {
            expect(c.className).toContain('max-md:h-10')
            expect(c.className).toContain('max-md:w-10')
        }
        // El contenedor de cada paso no puede encogerse: si se encoge, el
        // círculo se sale de su columna y la barra queda desalineada.
        const columnas = container.querySelectorAll('.flex.flex-col.items-center')
        for (const col of columnas) expect(col.className).toContain('shrink-0')
    })

    it('marca el paso actual para el lector de pantalla', () => {
        const { container } = render(<Stepper steps={PASOS} currentStep={3} />)
        const actuales = container.querySelectorAll('[aria-current="step"]')

        expect(actuales.length).toBe(1)
        expect(actuales[0].textContent).toBe('4')
    })
})

describe('PropertyWizard — Anterior y Siguiente alcanzables en celular', () => {
    function barraDeNavegacion() {
        render(<PropertyWizard onComplete={() => { }} />)
        const anterior = screen.getByRole('button', { name: /anterior/i })
        return { barra: anterior.parentElement as HTMLElement, anterior }
    }

    it('la barra se pega al piso de la pantalla en celular', () => {
        const { barra } = barraDeNavegacion()

        // Sin esto hay que scrollear hasta el fondo de un paso de 400px+ para
        // poder avanzar, y eso en los 6 pasos.
        expect(barra.className).toContain('max-md:sticky')
        expect(barra.className).toContain('max-md:bottom-0')
        // Y respeta la barra de gestos del teléfono.
        expect(barra.className).toContain('max-md:pb-safe')
    })

    it('en celular se reparte en dos renglones, así entra en un Android de 360px', () => {
        const { barra } = barraDeNavegacion()
        const paso = screen.getByText(/^Paso 1 de 6$/).parentElement as HTMLElement

        expect(barra.className).toContain('max-md:flex-wrap')
        // El indicador de paso se lleva el primer renglón entero…
        expect(paso.className).toContain('max-md:w-full')
        expect(paso.className).toContain('max-md:order-first')
        // …y los dos botones se reparten el segundo.
        expect(screen.getByRole('button', { name: /anterior/i }).className).toContain('max-md:flex-1')
        expect(screen.getByRole('button', { name: /siguiente/i }).className).toContain('max-md:flex-1')
    })

    it('el orden de escritorio no se toca: Anterior · Paso N · Siguiente', () => {
        const { barra } = barraDeNavegacion()
        const textos = Array.from(barra.children).map(h => h.textContent?.trim())

        // Se reordena con `order`, NO moviendo los nodos: en escritorio el
        // recorrido del DOM (y el del teclado) sigue siendo el de siempre.
        expect(textos[0]).toMatch(/Anterior/)
        expect(textos[1]).toMatch(/^Paso 1 de 6$/)
        expect(textos[2]).toMatch(/Siguiente/)
    })
})
