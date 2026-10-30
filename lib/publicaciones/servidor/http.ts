/**
 * Piezas comunes de las rutas de Publicaciones: errores con status y lectura del body.
 * Un `ErrorHttp` lleva un mensaje YA legible para mostrarle a la persona.
 */
import { NextResponse } from 'next/server'
import type { z } from 'zod'

export class ErrorHttp extends Error {
  constructor(
    public status: number,
    mensaje: string,
  ) {
    super(mensaje)
  }
}

export async function leerBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T>> {
  const body = await req.json().catch(() => null)
  const r = schema.safeParse(body)
  if (!r.success) {
    const primero = r.error.issues[0]
    throw new ErrorHttp(400, `Datos inválidos${primero?.path.length ? ` (${primero.path.join('.')})` : ''}`)
  }
  return r.data
}

export function respuestaDeError(e: unknown, contexto: string): NextResponse {
  if (e instanceof ErrorHttp) return NextResponse.json({ error: e.message }, { status: e.status })
  console.error(`[publicaciones] ${contexto}`, e)
  return NextResponse.json({ error: 'Algo falló del lado del servidor. Probá de nuevo.' }, { status: 500 })
}
