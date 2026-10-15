/**
 * Helper tolerante de respuestas de la API para la ventana "Agendar visita".
 *
 * Por qué existe: un 504 del gateway de Netlify devuelve una página HTML de
 * error, no JSON (ver CLAUDE.md § "REGLA DURA: nunca encadenar varias
 * llamadas de IA dentro de UN request"). Sin esto, `res.json()` explota con
 * `Unexpected token '<'` y ese es el mensaje que ve el asesor — no dice nada
 * del problema real.
 */
export async function leerRespuesta<T>(
  res: Response,
): Promise<{ ok: true; data: T } | { ok: false; status: number; error: string; cuerpo: Record<string, unknown> }> {
  let cuerpo: Record<string, unknown> = {}
  try {
    cuerpo = (await res.json()) as Record<string, unknown>
  } catch {
    /* HTML de error del gateway (504) u otra respuesta no-JSON */
  }
  if (res.ok) {
    // Un 2xx sin `data` no es un éxito utilizable: todas las rutas que
    // consume esta ventana devuelven `{ data }` en el camino feliz. Tratarlo
    // como éxito con `data: undefined` dejaría a cada consumidor adivinando.
    if (!('data' in cuerpo)) {
      return { ok: false, status: res.status, error: 'Respuesta inesperada del servidor. Probá de nuevo.', cuerpo }
    }
    return { ok: true, data: cuerpo.data as T }
  }
  const error = typeof cuerpo.error === 'string'
    ? cuerpo.error
    : res.status === 504 ? 'El servidor tardó demasiado. Probá de nuevo.' : 'Algo falló. Probá de nuevo.'
  return { ok: false, status: res.status, error, cuerpo }
}
