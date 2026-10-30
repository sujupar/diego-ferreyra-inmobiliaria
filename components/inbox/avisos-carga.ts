/**
 * Cuántos avisos sin propiedad hay, para el cartel de Inicio. Es el MISMO
 * número que muestra la hoja "Avisos sin propiedad" de Consultas
 * (`GET /api/consultas/avisos`): desde el 2026-10-30 los avisos se conectan
 * solo desde ahí (la pantalla "Avisos por identificar" se sacó).
 *
 * Regla de fondo, que viene de un defecto viejo de esa pantalla: "no pude leer"
 * NUNCA es "no hay nada". `r.ok ? r.json() : { data: [] }` convertía cualquier
 * fallo (401, 403, 500) en una cola vacía y el cartel desaparecía justo cuando
 * el sistema no podía saber si había trabajo. Todo devuelve un resultado
 * explícito (`ok` / `fallo`).
 */

export interface Fallo {
  /** Frase en castellano, lista para mostrar. Dice QUÉ pasó, no un código pelado. */
  motivo: string
  /** true = tiene sentido ofrecer "Reintentar" (un 403 no se arregla reintentando). */
  reintentable: boolean
  /** true = hay que volver a entrar. */
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

const RESPUESTA_RARA: Fallo = {
  motivo: 'El servidor respondió algo inesperado. Probá de nuevo.',
  reintentable: true,
  sesionVencida: false,
}

type FetchLike = (input: string) => Promise<Response>

/** Un fallo NUNCA se convierte en "no hay avisos pendientes". */
export async function contarAvisosSinPropiedad(fetchImpl: FetchLike): Promise<Resultado<number>> {
  let res: Response
  try {
    res = await fetchImpl('/api/consultas/avisos')
  } catch {
    return { ok: false, fallo: FALLO_DE_RED }
  }
  if (!res.ok) return { ok: false, fallo: falloDeRespuesta(res.status, 'los avisos pendientes') }
  let cuerpo: unknown = null
  try { cuerpo = await res.json() } catch { /* página HTML de error del gateway */ }
  if (!cuerpo || typeof cuerpo !== 'object' || !('avisos' in cuerpo) || !Array.isArray(cuerpo.avisos)) {
    return { ok: false, fallo: RESPUESTA_RARA }
  }
  return { ok: true, valor: cuerpo.avisos.length }
}
