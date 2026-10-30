/**
 * Supabase FALSO en memoria, solo para las pruebas de lib/consultas.
 *
 * Imita lo justo de la cadena de supabase-js que usan estos módulos:
 * `from(t).select(...)`, `.update(obj)`, `.insert(obj)`, `.eq(col, v)`,
 * `.maybeSingle()`, `.single()` y el `await` directo. Como supabase-js de
 * verdad, NUNCA lanza: devuelve `{ data, error }` — así las pruebas cubren que
 * el código mire el error en vez de asumir que el `await` explota.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type Fila = Record<string, unknown>
type Op = 'select' | 'update' | 'insert'

export interface SupabaseFalso {
  cliente: SupabaseClient
  tablas: Record<string, Fila[]>
  /** Hace fallar la próxima operación `op` sobre `tabla` con ese mensaje. */
  fallar(tabla: string, op: Op, mensaje: string): void
}

export function crearSupabaseFalso(inicial: Record<string, Fila[]>): SupabaseFalso {
  const tablas: Record<string, Fila[]> = {}
  for (const [t, filas] of Object.entries(inicial)) tablas[t] = filas.map((f) => ({ ...f }))
  const fallas: Array<{ tabla: string; op: Op; mensaje: string }> = []
  let secuencia = 0

  function from(tabla: string) {
    const filtros: Array<[string, unknown]> = []
    const filtrosNulos: Array<[string, null]> = []
    let op: Op = 'select'
    let cambios: Fila | null = null
    let modo: 'muchas' | 'maybeSingle' | 'single' = 'muchas'

    const ejecutar = (): { data: unknown; error: { message: string } | null } => {
      const i = fallas.findIndex((f) => f.tabla === tabla && f.op === op)
      if (i >= 0) {
        const [f] = fallas.splice(i, 1)
        return { data: null, error: { message: f.mensaje } }
      }
      const filas = (tablas[tabla] ??= [])
      let resultado: Fila[]
      if (op === 'insert') {
        const nueva = { id: `gen-${++secuencia}`, ...(cambios ?? {}) }
        filas.push(nueva)
        resultado = [nueva]
      } else {
        resultado = filas.filter((f) => filtros.every(([c, v]) => f[c] === v)
          && filtrosNulos.every(([c]) => f[c] === null || f[c] === undefined))
        if (op === 'update') for (const f of resultado) Object.assign(f, cambios)
      }
      const copia = resultado.map((f) => ({ ...f }))
      if (modo === 'muchas') return { data: copia, error: null }
      if (copia.length > 1) return { data: null, error: { message: 'más de una fila' } }
      if (copia.length === 0 && modo === 'single') return { data: null, error: { message: 'ninguna fila' } }
      return { data: copia[0] ?? null, error: null }
    }

    const b = {
      select: () => b,
      update: (obj: Fila) => { op = 'update'; cambios = obj; return b },
      insert: (obj: Fila) => { op = 'insert'; cambios = obj; return b },
      eq: (col: string, v: unknown) => { filtros.push([col, v]); return b },
      // Solo `is(col, null)`, lo único que usan estos módulos. Una celda ausente cuenta como null.
      is: (col: string, v: null) => { filtrosNulos.push([col, v]); return b },
      maybeSingle: () => { modo = 'maybeSingle'; return Promise.resolve(ejecutar()) },
      single: () => { modo = 'single'; return Promise.resolve(ejecutar()) },
      then: <T>(ok: (r: { data: unknown; error: { message: string } | null }) => T, ko?: (e: unknown) => T) =>
        Promise.resolve(ejecutar()).then(ok, ko),
    }
    return b
  }

  // El fake implementa solo la parte de la interfaz que estos módulos usan; el
  // `unknown` intermedio es la forma explícita de decirlo, no un error callado.
  const cliente = { from } as unknown as SupabaseClient
  return {
    cliente,
    tablas,
    fallar: (tabla, op, mensaje) => { fallas.push({ tabla, op, mensaje }) },
  }
}
