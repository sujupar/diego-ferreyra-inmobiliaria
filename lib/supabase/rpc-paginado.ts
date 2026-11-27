/**
 * Llama a una función de la base (RPC) que puede devolver MUCHAS filas y las trae todas.
 *
 * POR QUÉ EXISTE: la API de Supabase (PostgREST) corta toda respuesta en 1000 filas y no
 * avisa: devuelve 1000, status 200/206, y listo. Las RPC de Embudos devuelven una fila por
 * (video, segmento, etapa, tramo): `funnel_video_heatmap` son 100 filas por combinación.
 * Medido el 2026-09-19: con un rango de 90 días eran 1300 filas, llegaban 1000, y las que
 * se caían eran TODAS las del video de la landing B — Embudos mostraba sus vistas con la
 * curva de retención plana en 0 %, sin ningún error. A 30 días quedaba margen para 3
 * combinaciones más. El llamador filtraba en JavaScript, así que tampoco lo notaba.
 *
 * EL ORDEN ES OBLIGATORIO. Paginar un resultado sin orden fijo repite o saltea filas entre
 * página y página (Postgres no garantiza el orden de un GROUP BY). Las columnas de `orden`
 * tienen que identificar cada fila de forma única.
 */

/** Lo mínimo de supabase-js que se usa acá (así la prueba le pasa un cliente falso). */
interface ConsultaRpc {
  order(columna: string): ConsultaRpc
  // Opcional en el tipo para que los clientes falsos de siempre sigan sirviendo; el de
  // supabase-js lo tiene. Solo se llama si quien pide manda `senal`.
  abortSignal?(senal: AbortSignal): ConsultaRpc
  range(desde: number, hasta: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
}
export interface ClienteRpc {
  rpc(fn: string, args: Record<string, unknown>): ConsultaRpc
}

export interface ResultadoRpc<T> {
  filas: T[]
  /** true si se llegó al techo de páginas: faltan filas y quien muestra el dato tiene que saberlo. */
  truncado: boolean
  error?: string
}

const PAGINA = 1000

export async function rpcPaginado<T>(
  client: ClienteRpc,
  fn: string,
  args: Record<string, unknown>,
  orden: readonly string[],
  // `senal`: un plazo COMPARTIDO por quien llama (la cartera del CRM tiene uno solo de 15 s
  // para todas sus lecturas). Un techo por página sumaría: tres páginas más otras lecturas
  // pasaban el límite de Netlify.
  opciones: { maxPaginas?: number; senal?: AbortSignal } = {},
): Promise<ResultadoRpc<T>> {
  if (orden.length === 0) throw new Error(`rpcPaginado(${fn}): falta el orden; paginar sin orden fijo repite o saltea filas`)
  const maxPaginas = opciones.maxPaginas ?? 20 // 20.000 filas: muy por encima de cualquier rango real
  const filas: T[] = []

  for (let pagina = 0; pagina < maxPaginas; pagina++) {
    let consulta = client.rpc(fn, args)
    for (const columna of orden) consulta = consulta.order(columna)
    if (opciones.senal) {
      if (!consulta.abortSignal) throw new Error(`rpcPaginado(${fn}): el cliente no acepta una señal de corte`)
      consulta = consulta.abortSignal(opciones.senal)
    }
    const desde = pagina * PAGINA
    const { data, error } = await consulta.range(desde, desde + PAGINA - 1)
    if (error) return { filas, truncado: false, error: error.message }
    const lote = (data ?? []) as T[]
    filas.push(...lote)
    if (lote.length < PAGINA) return { filas, truncado: false }
  }
  return { filas, truncado: true }
}
