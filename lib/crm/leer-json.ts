// Lee la respuesta de una ruta tolerando un cuerpo que no es JSON (design.md D5).
// Cuando una función de Netlify se pasa de tiempo, el gateway devuelve una PÁGINA HTML
// de error 504 y `res.json()` explota con `Unexpected token '<'`, que no le dice nada a
// nadie (CLAUDE.md, "nunca encadenar varias llamadas de IA"). Acá eso se vuelve un
// mensaje en castellano.

export const MENSAJE_SERVIDOR_TARDO = 'El servidor tardó demasiado. Probá de nuevo.'
export const MENSAJE_GENERICO = 'No se pudo completar. Probá de nuevo.'

export type RespuestaLeida<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; data?: Record<string, unknown> }

function esObjeto(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x)
}

export async function leerJson<T>(res: Response): Promise<RespuestaLeida<T>> {
  let texto: string
  try {
    texto = await res.text()
  } catch (err) {
    console.error('[leerJson] no se pudo leer el cuerpo de la respuesta', err)
    return { ok: false, status: res.status, error: MENSAJE_GENERICO }
  }
  let cuerpo: unknown
  try {
    cuerpo = texto.trim() === '' ? undefined : JSON.parse(texto)
  } catch {
    // No es JSON: casi siempre la página HTML del gateway (504). Se informa con un
    // mensaje legible; el cuerpo crudo no le sirve a quien está en la pantalla.
    const pareceHtml = /^\s*</.test(texto)
    console.error('[leerJson] la respuesta no es JSON', { status: res.status, inicio: texto.slice(0, 80) })
    return { ok: false, status: res.status, error: pareceHtml || res.status >= 500 ? MENSAJE_SERVIDOR_TARDO : MENSAJE_GENERICO }
  }
  if (cuerpo === undefined) return { ok: false, status: res.status, error: MENSAJE_GENERICO }
  if (res.ok) return { ok: true, status: res.status, data: cuerpo as T }
  const mensaje = esObjeto(cuerpo) && typeof cuerpo.error === 'string' && cuerpo.error.trim() ? cuerpo.error : MENSAJE_GENERICO
  if (esObjeto(cuerpo) && Object.keys(cuerpo).some((k) => k !== 'error')) {
    return { ok: false, status: res.status, error: mensaje, data: cuerpo }
  }
  return { ok: false, status: res.status, error: mensaje }
}
