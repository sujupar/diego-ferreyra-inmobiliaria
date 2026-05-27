import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAuth } from '@/lib/auth/require-role'
import type { Database } from '@/types/database.types'

function getAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * GET /api/properties/[id]/meta-campaign
 * Devuelve la campaña Meta activa (o última) de una propiedad + métricas
 * de los últimos N días (default 30).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const { id } = await params
    const url = new URL(req.url)
    const days = Math.min(
      Math.max(parseInt(url.searchParams.get('days') ?? '30', 10), 1),
      365,
    )
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10)

    const supabase = getAdmin()

    if (user.profile.role === 'asesor') {
      const { data: prop } = await supabase
        .from('properties')
        .select('assigned_to')
        .eq('id', id)
        .single()
      if (!prop || prop.assigned_to !== user.id) {
        return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      }
    }

    const { data: campaign } = await supabase
      .from('property_meta_campaigns')
      .select('*')
      .eq('property_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!campaign) {
      return NextResponse.json({ campaign: null, metrics: [] })
    }

    const { data: metrics } = await supabase
      .from('property_meta_metrics_daily')
      .select('*')
      .eq('property_id', id)
      .eq('campaign_id', campaign.campaign_id)
      .gte('date', since)
      .order('date', { ascending: true })

    return NextResponse.json({ campaign, metrics: metrics ?? [] })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}

/**
 * PATCH /api/properties/[id]/meta-campaign
 * Ejecuta INMEDIATAMENTE una acción sobre la campaña Meta (sync, no encolada).
 * body: { action: 'pause' | 'activate' | 'archive' }
 *
 * Diferencia con POST: POST encola un job para que el worker lo procese
 * (eventual). PATCH llama a Meta API directo y espera respuesta.
 * Usar PATCH desde el UI para feedback inmediato al usuario.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const allowed = ['admin', 'dueno', 'coordinador']
    if (!allowed.includes(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const { id } = await params
    const body = (await req.json().catch(() => ({}))) as { action?: string }
    const action = body.action
    if (!['pause', 'activate', 'archive'].includes(action ?? '')) {
      return NextResponse.json(
        { error: 'action debe ser pause, activate o archive' },
        { status: 400 },
      )
    }

    const supabase = getAdmin()
    const { data: campaign } = await supabase
      .from('property_meta_campaigns')
      .select('campaign_id, adset_id, ad_ids, status')
      .eq('property_id', id)
      .neq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!campaign?.campaign_id) {
      return NextResponse.json(
        { error: 'No hay campaña activa para esta propiedad' },
        { status: 404 },
      )
    }

    const { pauseCampaign, activateCampaign, archiveCampaign } = await import(
      '@/lib/marketing/meta-campaign-builder'
    )

    try {
      if (action === 'pause') {
        await pauseCampaign(campaign.campaign_id)
      } else if (action === 'archive') {
        await archiveCampaign(campaign.campaign_id)
      } else if (action === 'activate') {
        if (!campaign.adset_id || !campaign.ad_ids?.length) {
          return NextResponse.json(
            { error: 'Campaña incompleta — no se puede activar' },
            { status: 422 },
          )
        }
        await activateCampaign(
          campaign.campaign_id,
          campaign.adset_id,
          campaign.ad_ids as string[],
        )
        await supabase
          .from('property_meta_campaigns')
          .update({ status: 'active' })
          .eq('campaign_id', campaign.campaign_id)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: `${action} falló: ${msg}` }, { status: 502 })
    }

    return NextResponse.json({ ok: true, action })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}

/**
 * POST /api/properties/[id]/meta-campaign/pause
 * Pausa manualmente la campaña activa de una propiedad (via job encolado).
 * (Action via body: { action: 'pause' | 'activate' })
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth()
    const allowed = ['admin', 'dueno', 'coordinador']
    if (!allowed.includes(user.profile.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const { id } = await params
    const body = (await req.json().catch(() => ({}))) as { action?: string }
    if (!['pause', 'activate', 'archive'].includes(body.action ?? '')) {
      return NextResponse.json({ error: 'action inválida' }, { status: 400 })
    }

    const supabase = getAdmin()
    const actionMap: Record<string, string> = {
      pause: 'pause_campaign',
      activate: 'activate_campaign',
      archive: 'archive_campaign',
    }
    const { error } = await supabase.from('meta_provision_jobs').insert({
      property_id: id,
      action: actionMap[body.action!],
    })
    if (error) {
      // Si hay job pending duplicado, no es un error real
      if (error.message.toLowerCase().includes('unique')) {
        return NextResponse.json({ ok: true, note: 'Job ya encolado' })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error' },
      { status: 500 },
    )
  }
}
