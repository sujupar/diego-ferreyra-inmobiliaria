/**
 * Lo común a las fuentes automáticas del informe. Cada fuente recibe el período y devuelve su
 * `FuenteGuardada`: `ok`, `sin_datos` o `error`. NUNCA lanza — una fuente caída no puede tirar el
 * informe entero, y su error queda escrito para que la pantalla ofrezca "Reintentar".
 */
import { construirInstante, sumarDias } from '@/lib/visitas/horario'
import type { EstadoFuente, FuenteGuardada } from '../tipos'

export interface ContextoFuente {
  propertyId: string
  desde: string
  hasta: string
  ahora: Date
  /** El aviso de ML que cargó Paula (código o link), si la plataforma no conoce el de la propiedad. */
  avisoMercadoLibre?: string | null
}

/** El período como instantes: desde las 00:00 de Argentina del primer día hasta las 00:00 del día siguiente al último. */
export function instantesDelPeriodo(c: { desde: string; hasta: string }): { desdeISO: string; hastaISO: string } {
  const d = construirInstante(c.desde, '00:00')
  const h = construirInstante(sumarDias(c.hasta, 1), '00:00')
  if (!d || !h) throw new Error(`período inválido: ${c.desde} a ${c.hasta}`)
  return { desdeISO: d.toISOString(), hastaISO: h.toISOString() }
}

function guardada<T>(estado: EstadoFuente, ahora: Date, datos: T | null, error: string | null): FuenteGuardada<T> {
  return { estado, actualizadoEn: ahora.toISOString(), datos, error }
}

export const ok = <T>(ahora: Date, datos: T) => guardada<T>('ok', ahora, datos, null)
export const sinDatos = <T>(ahora: Date) => guardada<T>('sin_datos', ahora, null, null)
export const conError = <T>(ahora: Date, e: unknown) =>
  guardada<T>('error', ahora, null, (e instanceof Error ? e.message : String(e)).slice(0, 300))

/**
 * Techo de una fuente entera. Netlify corta la función a los ~26 s con una página HTML: si una API
 * se cuelga, la fuente nunca llegaría a guardarse y quedaría "pendiente" para siempre, sin motivo.
 * Con el techo se guarda como `error` y la pantalla ofrece "Reintentar".
 */
export const TOPE_FUENTE_MS = 15_000

/** Envuelve una fuente: cualquier excepción —o pasarse del techo— se vuelve `error` con su mensaje. */
export async function sinLanzar<T>(
  ahora: Date,
  f: () => Promise<FuenteGuardada<T>>,
  { topeMs = TOPE_FUENTE_MS }: { topeMs?: number } = {},
): Promise<FuenteGuardada<T>> {
  let reloj: ReturnType<typeof setTimeout> | undefined
  const corte = new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error(`el servicio tardó demasiado (más de ${Math.round(topeMs / 1000)} s); reintentá`)), topeMs)
  })
  try {
    return await Promise.race([f(), corte])
  } catch (e) {
    return conError<T>(ahora, e)
  } finally {
    clearTimeout(reloj)
  }
}

export function numero(v: unknown): number {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) ? n : 0
}

/** Personas de prueba que no cuentan en ninguna métrica (decisión del dueño). */
export function esPrueba(nombre: string | null | undefined, email: string | null | undefined): boolean {
  const n = (nombre ?? '').toLowerCase()
  return n.includes('[test') || n.includes('julian parra') || (email ?? '').toLowerCase() === 'contacto.julianparra@gmail.com'
}
