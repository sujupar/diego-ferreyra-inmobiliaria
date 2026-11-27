// Base simulada para las pruebas de la lectura de la cartera (lib/supabase/cartera.ts) y de
// sus rutas (app/api/crm/**). NO es una prueba ni se usa en la app: las pruebas la entregan
// en lugar de `createClient` de supabase-js.
//
// Imita lo que importa para la seguridad y la paginación: aplica DE VERDAD los filtros que
// pide la consulta (eq, neq, in, is, not, or, gt/lt, gte, lte, like, limit), devuelve solo las columnas pedidas, ordena y
// corta en 1000 filas por respuesta como la API real. Así una prueba que busca en la
// respuesta datos de otro asesor se pone en rojo si el servicio deja de filtrar en la base
// Y en el armado; una base falsa que devolviera todo escondería un filtro olvidado.

type Fila = Record<string, unknown>

export interface ConsultaRegistrada {
  tabla: string
  select: string
  filtros: string[]
  rangos: [number, number][]
  orden: string[]
  conSenal: boolean
  args: Record<string, unknown> | null
}

export interface OpcionesBaseSimulada {
  /** Tablas (o `rpc:<función>`) que responden con error. */
  fallar?: string[]
  /** Tablas (o `rpc:<función>`) que no responden nunca (ni con la señal de corte). */
  colgar?: string[]
  /** Falla una consulta puntual (p. ej. la segunda lectura de una misma tabla). */
  fallarConsulta?: (c: ConsultaRegistrada) => boolean
  /** Filas por respuesta (la API real: 1000). */
  tope?: number
}

type Filtro = (f: Fila) => boolean

function valor(f: Fila, col: string): unknown {
  return f[col]
}

/** `a.eq.x`, `a.is.null`, `a.not.is.null` separados por coma (lo que usa el servicio). */
function filtroOr(expr: string): Filtro {
  // Las comas dentro de `in.(a,b)` no separan condiciones: se protegen antes de partir.
  const partes = expr.replace(/\(([^)]*)\)/g, (_m, x: string) => `(${x.replace(/,/g, '|')})`).split(',').map((p) => p.trim())
  const unos: Filtro[] = partes.map((p) => {
    const [col, ...resto] = p.split('.')
    const op = resto.join('.')
    if (op === 'is.null') return (f) => valor(f, col) == null
    if (op === 'not.is.null') return (f) => valor(f, col) != null
    if (op.startsWith('eq.')) return (f) => String(valor(f, col)) === op.slice(3)
    if (op.startsWith('in.(') && op.endsWith(')')) {
      const vs = op.slice(4, -1).split('|')
      return (f) => vs.includes(String(valor(f, col)))
    }
    throw new Error(`base simulada: no sé leer "${p}" dentro de or()`)
  })
  return (f) => unos.some((u) => u(f))
}

/** `id, a, b, alias:fk(c, d)` → columnas planas y embebidas. */
function leerSelect(select: string): { planas: string[]; embebidas: { alias: string; fk: string; cols: string[] }[] } {
  const embebidas: { alias: string; fk: string; cols: string[] }[] = []
  const sinEmbebidas = select.replace(/(\w+):(\w+)\(([^)]*)\)/g, (_m, alias: string, fk: string, cols: string) => {
    embebidas.push({ alias, fk, cols: cols.split(',').map((c) => c.trim()).filter(Boolean) })
    return ''
  })
  const planas = sinEmbebidas.split(',').map((c) => c.trim()).filter(Boolean)
  return { planas, embebidas }
}

const TABLA_DE_FK: Record<string, string> = { contact_id: 'contacts' }

function comparar(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0
}

