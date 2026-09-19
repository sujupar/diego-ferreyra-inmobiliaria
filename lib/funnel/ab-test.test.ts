import { describe, it, expect } from 'vitest'
import {
  decideVariant,
  variantePorClic,
  normalizeConfig,
  shouldPersist,
  validateConfigChange,
  FALLBACK,
  type ExperimentConfig,
} from './ab-test'

const running = (splitB: number): ExperimentConfig => ({ status: 'running', splitB, winner: null })

describe('decideVariant — el test apagado', () => {
  it('sirve A cuando no hay ganador declarado', () => {
    expect(decideVariant({ status: 'off', splitB: 50, winner: null }, 0.99)).toBe('A')
  })

  it('sirve el ganador cuando lo hay', () => {
    expect(decideVariant({ status: 'off', splitB: 50, winner: 'B' }, 0.01)).toBe('B')
    expect(decideVariant({ status: 'off', splitB: 50, winner: 'A' }, 0.99)).toBe('A')
  })

  it('IGNORA la cookie: apagar el test lo apaga para todos, no solo para los nuevos', () => {
    expect(decideVariant({ status: 'off', splitB: 50, winner: null }, 0.9, 'B')).toBe('A')
  })
})

describe('decideVariant — el test pausado', () => {
  it('manda todo a A sin importar el reparto', () => {
    expect(decideVariant({ status: 'paused', splitB: 100, winner: null }, 0.01)).toBe('A')
  })

  it('ignora la cookie, igual que apagado', () => {
    expect(decideVariant({ status: 'paused', splitB: 50, winner: null }, 0.1, 'B')).toBe('A')
  })
})

describe('decideVariant — el test corriendo', () => {
  it('respeta la asignación previa del visitante', () => {
    expect(decideVariant(running(0), 0.99, 'B')).toBe('B')
    expect(decideVariant(running(100), 0.01, 'A')).toBe('A')
  })

  it('reparte según el porcentaje al no haber asignación previa', () => {
    expect(decideVariant(running(30), 0.29)).toBe('B')
    expect(decideVariant(running(30), 0.30)).toBe('A')
    expect(decideVariant(running(30), 0.31)).toBe('A')
  })

  it('en los extremos no manda a nadie al lado equivocado', () => {
    expect(decideVariant(running(0), 0)).toBe('A')
    expect(decideVariant(running(0), 0.999)).toBe('A')
    expect(decideVariant(running(100), 0)).toBe('B')
    expect(decideVariant(running(100), 0.999)).toBe('B')
  })

  it('reparte aproximadamente el porcentaje pedido sobre muchas tiradas', () => {
    let b = 0
    for (let i = 0; i < 1000; i++) if (decideVariant(running(40), i / 1000) === 'B') b++
    expect(b).toBe(400)
  })

  it('una cookie con basura no cuenta como asignación previa', () => {
    expect(decideVariant(running(0), 0.5, 'X')).toBe('A')
    expect(decideVariant(running(100), 0.5, '')).toBe('B')
  })
})

describe('decideVariant — a prueba de datos rotos', () => {
  it('sin configuración sirve A', () => {
    expect(decideVariant(null, 0.99)).toBe('A')
    expect(decideVariant(undefined, 0.99, 'B')).toBe('A')
  })

  it('un roll inválido no rompe: cae a A', () => {
    expect(decideVariant(running(50), NaN)).toBe('A')
    expect(decideVariant(running(50), Infinity)).toBe('A')
  })

  it('un roll fuera de rango se acota', () => {
    expect(decideVariant(running(50), -5)).toBe('B')
    expect(decideVariant(running(50), 99)).toBe('A')
  })
})

describe('normalizeConfig', () => {
  it('acota el split fuera de rango', () => {
    expect(normalizeConfig({ status: 'running', splitB: 150, winner: null }).splitB).toBe(100)
    expect(normalizeConfig({ status: 'running', splitB: -20, winner: null }).splitB).toBe(0)
  })

  it('un status desconocido se trata como apagado', () => {
    expect(normalizeConfig({ status: 'exploto' as never, splitB: 50, winner: null }).status).toBe('off')
  })

  it('un ganador inválido queda en null', () => {
    expect(normalizeConfig({ status: 'off', splitB: 0, winner: 'C' as never }).winner).toBeNull()
  })

  it('sin config devuelve el fallback', () => {
    expect(normalizeConfig(null)).toEqual(FALLBACK)
  })
})

