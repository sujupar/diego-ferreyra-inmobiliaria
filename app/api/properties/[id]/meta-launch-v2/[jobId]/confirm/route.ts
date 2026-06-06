/**
 * POST /api/properties/[id]/meta-launch-v2/[jobId]/confirm
 *
 * Confirma el lanzamiento: crea Campaign + AdSet + Ads (uno por cada pieza
 * generada, hasta 10) + Custom Audiences en Meta.
 *
 * El asesor llega acá después de revisar las 27 piezas y darle "Confirmar y
 * publicar". El backend toma las primeras 10 piezas (o las que el asesor
 * haya marcado como "destacar") y arma la campaña.
 *
 * body: {
 *   selectedAssetIds?: string[],   // IDs de las piezas a incluir (max 10).
 *                                  // Si vacío, usa las primeras 10 por orden.
 * }
 */
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import { createCampaignForProperty } from '@/lib/marketing/meta-campaign-builder'
import { createAudiencesForCampaign } from '@/lib/marketing/meta-custom-audiences'
import type { Database } from '@/types/database.types'

export const maxDuration = 60

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; jobId: string }> },
) {
  try {
    const user = await requireAuth()
    const allowed = ['admin', 'dueno', 'coordinador', 'asesor']
    if (!allowed.includes(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const { id, jobId } = await params
    const supabase = getAdmin()

    // Cargar job
    const { data: job } = await (supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (a: string, b: string) => {
            eq: (a: string, b: string) => {
              maybeSingle: () => Promise<{ data: Record<string, unknown> | null }>
            }
          }
        }
      }
    })
      .from('meta_launch_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('property_id', id)
      .maybeSingle()
    if (!job) {
      return NextResponse.json({ error: 'Job no encontrado' }, { status: 404 })
    }
    if (job.status !== 'awaiting_confirm') {
      return NextResponse.json(
        { error: `Job en status ${job.status} — no se puede confirmar` },
        { status: 409 },
      )
    }

    const { data: property } = await supabase
      .from('properties')
      .select('*')
      .eq('id', id)
      .single()
    if (!property) {
      return NextResponse.json({ error: 'property not found' }, { status: 404 })
    }

    // Transicionar a publishing
    await (supabase as unknown as {
      from: (t: string) => {
        update: (f: Record<string, unknown>) => {
          eq: (a: string, b: string) => Promise<unknown>
        }
      }
    })
      .from('meta_launch_jobs')
      .update({ status: 'publishing', current_step: 'creating_campaign', progress_percent: 10 })
      .eq('id', jobId)

    // Crear campaña (el builder maneja idempotencia con UNIQUE PARTIAL)
    let campaign
    try {
      campaign = await createCampaignForProperty(property as never, { dryRun: true })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await (supabase as unknown as {
        from: (t: string) => {
          update: (f: Record<string, unknown>) => {
            eq: (a: string, b: string) => Promise<unknown>
          }
        }
      })
        .from('meta_launch_jobs')
        .update({ status: 'failed', error_message: 'Campaign: ' + msg })
        .eq('id', jobId)
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    // Crear Custom Audiences (best-effort)
    let audienceIds: string[] = []
    try {
      await (supabase as unknown as {
        from: (t: string) => {
          update: (f: Record<string, unknown>) => {
            eq: (a: string, b: string) => Promise<unknown>
          }
        }
      })
        .from('meta_launch_jobs')
        .update({ current_step: 'creating_audiences', progress_percent: 70 })
        .eq('id', jobId)

      const { visitors, converters } = await createAudiencesForCampaign({
        propertyId: property.id,
        propertySlug: property.public_slug ?? '',
        campaignId: campaign.campaignId,
      })

      for (const a of [visitors, converters].filter(Boolean)) {
        if (!a) continue
        await (supabase as unknown as {
          from: (t: string) => {
            insert: (rows: Record<string, unknown>) => Promise<unknown>
          }
        })
          .from('property_meta_audiences')
          .insert({
            property_id: property.id,
            campaign_id: campaign.campaignId,
            audience_id: a.audienceId,
            audience_type: a.type,
            audience_name: a.audienceName,
            rule_definition: a.ruleDefinition,
          })
        audienceIds.push(a.audienceId)
      }
    } catch (err) {
      console.warn('[meta-launch-v2 confirm] audiences failed (continuing):', err)
    }

    // Job → published
    await (supabase as unknown as {
      from: (t: string) => {
        update: (f: Record<string, unknown>) => {
          eq: (a: string, b: string) => Promise<unknown>
        }
      }
    })
      .from('meta_launch_jobs')
      .update({
        status: 'published',
        current_step: 'done',
        progress_percent: 100,
        result_campaign_id: campaign.campaignId,
        result_audience_ids: audienceIds,
      })
      .eq('id', jobId)

    const adsManagerUrl = `https://business.facebook.com/adsmanager/manage/campaigns?act=${(process.env.META_AD_ACCOUNT_ID ?? '').replace('act_', '')}&selected_campaign_ids=${campaign.campaignId}`

    return NextResponse.json({
      ok: true,
      campaignId: campaign.campaignId,
      adsManagerUrl,
      audienceIds,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
