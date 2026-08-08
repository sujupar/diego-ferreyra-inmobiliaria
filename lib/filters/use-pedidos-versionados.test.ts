// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { crearControlDePedidos, usePedidosVersionados } from './use-pedidos-versionados'

/**
 * Las tres reglas sutiles del versionado (ver el JSDoc del módulo) son las que
 * un copiar/pegar rompe. Acá quedan fijadas una por una, porque el fallo que
 * producen no es un error visible sino una pantalla que miente: el listado
 * viejo bajo el rótulo del filtro nuevo, o un spinner que no se apaga nunca.
 */

describe('crearControlDePedidos — abrir un listado nuevo', () => {
  it('avanza la generación y deja vigente solo a la última', () => {
    const p = crearControlDePedidos()
    const a = p.abrir()
    const b = p.abrir()
    expect(b.gen).not.toBe(a.gen)
    expect(p.vigente(a.gen)).toBe(false)
    expect(p.vigente(b.gen)).toBe(true)
  })

  it('la señal del listado nuevo nace sin cancelar', () => {
    const p = crearControlDePedidos()
    p.abrir()
    expect(p.abrir().signal.aborted).toBe(false)
  })

  it('cancela de verdad el pedido anterior', () => {
    const p = crearControlDePedidos()
    const viejo = p.abrir()
    expect(viejo.signal.aborted).toBe(false)
    p.abrir()
    // Sin esto, la respuesta vieja igual viaja y se descarta recién al llegar:
    // se paga el ancho de banda y, peor, cualquier `finally` sin versionar la
    // toma por buena.
    expect(viejo.signal.aborted).toBe(true)
  })
})

describe('crearControlDePedidos — engancharse al listado vigente (regla 1)', () => {
  it('`actual` NO avanza la generación', () => {
    const p = crearControlDePedidos()
    const listado = p.abrir()
    const mas = p.actual()
    const refresco = p.actual()
    expect(mas.gen).toBe(listado.gen)
    expect(refresco.gen).toBe(listado.gen)
    expect(p.vigente(listado.gen)).toBe(true)
  })

  it('`actual` NO cancela el pedido del listado en curso', () => {
    // Es la regla que evita el spinner colgado para siempre: si un refresco
    // abriera generación, cancelaría el fetch del efecto de datos y el
    // `finally` versionado de ese fetch ya no apagaría el spinner.
    const p = crearControlDePedidos()
    const listado = p.abrir()
    p.actual()
    expect(listado.signal.aborted).toBe(false)
    expect(p.vigente(listado.gen)).toBe(true)
  })

  it('un "cargar más" en vuelo se descarta si el filtro cambió', () => {
    const p = crearControlDePedidos()
    p.abrir()
    const mas = p.actual()          // sale el "cargar más"
    p.abrir()                       // el usuario cambia el filtro
    expect(p.vigente(mas.gen)).toBe(false)
    // Y además queda cancelado: comparte la señal del listado que reemplazó.
    expect(mas.signal.aborted).toBe(true)
  })

  it('`actual` antes del primer `abrir` da una señal usable y la generación inicial', () => {
    const p = crearControlDePedidos()
    const antes = p.actual()
    expect(antes.signal.aborted).toBe(false)
    expect(p.vigente(antes.gen)).toBe(true)
  })
})

describe('crearControlDePedidos — siVigente (regla 2)', () => {
  it('corre para la generación vigente', () => {
    const p = crearControlDePedidos()
    const { gen } = p.abrir()
    const apagarSpinner = vi.fn()
    p.siVigente(gen, apagarSpinner)
    expect(apagarSpinner).toHaveBeenCalledTimes(1)
  })

  it('no corre para una generación vieja', () => {
    // Si el `finally` de la respuesta vieja apagara el spinner, la pantalla
    // mostraría el listado anterior como si fuera el resultado del filtro
    // nuevo — la misma mentira, por otra puerta.
    const p = crearControlDePedidos()
    const viejo = p.abrir()
    p.abrir()
    const apagarSpinner = vi.fn()
    p.siVigente(viejo.gen, apagarSpinner)
    expect(apagarSpinner).not.toHaveBeenCalled()
  })
})

describe('crearControlDePedidos — cancelar', () => {
  it('aborta lo que está en vuelo y le quita vigencia', () => {
    const p = crearControlDePedidos()
    const enVuelo = p.abrir()
    p.cancelar()
    expect(enVuelo.signal.aborted).toBe(true)
    expect(p.vigente(enVuelo.gen)).toBe(false)
  })

  it('después de cancelar, el pedido siguiente sale con una señal viva', () => {
    // Si el abortador ya disparado quedara puesto, el próximo fetch moriría
    // antes de salir.
    const p = crearControlDePedidos()
    p.abrir()
    p.cancelar()
    expect(p.abrir().signal.aborted).toBe(false)
    expect(p.actual().signal.aborted).toBe(false)
  })
})

describe('usePedidosVersionados', () => {
  it('cancela el listado en vuelo al desmontar la pantalla', () => {
    // Irse de la pantalla dejaba el pedido viajando: el `setState` sobre un
    // componente desmontado es un no-op silencioso en React 19, así que no se
    // rompía nada visible — solo se tiraba el ancho de banda, en contra de lo
    // que esta pieza promete.
    const { result, unmount } = renderHook(() => usePedidosVersionados())
    const control = result.current
    const enVuelo = control.abrir()
    expect(enVuelo.signal.aborted).toBe(false)

    unmount()

    expect(enVuelo.signal.aborted).toBe(true)
    expect(control.vigente(enVuelo.gen)).toBe(false)
  })

  it('devuelve la MISMA instancia entre renders', () => {
    // Si cambiara de identidad, la generación volvería a cero en cada render y
    // el versionado dejaría de descartar nada.
    const { result, rerender } = renderHook(() => usePedidosVersionados())
    const primera = result.current
    const { gen } = primera.abrir()
    rerender()
    expect(result.current).toBe(primera)
    expect(result.current.vigente(gen)).toBe(true)
  })

  it('dos componentes tienen controles independientes', () => {
    const a = renderHook(() => usePedidosVersionados())
    const b = renderHook(() => usePedidosVersionados())
    const pedidoA = a.result.current.abrir()
    b.result.current.abrir()
    expect(a.result.current.vigente(pedidoA.gen)).toBe(true)
    expect(pedidoA.signal.aborted).toBe(false)
  })
})
