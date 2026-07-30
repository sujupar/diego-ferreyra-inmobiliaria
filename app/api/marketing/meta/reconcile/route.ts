/**
 * POST /api/marketing/meta/reconcile
 *
 * Recorre TODAS las filas no-archivadas de `property_meta_campaigns` y las
 * sincroniza contra el estado real de Meta (`syncCampaignState`). Pensado
 * para arreglar de una las filas que quedaron "congeladas" (auditoría
 * 2026-07-30: 4 de 4 campañas desincronizadas, todas ARCHIVED en Meta
 * mientras la app decía "paused"/"provisioning") y para correrlo a mano
 * cada tanto — el panel individual (page.tsx del wizard) ya sincroniza su
 * propia campaña en cada visita, pero esto cubre TODAS de una sin tener que
 * visitar cada propiedad una por una.
 *
 * Solo admin (acción de mantenimiento sobre datos de TODAS las propiedades,
 * no de una sola que un asesor/coordinador pueda justificar).
 *
 * Nunca borra filas — igual que syncCampaignState, solo actualiza `status` +
 * `last_error` cuando cambió.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getUser } from '@/lib/auth/get-user'
import { syncCampaignState } from '@/lib/marketing/meta-sync'
import { runWithConcurrency } from '@/lib/util/concurrency'
import type { Database } from '@/types/database.types'

export const maxDuration = 60

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// Techo defensivo por corrida: si algún día hay cientos de campañas, no
// queremos exceder el maxDuration de Netlify. Correrlo de nuevo retoma el
// resto (es idempotente — solo actualiza lo que cambió).
const MAX_ROWS_PER_RUN = 100

interface ReconcileRowResult {
  campaignId: string
  propertyId: string
  previousStatus: string
  newStatus?: 'active' | 'paused' | 'archived'
  changed?: boolean
  error?: string
}

export async function POST() {
  try {
    const user = await getUser()
    if (!user || user.profile.role !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const supabase = getAdmin()
    const { data: rows, error: selectError } = await supabase
      .from('property_meta_campaigns')
      .select('campaign_id, property_id, status')
      .neq('status', 'archived')
      // `provisioning` = campaña a mitad de creación EN ESTE MOMENTO. Sincronizarla
      // es una carrera: el builder todavía está creando el adset y los anuncios, y
      // Meta puede reportar un estado intermedio que nos haría pisar la fila
      // mientras se escribe. La página de la campaña ya excluye ese caso; acá
      // hacemos lo mismo. Se reconcilia sola en la próxima corrida, cuando terminó.
      .neq('status', 'provisioning')
      .limit(MAX_ROWS_PER_RUN)

    if (selectError) {
      return NextResponse.json({ error: selectError.message }, { status: 500 })
    }

    const results = await runWithConcurrency(rows ?? [], 4, async (row): Promise<ReconcileRowResult> => {
      try {
        const sync = await syncCampaignState(row.campaign_id)
        return {
          campaignId: row.campaign_id,
          propertyId: row.property_id,
          previousStatus: row.status,
          newStatus: sync.status,
          changed: sync.changed,
        }
      } catch (err) {
        return {
          campaignId: row.campaign_id,
          propertyId: row.property_id,
          previousStatus: row.status,
          error: err instanceof Error ? err.message : String(err),
        }
      }
    })

    const changedCount = results.filter(r => r.changed).length
    const errorCount = results.filter(r => r.error).length

    return NextResponse.json({
      ok: true,
      scanned: results.length,
      changed: changedCount,
      errors: errorCount,
      results,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
