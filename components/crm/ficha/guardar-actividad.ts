'use client'

import { leerJson, type RespuestaLeida } from '@/lib/crm/leer-json'
import type { ActividadDeFicha } from '@/lib/crm/tipos'
import type { BloqueCadencia } from '@/lib/supabase/cadencia'

// Lo que responde `POST /api/contacts/[id]/activities` (D4) y el reintento de la cadencia.
export interface RespuestaGuardado {
  actividad: ActividadDeFicha
  cadencia: BloqueCadencia | null // null en una nota
  pendiente: boolean
}

export type CuerpoActividad =
  | { kind: 'note'; body: string; client_token: string }
  | {
      kind: 'call'
      call_outcome: string
      body?: string
      hace_minutos?: number
      volver_el?: { fecha: string; hora: string }
      client_token: string
    }
  | { kind: 'whatsapp_sent'; body?: string; hace_minutos?: number; client_token: string }

export async function guardarActividad(contactoId: string, cuerpo: CuerpoActividad): Promise<RespuestaLeida<RespuestaGuardado>> {
  try {
    const res = await fetch(`/api/contacts/${encodeURIComponent(contactoId)}/activities`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    return await leerJson<RespuestaGuardado>(res)
  } catch (err) {
    // Red cortada: el formulario conserva lo escrito y el MISMO client_token, así el
    // reintento no duplica (D5).
    console.error('[ficha] no se pudo guardar la actividad', err)
    return { ok: false, status: 0, error: 'No se pudo guardar. Revisá la conexión y probá de nuevo.' }
  }
}

/** Identificador del guardado: nace al abrir o limpiar el formulario, no en el toque (D5). */
export function nuevoToken(): string {
  return crypto.randomUUID()
}

/** El último envío que falló: con qué token y con qué datos. */
export interface EnvioFallido {
  token: string
  firma: string
}

/** Los datos de un envío, sin el token: lo que tiene que coincidir para que sea "el mismo". */
export function firmaDelEnvio(cuerpo: CuerpoActividad): string {
  // JSON.stringify omite las claves con `undefined`: el token no entra en la firma.
  return JSON.stringify({ ...cuerpo, client_token: undefined })
}

/**
 * Token con que se manda `cuerpo` (revisión 12.1). Un reintento tras un error con los MISMOS
 * datos reusa el token (si el primer pedido sí llegó, no se duplica); si después del error se
 * cambió cualquier dato, es otro guardado y va con un token nuevo. Con el mismo token, el
 * servidor respondería 409 "ya se había guardado con otros datos".
 */
export function tokenParaEnviar(actual: string, cuerpo: CuerpoActividad, fallido: EnvioFallido | null): string {
  if (fallido && fallido.token === actual && fallido.firma !== firmaDelEnvio(cuerpo)) return nuevoToken()
  return actual
}
