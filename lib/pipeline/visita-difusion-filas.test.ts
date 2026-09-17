import { describe, it, expect } from 'vitest'
import { filasDeDifusion } from './visita-difusion-filas'

describe('filasDeDifusion', () => {
  it('sin nada cargado no muestra nada (no inventa secciones vacías)', () => {
    expect(filasDeDifusion(null)).toEqual([])
    expect(filasDeDifusion({})).toEqual([])
    expect(filasDeDifusion({ portales: { expensas: null, ml: {}, ap: {} }, landing: {} })).toEqual([])
  })

  it('muestra las expensas con formato argentino', () => {
    const filas = filasDeDifusion({ portales: { expensas: 85000, ml: {}, ap: {} } })
    expect(filas).toEqual([{ label: 'Expensas', value: '$85.000' }])
  })

  it('expensas en cero o negativas no son un dato: no se muestran', () => {
    expect(filasDeDifusion({ portales: { expensas: 0, ml: {}, ap: {} } })).toEqual([])
    expect(filasDeDifusion({ portales: { expensas: -1, ml: {}, ap: {} } })).toEqual([])
  })

  it('cuenta los atributos de cada portal, en singular y plural', () => {
    const filas = filasDeDifusion({ portales: { ml: { HAS_LIFT: { value_name: 'Sí' } }, ap: { A: {}, B: {} } } })
    expect(filas).toEqual([
      { label: 'MercadoLibre', value: '1 dato cargado' },
      { label: 'Argenprop', value: '2 datos cargados' },
    ])
  })

  it('las respuestas de la landing salen con su pregunta y el barrio', () => {
    const filas = filasDeDifusion({ landing: { q1: 'Pareja joven', q3: '  Las expensas  ' } }, 'Almagro')
    expect(filas).toHaveLength(2)
    expect(filas[0].label).toContain('en Almagro')
    expect(filas[0].value).toBe('Pareja joven')
    // El espacio sobrante del formulario no se muestra.
    expect(filas[1].value).toBe('Las expensas')
    expect(filas[1].wide).toBe(true)
  })

  it('una respuesta vacía no ocupa lugar', () => {
    expect(filasDeDifusion({ landing: { q1: '   ', q2: '' } })).toEqual([])
  })

  it('aguanta basura sin romper', () => {
    expect(filasDeDifusion('texto suelto')).toEqual([])
    expect(filasDeDifusion({ portales: 'no es objeto', landing: 42 })).toEqual([])
    expect(filasDeDifusion({ portales: { ml: ['no', 'es', 'objeto'] } })).toEqual([])
  })
})
