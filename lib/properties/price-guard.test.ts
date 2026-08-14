import { describe, it, expect } from 'vitest'
import { evaluarCambioDePrecio, describirCambio } from './price-guard'

const base = { anterior: 1_350_000, monedaAnterior: 'USD', monedaNueva: 'USD' }

describe('evaluarCambioDePrecio — el caso que motivó todo esto', () => {
  it('un precio a medio tipear PIDE CONFIRMACIÓN, no se publica solo', () => {
    // El escenario real: el asesor está escribiendo 1290000, alcanza a poner
    // "12" y hace clic en otro lado. Sin este freno, la landing pública queda
    // mostrando US$ 12 con pauta encima.
    const v = evaluarCambioDePrecio({ ...base, nuevo: 12 })
    expect(v.tipo).toBe('confirmar')
  })

  it('cada paso intermedio de tipear 1.290.000 pide confirmación', () => {
    for (const intermedio of [1, 12, 129, 1290, 12900, 129000]) {
      expect(evaluarCambioDePrecio({ ...base, nuevo: intermedio }).tipo).toBe('confirmar')
    }
  })

  it('un cero de más (10x) también pide confirmación', () => {
    expect(evaluarCambioDePrecio({ ...base, nuevo: 13_500_000 }).tipo).toBe('confirmar')
  })

  it('un cero de menos (perder un dígito al final) pide confirmación', () => {
    expect(evaluarCambioDePrecio({ ...base, nuevo: 135_000 }).tipo).toBe('confirmar')
  })
})

describe('evaluarCambioDePrecio — cambios normales del negocio', () => {
  it('una baja de precio realista se guarda sin molestar', () => {
    // 1.350.000 → 1.290.000 es una baja del 4,4%: el caso de uso que pidió el
    // dueño. No puede pedir confirmación cada vez.
    expect(evaluarCambioDePrecio({ ...base, nuevo: 1_290_000 }).tipo).toBe('directo')
  })

  it('una baja fuerte pero plausible (15%) se guarda sin molestar', () => {
    expect(evaluarCambioDePrecio({ ...base, nuevo: 1_147_500 }).tipo).toBe('directo')
  })

  it('una suba moderada se guarda sin molestar', () => {
    expect(evaluarCambioDePrecio({ ...base, nuevo: 1_450_000 }).tipo).toBe('directo')
  })

  it('el mismo precio no es un cambio', () => {
    expect(evaluarCambioDePrecio({ ...base, nuevo: 1_350_000 }).tipo).toBe('sin-cambio')
  })

  it('justo en el umbral del 25% todavía se guarda solo', () => {
    expect(evaluarCambioDePrecio({ ...base, nuevo: 1_012_500 }).tipo).toBe('directo')
  })

  it('pasado el umbral pide confirmación', () => {
    expect(evaluarCambioDePrecio({ ...base, nuevo: 1_000_000 }).tipo).toBe('confirmar')
  })
})

describe('evaluarCambioDePrecio — cambio de moneda', () => {
  it('cambiar de dólares a pesos SIEMPRE pide confirmación, aunque el número no cambie', () => {
    // US$ 1.350.000 y $ 1.350.000 son cosas muy distintas: el mismo número en
    // pesos es una fracción del valor. Es un cambio que no puede pasar solo.
    const v = evaluarCambioDePrecio({ ...base, nuevo: 1_350_000, monedaNueva: 'ARS' })
    expect(v.tipo).toBe('confirmar')
  })

  it('cambiar de pesos a dólares también pide confirmación', () => {
    const v = evaluarCambioDePrecio({
      anterior: 500_000, nuevo: 500_000, monedaAnterior: 'ARS', monedaNueva: 'USD',
    })
    expect(v.tipo).toBe('confirmar')
  })
})

describe('evaluarCambioDePrecio — defensa ante datos raros', () => {
  it('un precio anterior en cero o ausente pide confirmación en vez de dividir por cero', () => {
    expect(evaluarCambioDePrecio({ ...base, anterior: 0, nuevo: 1000 }).tipo).toBe('confirmar')
  })

  it('un valor no numérico pide confirmación (nunca pasa de largo)', () => {
    expect(evaluarCambioDePrecio({ ...base, nuevo: Number.NaN }).tipo).toBe('confirmar')
    expect(evaluarCambioDePrecio({ ...base, nuevo: Number.POSITIVE_INFINITY }).tipo).toBe('confirmar')
  })
})

describe('describirCambio', () => {
  it('arma una frase con los dos precios y la magnitud', () => {
    const texto = describirCambio({ ...base, nuevo: 12 })
    expect(texto).toContain('1.350.000')
    expect(texto).toContain('12')
    expect(texto).toMatch(/baja/i)
  })

  it('dice "suba" cuando el precio aumenta', () => {
    expect(describirCambio({ ...base, nuevo: 13_500_000 })).toMatch(/suba/i)
  })

  it('nombra las dos monedas cuando cambia la moneda', () => {
    const texto = describirCambio({ ...base, nuevo: 1_350_000, monedaNueva: 'ARS' })
    expect(texto).toContain('US$')
    expect(texto).toContain('$')
  })
})
