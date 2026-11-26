import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/require-role'
import { hasPermission } from '@/lib/auth/roles'
import { puedeCerrarProceso } from '@/lib/crm/deal-activo'
import { MENSAJE_NO_SE_PUEDE_DESHACER, puedeDeshacerPerdido } from '@/lib/crm/deshacer-perdido'
import { esUuid } from '@/lib/crm/id-valido'
import {
  deshacerPerdido,
  leerProcesoParaDeshacer,
  syncMailchimpBestEffort,
  ultimoCambioDeEtapa,
} from '@/lib/supabase/deals'

const NO_ENCONTRADO = { error: 'No encontramos este proceso' }

/**
 * Deshace un "perdido" recién marcado (crm-ficha-y-llamadas, D9). No usa `advance`: ese
 * deja `lost_at` cargado (el embudo seguiría contando la pérdida) y puede pedir datos
 * del cliente (422). No manda emails ni WhatsApp ni crea tareas; el historial suma la
 * fila `lost → <etapa>`, que es lo que pasó.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // `requireAuth` + `hasPermission`, NO `requirePermission`: ese redirige, y el `fetch`
  // de la ficha seguiría la redirección hasta un 200 y daría el "Deshacer" por hecho.
  const user = await requireAuth()
  const role = user.profile.role
  if (!hasPermission(role, 'pipeline.advance')) {
    return NextResponse.json({ error: 'No tenés permiso para cambiar procesos.' }, { status: 403 })
  }
  try {
    const { id } = await params
    // Un id que no es uuid no puede existir: 404, no el 500 del 22P02 de Postgres.
    if (!esUuid(id)) return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    const proceso = await leerProcesoParaDeshacer(id)
    // Lista explícita de roles (`puedeCerrarProceso`): el rol viejo `agent` tiene
    // `pipeline.advance` pero no cierra ni deshace nada. Ajeno = inexistente.
    if (!proceso || !puedeCerrarProceso({ id: user.id, role, puedeAvanzar: true }, proceso)) {
      return NextResponse.json(NO_ENCONTRADO, { status: 404 })
    }
    const decision = puedeDeshacerPerdido(proceso, await ultimoCambioDeEtapa(id), new Date())
    if (!decision.ok) return NextResponse.json({ error: decision.motivo }, { status: 409 })
    const cambio = await deshacerPerdido(id, { volverA: decision.volverA, limpiarLostAt: decision.limpiarLostAt })
    if (!cambio) {
      return NextResponse.json({ error: MENSAJE_NO_SE_PUEDE_DESHACER }, { status: 409 })
    }
    // Descartar sacó a la persona de la secuencia de emails; deshacer la vuelve a poner
    // donde estaba. Un fallo acá no corta la respuesta: el proceso ya volvió.
    try {
      await syncMailchimpBestEffort(id)
    } catch (error) {
      console.error('POST /api/deals/[id]/undo-lost: falló la sincronización de Mailchimp', { dealId: id, error })
    }
    return NextResponse.json({ ok: true, stage: decision.volverA })
  } catch (error) {
    console.error('POST /api/deals/[id]/undo-lost error:', error)
    return NextResponse.json({ error: 'No se pudo deshacer. Probá de nuevo.' }, { status: 500 })
  }
}
