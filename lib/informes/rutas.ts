import 'server-only'
/**
 * Lo común a las rutas `/api/informes/[id]/*`: leer el informe, revisar permisos sobre SU
 * propiedad y traducir los errores. Un id mal formado o un informe de una propiedad ajena dan el
 * mismo 404 (no se revela que existe).
 */
import { NextResponse } from 'next/server'
import { autorizarInformesDe, esUuid } from './acceso'
import { leerInforme } from './datos'
import { ErrorInforme } from './servicio'
import type { Informe } from './tipos'

export type Cargado = { ok: true; informe: Informe; userId: string } | { ok: false; res: NextResponse }

export async function cargarInforme(id: string): Promise<Cargado> {
  if (!esUuid(id)) return { ok: false, res: NextResponse.json({ error: 'No encontramos el informe' }, { status: 404 }) }
  const informe = await leerInforme(id)
  if (!informe) return { ok: false, res: NextResponse.json({ error: 'No encontramos el informe' }, { status: 404 }) }
  const a = await autorizarInformesDe(informe.propertyId)
  if (!a.ok) {
    const status = a.status === 403 ? 404 : a.status
    return { ok: false, res: NextResponse.json({ error: status === 404 ? 'No encontramos el informe' : a.error }, { status }) }
  }
  return { ok: true, informe, userId: a.userId }
}

export function respuestaDeError(e: unknown, contexto: string): NextResponse {
  if (e instanceof ErrorInforme) return NextResponse.json({ error: e.message }, { status: e.status })
  console.error(`[informes] ${contexto}`, e)
  return NextResponse.json({ error: 'Algo falló. Probá de nuevo.' }, { status: 500 })
}
