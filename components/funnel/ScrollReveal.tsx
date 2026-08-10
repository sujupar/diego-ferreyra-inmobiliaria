import type { CSSProperties, ReactNode } from 'react'

interface ScrollRevealProps {
  children: ReactNode
  /**
   * Escalonado del grupo (en "unidades" de 0,1 como venía usándose). Ya no es un
   * retardo de TIEMPO: con la animación atada al scroll, corre el ARRANQUE del
   * recorrido, así que tres tarjetas que entran juntas siguen apareciendo una
   * detrás de otra. Se conserva el nombre y la escala para no tocar a quien lo usa.
   */
  delay?: number
  className?: string
}

/**
 * Aparición al hacer scroll para las landings del EMBUDO — 100% CSS, sin JS.
 *
 * POR QUÉ SE REESCRIBIÓ: antes esto arrancaba en `opacity-0` y solo un
 * `IntersectionObserver` dentro de un `useEffect` lo volvía visible. Si el JS no
 * llegaba a correr (un chunk que falla, red muy lenta, JS bloqueado), los tres
 * bloques de beneficios y la banda de estadística de `/tasacion-directa` nunca
 * aparecían: entre el hero y los testimonios quedaba un hueco en blanco. Con
 * `prefers-reduced-motion` tampoco se salvaba — la variante `motion-reduce:`
 * apagaba la transición y el desplazamiento, pero NO restituía la opacidad.
 * Es tráfico PAGO: el contenido no puede depender del JS para existir.
 *
 * Ahora el estado por defecto es SIEMPRE visible y la animación se agrega solo
 * donde el navegador la soporta y el usuario no pidió reducir movimiento. Es el
 * mismo patrón que ya usa la landing de propiedad (`.reveal-section` en
 * globals.css, componente `components/landing/Reveal.tsx`), que se escribió
 * justamente después de aprender esto.
 *
 *  - Sin JavaScript → visible (la anima el navegador, no el JS).
 *  - Navegador sin `animation-timeline` → visible, estático (fallback @supports).
 *  - `prefers-reduced-motion` → visible, estático.
 *
 * El CSS viaja con el componente en vez de vivir en `app/globals.css` porque
 * estas dos landings tienen su propio marco (`app/(funnels)/layout.tsx`), sin la
 * clase `.landing-root` a la que está scopeado aquel sistema. React deduplica el
 * bloque por su `href`, así que se emite una sola vez aunque haya cuatro
 * instancias en la página.
 */
const CSS = `
.funnel-reveal { opacity: 1; }
@keyframes funnel-reveal-in {
  from { opacity: 0; transform: translateY(1.5rem); }
  to   { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: no-preference) {
  @supports (animation-timeline: view()) {
    .funnel-reveal {
      animation: funnel-reveal-in linear both;
      animation-timeline: view();
      animation-range: entry var(--funnel-reveal-inicio, 0%) cover 20%;
    }
  }
}
`

export function ScrollReveal({ children, delay = 0, className }: ScrollRevealProps) {
  return (
    <>
      <style href="funnel-reveal" precedence="default">{CSS}</style>
      <div
        className={`${className ?? ''} funnel-reveal`}
        style={
          delay
            ? ({ '--funnel-reveal-inicio': `${Math.round(delay * 100)}%` } as CSSProperties)
            : undefined
        }
      >
        {children}
      </div>
    </>
  )
}
