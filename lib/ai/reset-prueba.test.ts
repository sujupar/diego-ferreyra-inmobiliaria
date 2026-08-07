import { describe, it, expect } from 'vitest'
import { esPalabraDeReinicio, puedeReiniciar, mensajeDeConfirmacion } from './reset-prueba'

describe('esPalabraDeReinicio', () => {
  it('reconoce la palabra como se escribe desde un teléfono', () => {
    for (const v of ['reiniciar prueba', 'Reiniciar Prueba', 'REINICIAR PRUEBA', '  reiniciar  prueba  ', 'reiniciar prueba.']) {
      expect(esPalabraDeReinicio(v), v).toBe(true)
    }
  })

  it('NO se dispara con una frase que apenas la contiene', () => {
    // Un reinicio accidental le arruina la prueba a quien la esté corriendo.
    expect(esPalabraDeReinicio('che, habría que reiniciar prueba mañana')).toBe(false)
    expect(esPalabraDeReinicio('reiniciar')).toBe(false)
    expect(esPalabraDeReinicio('prueba')).toBe(false)
  })

  it('no explota con vacío', () => {
    expect(esPalabraDeReinicio('')).toBe(false)
    expect(esPalabraDeReinicio(null)).toBe(false)
    expect(esPalabraDeReinicio(undefined)).toBe(false)
  })
})

describe('puedeReiniciar', () => {
  it('deja pasar a un teléfono de la lista, con o sin +', () => {
    expect(puedeReiniciar('573107822955', ['+573107822955'])).toBe(true)
    expect(puedeReiniciar('573107822955', ['573107822955'])).toBe(true)
  })

  it('no deja pasar a nadie más', () => {
    expect(puedeReiniciar('5491199998888', ['+573107822955'])).toBe(false)
  })

  it('FAIL-CLOSED: sin lista o con lista vacía, nadie reinicia', () => {
    // Lista vacía significa "no hay modo prueba configurado", no "cualquiera".
    expect(puedeReiniciar('573107822955', [])).toBe(false)
    expect(puedeReiniciar('573107822955', null)).toBe(false)
    expect(puedeReiniciar('573107822955', undefined)).toBe(false)
  })

  it('un teléfono vacío no matchea nunca', () => {
    expect(puedeReiniciar('', ['+573107822955'])).toBe(false)
  })
})

describe('mensajeDeConfirmacion', () => {
  it('dice qué se reinició y aclara que no se borró nada', () => {
    const m = mensajeDeConfirmacion(['la memoria y el contador de mensajes'])
    expect(m).toContain('arranca de cero')
    expect(m).toContain('no se borró nada')
  })

  it('funciona aunque no haya nada que enumerar', () => {
    expect(mensajeDeConfirmacion([])).toContain('arranca de cero')
  })
})
