/**
 * Llamar a una función de la base que devuelve MUCHAS filas, sin perder ninguna.
 *
 * El bug que estas pruebas clavan (medido el 2026-09-19): la API de Supabase corta toda
 * respuesta en 1000 filas, sin avisar. `funnel_video_heatmap` devuelve 100 filas por cada
 * combinación (video, segmento, etapa): con un rango de 90 días eran 1300 y llegaban 1000.
 * Las que se caían eran TODAS las del video de la landing B (`hero-tasacion-neta`), así que
 * Embudos mostraba "Vistas: 9" con la curva de retención plana en 0 %, y ningún error.
 * A 30 días quedaba margen para solo 3 combinaciones más.
 */
import { describe, it, expect } from 'vitest'
import { rpcPaginado } from './rpc-paginado'

/** Cliente falso: `filas` es lo que "tiene" la base; registra cómo se lo llamó. */
function clienteFalso(filas: unknown[], opciones: { falla?: string; tope?: number } = {}) {
  const llamadas: { fn: string; args: unknown; orden: string[]; desde: number; hasta: number }[] = []
  const tope = opciones.tope ?? 1000
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      const orden: string[] = []
      const q = {
        order(col: string) { orden.push(col); return q },
        async range(desde: number, hasta: number) {
          llamadas.push({ fn, args, orden: [...orden], desde, hasta })
          if (opciones.falla) return { data: null, error: { message: opciones.falla } }
          // Como la API real: nunca más de `tope` filas por respuesta, pida lo que pida.
          return { data: filas.slice(desde, Math.min(hasta + 1, desde + tope)), error: null }
        },
      }
      return q
    },
  }
  return { client, llamadas }
}

const N = (n: number) => Array.from({ length: n }, (_, i) => ({ i }))

describe('rpcPaginado', () => {
  it('trae TODAS las filas aunque superen el tope de 1000 por respuesta', async () => {
    const { client, llamadas } = clienteFalso(N(1300))
    const r = await rpcPaginado(client, 'funnel_video_heatmap', { p_from: 'a' }, ['video_key', 'bucket'])
    expect(r.filas).toHaveLength(1300)
    expect(r.filas.map((f) => (f as { i: number }).i)).toEqual(N(1300).map((f) => f.i))
    expect(r.truncado).toBe(false)
    expect(llamadas.map((l) => [l.desde, l.hasta])).toEqual([[0, 999], [1000, 1999]])
  })

  it('con pocas filas hace UNA sola llamada', async () => {
    const { client, llamadas } = clienteFalso(N(154))
    const r = await rpcPaginado(client, 'heatmap_clicks_grid', {}, ['page'])
    expect(r.filas).toHaveLength(154)
    expect(llamadas).toHaveLength(1)
  })

  it('justo 1000 filas: pide una página más para confirmar que no hay otra', async () => {
    const { client, llamadas } = clienteFalso(N(1000))
    const r = await rpcPaginado(client, 'x', {}, ['a'])
    expect(r.filas).toHaveLength(1000)
    expect(llamadas).toHaveLength(2)
    expect(r.truncado).toBe(false)
  })

  it('SIEMPRE ordena, y por las columnas pedidas: sin orden fijo, paginar repite o saltea filas', async () => {
    const { client, llamadas } = clienteFalso(N(10))
    await rpcPaginado(client, 'x', {}, ['funnel', 'video_key', 'segment', 'stage', 'bucket'])
    expect(llamadas[0].orden).toEqual(['funnel', 'video_key', 'segment', 'stage', 'bucket'])
    await expect(rpcPaginado(client, 'x', {}, [])).rejects.toThrow(/orden/i)
  })

  it('tiene un techo de páginas y AVISA que cortó, en vez de quedarse girando o mentir', async () => {
    const { client, llamadas } = clienteFalso(N(50_000))
    const r = await rpcPaginado(client, 'x', {}, ['a'], { maxPaginas: 3 })
    expect(llamadas).toHaveLength(3)
    expect(r.filas).toHaveLength(3000)
    expect(r.truncado).toBe(true)
  })

  it('si la base falla devuelve lo que juntó hasta ahí y el error, sin explotar', async () => {
    const { client } = clienteFalso(N(10), { falla: 'function does not exist' })
    const r = await rpcPaginado(client, 'x', {}, ['a'])
    expect(r.filas).toEqual([])
    expect(r.error).toMatch(/does not exist/)
  })
})
