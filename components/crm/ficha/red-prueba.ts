// Simulador de red para las pruebas de la ficha (no es código de la app).
import { vi } from 'vitest'

type Respuesta = { status?: number; body?: unknown; texto?: string }
type Ruta = (url: string, init?: RequestInit) => Respuesta | Promise<Respuesta>

/**
 * Simula `fetch` por ruta. Cada entrada es un prefijo de URL (+ método opcional,
 * "POST /api/…") y lo que responde. Devuelve el espía para contar pedidos.
 */
export function simularRed(rutas: Record<string, Ruta | Respuesta>) {
  const espia = vi.fn(async (entrada: RequestInfo | URL, init?: RequestInit) => {
    const url = String(entrada)
    const metodo = (init?.method ?? 'GET').toUpperCase()
    const clave =
      Object.keys(rutas)
        .filter((k) => {
          const [m, p] = k.includes(' ') ? k.split(' ') : ['GET', k]
          return m === metodo && url.startsWith(p)
        })
        .sort((a, b) => b.length - a.length)[0] ?? null
    if (!clave) return new Response(JSON.stringify({ error: `sin ruta simulada: ${metodo} ${url}` }), { status: 599 })
    const def = rutas[clave]
    const r = typeof def === 'function' ? await def(url, init) : def
    const cuerpo = r.texto ?? JSON.stringify(r.body ?? {})
    return new Response(cuerpo, { status: r.status ?? 200 })
  })
  vi.stubGlobal('fetch', espia)
  return espia
}

export const pedidosA = (espia: ReturnType<typeof simularRed>, parte: string, metodo = 'GET') =>
  espia.mock.calls.filter(([u, i]) => String(u).includes(parte) && ((i as RequestInit | undefined)?.method ?? 'GET') === metodo)
