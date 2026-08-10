/**
 * La regla global de la Fase 0 (`app/globals.css`, sin `@layer`) sube a 16px
 * TODO `input`, `textarea` y `select` por debajo de 768px, y por eso le gana a
 * los ~215 controles crudos que traen `text-sm`/`text-xs` escrito a mano en el
 * className. Eso cierra el zoom automático de iOS de una sola vez.
 *
 * Pero la regla apunta a TRES SELECTORES DE ELEMENTO. Cualquier campo de texto
 * que no sea uno de esos tres —un `div` con `contentEditable`, un
 * `role="textbox"` propio, un editor de terceros— queda AFUERA sin que nada
 * avise: se ve igual en el escritorio y hace zoom en el teléfono.
 *
 * Hoy no hay ninguno: los 215 controles del sistema son nativos. Este test fija
 * esa condición. Si algún día se rompe, el arreglo NO es tocar el componente
 * nuevo y listo, es acordarse de que la red de seguridad no lo cubre.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(__dirname, '..')
const CARPETAS = ['app', 'components']

function archivosTsx(dir: string, acc: string[] = []): string[] {
    for (const nombre of readdirSync(dir)) {
        if (nombre === 'node_modules' || nombre === '.next') continue
        const ruta = join(dir, nombre)
        if (statSync(ruta).isDirectory()) archivosTsx(ruta, acc)
        else if (/\.tsx$/.test(nombre) && !/\.test\.tsx$/.test(nombre)) acc.push(ruta)
    }
    return acc
}

const FUENTES = CARPETAS.flatMap(c => archivosTsx(join(RAIZ, c)))

describe('la regla de los 16px no tiene agujeros', () => {
    it('encuentra los archivos de la aplicación', () => {
        expect(FUENTES.length).toBeGreaterThan(100)
    })

    it('ningún campo de texto esquiva la regla haciéndose pasar por otro elemento', () => {
        const sospechosos: string[] = []
        for (const ruta of FUENTES) {
            const codigo = readFileSync(ruta, 'utf8')
            // `contentEditable` y `role="textbox"` son las dos formas de
            // fabricar un campo de texto que NO es input/textarea/select.
            if (/contentEditable|role=["']textbox["']/.test(codigo)) {
                sospechosos.push(ruta.slice(RAIZ.length + 1))
            }
        }
        expect(sospechosos).toEqual([])
    })

    it('el breakpoint `xs` existe: sin él, `max-xs:` se compila a nada y en silencio', () => {
        // `VisitDataForm` baja a una columna abajo de 375px con `max-xs:`. Si
        // alguien saca esta declaración del @theme, esa clase deja de existir y
        // el formulario vuelve a dos columnas de 124px sin que falle nada.
        const css = readFileSync(join(RAIZ, 'app', 'globals.css'), 'utf8')
        expect(css).toContain('--breakpoint-xs:')
    })

    it('la regla global sigue existiendo y sigue cubriendo los tres elementos', () => {
        const css = readFileSync(join(RAIZ, 'app', 'globals.css'), 'utf8')
        const regla = css.slice(css.indexOf('@media (max-width: 767.98px)'))

        expect(regla).toContain('input:not([type=')
        expect(regla).toContain('textarea')
        expect(regla).toContain('select')
        expect(regla).toContain('font-size: 16px')
    })
})
