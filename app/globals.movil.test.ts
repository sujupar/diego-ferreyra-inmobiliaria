/**
 * Contrato del bloque base del SISTEMA RESPONSIVE en `app/globals.css`.
 *
 * Nada de esto se puede observar renderizando: son reglas de CSS global cuyo
 * efecto solo existe en un navegador de verdad, y acá no hay ninguno (Turbopack
 * ni siquiera compila el proyecto en local por el acento de "Gestión" en la
 * ruta). Un test de texto sobre un archivo CSS es feo, pero es la única red que
 * queda — y las cuatro cosas que fija son exactamente las que, si alguien las
 * "limpia" por parecer redundantes, rompen la app entera en el teléfono sin que
 * ningún otro test se entere:
 *
 *   1. que la regla de los 16px esté FUERA de `@layer` (si entra en una capa,
 *      pierde contra los ~131 `text-sm` escritos a mano y vuelve el zoom de iOS);
 *   2. que el `overflow-x` del body sea `clip` y no `hidden` (con `hidden`, el
 *      body pasa a ser contenedor de scroll y se rompe el `sticky` de la barra
 *      superior);
 *   3. que existan las utilidades y las variables que consume el resto del
 *      sistema (`h-app`, `pb-safe`, `scroll-pane`, `--app-vh`, `--safe-b`…);
 *   4. que los tokens del chat sigan apuntando a los colores de HOY — el cambio
 *      de paleta lo tiene que decidir el dueño, no una limpieza de código.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'globals.css'), 'utf8')
/** Sin comentarios: así el conteo de llaves no se confunde con la prosa. */
const cssSinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * Cuántas llaves abiertas hay antes de esa posición. 0 = la regla está en el
 * nivel superior de la hoja, o sea fuera de cualquier `@layer`/`@media`.
 */
function profundidad(texto: string, indice: number): number {
    let nivel = 0
    for (let i = 0; i < indice; i++) {
        if (texto[i] === '{') nivel++
        else if (texto[i] === '}') nivel--
    }
    return nivel
}

describe('globals.css — regla de los 16px en campos de texto', () => {
    it('existe y apunta a input, textarea y select por debajo de 768px', () => {
        const bloque = cssSinComentarios.match(
            /@media \(max-width: 767\.98px\) \{[\s\S]*?font-size: 16px;[\s\S]*?\}\s*\}/,
        )
        expect(bloque, 'no se encontró la regla de los 16px para celular').toBeTruthy()
        expect(bloque![0]).toContain('textarea')
        expect(bloque![0]).toContain('select')
        expect(bloque![0]).toMatch(/input:not\(\[type='checkbox'\]\)/)
    })

    it('NO deja fuera a los checkbox / radio / range (agrandarlos descuadra los formularios)', () => {
        const bloque = cssSinComentarios.match(/@media \(max-width: 767\.98px\) \{[\s\S]*?font-size: 16px;/)
        expect(bloque![0]).toContain(":not([type='checkbox'])")
        expect(bloque![0]).toContain(":not([type='radio'])")
        expect(bloque![0]).toContain(":not([type='range'])")
    })

    it('está FUERA de @layer — si entra en una capa, pierde contra cualquier `text-sm` del className', () => {
        const indice = cssSinComentarios.indexOf('@media (max-width: 767.98px)')
        expect(indice).toBeGreaterThan(-1)
        expect(profundidad(cssSinComentarios, indice)).toBe(0)
    })

    it('de md: para arriba no toca nada (la regla vive solo en la consulta de celular)', () => {
        // Un solo `font-size: 16px` global, y adentro del `max-width: 767.98px`.
        const ocurrencias = cssSinComentarios.match(/font-size: 16px;/g) ?? []
        expect(ocurrencias).toHaveLength(1)
    })
})

