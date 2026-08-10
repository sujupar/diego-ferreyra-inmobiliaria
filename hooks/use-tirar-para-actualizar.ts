'use client'

/**
 * Tirar hacia abajo para actualizar, sin ninguna dependencia nueva.
 *
 * POR QUÉ existe: en una lista de mensajes es EL gesto que todo el mundo
 * intenta primero. Acá no había ninguno — la lista de conversaciones se
 * refresca sola cada 15 segundos y el asesor no tiene forma de pedirle "fijate
 * ahora". El reflejo era tirar hacia abajo, no pasaba nada, y (antes de que la
 * conversación viviera en la URL) el "tirar para recargar" del navegador se
 * llevaba puesta la pantalla entera.
 *
 * LAS REGLAS ESTÁN SEPARADAS DE REACT, arriba, porque es lo único que se puede
 * probar de verdad: happy-dom no tiene gestos, ni scroll, ni rebote de iOS.
 *
 * La regla que más importa no es el umbral sino `arranqueValido`: el tirón se
 * apropia del gesto (llama a `preventDefault`) y eso, mal hecho, se come el
 * deslizar-desde-el-borde para volver, que es el otro reflejo automático del
 * teléfono. Por eso el gesto solo se toma cuando es CLARAMENTE vertical y hacia
 * abajo y la lista ya está arriba de todo.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

/** Cuánto hay que haber bajado el indicador para que soltar dispare la actualización. */
export const DISTANCIA_PARA_SOLTAR = 64

/** Tope del indicador: más allá el dedo sigue pero el dibujo ya no crece. */
export const DISTANCIA_MAXIMA = 96

/**
 * El indicador avanza la MITAD de lo que avanza el dedo. La resistencia es lo
 * que hace que el gesto se sienta elástico y, sobre todo, lo que evita que un
 * arrastre rápido dispare la actualización sin querer.
 */
export const FACTOR_RESISTENCIA = 0.5

/**
 * A partir de cuántos píxeles se decide si el gesto es un tirón o un scroll.
 * Antes de eso no se decide nada: con 2 o 3 píxeles, el ruido del dedo hace que
 * dx y dy se turnen y el eje quedaría elegido al azar.
 */
export const PIXELES_PARA_DECIDIR = 10

export interface MedidaDelGesto {
  /** `scrollTop` del contenedor cuando arrancó el gesto. */
  scrollTop: number
  /** Desplazamiento horizontal acumulado (positivo hacia la derecha). */
  dx: number
  /** Desplazamiento vertical acumulado (positivo hacia abajo). */
  dy: number
}

/**
 * ¿Este gesto es un "tirar para actualizar"?
 *
 * Las tres condiciones, y cada una tapa un agujero distinto:
 *  · `scrollTop <= 0` — si la lista está a mitad de camino, tirar hacia abajo
 *    es scrollear, no actualizar.
 *  · `dy > 0` — hacia arriba nunca.
 *  · `dy > |dx|` — un gesto diagonal, y sobre todo uno horizontal, NO es esto.
 *    Es la condición que deja intacto el deslizar-desde-el-borde para volver:
 *    ese gesto es horizontal, así que nunca entra acá y nunca se le llama
 *    `preventDefault`.
 */
export function arranqueValido({ scrollTop, dx, dy }: MedidaDelGesto): boolean {
  if (scrollTop > 0) return false
  if (dy <= 0) return false
  return dy > Math.abs(dx)
}

/** Cuánto se dibuja el indicador para un dedo que bajó `dy` píxeles. */
export function distanciaVisible(dy: number): number {
  if (dy <= 0) return 0
  return Math.min(DISTANCIA_MAXIMA, dy * FACTOR_RESISTENCIA)
}

export type EstadoDelTiron = 'inactivo' | 'tirando' | 'soltar' | 'refrescando'

/** En qué está el gesto, para que el indicador diga la verdad sin adivinar. */
export function estadoDelTiron(distancia: number, refrescando: boolean): EstadoDelTiron {
  if (refrescando) return 'refrescando'
  if (distancia <= 0) return 'inactivo'
  return distancia >= DISTANCIA_PARA_SOLTAR ? 'soltar' : 'tirando'
}

/** Al soltar: ¿alcanzó para actualizar? */
export function alcanzaParaRefrescar(distancia: number): boolean {
  return distancia >= DISTANCIA_PARA_SOLTAR
}

export interface TironParaActualizar {
  /** Va en el elemento que scrollea. */
  contenedorRef: React.RefObject<HTMLDivElement | null>
  distancia: number
  estado: EstadoDelTiron
  refrescando: boolean
}

/**
 * Engancha el gesto a un contenedor que scrollea.
 *
 * `onRefrescar` se guarda en un ref: así el efecto que registra los oyentes se
 * arma UNA vez y no se rearma en cada render del padre (que en esta pantalla
 * re-renderiza cada 15 segundos por el sondeo de la lista).
 */
