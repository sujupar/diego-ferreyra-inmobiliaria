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
import { isCampaignComplete } from '@/lib/marketing/campaign-completeness'
import { validateDailyBudgetArs } from '@/lib/marketing/budget-limits'
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

    // Idempotencia 1: si el job ya está published (un confirm previo completó
    // pero el cliente perdió la response por timeout), devolvemos el resultado
    // existente. Sin esto, retry tira 409 y el asesor cree que "se rompió"
    // cuando en realidad la campaña ya existe.
    if (job.status === 'published' && typeof job.result_campaign_id === 'string') {
      const campaignId = job.result_campaign_id as string
      const adsManagerUrl = `https://business.facebook.com/adsmanager/manage/campaigns?act=${(process.env.META_AD_ACCOUNT_ID ?? '').replace('act_', '')}&selected_campaign_ids=${campaignId}`
      return NextResponse.json({
        ok: true,
        campaignId,
        adsManagerUrl,
        audienceIds: (job.result_audience_ids ?? []) as string[],
        resumed: true,
      })
    }

    // Idempotencia 2: status === 'publishing' O 'failed' — ambos casos
    // significan que un confirm previo arrancó pero no terminó bien (timeout
    // 502 → publishing; error explícito del builder → failed). En lugar de
    // bloquear con 409, recuperamos: si la campaña terminó completa la
    // adoptamos; si quedó zombi la archivamos; en cualquier caso reseteamos
    // el job a awaiting_confirm para reintentar limpio.
    //
    // ANTES del fix (incidente 2026-06-09): el código SOLO chequeaba que
    // existiera campaign_id, sin verificar adset_id ni ad_ids. Y solo
    // manejaba 'publishing' — 'failed' tiraba 409 sin recovery.
    if (job.status === 'publishing' || job.status === 'failed') {
      type CampaignRow = {
        campaign_id: string | null
        adset_id: string | null
        ad_ids: string[] | null
        status: string
      }
      const { data: existingCampaign } = await (supabase as unknown as {
        from: (t: string) => {
          select: (s: string) => {
            eq: (a: string, b: string) => {
              neq: (a: string, b: string) => {
                order: (
                  a: string,
                  opts: { ascending: boolean },
                ) => { limit: (n: number) => { maybeSingle: () => Promise<{ data: CampaignRow | null }> } }
              }
            }
          }
        }
      })
        .from('property_meta_campaigns')
        .select('campaign_id, adset_id, ad_ids, status')
        .eq('property_id', id)
        .neq('status', 'archived')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (isCampaignComplete(existingCampaign)) {
        // ✓ Campaña REALMENTE completa (Campaign+AdSet+≥1 Ads, status no
        // provisioning/failed). Marcamos published.
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
            current_step: 'done_recovered',
            progress_percent: 100,
            result_campaign_id: existingCampaign!.campaign_id,
          })
          .eq('id', jobId)
        const adsManagerUrl = `https://business.facebook.com/adsmanager/manage/campaigns?act=${(process.env.META_AD_ACCOUNT_ID ?? '').replace('act_', '')}&selected_campaign_ids=${existingCampaign!.campaign_id}`
        return NextResponse.json({
          ok: true,
          campaignId: existingCampaign!.campaign_id,
          adsManagerUrl,
          audienceIds: [],
          resumed: true,
          message: 'La campaña ya estaba creada — recuperada de Meta.',
        })
      }

      // Caso zombi: hay una fila con campaign_id pero NO está completa
      // (timeout en el medio del builder). Archivamos en Meta + DB para que
      // el siguiente paso del confirm pueda crear una limpia. Sin esto, el
      // builder.isIncomplete check archivaría también, pero antes el confirm
      // ya habría devuelto "ok" sobre una campaña incompleta.
      if (existingCampaign?.campaign_id) {
        try {
          const token = process.env.META_ACCESS_TOKEN
          if (token) {
            await fetch(
              `https://graph.facebook.com/v21.0/${existingCampaign.campaign_id}?access_token=${encodeURIComponent(token)}`,
              {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ status: 'ARCHIVED' }),
              },
            )
          }
        } catch (err) {
          console.warn('[confirm] cleanup of zombie campaign in Meta failed (continuing):', err)
        }
        await supabase
          .from('property_meta_campaigns')
          .update({
            status: 'archived',
            last_error: 'auto_cleanup_zombie_in_confirm_retry',
          })
          .eq('campaign_id', existingCampaign.campaign_id)
      }

      // Restaurar el job a 'awaiting_confirm' y caer al flow normal (que va a
      // crear una campaña limpia con el builder).
      await (supabase as unknown as {
        from: (t: string) => {
          update: (f: Record<string, unknown>) => {
            eq: (a: string, b: string) => Promise<unknown>
          }
        }
      })
        .from('meta_launch_jobs')
        .update({ status: 'awaiting_confirm', current_step: 'retry_after_timeout', progress_percent: 100 })
        .eq('id', jobId)
    } else if (job.status !== 'awaiting_confirm') {
      return NextResponse.json(
        { error: `Job en status ${job.status} — no se puede confirmar` },
        { status: 409 },
      )
    }

    // Lock atómico: UPDATE condicional para que dos confirms simultáneos no
    // disparen dos builders en paralelo. Si el job ya estaba en 'publishing'
    // (otro request ya tomó el lock antes), devolvemos 423 Locked para que el
    // cliente espere y refresque en vez de duplicar trabajo. Esto reemplaza
    // el `update({status:'publishing'})` que estaba más abajo y que no era
    // atómico contra reads paralelos.
    const { data: lockResult } = await (supabase as unknown as {
      from: (t: string) => {
        update: (f: Record<string, unknown>) => {
          eq: (a: string, b: string) => {
            eq: (a: string, b: string) => {
              select: (s: string) => Promise<{ data: Array<{ id: string }> | null }>
            }
          }
        }
      }
    })
      .from('meta_launch_jobs')
      .update({ status: 'publishing', current_step: 'creating_campaign', progress_percent: 10 })
      .eq('id', jobId)
      .eq('status', 'awaiting_confirm')
      .select('id')

    if (!Array.isArray(lockResult) || lockResult.length === 0) {
      return NextResponse.json(
        { error: 'Otra publicación está en curso. Esperá 30s y refrescá.', code: 'locked' },
        { status: 423 },
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

    // (El lock atómico de más arriba ya transicionó el job a 'publishing'.)

    // CRÍTICO: cargar las piezas pre-generadas (formato feed_square — Meta usa
    // ese para feed). Pasamos sus meta_image_hash al builder así crea Ads con
    // las piezas premium del wizard v2 (no con la foto cruda).
    // Tomamos hasta 10 (sweet spot Andrómeda) ordenadas por created_at.
    const { data: preGenAssets } = await (supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (a: string, b: string) => {
            eq: (a: string, b: string) => {
              order: (
                a: string,
                opts: { ascending: boolean },
              ) => { limit: (n: number) => Promise<{ data: Array<{ meta_image_hash: string | null }> | null }> }
            }
          }
        }
      }
    })
      .from('property_ad_assets')
      .select('meta_image_hash')
      .eq('launch_job_id', jobId)
      .eq('format', 'feed_square')
      .order('created_at', { ascending: true })
      .limit(10)
    const preGeneratedImageHashes: string[] = (preGenAssets ?? [])
      .map(a => a.meta_image_hash)
      .filter((h): h is string => typeof h === 'string' && h.length > 0)

    // E2.0 — Blindaje de presupuesto (capa A). El budget que eligió el asesor
    // vive en job.daily_budget_ars (ENTERO en ARS). Hasta ahora se IGNORABA y
    // la campaña se creaba con el auto-tier. Ahora lo cableamos, pero SOLO tras
    // validar el rango — porque createCampaignForProperty crea la campaña EN VIVO
    // (aunque en PAUSED) con este daily_budget. Un cero de más = plata real.
    const markFailed = async (message: string) => {
      await (supabase as unknown as {
        from: (t: string) => {
          update: (f: Record<string, unknown>) => {
            eq: (a: string, b: string) => Promise<unknown>
          }
        }
      })
        .from('meta_launch_jobs')
        .update({ status: 'failed', error_message: message })
        .eq('id', jobId)
    }

    const rawBudget = (job as { daily_budget_ars?: number | null }).daily_budget_ars
    // Si el asesor nunca eligió budget (null), dejamos que el builder use su
    // auto-tier (comportamiento previo, seguro). Si eligió, validamos duro.
    let budgetOverride: number | undefined
    if (rawBudget != null) {
      const check = validateDailyBudgetArs(rawBudget)
      if (!check.ok) {
        await markFailed(`Presupuesto fuera de rango (${check.code}): ${check.reason}`)
        return NextResponse.json(
          { error: check.reason, code: 'BUDGET_OUT_OF_RANGE' },
          { status: 400 },
        )
      }
      budgetOverride = rawBudget
    }

    // Crear campaña (el builder maneja idempotencia con UNIQUE PARTIAL)
    let campaign
    try {
      campaign = await createCampaignForProperty(property as never, {
        dryRun: true,
        overrides: {
          preGeneratedImageHashes,
          variantCount: Math.min(preGeneratedImageHashes.length, 10),
          // ENTERO en ARS, sin ×100. La conversión a unidad mínima de Meta
          // ocurre UNA sola vez dentro del builder (daily_budget).
          ...(budgetOverride != null ? { dailyBudgetArs: budgetOverride } : {}),
        },
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      await markFailed('Campaign: ' + msg)
      return NextResponse.json({ error: msg }, { status: 502 })
    }

    // Tripwire (capa E-bis): la campaña ya se creó EN PAUSED. Si el budget que
    // Meta recibió no coincide EXACTO con lo que eligió el asesor, algo está
    // mal en el builder (doble ×100, redondeo raro, etc.). Fallamos el job para
    // que NADIE active esa campaña, y lo dejamos visible en error_message.
    if (budgetOverride != null && campaign.budgetDailyArs !== budgetOverride) {
      const detail = `Mismatch de presupuesto: elegido ARS ${budgetOverride}, ` +
        `builder devolvió ARS ${campaign.budgetDailyArs}. Campaña ${campaign.campaignId} ` +
        `quedó en PAUSED — NO activar. Revisar meta-campaign-builder.`
      console.error('[meta-launch-v2 confirm] BUDGET TRIPWIRE:', detail)
      await markFailed(detail)
      return NextResponse.json({ error: detail, code: 'BUDGET_MISMATCH' }, { status: 500 })
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
