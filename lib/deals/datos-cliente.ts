import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { camposFaltantes, textoFaltantes, type CampoFaltante } from './proceso-manual'

/**
 * La barrera de "datos del cliente para avanzar" (2026-09-18), del lado del
 * servidor. Las reglas son puras y viven en `proceso-manual.ts`; esto solo lee
 * el proceso con su contacto y arma la respuesta que la pantalla sabe leer.
 *
 * Por qué en el servidor y no en el botón: un control que vive solo en la
 * pantalla se esquiva con un pedido directo. Las tres rutas que mueven etapas
 * (`/advance`, `/visit-data` al finalizar y `POST /api/properties` al captar)
 * pasan por acá.
 */
export async function leerDatosDelProceso(dealId: string): Promise<{ stage: string; faltan: CampoFaltante[] } | null> {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data, error } = await db
    .from('deals')
    .select('stage, assigned_to, property_address, contacts(full_name, phone, email)')
    .eq('id', dealId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const c = (Array.isArray(data.contacts) ? data.contacts[0] : data.contacts) as
    { full_name?: string | null; phone?: string | null; email?: string | null } | null
  return {
    stage: data.stage as string,
    faltan: camposFaltantes({
      contactoNombre: c?.full_name,
      contactoTelefono: c?.phone,
      contactoEmail: c?.email,
      propertyAddress: data.property_address as string | null,
      assignedTo: data.assigned_to as string | null,
    }),
  }
}

/** Código que la pantalla reconoce para abrir la ventana de completar datos. */
export const CODIGO_DATOS_DEL_CLIENTE = 'DATOS_DEL_CLIENTE'

export function respuestaDatosIncompletos(dealId: string, faltan: CampoFaltante[]) {
  return NextResponse.json(
    { error: textoFaltantes(faltan), code: CODIGO_DATOS_DEL_CLIENTE, faltan, dealId },
    { status: 422 },
  )
}
