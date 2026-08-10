/**
 * Dos daños COLATERALES del sistema móvil que no se ven en ninguna pantalla de
 * teléfono: uno sale por la impresora y el otro solo en celulares GRANDES.
 * Ninguno de los dos lo atrapa un test de componente, y no hay navegador acá.
 *
 * 1. LA IMPRESIÓN. La Fase 0 convirtió el área de contenido en el scroller de
 *    la app (`SidebarInset` mide `--app-vh` y no desborda; el que scrollea pasó
 *    a ser `#contenido`). Al imprimir, el navegador recorta cada caja a su
 *    región visible: el informe de tasación pasó a salir de UNA pantalla. Es la
 *    única función de impresión del sistema y se descubrió leyendo el diff, no
 *    usándola.
 *
 * 2. EL BREAKPOINT `xs`. Declararlo en `@theme` no es gratis: Tailwind le suma
 *    a `.container` un escalón `max-width` por CADA breakpoint declarado. O sea
 *    que toda pantalla con `container` quedó CAPADA a 375px entre 375 y 639px
 *    de ventana — más angosta en un iPhone de 430px que en uno de 375. Es
 *    silencioso: no rompe nada, solo encoge.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const raiz = resolve(__dirname, '..')
const css = readFileSync(resolve(raiz, 'app/globals.css'), 'utf8')

/** Cuántas llaves quedan abiertas antes de `indice`. 0 = fuera de todo `@layer`. */
function profundidad(texto: string, indice: number): number {
    let nivel = 0
    for (let i = 0; i < indice; i++) {
        if (texto[i] === '{') nivel++
        else if (texto[i] === '}') nivel--
    }
    return nivel
}

describe('impresión — la cadena de alto se deshace en el papel', () => {
    const inicio = css.indexOf('@media print')
    const bloque = inicio === -1 ? '' : css.slice(inicio, css.indexOf('\n}', inicio) + 2)

    it('existe un bloque `@media print`', () => {
        expect(inicio, 'sin esto el informe de tasación sale de una sola pantalla').toBeGreaterThan(-1)
    })

    it('el contenedor de alto fijo pasa a alto automático y desborde visible', () => {
        // `SidebarInset` es `h-app min-h-0 overflow-hidden` en pantalla: con eso
        // puesto, el navegador imprime únicamente lo que entra en esa caja.
        expect(bloque).toMatch(/\[data-slot='sidebar-inset'\] \{[\s\S]*?height: auto;/)
        expect(bloque).toMatch(/\[data-slot='sidebar-inset'\] \{[\s\S]*?overflow: visible;/)
    })

    it('el scroller del contenido deja de recortar', () => {
        // `#contenido` lleva `scroll-pane` (`overflow-y: auto`), que es el que
        // corta el informe a la altura de la ventana.
        expect(bloque).toMatch(/#contenido \{\s*overflow: visible;\s*\}/)
    })

    it('va FUERA de `@layer`, o pierde contra `h-app` y `scroll-pane`', () => {
        // Las dos son utilidades de Tailwind y viven en capa. El CSS sin capa le
        // gana a cualquier capa, sin importar especificidad ni orden; adentro de
        // una, esta regla sería una moneda al aire.
        expect(profundidad(css, inicio)).toBe(0)
    })

    it('el único `window.print()` del sistema sigue siendo el del informe', () => {
        // Si aparece otro consumidor, hay que verificar que su pantalla también
        // cuelgue de `#contenido` — si algún día algo imprime desde otro
        // contenedor de alto fijo, estas reglas no lo alcanzan.
        const consumidores: string[] = []
        const recorrer = (dir: string) => {
            for (const entrada of readdirSync(dir, { withFileTypes: true })) {
                if (entrada.name === 'node_modules' || entrada.name.startsWith('.')) continue
                const ruta = join(dir, entrada.name)
                if (entrada.isDirectory()) recorrer(ruta)
                else if (/\.(tsx?|jsx?)$/.test(entrada.name) && !entrada.name.includes('.test.')) {
                    if (readFileSync(ruta, 'utf8').includes('window.print()')) consumidores.push(ruta)
                }
            }
        }
        for (const carpeta of ['app', 'components', 'lib']) recorrer(resolve(raiz, carpeta))
        expect(consumidores.map(r => r.slice(raiz.length + 1))).toEqual([
            'app/(dashboard)/appraisal/new/page.tsx',
        ])
    })
})

describe('`container` — el breakpoint `xs` lo vuelve una trampa', () => {
    /** Todos los `.tsx` bajo `app/(dashboard)`. */
    function pantallas(): string[] {
        const encontradas: string[] = []
        const recorrer = (dir: string) => {
            for (const entrada of readdirSync(dir, { withFileTypes: true })) {
                if (entrada.name === 'node_modules') continue
                const ruta = join(dir, entrada.name)
                if (entrada.isDirectory()) recorrer(ruta)
                else if (entrada.name.endsWith('.tsx') && !entrada.name.includes('.test.')) {
                    encontradas.push(ruta)
                }
            }
        }
        recorrer(resolve(raiz, 'app/(dashboard)'))
        return encontradas
    }

    it('ninguna pantalla del dashboard usa la clase `container`', () => {
        // `--breakpoint-xs: 23.4375rem` en `@theme` le agrega a `.container` un
        // `@media (width >= 375px) { max-width: 375px }`. Toda pantalla con
        // `container` queda capada a 375px entre 375 y 639px: MÁS ANGOSTA en un
        // teléfono de 414 o 430px que en uno de 375, con dos franjas muertas a
        // los costados. Y el relleno ya lo pone el layout (`p-4 md:p-6`), así
        // que la clase tampoco aportaba nada.
        const culpables: string[] = []
        for (const ruta of pantallas()) {
            const fuente = readFileSync(ruta, 'utf8')
            for (const m of fuente.matchAll(/className=(?:"|'|\{`)([^"'`]*)/g)) {
                if (/(^|\s)container(\s|$)/.test(m[1])) {
                    culpables.push(ruta.slice(raiz.length + 1))
                    break
                }
            }
        }
        expect(culpables, `pantallas capadas a 375px: ${culpables.join(', ')}`).toEqual([])
    })

    it('el breakpoint `xs` se declara porque HAY quien lo usa', () => {
        // No es un breakpoint decorativo: si se lo borra, `max-xs:grid-cols-1`
        // y `xs:grid-cols-3` se compilan a NADA, en silencio. Por eso el arreglo
        // del `container` fue sacar la clase y no sacar el breakpoint.
        expect(css).toMatch(/--breakpoint-xs:\s*23\.4375rem/)
        const usuarios = [
            'components/pipeline/VisitDataForm.tsx',
            'components/properties/detail/PropertyKeyStats.tsx',
        ]
        for (const ruta of usuarios) {
            expect(readFileSync(resolve(raiz, ruta), 'utf8')).toMatch(/\bmax-xs:|\bxs:/)
        }
    })
})
