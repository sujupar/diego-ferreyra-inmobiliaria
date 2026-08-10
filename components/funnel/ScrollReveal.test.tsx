import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { ScrollReveal } from './ScrollReveal'

/**
 * Estas dos landings son TRÁFICO PAGO. La regla del proyecto es que el contenido
 * nunca dependa del JS para ser visible: si un chunk falla o la red es muy
 * lenta, el visitante tiene que poder leer igual los argumentos de la oferta.
 *
 * Se prueba contra el HTML que sale del SERVIDOR, que es exactamente lo que ve
 * alguien cuyo JS no llegó a correr. Antes ese HTML traía `opacity-0` y solo un
 * IntersectionObserver lo revertía: sin JS, hueco en blanco.
 */
describe('ScrollReveal — el contenido sale visible del servidor', () => {
  const html = renderToStaticMarkup(
    <ScrollReveal className="grid gap-4">
      <p>Cuánto vale tu propiedad</p>
    </ScrollReveal>,
  )

  it('el contenido está en el HTML servido', () => {
    expect(html).toContain('Cuánto vale tu propiedad')
  })

  it('no sale escondido esperando al JS', () => {
    expect(html).not.toContain('opacity-0')
    expect(html).not.toContain('translate-y-6')
  })

  it('conserva las clases que le pasa quien lo usa', () => {
    expect(html).toContain('grid gap-4')
  })

  it('la animación es CSS y está guardada por soporte y por reduced-motion', () => {
    // Las dos guardas juntas son lo que garantiza que el estado por defecto —el
    // de un navegador viejo o el de alguien que pidió menos movimiento— sea
    // "visible y quieto", nunca "invisible".
    expect(html).toContain('@supports (animation-timeline: view())')
    expect(html).toContain('@media (prefers-reduced-motion: no-preference)')
  })

  it('el escalonado viaja como variable CSS, no como estado de JS', () => {
    const conRetardo = renderToStaticMarkup(
      <ScrollReveal delay={0.2}>
        <p>Tercera tarjeta</p>
      </ScrollReveal>,
    )
    expect(conRetardo).toContain('--funnel-reveal-inicio:20%')
    expect(conRetardo).not.toContain('opacity-0')
  })
})
