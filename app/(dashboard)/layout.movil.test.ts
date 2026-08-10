/**
 * Contrato del MARCO en celular (Fase 0 del sistema responsive).
 *
 * Son tres cosas que solo existen como clases y como un `export const viewport`,
 * y que ningún test de comportamiento puede ver: el layout del dashboard es un
 * componente de servidor con Supabase adentro y `app/layout.tsx` importa fuentes
 * de Next, así que ninguno de los dos se puede renderizar acá. Lo que sí se
 * puede es leer el archivo y fijar el contrato — que es exactamente lo que hace
 * `InboxTabs.test.ts` con el alto del chat, por el mismo motivo.
 *
 * Las tres cosas, y qué pasa si alguien las deshace:
 *   · el viewport con `viewport-fit=cover` y SIN bloqueo de zoom;
 *   · la cadena de alto (`h-app` arriba, `scroll-pane flex-1 min-h-0` abajo),
 *     que es lo que descuenta los carteles solo y lo que hace que el `sticky` de
 *     la ficha de propiedad se pegue donde tiene que pegarse;
 *   · el barrido de `vh` → `dvh`, que en iOS es la diferencia entre "entra en la
 *     pantalla" y "el botón de guardar quedó abajo del pliegue".
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const raiz = resolve(__dirname, '../..')
const leer = (rel: string) => readFileSync(resolve(raiz, rel), 'utf8')

const layoutRaiz = leer('app/layout.tsx')
const layoutDashboard = leer('app/(dashboard)/layout.tsx')

/** Las clases del contenedor `#contenido`. */
function clasesDelContenido(): string[] {
    const m = layoutDashboard.match(/id="contenido"[^>]*className="([^"]+)"/)
    expect(m, 'no se encontró el contenedor #contenido').toBeTruthy()
    return m![1].split(/\s+/)
}

/** Las clases del `SidebarInset`. */
function clasesDelInset(): string[] {
    const m = layoutDashboard.match(/<SidebarInset className="([^"]+)"/)
    expect(m, 'no se encontró el SidebarInset').toBeTruthy()
    return m![1].split(/\s+/)
}

/** El cuerpo del `export const viewport`, sin comentarios (los comentarios
 *  NOMBRAN a propósito lo que está prohibido, y no se los puede confundir con
 *  código de verdad). */
