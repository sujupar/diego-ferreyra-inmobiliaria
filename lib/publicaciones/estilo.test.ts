import { describe, expect, it } from 'vitest'
import {
  EJEMPLOS_OBJETIVO,
  TAMANO_LOTE,
  aplicarClasificacion,
  candidatosDeMedia,
  estiloVigente,
  promptClasificacion,
  siguienteLote,
  type EstadoEstilo,
} from './estilo'

type Clasificando = Extract<EstadoEstilo, { etapa: 'clasificando' }>

function estado(n: number, cursor = 0, elegidos: string[] = []): Clasificando {
  return {
    etapa: 'clasificando',
    candidatos: Array.from({ length: n }, (_, i) => ({ id: `m${i}`, caption: `caption ${i}`, fecha: '2026-10-01' })),
    cursor,
    elegidos,
  }
}
const todosSi = (lote: { id: string }[]) => lote.map((c) => ({ id: c.id, es_diego_hablando: true }))

describe('candidatosDeMedia', () => {
  it('se queda solo con reels que tienen descripción, del más nuevo al más viejo', () => {
    const r = candidatosDeMedia([
      { id: '1', caption: 'viejo', media_product_type: 'REELS', timestamp: '2026-01-01T00:00:00+0000' },
      { id: '2', caption: 'foto', media_product_type: 'FEED', timestamp: '2026-05-01T00:00:00+0000' },
      { id: '3', media_product_type: 'REELS', timestamp: '2026-05-01T00:00:00+0000' },
      { id: '4', caption: 'nuevo', media_product_type: 'REELS', timestamp: '2026-06-01T00:00:00+0000' },
    ])
    expect(r.map((c) => c.id)).toEqual(['4', '1'])
    expect(r[0].fecha).toBe('2026-06-01')
  })
})

describe('siguienteLote', () => {
  it(`devuelve ${TAMANO_LOTE} desde el cursor`, () => {
    const lote = siguienteLote(estado(120, 50))
    expect(lote).toHaveLength(50)
    expect(lote[0].id).toBe('m50')
  })
})

describe('aplicarClasificacion', () => {
  it('acumula los elegidos y avanza el cursor', () => {
    const e = estado(200)
    const r = aplicarClasificacion(e, todosSi(siguienteLote(e)).map((x, i) => ({ ...x, es_diego_hablando: i % 2 === 0 })))
    expect(r.etapa).toBe('clasificando')
    if (r.etapa !== 'clasificando') return
    expect(r.cursor).toBe(50)
    expect(r.elegidos).toHaveLength(25)
  })

  it(`pasa a redactando al llegar a ${EJEMPLOS_OBJETIVO} exactos y descarta los sobrantes`, () => {
    const e = estado(200, 50, Array.from({ length: 80 }, (_, i) => `m${i}`))
    const r = aplicarClasificacion(e, todosSi(siguienteLote(e)))
    expect(r.etapa).toBe('redactando')
    if (r.etapa !== 'redactando') return
    expect(r.ejemplos).toHaveLength(EJEMPLOS_OBJETIVO)
  })

  it('pasa a redactando al agotar los candidatos aunque haya menos de 100', () => {
    const e = estado(60, 50, ['m0', 'm1'])
    const r = aplicarClasificacion(e, todosSi(siguienteLote(e)))
    expect(r.etapa).toBe('redactando')
    if (r.etapa !== 'redactando') return
    expect(r.ejemplos).toHaveLength(12)
  })

  it('ignora ids que la IA devuelve y no estaban en el lote', () => {
    const e = estado(200)
    const r = aplicarClasificacion(e, [{ id: 'inventado', es_diego_hablando: true }, { id: 'm0', es_diego_hablando: true }])
    if (r.etapa !== 'clasificando') throw new Error('esperaba clasificando')
    expect(r.elegidos).toEqual(['m0'])
  })

  it('conserva el documento anterior mientras se reaprende', () => {
    const anterior = { etapa: 'listo' as const, guia: 'vieja', ejemplos: [], aprendido_en: '2026-01-01' }
    const e = { ...estado(60, 50), anterior }
    const r = aplicarClasificacion(e, todosSi(siguienteLote(e)))
    expect(estiloVigente(r)?.guia).toBe('vieja')
  })
})

describe('promptClasificacion', () => {
  it('incluye cada id y caption del lote', () => {
    const { user } = promptClasificacion([{ id: 'abc', caption: 'Hola soy Diego' }])
    expect(user).toContain('abc')
    expect(user).toContain('Hola soy Diego')
  })
})
