'use client'

/**
 * Deslizar con el dedo para pasar de foto, en los visores a pantalla completa
 * de la ficha (portada y pestaña Multimedia).
 *
 * POR QUÉ existe: los dos visores navegaban SOLO con el teclado
 * (`ArrowLeft`/`ArrowRight`) y con dos flechas de texto que, en un teléfono,
 * caen ENCIMA de la foto (`left-4`/`right-4` contra una imagen de `92vw`). El
 * gesto que todo el mundo prueba primero —arrastrar de costado— no hacía nada.
 *
 * La regla vive acá, separada de React, porque es lo único que se puede probar
 * de verdad: happy-dom no tiene gestos ni layout.
 */

import { useRef } from 'react'
import type { TouchEvent as ReactTouchEvent } from 'react'

export type DireccionDeslizada = 'anterior' | 'siguiente' | null

/**
 * Cuánto hay que arrastrar para que cuente como deslizamiento. Por debajo es un
 * toque: en el visor, un toque sobre el fondo CIERRA, así que un umbral chico
 * haría que cada intento de cerrar cambiara de foto.
 */
export const MIN_DESLIZAMIENTO_PX = 45

/**
 * Traduce el desplazamiento del dedo a una intención.
 *
 * El eje vertical manda cuando empata o gana: arrastrar hacia arriba/abajo en un
 * visor no es "foto siguiente", y sin esta comparación un gesto diagonal de
 * scroll saltaría de foto sin que nadie lo haya pedido.
 */
export function direccionDeslizada(dx: number, dy: number): DireccionDeslizada {
  if (Math.abs(dx) < MIN_DESLIZAMIENTO_PX) return null
  if (Math.abs(dx) <= Math.abs(dy)) return null
  // Arrastrar hacia la IZQUIERDA trae la foto de la derecha (la siguiente),
  // igual que pasar una página.
  return dx < 0 ? 'siguiente' : 'anterior'
}

export interface GestosDeVisor {
  onTouchStart: (e: ReactTouchEvent) => void
  onTouchEnd: (e: ReactTouchEvent) => void
  /**
   * `true` UNA sola vez si el gesto que acaba de terminar fue un deslizamiento.
   *
   * Existe porque el fondo del visor cierra al hacer clic, y un deslizamiento
   * termina emitiendo también un clic sintético: sin esto, pasar de foto cerraba
   * el visor en el mismo gesto. Se consume al leerla para que un clic de mouse
   * posterior —que nunca pasa por `touchstart`— siga cerrando normalmente.
   */
  absorbioElToque: () => boolean
}

export function useDeslizarFotos(onAnterior: () => void, onSiguiente: () => void): GestosDeVisor {
  const inicio = useRef<{ x: number; y: number } | null>(null)
  const deslizo = useRef(false)

  return {
    onTouchStart: (e) => {
      const t = e.touches?.[0]
      deslizo.current = false
      inicio.current = t ? { x: t.clientX, y: t.clientY } : null
    },
    onTouchEnd: (e) => {
      const desde = inicio.current
      inicio.current = null
      const t = e.changedTouches?.[0]
      if (!desde || !t) return
      const dir = direccionDeslizada(t.clientX - desde.x, t.clientY - desde.y)
      if (!dir) return
      deslizo.current = true
      if (dir === 'anterior') onAnterior()
      else onSiguiente()
    },
    absorbioElToque: () => {
      const valor = deslizo.current
      deslizo.current = false
      return valor
    },
  }
}
