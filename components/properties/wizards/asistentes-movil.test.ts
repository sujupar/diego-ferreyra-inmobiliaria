/**
 * Los tres asistentes de publicación (MercadoLibre, Argenprop y Meta Ads v2)
 * necesitan media pantalla de props para montarse, así que acá se afirma sobre
 * el CÓDIGO en vez de sobre el DOM. Es un test feo a propósito: en este
 * proyecto el layout ES la funcionalidad y no hay navegador donde mirarlo.
 *
 * Lo que protege:
 *  - que Atrás/Siguiente sigan pegados al piso de la pantalla en celular (los
 *    pasos de imágenes y de campos son largos: sin eso hay que scrollear hasta
 *    el fondo cada vez);
 *  - que las filas de varios botones puedan bajar de renglón en vez de
 *    recortarse contra el borde.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const AQUI = __dirname
const ML = readFileSync(join(AQUI, 'ml', 'MercadoLibreWizard.tsx'), 'utf8')
const AP = readFileSync(join(AQUI, 'ap', 'ArgenpropWizard.tsx'), 'utf8')
const META_V2 = readFileSync(join(AQUI, 'MetaAdsWizardV2.tsx'), 'utf8')
const META_V1 = readFileSync(join(AQUI, 'MetaAdsWizard.tsx'), 'utf8')

describe.each([['MercadoLibre', ML], ['Argenprop', AP]])(
    'asistente de %s — navegación alcanzable en celular',
    (_nombre, codigo) => {
        it('la barra Atrás/Siguiente se pega al piso de la pantalla', () => {
            expect(codigo).toContain('max-md:sticky')
            expect(codigo).toContain('max-md:bottom-0')
        })

        it('sale a sangre y respeta la barra de gestos del teléfono', () => {
            // `-mx-4` cancela el padding del área de contenido; sin fondo
            // propio, el hilo del paso se ve por detrás de los botones.
            expect(codigo).toContain('max-md:-mx-4')
            expect(codigo).toContain('max-md:bg-background')
            expect(codigo).toContain('max-md:pb-safe')
        })

        it('la barra de pasos sigue pudiendo bajar de renglón', () => {
            // Estos dos asistentes ya estaban bien: los pasos usan `flex-wrap`
            // en vez de desbordar. No hay que "arreglarlos" con scroll.
            expect(codigo).toContain('flex items-center gap-1.5 text-xs flex-wrap')
        })
    }
)

describe('Meta Ads', () => {
    it('v2: ninguna fila de botones queda sin poder bajar de renglón', () => {
        // "Cancelar y empezar de cero" + "Reintentar publicar" + "Volver" no
        // entran en los ~358px de un iPhone.
        expect(META_V2).not.toContain('<div className="flex gap-2">')
        expect(META_V2.match(/className="flex flex-wrap gap-2"/g)?.length).toBe(6)
    })

    it('v1: la barra de pasos sigue scrolleando dentro de su caja', () => {
        // Este era el patrón bueno que ya existía en el proyecto. No se toca:
        // se copió a `components/ui/stepper.tsx`.
        expect(META_V1).toContain('overflow-x-auto')
        expect(META_V1).toContain('min-w-max')
    })
})

describe('pasos de campos — alto de dedo', () => {
    it.each([
        ['MercadoLibre', join(AQUI, 'ml', 'steps', 'StepFields.tsx')],
        ['Argenprop', join(AQUI, 'ap', 'steps', 'StepFields.tsx')],
    ])('%s: los controles crudos llegan a 44px en celular', (_n, ruta) => {
        const codigo = readFileSync(ruta, 'utf8')
        // Cada control crudo del paso (`px-3 py-2 text-sm`) tiene que llevar el
        // alto de dedo pegado atrás. Se cuentan las dos cosas por separado para
        // que sobrevivan cero apariciones huérfanas.
        const todos = codigo.match(/px-3 py-2 text-sm/g) ?? []
        const conAlto = codigo.match(/px-3 py-2 text-sm max-md:min-h-11/g) ?? []

        expect(todos.length).toBe(5)
        expect(conAlto.length).toBe(todos.length)
    })
})