function cuerpoDelViewport(): string {
    const m = layoutRaiz.match(/export const viewport: Viewport = \{([\s\S]*?)\n\};/)
    expect(m, 'no se encontró el `export const viewport` de app/layout.tsx').toBeTruthy()
    return m![1].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('app/layout.tsx — el viewport', () => {
    it('declara `viewport-fit: cover` (lo que necesita el chat a pantalla completa)', () => {
        expect(cuerpoDelViewport()).toMatch(/viewportFit: "cover"/)
    })

    it('deja el zoom LIBRE — bloquearlo es una falla de accesibilidad', () => {
        const cuerpo = cuerpoDelViewport()
        expect(cuerpo).toMatch(/initialScale: 1/)
        expect(cuerpo).not.toMatch(/maximumScale/)
        expect(cuerpo).not.toMatch(/userScalable/)
    })

    it('le pide a Chrome Android que el teclado ACHIQUE el contenido', () => {
        expect(cuerpoDelViewport()).toMatch(/interactiveWidget: "resizes-content"/)
    })

    it('`viewport-fit: cover` viaja JUNTO con las áreas seguras (o las dos, o ninguna)', () => {
        // Sin `env(safe-area-inset-*)`, `cover` manda todo lo pegado abajo debajo
        // de la barra de gestos del iPhone de un saque.
        const css = leer('app/globals.css')
        expect(css).toContain('env(safe-area-inset-bottom')
        expect(css).toContain('--safe-b')
    })
})

describe('app/(dashboard)/layout.tsx — la cadena de alto', () => {
    it('el área de contenido mide el alto REAL de la ventana y no scrollea', () => {
        const clases = clasesDelInset()
        expect(clases, 'sin `h-app` el marco vuelve a fluir con el documento').toContain('h-app')
        expect(clases).toContain('min-h-0')
        expect(clases).toContain('overflow-hidden')
    })

    it('no pierde el `min-w-0` que evita que una tabla ancha estire el marco', () => {
        expect(clasesDelInset()).toContain('min-w-0')
    })

    it('`#contenido` es EL scroller de la app y contiene su propio gesto', () => {
        const clases = clasesDelContenido()
        // `scroll-pane` (globals.css) = overflow-y auto + overscroll contain.
        expect(clases).toContain('scroll-pane')
        expect(clases).toContain('flex')
        expect(clases).toContain('flex-col')
        expect(clases).toContain('flex-1')
        // `min-h-0`: sin esto un hijo `flex-1` no se puede achicar y desborda.
        expect(clases).toContain('min-h-0')
    })

    it('conserva el padding de siempre (hay otro test que le hace la cuenta al chat)', () => {
        const clases = clasesDelContenido()
        expect(clases).toContain('p-4')
        expect(clases).toContain('md:p-6')
    })

    it('los dos carteles de estado son `shrink-0`: se descuentan del alto, no se aplastan', () => {
        expect(layoutDashboard).toMatch(/shrink-0 bg-amber-500/)
        expect(layoutDashboard).toMatch(/<div className="shrink-0">\s*<ImpersonationBanner/)
    })

    it('monta las dos sondas de cliente sin las cuales la cadena de alto miente', () => {
        // `--app-vh` (alto real, sigue al teclado) y el reseteo del scroll al
        // navegar, que el navegador ya no hace porque el scroller no es el documento.
        expect(layoutDashboard).toContain('<ViewportProbe />')
        expect(layoutDashboard).toContain('<ContentScrollReset />')
    })
})

describe('barrido de `vh` → `dvh` (en iOS `vh` es el viewport GRANDE y miente ~110px)', () => {
    /**
     * Cada uno de estos tenía un síntoma concreto: la tarjeta de login corrida y
     * con scroll fantasma, el panel del cliente con la X arriba del borde de la
     * pantalla, el visor de PDF con los controles abajo del pliegue, los dos
     * modales del pipeline arrancando fuera de cuadro, la foto de la ficha más
     * alta que la pantalla.
     */
    const archivos = [
        'app/(auth)/layout.tsx',
        'app/questionnaire/[token]/page.tsx',
        'app/questionnaire/[token]/thanks/page.tsx',
        'components/inbox/ContactPanel.tsx',
        'components/appraisal/PDFPreviewModal.tsx',
        'app/(dashboard)/pipeline/[id]/page.tsx',
        'components/properties/detail/PropertyHeroGallery.tsx',
    ]

    it.each(archivos)('%s ya no usa alturas en `vh`', (rel) => {
        // Solo se miran los className: en los comentarios `vh` y `min-h-screen`
        // se nombran a propósito, para que se entienda por qué se fueron.
        const clases = [...leer(rel).matchAll(/className="([^"]*)"/g)].map(m => m[1])
        // Solo alturas: `max-w-[92vw]` es horizontal y no tiene este problema.
        const sospechosos = clases.flatMap(c => [...c.matchAll(/(?:max-)?h-\[[\d.]+vh\]|min-h-screen/g)].map(m => m[0]))
        expect(sospechosos, `quedaron alturas en vh: ${sospechosos.join(', ')}`).toEqual([])
    })

    it('el panel del cliente del chat pasó a `dvh` y respeta la barra de gestos', () => {
        const panel = leer('components/inbox/ContactPanel.tsx')
        expect(panel).toContain('max-h-[85dvh]')
        expect(panel).toContain('pb-[var(--safe-b)]')
    })
})
