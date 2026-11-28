import { describe, expect, it } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { configDesdeFilas, cuentasParaRevisar, diaBA, ordenarCuentas, rotarBusquedas, soloMetricas, upsertVideoRef, yaCorrioHoy, type CuentaARevisar } from './db'

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
  const c = (usuario: string, origen: CuentaARevisar['origen'], rubro: CuentaARevisar['rubro'], ultima: string | null, creada: string | null = null): CuentaARevisar => ({
    usuario, origen, rubro, vecesRevisada: 0, destacados: 0, ultimaRevisionAt: ultima, creadaAt: creada,
  })
  it('las nunca revisadas se desempatan por orden de llegada (FIFO), no por nombre', () => {
    const orden = ordenarCuentas([
      c('aaa-nueva', 'explorar', 'otro', null, '2026-11-20T00:00:00Z'),
      c('zzz-vieja', 'explorar', 'otro', null, '2026-11-01T00:00:00Z'),
      c('mmm', 'busqueda', 'otro', null, '2026-11-10T00:00:00Z'),
    ]).map((x) => x.usuario)
    expect(orden).toEqual(['zzz-vieja', 'mmm', 'aaa-nueva'])
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

describe('cuentasParaRevisar', () => {
  /** Doble que registra la cadena de cada consulta y responde por grupo. */
  function sbCuentas(porGrupo: Record<string, Array<Record<string, unknown>>>) {
    const consultas: Array<Array<[string, unknown[]]>> = []
    const sb = {
      from: () => {
        const cadena: Array<[string, unknown[]]> = []
        consultas.push(cadena)
        const b: Record<string, unknown> = {}
        for (const op of ['select', 'eq', 'lt', 'or', 'order', 'limit']) {
          b[op] = (...args: unknown[]) => {
            cadena.push([op, args])
            return b
          }
        }
        b.then = (ok: (v: unknown) => unknown) => {
          const grupo = cadena.some(([op, a]) => op === 'eq' && a[0] === 'origen')
            ? 'semilla'
            : cadena.some(([op, a]) => op === 'eq' && a[0] === 'rubro')
              ? 'inmobiliario'
              : 'otro'
          const limite = cadena.find(([op]) => op === 'limit')![1][0] as number
          return ok({ data: (porGrupo[grupo] ?? []).slice(0, limite), error: null })
        }
        return b
      },
    } as unknown as SupabaseClient
    return { sb, consultas }
  }
  const fila = (usuario: string) => ({ usuario, origen: null, rubro: null, veces_revisada: 0, destacados: 0, ultima_revision_at: null, created_at: null })

  it('semillas → inmobiliarias → otras, con orden y límite en la consulta, llenando el tope', async () => {
    const { sb, consultas } = sbCuentas({
      semilla: [fila('s1'), fila('s2')],
      inmobiliario: [fila('i1'), fila('i2')],
      otro: [fila('o1'), fila('o2'), fila('o3')],
    })
    const r = await cuentasParaRevisar(5, sb)
    expect(r.map((c) => c.usuario)).toEqual(['s1', 's2', 'i1', 'i2', 'o1'])
    expect(consultas).toHaveLength(3)
    for (const q of consultas) {
      expect(q).toContainEqual(['eq', ['activa', true]])
      expect(q).toContainEqual(['lt', ['descartes_manuales', 3]])
      expect(q).toContainEqual(['order', ['ultima_revision_at', { ascending: true, nullsFirst: true }]])
      expect(q).toContainEqual(['order', ['created_at', { ascending: true }]])
    }
    expect(consultas.map((q) => q.find(([op]) => op === 'limit')![1][0])).toEqual([5, 3, 1])
  })

  it('si las semillas llenan el tope, no consulta los otros grupos', async () => {
    const { sb, consultas } = sbCuentas({ semilla: [fila('s1'), fila('s2'), fila('s3')] })
    expect((await cuentasParaRevisar(2, sb)).map((c) => c.usuario)).toEqual(['s1', 's2'])
    expect(consultas).toHaveLength(1)
  })
})
