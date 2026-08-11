/**
 * Contrato del ANCHO en celular: ninguna pantalla del dashboard arrastra la
 * página de costado.
 *
 * POR QUÉ ESTE TEST ES UN ESCÁNER DE ARCHIVOS Y NO UN RENDER. Acá no hay
 * navegador: happy-dom no maqueta, así que un `render()` de la pantalla no sabe
 * cuánto mide nada — `offsetWidth` es 0 para todo y `scrollWidth` también. Y
 * Turbopack ni siquiera compila el proyecto en local (el acento de "Gestión" en
 * la ruta). O sea que el desborde REAL solo se ve en un teléfono. Lo que sí se
 * puede fijar, y es lo que se fija acá, son las DOS reglas estructurales que lo
 * producen — porque el bug de agosto no fue un caso suelto, fue una clase:
 *
 *   1. TODA RAÍZ DE PANTALLA TIENE ANCHO DEFINIDO. `#contenido` es un flex en
 *      columna; un hijo con `mx-auto` (márgenes automáticos en el eje CRUZADO)
 *      NO se estira: su ancho pasa a ser `fit-content`, que nunca baja del
 *      min-content de lo que lleva adentro. Un `min-w-max` enterrado tres
 *      niveles más abajo termina ensanchando la pantalla entera, y los
 *      deslizadores que se le pusieron a la tabla o a las pestañas quedan
 *      ANULADOS (no tienen nada que deslizar: ya entran, porque la que se corrió
 *      fue la página). `w-full` corta esa propagación de raíz.
 *
 *   2. LO QUE MIDE MÁS QUE LA PANTALLA VIAJA EN SU PROPIO DESLIZADOR. `w-max` y
 *      `min-w-max` son declaraciones de "no me achico": adentro de un
 *      `overflow-x` son legítimas (el contenido se desliza ahí adentro), sueltas
 *      son el empujón.
 *
 * La red de seguridad (`#contenido { overflow-x: hidden }`) la fija
 * `app/globals.movil.test.ts`. Va junto con esto y no en lugar de esto: sola,
 * lo que sobra queda INALCANZABLE detrás del recorte.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, relative } from 'node:path'

const raizProyecto = resolve(__dirname, '../..')
const leer = (rel: string) => readFileSync(resolve(raizProyecto, rel), 'utf8')

/** Sin comentarios: la prosa NOMBRA a propósito lo que ya no se usa. */
const sinComentarios = (fuente: string) =>
    fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

function tsxDe(dirRelativo: string): string[] {
    const out: string[] = []
    const recorrer = (dir: string) => {
        for (const nombre of readdirSync(dir)) {
            const abs = resolve(dir, nombre)
            if (statSync(abs).isDirectory()) recorrer(abs)
            else if (/\.tsx$/.test(nombre) && !/\.test\.tsx$/.test(nombre)) out.push(abs)
        }
    }
    recorrer(resolve(raizProyecto, dirRelativo))
    return out
}

