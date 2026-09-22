import { describe, it, expect } from 'vitest'
import { puedeCambiarInterruptorGeneral, avisoAlPrender } from './interruptor'

describe('puedeCambiarInterruptorGeneral', () => {
  it('solo admin y dueño (decisión del dueño, 2026-09-22)', () => {
    expect(puedeCambiarInterruptorGeneral('admin')).toBe(true)
    expect(puedeCambiarInterruptorGeneral('dueno')).toBe(true)
    for (const rol of ['coordinador', 'asesor', 'abogado', '', null, undefined]) {
      expect(puedeCambiarInterruptorGeneral(rol)).toBe(false)
    }
  })
})

describe('avisoAlPrender', () => {
  it('sin reels activos dice que no va a pasar nada todavía', () => {
    expect(avisoAlPrender({ prueba: 0, en_vivo: 0 })).toMatch(/ningún reel/i)
  })

  it('con reels en Modo prueba dice que responden solo a las cuentas de prueba', () => {
    expect(avisoAlPrender({ prueba: 1, en_vivo: 0 })).toMatch(/1 reel en Modo prueba/)
  })

  it('con reels En vivo lo dice primero y en plural', () => {
    const texto = avisoAlPrender({ prueba: 2, en_vivo: 3 })
    expect(texto).toMatch(/3 reels En vivo van a empezar/)
    expect(texto).toMatch(/2 reels en Modo prueba van a/)
    expect(texto).toMatch(/clientes reales/)
    expect(texto.indexOf('En vivo')).toBeLessThan(texto.indexOf('Modo prueba'))
  })
})
