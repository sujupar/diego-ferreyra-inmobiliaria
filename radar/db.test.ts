import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { configDesdeFilas, diaBA, ordenarCuentas, rotarBusquedas, soloMetricas, upsertVideoRef, yaCorrioHoy, type CuentaARevisar } from './db'

describe('diaBA', () => {
  it('usa el día de Buenos Aires, no el UTC', () => {
    // 01:30 UTC del 29 = 22:30 del 28 en Buenos Aires.
    expect(diaBA(new Date('2026-11-29T01:30:00Z'))).toBe('2026-11-28')
    expect(diaBA(new Date('2026-11-29T03:30:00Z'))).toBe('2026-11-29')
  })
})

describe('configDesdeFilas', () => {
  const filas = [
    ['multiplicador_min', 3], ['dias_max', 30], ['vistas_min', 20000], ['reels_base', 24], ['dias_maduro', 3],
    ['puntaje_min', 6], ['tope_diario', 10], ['tope_cuentas', 25], ['tope_reels', 300],
  ].map(([clave, valor]) => ({ clave: clave as string, valor }))
  it('mapea las claves de radar_config', () => {
    expect(configDesdeFilas(filas)).toEqual({
      multiplicadorMin: 3, diasMax: 30, vistasMin: 20000, reelsBase: 24, diasMaduro: 3,
      puntajeMin: 6, topeDiario: 10, topeCuentas: 25, topeReels: 300,
    })
  })
  it('una clave faltante es error, nunca un default mudo', () => {
    expect(() => configDesdeFilas(filas.filter((f) => f.clave !== 'tope_diario'))).toThrow(/tope_diario/)
  })
})

describe('ordenarCuentas', () => {
  const c = (usuario: string, origen: CuentaARevisar['origen'], rubro: CuentaARevisar['rubro'], ultima: string | null): CuentaARevisar => ({
    usuario, origen, rubro, vecesRevisada: 0, destacados: 0, ultimaRevisionAt: ultima,
  })
  it('semillas, después inmobiliarias, y la revisada hace más tiempo primero', () => {
    const orden = ordenarCuentas([
      c('otra', 'explorar', 'otro', null),
      c('inmo-reciente', 'busqueda', 'inmobiliario', '2026-11-27T00:00:00Z'),
      c('semilla-reciente', 'semilla', 'inmobiliario', '2026-11-27T00:00:00Z'),
      c('inmo-nunca', 'busqueda', 'inmobiliario', null),
      c('semilla-vieja', 'semilla', 'inmobiliario', '2026-11-01T00:00:00Z'),
    ]).map((x) => x.usuario)
    expect(orden).toEqual(['semilla-vieja', 'semilla-reciente', 'inmo-nunca', 'inmo-reciente', 'otra'])
  })
})

describe('rotarBusquedas', () => {
  it('toma n desde el cursor y da la vuelta', () => {
    expect(rotarBusquedas(['a', 'b', 'c', 'd', 'e'], 3, 3)).toEqual({ elegidos: ['d', 'e', 'a'], siguiente: 1 })
  })
  it('con menos términos que n, cada uno una vez', () => {
    expect(rotarBusquedas(['a', 'b'], 7, 6)).toEqual({ elegidos: ['b', 'a'], siguiente: 1 })
  })
  it('sin términos no hace nada', () => {
    expect(rotarBusquedas([], 4, 6)).toEqual({ elegidos: [], siguiente: 0 })
  })
})

describe('soloMetricas', () => {
  it('nunca lleva estado_uso, oculta, guion ni análisis', () => {
    const m = soloMetricas({ vistas: 1, likes: 2, comentarios: 3, multiplicador: 4, baseline_cuenta: 'b', seguidores: 5, estado_uso: 'x', oculta: false, guion: 'g', por_que: 'p' })
    expect(Object.keys(m).sort()).toEqual(['baseline_cuenta', 'comentarios', 'likes', 'multiplicador', 'seguidores', 'updated_at', 'vistas'])
  })
})

/** Doble mínimo del query builder: registra cada operación y devuelve lo que se le pida. */
function sbFalso(respuestas: { maybeSingle?: unknown; select?: unknown[] }) {
  const ops: Array<{ tabla: string; op: string; arg?: unknown }> = []
  const builder = (tabla: string) => {
    const b: Record<string, unknown> = {}
    const encadenar = (op: string) => (arg?: unknown) => {
      ops.push({ tabla, op, arg })
      return b
    }
    for (const op of ['select', 'eq', 'in', 'order', 'limit', 'update', 'insert']) b[op] = encadenar(op)
    b.maybeSingle = async () => ({ data: respuestas.maybeSingle ?? null, error: null })
    b.then = (ok: (v: unknown) => unknown) => ok({ data: respuestas.select ?? [], error: null })
    return b
  }
  return { sb: { from: builder } as unknown as SupabaseClient, ops }
}

describe('upsertVideoRef', () => {
  const fila = { ig_shortcode: 'ABC12', vistas: 9, tema: 'nuevo análisis', estado_uso: 'sin_usar', oculta: false }
  it('si no existe, inserta la fila completa', async () => {
    const { sb, ops } = sbFalso({ maybeSingle: null })
    expect(await upsertVideoRef(fila, sb)).toBe('insertada')
    expect(ops.find((o) => o.op === 'insert')?.arg).toEqual(fila)
    expect(ops.some((o) => o.op === 'update')).toBe(false)
  })
  it('si existe, actualiza SOLO las métricas', async () => {
    const { sb, ops } = sbFalso({ maybeSingle: { id: 'fila-1' } })
    expect(await upsertVideoRef(fila, sb)).toBe('actualizada')
    const upd = ops.find((o) => o.op === 'update')?.arg as Record<string, unknown>
    expect(Object.keys(upd).sort()).toEqual(['updated_at', 'vistas'])
    expect(ops.some((o) => o.op === 'insert')).toBe(false)
  })
})

describe('yaCorrioHoy', () => {
  it('compara contra el día de Buenos Aires', async () => {
    // Corrida a las 23:00 del 27 en BA (02:00 UTC del 28); "ahora" es el 28 a la mañana en BA.
    const { sb } = sbFalso({ select: [{ inicio: '2026-11-28T02:00:00Z' }] })
    expect(await yaCorrioHoy(new Date('2026-11-28T12:00:00Z'), sb)).toBe(false)
    const { sb: sb2 } = sbFalso({ select: [{ inicio: '2026-11-28T11:00:00Z' }] })
    expect(await yaCorrioHoy(new Date('2026-11-28T12:00:00Z'), sb2)).toBe(true)
  })
})
