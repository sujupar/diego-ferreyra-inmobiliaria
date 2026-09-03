import { describe, it, expect } from 'vitest'
import { sincronizarBorrador, debeEmitir, BORRADOR_INICIAL } from './borrador-filtro'

/**
 * La regla difícil de un control con espera: el valor vuelve DESDE AFUERA
 * (la dirección del navegador) después de que uno lo mandó, y para entonces la
 * persona ya siguió escribiendo. Si esa vuelta pisa el campo, se come letras.
 * Pero si NUNCA pisa, "Limpiar todo" y el botón atrás dejan de funcionar.
 */
describe('sincronizarBorrador', () => {
  it('arranca mostrando lo que ya venia en la direccion', () => {
    const estado = sincronizarBorrador(BORRADOR_INICIAL, 'almagro')
    expect(estado.borrador).toBe('almagro')
  })

  it('el eco de lo que uno mismo mando NO pisa lo que se sigue escribiendo', () => {
    // Escribi "alma", se aplico, y mientras la direccion daba la vuelta yo
    // ya habia escrito "almagro".
    const trasEmitir = { borrador: 'almagro', externoVisto: '', ultimoEmitido: 'alma' }
    const estado = sincronizarBorrador(trasEmitir, 'alma')
    expect(estado.borrador).toBe('almagro')
  })

  it('el mismo valor externo repetido tampoco pisa nada', () => {
    // React puede volver a dibujar con la misma prop muchas veces. Si cada
    // dibujo re-adoptara el valor externo, el campo quedaria imposible de usar.
    let estado = sincronizarBorrador(BORRADOR_INICIAL, '')
    estado = { ...estado, borrador: 'almagro', ultimoEmitido: 'alma' }
    estado = sincronizarBorrador(estado, 'alma')
    estado = sincronizarBorrador(estado, 'alma')
    estado = sincronizarBorrador(estado, 'alma')
    expect(estado.borrador).toBe('almagro')
  })

  it('un cambio de AFUERA de verdad si pisa el campo', () => {
    // "Limpiar todo".
    const estado = sincronizarBorrador(
      { borrador: 'almagro', externoVisto: 'almagro', ultimoEmitido: null },
      '',
    )
    expect(estado.borrador).toBe('')
  })

  it('volver con el boton atras al MISMO texto que uno habia mandado si pisa', () => {
    // Este es el caso que se rompe con la version ingenua: el valor coincide
    // con lo ultimo que emitimos, pero ya no es un eco — pasaron cosas en el
    // medio. El eco se consume UNA sola vez.
    let estado = sincronizarBorrador(BORRADOR_INICIAL, '')
    estado = { ...estado, borrador: 'almagro', ultimoEmitido: 'alma' }
    estado = sincronizarBorrador(estado, 'alma')   // el eco
    estado = sincronizarBorrador(estado, '')       // limpiar todo
    expect(estado.borrador).toBe('')
    estado = sincronizarBorrador(estado, 'alma')   // boton atras
    expect(estado.borrador).toBe('alma')
  })

  it('devuelve el MISMO objeto si no cambio nada (no fuerza redibujos)', () => {
    const estado = { borrador: 'almagro', externoVisto: 'alma', ultimoEmitido: null }
    expect(sincronizarBorrador(estado, 'alma')).toBe(estado)
  })
})

describe('debeEmitir', () => {
  it('emite cuando el texto cambio', () => {
    expect(debeEmitir('almagro', 'alma')).toBe(true)
  })

  it('no emite cuando quedo igual que lo aplicado', () => {
    // Escribir una letra y borrarla no puede costar un pedido al servidor.
    expect(debeEmitir('alma', 'alma')).toBe(false)
  })

  it('no emite cuando los dos estan vacios', () => {
    expect(debeEmitir('', '')).toBe(false)
  })
})
