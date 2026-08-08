'use client'

import { useState } from 'react'

/**
 * Gana el último PEDIDO, no la última respuesta.
 *
 * Un listado paginado con filtros tiene siempre tres fetch conviviendo (el del
 * filtro, el "cargar más", el refresco después de una acción masiva) y ninguno
 * de los tres llega en el orden en que salió. Sin versionado, medido en
 * `/properties`: elegir "Aprobada" y enseguida "Activa" terminaba mostrando 21
 * propiedades bajo el rótulo "Activa" (que tiene 0), para siempre; y un "cargar
 * más" en vuelo appendeaba filas del filtro viejo dentro del nuevo y reescribía
 * el total con un número inventado.
 *
 * Nació inline en `/properties` y se extrajo acá porque las tres pantallas que
 * siguen (Contactos, CRM, Visitas) tienen exactamente los mismos dos casos
 * abiertos, y son ~20 líneas con tres reglas sutiles que un copiar/pegar rompe:
 *
 * 1. **Solo el efecto de datos abre generación** (`abrir`). "Cargar más" y los
 *    refrescos son operaciones SOBRE el listado vigente, no listados nuevos:
 *    usan `actual`. Si un refresco abriera generación, cancelaría el fetch del
 *    efecto y el spinner quedaría prendido para siempre.
 * 2. **El `finally` que apaga el spinner DEL LISTADO va versionado**
 *    (`siVigente`). Si lo apagara la respuesta vieja, la pantalla mostraría el
 *    listado anterior como si fuera el resultado del filtro nuevo.
 * 3. **El `finally` que apaga la bandera de un BOTÓN no va versionado.** Esa
 *    bandera es del control, no del listado: dejarla puesta lo bloquea para el
 *    listado nuevo. Va suelto, sin `siVigente`.
 *
 * Uso:
 *
 * ```ts
 * const pedidos = usePedidosVersionados()
 *
 * useEffect(() => {
 *   const { gen, signal } = pedidos.abrir()          // (1) listado nuevo
 *   fetch(url, { signal })
 *     .then(datos => { if (pedidos.vigente(gen)) pintar(datos) })
 *     .finally(() => pedidos.siVigente(gen, () => setLoading(false)))  // (2)
 * }, [filtros])
 *
 * async function cargarMas() {
 *   const { gen, signal } = pedidos.actual()          // (1) mismo listado
 *   setCargandoMas(true)
 *   try { ... if (pedidos.vigente(gen)) appendear(datos) }
 *   finally { setCargandoMas(false) }                 // (3) sin versionar
 * }
 * ```
 */
export interface Pedido {
  /** Identifica al listado vigente en el momento de pedir. */
  gen: number
  /** Cancela de verdad el pedido cuando se abre un listado nuevo. */
  signal: AbortSignal
}

export interface ControlDePedidos {
  /**
   * Abre un listado NUEVO: cancela el anterior y avanza la generación. Solo el
   * efecto que reacciona a los filtros/orden debería llamarlo — y en TODAS sus
   * corridas, incluso las que deciden no pedir nada, si no una respuesta vieja
   * pinta sobre una pantalla que ya decidió mostrar otra cosa.
   */
  abrir(): Pedido
  /**
   * Se engancha al listado VIGENTE sin abrir uno nuevo: para "cargar más" y
   * para los refrescos posteriores a una acción. Si el filtro cambia mientras
   * el pedido viaja, `vigente(gen)` da `false` y la respuesta se descarta sola.
   */
  actual(): Pedido
  /** ¿Esta generación sigue siendo la vigente? */
  vigente(gen: number): boolean
  /** Corre `fn` solo si `gen` sigue vigente. Para los `finally` del listado. */
  siVigente(gen: number, fn: () => void): void
}

/**
 * La máquina, sin React: se puede probar entera sin montar nada.
 */
export function crearControlDePedidos(): ControlDePedidos {
  let generacion = 0
  let abortador: AbortController | null = null

  const asegurarAbortador = () => {
    if (!abortador) abortador = new AbortController()
    return abortador
  }

  return {
    abrir() {
      abortador?.abort()
      abortador = new AbortController()
      generacion += 1
      return { gen: generacion, signal: abortador.signal }
    },
    actual() {
      // No toca `generacion` NI cancela lo que está en vuelo. Comparte el
      // `signal` del listado vigente a propósito: cuando ese listado se
      // reemplace, este pedido se cancela con él.
      return { gen: generacion, signal: asegurarAbortador().signal }
    },
    vigente(gen) {
      return gen === generacion
    },
    siVigente(gen, fn) {
      if (gen === generacion) fn()
    },
  }
}

/**
 * El control atado al ciclo de vida del componente. Es la MISMA instancia
 * durante toda la vida del componente: si cambiara de identidad, la generación
 * volvería a cero en cada render y el versionado dejaría de descartar nada.
 */
export function usePedidosVersionados(): ControlDePedidos {
  // `useState` con inicializador perezoso, no `useRef`: el control se crea UNA
  // vez y se devuelve el mismo siempre, sin leer un ref durante el render (lo
  // prohíbe `react-hooks/refs`). El estado nunca se actualiza — es solo el
  // lugar donde vive la instancia.
  const [control] = useState(crearControlDePedidos)
  return control
}