describe('globals.css — el ancho no se va de la pantalla', () => {
    it('el body usa `clip`, NUNCA `hidden` (hidden rompería el sticky de la barra superior)', () => {
        expect(cssSinComentarios).toMatch(/body \{\s*overflow-x: clip;\s*\}/)
        expect(cssSinComentarios).not.toMatch(/body \{[^}]*overflow-x: hidden/)
    })

    it('un email o una URL sin espacios puede partirse dentro del dashboard', () => {
        expect(cssSinComentarios).toMatch(/#contenido \{\s*overflow-wrap: anywhere;\s*\}/)
    })

    it('con un diálogo abierto, el área de contenido deja de scrollear por detrás', () => {
        expect(cssSinComentarios).toMatch(
            /body\[data-scroll-locked\] #contenido \{\s*overflow: hidden;\s*\}/,
        )
    })
})

describe('globals.css — variables y utilidades del sistema', () => {
    it('define el alto real de ventana y las áreas seguras', () => {
        expect(cssSinComentarios).toContain('--app-vh: 100dvh;')
        expect(cssSinComentarios).toContain('--safe-t: env(safe-area-inset-top, 0px);')
        expect(cssSinComentarios).toContain('--safe-b: env(safe-area-inset-bottom, 0px);')
        expect(cssSinComentarios).toContain('--tap: 2.75rem;')
    })

    it.each([
        'h-app',
        'min-h-app',
        'max-h-app',
        'pb-safe',
        'pt-safe',
        'px-safe',
        'scroll-pane',
        'scroll-x-fade',
        'row-meta',
        'tap',
    ])('declara la utilidad `%s`', (nombre) => {
        expect(cssSinComentarios).toMatch(new RegExp(`@utility ${nombre} \\{`))
    })

    it('`scroll-pane` contiene el gesto: no se lo contagia a la página', () => {
        const bloque = cssSinComentarios.match(/@utility scroll-pane \{[\s\S]*?\n\}/)
        expect(bloque![0]).toContain('overflow-y: auto;')
        expect(bloque![0]).toContain('overscroll-behavior: contain;')
    })

    it('el color de los degradados de `scroll-x-fade` lo decide el consumidor', () => {
        // Los dos degradados lineales no son decoración: son lo que TAPA las dos
        // sombras mientras no hay nada que deslizar. Si valen un color distinto
        // al de la superficie de atrás dejan de tapar y pasan a DIBUJAR: dos
        // parches de 24px en los extremos, a TODOS los anchos. La utilidad se
        // usa sobre `--card` (stepper, tablas), sobre `--secondary` (pestañas
        // del Inbox) y sobre `--background` (barra de secciones de la ficha).
        const bloque = cssSinComentarios.match(/@utility scroll-x-fade \{[\s\S]*?\n\}/)![0]
        // Los dos degradados que tapan, y ninguno con el color clavado.
        expect(bloque.match(/var\(--scroll-fade-color, var\(--card\)\)/g) ?? []).toHaveLength(2)
        expect(bloque).not.toContain('linear-gradient(to right, var(--card)')
        expect(bloque).not.toContain('linear-gradient(to left, var(--card)')
        // Y la utilidad NO puede DECLARAR la variable: si la declarara, un
        // consumidor que la fije en el MISMO elemento estaría peleando contra
        // otra utilidad, y ahí gana la que Tailwind emita última, no la del
        // className. Con el valor por omisión adentro del `var()` no hay pelea.
        expect(bloque).not.toMatch(/--scroll-fade-color:/)
    })

    it('el halo táctil de 44px solo aplica con puntero grueso (el mouse no cambia)', () => {
        const bloque = cssSinComentarios.match(/@media \(pointer: coarse\) \{[\s\S]*?\n\}\n/)
        expect(bloque, 'no se encontró el bloque de puntero grueso').toBeTruthy()
        expect(bloque![0]).toContain("[data-slot='dialog-close']")
        expect(bloque![0]).toContain("[data-slot='sheet-close']")
        expect(bloque![0]).toContain('width: var(--tap);')
    })

    it('agrega el breakpoint xs (375px) y no toca los de Tailwind', () => {
        expect(cssSinComentarios).toMatch(/@theme \{[\s\S]*?--breakpoint-xs: 23\.4375rem;[\s\S]*?\}/)
        for (const nombre of ['sm', 'md', 'lg', 'xl']) {
            expect(cssSinComentarios).not.toContain(`--breakpoint-${nombre}:`)
        }
    })
})

describe('globals.css — tokens del chat (la paleta NO se cambia en esta tanda)', () => {
    /**
     * El fondo crema y las burbujas verdes fueron un pedido explícito del dueño;
     * el pedido posterior ("colores de marca, sin copiar WhatsApp") lo contradice
     * y esa contradicción la resuelve él. Los tokens existen para que ese cambio
     * sea tocar cuatro variables. Este test fija que hoy valen lo MISMO que el
     * chat ya dibuja, así "definir los tokens" no se convierte sin querer en
     * "cambiarle los colores al chat".
     */
    it('existen los siete tokens', () => {
        for (const token of [
            '--chat-surface',
            '--chat-in-bg',
            '--chat-in-fg',
            '--chat-out-bg',
            '--chat-out-fg',
            '--chat-meta',
            '--chat-sep',
        ]) {
            expect(cssSinComentarios).toContain(`${token}:`)
        }
    })

    it('apuntan a los colores que el chat tiene HOY', () => {
        // Fondo del hilo: el token vale el mismo oklch que `.wa-thread-bg` tenía
        // escrito a mano antes de la Fase 1.
        expect(cssSinComentarios).toContain('--chat-surface: oklch(0.94 0.02 90);')
        // Saliente = emerald-100 sobre emerald-950 (lo que dibujaba MessageBubble).
        expect(cssSinComentarios).toContain('--chat-out-bg: oklch(95% 0.052 163.051);')
        expect(cssSinComentarios).toContain('--chat-out-fg: oklch(26.2% 0.051 172.552);')
    })

    it('el fondo del hilo sale del token, no de un color escrito a mano (Fase 1)', () => {
        expect(cssSinComentarios).toMatch(/\.wa-thread-bg \{\s*background-color: var\(--chat-surface\);/)
        expect(cssSinComentarios).toMatch(/\.dark \.wa-thread-bg \{\s*background-color: var\(--chat-surface\);/)
    })

    it('la burbuja consume los tokens y NO tiene el color escrito a mano (Fase 1)', () => {
        // El día que el dueño resuelva la contradicción de paleta, el cambio tiene
        // que ser tocar cuatro variables. Un `bg-emerald-100` suelto acá lo rompe.
        const burbuja = readFileSync(resolve(__dirname, '../components/inbox/MessageBubble.tsx'), 'utf8')
        const clases = [...burbuja.matchAll(/className=\{?[`'"]([^`'"]*)/g)].map(m => m[1]).join(' ')
        expect(clases).not.toMatch(/bg-emerald-100|bg-white|bg-zinc-800/)
        expect(burbuja).toContain('var(--chat-out-bg)')
        expect(burbuja).toContain('var(--chat-in-bg)')
    })
})

/**
 * La transición al entrar a un chat en celular. Es la única animación que el
 * sistema móvil agrega, y solo se justifica si respeta las dos condiciones que
 * la vuelven inocua: que no exista para quien pidió menos movimiento, y que no
 * exista en escritorio.
 */
describe('globals.css — entrar al chat (la única animación del sistema móvil)', () => {
    /** El bloque `@media` que contiene la regla `.entrada-chat`. */
    const inicioRegla = cssSinComentarios.indexOf('.entrada-chat {')

    it('la regla existe y tiene su animación', () => {
        expect(inicioRegla).toBeGreaterThan(-1)
        expect(cssSinComentarios).toContain('@keyframes entrada-chat')
    })

    it('NO existe para quien pidió menos movimiento, ni en escritorio', () => {
        // Sacar cualquiera de las dos condiciones convierte un acento en una
        // animación impuesta: mareo para quien la desactivó en el sistema, y una
        // pantalla de escritorio que se mueve cuando la promesa es que no cambia.
        const media = cssSinComentarios.lastIndexOf('@media', inicioRegla)
        const encabezado = cssSinComentarios.slice(media, cssSinComentarios.indexOf('{', media))
        expect(encabezado).toContain('prefers-reduced-motion: no-preference')
        expect(encabezado).toContain('max-width: 767.98px')
    })

    it('está anidada de verdad adentro de ese `@media`, no suelta al lado', () => {
        // Un test que solo mirara el texto de arriba pasaría igual con la regla
        // fuera del bloque. Lo que decide es la profundidad de llaves.
        expect(profundidad(cssSinComentarios, inicioRegla)).toBe(1)
    })

    it('es un acento y no un pase de diapositivas', () => {
        const regla = cssSinComentarios.slice(inicioRegla, inicioRegla + 200)
        const ms = Number(regla.match(/animation: entrada-chat (\d+)ms/)?.[1])
        expect(ms).toBeGreaterThan(0)
        expect(ms).toBeLessThanOrEqual(220)
    })
})