export function useTirarParaActualizar(onRefrescar?: () => Promise<unknown> | void): TironParaActualizar {
  const contenedorRef = useRef<HTMLDivElement | null>(null)
  const [distancia, setDistancia] = useState(0)
  const [refrescando, setRefrescando] = useState(false)

  const alRefrescar = useRef(onRefrescar)
  useEffect(() => {
    alRefrescar.current = onRefrescar
  }, [onRefrescar])

  const refrescandoRef = useRef(false)
  const distanciaRef = useRef(0)
  const inicio = useRef<{ x: number; y: number; scrollTop: number } | null>(null)
  const tomado = useRef(false)

  const fijarDistancia = useCallback((valor: number) => {
    distanciaRef.current = valor
    setDistancia(valor)
  }, [])

  useEffect(() => {
    const el = contenedorRef.current
    if (!el) return

    function alEmpezar(e: TouchEvent) {
      // Mientras se está actualizando, el gesto no se vuelve a tomar: si no, dos
      // tirones seguidos disparan dos llamadas a la API.
      if (refrescandoRef.current) return
      // Con más de un dedo es un pellizco para hacer zoom, y ESE gesto no es
      // nuestro. Sin esta guarda, el segundo `touchstart` del pellizco re-armaba
      // el inicio desde `touches[0]`; si después ese dedo bajaba —que es la
      // forma normal de abrir un pellizco— con la lista arriba de todo, se
      // llamaba a `preventDefault` y el zoom no ocurría. Bloquear el zoom es
      // una falla de accesibilidad, no un detalle.
      if (e.touches.length > 1) { inicio.current = null; return }
      const t = e.touches[0]
      tomado.current = false
      inicio.current = t ? { x: t.clientX, y: t.clientY, scrollTop: el?.scrollTop ?? 0 } : null
    }

    function alMover(e: TouchEvent) {
      // Un segundo dedo que aparece a mitad del gesto también lo convierte en
      // pellizco: se suelta, aunque ya estuviera tomado.
      if (e.touches.length > 1) { inicio.current = null; tomado.current = false; return }
      const desde = inicio.current
      const t = e.touches[0]
      if (!desde || !t) return
      const dx = t.clientX - desde.x
      const dy = t.clientY - desde.y

      if (!tomado.current) {
        // Todavía no se decidió de qué gesto se trata.
        if (Math.abs(dy) < PIXELES_PARA_DECIDIR && Math.abs(dx) < PIXELES_PARA_DECIDIR) return
        if (!arranqueValido({ scrollTop: desde.scrollTop, dx, dy })) {
          // No es lo nuestro (scroll normal, o un deslizamiento horizontal como
          // el de volver): se suelta el gesto ENTERO y no se lo vuelve a mirar
          // hasta el próximo `touchstart`. Nunca se llama a `preventDefault`.
          inicio.current = null
          return
        }
        tomado.current = true
      }

      // Desde acá el gesto es nuestro. `preventDefault` evita que además de
      // nuestro indicador se dispare el rebote de iOS: si los dos se mueven, se
      // ve doble movimiento y el gesto se siente roto.
      if (e.cancelable) e.preventDefault()
      fijarDistancia(distanciaVisible(dy))
    }

    async function alTerminar() {
      const eraNuestro = tomado.current
      const recorrido = distanciaRef.current
      inicio.current = null
      tomado.current = false
      if (!eraNuestro) return
      if (!alcanzaParaRefrescar(recorrido) || !alRefrescar.current) {
        fijarDistancia(0)
        return
      }
      refrescandoRef.current = true
      setRefrescando(true)
      // El indicador se queda en el umbral mientras dura la actualización, para
      // que no parezca que el tirón no hizo nada.
      fijarDistancia(DISTANCIA_PARA_SOLTAR)
      try {
        await alRefrescar.current()
      } catch {
        // La lista ya muestra sus propios errores; acá lo único que importa es
        // que el indicador no se quede girando para siempre.
      } finally {
        refrescandoRef.current = false
        setRefrescando(false)
        fijarDistancia(0)
      }
    }

    // `touchmove` NO puede ser pasivo: es el único que puede llamar a
    // `preventDefault`, y sin eso el rebote del sistema compite con el indicador.
    el.addEventListener('touchstart', alEmpezar, { passive: true })
    el.addEventListener('touchmove', alMover, { passive: false })
    el.addEventListener('touchend', alTerminar, { passive: true })
    el.addEventListener('touchcancel', alTerminar, { passive: true })
    return () => {
      el.removeEventListener('touchstart', alEmpezar)
      el.removeEventListener('touchmove', alMover)
      el.removeEventListener('touchend', alTerminar)
      el.removeEventListener('touchcancel', alTerminar)
    }
  }, [fijarDistancia])

  return { contenedorRef, distancia, estado: estadoDelTiron(distancia, refrescando), refrescando }
}