describe('shouldPersist', () => {
  it('guarda la cookie solo con el test corriendo y sin asignación previa', () => {
    expect(shouldPersist(running(50))).toBe(true)
    expect(shouldPersist(running(50), 'A')).toBe(false)
  })

  it('no guarda nada con el test apagado o pausado', () => {
    expect(shouldPersist({ status: 'off', splitB: 50, winner: 'B' })).toBe(false)
    expect(shouldPersist({ status: 'paused', splitB: 50, winner: null })).toBe(false)
  })
})

describe('validateConfigChange', () => {
  it('exige elegir ganador para apagar', () => {
    expect(validateConfigChange({ status: 'off' })).toMatch(/elegir con cuál/i)
    expect(validateConfigChange({ status: 'off', winner: 'B' })).toBeNull()
  })

  it('pausar no exige ganador', () => {
    expect(validateConfigChange({ status: 'paused' })).toBeNull()
  })

  it('rechaza repartos imposibles', () => {
    expect(validateConfigChange({ splitB: 101 })).toMatch(/entre 0 y 100/)
    expect(validateConfigChange({ splitB: -1 })).toMatch(/entre 0 y 100/)
    expect(validateConfigChange({ splitB: 50 })).toBeNull()
  })

  it('rechaza estados y ganadores inventados', () => {
    expect(validateConfigChange({ status: 'volando' as never })).toMatch(/Estado inválido/)
    expect(validateConfigChange({ winner: 'Z' as never })).toMatch(/A o B/)
  })
})

/**
 * Reparto POR CLIC (decisión del dueño, 2026-09-19): cada apertura de la landing
 * se sortea de nuevo, sin recordar qué vio esa persona antes — igual que el split
 * test de GoHighLevel, que es con lo que el dueño compara.
 */
describe('variantePorClic', () => {
  /** Dado que devuelve, en orden, los valores que se le pasan. */
  const dado = (...valores: number[]) => {
    let i = 0
    return () => valores[i++ % valores.length]
  }

  it('cada clic se sortea de nuevo: la misma persona puede ver A y después B', () => {
    const tirar = dado(0.9, 0.1, 0.49, 0.5)
    const vistas = [1, 2, 3, 4].map(() => variantePorClic(running(50), tirar))
    expect(vistas).toEqual(['A', 'B', 'B', 'A'])
  })

  it('tira el dado UNA vez por clic', () => {
    let tiradas = 0
    variantePorClic(running(50), () => { tiradas++; return 0.3 })
    expect(tiradas).toBe(1)
  })

  it('sobre muchos clics reparte el porcentaje pedido', () => {
    // Generador determinístico (LCG): la prueba no puede fallar "por mala suerte".
    let s = 12345
    const azar = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296
    for (const split of [50, 30, 80]) {
      let b = 0
      for (let i = 0; i < 20000; i++) if (variantePorClic(running(split), azar) === 'B') b++
      expect(b / 20000).toBeGreaterThan(split / 100 - 0.02)
      expect(b / 20000).toBeLessThan(split / 100 + 0.02)
    }
  })

  it('pausado o apagado mandan sobre el dado: nadie ve B por azar', () => {
    const siempreB = () => 0
    expect(variantePorClic({ status: 'paused', splitB: 100, winner: null }, siempreB)).toBe('A')
    expect(variantePorClic({ status: 'off', splitB: 100, winner: null }, siempreB)).toBe('A')
    expect(variantePorClic({ status: 'off', splitB: 0, winner: 'B' }, () => 0.99)).toBe('B')
  })

  it('un dado roto o sin configuración caen en A (regla de oro)', () => {
    expect(variantePorClic(running(50), () => NaN)).toBe('A')
    expect(variantePorClic(running(99), () => 1)).toBe('A')
    expect(variantePorClic(null, () => 0)).toBe('A')
  })

  it('usa el azar real si no se le pasa un dado', () => {
    const vistas = new Set(Array.from({ length: 200 }, () => variantePorClic(running(50))))
    expect(vistas).toEqual(new Set(['A', 'B']))
  })
})