export function baseSimulada(tablas: Record<string, Fila[]>, opciones: OpcionesBaseSimulada & { rpcs?: Record<string, (args: Record<string, unknown>) => Fila[]> } = {}) {
  const consultas: ConsultaRegistrada[] = []
  const tope = opciones.tope ?? 1000

  function builder(tabla: string, fuente: () => Fila[], select: string) {
    const registro: ConsultaRegistrada = { tabla, select, filtros: [], rangos: [], orden: [], conSenal: false, args: null }
    consultas.push(registro)
    const filtros: Filtro[] = []
    const ordenes: { col: string; asc: boolean }[] = []
    let rango: [number, number] | null = null
    let senal: AbortSignal | null = null

    const ejecutar = (): Promise<{ data: Fila[] | null; error: { message: string } | null }> => {
      if (rango) registro.rangos.push(rango)
      if (opciones.colgar?.includes(tabla)) return new Promise(() => {})
      if (senal?.aborted) return Promise.resolve({ data: null, error: { message: 'AbortError' } })
      if (opciones.fallar?.includes(tabla) || opciones.fallarConsulta?.(registro)) return Promise.resolve({ data: null, error: { message: `falla simulada en ${tabla}` } })
      let filas = fuente().filter((f) => filtros.every((fn) => fn(f)))
      filas = [...filas].sort((a, b) => {
        for (const o of ordenes) {
          const c = comparar(valor(a, o.col), valor(b, o.col))
          if (c !== 0) return o.asc ? c : -c
        }
        return 0
      })
      const [desde, hasta] = rango ?? [0, filas.length - 1]
      filas = filas.slice(desde, Math.min(hasta + 1, desde + tope))
      const { planas, embebidas } = leerSelect(select)
      const proyectadas = filas.map((f) => {
        const salida: Fila = {}
        for (const c of planas) if (c !== '*') salida[c] = f[c] ?? null
        if (planas.includes('*')) Object.assign(salida, f)
        for (const e of embebidas) {
          const id = f[e.fk]
          const otra = (tablas[TABLA_DE_FK[e.fk] ?? ''] ?? []).find((x) => x.id === id)
          if (!otra) salida[e.alias] = null
          else {
            const sub: Fila = {}
            for (const c of e.cols) sub[c] = otra[c] ?? null
            salida[e.alias] = sub
          }
        }
        return salida
      })
      return Promise.resolve({ data: proyectadas, error: null })
    }

    const q = {
      select(cols: string) {
        registro.select = cols
        select = cols
        return q
      },
      eq(col: string, v: unknown) {
        registro.filtros.push(`eq:${col}=${String(v)}`)
        filtros.push((f) => valor(f, col) === v)
        return q
      },
      in(col: string, vs: unknown[]) {
        registro.filtros.push(`in:${col}=${vs.map(String).join('|')}`)
        filtros.push((f) => vs.includes(valor(f, col)))
        return q
      },
      is(col: string, v: null) {
        registro.filtros.push(`is:${col}=null`)
        filtros.push((f) => (v === null ? valor(f, col) == null : valor(f, col) === v))
        return q
      },
      not(col: string, op: string, v: unknown) {
        registro.filtros.push(`not:${col}.${op}=${String(v)}`)
        if (op !== 'is' || v !== null) throw new Error(`base simulada: not(${col}, ${op}) no implementado`)
        filtros.push((f) => valor(f, col) != null)
        return q
      },
      or(expr: string) {
        registro.filtros.push(`or:${expr}`)
        filtros.push(filtroOr(expr))
        return q
      },
      lt(col: string, v: string) {
        registro.filtros.push(`lt:${col}=${v}`)
        filtros.push((f) => Date.parse(String(valor(f, col))) < Date.parse(v))
        return q
      },
      lte(col: string, v: string) {
        registro.filtros.push(`lte:${col}=${v}`)
        filtros.push((f) => Date.parse(String(valor(f, col))) <= Date.parse(v))
        return q
      },
      neq(col: string, v: unknown) {
        registro.filtros.push(`neq:${col}=${String(v)}`)
        filtros.push((f) => valor(f, col) !== v)
        return q
      },
      /** LIKE de Postgres: `%` es cualquier tramo y `_` un carácter. */
      like(col: string, patron: string) {
        registro.filtros.push(`like:${col}=${patron}`)
        const re = new RegExp(`^${patron.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, 's')
        filtros.push((f) => re.test(String(valor(f, col) ?? '')))
        return q
      },
      limit(n: number) {
        rango = [0, n - 1]
        return q
      },
      gte(col: string, v: string) {
        registro.filtros.push(`gte:${col}=${v}`)
        filtros.push((f) => Date.parse(String(valor(f, col))) >= Date.parse(v))
        return q
      },
      order(col: string, o?: { ascending?: boolean }) {
        ordenes.push({ col, asc: o?.ascending !== false })
        registro.orden.push(`${col}${o?.ascending === false ? ' desc' : ''}`)
        return q
      },
      range(desde: number, hasta: number) {
        rango = [desde, hasta]
        return q
      },
      abortSignal(s: AbortSignal) {
        registro.conSenal = true
        senal = s
        return q
      },
      then<A, B>(ok?: (v: { data: Fila[] | null; error: { message: string } | null }) => A, mal?: (e: unknown) => B) {
        return ejecutar().then(ok, mal)
      },
    }
    return q
  }

  const cliente = {
    from(tabla: string) {
      return builder(tabla, () => tablas[tabla] ?? [], '*')
    },
    rpc(fn: string, args: Record<string, unknown>) {
      const nombre = `rpc:${fn}`
      const b = builder(nombre, () => opciones.rpcs?.[fn]?.(args) ?? [], '*')
      const ultima = consultas[consultas.length - 1]
      ultima.args = args
      return b
    },
  }
  return { cliente, consultas }
}
