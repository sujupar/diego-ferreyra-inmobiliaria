/**
 * ROJO 2 del QA en la vista previa (2026-11-26): en pantallas táctiles el tilde de las
 * tareas de la ficha salía ovalado (17×22 en vez de 22×22). La regla de áreas táctiles de
 * `app/globals.css` (`@media (pointer: coarse)`) le ponía `position: relative` a todo
 * checkbox y le ganaba al `absolute inset-0` del input invisible de `LateralTareas.tsx`.
 *
 * Ni happy-dom ni Node aplican media queries ni miden: esta prueba de texto es la única red
 * que queda acá (la medida real se mira en el navegador con táctil emulado).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const raiz = resolve(__dirname, '../../..')
const css = readFileSync(resolve(raiz, 'app/globals.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const lateral = readFileSync(resolve(raiz, 'components/crm/ficha/LateralTareas.tsx'), 'utf8')

/** Los selectores de cada regla que pone `position: relative` dentro de `pointer: coarse`. */
function selectoresRelativosTactiles(): string[] {
  const inicio = css.indexOf('@media (pointer: coarse)')
  expect(inicio).toBeGreaterThan(-1)
  const bloque = css.slice(inicio)
  const reglas = [...bloque.matchAll(/([^{}]+)\{\s*position:\s*relative;\s*\}/g)]
  return reglas.flatMap((r) => r[1].split(',').map((s) => s.trim()))
}

describe('tilde de las tareas en pantallas táctiles', () => {
  it('el checkbox de LateralTareas sigue siendo absolute (es el que tapa el círculo)', () => {
    expect(lateral).toMatch(/type="checkbox"[\s\S]{0,200}absolute inset-0/)
  })

  it('la regla táctil no le pone relative a un checkbox o radio absolute', () => {
    const selectores = selectoresRelativosTactiles()
    for (const tipo of ['checkbox', 'radio']) {
      const deEseTipo = selectores.filter((s) => s.includes(`input[type='${tipo}']`))
      expect(deEseTipo.length).toBeGreaterThan(0)
      for (const s of deEseTipo) expect(s).toContain(':not(.absolute)')
    }
  })
})
