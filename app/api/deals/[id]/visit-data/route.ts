import { NextRequest, NextResponse } from 'next/server'
import { saveVisitData, getVisitData, markVisitCompleted } from '@/lib/supabase/visit-data'
import { sanearSnapshotVisita } from '@/lib/supabase/visit-data-sanear'
import { requireAuth } from '@/lib/auth/require-role'
import { canAccessDeal } from '@/lib/auth/entity-access'
import { leerDatosDelProceso, respuestaDatosIncompletos } from '@/lib/deals/datos-cliente'
import { ETAPAS_CON_VISITA_PENDIENTE } from '@/lib/pipeline/visita-datos'

/**
 * Datos de la visita de un deal. Las funciones de `lib/supabase/visit-data`
 * usan el cliente de servicio (sin RLS), así que ESTA ruta es la única barrera:
 * misma regla que el resto de las rutas de deals (`canAccessDeal`), y el
 * abogado no entra al pipeline. Hallazgo de la revisión adversarial 2026-09-14:
 * antes alcanzaba con tener sesión para leer o pisar la visita de cualquiera.
 */
async function autorizar(id: string): Promise<NextResponse | null> {
  const user = await requireAuth()
  if (user.profile.role === 'abogado') return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  if (!(await canAccessDeal(user, id))) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  return null
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bloqueo = await autorizar(id)
  if (bloqueo) return bloqueo
  const data = await getVisitData(id)
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const bloqueo = await autorizar(id)
  if (bloqueo) return bloqueo
  const body = await req.json()
  const { snapshot, complete } = body
  // Las secciones nuevas (portales, landing) terminan en prefills y prompts:
  // se acotan antes de mezclarlas en el JSONB. sale/purchase pasan como siempre.
  const saved = await saveVisitData(id, sanearSnapshotVisita(snapshot))
  // Si el proceso ya había pasado la visita, los datos se guardan igual pero la
  // etapa NO se toca (ver `markVisitCompleted`). No es un error para quien
  // estaba cargando: lo que quería guardar quedó guardado.
  // Finalizar exige los datos del cliente (2026-09-18) — pero solo cuando de
  // verdad se va a mover la etapa. Lo cargado en la visita ya quedó guardado
  // arriba: completar los datos y reintentar no pierde nada.
  if (complete) {
    const datos = await leerDatosDelProceso(id)
    const pendiente = !!datos && (ETAPAS_CON_VISITA_PENDIENTE as readonly string[]).includes(datos.stage)
    if (datos && pendiente && datos.faltan.length > 0) return respuestaDatosIncompletos(id, datos.faltan)
  }
  const etapaMovida = complete ? await markVisitCompleted(id) : false
  return NextResponse.json({ data: saved, ...(complete && !etapaMovida ? { etapaSinCambios: true } : {}) })
}
