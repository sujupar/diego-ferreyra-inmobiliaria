/**
 * Quién puede generar y guardar descripciones: los mismos que difunden la
 * propiedad (admin, dueño, coordinador, asesor). El abogado no participa de la
 * difusión. La política vive en `lib/properties/difusion-access.ts`.
 */
import { NextResponse } from 'next/server'
import { puedeDifundir } from '@/lib/properties/difusion-access-server'
import { ErrorDescripcion } from '@/lib/descripcion/servicio'
import type { UserWithProfile } from '@/types/auth.types'

const ROLES = ['admin', 'dueno', 'coordinador', 'asesor']

export async function autorizarDescripcion(user: UserWithProfile, propertyId: string): Promise<boolean> {
  if (!ROLES.includes(user.profile.role)) return false
  return puedeDifundir(propertyId, user.id, user.profile.role, 'difundir')
}

/** Traduce cualquier error a JSON legible: el panel NUNCA recibe HTML. */
export function respuestaDeError(err: unknown, contexto: string): NextResponse {
  if (err instanceof ErrorDescripcion) {
    return NextResponse.json({ error: err.message }, { status: err.status })
  }
  const nombre = (err as { name?: string } | null)?.name
  if (nombre === 'TimeoutError' || nombre === 'AbortError') {
    return NextResponse.json({ error: 'Tardó demasiado. Tocá "Reintentar": se repite solo este paso.' }, { status: 504 })
  }
  console.error(`[descripcion/${contexto}]`, err)
  return NextResponse.json({ error: err instanceof Error ? err.message : 'Error inesperado' }, { status: 500 })
}
