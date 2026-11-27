// @vitest-environment happy-dom
// crm-cartera-por-rol, tarea 7.1 (D10): tabla o tarjeta lo decide el ancho de la LISTA con
// container queries, nunca JavaScript. Acá se fija la estructura; las medidas reales a 390,
// 1024 y 1280 px se miran en la vista previa (happy-dom no calcula diseño).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { render } from '@testing-library/react'
import { GrupoCartera } from './GrupoCartera'
import { AHORA_PRUEBA, filaPrueba, TOMAS } from './datos-prueba'
import { metaDeGrupo } from './textos'

const CARPETA = join(process.cwd(), 'components/crm/cartera')

describe('la lista se arma por su propio ancho (D10)', () => {
  const montar = () =>
    render(
      <GrupoCartera
        clave="todos"
        meta={metaDeGrupo('todos', 'dueno')}
        filas={[filaPrueba({ etapa: 'seguimiento', asesor: { ...TOMAS, activo: true } }), filaPrueba({ etapa: 'solicitud' })]}
        visibles={25}
        alCargarMas={() => {}}
        modo="cartera"
        conAsesor
        cerrados={false}
        volver="/crm"
        ahora={AHORA_PRUEBA}
      />,
    )

  it('la lista es un contenedor con nombre "lista"', () => {
    const { container } = montar()
    expect(container.querySelector('.\\@container\\/lista')).not.toBeNull()
  })

  it('la cabecera de columnas solo aparece desde 44rem de lista; la fila es tarjeta por debajo', () => {
    const { container } = montar()
    const cabecera = container.querySelector('[data-cabecera-filas]')
    expect(cabecera).toHaveClass('hidden', '@min-[44rem]/lista:grid')
    const fila = container.querySelector('[data-fila]')
    expect(fila?.className).toContain('grid-cols-[2.25rem_minmax(0,1fr)_1rem]')
    expect(fila?.className).toContain('@min-[44rem]/lista:grid-cols-[2.25rem_minmax(0,2fr)')
  })

  it('en la tarjeta cada dato va rotulado y la fila del asesor vacío no ocupa lugar', () => {
    const { container } = montar()
    const rotulos = [...container.querySelectorAll('.w-\\[6\\.25rem\\]')].map((e) => e.textContent)
    expect(rotulos).toEqual(expect.arrayContaining(['Último contacto', 'Próximo paso', 'Asesor']))
    const vacio = container.querySelector('[data-asesor-vacio]')
    expect(vacio).toHaveClass('hidden', '@min-[44rem]/lista:flex')
  })

  it('ningún componente de la cartera elige la estructura por JavaScript', () => {
    const fuentes = readdirSync(CARPETA).filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    for (const f of fuentes) {
      const codigo = readFileSync(join(CARPETA, f), 'utf8')
      expect(codigo, f).not.toMatch(/useIsMobile|matchMedia|innerWidth|ResizeObserver/)
    }
  })

  it('ninguna clase de ancho de lista se arma con plantillas (Tailwind no la vería)', () => {
    const fuentes = readdirSync(CARPETA).filter((f) => /\.tsx$/.test(f) && !/\.test\.tsx$/.test(f))
    for (const f of fuentes) expect(readFileSync(join(CARPETA, f), 'utf8'), f).not.toMatch(/`[^`]*\$\{[^}]*\}:[a-z@]/)
  })
})