describe('1 · toda raíz de pantalla tiene ancho definido', () => {
    /**
     * Las raíces de retorno: lo PRIMERO que devuelve un `return`. Es lo que
     * `#contenido` recibe como hijo directo (o lo que un componente de pantalla
     * le entrega a esa raíz), y por lo tanto lo que puede quedar en
     * `fit-content` y filtrar hacia arriba el min-content de todo lo de adentro.
     */
    const RAIZ_DE_RETORNO =
        /return\s*\(?\s*\n?\s*<[A-Za-z][\w.]*\s+className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g

    const ANCHO_DEFINIDO = /\bw-full\b|\bw-auto\b|\bw-\[/

    it('ninguna raíz con `mx-auto` se queda sin `w-full` (el patrón que rompió 19 pantallas)', () => {
        const culpables: string[] = []
        for (const abs of tsxDe('app/(dashboard)')) {
            const src = sinComentarios(readFileSync(abs, 'utf8'))
            for (const m of src.matchAll(RAIZ_DE_RETORNO)) {
                const clases = m[1] ?? m[2] ?? m[3] ?? ''
                if (!/\bmx-auto\b/.test(clases)) continue
                if (ANCHO_DEFINIDO.test(clases)) continue
                const linea = src.slice(0, m.index).split('\n').length
                culpables.push(`${relative(raizProyecto, abs)}:${linea} → "${clases.trim()}"`)
            }
        }
        expect(
            culpables,
            'raíces centradas sin ancho definido (quedan en `fit-content` y empujan la página):\n' +
                culpables.join('\n'),
        ).toEqual([])
    })

    it('el Inbox, la ficha de propiedad y los dos asistentes —los cuatro del reporte— lo tienen', () => {
        // Los cuatro casos que el dueño fotografió, clavados por nombre: si
        // alguien "limpia" el `w-full` de alguno, vuelve el corrimiento de ~110
        // a ~195px que se ve en las capturas.
        const casos: [string, string][] = [
            ['app/(dashboard)/inbox/InboxTabs.tsx', "'w-full space-y-6 max-w-7xl mx-auto'"],
            ['app/(dashboard)/properties/[id]/page.tsx', '"w-full space-y-6 max-w-6xl mx-auto pb-10"'],
            ['app/(dashboard)/properties/new/page.tsx', '"w-full space-y-6 max-w-3xl mx-auto"'],
            ['app/(dashboard)/appraisal/new/page.tsx', '"w-full max-w-5xl mx-auto space-y-12 pb-20"'],
        ]
        for (const [archivo, clases] of casos) {
            expect(leer(archivo), `${archivo} perdió su ancho definido`).toContain(clases)
        }
    })

    it('el `w-full` NO se cuela en escritorio como un cambio de diseño', () => {
        // `w-full max-w-Nxl mx-auto` es el modismo canónico de contenedor
        // centrado: en una pantalla ancha el `max-w` manda igual que antes y los
        // márgenes automáticos siguen centrando. Lo que cambia es solo el piso.
        const raiz = leer('app/(dashboard)/properties/[id]/page.tsx')
        expect(raiz).toContain('max-w-6xl')
        expect(raiz).toContain('mx-auto')
    })
})

describe('2 · lo que mide más que la pantalla viaja en su propio deslizador', () => {
    /**
     * `w-max` / `min-w-max` dicen "no me achico". Adentro de un `overflow-x` es
     * exactamente lo que se quiere (el contenido se desliza ahí adentro); sueltos
     * son el empujón que corre la página. Se mira la ventana de texto anterior
     * porque el scroller es el elemento que envuelve, y en este proyecto está
     * siempre a uno o dos niveles (a veces detrás de un `cn(...)`, que ningún
     * `match` de `className="..."` a secas ve).
     */
    const DECLARA_SCROLLER = /scroll-x-fade|overflow-x-auto|overflow-x-scroll|tabla-desliza/

    it('los tres `min-w-max` / `w-max` del dashboard están adentro de uno', () => {
        const sinCubrir: string[] = []
        let encontrados = 0
        for (const abs of [...tsxDe('app/(dashboard)'), ...tsxDe('components')]) {
            // Las landings públicas no viven adentro de `#contenido` y tienen su
            // propio sistema de ancho.
            if (abs.includes('/components/landing/')) continue
            const src = sinComentarios(readFileSync(abs, 'utf8'))
            for (const m of src.matchAll(/\b(?:min-)?w-max\b/g)) {
                encontrados++
                const ventana = src.slice(Math.max(0, m.index - 600), m.index)
                if (DECLARA_SCROLLER.test(ventana)) continue
                const linea = src.slice(0, m.index).split('\n').length
                sinCubrir.push(`${relative(raizProyecto, abs)}:${linea}`)
            }
        }
        expect(encontrados, 'el escáner no encontró ningún `w-max`: revisá el patrón').toBeGreaterThan(0)
        expect(
            sinCubrir,
            'anchos indivisibles sin deslizador propio (empujan la página):\n' + sinCubrir.join('\n'),
        ).toEqual([])
    })

    it('la fila de fechas del filtro puede envolver (dos `w-36` + botón no entran en un teléfono)', () => {
        // ~420px contra 358 útiles. Aparece en Contactos, Propiedades, Visitas,
        // Tasaciones y CRM — es un solo componente y cinco pantallas.
        const filtro = sinComentarios(leer('components/filters/DateRangeFilter.tsx'))
        expect(filtro).toContain('flex flex-wrap items-center gap-2')
    })
})

describe('3 · el marco mide el alto UNA sola vez (el menú de abajo queda abajo)', () => {
    const sidebar = sinComentarios(leer('components/ui/sidebar.tsx'))
    const layout = leer('app/(dashboard)/layout.tsx')

    it('el envoltorio y el contenido leen la MISMA variable', () => {
        // Antes: envoltorio `min-h-svh` (viewport de LAYOUT chico) contra
        // contenido `h-app` (viewport VISUAL de ahora mismo). Cuando el visual
        // queda por debajo del `svh` —teclado recién cerrado, `viewport-fit=cover`
        // con la barra flotante de Safari, zoom con dos dedos— el envoltorio
        // queda más alto que su único hijo y abajo asoma una franja muerta: el
        // "hay un espacio abajo y el menú queda completamente subido" de
        // Contactos.
        expect(sidebar).toMatch(/group\/sidebar-wrapper[^"]*\bh-app\b/)
        expect(sidebar, 'volvió el `min-h-svh`, que es la segunda medida').not.toContain('min-h-svh')
        expect(layout).toMatch(/<SidebarInset className="[^"]*h-app[^"]*"/)
    })

    it('el documento no puede scrollear (o en iOS la barra colapsa y el número se mueve solo)', () => {
        // Si el documento scrollea, iOS colapsa la barra del navegador →
        // `--app-vh` crece → el documento scrollea más. `overflow-hidden` en el
        // envoltorio corta ese lazo: el único que scrollea es `#contenido`.
        expect(sidebar).toMatch(/group\/sidebar-wrapper[^"]*\boverflow-hidden\b/)
    })

    it('sin JavaScript, o antes de que el hook mida, el alto ya vale la ventana entera', () => {
        // `--app-vh` trae su propio valor por omisión desde `:root`, así que la
        // PRIMERA pintura ya mide bien y el menú arranca pegado al piso — no
        // espera a `useViewportHeight`.
        expect(leer('app/globals.css')).toContain('--app-vh: 100dvh;')
    })

    it('la barra inferior sigue siendo hermana del contenido y `shrink-0`', () => {
        // Es lo que la hace ocupar su propio lugar en la cadena de alto en vez
        // de flotar por encima (y lo que evita que el flex la aplaste).
        expect(layout).toMatch(/<BottomNavForRole role=\{user\.profile\.role\} \/>/)
        expect(leer('components/nav/BottomNav.tsx')).toMatch(/flex shrink-0 items-stretch border-t/)
    })

    it('y sigue respetando la barra de gestos del iPhone', () => {
        // `pb-safe` = `max(0.75rem, env(safe-area-inset-bottom))`. Sacarlo para
        // "subir el menú" lo mandaría abajo del indicador de inicio.
        expect(leer('components/nav/BottomNav.tsx')).toContain('pb-safe')
    })
})
