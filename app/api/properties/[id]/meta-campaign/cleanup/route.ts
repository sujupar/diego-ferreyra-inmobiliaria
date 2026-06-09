/**
 * POST /api/properties/[id]/meta-campaign/cleanup
 *
 * Limpia una campaña "zombi" (Campaign creado en Meta pero el flow del builder
 * se cortó, dejando AdSet sin Ads o sin AdSet siquiera). Archivar manualmente
 * en Meta + DB para que la UI pueda volver a V2.
 *
 * Pasos:
 *  1. SELECT property_meta_campaigns no-archived para la property
 *  2. Si la fila NO está completa según isCampaignComplete → POST archivado a
 *     Meta + UPDATE status='archived' en DB
 *  3. UPDATE meta_launch_jobs.status='cancelled' para jobs vivos sobre esta
 *     property (libera el UNIQUE PARTIAL del job)
 *
 * Acceso: admin/dueno/coordinador siempre; asesor solo sobre su propia property.
 * Idempotente: si no hay nada zombi, devuelve ok=true sin cambios.
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { isCampaignZombie } from '@/lib/marketing/campaign-completeness'
import type { Database } from '@/types/database.types'

export const maxDuration = 30

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function authorize(propertyId: string, userId: string, role: string): Promise<boolean> {
  if (role === 'abogado') return false
  if (['admin', 'dueno', 'coordinador'].includes(role)) return true
  if (role === 'asesor') {
    const supabase = getAdmin()
    const { data } = await supabase
      .from('properties')
      .select('assigned_to')
      .eq('id', propertyId)
      .single()
    return data?.assigned_to === userId
  }
  return false
}

async function archiveInMeta(campaignId: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.META_ACCESS_TOKEN
  if (!token) return { ok: false, error: 'META_ACCESS_TOKEN ausente' }
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${campaignId}?access_token=${encodeURIComponent(token)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'ARCHIVED' }),
      },
    )
    if (!res.ok) {
      const text = await res.text()
      return { ok: false, error: `${res.status}: ${text.slice(0, 300)}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    if (!(await authorize(id, user.id, user.profile.role))) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const supabase = getAdmin()
    const archivedCampaignIds: string[] = []
    const metaArchiveResults: Array<{ campaignId: string; ok: boolean; error?: string }> = []

    // 1. Buscar TODAS las filas no-archivadas de esta property (puede haber más
    //    de una si bugs anteriores dejaron varias).
    type CampaignRow = {
      campaign_id: string
      adset_id: string | null
      ad_ids: string[] | null
      status: string
      created_at: string
    }
    const { data: rows } = await (supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (a: string, b: string) => {
            neq: (a: string, b: string) => Promise<{ data: CampaignRow[] | null }>
          }
        }
      }
    })
      .from('property_meta_campaigns')
      .select('campaign_id, adset_id, ad_ids, status, created_at')
      .eq('property_id', id)
      .neq('status', 'archived')

    // 2. Detectar publish en curso: si hay un job en 'publishing' con activity
    //    reciente, SKIPEAR cleanup sobre filas jóvenes (<2 min) — esa fila la
    //    está creando el confirm en este mismo momento. Archivar la mataría.
    const { data: publishingJob } = await (supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (a: string, b: string) => {
            eq: (a: string, b: string) => {
              order: (
                a: string,
                opts: { ascending: boolean },
              ) => { limit: (n: number) => { maybeSingle: () => Promise<{ data: { updated_at: string } | null }> } }
            }
          }
        }
      }
    })
      .from('meta_launch_jobs')
      .select('updated_at')
      .eq('property_id', id)
      .eq('status', 'publishing')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const nowMs = Date.now()
    const publishingJobIsFresh =
      !!publishingJob?.updated_at &&
      nowMs - new Date(publishingJob.updated_at).getTime() < 60_000

    const skippedInFlight: string[] = []

    for (const row of rows ?? []) {
      if (!isCampaignZombie(row)) continue // Si está completa, no la tocamos
      // In-flight guard: fila joven (<2 min) + job publishing reciente (<60s) →
      // skip. La está creando el confirm/route en este mismo momento.
      const rowAgeMs = nowMs - new Date(row.created_at).getTime()
      if (rowAgeMs < 2 * 60_000 && publishingJobIsFresh) {
        skippedInFlight.push(row.campaign_id)
        continue
      }
      const archiveRes = await archiveInMeta(row.campaign_id)
      metaArchiveResults.push({ campaignId: row.campaign_id, ...archiveRes })
      // Independientemente del resultado en Meta (la Campaign puede ya estar
      // archivada o el access token puede haber rotado), marcamos archived en
      // DB — sino el router/idempotencia siguen viendo la fila viva y el
      // usuario sigue atrapado.
      await supabase
        .from('property_meta_campaigns')
        .update({
          status: 'archived',
          last_error: `cleanup_zombie_${new Date().toISOString()}${archiveRes.ok ? '' : ' (Meta archive failed: ' + archiveRes.error + ')'}`,
        })
        .eq('campaign_id', row.campaign_id)
      archivedCampaignIds.push(row.campaign_id)
    }

    // 2. Cancelar jobs vivos sobre esta property: libera el UNIQUE PARTIAL del
    //    job para que el usuario pueda arrancar uno nuevo desde V2.
    const liveStatuses = ['analyzing', 'awaiting_user_input', 'generating', 'awaiting_confirm', 'publishing']
    const { data: liveJobs } = await (supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (a: string, b: string) => {
            in: (a: string, b: string[]) => Promise<{ data: Array<{ id: string }> | null }>
          }
        }
      }
    })
      .from('meta_launch_jobs')
      .select('id')
      .eq('property_id', id)
      .in('status', liveStatuses)

    const cancelledJobIds = (liveJobs ?? []).map(j => j.id)
    if (cancelledJobIds.length > 0) {
      await (supabase as unknown as {
        from: (t: string) => {
          update: (f: Record<string, unknown>) => {
            in: (a: string, b: string[]) => Promise<unknown>
          }
        }
      })
        .from('meta_launch_jobs')
        .update({
          status: 'cancelled',
          current_step: 'cleanup_by_user',
          error_message: 'Cancelado por cleanup de campaña zombi',
        })
        .in('id', cancelledJobIds)
    }

    return NextResponse.json({
      ok: true,
      archivedCampaignIds,
      cancelledJobIds,
      metaArchiveResults,
      skippedInFlight, // Campañas no archivadas porque otro confirm las está creando
      cleaned: archivedCampaignIds.length + cancelledJobIds.length > 0,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
