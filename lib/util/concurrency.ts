/**
 * Ejecuta una función async sobre items con un límite de concurrencia.
 *
 * Útil para paralelizar I/O sin saturar el servicio destino (Meta API
 * rate-limit, p.ej.). Mantiene el orden de los resultados igual al de items.
 *
 * Si una función throws, la promesa rechaza con ese error — el caller decide
 * si re-throwear o seguir.
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const limit = Math.max(1, Math.min(concurrency, items.length))
  const results: R[] = new Array(items.length)
  let nextIdx = 0

  async function worker() {
    while (true) {
      const i = nextIdx++
      if (i >= items.length) return
      results[i] = await fn(items[i], i)
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()))
  return results
}
