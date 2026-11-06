/**
 * Textos de la landing B ("Tasación Neta") pedidos por Diego el 2026-11-06
 * (documento "Cambios en Landing"). Cada prueba es una fila del documento: si
 * alguien vuelve a poner el texto anterior, la prueba de esa fila se pone roja.
 */
import { describe, it, expect } from 'vitest'
import { TASACION_B_CONTENT as C, TASACION_CONTENT } from './content'

describe('landing B — textos del documento de Diego', () => {
  it('el copete abre la curiosidad en vez de anunciar la pérdida', () => {
    expect(C.hero.kicker).toBe('Antes de vender, hay un número más importante que el precio de publicación')
  })

  it('el titular compara contra lo que PUBLICÁS y dice "en mano"', () => {
    expect(C.hero.headlineA).toBe('No es cuánto publicás tu propiedad.')
    expect(C.hero.headlineB).toBe('Es cuánto te queda en mano el día que escriturás.')
    // El resaltado tiene que estar literalmente dentro de la segunda línea: el
    // componente la arma partiendo por ese texto.
    expect(C.hero.headlineB.startsWith(`Es ${C.hero.highlight} `)).toBe(true)
  })

  it('la bajada nombra los costos, sin decir que los impuestos siempre se evitan', () => {
    expect(C.hero.subhead).toBe(
      'La mayoría mira solo el precio de publicación. Pero entre la negociación, impuestos, IVA, escritura y honorarios, podés terminar recibiendo miles de dólares menos.',
    )
    expect(C.hero.subhead).not.toMatch(/se podían evitar/)
  })

  it('la bajada ya no promete los 3 números en 72 horas (pedido del dueño, 2026-11-06)', () => {
    expect(C.hero.subhead).not.toMatch(/72 horas/)
  })

  it('el caso se cuenta como contraste directo, sin "la misma reserva" (no coincide con el video)', () => {
    const armado = C.hero.credit.replace('{antes}', C.hero.heroAmountBefore).replace('{despues}', C.hero.heroAmountAfter)
    expect(armado).toBe(
      'Misma propiedad. Mismo precio de publicación. US$221.000 vs. US$237.600 en mano. Una diferencia de US$16.600.',
    )
    expect(C.hero.credit).not.toMatch(/misma reserva/)
  })

  it('el filtro de quién puede pedirla suena a invitación, no a prohibición', () => {
    expect(`${C.qualifier.lead} ${C.qualifier.body}`).toBe(
      '*Pedila si sos propietario —o uno de los propietarios— de una propiedad en CABA o Zona Norte. No necesitás tener decidido vender. Si lo estás evaluando, conocer estos números es una decisión inteligente.',
    )
    expect(C.qualifier.lead).not.toMatch(/solamente/)
  })

  it('el botón de debajo del video pide el número, no "la tasación gratuita"', () => {
    expect(C.cta.label).toBe('QUIERO SABER CUÁNTO ME QUEDA')
    expect(C.cta.note).toBe('Tasación profesional + simulación de costos. Gratis, confidencial y sin compromiso.')
    expect(C.cta.note).not.toMatch(/próximos minutos/)
  })

  it('el cierre habla del momento de elegir precio o inmobiliaria', () => {
    expect(C.finalHeading).toBe('Antes de elegir precio o inmobiliaria, sabé cuánto te va a quedar en mano.')
  })

  it('el botón final pide la tasación PROFESIONAL y repite lo que recibe', () => {
    expect(C.cta.labelFinal).toBe('SOLICITAR MI TASACIÓN PROFESIONAL')
    expect(C.cta.noteShort).toBe('Tasación profesional + simulación de costos. Sin costo y sin compromiso.')
  })

  it('el pie muestra las dos matrículas (CABA y Zona Norte)', () => {
    expect(C.footerRole).toBe('Martillero Público · CUCICBA 8266 · CMCPSI 7217')
  })

  it('el video es el VSL corto, en archivos PROPIOS (no los de la variante A ni el VSL largo)', () => {
    expect(C.hero.videoPath).toBe('web/tasacion-neta-vsl-corto-web.mp4')
    expect(C.hero.posterPath).toBe('web/tasacion-neta-vsl-corto-poster.jpg')
    expect(C.hero.videoPath).not.toBe(TASACION_CONTENT.hero.videoPath)
  })
})
