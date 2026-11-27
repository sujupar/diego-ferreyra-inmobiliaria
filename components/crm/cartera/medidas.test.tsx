// @vitest-environment happy-dom
// crm-cartera-por-rol, tarea 7.3: todo lo tocable mide 44 px y los campos usan 16 px en el
// celular y en toda pantalla táctil; lo chico (36 px / 14 px) solo con mouse DESDE 768 px
// (`md:raton:`). happy-dom no calcula tamaños: acá se fija que cada control lleve sus
// clases; la medición con `getBoundingClientRect` emulando un celular táctil va en la vista
// previa.
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { VistaCartera } from './CarteraCRM'
import { VistaContactos } from './ContactosLista'
import { contactoPrueba, datosContactosPrueba, datosPrueba, filaPrueba, FLORENCIA, pasoPrueba, TOMAS, ar } from './datos-prueba'
import { FILTROS_DEFECTO } from '@/lib/crm/cartera-url'

const nada = () => {}
const ALTO_TACTIL = /(^|\s)(min-h-11|h-11|size-11)(\s|$)/

function controles(raiz: HTMLElement): HTMLElement[] {
  return [...raiz.querySelectorAll<HTMLElement>('button, select, input, a')].filter(
    // La barra de selección es la de hoy (`BulkActionsBar`, components/ui): se reusa tal cual (D8).
    (e) => !e.closest('[data-estado="error"]') && !e.closest('.border-amber-300'),
  )
}

function dueno() {
  return render(
    <VistaCartera
      datos={datosPrueba({
        generadoEn: new Date('2026-12-20T13:40:00Z').toISOString(),
        filas: [
          filaPrueba({ ultimoContacto: null, creadoEn: ar('2026-12-20', '10:00') }),
          filaPrueba({ etapa: 'realizada', asesor: null }),
          filaPrueba({ etapa: 'seguimiento', asesor: { ...TOMAS, activo: true }, proximo: pasoPrueba('2026-12-22', '10:00') }),
          filaPrueba({ etapa: 'seguimiento', colega: true }),
        ],
      })}
      estado="listo"
      rol="dueno"
      filtros={{ ...FILTROS_DEFECTO, origen: 'referido', q: 'x' }}
      aplicar={nada}
      opcionesVerComo={[{ id: FLORENCIA.id, etiqueta: 'Florencia Ledesma · asesor' }]}
      avisos={[]}
      volver="/crm"
      alElegirVer={nada}
      alReintentar={nada}
      alEliminar={async () => {}}
    />,
  )
}

describe('medidas táctiles de la cartera', () => {
  it('cada botón, selector, campo y enlace del CRM mide 44 px en táctil', () => {
    const { container } = dueno()
    const lista = controles(container)
    expect(lista.length).toBeGreaterThan(20)
    const chicos = lista.filter((e) => !ALTO_TACTIL.test(e.className)).map((e) => `${e.tagName} «${e.textContent?.trim() || e.getAttribute('aria-label')}»`)
    expect(chicos).toEqual([])
  })

  it('lo chico es solo con mouse y desde 768 px (nunca `raton:` suelto ni una medida chica fija)', () => {
    const { container } = dueno()
    for (const e of controles(container)) {
      expect(e.className, e.textContent ?? '').not.toMatch(/(^|\s)raton:(h|min-h)-/)
      expect(e.className, e.textContent ?? '').not.toMatch(/(^|\s)(h-8|h-9|min-h-8|min-h-9)(\s|$)/)
    }
  })

  it('los campos usan letra de 16 px (14 px solo con mouse desde 768)', () => {
    const { container } = dueno()
    const campos = [...container.querySelectorAll<HTMLElement>('select, input')]
    expect(campos.length).toBeGreaterThan(4)
    for (const c of campos) {
      expect(c.className).toMatch(/(^|\s)text-base(\s|$)/)
      expect(c.className).toMatch(/(^|\s)md:raton:text-sm(\s|$)/)
    }
  })

  it('Contactos cumple lo mismo', () => {
    const { container } = render(
      <VistaContactos
        datos={datosContactosPrueba({ filas: [contactoPrueba(), contactoPrueba({ proceso: null, conProcesoAbierto: false })] })}
        estado="listo"
        propios={false}
        filtros={FILTROS_DEFECTO}
        aplicar={nada}
        avisos={[]}
        volver="/contacts"
        alReintentar={nada}
      />,
    )
    const chicos = controles(container).filter((e) => !ALTO_TACTIL.test(e.className)).map((e) => e.tagName)
    expect(chicos).toEqual([])
  })
})
