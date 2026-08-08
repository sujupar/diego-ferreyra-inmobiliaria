/**
 * Filtros en la barra de direcciones. Reglas:
 * - clave ausente o vacía = "sin filtrar" (el valor por defecto), igual que el
 *   estado inicial de las pantallas antes de este cambio;
 * - lo que está en su valor por defecto NO se escribe, así la URL sin filtros
 *   queda limpia;
 * - las claves salen ordenadas para que la misma selección dé siempre la misma
 *   URL (si no, el historial se llena de entradas que son la misma vista).
 */
export function leerFiltros<T extends Record<string, string>>(params: URLSearchParams, defaults: T): T {
  const out = { ...defaults }
  for (const clave of Object.keys(defaults) as (keyof T & string)[]) {
    const valor = params.get(clave)
    if (valor) out[clave] = valor as T[keyof T & string]
  }
  return out
}

export function escribirFiltros<T extends Record<string, string>>(filtros: T, defaults: T): string {
  const params = new URLSearchParams()
  for (const clave of (Object.keys(defaults) as (keyof T & string)[]).sort()) {
    const valor = filtros[clave]
    if (valor && valor !== defaults[clave]) params.set(clave, valor)
  }
  return params.toString()
}
