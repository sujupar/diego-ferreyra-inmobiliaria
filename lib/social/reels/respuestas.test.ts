import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { elegirRespuesta, prometePrivado, RESPUESTAS_CON_PRIVADO, RESPUESTAS_SIN_PRIVADO } from './respuestas'
import { FRASES_CON_PRIVADO, FRASES_SIN_PRIVADO } from './textos-por-defecto'

const TODAS = [...RESPUESTAS_CON_PRIVADO, ...RESPUESTAS_SIN_PRIVADO]

describe('catálogos de fábrica', () => {
  it('cada uno tiene tres frases distintas (las que rotan, como pidió el dueño)', () => {
    // Una fila de respuestas idénticas bajo un reel se ve como un robot, y a
    // Instagram le huele a spam. La variedad no es cosmética.
    expect(new Set(RESPUESTAS_CON_PRIVADO).size).toBe(3)
    expect(new Set(RESPUESTAS_SIN_PRIVADO).size).toBe(3)
  })

  it('ninguna está vacía ni se pasa del tope de 300 caracteres', () => {
    for (const frase of TODAS) {
      expect(frase.trim().length).toBeGreaterThan(0)
      expect(frase.length).toBeLessThanOrEqual(300)
    }
  })

  it('las del catálogo SIN privado no prometen ningún mensaje', () => {
    // ESTA es la prueba que importa. La respuesta pública sale aunque el
    // privado no haya salido (hoy mismo: Meta todavía no destrabó el permiso).
    // Decir "te escribí al privado" cuando no se escribió es mentirle a la
    // persona delante de todos los que leen los comentarios.
    for (const frase of RESPUESTAS_SIN_PRIVADO) expect(prometePrivado(frase)).toBe(false)
  })

  it('las del catálogo CON privado sí avisan que el mensaje salió', () => {
    for (const frase of RESPUESTAS_CON_PRIVADO) expect(prometePrivado(frase)).toBe(true)
  })

  it('son las mismas que el default de la base (lo que se ve es lo que se manda)', () => {
    // La migración pone estas frases como valor por defecto de las columnas. Si
    // alguien cambia una en el código y no en la base, los reels nuevos saldrían
    // con otra frase que la que muestra la pantalla.
    const sql = readFileSync('supabase/migrations/20260922000005_reels_frases_publicas.sql', 'utf8')
    for (const frase of [...FRASES_CON_PRIVADO, ...FRASES_SIN_PRIVADO]) {
      expect(sql).toContain(`'${frase.replaceAll("'", "''")}'`)
    }
  })
})

describe('prometePrivado', () => {
  it('detecta las frases que dicen que se mandó un mensaje', () => {
    expect(prometePrivado('Te escribí por DM')).toBe(true)
    expect(prometePrivado('fijate tu bandeja')).toBe(true)
    expect(prometePrivado('Ya te lo mandé')).toBe(true)
  })

  it('no marca un agradecimiento', () => {
    expect(prometePrivado('¡Gracias por comentar! 🙌')).toBe(false)
  })
})

describe('elegirRespuesta', () => {
  it('sin frases del reel, elige del catálogo de fábrica que corresponde', () => {
    expect(RESPUESTAS_CON_PRIVADO).toContain(elegirRespuesta('a', true))
    expect(RESPUESTAS_SIN_PRIVADO).toContain(elegirRespuesta('a', false))
  })

  it('con frases del reel, usa las del reel', () => {
    const frases = { con: ['Uno 📩', 'Dos 📩'], sin: ['Gracias A', 'Gracias B'] }
    expect(frases.con).toContain(elegirRespuesta('x', true, frases))
    expect(frases.sin).toContain(elegirRespuesta('x', false, frases))
  })

  it('si las frases del reel están vacías, cae en las de fábrica: nunca una respuesta vacía', () => {
    expect(RESPUESTAS_CON_PRIVADO).toContain(elegirRespuesta('x', true, { con: [], sin: [] }))
    expect(RESPUESTAS_SIN_PRIVADO).toContain(elegirRespuesta('x', false, { con: ['  ', ''], sin: null }))
  })

  it('no revienta si la base devuelve algo que no es texto (cae en las de fábrica)', () => {
    // Un arreglo de dos dimensiones escrito directo en la base llegaba acá como
    // arreglos adentro de arreglos, y f.trim() tiraba la excepción.
    const raro = { sin: [['a', 'b']] as unknown as string[] }
    expect(RESPUESTAS_SIN_PRIVADO).toContain(elegirRespuesta('x', false, raro))
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

  it('usa todas las frases si hay suficientes comentarios', () => {
    const vistas = new Set(Array.from({ length: 400 }, (_, i) => elegirRespuesta(`c${i}`, true)))
    expect(vistas.size).toBe(RESPUESTAS_CON_PRIVADO.length)
  })
})
