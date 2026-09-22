import { describe, it, expect } from 'vitest'
import { elegirRespuesta, RESPUESTAS_CON_PRIVADO, RESPUESTAS_SIN_PRIVADO } from './respuestas'

const TODAS = [...RESPUESTAS_CON_PRIVADO, ...RESPUESTAS_SIN_PRIVADO]

describe('catálogos de respuestas', () => {
  it('cada uno tiene al menos cuatro frases distintas', () => {
    // Una fila de respuestas idénticas bajo un reel se ve como un robot, y a
    // Instagram le huele a spam. La variedad no es cosmética.
    expect(new Set(RESPUESTAS_CON_PRIVADO).size).toBeGreaterThanOrEqual(4)
    expect(new Set(RESPUESTAS_SIN_PRIVADO).size).toBeGreaterThanOrEqual(4)
  })

  it('ninguna está vacía ni se pasa del límite de Instagram', () => {
    for (const frase of TODAS) {
      expect(frase.trim().length).toBeGreaterThan(0)
      expect(frase.length).toBeLessThanOrEqual(2200)
    }
  })

  it('las del catálogo SIN privado no prometen ningún mensaje', () => {
    // ESTA es la prueba que importa. La respuesta pública sale aunque el
    // privado no haya salido (hoy mismo: Meta todavía no destrabó el permiso).
    // Decir "te escribí al privado" cuando no se escribió es mentirle a la
    // persona delante de todos los que leen los comentarios.
    for (const frase of RESPUESTAS_SIN_PRIVADO) {
      expect(frase.toLowerCase()).not.toMatch(/privado|dm|mensaje|bandeja|mandé|envié|escribí/)
    }
  })

  it('las del catálogo CON privado sí avisan que el mensaje salió', () => {
    for (const frase of RESPUESTAS_CON_PRIVADO) {
      expect(frase.toLowerCase()).toMatch(/privado|bandeja/)
    }
  })

  it('los dos catálogos no comparten ninguna frase', () => {
    for (const frase of RESPUESTAS_CON_PRIVADO) {
      expect(RESPUESTAS_SIN_PRIVADO).not.toContain(frase)
    }
  })
})

describe('elegirRespuesta', () => {
  it('elige del catálogo que corresponde según si el privado salió', () => {
    expect(RESPUESTAS_CON_PRIVADO).toContain(elegirRespuesta('a', true))
    expect(RESPUESTAS_SIN_PRIVADO).toContain(elegirRespuesta('a', false))
  })

  it('con la misma semilla devuelve siempre lo mismo', () => {
    // Determinística a propósito: Meta REINTENTA sus avisos. Si el reintento
    // eligiera otra frase, quedarían dos respuestas distintas bajo el mismo
    // comentario.
    expect(elegirRespuesta('17943666861343348', true)).toBe(elegirRespuesta('17943666861343348', true))
  })

  it('funciona con semillas raras sin romperse', () => {
    for (const semilla of ['', '🙂', '   ']) {
      expect(RESPUESTAS_CON_PRIVADO).toContain(elegirRespuesta(semilla, true))
    }
  })

  it('reparte entre varias frases y no se queda pegada en una', () => {
    const vistas = new Set(Array.from({ length: 60 }, (_, i) => elegirRespuesta(`comentario-${i}`, true)))
    expect(vistas.size).toBeGreaterThan(1)
  })

  it('usa todo el catálogo si hay suficientes comentarios', () => {
    const vistas = new Set(Array.from({ length: 400 }, (_, i) => elegirRespuesta(`c${i}`, true)))
    expect(vistas.size).toBe(RESPUESTAS_CON_PRIVADO.length)
  })
})
