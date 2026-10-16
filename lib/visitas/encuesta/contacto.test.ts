import { describe, it, expect } from 'vitest'
import { enmascararTelefono, ocultarEmailsEnTexto } from './contacto'

describe('enmascararTelefono', () => {
  it('muestra el área y los últimos 4, nunca el número entero', () => {
    expect(enmascararTelefono('+5491158234521')).toBe('11 ••••-4521')
    expect(enmascararTelefono('5492214567890')).toBe('22 ••••-7890')
  })
  it('un número corto o vacío no se inventa', () => {
    expect(enmascararTelefono('4567')).toBeNull()
    expect(enmascararTelefono(null)).toBeNull()
    expect(enmascararTelefono('44652269')).toBe('••••-2269')
  })
})

describe('ocultarEmailsEnTexto', () => {
  it('un email dentro de un error de Resend queda como ***@dominio', () => {
    expect(ocultarEmailsEnTexto('send failed to ana@mail.com: Invalid recipient')).toBe('send failed to ***@mail.com: Invalid recipient')
  })
  it('varios emails en el mismo texto, todos ocultos', () => {
    expect(ocultarEmailsEnTexto('de ana@mail.com a juan.perez@inmodf.com.ar falló')).toBe('de ***@mail.com a ***@inmodf.com.ar falló')
  })
  it('sin ningún email, el texto no cambia', () => {
    expect(ocultarEmailsEnTexto('Tiempo de espera agotado: Resend no respondió en 3000 ms')).toBe('Tiempo de espera agotado: Resend no respondió en 3000 ms')
  })
})
