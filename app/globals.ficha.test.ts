/**
 * Contrato del bloque "FASE 2 — la tabla se vuelve FICHA" de `app/globals.css`.
 *
 * Todo el dibujo de la ficha es CSS, y el CSS no se puede observar acá: no hay
 * navegador, y Turbopack ni siquiera compila el proyecto en local por el acento
 * de "Gestión" en la ruta. Un test de texto sobre una hoja de estilos es feo,
 * pero es la única red que queda — y lo que fija son exactamente las piezas
 * que, si alguien las "limpia" por parecer redundantes, dejan la tabla ilegible
 * en el teléfono sin que ningún otro test se entere:
 *
 *   1. que exista el CONTENEDOR (`container-name: tabla`): sin él la consulta
 *      de contenedor nunca puede dar verdadera y la ficha jamás aparece;
 *   2. que el corte sea por CONTENEDOR y no por ventana: `DataTable` también
 *      vive adentro de tarjetas angostas del tablero, donde la ventana miente;
 *   3. que `<table>/<thead>/<tbody>/<tr>` cambien de `display`: sin eso el
 *      `order` y el `flex-wrap` de las celdas no tienen ningún efecto;
 *   4. que el bloque esté FUERA de `@layer`, que es lo único que le permite
 *      pisar el `whitespace-nowrap`, el `px-4 py-3` y el `text-right` que las
 *      celdas traen escritos en el className;
 *   5. que el aviso de "se desliza" use propiedades LARGAS de fondo — con el
 *      atajo `background` la tarjeta pierde su color.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const css = readFileSync(resolve(__dirname, 'globals.css'), 'utf8')
/** Sin comentarios: así el conteo de llaves no se confunde con la prosa. */
const cssSinComentarios = css.replace(/\/\*[\s\S]*?\*\//g, '')

/** Cuántas llaves abiertas hay antes de esa posición. 0 = nivel superior. */
function profundidad(texto: string, indice: number): number {
    let nivel = 0
    for (let i = 0; i < indice; i++) {
        if (texto[i] === '{') nivel++
        else if (texto[i] === '}') nivel--
    }
    return nivel
}

/** El cuerpo del `@container` de la ficha, con sus llaves balanceadas. */
function bloqueDeLaFicha(): string {
    const inicio = cssSinComentarios.indexOf('@container tabla (max-width: 40rem)')
    expect(inicio, 'no se encontró la consulta de contenedor de la ficha').toBeGreaterThan(-1)
    let nivel = 0
    for (let i = inicio; i < cssSinComentarios.length; i++) {
        if (cssSinComentarios[i] === '{') nivel++
        else if (cssSinComentarios[i] === '}') {
            nivel--
            if (nivel === 0) return cssSinComentarios.slice(inicio, i + 1)
        }
    }
    throw new Error('la consulta de contenedor de la ficha no cierra')
}

describe('globals.css — el interruptor de la ficha', () => {
    it('`.tabla-ficha` declara un contenedor llamado `tabla`', () => {
        // Es lo único que `cardMode={false}` deja de poner. Sin esta regla, la
        // consulta de contenedor no tiene a qué preguntarle el ancho.
        const bloque = cssSinComentarios.match(/\.tabla-ficha \{[\s\S]*?\}/)
        expect(bloque, 'no se encontró la clase que declara el contenedor').toBeTruthy()
        expect(bloque![0]).toContain('container-type: inline-size;')
        expect(bloque![0]).toContain('container-name: tabla;')
    })

    it('el corte lo decide el CONTENEDOR, no la ventana', () => {
        // `DataTable` se usa a ancho de pantalla Y adentro de tarjetas angostas
        // del tablero: un `max-md:` mediría la ventana y se equivocaría en el
        // segundo caso. Además la consulta de contenedor no tiene el problema
        // de hidratación de `useIsMobile()`.
        expect(cssSinComentarios).toContain('@container tabla (max-width: 40rem)')
        expect(bloqueDeLaFicha()).not.toContain('@media')
    })

    it('corta en 40rem y NO en 48rem: mide la CAJA de la tabla, no la ventana', () => {
        // Entre la ventana y la caja de la tabla hay 240px de menú lateral
        // (15rem) más el relleno de `#contenido`. Con 48rem —el valor que
        // "coincide con md" y por eso da ganas de poner— la caja de una laptop
        // de 1024px (736px) también daría angosta y el ESCRITORIO pasaría a
        // fichas sin que nadie lo pidiera.
        const caja = (ventana: number) => (ventana < 768 ? ventana - 32 : ventana - 240 - 48)
        const esFicha = (ventana: number) => caja(ventana) <= 40 * 16

        expect(esFicha(320), 'el mínimo tiene que dar ficha').toBe(true)
        expect(esFicha(390), 'un iPhone 14 tiene que dar ficha').toBe(true)
        expect(esFicha(667), 'un iPhone SE apaisado tiene que dar ficha').toBe(true)
        expect(esFicha(844), 'un iPhone 14 apaisado tiene que dar ficha').toBe(true)
        expect(esFicha(1024), 'una laptop chica NO puede pasar a fichas').toBe(false)
        expect(esFicha(1280), 'una laptop NO puede pasar a fichas').toBe(false)

        expect(cssSinComentarios).not.toContain('@container tabla (max-width: 48rem)')
    })

    it('está FUERA de `@layer`: si entra en una capa, pierde contra el className de las celdas', () => {
        const indice = cssSinComentarios.indexOf('@container tabla (max-width: 40rem)')
        expect(profundidad(cssSinComentarios, indice)).toBe(0)
        expect(profundidad(cssSinComentarios, cssSinComentarios.indexOf('.tabla-ficha {'))).toBe(0)
    })
})

describe('globals.css — la tabla deja de ser una tabla', () => {
    const bloque = bloqueDeLaFicha()

    it.each([
        ['.tabla-ficha table', 'display: block;'],
        ['.tabla-ficha thead', 'display: none;'],
        ['.tabla-ficha tbody', 'display: block;'],
    ])('%s pasa a `%s`', (selector, declaracion) => {
        // Sin esto los `<tr>` siguen siendo renglones de tabla y el `order` /
        // `flex-wrap` de las celdas no hace absolutamente nada.
        expect(bloque).toMatch(new RegExp(`${selector.replace('.', '\\.')} \\{ ${declaracion} \\}`))
    })

    it('la fila pasa a ser un flex que envuelve, con 56px de alto mínimo', () => {
        const fila = bloque.match(/\.tabla-ficha tbody tr \{[\s\S]*?\n {2}\}/)
        expect(fila, 'no se encontró la regla de la fila').toBeTruthy()
        expect(fila![0]).toContain('display: flex;')
        expect(fila![0]).toContain('flex-wrap: wrap;')
        // El renglón ENTERO es el objetivo táctil, no el texto de adentro.
        expect(fila![0]).toContain('min-height: 3.5rem;')
    })
})

describe('globals.css — el reparto de la ficha', () => {
    const bloque = bloqueDeLaFicha()

    it.each([
        ['seleccion', 1],
        ['titulo', 2],
        ['insignia', 3],
        ['chevron', 4],
        ['salto', 5],
        ['dato', 6],
    ])('`%s` va en la posición %i de la ficha', (rol, orden) => {
        const regla = bloque.match(new RegExp(`\\[data-celda='${rol}'\\] \\{[\\s\\S]*?\\n {2}\\}`))
        expect(regla, `no se encontró la regla de ${rol}`).toBeTruthy()
        expect(regla![0]).toContain(`order: ${orden};`)
    })

    it('el título se encoge y corta con puntos suspensivos', () => {
        const titulo = bloque.match(/\[data-celda='titulo'\] \{[\s\S]*?\n {2}\}/)![0]
        // `min-width: 0` es LO que permite que se encoja: sin eso una dirección
        // larga empuja la ficha entera y arrastra la página de costado.
        expect(titulo).toContain('min-width: 0;')
        expect(titulo).toContain('text-overflow: ellipsis;')
    })

    it('el salto ocupa todo el ancho y no se ve', () => {
        // En flexbox no hay forma de decir "de acá para abajo, otra línea": la
        // única es un elemento que ocupe el 100%.
        const salto = bloque.match(/\[data-celda='salto'\] \{[\s\S]*?\n {2}\}/)![0]
        expect(salto).toContain('flex: 0 0 100%;')
        expect(salto).toContain('height: 0;')
    })

    it('el separador entre datos es AIRE y no un punto invisible', () => {
        // Acá había un «·» pintado de `var(--border)`: 1.27:1 contra la tarjeta,
        // o sea que no se veía. Un separador que no se ve no separa nada y
        // encima paga el ancho de un carácter. Ahora separa el doble de espacio
        // (0.5rem del `column-gap` de la fila + 0.5rem de acá) y no hay
        // pseudo-elemento: el dato corta con puntos suspensivos y un `::before`
        // adentro se comía ancho del texto.
        expect(bloque).toMatch(
            /\[data-celda='dato'\]:not\(\[data-primero\]\) \{\s*margin-left: 0\.5rem;\s*\}/,
        )
        expect(bloque, 'volvió el punto separador').not.toContain("content: '·'")
    })

    it('el PRIMER dato del renglón no lleva separación (no hay nada antes)', () => {
        // El `:not([data-primero])` es lo único que lo distingue, y el atributo
        // lo pone `DataTable` porque el orden VISUAL de la ficha lo decide
        // `order` — el selector de hermanos contiguos no lo ve.
        const conSeparacion = bloque.match(/\[data-celda='dato'\][^{]*\{[^}]*margin-left/g) ?? []
        expect(conSeparacion).toHaveLength(1)
        expect(conSeparacion[0]).toContain(':not([data-primero])')
    })

    it('lo que la pantalla marcó como `none` no se dibuja', () => {
        expect(bloque).toMatch(/\[data-celda='oculto'\] \{ display: none; \}/)
    })

    it('la barra de ordenar/seleccionar SOLO existe en la ficha', () => {
        // Apagada por default y encendida adentro de la consulta: si algún día
        // se invierte el orden de esas dos reglas, la barra aparece también en
        // escritorio, donde la cabecera ya hace las dos cosas.
        const apagado = cssSinComentarios.indexOf('.tabla-ficha .tabla-barra {\n  display: none;')
        const encendido = cssSinComentarios.indexOf('.tabla-ficha .tabla-barra { display: flex; }')
        expect(apagado, 'falta apagar la barra fuera de la ficha').toBeGreaterThan(-1)
        expect(encendido, 'falta encender la barra dentro de la ficha').toBeGreaterThan(apagado)
    })
})

describe('globals.css — el aviso de que la tabla se desliza', () => {
    it('usa propiedades LARGAS de fondo, no el atajo `background`', () => {
        // El atajo reinicia `background-color` y le borraría el fondo a la
        // tarjeta (`bg-card`): la tabla quedaría transparente.
        const bloque = cssSinComentarios.match(/\.tabla-desliza \{[\s\S]*?\n\}/)
        expect(bloque, 'no se encontró la clase del deslizamiento').toBeTruthy()
        expect(bloque![0]).toContain('background-image:')
        expect(bloque![0]).not.toMatch(/\n {2}background:/)
    })

    it('deja de deslizarse de costado sin contagiarle el gesto a la página', () => {
        const bloque = cssSinComentarios.match(/\.tabla-desliza \{[\s\S]*?\n\}/)![0]
        expect(bloque).toContain('overflow-x: auto;')
        expect(bloque).toContain('overscroll-behavior-x: contain;')
    })

    it('los dos degradados que tapan las sombras van `local` (por eso se corren al deslizar)', () => {
        const bloque = cssSinComentarios.match(/\.tabla-desliza \{[\s\S]*?\n\}/)![0]
        expect(bloque).toContain('background-attachment: local, local, scroll, scroll;')
    })
})
