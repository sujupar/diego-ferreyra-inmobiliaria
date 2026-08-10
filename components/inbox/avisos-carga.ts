/**
 * Carga de datos de la pantalla "Avisos por identificar" — la parte que se
 * puede probar sin navegador.
 *
 * Existe por dos defectos gemelos de la pantalla, que son el mismo error de
 * fondo: tratar "no pude leer" como "no hay nada".
 *
 *  1. `const a = aRes.ok ? await aRes.json() : { data: [] }` convertía CUALQUIER
 *     fallo (403 de un asesor que tipeó la URL, 401 de sesión vencida, 500 de
 *     Supabase) en una lista vacía, y la pantalla lo mostraba como la tarjeta
 *     verde "Todas las consultas están identificadas". Para una coordinadora
 *     legítima con avisos pendientes de verdad, eso es una mentira permanente
 *     sobre el único tablero que le avisa que hay trabajo.
 *  2. Pedía `/api/properties?limit=200`, pero la ruta acota en 100
 *     (`MAX_PAGE_SIZE`) y devuelve `hasMore`, que la pantalla descartaba. Con
 *     más de 100 propiedades, el selector "Elegila de la lista" simplemente no
 *     tiene la que buscás — y como el orden es por fecha de alta descendente,
 *     las que se caen son las MÁS VIEJAS.
 *
 * Todo devuelve un resultado explícito (`ok` / `fallo`): quien renderiza tiene
 * que poder distinguir cargando, error y vacío de verdad.
 */

export interface AvisoPendienteDato {
  portal: string
  externalCode: string
  title: string | null
  inquiryCount: number
  lastInquiryAt: string
  lastLeadName: string | null
}

export interface PropiedadOpcion {
  id: string
  address: string
  assigned_to: string | null
  status?: string | null
}

export interface Fallo {
  /** Frase en castellano, lista para mostrar. Dice QUÉ pasó, no un código pelado. */
  motivo: string
  /** true = tiene sentido ofrecer "Reintentar" (un 403 no se arregla reintentando). */
  reintentable: boolean
  /** true = hay que volver a entrar; la pantalla ofrece el link a /login. */
  sesionVencida: boolean
}

export type Resultado<T> = { ok: true; valor: T } | { ok: false; fallo: Fallo }

/** El estado del pedido HTTP traducido a algo que una persona pueda leer y accionar. */
export function falloDeRespuesta(status: number, recurso: string): Fallo {
  if (status === 401) {
    return {
      motivo: 'Tu sesión venció. Volvé a entrar para ver los avisos.',
      reintentable: false,
      sesionVencida: true,
    }
  }
  if (status === 403) {
    return {
      motivo: `No tenés permiso para ver ${recurso}. Esta pantalla es de coordinación.`,
      reintentable: false,
      sesionVencida: false,
    }
  }
  return {
    motivo: `No pudimos leer ${recurso} (error ${status}). Puede ser algo pasajero.`,
    reintentable: true,
    sesionVencida: false,
  }
}

/** Un fetch que ni siquiera llegó (red caída, pestaña sin conexión). */
export const FALLO_DE_RED: Fallo = {
  motivo: 'No pudimos conectarnos con el servidor. Revisá la conexión y probá de nuevo.',
  reintentable: true,
  sesionVencida: false,
}

type FetchLike = (input: string) => Promise<Response>

async function leerJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** La cola de avisos. Un fallo NUNCA se convierte en "no hay avisos pendientes". */
export async function cargarAvisos(fetchImpl: FetchLike): Promise<Resultado<AvisoPendienteDato[]>> {
  let res: Response
  try {
    res = await fetchImpl('/api/portal-inquiries/unidentified')
  } catch {
    return { ok: false, fallo: FALLO_DE_RED }
  }
  if (!res.ok) return { ok: false, fallo: falloDeRespuesta(res.status, 'los avisos pendientes') }
  const body = await leerJson<{ data?: AvisoPendienteDato[] }>(res)
  if (!body) {
    return {
      ok: false,
      fallo: { motivo: 'El servidor respondió algo inesperado. Probá de nuevo.', reintentable: true, sesionVencida: false },
    }
  }
  return { ok: true, valor: body.data ?? [] }
}

/** Tope del servidor (`MAX_PAGE_SIZE` en `app/api/properties/route.ts`). Pedir más no sirve: acota en silencio. */
export const PAGINA_PROPIEDADES = 100
/** Freno de mano: 10 páginas = 1000 propiedades. Nunca un bucle infinito si `hasMore` se queda pegado. */
export const MAX_PAGINAS_PROPIEDADES = 10

export interface PropiedadesCargadas {
  propiedades: PropiedadOpcion[]
  /** true si se llegó al freno y quedaron propiedades sin traer — hay que decirlo. */
  incompleta: boolean
}

/**
 * Todas las propiedades elegibles del selector, paginando de a 100 hasta que el
 * servidor diga que no hay más.
 *
 * Descarta las `descartada` (archivadas / fusionadas por duplicado): el otro
 * camino del mismo diálogo, `resolve-link`, ya las excluye
 * (`.neq('status','descartada')`), así que ofrecerlas acá era una
 * inconsistencia dentro de la misma pantalla.
 */
export async function cargarPropiedades(fetchImpl: FetchLike): Promise<Resultado<PropiedadesCargadas>> {
  const propiedades: PropiedadOpcion[] = []
  let offset = 0

  for (let pagina = 0; pagina < MAX_PAGINAS_PROPIEDADES; pagina++) {
    let res: Response
    try {
      res = await fetchImpl(`/api/properties?limit=${PAGINA_PROPIEDADES}&offset=${offset}`)
    } catch {
      return { ok: false, fallo: FALLO_DE_RED }
    }
    if (!res.ok) return { ok: false, fallo: falloDeRespuesta(res.status, 'la lista de propiedades') }
    const body = await leerJson<{ data?: PropiedadOpcion[]; hasMore?: boolean }>(res)
    if (!body) {
      return {
        ok: false,
        fallo: { motivo: 'El servidor respondió algo inesperado al pedir las propiedades.', reintentable: true, sesionVencida: false },
      }
    }
    const lote = body.data ?? []
    for (const p of lote) {
      if (p.status === 'descartada') continue
      propiedades.push(p)
    }
    if (!body.hasMore || lote.length === 0) return { ok: true, valor: { propiedades, incompleta: false } }
    offset += PAGINA_PROPIEDADES
  }

  return { ok: true, valor: { propiedades, incompleta: true } }
}

/** Los asesores del paso 3. Sin ellos no se puede guardar, así que el fallo también se muestra. */
export async function cargarAsesores(
  fetchImpl: FetchLike,
): Promise<Resultado<Array<{ id: string; full_name: string | null }>>> {
  let res: Response
  try {
    res = await fetchImpl('/api/users/advisors')
  } catch {
    return { ok: false, fallo: FALLO_DE_RED }
  }
  if (!res.ok) return { ok: false, fallo: falloDeRespuesta(res.status, 'la lista de asesores') }
  const body = await leerJson<{ data?: Array<{ id: string; full_name: string | null }> }>(res)
  if (!body) {
    return {
      ok: false,
      fallo: { motivo: 'El servidor respondió algo inesperado al pedir los asesores.', reintentable: true, sesionVencida: false },
    }
  }
  return { ok: true, valor: body.data ?? [] }
}
